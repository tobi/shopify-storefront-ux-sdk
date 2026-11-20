import { createChange, definePrimitive, type ChangeDetails } from "@ui-sdk/core"
import {
  fetchPredictiveSearch,
  shopConfig,
  subscribeConfig,
  type CollectionSummary,
  type PredictiveSearchQuery,
  type ProductCardData,
} from "../shop"

type SearchReason = "input" | "clear" | "imperative"
type SearchStatus = "idle" | "loading" | "error"

type ShopSearchOptions = {
  endpoint?: string
  query?: string
  defaultQuery?: string
  limit?: number
  debounceMs?: number
  onQueryChange?: (query: string, details: ChangeDetails<SearchReason>) => void
}

type State = {
  query: string
  queries: PredictiveSearchQuery[]
  products: ProductCardData[]
  collections: CollectionSummary[]
  status: SearchStatus
  error: string | null
}

type ShopSearchState = {
  query: string
  status: SearchStatus
  hasResults: boolean
  empty: boolean
  count: number
}

const searchState = (state: State): ShopSearchState => {
  const count = state.products.length + state.collections.length + state.queries.length
  return {
    query: state.query,
    status: state.status,
    hasResults: count > 0,
    empty: Boolean(state.query.trim()) && state.status === "idle" && count === 0,
    count,
  }
}

/**
 * Predictive storefront search backed by Shopify's `predictiveSearch` API.
 * Returns query suggestions, matching products, and collections with abortable,
 * debounced requests and live market/currency awareness.
 */
const shopSearch = definePrimitive({
  name: "shop-search",
  options: {
    endpoint: "string",
    query: "string",
    defaultQuery: "string",
    limit: "number",
    debounceMs: "number",
    onQueryChange: "callback",
  },
  controlled: ["query"],
  state: (options: ShopSearchOptions): State => ({
    query: options.query ?? options.defaultQuery ?? "",
    queries: [],
    products: [],
    collections: [],
    status: "idle",
    error: null,
  }),
  sync: (options: ShopSearchOptions) => ({
    ...(options.query === undefined ? {} : { query: options.query }),
  }),
  api: (context) => {
    const { store, options } = context
    const change = createChange(context)
    let controller: AbortController | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let lastKey = ""

    const run = async () => {
      const state = store.get()
      const trimmed = state.query.trim()
      if (!trimmed) {
        controller?.abort()
        lastKey = ""
        store.set({ queries: [], products: [], collections: [], status: "idle", error: null })
        return
      }
      const cfg = shopConfig()
      const endpoint = options().endpoint ?? cfg.endpoint
      const key = JSON.stringify([endpoint, cfg.country, cfg.language, trimmed, options().limit ?? 6])
      if (key === lastKey) return
      lastKey = key
      controller?.abort()
      const mine = (controller = new AbortController())
      store.set({ status: "loading", error: null })
      try {
        const result = await fetchPredictiveSearch(
          trimmed,
          { endpoint, limit: options().limit ?? 6 },
          mine.signal,
        )
        if (mine.signal.aborted) return
        store.set({
          queries: result.queries,
          products: result.products,
          collections: result.collections,
          status: "idle",
        })
      } catch (error) {
        if (mine.signal.aborted) return
        store.set({ status: "error", error: (error as Error).message })
      }
    }

    const schedule = () => {
      clearTimeout(timer)
      const trimmed = store.get().query.trim()
      if (!trimmed) {
        void run()
        return
      }
      const delay = options().debounceMs ?? 180
      timer = setTimeout(() => void run(), delay)
    }

    context.onDestroy(store.subscribe(schedule))
    context.onDestroy(subscribeConfig(() => {
      lastKey = ""
      if (store.get().query.trim()) void run()
    }))
    context.onDestroy(() => {
      clearTimeout(timer)
      controller?.abort()
    })

    return {
      getResults: () => {
        const { queries, products, collections } = store.get()
        return { queries, products, collections }
      },
      setQuery: (query: string, details: { reason?: SearchReason; event?: Event } = {}) =>
        change("query", query, {
          reason: details.reason ?? (details.event ? "input" : "imperative"),
          event: details.event,
        }),
      clear: (details: { event?: Event } = {}) =>
        change("query", "", { reason: "clear", event: details.event }),
      search: () => run(),
    }
  },
  slots: (slot) => ({
    root: slot<{}, ShopSearchState>({
      role: "search",
      state: searchState,
      attrs: (state) => ({
        "data-status": state.status,
        "data-empty": searchState(state).empty ? "" : undefined,
      }),
    }),
    status: slot<{}, { message: string }>({
      role: "status",
      state: (state) => {
        const s = searchState(state)
        const message =
          state.status === "loading"
            ? "Searching…"
            : state.status === "error"
              ? `Search failed. ${state.error ?? ""}`.trim()
              : !state.query.trim()
                ? ""
                : s.empty
                  ? `No results for “${state.query}”.`
                  : `${state.products.length} products found for “${state.query}”.`
        return { message }
      },
      attrs: () => ({ "aria-live": "polite", "aria-atomic": "true" }),
    }),
  }),
  agent: { actions: ["setQuery", "clear"] },
})

export { shopSearch, type SearchReason, type SearchStatus, type ShopSearchOptions, type ShopSearchState }
