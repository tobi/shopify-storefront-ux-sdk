/**
 * Storefront data access and cart state, with no UI. Everything here is plain
 * TypeScript: the elements in `src/web/` and components in `src/solid/` and
 * `src/react/` are the UI adapters.
 *
 * Non-lossy by design: preserves Shopify's full product, variant, swatch,
 * collection, recommendation, predictive search, localization, menu, and cart
 * structures — including server-computed line costs, automatic & code discount
 * allocations, notes, attributes, and `@inContext(country, language)`.
 */

import { imageSrcSet, imageUrl, type Image, type ImageTransform } from "./images"
import { numericGid, type Money, type ProductOption, type SelectedOption, type Variant } from "./variants"

type PriceRange = {
  minVariantPrice: Money
  maxVariantPrice: Money
}

type Seo = {
  title: string | null
  description: string | null
}

type Product = {
  id: string
  title: string
  handle: string
  vendor: string
  productType: string
  tags: string[]
  availableForSale: boolean
  description: string
  descriptionHtml: string
  seo: Seo
  priceRange: PriceRange
  compareAtPriceRange: PriceRange
  options: ProductOption[]
  featuredImage: Image | null
  images: Image[]
  variants: Variant[]
}

type ShopInfo = {
  name: string
  description: string | null
  primaryDomain: { url: string; host: string }
}

type MarketCurrency = { isoCode: string; symbol: string }
type MarketLanguage = { isoCode: string; endonymName: string }
type MarketCountry = {
  isoCode: string
  name: string
  currency: MarketCurrency
  availableLanguages?: MarketLanguage[]
}
type Localization = {
  country: MarketCountry
  language: MarketLanguage
  availableCountries: MarketCountry[]
}

type CollectionFilterValue = {
  id: string
  label: string
  count: number
  input: string
}

type CollectionFilter = {
  id: string
  label: string
  type: string
  values: CollectionFilterValue[]
}

type CollectionSummary = {
  id: string
  handle: string
  title: string
  description: string
  descriptionHtml: string
  image: Image | null
}

type ProductCardData = {
  id: string
  handle: string
  title: string
  vendor: string
  productType: string
  tags: string[]
  availableForSale: boolean
  description: string
  featuredImage: Image | null
  price: Money
  maxPrice: Money
  priceVaries: boolean
  compareAtPrice: Money | null
  options: ProductOption[]
  variants: Variant[]
}

type CollectionPage = {
  collection: CollectionSummary
  products: ProductCardData[]
  filters: CollectionFilter[]
  cursor: string | null
  hasNext: boolean
}

type PredictiveSearchQuery = { text: string; styledText: string }

type PredictiveSearchResult = {
  queries: PredictiveSearchQuery[]
  products: ProductCardData[]
  collections: CollectionSummary[]
}

type MenuItem = {
  id: string
  title: string
  url: string | null
  type: string
  items: MenuItem[]
}

type ShopMenu = {
  id: string
  handle: string
  title: string
  items: MenuItem[]
}

type LineAttribute = { key: string; value: string }

/** A line to add: the variant, how many, and attributes like a bundle's id. */
type LineInput = { variantId: string; quantity?: number; attributes?: LineAttribute[] }

type DiscountCode = { code: string; applicable: boolean }

/** One discount allocation on the cart or on a line (code or automatic). */
type CartDiscount = {
  type: "code" | "automatic"
  /** The discount code, or the automatic discount's title for display. */
  code: string
  title: string
  amount: Money
}

type CartLineCost = {
  amountPerQuantity: Money
  compareAtAmountPerQuantity: Money | null
  subtotalAmount: Money
  totalAmount: Money
}

type CartLine = {
  id: string
  quantity: number
  variantId: string
  sku: string | null
  availableForSale: boolean
  productId: string
  title: string
  handle: string
  vendor: string
  productType: string
  variantTitle: string
  selectedOptions: SelectedOption[]
  image: Image | null
  price: Money
  compareAtPrice: Money | null
  /** Server-computed line amounts, including line-level discounts. */
  cost: CartLineCost
  discounts: CartDiscount[]
  attributes: LineAttribute[]
  /** The bundle a line was added with, from its `_bundle` attribute. */
  bundle: string | null
  /** What the line cost last time it was seen, when that differs from `price`. */
  priceChangedFrom: string | null
}

type Cart = {
  id: string
  checkoutUrl: string
  totalQuantity: number
  note: string | null
  attributes: LineAttribute[]
  buyerIdentity: { countryCode: string | null }
  subtotal: Money
  subtotalEstimated: boolean
  total: Money
  totalEstimated: boolean
  tax: Money
  taxEstimated: boolean
  discounts: CartDiscount[]
  discountCodes: DiscountCode[]
  lines: CartLine[]
}

/** A line on its way out, while its undo is still on offer. */
type RemovedLine = {
  variantId: string
  quantity: number
  attributes: LineAttribute[]
  title: string
  variantTitle: string
}

type Status = "idle" | "loading" | "error"

type ShopConfig = {
  endpoint: string
  /** Optional Shopify public Storefront API access token (`X-Shopify-Storefront-Access-Token`). */
  token?: string
  country: string
  language: string
  storageKey: string
  /** The most units a line may hold, from `<shop-cart max-quantity>`. */
  maxQuantity: number
  locale?: string
  /** Optional extra headers sent with Storefront API requests. */
  headers?: Record<string, string>
}

