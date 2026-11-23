import {ASSETS} from "../.generated/assets.mjs";
import {handleApi, json} from "./api.mjs";
import {handleMcp} from "./mcp.mjs";

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === "/mcp") return handleMcp(request, env.DB);
    if (path.startsWith("/api/")) return handleApi(request, env.DB);
    if (!["GET", "HEAD"].includes(request.method)) return json({error: "Use GET or HEAD."}, 405);
    if (path === "/health") {
      let healthy = false;
      try {
        await env.DB.prepare("SELECT id FROM ops_records LIMIT 1").first();
        healthy = true;
      } catch { /* Readiness includes an accessible, migrated D1 database. */ }
      const response = json({status: healthy ? "ready" : "unavailable"}, healthy ? 200 : 503);
      return request.method === "HEAD" ? new Response(null, response) : response;
    }
    const asset = ASSETS[path];
    if (!asset) return json({error: "Page was not found."}, 404);
    return new Response(request.method === "HEAD" ? null : asset.body, {
      headers: {
        "content-type": asset.contentType,
        "cache-control": "private, no-cache",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'",
      },
    });
  },
};
