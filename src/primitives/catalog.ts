// A product listing: collection or store-wide search, product-type filter,
// vendor filter, on-sale toggle, sort, cursor pagination, and live market/currency
// updates over the Storefront API.
import { createChange, definePrimitive, type ChangeDetails } from "@ui-sdk/core"
import {
  fetchCollection,
  graphql,
  normalizeProductCard,
  productCardFields,
  shopConfig,
  subscribeConfig,
  type CollectionFilter,
  type CollectionSummary,
  type ProductCardData,
  type RawProductCard,
} from "../shop"
import type { Variant } from "../variants"

type CatalogSort = "featured" | "newest" | "price-low" | "price-high" | "title"

type CatalogVariant = Variant
type CatalogProduct = ProductCardData

type CatalogPage = {
  products: CatalogProduct[]
  collection?: CollectionSummary | null
  filters?: CollectionFilter[]
  cursor: string | null
  hasNext: boolean
}

const sorts: Record<
  CatalogSort,
  { sortKey: string; collectionSortKey: "BEST_SELLING" | "CREATED" | "PRICE" | "TITLE"; reverse: boolean; label: string }
> = {
  featured: { sortKey: "BEST_SELLING", collectionSortKey: "BEST_SELLING", reverse: false, label: "Featured" },
  newest: { sortKey: "CREATED_AT", collectionSortKey: "CREATED", reverse: true, label: "Newest" },
  "price-low": { sortKey: "PRICE", collectionSortKey: "PRICE", reverse: false, label: "Price, low to high" },
  "price-high": { sortKey: "PRICE", collectionSortKey: "PRICE", reverse: true, label: "Price, high to low" },
  title: { sortKey: "TITLE", collectionSortKey: "TITLE", reverse: false, label: "Name" },
}

const catalogQuery = `query Catalog(
  $first: Int!,
  $after: String,
  $query: String,
  $sortKey: ProductSortKeys,
  $reverse: Boolean,
  $country: CountryCode,
  $language: LanguageCode
) @inContext(country: $country, language: $language) {
  products(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
    pageInfo { hasNextPage endCursor }
    nodes { ${productCardFields} }
  }
}`

// Storefront search syntax: free text, with product_type and vendor as field terms.
function searchString(text: string, filter: string | null, vendor?: string | null) {
  const terms = [text.trim()]
  if (filter) terms.push(`product_type:"${filter.replaceAll('"', "")}"`)
  if (vendor) terms.push(`vendor:"${vendor.replaceAll('"', "")}"`)
  return terms.filter(Boolean).join(" ") || null
}

async function fetchCatalog(
  endpoint: string | undefined,
  input: {
    collection?: string | null
    query: string
    filter: string | null
    vendor?: string | null
    sort: CatalogSort
    after?: string | null
    first?: number
  },
  signal?: AbortSignal,
): Promise<CatalogPage> {
  const sort = sorts[input.sort]
  const cfg = shopConfig()
  const resolvedEndpoint = endpoint ?? cfg.endpoint

  // When browsing a specific collection without a free-text query, use the
  // native collection connection so merchant-configured filters & sort apply.
  if (input.collection && !input.query.trim()) {
    const collectionFilters: Record<string, unknown>[] = []
    if (input.filter) collectionFilters.push({ productType: input.filter })
    if (input.vendor) collectionFilters.push({ productVendor: input.vendor })
    const page = await fetchCollection(
      input.collection,
      {
        endpoint: resolvedEndpoint,
        first: input.first ?? 24,
        after: input.after ?? null,
        sortKey: sort.collectionSortKey,
        reverse: sort.reverse,
        filters: collectionFilters,
      },
      signal,
    )
    return {
      products: page.products,
      collection: page.collection,
      filters: page.filters,
      cursor: page.cursor,
      hasNext: page.hasNext,
    }
  }

  const data = await graphql<{
    products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: RawProductCard[] }
  }>(
    catalogQuery,
    {
      first: input.first ?? 24,
      after: input.after ?? null,
      query: searchString(input.query, input.filter, input.vendor),
      sortKey: sort.sortKey,
      reverse: sort.reverse,
      country: cfg.country.toUpperCase(),
      language: cfg.language.toUpperCase(),
    },
    resolvedEndpoint,
    signal,
  )
  const connection = data.products
  return {
    hasNext: connection.pageInfo.hasNextPage,
    cursor: connection.pageInfo.endCursor,
    products: connection.nodes.map(normalizeProductCard),
  }
}

