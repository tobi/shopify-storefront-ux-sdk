import type { BunPlugin } from "bun"
import { join } from "node:path"
import { transform } from "@solidjs/compiler"

const peerPackages = /^(solid-js|@solidjs\/web|@ui-sdk\/[^/]+)(\/.*)?$/
const isDev = process.env.NODE_ENV !== "production"

function resolvePeer(specifier: string) {
  if (specifier === "solid-js") {
    return join(import.meta.dir, "node_modules/solid-js/dist", isDev ? "solid.dev.js" : "solid.js")
  }
  if (specifier === "@solidjs/web") {
    return join(import.meta.dir, "node_modules/@solidjs/web/dist", isDev ? "web.dev.js" : "web.js")
  }
  return Bun.resolveSync(specifier, import.meta.dir)
}

export const solid: BunPlugin = {
  name: "solid-jsx",
  setup(build) {
    build.onResolve({ filter: peerPackages }, ({ path }) => ({ path: resolvePeer(path) }))
    build.onLoad({ filter: /(\/src\/.*|shopify-storefront-ux-sdk\/src\/solid\/.*)\.tsx$/ }, async ({ path }) => {
      const source = await Bun.file(path).text()
      const { code } = transform(source, { filename: path, generate: "dom", dev: isDev })
      return { contents: code, loader: "ts" }
    })
  },
}

export default solid
