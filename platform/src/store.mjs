import {ApiError, id, importStates, object, recordInput, reviewKinds, revisionNumber, string} from "./validation.mjs";

const recordFields = "id, kind, title, body, agent_id AS agentId, status, details, evidence, revision, created_at AS createdAt, updated_at AS updatedAt";
const historyFields = "id, record_id AS recordId, from_status AS fromStatus, to_status AS toStatus, revision, note, actor, previous_snapshot AS previousSnapshot, created_at AS createdAt";

function unpack(row) {
  return {...row, details: JSON.parse(row.details), evidence: JSON.parse(row.evidence)};
}

async function getRecord(db, key) {
  const row = await db.prepare(`SELECT ${recordFields} FROM ops_records WHERE id = ?`).bind(key).first();
  if (!row) throw new ApiError(404, "Record was not found.");
  return unpack(row);
}

export async function getState(db, filters = {}) {
  const conditions = [];
  const values = [];
  if (filters.kind !== undefined) {
    if (typeof filters.kind !== "string" || !Object.hasOwn(importStates, filters.kind)) throw new ApiError(400, "Unknown record kind.");
    conditions.push("kind = ?");
    values.push(filters.kind);
  }
  for (const [key, column] of [["agentId", "agent_id"], ["recordId", "id"]]) {
    if (filters[key] !== undefined) {
      conditions.push(column + " = ?");
      values.push(id(filters[key], key));
    }
  }
  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const forHistory = where ? `WHERE record_id IN (SELECT id FROM ops_records ${where})` : "";
  const select = sql => values.length ? db.prepare(sql).bind(...values) : db.prepare(sql);
  // Read records and audit entries in one snapshot, including unreviewed drafts.
  const [records, history] = await db.batch([
    select(`SELECT ${recordFields} FROM ops_records ${where} ORDER BY updated_at DESC, id`),
    select(`SELECT ${historyFields} FROM ops_history ${forHistory} ORDER BY created_at DESC, revision DESC, id`),
  ]);
  return {
    schemaVersion: 1, records: records.results.map(unpack),
    history: history.results.map(event => ({...event, previousSnapshot: JSON.parse(event.previousSnapshot)})),
  };
}

async function fingerprint(record) {
  const bytes = new TextEncoder().encode(JSON.stringify(record));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash, item => item.toString(16).padStart(2, "0")).join("");
}

async function checkAgents(db, rows) {
  const localAgents = new Set(rows.filter(row => row.kind === "agent").map(row => row.id));
  const referenced = new Set(rows.map(row => row.agentId).filter(key => key && !localAgents.has(key)));
  if (!referenced.size) return;
  const found = await db.prepare("SELECT id FROM ops_records WHERE kind = 'agent' AND id IN (SELECT value FROM json_each(?))").bind(JSON.stringify([...referenced])).all();
  if (found.results.length !== referenced.size) throw new ApiError(400, "agentId must reference a registered agent.");
}

async function insertRecords(db, values, actor, note) {
  if (!Array.isArray(values) || !values.length || values.length > 60) throw new ApiError(400, "Provide 1–60 records.");
  const rows = values.map(recordInput);
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new ApiError(400, "Duplicate IDs in a single request.");
  await checkAgents(db, rows);
  const payload = await Promise.all(rows.map(async row => ({...row, hash: await fingerprint(row)})));
  const now = new Date().toISOString();
  const eventId = crypto.randomUUID();
  // SQLite aborts the entire transaction on a different input under the same ID.
  // A replay only checks the original fingerprint, preserving subsequent human edits.
  const insert = db.prepare(`
    INSERT INTO ops_records (id, kind, title, body, agent_id, status, details, evidence, created_at, updated_at, origin_hash, revision, event_id)
    SELECT value->>'$.id', value->>'$.kind', value->>'$.title', value->>'$.body',
      value->>'$.agentId', value->>'$.status', value->>'$.details', value->>'$.evidence',
      COALESCE(value->>'$.createdAt', ?), ?, value->>'$.hash', 1, ?
    FROM json_each(?) WHERE true
    ON CONFLICT(id) DO UPDATE SET origin_hash = CASE
      WHEN ops_records.origin_hash = excluded.origin_hash THEN ops_records.origin_hash ELSE NULL END
  `).bind(now, now, eventId, JSON.stringify(payload));
  const audit = db.prepare(`
    INSERT INTO ops_history (id, record_id, from_status, to_status, revision, note, actor, created_at)
    SELECT id || '#1', id, NULL, status, revision, ?, ?, ? FROM ops_records WHERE event_id = ?
  `).bind(note, actor, now, eventId);
  const count = db.prepare("SELECT count(*) AS total FROM ops_records WHERE event_id = ?").bind(eventId);
  let output;
  try { output = await db.batch([insert, audit, count]); }
  catch (error) {
    const reason = String(error) + String(error?.cause);
    if (reason.includes("ops_records.origin_hash")) throw new ApiError(409, "A record ID already exists with different original input. Use a new version ID.");
    throw error;
  }
  const inserted = output[2].results[0].total;
  return {inserted, unchanged: rows.length - inserted, ids: rows.map(row => row.id)};
}

export async function importRecords(db, data, actor) {
  object(data, ["records"]);
  return insertRecords(db, data.records, actor, "Imported");
}

export async function createRecord(db, kind, data, actor) {
  const keys = ["title", "body", "agentId", "requestId"];
  if (kind === "knowledge") keys.push("evidence");
  object(data, keys);
  const requestId = data.requestId === undefined ? crypto.randomUUID() : id(data.requestId, "requestId");
  const recordId = id(`${kind}-${requestId}`);
  const row = {
    id: recordId, kind, title: data.title, body: data.body,
    agentId: kind === "task" ? id(data.agentId, "agentId") : data.agentId,
    status: kind === "task" ? "queued" : "reference", evidence: data.evidence,
  };
  if (kind === "knowledge") string(row.body, "body", 130000);
  const outcome = await insertRecords(db, [row], actor, kind === "task" ? "Queued" : "Added to knowledge");
  return {record: await getRecord(db, recordId), inserted: outcome.inserted};
}

