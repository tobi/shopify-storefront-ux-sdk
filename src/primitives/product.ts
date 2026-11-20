import { createChange, definePrimitive, dispatch, type ChangeDetails } from "@ui-sdk/core"
import type { LineAttribute, LineInput, Product } from "../shop"
import type { Variant } from "../variants"
import type { VariantChangeReason } from "./variant-selector"

/** What a buy box or bundle hands the cart. */
type CartApi = { add: (lines: LineInput[], details?: { event?: Event }) => Promise<unknown> }

/** The variant selector a product reads its variant from. */
type SelectorApi = {
  getValue: () => string | null
  getVariant: () => Variant | null
  setValue: (id: string, details?: { reason?: VariantChangeReason; event?: Event }) => boolean
  setOption: (name: string, value: string, details?: { reason?: VariantChangeReason; event?: Event }) => boolean
}

type AddDetails = ChangeDetails<"add-press" | "imperative">

type ShopProductOptions = {
  /** The product, from `fetchProduct`. A property; the parts inside render from it. */
  product?: Product | null
  /** Loads the product by handle from the cart's store, when `product` isn't set. */
  handle?: string
  /** How many. Pass it to control the quantity. */
  quantity?: number
  defaultQuantity?: number
  onQuantityChange?: (quantity: number, details: ChangeDetails<"press" | "imperative">) => void
  /** Runs before the lines go to the cart. `details.cancel()` keeps them out. */
  onAdd?: (lines: LineInput[], details: AddDetails) => void
  /** Runs once the cart has the lines, like `openchangecomplete` after an open. */
  onAddComplete?: (lines: LineInput[], details: AddDetails) => void
}

type State = {
  product: Product | null
  quantity: number
  /** The selector's variant, mirrored for the parts: the selector owns it. */
  variant: Variant | null
  pending: boolean
  error: string | null
}

type ShopProductState = {
  quantity: number
  available: boolean
  pending: boolean
  variant: string | null
}

/**
 * A buy box: one product, its variant (from the `<shop-variant-selector>`
 * inside), a quantity, and `add`. The high-level piece that composes the
 * low-level ones: price, media and selector each render from it, and none of
 * them keeps a variant of its own.
 */
