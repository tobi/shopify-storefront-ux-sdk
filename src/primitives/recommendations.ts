import { definePrimitive } from "@ui-sdk/core"
import {
  fetchProductRecommendations,
  shopConfig,
  subscribeConfig,
  type ProductCardData,
} from "../shop"

type RecommendationsStatus = "idle" | "loading" | "error"

type ShopRecommendationsOptions = {
  /** Shopify Product GID, e.g. `gid://shopify/Product/123`. */
  productId?: string | null
  /** `RELATED` (default) or `COMPLEMENTARY`. */
  intent?: "RELATED" | "COMPLEMENTARY"
  /** Maximum number of items to keep. Defaults to 4. */
  limit?: number
  endpoint?: string
}

type State = {
  productId: string | null
  intent: "RELATED" | "COMPLEMENTARY"
  limit: number
  products: ProductCardData[]
  status: RecommendationsStatus
  error: string | null
}

type ShopRecommendationsState = {
  status: RecommendationsStatus
  count: number
  empty: boolean
}

const recState = (state: State): ShopRecommendationsState => ({
  status: state.status,
  count: state.products.length,
  empty: state.status === "idle" && state.products.length === 0,
})

/**
 * Shopify native ML-powered product recommendations (`RELATED` or `COMPLEMENTARY`),
 * with automatic abort on product change and refresh on market/currency change.
 */
const shopRecommendations = definePrimitive({
  name: "shop-recommendations",
  options: {
    productId: "string",
    intent: "string",
    limit: "number",
    endpoint: "string",
  },
  controlled: [],
  state: (options: ShopRecommendationsOptions): State => ({
    productId: options.productId ?? null,
    intent: options.intent === "COMPLEMENTARY" ? "COMPLEMENTARY" : "RELATED",
    limit: Math.max(1, Math.round(options.limit ?? 4)),
    products: [],
    status: options.productId ? "loading" : "idle",
    error: null,
  }),
  sync: (options: ShopRecommendationsOptions) => ({
    productId: options.productId ?? null,
    intent: options.intent === "COMPLEMENTARY" ? ("COMPLEMENTARY" as const) : ("RELATED" as const),
    limit: Math.max(1, Math.round(options.limit ?? 4)),
  }),
  api: (context) => {
    const { store, options } = context
    let controller: AbortController | null = null
    let loaded = ""

    const load = async () => {
      const state = store.get()
      if (!state.productId) {
        controller?.abort()
        loaded = ""
        store.set({ products: [], status: "idle", error: null })
        return
      }
      const cfg = shopConfig()
      const endpoint = options().endpoint ?? cfg.endpoint
      const key = JSON.stringify([endpoint, cfg.country, cfg.language, state.productId, state.intent, state.limit])
      if (key === loaded) return
      loaded = key
      controller?.abort()
      const mine = (controller = new AbortController())
      store.set({ status: "loading", error: null })
      try {
        const products = await fetchProductRecommendations(
          state.productId,
          { endpoint, intent: state.intent },
          mine.signal,
        )
        if (mine.signal.aborted) return
        store.set({ products: products.slice(0, state.limit), status: "idle" })
      } catch (error) {
        if (mine.signal.aborted) return
        store.set({ status: "error", error: (error as Error).message })
      }
    }

    context.onDestroy(store.subscribe(() => void load()))
    context.onDestroy(subscribeConfig(() => void load()))
    context.onOptions(() => void load())
    queueMicrotask(() => void load())
    context.onDestroy(() => controller?.abort())

    return {
      getProducts: () => store.get().products,
      refresh: () => {
        loaded = ""
        return load()
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, ShopRecommendationsState>({
      role: "region",
      state: recState,
      attrs: (state) => ({
        "data-status": state.status,
        hidden: state.status === "idle" && state.products.length === 0 ? "" : undefined,
      }),
    }),
  }),
  agent: { actions: [], shown: () => false },
})

export {
  shopRecommendations,
  type RecommendationsStatus,
  type ShopRecommendationsOptions,
  type ShopRecommendationsState,
}
