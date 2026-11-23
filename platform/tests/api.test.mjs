import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { handleApi } from "../src/api.mjs";
import { LocalD1, migrateLocal } from "../scripts/local-db.mjs";

const migrationDir = fileURLToPath(new URL("../drizzle/", import.meta.url));

function testDatabase(t) {
  const database = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
  t.after(() => database.close());
  migrateLocal(database, migrationDir);
  return new LocalD1(database);
}

const base = "https://workspace.example.test";
const evidence = [{label: "Synthetic editorial brief", ref: "test/brief.md"}];
const agent = {id: "agent-writer", kind: "agent", title: "Test editor", status: "available"};
const draft = {
  id: "draft-one", kind: "content", title: "Example article", body: "Original copy",
  agentId: agent.id, status: "needs_review", evidence,
};

async function request(db, path, body, extraHeaders = {}) {
  const options = body === undefined ? {} : {
    method: "POST", headers: {"Content-Type": "application/json", ...extraHeaders}, body: JSON.stringify(body),
  };
  const req = new Request(base + path, options);
  const handler = path === "/mcp" ? (await import("../src/mcp.mjs")).handleMcp : handleApi;
  const response = await handler(req, db);
  const json = await response.json();
  return {status: response.status, json};
}

async function ok(db, path, body) {
  const {status, json} = await request(db, path, body);
  assert.ok(status >= 200 && status < 300, JSON.stringify({status, json}));
  return json;
}

function load(db, records) {
  return ok(db, "/api/import", {records});
}

function review(db, data) {
  return request(db, "/api/reviews/" + draft.id, data);
}

test("fresh workspace has no fabricated operational data", async t => {
  const db = testDatabase(t);
  const state = await ok(db, "/api/state");
  assert.equal(state.schemaVersion, 1);
  assert.deepEqual(state.records, []);
  assert.deepEqual(state.history, []);
});

test("manual edits, approval and audit history survive an import retry", async t => {
  const db = testDatabase(t);
  await load(db, [agent, draft]);
  const save = await ok(db, "/api/reviews/" + draft.id, {
    decision: "save", revision: 1, body: "Copy after editorial review",
  });
  assert.equal(save.record.status, "needs_review");
  assert.equal(save.record.revision, 2);
  const approved = await ok(db, "/api/reviews/" + draft.id, {decision: "approve", revision: 2});
  assert.equal(approved.record.status, "approved");
  await load(db, [agent, {...draft, details: {}}]);
  const state = await ok(db, "/api/state");
  const saved = state.records.filter(item => item.id === draft.id);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].revision, 3);
  assert.equal(saved[0].status, "approved");
  assert.equal(saved[0].body, "Copy after editorial review");
  const history = state.history.filter(event => event.recordId === draft.id).sort((a,b) => a.revision - b.revision);
  assert.deepEqual(history.map(event => event.toStatus), ["needs_review", "needs_review", "approved"]);
  assert.deepEqual(history.map(event => event.revision), [1, 2, 3]);
});

test("same stable ID with changed source bytes cannot partially import a batch", async t => {
  const db = testDatabase(t);
  await load(db, [agent, draft]);
  const fresh = {...draft, id: "draft-new"};
  const result = await request(db, "/api/import", {records: [fresh, {...draft, body: "Conflicting input"}]});
  assert.equal(result.status, 409);
  const state = await ok(db, "/api/state");
  assert.equal(state.records.length, 2);
  assert.equal(state.records.find(item => item.id === draft.id).body, "Original copy");
  assert.ok(!state.history.some(event => event.recordId === fresh.id));
});

test("a stale reviewer cannot approve a superseded revision", async t => {
  const db = testDatabase(t);
  await load(db, [agent, draft]);
  const decisions = await Promise.all([
    review(db, {decision: "approve", revision: 1}),
    review(db, {decision: "revise", revision: 1, note: "Confirm source date"}),
  ]);
  assert.equal(decisions.filter(result => result.status < 300).length, 1);
  assert.equal(decisions.filter(result => result.status === 409).length, 1);
  const state = await ok(db, "/api/state");
  assert.equal(state.records.find(record => record.id === draft.id).revision, 2);
  assert.equal(state.history.filter(event => event.recordId === draft.id && event.revision === 2).length, 1);
});

test("feedback needs a note and a revised draft can return to review", async t => {
  const db = testDatabase(t);
  await load(db, [agent, draft]);
  assert.equal((await review(db, {decision: "revise", revision: 1})).status, 400);
  const changed = await ok(db, "/api/reviews/" + draft.id, {
    decision: "revise", revision: 1, note: "Confirm source date",
  });
  assert.equal(changed.record.status, "changes_requested");
  assert.equal((await review(db, {decision: "approve", revision: 2})).status, 409);
  const submitted = await ok(db, "/api/reviews/" + draft.id, {
    decision: "submit", revision: 2, body: "Updated, attributed text",
  });
  assert.equal(submitted.record.status, "needs_review");
  assert.equal(submitted.record.body, "Updated, attributed text");
});

