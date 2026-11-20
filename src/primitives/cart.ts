import { definePrimitive, dispatch, type ChangeDetails } from "@ui-sdk/core"
import {
  addLines,
  announce,
  applyDiscount,
  clearUndo,
  configureShop,
  currentCart,
  ensureCart,
  money,
  quantityLimit,
  removeDiscount,
  removeLine,
  setLineQuantity,
  subscribeAnnouncements,
  subscribeCart,
  subscribeUndo,
  updateCartNote,
  type Cart,
  type LineInput,
  type Money,
  type RemovedLine,
  type ShopConfig,
} from "../shop"

type CartStatus = "idle" | "loading" | "error"
type DiscountStatus = "idle" | "pending" | "applied" | "rejected" | "error"

/** Why a line is changing: a press in the cart, typing, the undo, or an `api` call. */
type LineReason = "press" | "input" | "undo-press" | "imperative"

type ShopCartOptions = {
  /** The Storefront API endpoint. Defaults to `https://mock.shop/api`. */
  endpoint?: string
  /** Optional public Storefront API access token (`X-Shopify-Storefront-Access-Token`). */
  token?: string
  /** Where the cart id is kept. Defaults to `shop.cart`. */
  storageKey?: string
  /** The market's country code, for `@inContext`. */
  country?: string
  language?: string
  /** The most units a line may hold. Defaults to 10. */
  maxQuantity?: number
  /** Runs each time the Storefront API returns the cart. Not cancelable: the server decided. */
  onCartChange?: (cart: Cart | null, details: ChangeDetails<"server">) => void
  /** Runs before lines are added. `details.cancel()` keeps them out of the cart. */
  onLineAdd?: (lines: LineInput[], details: ChangeDetails<LineReason>) => void
  /** Runs before a line's quantity changes. */
  onLineQuantityChange?: (
    change: { line: string; quantity: number },
    details: ChangeDetails<LineReason>,
  ) => void
  /** Runs before a line is removed, including by a quantity of zero. */
  onLineRemove?: (line: string, details: ChangeDetails<LineReason>) => void
  /** Runs before a discount code is sent. */
  onDiscountApply?: (code: string, details: ChangeDetails<"submit" | "imperative">) => void
  /** Runs before a discount code is removed. */
  onDiscountRemove?: (code: string, details: ChangeDetails<"press" | "imperative">) => void
  /** Runs before a cart note is saved. */
  onNoteChange?: (note: string, details: ChangeDetails<"input" | "imperative">) => void
}

type State = {
  cart: Cart | null
  status: CartStatus
  error: string | null
  /** The line whose undo is on offer. */
  removed: RemovedLine | null
  /** The last thing said politely, for the status part. */
  message: string
  discount: { status: DiscountStatus; message: string }
}

type ShopCartState = {
  count: number
  empty: boolean
  status: CartStatus
}

const configOf = (options: ShopCartOptions): Partial<ShopConfig> => {
  const next: Partial<ShopConfig> = {}
  if (options.endpoint) next.endpoint = options.endpoint
  if (options.token !== undefined) next.token = options.token
  if (options.storageKey) next.storageKey = options.storageKey
  if (options.country) next.country = options.country
  if (options.language) next.language = options.language
  if (options.maxQuantity && options.maxQuantity >= 1) next.maxQuantity = options.maxQuantity
  return next
}

const countOf = (state: State) => state.cart?.totalQuantity ?? 0
/** Unknown while the first load is on its way: neither empty nor full. */
const isEmpty = (state: State) => !(state.status === "loading" && !state.cart) && !state.cart?.lines.length

const cartState = (state: State): ShopCartState => ({
  count: countOf(state),
  empty: isEmpty(state),
  status: state.status,
})

/**
 * The cart: its lines, totals, discount codes and checkout link, from the
 * Storefront API. One instance per page owns the state; every part inside
 * renders from it, so the drawer and a cart page can't disagree. Mutations go
 * through `api` for a person and an agent alike, and each fires a cancelable
 * event first.
 *
 * Parts: `count`, `lines`, `undo` and `undo-trigger`, `empty`, `summary`,
 * `total`, `shipping`, `discount`, `checkout`, `status`.
 */