const shopProduct = definePrimitive({
  name: "shop-product",
  options: {
    product: "value",
    handle: "string",
    quantity: "number",
    defaultQuantity: "number",
    onQuantityChange: "callback",
    onAdd: "callback",
    onAddComplete: "callback",
  },
  controlled: ["quantity"],
  state: (options: ShopProductOptions): State => ({
    product: options.product ?? null,
    quantity: options.quantity ?? options.defaultQuantity ?? 1,
    variant: null,
    pending: false,
    error: null,
  }),
  sync: (options: ShopProductOptions) => ({
    ...(options.product === undefined ? {} : { product: options.product }),
    ...(options.quantity === undefined ? {} : { quantity: options.quantity }),
  }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    let selector: SelectorApi | null = null
    let cart: CartApi | null = null
    let limit = 10

    const lines = (): LineInput[] => {
      const variant = store.get().variant
      return variant ? [{ variantId: variant.id, quantity: store.get().quantity }] : []
    }

    return {
      getVariant: () => store.get().variant,
      /** Chooses the variant through the selector, so its event and cancel apply. */
      setVariant: (variantId: string, details: { reason?: VariantChangeReason; event?: Event } = {}) =>
        selector?.setValue(variantId, details) ?? false,
      setOption: (name: string, value: string, details: { reason?: VariantChangeReason; event?: Event } = {}) =>
        selector?.setOption(name, value, details) ?? false,
      setQuantity: (value: number, details: { event?: Event } = {}) =>
        change("quantity", Math.min(limit, Math.max(1, Math.round(Number(value) || 1))), {
          reason: details.event ? "press" : "imperative",
          event: details.event,
        }),
      /** Adds the chosen variant at the chosen quantity. Rejects when it can't. */
      add: async (details: { event?: Event } = {}) => {
        const { variant, pending } = store.get()
        if (pending) return false
        if (!variant) throw new Error("Choose a variant first")
        if (!variant.availableForSale) throw new Error(`${variant.title} is sold out`)
        if (!cart) throw new Error("Put shop-product inside a shop-cart")
        const input = lines()
        const reason = details.event ? "add-press" : "imperative"
        if (dispatch(context, "onAdd", input, { reason, event: details.event })) return false
        store.set({ pending: true, error: null })
        try {
          await cart.add(input, details)
          dispatch(context, "onAddComplete", input, { reason: details.event ? "add-press" : "imperative", event: details.event })
          return true
        } catch (error) {
          store.set({ error: (error as Error).message })
          throw error
        } finally {
          store.set({ pending: false })
        }
      },
      internal: {
        /** The web layer connects the selector and cart it finds around the product. */
        connect: (next: { selector?: SelectorApi | null; cart?: CartApi | null; limit?: number }) => {
          if (next.selector !== undefined) selector = next.selector
          if (next.cart !== undefined) cart = next.cart
          if (next.limit) limit = next.limit
        },
        follow: (variant: Variant | null) => {
          if (store.get().variant !== variant) store.set({ variant })
        },
        lines,
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, ShopProductState>({
      state: (state) => ({
        quantity: state.quantity,
        available: Boolean(state.variant?.availableForSale),
        pending: state.pending,
        variant: state.variant?.id ?? null,
      }),
      attrs: (state) => ({
        "data-pending": state.pending ? "" : undefined,
        "data-sold-out": state.variant && !state.variant.availableForSale ? "" : undefined,
        "data-loading": state.product ? undefined : "",
        "aria-busy": state.product ? undefined : "true",
      }),
    }),
  }),
  // A buy box with no product yet has nothing to choose or add.
  agent: { actions: ["setVariant", "setOption", "setQuantity", "add"], shown: (state) => Boolean(state.product) },
})

// ------------------------------------------------------------------ bundle

type ShopBundleOptions = {
  /**
   * What the set is called, written on each line as its `_bundle`
   * attribute. Not `title`: that attribute is the browser's tooltip.
   */
  name?: string
  quantity?: number
  defaultQuantity?: number
  onQuantityChange?: (quantity: number, details: ChangeDetails<"press" | "imperative">) => void
  onAdd?: (lines: LineInput[], details: AddDetails) => void
  onAddComplete?: (lines: LineInput[], details: AddDetails) => void
}

type BundleState = {
  title: string
  quantity: number
  /** Each item's variant, by the item's key, mirrored from its selector. */
  items: Record<string, Variant | null>
  pending: boolean
  error: string | null
}

type ShopBundleState = {
  quantity: number
  /** Whether every item has a variant for sale. */
  available: boolean
  pending: boolean
  /** How many items still need a choice that can be bought. */
  missing: number
}

const bundleReady = (state: BundleState) => {
  const variants = Object.values(state.items)
  return variants.length > 0 && variants.every((variant) => variant?.availableForSale)
}

/**
 * Several products bought together, each with its own variant. Each
 * `<shop-bundle-item value="…">` holds a `<shop-variant-selector>`; the bundle
 * adds one line per item in one request, tagged with the same `_bundle`
 * attribute, so the cart shows them as a set and they arrive whole or not at all.
 */
const shopBundle = definePrimitive({
  name: "shop-bundle",
  options: {
    name: "string",
    quantity: "number",
    defaultQuantity: "number",
    onQuantityChange: "callback",
    onAdd: "callback",
    onAddComplete: "callback",
  },
  controlled: ["quantity"],
  state: (options: ShopBundleOptions): BundleState => ({
    title: options.name ?? "Bundle",
    quantity: options.quantity ?? options.defaultQuantity ?? 1,
    items: {},
    pending: false,
    error: null,
  }),
  sync: (options: ShopBundleOptions) => ({
    title: options.name ?? "Bundle",
    ...(options.quantity === undefined ? {} : { quantity: options.quantity }),
  }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const selectors = new Map<string, SelectorApi>()
    let cart: CartApi | null = null
    let limit = 10

    const lines = (): LineInput[] => {
      const { items, quantity, title } = store.get()
      const attributes: LineAttribute[] = [{ key: "_bundle", value: title }]
      return Object.values(items)
        .filter((variant): variant is Variant => Boolean(variant))
        .map((variant) => ({ variantId: variant.id, quantity, attributes }))
    }

    return {
      getItems: () => store.get().items,
      /** Chooses one item's variant, by the item's key. */
      setVariant: (item: string, variantId: string, details: { reason?: VariantChangeReason; event?: Event } = {}) =>
        selectors.get(item)?.setValue(variantId, details) ?? false,
      setOption: (item: string, name: string, value: string, details: { reason?: VariantChangeReason; event?: Event } = {}) =>
        selectors.get(item)?.setOption(name, value, details) ?? false,
      setQuantity: (value: number, details: { event?: Event } = {}) =>
        change("quantity", Math.min(limit, Math.max(1, Math.round(Number(value) || 1))), {
          reason: details.event ? "press" : "imperative",
          event: details.event,
        }),
      add: async (details: { event?: Event } = {}) => {
        const state = store.get()
        if (state.pending) return false
        if (!bundleReady(state)) throw new Error("Choose an available option for every item")
        if (!cart) throw new Error("Put shop-bundle inside a shop-cart")
        const input = lines()
        if (dispatch(context, "onAdd", input, { reason: details.event ? "add-press" : "imperative", event: details.event })) {
          return false
        }
        store.set({ pending: true, error: null })
        try {
          await cart.add(input, details)
          dispatch(context, "onAddComplete", input, { reason: details.event ? "add-press" : "imperative", event: details.event })
          return true
        } catch (error) {
          store.set({ error: (error as Error).message })
          throw error
        } finally {
          store.set({ pending: false })
        }
      },
      internal: {
        connect: (next: { cart?: CartApi | null; limit?: number }) => {
          if (next.cart !== undefined) cart = next.cart
          if (next.limit) limit = next.limit
        },
        register: (item: string, selector: SelectorApi) => {
          selectors.set(item, selector)
          return () => {
            selectors.delete(item)
            const { [item]: _gone, ...rest } = store.get().items
            store.set({ items: rest })
          }
        },
        follow: (item: string, variant: Variant | null) => {
          if (store.get().items[item] === variant) return
          store.set({ items: { ...store.get().items, [item]: variant } })
        },
        lines,
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, ShopBundleState>({
      role: "group",
      state: (state) => ({
        quantity: state.quantity,
        available: bundleReady(state),
        pending: state.pending,
        missing: Object.values(state.items).filter((variant) => !variant?.availableForSale).length,
      }),
      attrs: (state) => ({
        "data-pending": state.pending ? "" : undefined,
        "data-incomplete": bundleReady(state) ? undefined : "",
      }),
    }),
    item: slot<{ value: string }, { available: boolean }>({
      props: { value: "string" },
      state: (state, part) => ({ available: Boolean(state.items[part.props.value]?.availableForSale) }),
      attrs: (state, part) => ({
        "data-sold-out": state.items[part.props.value]?.availableForSale === false ? "" : undefined,
      }),
    }),
  }),
  agent: { actions: ["setVariant", "setOption", "setQuantity", "add"] },
})

export {
  shopBundle,
  shopProduct,
  type CartApi,
  type SelectorApi,
  type ShopBundleOptions,
  type ShopBundleState,
  type ShopProductOptions,
  type ShopProductState,
}
