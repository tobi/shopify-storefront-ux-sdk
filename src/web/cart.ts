import "@ui-sdk/web/button"
import "@ui-sdk/web/number-input"
import { createParts, wrappedButton } from "@ui-sdk/web"
import { imageAttrs } from "../images"
import { shopCart } from "../primitives/cart"
import { announce, money, type Cart, type CartLine } from "../shop"
import { cloneEach, setText } from "./util"

type Field = HTMLElement & { value: number | null }
type CartInstanceApi = {
  setQuantity: (line: string, quantity: number, details?: { reason?: "press" | "input"; event?: Event }) => Promise<unknown>
  remove: (line: string, details?: { reason?: "press" | "input"; event?: Event }) => Promise<unknown>
  removeDiscount: (code: string, details?: { event?: Event }) => Promise<unknown>
  setNote: (note: string, details?: { event?: Event }) => Promise<unknown>
}

const lineName = (line: { title: string; variantTitle: string }) =>
  `${line.title}${line.variantTitle ? `, ${line.variantTitle}` : ""}`

const items = (count: number) => `${count} ${count === 1 ? "item" : "items"}`

/** Per lines element: what it last rendered, and the listeners on its rows. */
const rendered = new WeakMap<HTMLElement, { signature: string; off: (() => void)[] }>()

/**
 * The lines, from the `<template>` inside `<shop-cart-lines>`. Each row is a
 * copy of the author's markup, filled in. Its stepper's floor is 0, so the
 * last unit's decrement is a bin, and a bin, a typed 0 and one fewer all take
 * the same path: a quantity of zero removes the line.
 */
function renderLines(host: HTMLElement, cart: Cart | null, api: CartInstanceApi, limit: number, empty: boolean) {
  const list = host.querySelector<HTMLElement>("[data-shop-lines]")
  const emptyText = host.querySelector<HTMLElement>("[data-shop-empty]")
  if (emptyText) {
    setText(emptyText, host.getAttribute("empty-message") ?? "Your bag is empty.")
    emptyText.hidden = !empty
  }
  if (!list) return
  const lines = cart?.lines ?? []
  const signature = JSON.stringify([
    limit,
    lines.map((line) => [
      line.id,
      line.quantity,
      line.cost.totalAmount.amount,
      line.cost.totalAmount.currencyCode,
      line.priceChangedFrom,
      line.image?.url,
      line.bundle,
    ]),
  ])
  const memo = rendered.get(host) ?? { signature: "", off: [] }
  rendered.set(host, memo)
  if (memo.signature === signature) return
  memo.signature = signature

  // A re-rendered row takes focus with it: put it back on the same control.
  const active = document.activeElement as HTMLElement | null
  const focusedLine = active?.closest("[data-line-id]")?.getAttribute("data-line-id") ?? null
  const focusedControl = active?.getAttribute("data-step") ?? (active?.tagName === "INPUT" ? "input" : null)
  const hadFocus = Boolean(active && list.contains(active))

  for (const dispose of memo.off.splice(0)) dispose()
  const hrefPattern = host.getAttribute("product-href") ?? "#/products/{handle}"
  const rows = cloneEach(host, lines, (row, line) => fillLine(row, line, limit, hrefPattern))
  list.replaceChildren(...rows)

  rows.forEach((row, index) => {
    const line = lines[index]
    const field = row.querySelector<Field>("ui-number-input")
    if (!field) return
    field.value = line.quantity
    let removing = false
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ value: number | null; event?: Event }>).detail
      if (detail?.value !== 0 || removing) return
      removing = true
      void api.remove(line.id, { reason: "press", event: detail.event }).catch(() => (removing = false))
    }
    const onCommit = (event: Event) => {
      const detail = (event as CustomEvent<{ value: number | null; event?: Event }>).detail
      const value = detail?.value ?? field.value
      if (value == null || value === 0 || value === line.quantity) return
      void api.setQuantity(line.id, value, { reason: "input", event: detail?.event }).catch(() => {})
    }
    field.addEventListener("valuechange", onChange)
    field.addEventListener("valuecommit", onCommit)
    memo.off.push(() => {
      field.removeEventListener("valuechange", onChange)
      field.removeEventListener("valuecommit", onCommit)
    })
  })

  if (!hadFocus && !focusedLine) return
  const row = focusedLine ? list.querySelector<HTMLElement>(`[data-line-id="${CSS.escape(focusedLine)}"]`) : null
  const target =
    (focusedControl === "dec" || focusedControl === "inc"
      ? row?.querySelector<HTMLElement>(`[data-step="${focusedControl}"]`)
      : focusedControl === "input"
        ? row?.querySelector<HTMLElement>("ui-number-input-control input")
        : null) ??
    list.querySelector<HTMLElement>('[data-step="dec"]') ??
    document.querySelector<HTMLElement>("[data-shop-close]") ??
    document.querySelector<HTMLElement>("[data-shop-checkout]")
  if (target && target !== document.activeElement) target.focus()
}

