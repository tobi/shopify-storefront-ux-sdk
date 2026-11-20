import type { BunPlugin } from "bun"

const peerPackages = /^(react|react-dom|@ui-sdk\/[^/]+)(\/.*)?$/

export const reactPeers: BunPlugin = {
  name: "react-peers",
  setup(build) {
    build.onResolve({ filter: peerPackages }, ({ path }) => ({
      path: Bun.resolveSync(path, import.meta.dir),
    }))
  },
}

export default reactPeers
