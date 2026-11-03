import http from "node:http"; import zlib from "node:zlib"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url)); const port = +process.env.PORT || 4173;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".css": "text/css" };
http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html"; if (p === "/index.html" && fs.existsSync(path.join(root, "index.min.html")) && !process.env.NO_MIN) p = "/index.min.html";
  const f = path.join(root, path.normalize(p)); if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end("404"); }
  const ext = path.extname(f); const gz0 = /\.(html|js|json|webmanifest|css)$/.test(path.extname(f)) && /gzip/.test(q.headers["accept-encoding"] || ""); r.writeHead(200, { ...(gz0 ? { "Content-Encoding": "gzip" } : {}), "Content-Type": types[ext] || "application/octet-stream", "Cache-Control": ext === ".png" || p.startsWith("/vendor/") ? "public, max-age=31536000, immutable" : "no-cache" });
  const gz = gz0;
  const rs = fs.createReadStream(f); gz ? rs.pipe(zlib.createGzip()).pipe(r) : rs.pipe(r);
}).listen(port, () => console.log("NexusReel web em http://localhost:" + port));