type RequestOptions = {
  endpoint?: string
  token?: string
  country?: string
  language?: string
  headers?: Record<string, string>
  signal?: AbortSignal
}

const config: ShopConfig = {
  endpoint: "https://mock.shop/api",
  country: "US",
  language: "en",
  storageKey: "shop.cart",
  maxQuantity: 10,
}

const configListeners = new Set<(config: Readonly<ShopConfig>) => void>()

function subscribeConfig(listener: (config: Readonly<ShopConfig>) => void) {
  configListeners.add(listener)
  return () => {
    configListeners.delete(listener)
  }
}

function configureShop(next: Partial<ShopConfig>) {
  const storageChanged = next.storageKey !== undefined && next.storageKey !== config.storageKey
  const contextChanged =
    (next.country !== undefined && next.country.toUpperCase() !== config.country.toUpperCase()) ||
    (next.language !== undefined && next.language.toUpperCase() !== config.language.toUpperCase())
  const endpointChanged = next.endpoint !== undefined && next.endpoint !== config.endpoint
  Object.assign(config, next)
  for (const listener of configListeners) listener({ ...config })
  if (storageChanged || endpointChanged) {
    storedKey = ""
    id = null
    if (started) void ensureCart()
  } else if (contextChanged && started && id) {
    // Market changed: update the live cart's buyerIdentity so cart currency follows.
    void updateBuyerIdentity({ countryCode: config.country.toUpperCase() }).catch(() => {})
  }
}

function shopConfig(): Readonly<ShopConfig> {
  return { ...config }
}

/** The most units a line may hold. */
function quantityLimit() {
  return Math.max(1, Math.round(config.maxQuantity))
}

function clampQuantity(quantity: number) {
  const whole = Math.round(Number(quantity) || 1)
  return Math.min(quantityLimit(), Math.max(1, whole))
}

function contextVars(override?: { country?: string; language?: string }) {
  return {
    country: (override?.country ?? config.country).toUpperCase(),
    language: (override?.language ?? config.language).toUpperCase(),
  }
}

// ---------------------------------------------------------------- formatting

const formatters = new Map<string, Intl.NumberFormat>()

function money(value: Money | null | undefined) {
  if (!value) return ""
  const key = `${config.locale ?? ""}|${value.currencyCode}`
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(config.locale, {
      style: "currency",
      currency: value.currencyCode,
    })
    formatters.set(key, formatter)
  }
  return formatter.format(Number(value.amount))
}

/**
 * Builds a Shopify Shop Pay accelerated checkout URL for one or more lines,
 * using Shopify's native cart permalink format (`https://{host}/cart/{id}:{qty}?payment=shop_pay`),
 * or appends Shop Pay to an active cart's checkout URL when no lines are passed.
 */
function shopPayUrl(
  input: LineInput[] | { checkoutUrl: string } | null | undefined,
  endpoint = config.endpoint,
): string | null {
  if (!input) return null
  if (!Array.isArray(input)) {
    try {
      const url = new URL(input.checkoutUrl)
      url.searchParams.set("payment", "shop_pay")
      return url.toString()
    } catch {
      return input.checkoutUrl || null
    }
  }
  if (!input.length) return null
  const segments: string[] = []
  for (const line of input) {
    const numeric = numericGid(line.variantId)
    if (!numeric) return null
    segments.push(`${numeric}:${clampQuantity(line.quantity ?? 1)}`)
  }
  try {
    const origin = new URL(endpoint).origin
    return `${origin}/cart/${segments.join(",")}?payment=shop_pay`
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- storefront

type GraphQLErrorItem = {
  message: string
  path?: (string | number)[]
  extensions?: Record<string, unknown>
}
type GraphQLBody<T> = { data?: T; errors?: GraphQLErrorItem[] }

async function graphql<T>(
  query: string,
  variables: Record<string, unknown> = {},
  endpointOrOptions: string | RequestOptions = config.endpoint,
  signal?: AbortSignal,
) {
  const opts: RequestOptions =
    typeof endpointOrOptions === "string" ? { endpoint: endpointOrOptions } : endpointOrOptions
  const endpoint = opts.endpoint ?? config.endpoint
  const token = opts.token ?? config.token
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(config.headers ?? {}),
    ...(opts.headers ?? {}),
  }
  if (token) headers["X-Shopify-Storefront-Access-Token"] = token

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
    signal: opts.signal ?? signal ?? AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`Storefront returned HTTP ${response.status}`)
  const body = (await response.json()) as GraphQLBody<T>
  if (body.errors?.length) throw new Error(body.errors[0].message)
  if (!body.data) throw new Error("Storefront returned no data")
  return body.data
}

const imageFields = `id url altText width height`

const variantFields = `
  id
  title
  sku
  availableForSale
  currentlyNotInStock
  selectedOptions { name value }
  price { amount currencyCode }
  compareAtPrice { amount currencyCode }
  unitPrice { amount currencyCode }
  image { ${imageFields} }
`

const optionFields = `
  id
  name
  values
  optionValues {
    id
    name
    swatch {
      color
      image { previewImage { ${imageFields} } }
    }
  }
`

