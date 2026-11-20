/**
 * Storefront data and cart state, with no UI. Everything here is plain
 * TypeScript: the elements in `elements.ts` are the only custom elements.
 *
 * One shop per page: the cart is a module singleton, configured by the
 * `<shop-cart>` element's attributes.
 */

import { imageSrcSet, imageUrl, type Image, type ImageTransform } from "./images"
import type { Money, ProductOption, Variant } from "./variants"

type Product = {
  title: string
  handle: string
  vendor: string
  descriptionHtml: string
  options: ProductOption[]
  featuredImage: Image
  images: Image[]
  variants: Variant[]
}

type LineAttribute = { key: string; value: string }

/** A line to add: the variant, how many, and attributes like a bundle's id. */
type LineInput = { variantId: string; quantity?: number; attributes?: LineAttribute[] }

type CartLine = {
  id: string
  quantity: number
  variantId: string
  title: string
  variantTitle: string
  image: Image | null
  price: Money
  attributes: LineAttribute[]
  /** The bundle a line was added with, from its `_bundle` attribute. */
  bundle: string | null
  /** What the line cost last time it was seen, when that differs from `price`. */
  priceChangedFrom: string | null
}

type DiscountCode = { code: string; applicable: boolean }

/** What one code took off: the cart reports codes and allocations separately. */
type CartDiscount = { code: string; amount: Money }

type Cart = {
  id: string
  checkoutUrl: string
  totalQuantity: number
  subtotal: Money
  total: Money
  tax: Money
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
  country: string
  language: string
  storageKey: string
  /** The most units a line may hold, from `<shop-cart max-quantity>`. */
  maxQuantity: number
  locale?: string
}

const config: ShopConfig = {
  endpoint: "https://mock.shop/api",
  country: "US",
  language: "en",
  storageKey: "shop.cart",
  maxQuantity: 10,
}

function configureShop(next: Partial<ShopConfig>) {
  const storageChanged =
    next.storageKey !== undefined && next.storageKey !== config.storageKey
  Object.assign(config, next)
  if (storageChanged) {
    storedKey = ""
    id = null
    // The keys arrive after the first read: look again under the new one.
    if (started) void ensureCart()
  }
}

/** The most units a line may hold. */
function quantityLimit() {
  return Math.max(1, Math.round(config.maxQuantity))
}

function clampQuantity(quantity: number) {
  const whole = Math.round(Number(quantity) || 1)
  return Math.min(quantityLimit(), Math.max(1, whole))
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


// ---------------------------------------------------------------- storefront

type GraphQLBody<T> = { data?: T; errors?: { message: string }[] }

async function graphql<T>(
  query: string,
  variables: Record<string, unknown> = {},
  endpoint = config.endpoint,
) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`Storefront returned HTTP ${response.status}`)
  const body = (await response.json()) as GraphQLBody<T>
  if (body.errors?.length) throw new Error(body.errors[0].message)
  if (!body.data) throw new Error("Storefront returned no data")
  return body.data
}

const productQuery = `query Product($handle: String!, $country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    product(handle: $handle) {
      title
      handle
      vendor
      descriptionHtml
      options { name values optionValues { name swatch { color } } }
      featuredImage { url altText width height }
      images(first: 20) { nodes { url altText width height } }
      variants(first: 50) {
        nodes {
          id
          title
          availableForSale
          selectedOptions { name value }
          price { amount currencyCode }
          compareAtPrice { amount currencyCode }
          image { url altText width height }
        }
      }
    }
  }`

type RawProduct = Product & {
  images: { nodes: Image[] }
  variants: { nodes: Variant[] }
}

/** One product by handle, from the configured store or the endpoint given. */
async function fetchProduct(handle: string, endpoint = config.endpoint) {
  const data = await graphql<{ product: RawProduct | null }>(
    productQuery,
    {
      handle,
      country: config.country.toUpperCase(),
      language: config.language.toUpperCase(),
    },
    endpoint,
  )
  if (!data.product) throw new Error(`No product with handle "${handle}"`)
  const raw = data.product
  return {
    ...raw,
    images: raw.images.nodes,
    variants: raw.variants.nodes,
  } satisfies Product
}

// ------------------------------------------------------------------ cart API

const cartFields = `fragment CartFields on Cart {
  id
  checkoutUrl
  totalQuantity
  discountCodes { code applicable }
  discountAllocations { discountedAmount { amount currencyCode } }
  cost {
    subtotalAmount { amount currencyCode }
    totalAmount { amount currencyCode }
    totalTaxAmount { amount currencyCode }
  }
  lines(first: 50) {
    nodes {
      id
      quantity
      attributes { key value }
      merchandise {
        ... on ProductVariant {
          id
          title
          price { amount currencyCode }
          image { url altText width height }
          product { title handle }
          selectedOptions { name value }
        }
      }
    }
  }
}`

type RawCart = {
  id: string
  checkoutUrl: string
  totalQuantity: number
  discountCodes: DiscountCode[] | null
  discountAllocations: { discountedAmount: Money }[] | null
  cost: {
    subtotalAmount: Money
    totalAmount: Money
    totalTaxAmount: Money | null
  }
  lines: {
    nodes: {
      id: string
      quantity: number
      attributes?: LineAttribute[] | null
      merchandise: {
        id: string
        title: string
        price: Money
        image: Image | null
        product: { title: string; handle: string }
      } | null
    }[]
  }
}

