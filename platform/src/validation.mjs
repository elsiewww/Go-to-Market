export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const reviewKinds = ["content", "outreach", "reply", "growth"];
const artifactStates = ["draft", "needs_review"];
export const importStates = {
  agent: ["prepared", "available", "blocked", "completed"],
  task: ["queued", "running", "blocked", "completed"],
  run: ["running", "completed", "blocked", "failed"],
  evidence: ["captured", "verified", "unverified"],
  content: artifactStates,
  outreach: artifactStates,
  reply: artifactStates,
  growth: artifactStates,
  knowledge: ["reference", "verified", "unverified"],
  source: ["configured", "available", "unavailable", "manual", "disabled"],
  schedule: ["enabled", "paused", "unverified"],
};

function invalid(message) {
  throw new ApiError(400, message);
}

export function object(value, allowed) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid("Expected a JSON object.");
  if (allowed && Object.keys(value).some(key => !allowed.includes(key))) invalid("Unrecognized input field.");
  return value;
}

export function string(value, key, max, required = true) {
  if (value === undefined && !required) return "";
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) {
    invalid(`Invalid ${key} (maximum ${max} characters).`);
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) invalid(`Unexpected control character in ${key}.`);
  return value.trim();
}

export function id(value, key = "id") {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._:-]{0,159}$/i.test(value)) invalid(`Invalid ${key}.`);
  return value;
}

function date(value, key) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value))) invalid(`Invalid ${key}: include date, time and timezone.`);
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) invalid(`Invalid calendar date in ${key}.`);
  return new Date(value).toISOString();
}

function link(value) {
  const raw = string(value, "url", 3000);
  let parsed;
  try { parsed = new URL(raw); } catch { invalid("Invalid evidence URL."); }
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) invalid("Evidence links must be HTTP(S) URLs without credentials.");
  return parsed.href;
}

function evidenceList(value = []) {
  if (!Array.isArray(value) || value.length > 50) invalid("evidence must contain at most 50 entries.");
  return value.map(entry => {
    object(entry, ["label", "url", "ref", "observedAt"]);
    const item = {label: string(entry.label, "evidence label", 500)};
    if (entry.url !== undefined) item.url = link(entry.url);
    if (entry.ref !== undefined) item.ref = string(entry.ref, "evidence ref", 2000);
    if (!item.ref && !item.url) invalid("Each evidence entry requires a URL or artifact reference.");
    if (entry.observedAt !== undefined) item.observedAt = date(entry.observedAt, "observedAt");
    return item;
  });
}

// Sorted keys make input fingerprints independent of JSON property order.
function normalizeJson(value, depth = 0) {
  if (depth > 8) invalid("Record details exceed the maximum nesting depth.");
  if (Array.isArray(value)) return value.map(item => normalizeJson(item, depth + 1));
  if (value !== null && typeof value === "object") {
    const result = Object.create(null);
    for (const key of Object.keys(value).sort()) {
      if (["__proto__", "constructor", "prototype"].includes(key)) invalid("Invalid details key.");
      result[key] = normalizeJson(value[key], depth + 1);
    }
    return result;
  }
  if (typeof value === "number" && !Number.isFinite(value)) invalid("Invalid details number.");
  return value;
}

export function recordInput(value) {
  object(value, ["id", "kind", "title", "body", "agentId", "status", "details", "evidence", "createdAt"]);
  const kind = value.kind;
  if (typeof kind !== "string" || !Object.hasOwn(importStates, kind) || !importStates[kind].includes(value.status)) invalid("Unsupported record kind or initial status.");
  const details = normalizeJson(object(value.details === undefined ? {} : value.details));
  if (JSON.stringify(details).length > 65000) invalid("Record details exceed 65000 characters.");
  const evidence = evidenceList(value.evidence);
  if ([...reviewKinds, "evidence", "run"].includes(kind) && !evidence.length) invalid("This record requires a source or artifact reference.");
  return {
    id: id(value.id), kind, title: string(value.title, "title", 400),
    body: string(value.body, "body", 130000, false),
    agentId: value.agentId == null ? null : id(value.agentId, "agentId"),
    status: value.status, details, evidence,
    createdAt: value.createdAt === undefined ? null : date(value.createdAt, "createdAt"),
  };
}

export function revisionNumber(value) {
  if (!Number.isSafeInteger(value) || value < 1) invalid("A positive integer revision is required.");
  return value;
}

export async function readJson(request) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== new URL(request.url).origin)) {
    throw new ApiError(403, "Cross-origin writes are unavailable.");
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ApiError(415, "Use application/json.");
  }
  const reader = request.body?.getReader();
  if (!reader) invalid("A JSON body is required.");
  const limit = 2 * 1024 * 1024;
  let size = 0;
  let json = "";
  const decoder = new TextDecoder();
  while (true) {
    const {value, done} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new ApiError(413, "Request exceeds 2 MiB.");
    }
    json += decoder.decode(value, {stream: true});
  }
  try { return JSON.parse(json + decoder.decode()); } catch { invalid("Invalid JSON."); }
}
