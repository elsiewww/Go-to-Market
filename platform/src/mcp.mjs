import {actor, failure, json, operate} from "./api.mjs";
import {ApiError, importStates, object, readJson} from "./validation.mjs";

const text = {type: "string"};
const revision = {type: "integer", minimum: 1};
const id = {type: "string", pattern: "^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$"};
function fields(properties, required = []) {
  return {type: "object", properties, required, additionalProperties: false};
}
const evidence = {
  type: "array", maxItems: 50,
  items: {
    ...fields({label: text, ref: text, url: {type: "string", format: "uri"}, observedAt: {type: "string", format: "date-time"}}, ["label"]),
    anyOf: [{required: ["ref"]}, {required: ["url"]}],
  },
};
const record = fields({
  id, kind: {enum: Object.keys(importStates)}, title: text, body: text,
  agentId: {anyOf: [id, {type: "null"}]}, status: text,
  details: {type: "object"}, evidence, createdAt: {type: "string", format: "date-time"},
}, ["id", "kind", "title", "status"]);

const tools = [
  {
    name: "marketing_state",
    description: "Read private marketing workspace records and status history. Limit the response by kind, agentId or recordId. Queued tasks await a real executor.",
    inputSchema: fields({kind: {enum: Object.keys(importStates)}, agentId: id, recordId: id}),
  },
  {
    name: "marketing_import",
    description: "Atomically import verified execution artifacts using stable IDs. Each reviewable, evidence or run record needs evidence with label and ref or URL. Known IDs replay unchanged. To submit a new artifact version, use a distinct ID. Supported initial statuses by kind: " + JSON.stringify(importStates),
    inputSchema: fields({records: {type: "array", minItems: 1, maxItems: 60, items: record}}, ["records"]),
  },
  {
    name: "marketing_queue_task",
    description: "Queue work for an existing agent. Supply a stable requestId for retries. This action creates a task for a later executor.",
    inputSchema: fields({title: text, body: text, agentId: id, requestId: id}, ["title", "agentId"]),
  },
  {
    name: "marketing_review",
    description: "Save draft body, submit for review, approve or request revisions. Use the current revision. A revision request requires a note. Approval records an internal review only.",
    inputSchema: fields({id, revision, decision: {enum: ["save", "submit", "approve", "revise"]}, note: text, body: text}, ["id", "revision", "decision"]),
  },
  {
    name: "marketing_update_task",
    description: "Claim a queued task as running, block work with a note, requeue blocked work, or complete running work. Completion requires a completed run with its details.taskId and agentId matching the task.",
    inputSchema: fields({id, revision, status: {enum: ["queued", "running", "blocked", "completed"]}, runId: id, note: text}, ["id", "revision", "status"]),
  },
  {
    name: "marketing_update_registry",
    description: "Update one existing agent, source or schedule observation using its revision. New statuses require fresh evidence. Details merge at the top level. Agent updates can change runtime/session evidence while preserving assignments and model policy. This records an observation; scheduler settings are controlled separately.",
    inputSchema: fields({id, revision, changes: fields({title: text, body: text, status: text, details: {type: "object"}, evidence}), note: text}, ["id", "revision", "changes"]),
  },
  {
    name: "marketing_add_knowledge",
    description: "Save a source-backed knowledge note to the shared workspace or one agent. Use requestId for retries.",
    inputSchema: fields({title: text, body: text, agentId: id, requestId: id, evidence}, ["title", "body"]),
  },
];

function protocolError(requestId, code, message, status = 200) {
  return json({jsonrpc: "2.0", id: requestId, error: {code, message}}, status);
}

export async function handleMcp(request, db) {
  if (request.method !== "POST") return protocolError(null, -32600, "Use POST.", 405);
  let rpc;
  try { rpc = await readJson(request); }
  catch (error) {
    const cause = failure(error);
    return protocolError(null, -32700, cause.error, cause.status);
  }
  if (!rpc || typeof rpc !== "object" || rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string" ||
      (rpc.id !== undefined && rpc.id !== null && !["number", "string"].includes(typeof rpc.id))) {
    return protocolError(null, -32600, "Invalid JSON-RPC request.");
  }
  if (rpc.id === undefined) return new Response(null, {status: 202});
  let result;
  if (rpc.method === "server/discover") {
    result = {supportedVersions: ["2026-07-28"], capabilities: {tools: {}}, serverInfo: {name: "marketing-workspace", version: "1"}};
  } else if (rpc.method === "tools/list") {
    result = {tools};
  } else if (rpc.method === "tools/call") {
    const name = rpc.params?.name;
    if (!tools.some(tool => tool.name === name)) return protocolError(rpc.id, -32602, "Unknown workspace tool.");
    try {
      const data = await operate(db, name, object(rpc.params.arguments ?? {}), actor(request));
      result = {content: [{type: "text", text: JSON.stringify(data)}], isError: false};
    } catch (error) {
      const cause = error instanceof ApiError ? error.message : failure(error).error;
      result = {content: [{type: "text", text: cause}], isError: true};
    }
  } else return protocolError(rpc.id, -32601, "Method was not found.");
  return json({jsonrpc: "2.0", id: rpc.id, result});
}