const shopCart = definePrimitive({
  name: "shop-cart",
  options: {
    endpoint: "string",
    token: "string",
    storageKey: "string",
    country: "string",
    language: "string",
    maxQuantity: "number",
    onCartChange: "callback",
    onLineAdd: "callback",
    onLineQuantityChange: "callback",
    onLineRemove: "callback",
    onDiscountApply: "callback",
    onDiscountRemove: "callback",
    onNoteChange: "callback",
  },
  // The server owns the cart: nothing here is a value the page controls.
  controlled: [],
  state: (options: ShopCartOptions): State => {
    configureShop(configOf(options))
    const known = currentCart()
    return {
      cart: known.cart,
      status: known.status,
      error: known.error?.message ?? null,
      removed: null,
      message: "",
      discount: { status: "idle", message: "" },
    }
  },
  api: (context) => {
    const { store, options } = context
    let lastConfig = configOf(options())
    context.onOptions((next) => {
      const incoming = configOf(next)
      const changed: Partial<ShopConfig> = {}
      let hasChange = false
      for (const key of Object.keys(incoming) as (keyof ShopConfig)[]) {
        if (incoming[key] !== lastConfig[key]) {
          ;(changed as Record<string, unknown>)[key] = incoming[key]
          hasChange = true
        }
      }
      lastConfig = incoming
      if (hasChange) configureShop(changed)
    })

    let first = true
    context.onDestroy(
      subscribeCart((cart, status, error) => {
        const changed = cart !== store.get().cart
        store.set({ cart, status, error: error?.message ?? null })
        if (changed && !first) dispatch(context, "onCartChange", cart, { reason: "server" })
        first = false
      }),
    )
    context.onDestroy(
      subscribeUndo((removed) => {
        const had = store.get().removed
        store.set({ removed })
        if (removed && removed !== had) {
          announce(`Removed from bag: ${removed.title}${removed.variantTitle ? `, ${removed.variantTitle}` : ""}. Undo is available.`)
        }
      }),
    )
    context.onDestroy(subscribeAnnouncements((message) => store.set({ message })))
    void ensureCart().catch(() => {})

    const say = (message: string) => announce(message)
    const lineName = (id: string) => {
      const line = store.get().cart?.lines.find((entry) => entry.id === id)
      return line ? `${line.title}${line.variantTitle ? `, ${line.variantTitle}` : ""}` : "the item"
    }

    const remove = async (line: string, details: { reason?: LineReason; event?: Event } = {}) => {
      const reason = details.reason ?? (details.event ? "press" : "imperative")
      if (dispatch(context, "onLineRemove", line, { reason, event: details.event })) return false
      try {
        await removeLine(line)
        return true
      } catch (error) {
        say(`Could not remove the item. ${(error as Error).message}`)
        throw error
      }
    }

    const api = {
      getCart: () => store.get().cart,
      getCount: () => countOf(store.get()),
      /**
       * Adds lines, like `add([{ variantId, quantity }])`, or one variant, like
       * `add(variantId, 2)`. Resolves with the cart.
       */
      add: async (
        input: string | LineInput[],
        quantityOrDetails?: number | { reason?: LineReason; event?: Event },
        maybeDetails: { reason?: LineReason; event?: Event } = {},
      ) => {
        const lines =
          typeof input === "string"
            ? [{ variantId: input, quantity: typeof quantityOrDetails === "number" ? quantityOrDetails : 1 }]
            : input
        const details = typeof quantityOrDetails === "object" ? quantityOrDetails : maybeDetails
        const reason = details.reason ?? (details.event ? "press" : "imperative")
        if (dispatch(context, "onLineAdd", lines, { reason, event: details.event })) return null
        return addLines(lines)
      },
      /** Sets a line's quantity, clamped to `max-quantity`. Zero removes it. */
      setQuantity: async (
        line: string,
        quantity: number,
        details: { reason?: LineReason; event?: Event } = {},
      ) => {
        const amount = Math.round(Number(quantity))
        if (!Number.isFinite(amount)) return false
        if (amount <= 0) return remove(line, details)
        const reason = details.reason ?? (details.event ? "press" : "imperative")
        const value = { line, quantity: Math.min(quantityLimit(), amount) }
        if (dispatch(context, "onLineQuantityChange", value, { reason, event: details.event })) return false
        try {
          await setLineQuantity(line, value.quantity)
          say(`Quantity ${value.quantity}, ${lineName(line)}.`)
          return true
        } catch (error) {
          say(`Could not update the bag. ${(error as Error).message}`)
          throw error
        }
      },
      remove,
      /** Puts back the line removed last, while its undo is on offer. */
      restore: async (details: { event?: Event } = {}) => {
        const line = store.get().removed
        if (!line) return false
        const lines = [{ variantId: line.variantId, quantity: line.quantity, attributes: line.attributes }]
        if (dispatch(context, "onLineAdd", lines, { reason: "undo-press", event: details.event })) return false
        clearUndo()
        try {
          await addLines(lines)
          say(`Restored ${line.title}${line.variantTitle ? `, ${line.variantTitle}` : ""}.`)
          return true
        } catch (error) {
          say(`Could not restore the item. ${(error as Error).message}`)
          throw error
        }
      },
      /** Adds a code to those on the cart. Resolves with whether the store accepted it. */
      applyDiscount: async (code: string, details: { event?: Event } = {}) => {
        const trimmed = code.trim()
        if (!trimmed || store.get().discount.status === "pending") return false
        const reason = details.event ? "submit" : "imperative"
        if (dispatch(context, "onDiscountApply", trimmed, { reason, event: details.event })) return false
        store.set({ discount: { status: "pending", message: `Applying ${trimmed}…` } })
        try {
          const next = await applyDiscount(trimmed)
          const entry = next.discountCodes.find((item) => item.code.toUpperCase() === trimmed.toUpperCase())
          const accepted = !entry || entry.applicable
          store.set({
            discount: accepted
              ? { status: "applied", message: `Discount ${trimmed} applied.` }
              : { status: "rejected", message: `"${trimmed}" is not valid for this bag.` },
          })
          return accepted
        } catch (error) {
          store.set({ discount: { status: "error", message: (error as Error).message } })
          return false
        }
      },
      /** Removes a discount code from the cart. */
      removeDiscount: async (code: string, details: { event?: Event } = {}) => {
        const trimmed = code.trim()
        if (!trimmed) return false
        const reason = details.event ? "press" : "imperative"
        if (dispatch(context, "onDiscountRemove", trimmed, { reason, event: details.event })) return false
        store.set({ discount: { status: "pending", message: `Removing ${trimmed}…` } })
        try {
          await removeDiscount(trimmed)
          store.set({ discount: { status: "idle", message: `Removed discount ${trimmed}.` } })
          say(`Removed discount ${trimmed}.`)
          return true
        } catch (error) {
          store.set({ discount: { status: "error", message: (error as Error).message } })
          return false
        }
      },
      /** Saves a note on the cart (gift message, delivery instructions). */
      setNote: async (note: string, details: { event?: Event } = {}) => {
        const reason = details.event ? "input" : "imperative"
        if (dispatch(context, "onNoteChange", note, { reason, event: details.event })) return false
        try {
          await updateCartNote(note)
          say(note.trim() ? "Order note saved." : "Order note cleared.")
          return true
        } catch (error) {
          say(`Could not save note. ${(error as Error).message}`)
          throw error
        }
      },
      refresh: () => ensureCart(),
      internal: { limit: () => quantityLimit(), options },
    }
    return api
  },
  slots: (slot) => ({
    root: slot<{}, ShopCartState>({
      state: cartState,
      attrs: (state) => ({
        "data-status": state.status,
        "data-empty": isEmpty(state) ? "" : undefined,
        "aria-busy": state.status === "loading" ? "true" : undefined,
      }),
    }),
    count: slot<{}, ShopCartState>({
      state: cartState,
      attrs: (state) => ({
        "data-count": String(countOf(state)),
        "data-empty": countOf(state) ? undefined : "",
      }),
    }),
    lines: slot<{}, ShopCartState>({
      state: cartState,
      attrs: (state) => ({
        "data-empty": isEmpty(state) ? "" : undefined,
        "aria-busy": state.status === "loading" ? "true" : undefined,
      }),
    }),
    undo: slot<{}, { line: string }>({
      state: (state) => ({ line: state.removed?.title ?? "" }),
      attrs: (state) => ({ hidden: state.removed ? undefined : "" }),
    }),
    "undo-trigger": slot({
      role: "button",
      focus: "native",
      press: ({ api }, event) => void api.restore({ event }).catch(() => {}),
    }),
    empty: slot<{}, ShopCartState>({
      state: cartState,
      attrs: (state) => ({
        hidden: isEmpty(state) ? undefined : "",
        "data-empty": isEmpty(state) ? "" : undefined,
      }),
    }),
    summary: slot<{}, ShopCartState>({
      state: cartState,
      attrs: (state) => ({ "data-empty": isEmpty(state) ? "" : undefined }),
    }),
    total: slot<{}, ShopCartState>({
      state: cartState,
      attrs: (state) => ({ "data-empty": isEmpty(state) ? "" : undefined }),
    }),
    shipping: slot<
      { threshold: number },
      { progress: number; unlocked: boolean; remaining: Money | null; remainingText: string }
    >({
      props: { threshold: "number" },
      state: (state, part) => {
        const threshold = Math.max(0, part.props.threshold || 0)
        const subtotal = Number(state.cart?.subtotal.amount ?? 0)
        const currencyCode = state.cart?.subtotal.currencyCode ?? "USD"
        const left = Math.max(0, Math.round((threshold - subtotal) * 100) / 100)
        const remaining = left > 0 ? { amount: left.toFixed(2), currencyCode } : null
        return {
          progress: threshold > 0 ? Math.min(1, Math.max(0, subtotal / threshold)) : 1,
          unlocked: subtotal >= threshold,
          remaining,
          remainingText: remaining ? money(remaining) : "",
        }
      },
      attrs: (state, part) => {
        const threshold = Math.max(0, part.props.threshold || 0)
        const subtotal = Number(state.cart?.subtotal.amount ?? 0)
        const progress = threshold > 0 ? Math.min(1, Math.max(0, subtotal / threshold)) : 1
        return {
          hidden: state.cart && state.cart.lines.length > 0 ? undefined : "",
          "data-unlocked": subtotal >= threshold ? "" : undefined,
          style: `--shop-shipping-progress: ${Number(progress.toFixed(3))}`,
        }
      },
    }),
    discount: slot<{}, { status: DiscountStatus; message: string }>({
      state: (state) => state.discount,
      attrs: (state) => ({
        "data-busy": state.discount.status === "pending" ? "" : undefined,
        "data-applied": state.discount.status === "applied" ? "" : undefined,
        "data-error": state.discount.status === "error" || state.discount.status === "rejected" ? "" : undefined,
      }),
      on: {
        submit: (event, { api }) => {
          const form = event.target as HTMLFormElement
          event.preventDefault()
          const code = String(new FormData(form).get("code") ?? "")
          void api.applyDiscount(code, { event }).then((accepted) => {
            if (accepted) form.reset()
          })
        },
      },
    }),
    checkout: slot({
      attrs: (state) => {
        const ready = Boolean(state.cart?.lines.length)
        return {
          href: state.cart?.checkoutUrl ?? "#",
          "aria-disabled": ready ? undefined : "true",
          tabindex: ready ? undefined : "-1",
        }
      },
    }),
    note: slot<{}, { note: string }>({
      state: (state) => ({ note: state.cart?.note ?? "" }),
      attrs: (state) => ({ hidden: isEmpty(state) ? "" : undefined }),
    }),
    status: slot<{}, { message: string }>({
      role: "status",
      state: (state) => ({ message: state.message }),
      attrs: () => ({ "aria-live": "polite", "aria-atomic": "true" }),
    }),
  }),
  agent: { actions: ["add", "setQuantity", "remove", "restore", "applyDiscount", "removeDiscount", "setNote"] },
})

export {
  shopCart,
  type CartStatus,
  type DiscountStatus,
  type LineReason,
  type ShopCartOptions,
  type ShopCartState,
}