const productCardFields = `
  id
  handle
  title
  vendor
  productType
  tags
  availableForSale
  description
  featuredImage { ${imageFields} }
  priceRange {
    minVariantPrice { amount currencyCode }
    maxVariantPrice { amount currencyCode }
  }
  compareAtPriceRange {
    minVariantPrice { amount currencyCode }
    maxVariantPrice { amount currencyCode }
  }
  options { ${optionFields} }
  variants(first: 25) {
    nodes { ${variantFields} }
  }
`

type RawProductCard = Omit<
  ProductCardData,
  "price" | "maxPrice" | "priceVaries" | "compareAtPrice" | "variants" | "options"
> & {
  priceRange: PriceRange
  compareAtPriceRange: PriceRange
  options?: ProductOption[]
  variants?: { nodes: Variant[] }
}

function normalizeProductCard(raw: RawProductCard): ProductCardData {
  const min = raw.priceRange.minVariantPrice
  const max = raw.priceRange.maxVariantPrice
  const compare = raw.compareAtPriceRange.maxVariantPrice
  return {
    id: raw.id,
    handle: raw.handle,
    title: raw.title,
    vendor: raw.vendor,
    productType: raw.productType ?? "",
    tags: raw.tags ?? [],
    availableForSale: raw.availableForSale,
    description: raw.description ?? "",
    featuredImage: raw.featuredImage ?? null,
    price: min,
    maxPrice: max,
    priceVaries: Number(max.amount) > Number(min.amount),
    compareAtPrice:
      compare &&
      compare.currencyCode === min.currencyCode &&
      Number(compare.amount) > Number(min.amount)
        ? compare
        : null,
    options: raw.options ?? [],
    variants: raw.variants?.nodes ?? [],
  }
}

const productQuery = `query Product($handle: String!, $country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    product(handle: $handle) {
      id
      title
      handle
      vendor
      productType
      tags
      availableForSale
      description
      descriptionHtml
      seo { title description }
      priceRange {
        minVariantPrice { amount currencyCode }
        maxVariantPrice { amount currencyCode }
      }
      compareAtPriceRange {
        minVariantPrice { amount currencyCode }
        maxVariantPrice { amount currencyCode }
      }
      options { ${optionFields} }
      featuredImage { ${imageFields} }
      images(first: 50) { nodes { ${imageFields} } }
      variants(first: 250) {
        nodes { ${variantFields} }
      }
    }
  }`

type RawProduct = Omit<Product, "images" | "variants"> & {
  images: { nodes: Image[] }
  variants: { nodes: Variant[] }
}

/** One product by handle, from the configured store or the endpoint given. */
async function fetchProduct(
  handle: string,
  endpointOrOptions: string | RequestOptions = config.endpoint,
  signal?: AbortSignal,
): Promise<Product> {
  const opts = typeof endpointOrOptions === "string" ? { endpoint: endpointOrOptions } : endpointOrOptions
  const data = await graphql<{ product: RawProduct | null }>(
    productQuery,
    { handle, ...contextVars(opts) },
    opts,
    signal,
  )
  if (!data.product) throw new Error(`No product with handle "${handle}"`)
  const raw = data.product
  return {
    ...raw,
    productType: raw.productType ?? "",
    tags: raw.tags ?? [],
    description: raw.description ?? "",
    seo: raw.seo ?? { title: null, description: null },
    featuredImage: raw.featuredImage ?? null,
    images: raw.images.nodes,
    variants: raw.variants.nodes,
  }
}

/** Shop identity & primary domain. */
async function fetchShop(
  endpointOrOptions: string | RequestOptions = config.endpoint,
  signal?: AbortSignal,
): Promise<ShopInfo> {
  const opts = typeof endpointOrOptions === "string" ? { endpoint: endpointOrOptions } : endpointOrOptions
  const data = await graphql<{ shop: ShopInfo }>(
    `query Shop($country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) {
      shop { name description primaryDomain { url host } }
    }`,
    contextVars(opts),
    opts,
    signal,
  )
  return data.shop
}

/** Markets, countries, currencies, and languages supported by the store. */
async function fetchLocalization(
  endpointOrOptions: string | RequestOptions = config.endpoint,
  signal?: AbortSignal,
): Promise<Localization> {
  const opts = typeof endpointOrOptions === "string" ? { endpoint: endpointOrOptions } : endpointOrOptions
  const data = await graphql<{ localization: Localization }>(
    `query Localization($country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) {
      localization {
        country { isoCode name currency { isoCode symbol } }
        language { isoCode endonymName }
        availableCountries {
          isoCode
          name
          currency { isoCode symbol }
          availableLanguages { isoCode endonymName }
        }
      }
    }`,
    contextVars(opts),
    opts,
    signal,
  )
  return data.localization
}

/** Lists collections from the store. */
async function fetchCollections(
  options: RequestOptions & { first?: number } = {},
  signal?: AbortSignal,
): Promise<CollectionSummary[]> {
  const data = await graphql<{ collections: { nodes: CollectionSummary[] } }>(
    `query Collections($first: Int!, $country: CountryCode, $language: LanguageCode)
      @inContext(country: $country, language: $language) {
      collections(first: $first) {
        nodes {
          id handle title description descriptionHtml
          image { ${imageFields} }
        }
      }
    }`,
    { first: options.first ?? 24, ...contextVars(options) },
    options,
    signal,
  )
  return data.collections.nodes
}