test("the queued task and knowledge writer can be retried without duplicates", async t => {
  const db = testDatabase(t);
  await load(db, [agent]);
  const task = {title: "Review synthetic sources", agentId: agent.id, requestId: crypto.randomUUID()};
  const first = await ok(db, "/api/tasks", task);
  const retried = await ok(db, "/api/tasks", task);
  assert.equal(retried.record.id, first.record.id);
  assert.equal(retried.record.status, "queued");
  assert.equal(retried.record.revision, 1);
  assert.equal((await request(db, "/api/tasks", {...task, title: "Changed task"})).status, 409);
  const knowledge = {
    title: "Editorial guide", body: "Attribute the date.", agentId: agent.id,
    requestId: crypto.randomUUID(), evidence,
  };
  const original = await ok(db, "/api/knowledge", knowledge);
  assert.equal((await ok(db, "/api/knowledge", knowledge)).record.id, original.record.id);
  const state = await ok(db, "/api/state");
  assert.equal(state.records.filter(item => item.kind === "task").length, 1);
  assert.equal(state.records.filter(item => item.kind === "knowledge").length, 1);
  assert.equal(state.records.filter(item => item.kind === "run").length, 0);
  assert.equal(state.history.filter(event => event.recordId === first.record.id).length, 1);
});

test("invalid evidence links and unsupported delivery states reject the full request", async t => {
  const db = testDatabase(t);
  const invalid = [
    {...draft, evidence: [{label: "Invalid URI", url: "javascript:void(0)"}]},
    {...draft, evidence: [{label: "Embedded credentials", url: "https://user:pass@example.test/"}]},
    {...draft, evidence: [{label: "Missing source"}]},
    {...draft, evidence: [{label: "Missing timezone", ref: "example.md", observedAt: "2026-11-23"}]},
    {...draft, kind: "outreach", status: "sent"},
    {...draft, kind: "content", status: "published"},
    {...draft, kind: "content", status: "approved"},
  ];
  for (const record of invalid) {
    const result = await request(db, "/api/import", {records: [agent, record]});
    assert.equal(result.status, 400, JSON.stringify(result));
  }
  assert.equal((await ok(db, "/api/state")).records.length, 0);
});

test("like all owner actions, cross-origin writes are rejected", async t => {
  const db = testDatabase(t);
  const record = {title: "Example source", body: "Example note"};
  const crossSite = await request(db, "/api/knowledge", record, {Origin: "https://other.example.test"});
  assert.equal(crossSite.status, 403);
  assert.equal((await ok(db, "/api/state")).records.length, 0);
});

test("markup in notes remains ordinary JSON text", async t => {
  const db = testDatabase(t);
  const body = "<b>Untrusted example</b>";
  const saved = await ok(db, "/api/knowledge", {title: "Markup note", body});
  assert.equal(saved.record.body, body);
  const response = await handleApi(new Request(base + "/api/state"), db);
  assert.equal(response.headers.get("content-type").split(";")[0], "application/json");
  assert.equal((await response.json()).records[0].body, body);
});

test("MCP advertises the workspace tools and a queued tool call persists through REST", async t => {
  const db = testDatabase(t);
  await load(db, [agent]);
  const call = (method, params = {}) => ok(db, "/mcp", {jsonrpc: "2.0", id: 1, method, params});
  const discover = await call("server/discover");
  assert.ok(JSON.stringify(discover.result).includes("2026-07-28"));
  const listing = await call("tools/list");
  const names = listing.result.tools.map(tool => tool.name);
  for (const name of ["marketing_state", "marketing_import", "marketing_queue_task", "marketing_review", "marketing_update_task"]) {
    assert.ok(names.includes(name), name);
  }
  const queued = await call("tools/call", {
    name: "marketing_queue_task", arguments: {title: "Queue from MCP", agentId: agent.id},
  });
  assert.ok(!queued.result.isError);
  assert.ok(queued.result.content.some(part => part.type === "text"));
  const state = await ok(db, "/api/state");
  assert.ok(state.records.some(record => record.kind === "task" && record.title === "Queue from MCP" && record.status === "queued"));
});

