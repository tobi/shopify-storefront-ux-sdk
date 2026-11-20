import { join } from "node:path"
import home from "./src/index.html"

const isProd = process.env.NODE_ENV === "production"
const distDir = join(import.meta.dir, "dist")
const robotsTxt = "User-agent: *\nAllow: /\n"

function serveStatic(req: Request): Response | Promise<Response> {
  const { pathname } = new URL(req.url)
  if (pathname === "/robots.txt") {
    return new Response(robotsTxt, {
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" },
    })
  }
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "")
  const file = Bun.file(join(distDir, rel))
  return file.exists().then(async (exists) => {
    const target = exists ? file : Bun.file(join(distDir, "index.html"))
    const isHtml = !exists || rel === "index.html"
    const headers: Record<string, string> = {
      "content-type": target.type || "application/octet-stream",
      "cache-control": isHtml ? "no-cache" : "public, max-age=31536000, immutable",
    }
    const accept = req.headers.get("accept-encoding") ?? ""
    if (accept.includes("gzip") && /text|javascript|json|css|svg|xml/.test(headers["content-type"])) {
      const compressed = Bun.gzipSync(new Uint8Array(await target.arrayBuffer()))
      headers["content-encoding"] = "gzip"
      headers["vary"] = "accept-encoding"
      return new Response(compressed, { headers })
    }
    return new Response(target, { headers })
  })
}

const server = isProd
  ? Bun.serve({
      port: Number(process.env.PORT ?? 3001),
      fetch: serveStatic,
    })
  : Bun.serve({
      port: Number(process.env.PORT ?? 3001),
      routes: {
        "/robots.txt": new Response(robotsTxt, { headers: { "content-type": "text/plain; charset=utf-8" } }),
        "/*": home,
      },
      development: { hmr: true, console: true },
    })

console.log(`Snowdevil (React${isProd ? ", release" : ""}) on ${server.url}`)