/** Fetches one collection with paginated products and merchant-configured Storefront filters. */
async function fetchCollection(
  handle: string,
  options: RequestOptions & {
    first?: number
    after?: string | null
    sortKey?: "BEST_SELLING" | "CREATED" | "PRICE" | "TITLE" | "MANUAL" | "COLLECTION_DEFAULT"
    reverse?: boolean
    filters?: Record<string, unknown>[]
  } = {},
  signal?: AbortSignal,
): Promise<CollectionPage> {
  const data = await graphql<{
    collection: (CollectionSummary & {
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null }
        filters: CollectionFilter[]
        nodes: RawProductCard[]
      }
    }) | null
  }>(
    `query Collection(
      $handle: String!,
      $first: Int!,
      $after: String,
      $sortKey: ProductCollectionSortKeys,
      $reverse: Boolean,
      $filters: [ProductFilter!],
      $country: CountryCode,
      $language: LanguageCode
    ) @inContext(country: $country, language: $language) {
      collection(handle: $handle) {
        id handle title description descriptionHtml
        image { ${imageFields} }
        products(first: $first, after: $after, sortKey: $sortKey, reverse: $reverse, filters: $filters) {
          pageInfo { hasNextPage endCursor }
          filters { id label type values { id label count input } }
          nodes { ${productCardFields} }
        }
      }
    }`,
    {
      handle,
      first: options.first ?? 24,
      after: options.after ?? null,
      sortKey: options.sortKey ?? "COLLECTION_DEFAULT",
      reverse: options.reverse ?? false,
      filters: options.filters ?? [],
      ...contextVars(options),
    },
    options,
    signal,
  )
  if (!data.collection) throw new Error(`No collection with handle "${handle}"`)
  const { products, ...collection } = data.collection
  return {
    collection,
    products: products.nodes.map(normalizeProductCard),
    filters: products.filters ?? [],
    cursor: products.pageInfo.endCursor,
    hasNext: products.pageInfo.hasNextPage,
  }
}

/** Shopify's native ML-powered product recommendations (`RELATED` or `COMPLEMENTARY`). */
async function fetchProductRecommendations(
  productId: string,
  options: RequestOptions & { intent?: "RELATED" | "COMPLEMENTARY" } = {},
  signal?: AbortSignal,
): Promise<ProductCardData[]> {
  const data = await graphql<{ productRecommendations: RawProductCard[] | null }>(
    `query Recommendations(
      $productId: ID!,
      $intent: ProductRecommendationIntent,
      $country: CountryCode,
      $language: LanguageCode
    ) @inContext(country: $country, language: $language) {
      productRecommendations(productId: $productId, intent: $intent) {
        ${productCardFields}
      }
    }`,
    {
      productId,
      intent: options.intent ?? "RELATED",
      ...contextVars(options),
    },
    options,
    signal,
  )
  return (data.productRecommendations ?? []).map(normalizeProductCard)
}

/** Shopify's instant predictive search (query suggestions, products, collections). */
async function fetchPredictiveSearch(
  query: string,
  options: RequestOptions & { limit?: number } = {},
  signal?: AbortSignal,
): Promise<PredictiveSearchResult> {
  const trimmed = query.trim()
  if (!trimmed) return { queries: [], products: [], collections: [] }
  const data = await graphql<{
    predictiveSearch: {
      queries: PredictiveSearchQuery[]
      products: RawProductCard[]
      collections: CollectionSummary[]
    } | null
  }>(
    `query PredictiveSearch(
      $query: String!,
      $limit: Int,
      $country: CountryCode,
      $language: LanguageCode
    ) @inContext(country: $country, language: $language) {
      predictiveSearch(query: $query, limit: $limit) {
        queries { text styledText }
        products { ${productCardFields} }
        collections {
          id handle title description descriptionHtml
          image { ${imageFields} }
        }
      }
    }`,
    {
      query: trimmed,
      limit: options.limit ?? 6,
      ...contextVars(options),
    },
    options,
    signal,
  )
  const result = data.predictiveSearch
  return {
    queries: result?.queries ?? [],
    products: (result?.products ?? []).map(normalizeProductCard),
    collections: result?.collections ?? [],
  }
}

/** Fetches a Shopify navigation menu by handle (e.g. `main-menu`, `footer`). */
async function fetchMenu(
  handle: string,
  endpointOrOptions: string | RequestOptions = config.endpoint,
  signal?: AbortSignal,
): Promise<ShopMenu | null> {
  const opts = typeof endpointOrOptions === "string" ? { endpoint: endpointOrOptions } : endpointOrOptions
  const data = await graphql<{ menu: ShopMenu | null }>(
    `query Menu($handle: String!, $country: CountryCode, $language: LanguageCode)
      @inContext(country: $country, language: $language) {
      menu(handle: $handle) {
        id handle title
        items {
          id title url type
          items {
            id title url type
            items { id title url type }
          }
        }
      }
    }`,
    { handle, ...contextVars(opts) },
    opts,
    signal,
  )
  return data.menu
}

// ------------------------------------------------------------------ cart API

const discountAllocationFields = `
  discountedAmount { amount currencyCode }
  ... on CartCodeDiscountAllocation { code }
  ... on CartAutomaticDiscountAllocation { title }
`