test("completing a task requires a completed execution record for the same task and assignee", async t => {
  const db = testDatabase(t);
  await load(db, [agent]);
  const {record} = await ok(db, "/api/tasks", {title: "Assess example evidence", agentId: agent.id});
  const path = "/api/tasks/" + record.id;
  assert.equal((await request(db, path, {status: "completed", revision: 1})).status, 409);
  const started = await ok(db, path, {status: "running", revision: 1});
  assert.equal(started.record.revision, 2);
  assert.equal((await request(db, path, {status: "completed", revision: 2})).status, 400);
  const run = {
    id: "example-run", kind: "run", title: "Completed example check", agentId: agent.id,
    details: {taskId: record.id}, status: "completed", evidence,
  };
  await load(db, [run, {...run, id: "other-task-run", details: {taskId: "other-task"}}]);
  assert.equal((await request(db, path, {status: "completed", revision: 2, runId: "other-task-run"})).status, 400);
  const completed = await ok(db, path, {status: "completed", revision: 2, runId: run.id});
  assert.equal(completed.record.status, "completed");
  assert.equal(completed.record.details.runId, run.id);
  assert.equal((await request(db, path, {status: "running", revision: 3})).status, 409);
});

test("persisted data remains readable after reopening an already migrated local database", async t => {
  const directory = mkdtempSync(join(tmpdir(), "marketing-example-"));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  const path = join(directory, "workspace.sqlite3");
  const first = new DatabaseSync(path);
  try {
    migrateLocal(first, migrationDir);
    await load(new LocalD1(first), [agent, draft]);
  } finally {
    first.close();
  }
  const reopened = new DatabaseSync(path);
  t.after(() => reopened.close());
  migrateLocal(reopened, migrationDir);
  const state = await ok(new LocalD1(reopened), "/api/state");
  assert.equal(state.records.length, 2);
  assert.equal(state.history.length, 2);
  assert.equal(state.records.find(record => record.id === draft.id).body, draft.body);
});

test("malformed JSON enumerations produce input errors and preserve reviewed state", async t => {
  const db = testDatabase(t);
  const malformed = {toString: null};
  const imported = await request(db, "/api/import", {records: [{...agent, kind: malformed}]});
  assert.equal(imported.status, 400);
  await load(db, [agent, draft]);
  assert.equal((await review(db, {decision: malformed, revision: 1})).status, 400);
  const state = await ok(db, "/api/state");
  assert.equal(state.records.find(record => record.id === draft.id).revision, 1);
});

test("evidence dates use actual calendar days, including leap years", async t => {
  const db = testDatabase(t);
  const withDate = observedAt => ({
    ...draft, evidence: [{label: "Test observation", ref: "test/source.md", observedAt}],
  });
  for (const date of ["2026-02-29T14:00:00Z", "2024-02-30T14:00:00-05:00"]) {
    assert.equal((await request(db, "/api/import", {records: [agent, withDate(date)]})).status, 400);
  }
  await load(db, [agent, withDate("2024-02-29T14:00:00-05:00")]);
  const state = await ok(db, "/api/state");
  const saved = state.records.find(record => record.id === draft.id);
  assert.equal(saved.evidence[0].observedAt, "2024-02-29T19:00:00.000Z");
});

test("registry updates preserve the prior observation and survive original input replay", async t => {
  const db = testDatabase(t);
  const schedule = {
    id: "daily-source-check", kind: "schedule", title: "Source check", status: "paused",
    details: {timezone: "America/New_York", scheduleId: "previous-receipt"},
    evidence: [{label: "Paused configuration", ref: "test/old.json"}],
  };
  await load(db, [schedule]);
  const path = "/api/registry/" + schedule.id;
  const revised = {
    revision: 1, changes: {status: "enabled", details: {scheduleId: "new-receipt"},
      evidence: [{label: "Current configuration", ref: "test/current.json"}]},
  };
  assert.equal((await request(db, path, {revision: 1, changes: {status: "enabled"}})).status, 400);
  const saved = await ok(db, path, revised);
  assert.deepEqual(saved.record.details, {scheduleId: "new-receipt", timezone: "America/New_York"});
  assert.equal((await request(db, path, revised)).status, 409);
  await load(db, [schedule]);
  const state = await ok(db, "/api/state?recordId=" + schedule.id);
  assert.equal(state.records.length, 1);
  assert.equal(state.records[0].status, "enabled");
  const event = state.history.find(entry => entry.revision === 2);
  assert.equal(event.previousSnapshot.status, "paused");
  assert.deepEqual(event.previousSnapshot.evidence, schedule.evidence);
  assert.equal(event.previousSnapshot.details.scheduleId, "previous-receipt");
});

test("registry runtime observations preserve the agent assignment and required model", async t => {
  const db = testDatabase(t);
  await load(db, [{...agent, details: {requiredModel: "assigned-model", level: "L2"}}]);
  const path = "/api/registry/" + agent.id;
  for (const changes of [{details: {requiredModel: "different"}}, {kind: "schedule"}, {details: {level: "L0"}}]) {
    assert.equal((await request(db, path, {revision: 1, changes})).status, 400);
  }
  const saved = await ok(db, path, {revision: 1, changes: {details: {sessionId: "recorded-session"}}});
  assert.equal(saved.record.details.sessionId, "recorded-session");
  assert.equal(saved.record.details.requiredModel, "assigned-model");
});
