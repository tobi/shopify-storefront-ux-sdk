export {}
const result = await Bun.build({
  entrypoints: ["./src/index.html"],
  outdir: "./dist",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
})
if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}
console.log(result.outputs.map((o) => o.path).join("\n"))
