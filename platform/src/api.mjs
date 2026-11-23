import {ApiError, id, object, readJson} from "./validation.mjs";
import {getState, importRecords, createRecord, reviewRecord, updateTask, updateRegistry} from "./store.mjs";

export function json(data, status = 200) {
  return Response.json(data, {status, headers: {"cache-control": "private, no-store", "x-content-type-options": "nosniff"}});
}

export function failure(error) {
  if (error instanceof ApiError) return {error: error.message, status: error.status};
  return {error: "Workspace storage could not complete the request.", status: 500};
}

export function actor(request) {
  return request.headers.has("oai-authenticated-user-id") ? "workspace_user" : "workspace_service";
}

// Shared REST and MCP operations. An owner-private Sites boundary admits the
// workspace owner and authorized service jobs. None of these operations sends
// content externally or accesses another visitor's personal records.
export async function operate(db, operation, input, writer) {
  if (!db) throw new ApiError(503, "Workspace database is unavailable.");
  switch (operation) {
    case "marketing_state":
      return getState(db, object(input, ["kind", "agentId", "recordId"]));
    case "marketing_import":
      return importRecords(db, input, writer);
    case "marketing_queue_task":
      return createRecord(db, "task", input, writer);
    case "marketing_add_knowledge":
      return createRecord(db, "knowledge", input, writer);
    case "marketing_review":
    case "marketing_update_task":
    case "marketing_update_registry": {
      const {id: key, ...action} = object(input);
      id(key);
      if (operation === "marketing_update_registry") return updateRegistry(db, key, action, writer);
      return operation === "marketing_review" ? reviewRecord(db, key, action, writer) : updateTask(db, key, action, writer);
    }
    default: throw new ApiError(404, "Unknown workspace operation.");
  }
}

export async function handleApi(request, db) {
  try {
    const url = new URL(request.url);
    const writer = actor(request);
    if (url.pathname === "/api/state" && request.method === "GET") {
      const filters = Object.fromEntries(url.searchParams);
      return json(await operate(db, "marketing_state", filters, writer));
    }
    if (request.method !== "POST") throw new ApiError(405, "Unsupported request method.");
    const routes = {"/api/import": "marketing_import", "/api/tasks": "marketing_queue_task", "/api/knowledge": "marketing_add_knowledge"};
    let operation = routes[url.pathname];
    const action = /^\/api\/(reviews|tasks|registry)\/([a-z0-9._:-]+)$/i.exec(url.pathname);
    if (action) operation = {reviews: "marketing_review", tasks: "marketing_update_task", registry: "marketing_update_registry"}[action[1]];
    if (!operation) throw new ApiError(404, "Workspace endpoint was not found.");
    const input = object(await readJson(request));
    if (action && Object.hasOwn(input, "id")) throw new ApiError(400, "Supply the record ID in the URL.");
    return json(await operate(db, operation, action ? {...input, id: action[2]} : input, writer));
  } catch (error) {
    const result = failure(error);
    return json({error: result.error}, result.status);
  }
}
