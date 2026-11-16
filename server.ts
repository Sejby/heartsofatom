// Minimal static dev server for Hearts of Atom.  Run: bun run dev
import { file } from "bun";
import { join, normalize } from "path";

const root = import.meta.dir;
const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    let path = decodeURIComponent(url.pathname);
    if (path === "/") path = "/index.html";
    const full = normalize(join(root, path));
    if (!full.startsWith(root)) return new Response("Forbidden", { status: 403 });
    const f = file(full);
    if (!(await f.exists())) return new Response("Not found", { status: 404 });
    return new Response(f, { headers: { "Cache-Control": "no-cache" } });
  },
});

console.log(`Hearts of Atom běží na http://localhost:${server.port}`);