type CatalogReason = "input" | "item-press" | "imperative"

type ShopCatalogOptions = {
  /** Storefront API URL. Defaults to the configured shop endpoint. */
  endpoint?: string
  /** Optional Shopify collection handle to scope the listing. */
  collection?: string | null
  /** The product types offered as filters, like `["Snowboard", "Binding"]`. */
  filters?: string[]
  query?: string
  defaultQuery?: string
  filter?: string | null
  defaultFilter?: string | null
  vendor?: string | null
  defaultVendor?: string | null
  saleOnly?: boolean
  defaultSaleOnly?: boolean
  /** Alias for `saleOnly` (prefer `saleOnly` in custom elements where `on*` is reserved for events). */
  onSale?: boolean
  defaultOnSale?: boolean
  sort?: CatalogSort
  defaultSort?: CatalogSort
  pageSize?: number
  onQueryChange?: (query: string, details: ChangeDetails<CatalogReason>) => void
  onFilterChange?: (filter: string | null, details: ChangeDetails<CatalogReason>) => void
  onVendorChange?: (vendor: string | null, details: ChangeDetails<CatalogReason>) => void
  onSaleOnlyChange?: (saleOnly: boolean, details: ChangeDetails<CatalogReason>) => void
  onOnSaleChange?: (onSale: boolean, details: ChangeDetails<CatalogReason>) => void
  onSortChange?: (sort: CatalogSort, details: ChangeDetails<CatalogReason>) => void
}

const boolOf = (value: unknown): boolean | undefined => (typeof value === "boolean" ? value : undefined)

type CatalogStatus = "loading" | "idle" | "error"

type State = {
  collection: string | null
  query: string
  filter: string | null
  vendor: string | null
  saleOnly: boolean
  /** Mirrors `saleOnly` for callers reading `state.onSale`. */
  onSale: boolean
  sort: CatalogSort
  products: CatalogProduct[]
  collectionInfo: CollectionSummary | null
  collectionFilters: CollectionFilter[]
  cursor: string | null
  hasNext: boolean
  status: CatalogStatus
  error: string | null
}

type ShopCatalogState = { status: CatalogStatus; count: number; empty: boolean; hasNext: boolean }

const visibleProducts = (state: Pick<State, "products"> & { saleOnly?: boolean; onSale?: boolean }) =>
  state.saleOnly || state.onSale
    ? state.products.filter((product) => Boolean(product.compareAtPrice))
    : state.products

const catalogState = (state: State): ShopCatalogState => {
  const shown = visibleProducts(state)
  return {
    status: state.status,
    count: shown.length,
    empty: state.status === "idle" && !shown.length,
    hasNext: state.hasNext,
  }
}

const describe = (state: State) => {
  if (state.status === "loading") return "Loading products…"
  if (state.status === "error") return `Products could not load. ${state.error ?? ""}`.trim()
  const count = visibleProducts(state).length
  const noun = count === 1 ? "product" : "products"
  const scope = [
    state.collectionInfo?.title,
    state.vendor,
    state.filter,
    (state.saleOnly || state.onSale) && "On sale",
    state.query && `matching “${state.query}”`,
  ]
    .filter(Boolean)
    .join(" · ")
  return `${count}${state.hasNext ? "+" : ""} ${noun}${scope ? ` · ${scope}` : ""}`
}