function fillLine(row: HTMLElement, line: CartLine, limit: number, hrefPattern: string) {
  const lastOne = line.quantity === 1
  row.dataset.lineId = line.id
  row.toggleAttribute("data-last-one", lastOne)
  row.toggleAttribute("data-price-changed", Boolean(line.priceChangedFrom))
  row.toggleAttribute("data-bundle", Boolean(line.bundle))

  const image = row.querySelector<HTMLImageElement>("[data-shop-line-image] img")
  if (image) {
    // A thumbnail next to its title: decorative, lazy, and sized for 64px.
    const attrs = imageAttrs(line.image, { alt: "", sizes: "64px", widths: [64, 128, 192] })
    for (const [name, value] of Object.entries(attrs)) {
      if (value === undefined) image.removeAttribute(name)
      else image.setAttribute(name, value)
    }
  }
  setText(row.querySelector("[data-shop-line-title]"), line.title)
  const link = row.querySelector<HTMLAnchorElement>("[data-shop-line-link]")
  if (link && line.handle) {
    link.href = hrefPattern.replace("{handle}", encodeURIComponent(line.handle))
  }
  const variant = row.querySelector<HTMLElement>("[data-shop-line-variant]")
  if (variant) {
    setText(variant, line.variantTitle)
    variant.hidden = !line.variantTitle
  }
  const bundle = row.querySelector<HTMLElement>("[data-shop-line-bundle]")
  if (bundle) {
    setText(bundle, line.bundle ? `Part of ${line.bundle}` : "")
    bundle.hidden = !line.bundle
  }
  setText(row.querySelector("[data-shop-line-price]"), money(line.cost.totalAmount))
  const notice = row.querySelector<HTMLElement>("[data-shop-line-notice]")
  if (notice) {
    setText(
      notice,
      line.priceChangedFrom
        ? `Price changed from ${money({ amount: line.priceChangedFrom, currencyCode: line.price.currencyCode })}`
        : "",
    )
    notice.hidden = !line.priceChangedFrom
  }
  const decrement = row.querySelector<HTMLElement>('[data-step="dec"]')
  if (decrement) {
    decrement.setAttribute("aria-label", lastOne ? `Remove ${lineName(line)}` : `Decrease quantity, ${lineName(line)}`)
    // `hidden` as an attribute: an SVG has no `hidden` property to set.
    decrement.querySelector("[data-shop-bin]")?.toggleAttribute("hidden", !lastOne)
    decrement.querySelector("[data-shop-minus]")?.toggleAttribute("hidden", lastOne)
  }
  const field = row.querySelector<Field>("ui-number-input")
  if (field) {
    field.setAttribute("value", String(line.quantity))
    field.setAttribute("min", "0")
    field.setAttribute("max", String(limit))
    field.setAttribute("aria-label", `Quantity, ${lineName(line)}`)
  }
  const increment = row.querySelector<HTMLButtonElement>('[data-step="inc"]')
  if (increment) {
    const atLimit = line.quantity >= limit
    increment.setAttribute("aria-label", `Increase quantity, ${lineName(line)}`)
    increment.toggleAttribute("data-at-limit", atLimit)
    increment.disabled = atLimit
    if (atLimit) increment.setAttribute("aria-disabled", "true")
    else increment.removeAttribute("aria-disabled")
  }
}

