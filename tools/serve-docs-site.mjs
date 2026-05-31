import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = path.join(root, "site");
const port = Number(process.env.PORT ?? 4173);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

function resolveRequestPath(url) {
  const requestPath = decodeURIComponent(new URL(url, `http://localhost:${port}`).pathname);
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const targetPath = path.join(siteDir, safePath === "/" ? "index.html" : safePath);

  if (!targetPath.startsWith(siteDir)) {
    return path.join(siteDir, "index.html");
  }

  return targetPath;
}

const server = createServer(async (request, response) => {
  let targetPath = resolveRequestPath(request.url ?? "/");

  if (existsSync(targetPath) && (await stat(targetPath)).isDirectory()) {
    targetPath = path.join(targetPath, "index.html");
  }

  if (!existsSync(targetPath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": contentTypes.get(path.extname(targetPath)) ?? "application/octet-stream",
  });
  createReadStream(targetPath).pipe(response);
});

server.listen(port, () => {
  console.log(`Serving Gus Knowledge docs at http://localhost:${port}/`);
});