// The API does not say which allocation belongs to which code: pair them in order.
function pairDiscounts(raw: RawCart): CartDiscount[] {
  const codes = raw.discountCodes ?? []
  const allocations = raw.discountAllocations ?? []
  const discounts: CartDiscount[] = []
  for (const [index, entry] of codes.entries()) {
    const amount = allocations[index]?.discountedAmount
    if (amount && Number(amount.amount) > 0) discounts.push({ code: entry.code, amount })
  }
  return discounts
}

function normalizeCart(raw: RawCart): Cart {
  const lines: CartLine[] = []
  for (const node of raw.lines.nodes) {
    if (!node.merchandise) continue
    lines.push({
      id: node.id,
      quantity: node.quantity,
      variantId: node.merchandise.id,
      title: node.merchandise.product.title,
      variantTitle:
        node.merchandise.title === "Default Title" ? "" : node.merchandise.title,
      image: node.merchandise.image,
      price: node.merchandise.price,
      attributes: node.attributes ?? [],
      bundle: node.attributes?.find((entry) => entry.key === "_bundle")?.value ?? null,
      priceChangedFrom: null,
    })
  }
  return {
    id: raw.id,
    checkoutUrl: raw.checkoutUrl,
    totalQuantity: raw.totalQuantity,
    subtotal: raw.cost.subtotalAmount,
    total: raw.cost.totalAmount,
    tax: raw.cost.totalTaxAmount ?? {
      amount: "0",
      currencyCode: raw.cost.totalAmount.currencyCode,
    },
    discounts: pairDiscounts(raw),
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

function subscribeCart(
  listener: (cart: Cart | null, status: Status, error?: Error) => void,
) {
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
    // Another tab chose another cart, or dropped this one: read it again.
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
    `query Cart($id: ID!) { cart(id: $id) { ...CartFields } } ${cartFields}`,
    { id: cartId },
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
  const data = await graphql<{
    cartCreate: { cart: RawCart; userErrors: { message: string }[] }
  }>(
    `mutation CreateCart($lines: [CartLineInput!]) {
      cartCreate(input: { lines: $lines }) {
        cart { ...CartFields }
        userErrors { message }
      }
    } ${cartFields}`,
    { lines },
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
      `mutation AddLines($cartId: ID!, $lines: [CartLineInput!]!) {
        cartLinesAdd(cartId: $cartId, lines: $lines) {
          cart { ...CartFields }
          userErrors { message }
        }
      } ${cartFields}`,
      { cartId: id, lines: cartLineInputs(input) },
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
      `mutation UpdateLines($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
        cartLinesUpdate(cartId: $cartId, lines: $lines) {
          cart { ...CartFields }
          userErrors { message }
        }
      } ${cartFields}`,
      { cartId: id, lines: [{ id: lineId, quantity: amount }] },
    )
    const error = data.cartLinesUpdate.userErrors[0]
    if (error) throw new Error(error.message)
    return adopt(normalizeCart(data.cartLinesUpdate.cart))
  } catch (error) {
    return fail(error)
  }
}

async function removeLine(lineId: string) {
  syncStorage()
  const going = cart?.lines.find((line) => line.id === lineId)
  const snapshot: RemovedLine | undefined = going && {
    variantId: going.variantId,
    quantity: going.quantity,
    attributes: going.attributes,
    title: going.title,
    variantTitle: going.variantTitle,
  }
  clearUndo()
  if (!id) return cart
  status = "loading"
  emit()
  try {
    const data = await graphql<{
      cartLinesRemove: { cart: RawCart; userErrors: { message: string }[] }
    }>(
      `mutation RemoveLines($cartId: ID!, $lineIds: [ID!]!) {
        cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
          cart { ...CartFields }
          userErrors { message }
        }
      } ${cartFields}`,
      { cartId: id, lineIds: [lineId] },
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

/** Adds a code to the ones already on the cart: the API takes the full list. */
async function applyDiscount(code: string) {
  syncStorage()
  if (!id) throw new Error("The cart has not started yet")
  const codes = (cart?.discountCodes ?? []).map((entry) => entry.code)
  const known = codes.some((entry) => entry.toUpperCase() === code.toUpperCase())
  if (!known) codes.push(code)
  clearUndo()
  status = "loading"
  emit()
  try {
    const data = await graphql<{
      cartDiscountCodesUpdate: { cart: RawCart; userErrors: { message: string }[] }
    }>(
      `mutation ApplyDiscount($cartId: ID!, $codes: [String!]!) {
        cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $codes) {
          cart { ...CartFields }
          userErrors { message }
        }
      } ${cartFields}`,
      { cartId: id, codes },
    )
    const error = data.cartDiscountCodesUpdate.userErrors[0]
    if (error) throw new Error(error.message)
    return adopt(normalizeCart(data.cartDiscountCodesUpdate.cart))
  } catch (error) {
    return fail(error)
  }
}

/** The cart as it stands, for a primitive that starts after it loaded. */
const currentCart = () => ({ cart, status, error: lastError })

export {
  addLine,
  addLines,
  currentCart,
  announce,
  applyDiscount,
  cart,
  clearUndo,
  configureShop,
  ensureCart,
  fetchProduct,
  imageSrcSet,
  imageUrl,
  money,
  quantityLimit,
  removeLine,
  setLineQuantity,
  status,
  subscribeAnnouncements,
  subscribeCart,
  subscribeUndo,
  type Cart,
  type CartDiscount,
  type CartLine,
  type DiscountCode,
  type Image,
  type ImageTransform,
  type LineAttribute,
  type LineInput,
  type Money,
  type Product,
  type RemovedLine,
  type ShopConfig,
  type Variant,
}