function renderTotal(el: HTMLElement, cart: Cart | null) {
  // Before a cart exists there's no currency to name: leave the author's placeholder.
  setText(el.querySelector("[data-shop-total-subtotal]"), cart ? money(cart.subtotal) : "")
  setText(el.querySelector("[data-shop-total-grand]"), cart ? money(cart.total) : "")
  // No rate exists until checkout: say so rather than invent one.
  setText(el.querySelector("[data-shop-total-shipping]"), "Calculated at checkout")
  const paid = Number(cart?.tax.amount ?? 0)
  setText(el.querySelector("[data-shop-total-tax]"), cart && paid > 0 ? money(cart.tax) : "Calculated at checkout")
  setText(el.querySelector("[data-shop-total-count]"), items(cart?.totalQuantity ?? 0))
  const discounts = cart?.discounts ?? []
  const discount = el.querySelector<HTMLElement>("[data-shop-total-discount]")
  if (discount) discount.hidden = discounts.length === 0
  const list = el.querySelector<HTMLElement>("[data-shop-total-discount-list]")
  if (list) {
    list.replaceChildren(
      list.querySelector(":scope > template") ?? "",
      ...cloneEach(list, discounts, (row, entry) => {
        row.dataset.code = entry.code
        setText(row.querySelector("[data-shop-total-discount-code]"), entry.code)
        setText(row.querySelector("[data-shop-total-discount-amount]"), `−${money(entry.amount)}`)
      }),
    )
  }
}

/** Whether each meter was last unlocked, so a crossing is said once, either way. */
const unlocked = new WeakMap<HTMLElement, boolean>()

function renderShipping(el: HTMLElement, cart: Cart | null) {
  if (!cart) return
  const threshold = Math.max(0, Number(el.getAttribute("threshold")) || 0)
  const subtotal = Number(cart.subtotal.amount)
  const currencyCode = cart.subtotal.currencyCode
  const left = Math.max(0, Math.round((threshold - subtotal) * 100) / 100)
  const reached = subtotal >= threshold
  setText(
    el.querySelector("[data-shop-shipping-text]"),
    reached ? "Free shipping unlocked" : `Add ${money({ amount: String(left), currencyCode })} more for free shipping`,
  )
  setText(el.querySelector("[data-shop-shipping-remaining]"), left > 0 ? money({ amount: String(left), currencyCode }) : "")
  const before = unlocked.get(el)
  if (before !== undefined && before !== reached) {
    announce(reached ? "Free shipping unlocked." : `Free shipping is ${money({ amount: String(left), currencyCode })} away.`)
  }
  unlocked.set(el, reached)
}

function renderDiscount(
  el: HTMLElement,
  cart: Cart | null,
  discount: { status: string; message: string },
  api: CartInstanceApi,
) {
  setText(el.querySelector("[data-shop-discount-status]"), discount.message)
  const button = el.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (button) button.disabled = discount.status === "pending"
  const input = el.querySelector<HTMLInputElement>("[data-shop-discount-input]")
  if (input) {
    if (discount.status === "error" || discount.status === "rejected") input.setAttribute("aria-invalid", "true")
    else input.removeAttribute("aria-invalid")
  }
  const applied = el.querySelector<HTMLElement>("[data-shop-discount-applied]")
  if (!applied) return
  const codes = cart?.discountCodes ?? []
  applied.replaceChildren(
    applied.querySelector(":scope > template") ?? "",
    ...cloneEach(applied, codes, (row, entry) => {
      row.dataset.code = entry.code
      setText(row.querySelector("[data-shop-discount-code]"), entry.code)
      setText(row.querySelector("[data-shop-discount-note]"), entry.applicable ? "" : "not applicable")
      const remove = row.querySelector<HTMLButtonElement>("[data-shop-discount-remove]")
      if (remove) {
        remove.setAttribute("aria-label", `Remove discount ${entry.code}`)
        remove.addEventListener("click", (event) => {
          void api.removeDiscount(entry.code, { event })
        })
      }
    }),
  )
}

