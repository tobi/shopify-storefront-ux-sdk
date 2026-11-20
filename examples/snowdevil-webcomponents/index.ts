import home from "./src/index.html"

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3002),
  routes: { "/*": home },
  development: { hmr: true, console: true },
})

console.log(`Snowdevil (Web Components) on ${server.url}`)