const cartFields = `fragment CartFields on Cart {
  id
  checkoutUrl
  totalQuantity
  note
  attributes { key value }
  buyerIdentity { countryCode }
  discountCodes { code applicable }
  discountAllocations { ${discountAllocationFields} }
  cost {
    subtotalAmount { amount currencyCode }
    subtotalAmountEstimated
    totalAmount { amount currencyCode }
    totalAmountEstimated
    totalTaxAmount { amount currencyCode }
    totalTaxAmountEstimated
  }
  lines(first: 100) {
    nodes {
      id
      quantity
      attributes { key value }
      cost {
        amountPerQuantity { amount currencyCode }
        compareAtAmountPerQuantity { amount currencyCode }
        subtotalAmount { amount currencyCode }
        totalAmount { amount currencyCode }
      }
      discountAllocations { ${discountAllocationFields} }
      merchandise {
        ... on ProductVariant {
          id
          title
          sku
          availableForSale
          price { amount currencyCode }
          compareAtPrice { amount currencyCode }
          image { ${imageFields} }
          product { id title handle vendor productType }
          selectedOptions { name value }
        }
      }
    }
  }
}`

type RawDiscountAllocation = {
  discountedAmount: Money
  code?: string
  title?: string
}

type RawCart = {
  id: string
  checkoutUrl: string
  totalQuantity: number
  note?: string | null
  attributes?: LineAttribute[] | null
  buyerIdentity?: { countryCode?: string | null } | null
  discountCodes: DiscountCode[] | null
  discountAllocations: RawDiscountAllocation[] | null
  cost: {
    subtotalAmount: Money
    subtotalAmountEstimated?: boolean
    totalAmount: Money
    totalAmountEstimated?: boolean
    totalTaxAmount: Money | null
    totalTaxAmountEstimated?: boolean
  }
  lines: {
    nodes: {
      id: string
      quantity: number
      attributes?: LineAttribute[] | null
      cost?: {
        amountPerQuantity: Money
        compareAtAmountPerQuantity?: Money | null
        subtotalAmount: Money
        totalAmount: Money
      } | null
      discountAllocations?: RawDiscountAllocation[] | null
      merchandise: {
        id: string
        title: string
        sku?: string | null
        availableForSale?: boolean
        price: Money
        compareAtPrice?: Money | null
        image: Image | null
        selectedOptions?: SelectedOption[] | null
        product: {
          id?: string
          title: string
          handle: string
          vendor?: string
          productType?: string
        }
      } | null
    }[]
  }
}

function normalizeDiscounts(raw: RawDiscountAllocation[] | null | undefined): CartDiscount[] {
  const discounts: CartDiscount[] = []
  for (const entry of raw ?? []) {
    if (!entry.discountedAmount || Number(entry.discountedAmount.amount) <= 0) continue
    if (entry.code) {
      discounts.push({
        type: "code",
        code: entry.code,
        title: entry.code,
        amount: entry.discountedAmount,
      })
    } else {
      const label = entry.title ?? "Discount"
      discounts.push({
        type: "automatic",
        code: label,
        title: label,
        amount: entry.discountedAmount,
      })
    }
  }
  return discounts
}

function normalizeCart(raw: RawCart): Cart {
  const lines: CartLine[] = []
  for (const node of raw.lines.nodes) {
    if (!node.merchandise) continue
    const unitPrice = node.cost?.amountPerQuantity ?? node.merchandise.price
    const fallbackTotal: Money = {
      amount: (Number(unitPrice.amount) * node.quantity).toFixed(2),
      currencyCode: unitPrice.currencyCode,
    }
    lines.push({
      id: node.id,
      quantity: node.quantity,
      variantId: node.merchandise.id,
      sku: node.merchandise.sku ?? null,
      availableForSale: node.merchandise.availableForSale ?? true,
      productId: node.merchandise.product.id ?? "",
      title: node.merchandise.product.title,
      handle: node.merchandise.product.handle,
      vendor: node.merchandise.product.vendor ?? "",
      productType: node.merchandise.product.productType ?? "",
      variantTitle:
        node.merchandise.title === "Default Title" || node.merchandise.title === "Default"
          ? ""
          : node.merchandise.title,
      selectedOptions: node.merchandise.selectedOptions ?? [],
      image: node.merchandise.image,
      price: node.merchandise.price,
      compareAtPrice: node.merchandise.compareAtPrice ?? null,
      cost: {
        amountPerQuantity: unitPrice,
        compareAtAmountPerQuantity: node.cost?.compareAtAmountPerQuantity ?? node.merchandise.compareAtPrice ?? null,
        subtotalAmount: node.cost?.subtotalAmount ?? fallbackTotal,
        totalAmount: node.cost?.totalAmount ?? fallbackTotal,
      },
      discounts: normalizeDiscounts(node.discountAllocations),
      attributes: node.attributes ?? [],
      bundle: node.attributes?.find((entry) => entry.key === "_bundle")?.value ?? null,
      priceChangedFrom: null,
    })
  }
  return {
    id: raw.id,
    checkoutUrl: raw.checkoutUrl,
    totalQuantity: raw.totalQuantity,
    note: raw.note ?? null,
    attributes: raw.attributes ?? [],
    buyerIdentity: { countryCode: raw.buyerIdentity?.countryCode ?? null },
    subtotal: raw.cost.subtotalAmount,
    subtotalEstimated: Boolean(raw.cost.subtotalAmountEstimated),
    total: raw.cost.totalAmount,
    totalEstimated: Boolean(raw.cost.totalAmountEstimated),
    tax: raw.cost.totalTaxAmount ?? {
      amount: "0",
      currencyCode: raw.cost.totalAmount.currencyCode,
    },
    taxEstimated: Boolean(raw.cost.totalTaxAmountEstimated),
    discounts: normalizeDiscounts(raw.discountAllocations),
    discountCodes: raw.discountCodes ?? [],
    lines,
  }
}

