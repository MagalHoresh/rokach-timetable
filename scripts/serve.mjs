import {createServer} from "node:http";
import {readFile} from "node:fs/promises";

const port = Number(process.env.PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RangeError("Invalid PORT");
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/robots.txt", ["robots.txt", "text/plain; charset=utf-8"]]
]);
createServer(async (request, response) => {
  const entry = files.get(new URL(request.url, "http://localhost").pathname);
  if (!entry || !["GET", "HEAD"].includes(request.method)) {
    response.writeHead(404, {"Content-Type": "text/plain; charset=utf-8"});
    response.end("Not found. This preview does not host /api/speak.");
    return;
  }
  try {
    const body = await readFile(new URL(`../site/${entry[0]}`, import.meta.url));
    response.writeHead(200, {"Content-Type": entry[1], "Cache-Control": "no-store"});
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    console.error("Preview read failed:", error);
    response.writeHead(500, {"Content-Type": "text/plain; charset=utf-8"});
    response.end("Unable to load the preview.");
  }
}).listen(port, "127.0.0.1", () => console.log(`Local preview: http://127.0.0.1:${port}`));
