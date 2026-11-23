import {createServer} from "node:http";
import {mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {Readable} from "node:stream";
import {fileURLToPath} from "node:url";
import {parseArgs} from "node:util";
import worker from "../dist/server/index.js";
import {LocalD1, migrateLocal} from "./local-db.mjs";

const {values} = parseArgs({options: {
  host: {type: "string", default: "127.0.0.1"},
  port: {type: "string", default: "4173"},
  strictPort: {type: "boolean", default: false},
}});
const root = fileURLToPath(new URL("../", import.meta.url));
const runtime = resolve(root, ".sites-runtime");
mkdirSync(runtime, {recursive: true, mode: 0o700});
const sqlite = new DatabaseSync(resolve(runtime, "preview.sqlite3"), {enableForeignKeyConstraints: true});
migrateLocal(sqlite, resolve(root, "drizzle"));
const env = {DB: new LocalD1(sqlite)};
const server = createServer(async (incoming, outgoing) => {
  try {
    const host = incoming.headers["x-forwarded-host"]?.split(",")[0].trim() || incoming.headers.host;
    const protocol = incoming.headers["x-forwarded-proto"]?.split(",")[0].trim() || "http";
    const url = new URL(incoming.url, `${protocol}://${host}`);
    const options = {method: incoming.method, headers: incoming.headers};
    if (!["GET", "HEAD"].includes(incoming.method)) {
      options.body = Readable.toWeb(incoming);
      options.duplex = "half";
    }
    const response = await worker.fetch(new Request(url, options), env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch {
    outgoing.writeHead(500, {"content-type": "application/json"});
    outgoing.end('{"error":"Local preview could not serve this request."}');
  }
});
server.listen(Number(values.port), values.host, () => console.log(`Preview listening at http://${values.host}:${values.port}`));
const close = () => server.close(() => { sqlite.close(); process.exit(0); });
process.on("SIGTERM", close);
process.on("SIGINT", close);