let cart: Cart | null = null
let id: string | null = null
let storedKey = ""
let started = false
let status: Status = "idle"
let lastError: Error | undefined
const listeners = new Set<(cart: Cart | null, status: Status, error?: Error) => void>()
const announcers = new Set<(text: string) => void>()
const undoListeners = new Set<(line: RemovedLine | null) => void>()

let removed: RemovedLine | null = null
let undoTimer: ReturnType<typeof setTimeout> | undefined
const undoWindow = 8_000

function syncStorage() {
  if (storedKey === config.storageKey) return
  storedKey = config.storageKey
  try {
    id = globalThis.localStorage?.getItem(storedKey) ?? null
  } catch {
    id = null
  }
}

function saveId(next: string | null) {
  id = next
  try {
    if (next) globalThis.localStorage?.setItem(storedKey, next)
    else globalThis.localStorage?.removeItem(storedKey)
  } catch {
    // private mode: the cart still works for this page view
  }
}

function emit() {
  for (const listener of listeners) listener(cart, status, lastError)
}

function subscribeCart(listener: (cart: Cart | null, status: Status, error?: Error) => void) {
  listeners.add(listener)
  listener(cart, status, lastError)
  return () => {
    listeners.delete(listener)
  }
}

function announce(text: string) {
  for (const listener of announcers) listener(text)
}

function subscribeAnnouncements(listener: (text: string) => void) {
  announcers.add(listener)
  return () => {
    announcers.delete(listener)
  }
}

// ------------------------------------------------------------------- undo

function emitUndo() {
  for (const listener of undoListeners) listener(removed)
}

/** The line whose undo is on offer, now and whenever it changes. */
function subscribeUndo(listener: (line: RemovedLine | null) => void) {
  undoListeners.add(listener)
  listener(removed)
  return () => {
    undoListeners.delete(listener)
  }
}

function offerUndo(line: RemovedLine) {
  clearTimeout(undoTimer)
  removed = line
  undoTimer = setTimeout(() => {
    removed = null
    emitUndo()
  }, undoWindow)
  emitUndo()
}

/** Drops the snapshot: the window passed, or something else changed the cart. */
function clearUndo() {
  clearTimeout(undoTimer)
  if (!removed) return
  removed = null
  emitUndo()
}

// ------------------------------------------------------------ price memory

function pricesKey() {
  return `${config.storageKey}.prices`
}

