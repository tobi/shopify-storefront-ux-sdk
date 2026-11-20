import home from "./src/index.html"

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: { "/*": home },
  development: { hmr: true, console: true },
})

console.log(`Snowdevil (Solid) on ${server.url}`)