async function changeRecord(db, previous, revision, changes, note, actor, captureSnapshot = false) {
  const {title, body, status, details, evidence} = {...previous, ...changes};
  if (previous.revision !== revision) throw new ApiError(409, "Record changed. Refresh before editing.");
  const now = new Date().toISOString();
  const eventId = crypto.randomUUID();
  const result = await db.batch([
    db.prepare(`UPDATE ops_records SET status = ?, title = ?, body = ?, details = ?, evidence = ?, updated_at = ?, revision = revision + 1, event_id = ?
      WHERE id = ? AND revision = ? AND status = ?`).bind(status, title, body, JSON.stringify(details), JSON.stringify(evidence), now, eventId, previous.id, revision, previous.status),
    db.prepare(`INSERT INTO ops_history (id, record_id, from_status, to_status, revision, note, actor, created_at, previous_snapshot)
      SELECT id || '#' || revision, id, ?, status, revision, ?, ?, ?, ? FROM ops_records WHERE id = ? AND event_id = ?`).bind(previous.status, note, actor, now, captureSnapshot ? JSON.stringify(previous) : null, previous.id, eventId),
    db.prepare(`SELECT ${recordFields} FROM ops_records WHERE id = ? AND event_id = ?`).bind(previous.id, eventId),
  ]);
  const row = result[2].results[0];
  if (!row) throw new ApiError(409, "Record changed. Refresh before editing.");
  return {record: unpack(row)};
}

export async function reviewRecord(db, key, data, actor) {
  object(data, ["decision", "revision", "note", "body"]);
  const revision = revisionNumber(data.revision);
  const previous = await getRecord(db, id(key));
  if (!reviewKinds.includes(previous.kind)) throw new ApiError(400, "This record is not reviewable.");
  const {decision} = data;
  const next = {approve: "approved", revise: "changes_requested", submit: "needs_review", save: previous.status};
  if (typeof decision !== "string" || !Object.hasOwn(next, decision)) throw new ApiError(400, "Unsupported review decision.");
  const allowed = {
    draft: ["submit", "save"],
    needs_review: ["approve", "revise", "save"],
    changes_requested: ["submit", "save"],
    approved: [],
  };
  if (!allowed[previous.status]?.includes(decision)) throw new ApiError(409, "Review decision is unavailable in this status.");
  const note = string(data.note, "note", 4000, decision === "revise");
  if (data.body !== undefined && !["submit", "save"].includes(decision)) throw new ApiError(400, "Save body changes before making this decision.");
  const body = data.body === undefined && decision !== "save" ? previous.body : string(data.body, "body", 130000);
  return changeRecord(db, previous, revision, {status: next[decision], body}, note || decision, actor);
}

export async function updateTask(db, key, data, actor) {
  object(data, ["status", "revision", "note", "runId"]);
  const revision = revisionNumber(data.revision);
  const previous = await getRecord(db, id(key));
  if (previous.kind !== "task") throw new ApiError(400, "A task ID is required.");
  const allowed = {queued: ["running", "blocked"], running: ["completed", "blocked"], blocked: ["queued"], completed: []};
  if (!allowed[previous.status]?.includes(data.status)) throw new ApiError(409, "Unsupported task transition.");
  const note = string(data.note, "note", 4000, data.status === "blocked");
  const details = {...previous.details};
  if (data.runId !== undefined || data.status === "completed") {
    const run = await getRecord(db, id(data.runId, "runId"));
    if (run.kind !== "run" || run.details.taskId !== previous.id || run.agentId !== previous.agentId ||
        (data.status === "completed" && run.status !== "completed")) {
      throw new ApiError(400, "Link an execution record for this task and agent with a matching outcome.");
    }
    details.runId = run.id;
  }
  return changeRecord(db, previous, revision, {status: data.status, details}, note || data.status, actor);
}

export async function updateRegistry(db, key, data, actor) {
  object(data, ["revision", "changes", "note"]);
  const revision = revisionNumber(data.revision);
  const previous = await getRecord(db, id(key));
  if (!["agent", "source", "schedule"].includes(previous.kind)) throw new ApiError(400, "A registry record is required.");
  const changes = object(data.changes, ["title", "body", "details", "evidence", "status"]);
  if (!Object.keys(changes).length) throw new ApiError(400, "At least one change is required.");
  const detailPatch = Object.hasOwn(changes, "details") ? object(changes.details) : {};
  if (previous.kind === "agent") {
    const runtimeFields = ["runtime", "sessionId", "asOf", "lastRun", "outcome", "verificationStatus", "availability"];
    for (const field of Object.keys(detailPatch)) {
      if (!runtimeFields.includes(field) && JSON.stringify(detailPatch[field]) !== JSON.stringify(previous.details[field])) {
        throw new ApiError(400, "Agent assignments and model policy cannot be changed through the runtime registry.");
      }
    }
  }
  if (changes.status !== undefined && changes.status !== previous.status && !changes.evidence?.length) {
    throw new ApiError(400, "Supply evidence for the new registry status.");
  }
  const updated = recordInput({
    id: previous.id, kind: previous.kind, title: previous.title, body: previous.body,
    agentId: previous.agentId, status: previous.status, evidence: previous.evidence, ...changes,
    details: {...previous.details, ...detailPatch},
  });
  const note = string(data.note, "note", 4000, false) || "Updated registry";
  return changeRecord(db, previous, revision, updated, note, actor, true);
}
