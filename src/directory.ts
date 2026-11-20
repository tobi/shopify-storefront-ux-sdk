/**
 * The mock.shop directory: every reference store's host, name, description and
 * categories, parsed from `https://mock.shop/llms.txt`, plus its own search
 * endpoint for matching a brief. No credentials, no build step.
 */

type MockShop = {
  /** The name the store gives itself, like "Amber & Aura". */
  name: string
  /** `<store>.mock.shop`, the host a market config takes. */
  host: string
  /** The store's own Storefront API endpoint. */
  endpoint: string
  /** The paragraph the directory gives it. */
  description: string
  /** The categories it lists, in its own words. */
  categories: string[]
  /** Whether the store publishes a theme and hero as well as a catalog. */
  publishesLook: boolean
}

const directoryUrl = "https://mock.shop/llms.txt"
const searchUrl = "https://mock.shop/api/public/graphql"
const cacheKey = "mock.shop.directory"

// `- [Name](https://host.mock.shop/api): Description. Categories: A, B.` and
// the same line ending `Publishes its look, a theme designed for this store.`
const entry =
  /^- \[([^\]]+)\]\((https:\/\/([a-z0-9-]+)\.mock\.shop)\/api\):\s*([\s\S]*)$/

function parse(text: string) {
  const stores: MockShop[] = []
  const byHost = new Map<string, MockShop>()
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    const match = entry.exec(line)
    if (!match) continue
    const [, name, api, host, rest] = match

    const publishesLook = /Publishes its look/.test(rest)
    const body = rest.replace(/Publishes its look[^.]*\.\s*$/, "").trim()
    const categoriesPart = /(?:Categories|Collections):\s*(.+)$/.exec(body)
    const categories = categoriesPart
      ? categoriesPart[1]
          .replace(/\.$/, "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : []
    const description = (categoriesPart ? body.slice(0, categoriesPart.index) : body)
      .replace(/\.$/, "")
      .trim()

    // A store can be listed twice, once under the themed stores and once in the
    // full list, and only one of those lines may say it publishes its look.
    const heard = byHost.get(host)
    if (heard) {
      heard.publishesLook ||= publishesLook
      if (description.length > heard.description.length) heard.description = description
      for (const category of categories) {
        if (!heard.categories.includes(category)) heard.categories.push(category)
      }
      continue
    }
    const store = {
      name,
      host,
      endpoint: `${api}/api`,
      description,
      categories,
      publishesLook,
    }
    byHost.set(host, store)
    stores.push(store)
  }
  return stores
}

let cached: MockShop[] | null = null
let pending: Promise<MockShop[]> | null = null

function remembered(): MockShop[] | null {
  if (cached) return cached
  try {
    const value = localStorage.getItem(cacheKey)
    if (!value) return null
    const { at, stores } = JSON.parse(value) as { at: number; stores: MockShop[] }
    if (Date.now() - at > 24 * 60 * 60 * 1000) return null
    cached = stores
    return stores
  } catch {
    return null
  }
}

/** Every store the directory lists, newest fetch first, cached for a day. */
function loadDirectory(): Promise<MockShop[]> {
  const known = remembered()
  if (known) return Promise.resolve(known)
  if (pending) return pending
  pending = fetch(directoryUrl, { signal: AbortSignal.timeout(15_000) })
    .then((response) => {
      if (!response.ok) throw new Error(`The directory returned HTTP ${response.status}`)
      return response.text()
    })
    .then((text) => {
      const stores = parse(text)
      if (!stores.length) throw new Error("The directory listed no stores")
      cached = stores
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), stores }))
      } catch {
        // storage is a convenience here, not a requirement
      }
      return stores
    })
    .finally(() => {
      pending = null
    })
  return pending
}

type Match = Pick<MockShop, "name" | "host" | "endpoint"> & {
  description: string
  categories: string[]
  collectionTitles: string[]
  productCount: number
}

/** The directory's own search, up to three matches for a brief in words. */
async function searchDirectory(query: string): Promise<Match[]> {
  const response = await fetch(searchUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: `query FindMockShops($query: String!) {
        shopDirectory {
          search(query: $query) {
            subdomain
            name
            shortDescription
            categories
            collectionTitles
            productCount
            storefrontApiUrl
          }
        }
      }`,
      variables: { query },
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`The directory search returned HTTP ${response.status}`)
  const body = (await response.json()) as {
    data?: {
      shopDirectory?: {
        search?: {
          subdomain: string
          name: string
          shortDescription: string
          categories: string[]
          collectionTitles: string[]
          productCount: number
          storefrontApiUrl: string
        }[]
      }
    }
    errors?: { message: string }[]
  }
  if (body.errors?.length) throw new Error(body.errors[0].message)
  const found = body.data?.shopDirectory?.search ?? []
  return found.map((match) => ({
    name: match.name,
    host: match.subdomain,
    endpoint: match.storefrontApiUrl,
    description: match.shortDescription,
    categories: match.categories ?? [],
    collectionTitles: match.collectionTitles ?? [],
    productCount: match.productCount,
  }))
}

/** The stores that publish a theme as well as a catalog, which are the ones with a look to copy. */
function lookStores(stores: MockShop[]) {
  return stores.filter((store) => store.publishesLook)
}

export {
  loadDirectory,
  lookStores,
  parse,
  searchDirectory,
  type Match,
  type MockShop,
}