const noteBound = new WeakSet<HTMLElement>()

const parts = createParts(shopCart, {
  root: {
    tag: "shop-cart",
    display: "block",
    api: [
      "getCart",
      "getCount",
      "add",
      "setQuantity",
      "remove",
      "restore",
      "applyDiscount",
      "removeDiscount",
      "setNote",
      "refresh",
    ],
    // Content is text the parts can't hold as attributes: written here, from state.
    render(el, instance) {
      const paint = () => {
        const state = instance.get()
        const { cart } = state
        const empty = !(state.status === "loading" && !cart) && !cart?.lines.length
        const limit = instance.api.internal.limit()
        for (const count of el.querySelectorAll<HTMLElement>("shop-cart-count")) {
          setText(count, String(cart?.totalQuantity ?? 0))
        }
        for (const lines of el.querySelectorAll<HTMLElement>("shop-cart-lines")) {
          renderLines(lines, cart, instance.api, limit, empty)
        }
        for (const part of el.querySelectorAll<HTMLElement>("shop-cart-empty")) {
          setText(part.querySelector("[data-shop-empty-text]"), part.getAttribute("text") ?? "Your bag is empty.")
          const links = part.querySelector<HTMLElement>("[data-shop-empty-links]")
          if (links) links.hidden = !empty
        }
        for (const summary of el.querySelectorAll<HTMLElement>("shop-cart-summary")) {
          setText(
            summary.querySelector("[data-shop-subtotal]"),
            money(cart?.subtotal ?? { amount: "0", currencyCode: "USD" }),
          )
        }
        for (const total of el.querySelectorAll<HTMLElement>("shop-cart-total")) renderTotal(total, cart)
        for (const shipping of el.querySelectorAll<HTMLElement>("shop-cart-shipping")) renderShipping(shipping, cart)
        for (const discount of el.querySelectorAll<HTMLElement>("shop-cart-discount")) {
          renderDiscount(discount, cart, state.discount, instance.api)
        }
        for (const notePart of el.querySelectorAll<HTMLElement>("shop-cart-note")) {
          const input = notePart.querySelector<HTMLTextAreaElement | HTMLInputElement>("textarea, input")
          if (input) {
            if (!noteBound.has(input)) {
              noteBound.add(input)
              input.addEventListener("change", (event) => {
                void instance.api.setNote(input.value, { event }).catch(() => {})
              })
            }
            if (document.activeElement !== input && input.value !== (cart?.note ?? "")) {
              input.value = cart?.note ?? ""
            }
          }
        }
        for (const pay of el.querySelectorAll<HTMLElement & { checkoutUrl?: string; disabled?: boolean }>(
          "shop-pay[data-cart-pay]",
        )) {
          pay.checkoutUrl = cart?.checkoutUrl ?? ""
          pay.disabled = empty
        }
        // Read again: rendering can announce, like a crossed shipping threshold.
        const { message } = instance.get()
        for (const status of el.querySelectorAll<HTMLElement>("shop-cart-status")) setText(status, message)
      }
      paint()
      return instance.subscribe(paint)
    },
  },
  count: "shop-cart-count",
  lines: { tag: "shop-cart-lines", display: "block" },
  undo: { tag: "shop-cart-undo", display: "block" },
  "undo-trigger": { tag: "shop-cart-undo-trigger", display: "contents", target: wrappedButton },
  empty: { tag: "shop-cart-empty", display: "block" },
  summary: { tag: "shop-cart-summary", display: "block" },
  total: { tag: "shop-cart-total", display: "block" },
  shipping: { tag: "shop-cart-shipping", display: "block" },
  discount: { tag: "shop-cart-discount", display: "block" },
  note: { tag: "shop-cart-note", display: "block" },
  checkout: { tag: "shop-cart-checkout", display: "contents", target: wrappedButton },
  status: { tag: "shop-cart-status", display: "block" },
})

export { parts as shopCartParts }