function readPrices(): Record<string, string> {
  try {
    const raw = globalThis.localStorage?.getItem(pricesKey())
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function markPriceChanges(next: Cart) {
  const seen = readPrices()
  for (const line of next.lines) {
    const before = seen[line.id]
    line.priceChangedFrom = before && before !== line.price.amount ? before : null
  }
  return next
}

function writePrices(next: Cart) {
  const prices: Record<string, string> = {}
  for (const line of next.lines) prices[line.id] = line.price.amount
  try {
    globalThis.localStorage?.setItem(pricesKey(), JSON.stringify(prices))
  } catch {
    // private mode: prices are not remembered between visits
  }
}

function adopt(next: Cart) {
  cart = markPriceChanges(next)
  saveId(cart.id)
  status = "idle"
  lastError = undefined
  emit()
  writePrices(cart)
  return cart
}

// ----------------------------------------------------------- cross-tab sync

let storageBound = false

function startStorageSync() {
  if (storageBound || typeof window === "undefined") return
  storageBound = true
  window.addEventListener("storage", (event) => {
    if (event.key !== config.storageKey) return
    storedKey = ""
    void ensureCart()
  })
}

function fail(error: unknown): never {
  status = "error"
  lastError = error instanceof Error ? error : new Error(String(error))
  emit()
  throw lastError
}

function isMissingCart(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /not found|does not exist|invalid id/i.test(message)
}

function ensureCart() {
  started = true
  syncStorage()
  startStorageSync()
  if (!id) {
    if (cart) {
      cart = null
      status = "idle"
      lastError = undefined
      emit()
    }
    return Promise.resolve(null)
  }
  status = "loading"
  emit()
  return fetchCart(id)
    .then(adopt)
    .catch((error) => {
      if (isMissingCart(error)) {
        cart = null
        saveId(null)
        status = "idle"
        lastError = undefined
        emit()
        return null
      }
      return fail(error)
    })
}

async function fetchCart(cartId: string) {
  const data = await graphql<{ cart: RawCart | null }>(
    `query Cart($id: ID!, $country: CountryCode, $language: LanguageCode)
      @inContext(country: $country, language: $language) {
      cart(id: $id) { ...CartFields }
    } ${cartFields}`,
    { id: cartId, ...contextVars() },
  )
  if (!data.cart) throw new Error("Cart not found")
  return normalizeCart(data.cart)
}

const cartLineInputs = (lines: LineInput[]) =>
  lines.map((line) => ({
    merchandiseId: line.variantId,
    quantity: clampQuantity(line.quantity ?? 1),
    ...(line.attributes?.length ? { attributes: line.attributes } : {}),
  }))

async function createCart(input: LineInput[] = []) {
  const lines = cartLineInputs(input)
  const ctx = contextVars()
  const data = await graphql<{
    cartCreate: { cart: RawCart; userErrors: { message: string }[] }
  }>(
    `mutation CreateCart($lines: [CartLineInput!], $country: CountryCode, $language: LanguageCode)
      @inContext(country: $country, language: $language) {
      cartCreate(input: { lines: $lines, buyerIdentity: { countryCode: $country } }) {
        cart { ...CartFields }
        userErrors { message }
      }
    } ${cartFields}`,
    { lines, ...ctx },
  )
  const error = data.cartCreate.userErrors[0]
  if (error) throw new Error(error.message)
  return normalizeCart(data.cartCreate.cart)
}

/** Adds several lines in one request, so a bundle lands in the cart whole or not at all. */
async function addLines(input: LineInput[]) {
  syncStorage()
  if (!input.length) throw new Error("Nothing to add")
  clearUndo()
  status = "loading"
  emit()
  try {
    if (!id) return adopt(await createCart(input))
    const data = await graphql<{
      cartLinesAdd: { cart: RawCart; userErrors: { message: string }[] }
    }>(
      `mutation AddLines($cartId: ID!, $lines: [CartLineInput!]!, $country: CountryCode, $language: LanguageCode)
        @inContext(country: $country, language: $language) {
        cartLinesAdd(cartId: $cartId, lines: $lines) {
          cart { ...CartFields }
          userErrors { message }
        }
      } ${cartFields}`,
      { cartId: id, lines: cartLineInputs(input), ...contextVars() },
    )
    const error = data.cartLinesAdd.userErrors[0]
    if (error) throw new Error(error.message)
    return adopt(normalizeCart(data.cartLinesAdd.cart))
  } catch (error) {
    if (isMissingCart(error)) {
      cart = null
      saveId(null)
      return adopt(await createCart(input))
    }
    return fail(error)
  }
}

function addLine(variantId: string, quantity = 1, attributes?: LineAttribute[]) {
  return addLines([{ variantId, quantity, attributes }])
}

async function setLineQuantity(lineId: string, quantity: number) {
  syncStorage()
  if (!id) throw new Error("The cart has not started yet")
  const amount = clampQuantity(quantity)
  clearUndo()
  status = "loading"
  emit()
  try {
    const data = await graphql<{
      cartLinesUpdate: { cart: RawCart; userErrors: { message: string }[] }
    }>(
      `mutation UpdateLines($cartId: ID!, $lines: [CartLineUpdateInput!]!, $country: CountryCode, $language: LanguageCode)
        @inContext(country: $country, language: $language) {
        cartLinesUpdate(cartId: $cartId, lines: $lines) {
          cart { ...CartFields }
          userErrors { message }
        }
      } ${cartFields}`,
      { cartId: id, lines: [{ id: lineId, quantity: amount }], ...contextVars() },
    )
    const error = data.cartLinesUpdate.userErrors[0]
    if (error) throw new Error(error.message)
    return adopt(normalizeCart(data.cartLinesUpdate.cart))
  } catch (error) {
    return fail(error)
  }
}

async function removeLines(lineIds: string[]) {
  syncStorage()
  if (!id || !lineIds.length) return cart
  const single = lineIds.length === 1 ? cart?.lines.find((line) => line.id === lineIds[0]) : undefined
  const snapshot: RemovedLine | undefined = single && {
    variantId: single.variantId,
    quantity: single.quantity,
    attributes: single.attributes,
    title: single.title,
    variantTitle: single.variantTitle,
  }
  clearUndo()
  status = "loading"
  emit()
  try {
    const data = await graphql<{
      cartLinesRemove: { cart: RawCart; userErrors: { message: string }[] }
    }>(
      `mutation RemoveLines($cartId: ID!, $lineIds: [ID!]!, $country: CountryCode, $language: LanguageCode)
        @inContext(country: $country, language: $language) {
        cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
          cart { ...CartFields }
          userErrors { message }
        }
      } ${cartFields}`,
      { cartId: id, lineIds, ...contextVars() },
    )
    const error = data.cartLinesRemove.userErrors[0]
    if (error) throw new Error(error.message)
    const next = adopt(normalizeCart(data.cartLinesRemove.cart))
    if (snapshot) offerUndo(snapshot)
    return next
  } catch (error) {
    return fail(error)
  }
}

function removeLine(lineId: string) {
  return removeLines([lineId])
}

async function updateDiscountCodes(codes: string[]) {
  syncStorage()
  if (!id) throw new Error("The cart has not started yet")
  clearUndo()
  status = "loading"
  emit()
  try {
    const data = await graphql<{
      cartDiscountCodesUpdate: { cart: RawCart; userErrors: { message: string }[] }
    }>(
      `mutation UpdateDiscounts($cartId: ID!, $codes: [String!]!, $country: CountryCode, $language: LanguageCode)
        @inContext(country: $country, language: $language) {
        cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $codes) {
          cart { ...CartFields }
          userErrors { message }
        }
      } ${cartFields}`,
      { cartId: id, codes, ...contextVars() },
    )
    const error = data.cartDiscountCodesUpdate.userErrors[0]
    if (error) throw new Error(error.message)
    return adopt(normalizeCart(data.cartDiscountCodesUpdate.cart))
  } catch (error) {
    return fail(error)
  }
}

/** Adds a code to the ones already on the cart: the API takes the full list. */
async function applyDiscount(code: string) {
  const codes = (cart?.discountCodes ?? []).map((entry) => entry.code)
  const known = codes.some((entry) => entry.toUpperCase() === code.toUpperCase())
  if (!known) codes.push(code)
  return updateDiscountCodes(codes)
}

/** Removes a discount code from the cart. */
async function removeDiscount(code: string) {
  const codes = (cart?.discountCodes ?? [])
    .map((entry) => entry.code)
    .filter((entry) => entry.toUpperCase() !== code.toUpperCase())
  return updateDiscountCodes(codes)
}

/** Sets or clears the cart note (gift message, delivery instructions). */
async function updateCartNote(note: string) {
  syncStorage()
  if (!id) throw new Error("The cart has not started yet")
  status = "loading"
  emit()
  try {
    const data = await graphql<{
      cartNoteUpdate: { cart: RawCart; userErrors: { message: string }[] }
    }>(
      `mutation UpdateNote($cartId: ID!, $note: String!, $country: CountryCode, $language: LanguageCode)
        @inContext(country: $country, language: $language) {
        cartNoteUpdate(cartId: $cartId, note: $note) {
          cart { ...CartFields }
          userErrors { message }
        }
      } ${cartFields}`,
      { cartId: id, note, ...contextVars() },
    )
    const error = data.cartNoteUpdate.userErrors[0]
    if (error) throw new Error(error.message)
    return adopt(normalizeCart(data.cartNoteUpdate.cart))
  } catch (error) {
    return fail(error)
  }
}

/** Updates cart-level custom attributes. */
async function updateCartAttributes(attributes: LineAttribute[]) {
  syncStorage()
  if (!id) throw new Error("The cart has not started yet")
  status = "loading"
  emit()
  try {
    const data = await graphql<{
      cartAttributesUpdate: { cart: RawCart; userErrors: { message: string }[] }
    }>(
      `mutation UpdateAttributes($cartId: ID!, $attributes: [AttributeInput!]!, $country: CountryCode, $language: LanguageCode)
        @inContext(country: $country, language: $language) {
        cartAttributesUpdate(cartId: $cartId, attributes: $attributes) {
          cart { ...CartFields }
          userErrors { message }
        }
      } ${cartFields}`,
      { cartId: id, attributes, ...contextVars() },
    )
    const error = data.cartAttributesUpdate.userErrors[0]
    if (error) throw new Error(error.message)
    return adopt(normalizeCart(data.cartAttributesUpdate.cart))
  } catch (error) {
    return fail(error)
  }
}

/** Updates the cart's buyer identity (e.g., switching market/country currency). */
async function updateBuyerIdentity(buyerIdentity: { countryCode?: string; email?: string; phone?: string }) {
  syncStorage()
  if (!id) return null
  status = "loading"
  emit()
  try {
    const data = await graphql<{
      cartBuyerIdentityUpdate: { cart: RawCart; userErrors: { message: string }[] }
    }>(
      `mutation UpdateBuyerIdentity($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!, $country: CountryCode, $language: LanguageCode)
        @inContext(country: $country, language: $language) {
        cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
          cart { ...CartFields }
          userErrors { message }
        }
      } ${cartFields}`,
      { cartId: id, buyerIdentity, ...contextVars() },
    )
    const error = data.cartBuyerIdentityUpdate.userErrors[0]
    if (error) throw new Error(error.message)
    return adopt(normalizeCart(data.cartBuyerIdentityUpdate.cart))
  } catch (error) {
    return fail(error)
  }
}

/** The cart as it stands, for a primitive that starts after it loaded. */
const currentCart = () => ({ cart, status, error: lastError })

export {
  addLine,
  addLines,
  announce,
  applyDiscount,
  cart,
  clearUndo,
  configureShop,
  currentCart,
  ensureCart,
  fetchCollection,
  fetchCollections,
  fetchLocalization,
  fetchMenu,
  fetchPredictiveSearch,
  fetchProduct,
  fetchProductRecommendations,
  fetchShop,
  graphql,
  imageSrcSet,
  imageUrl,
  money,
  normalizeProductCard,
  productCardFields,
  quantityLimit,
  removeDiscount,
  removeLine,
  removeLines,
  setLineQuantity,
  shopConfig,
  shopPayUrl,
  status,
  subscribeAnnouncements,
  subscribeCart,
  subscribeConfig,
  subscribeUndo,
  updateBuyerIdentity,
  updateCartAttributes,
  updateCartNote,
  type Cart,
  type CartDiscount,
  type CartLine,
  type CartLineCost,
  type CollectionFilter,
  type CollectionFilterValue,
  type CollectionPage,
  type CollectionSummary,
  type DiscountCode,
  type Image,
  type ImageTransform,
  type LineAttribute,
  type LineInput,
  type Localization,
  type MarketCountry,
  type MarketCurrency,
  type MarketLanguage,
  type MenuItem,
  type Money,
  type PredictiveSearchQuery,
  type PredictiveSearchResult,
  type PriceRange,
  type Product,
  type ProductCardData,
  type RawProductCard,
  type RemovedLine,
  type RequestOptions,
  type Seo,
  type ShopConfig,
  type ShopInfo,
  type ShopMenu,
  type Variant,
}