/**
 * The query, filter, vendor, onSale and sort are each controllable; the results
 * are the server's. Every server-side change (or market/currency switch) reloads
 * the first page, and a newer load cancels an older one so a fast typist never
 * sees stale results land last.
 */
const shopCatalog = definePrimitive({
  name: "shop-catalog",
  options: {
    endpoint: "string",
    collection: "string",
    filters: "value",
    query: "string",
    defaultQuery: "string",
    filter: "value",
    defaultFilter: "value",
    vendor: "value",
    defaultVendor: "value",
    saleOnly: "boolean",
    defaultSaleOnly: "boolean",
    onSale: "value",
    defaultOnSale: "boolean",
    sort: "string",
    defaultSort: "string",
    pageSize: "number",
    onQueryChange: "callback",
    onFilterChange: "callback",
    onVendorChange: "callback",
    onSaleOnlyChange: "callback",
    onOnSaleChange: "callback",
    onSortChange: "callback",
  },
  controlled: ["query", "filter", "vendor", "saleOnly", "sort"],
  state: (options: ShopCatalogOptions): State => {
    const sale =
      boolOf(options.saleOnly) ??
      boolOf(options.onSale) ??
      boolOf(options.defaultSaleOnly) ??
      boolOf(options.defaultOnSale) ??
      false
    return {
      collection: options.collection ?? null,
      query: options.query ?? options.defaultQuery ?? "",
      filter: options.filter ?? options.defaultFilter ?? null,
      vendor: options.vendor ?? options.defaultVendor ?? null,
      saleOnly: sale,
      onSale: sale,
      sort: options.sort ?? options.defaultSort ?? "featured",
      products: [],
      collectionInfo: null,
      collectionFilters: [],
      cursor: null,
      hasNext: false,
      status: "loading",
      error: null,
    }
  },
  sync: (options: ShopCatalogOptions) => {
    const sale = boolOf(options.saleOnly) ?? boolOf(options.onSale)
    return {
      ...(options.collection === undefined ? {} : { collection: options.collection }),
      ...(options.query === undefined ? {} : { query: options.query }),
      ...(options.filter === undefined ? {} : { filter: options.filter }),
      ...(options.vendor === undefined ? {} : { vendor: options.vendor }),
      ...(sale === undefined ? {} : { saleOnly: sale, onSale: sale }),
      ...(options.sort === undefined ? {} : { sort: options.sort }),
    }
  },
  api: (context) => {
    const { store, options } = context
    const change = createChange(context)
    let controller: AbortController | null = null
    let loaded = ""

    const endpointOf = () => options().endpoint ?? shopConfig().endpoint

    const load = async (append: boolean) => {
      const endpoint = endpointOf()
      if (!endpoint) return
      controller?.abort()
      const mine = (controller = new AbortController())
      const state = store.get()
      store.set({ status: "loading", error: null })
      try {
        const page = await fetchCatalog(
          endpoint,
          {
            collection: state.collection,
            query: state.query,
            filter: state.filter,
            vendor: state.vendor,
            sort: state.sort,
            after: append ? state.cursor : null,
            first: options().pageSize,
          },
          mine.signal,
        )
        if (mine.signal.aborted) return
        store.set({
          products: append ? [...store.get().products, ...page.products] : page.products,
          collectionInfo: page.collection ?? null,
          collectionFilters: page.filters ?? [],
          cursor: page.cursor,
          hasNext: page.hasNext,
          status: "idle",
        })
      } catch (error) {
        if (mine.signal.aborted) return
        store.set({ status: "error", error: (error as Error).message })
      }
    }

    const reload = () => {
      const { collection, query, filter, vendor, sort } = store.get()
      const cfg = shopConfig()
      const key = JSON.stringify([endpointOf(), cfg.country, cfg.language, collection, query, filter, vendor, sort])
      if (key === loaded) return
      loaded = key
      void load(false)
    }
    context.onDestroy(store.subscribe(reload))
    context.onDestroy(subscribeConfig(reload))
    context.onOptions(reload)
    queueMicrotask(reload)
    context.onDestroy(() => controller?.abort())

    const reasonOf = (details: { reason?: CatalogReason; event?: Event }) =>
      details.reason ?? (details.event ? "input" : "imperative")

    return {
      getProducts: () => visibleProducts(store.get()),
      getCollection: () => store.get().collectionInfo,
      getFilters: () => store.get().collectionFilters,
      setQuery: (query: string, details: { reason?: CatalogReason; event?: Event } = {}) =>
        change("query", query, { reason: reasonOf(details), event: details.event }),
      /** One of `filters`, or `null` for everything. */
      setFilter: (filter: string | null, details: { reason?: CatalogReason; event?: Event } = {}) => {
        const known = options().filters
        const value =
          filter && known?.length
            ? (known.find((entry) => entry.toLowerCase() === filter.toLowerCase()) ?? null)
            : filter
        if (filter && !value) return false
        return change("filter", value, { reason: reasonOf(details), event: details.event })
      },
      setVendor: (vendor: string | null, details: { reason?: CatalogReason; event?: Event } = {}) =>
        change("vendor", vendor, { reason: reasonOf(details), event: details.event }),
      setSaleOnly: (saleOnly: boolean, details: { reason?: CatalogReason; event?: Event } = {}) => {
        const next = Boolean(saleOnly)
        const ok = change("saleOnly", next, { reason: reasonOf(details), event: details.event })
        if (ok) store.set({ onSale: store.get().saleOnly })
        return ok
      },
      setOnSale: (onSale: boolean, details: { reason?: CatalogReason; event?: Event } = {}) => {
        const next = Boolean(onSale)
        const ok = change("saleOnly", next, { reason: reasonOf(details), event: details.event })
        if (ok) store.set({ onSale: store.get().saleOnly })
        return ok
      },
      setSort: (sort: CatalogSort, details: { reason?: CatalogReason; event?: Event } = {}) =>
        sort in sorts ? change("sort", sort, { reason: reasonOf(details), event: details.event }) : false,
      reset: (details: { reason?: CatalogReason; event?: Event } = {}) => {
        const meta = { reason: reasonOf(details), event: details.event }
        change("query", "", meta)
        change("filter", null, meta)
        change("vendor", null, meta)
        change("saleOnly", false, meta)
        store.set({ onSale: store.get().saleOnly })
        return true
      },
      loadMore: () =>
        store.get().hasNext && store.get().status !== "loading"
          ? load(true).then(() => true)
          : Promise.resolve(false),
      refresh: () => load(false),
    }
  },
  slots: (slot) => ({
    root: slot<{}, ShopCatalogState>({
      role: "region",
      state: catalogState,
      attrs: (state) => ({
        "data-status": state.status,
        "aria-busy": state.status === "loading" ? "true" : undefined,
      }),
    }),
    results: slot<{}, ShopCatalogState>({
      state: catalogState,
      attrs: (state) => ({ "data-empty": catalogState(state).empty ? "" : undefined }),
    }),
    empty: slot<{}, ShopCatalogState>({
      state: catalogState,
      attrs: (state) => ({ hidden: catalogState(state).empty ? undefined : "" }),
    }),
    status: slot<{}, { message: string }>({
      role: "status",
      state: (state) => ({ message: describe(state) }),
      attrs: () => ({ "aria-live": "polite", "aria-atomic": "true" }),
    }),
  }),
  agent: { actions: ["setQuery", "setFilter", "setVendor", "setOnSale", "setSort", "reset", "loadMore"] },
})

export {
  fetchCatalog,
  searchString,
  shopCatalog,
  sorts as catalogSorts,
  visibleProducts,
  type CatalogPage,
  type CatalogProduct,
  type CatalogReason,
  type CatalogSort,
  type CatalogStatus,
  type CatalogVariant,
  type ShopCatalogOptions,
  type ShopCatalogState,
}
