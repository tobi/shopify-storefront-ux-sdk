import { imageAttrs } from "../images"
import { shopCart, type ShopCartOptions } from "../primitives/cart"
import { announce, money, type Cart, type CartLine, type Money } from "../shop"
import { Button } from "@ui-sdk/solid/button"
import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from "@ui-sdk/solid/number-input"
import { usePart, usePrimitive, type PartProps, type PrimitiveHandle } from "@ui-sdk/solid/primitive"
import { createContext, createEffect, For, omit, Show, useContext, type Accessor } from "solid-js"
import type { JSX } from "@solidjs/web"
import { useInstanceState } from "./use-state"

type CartContext = {
  handle: PrimitiveHandle<typeof shopCart>
  cart: Accessor<Cart | null>
  endpoint: () => string
}

const Context = createContext<CartContext>()

function useCart() {
  const context = useContext(Context)
  if (!context) throw new Error("Put this inside <ShopCart>")
  return context
}

const lineName = (line: Pick<CartLine, "title" | "variantTitle">) =>
  `${line.title}${line.variantTitle ? `, ${line.variantTitle}` : ""}`

function ShopCart(
  props: ShopCartOptions & { endpoint: string; children?: JSX.Element } & Omit<PartProps<"div">, "children">,
) {
  const handle = usePrimitive(shopCart, () => ({
    endpoint: props.endpoint,
    token: props.token,
    storageKey: props.storageKey,
    country: props.country,
    language: props.language,
    maxQuantity: props.maxQuantity,
    onCartChange: props.onCartChange,
    onLineAdd: props.onLineAdd,
    onLineQuantityChange: props.onLineQuantityChange,
    onLineRemove: props.onLineRemove,
    onDiscountApply: props.onDiscountApply,
    onDiscountRemove: props.onDiscountRemove,
    onNoteChange: props.onNoteChange,
  }))
  const state = useInstanceState(
    handle.instance as never as { get: () => { cart: Cart | null }; subscribe: (l: () => void) => () => void },
  )
  const rest = omit(
    props,
    "endpoint",
    "token",
    "storageKey",
    "country",
    "language",
    "maxQuantity",
    "onCartChange",
    "onLineAdd",
    "onLineQuantityChange",
    "onLineRemove",
    "onDiscountApply",
    "onDiscountRemove",
    "onNoteChange",
    "children",
  )
  const value: CartContext = { handle, cart: () => state().cart, endpoint: () => props.endpoint }
  return (
    <Context value={value}>
      {usePart(handle, "root", undefined, { ...rest, children: () => props.children } as never, "div")}
    </Context>
  )
}

function CartCount(props: Omit<PartProps<"span", { count: number; empty: boolean }>, "children">) {
  return usePart(shopCart, "count", undefined, { ...props, children: (state: { count: number }) => state.count } as never, "span")
}

type LineControls = { quantity: () => JSX.Element; image: (sizes?: string) => JSX.Element; price: () => string }
type LineProps = { children?: (line: Accessor<CartLine>, controls: LineControls) => JSX.Element }

/** One row per line, keyed by line id. The stepper's floor is 0: the last decrement removes the line. */
function CartLines(props: { empty?: JSX.Element; children: LineProps["children"] } & Omit<PartProps<"ul">, "children">) {
  const { cart, handle } = useCart()
  const rest = omit(props, "empty", "children")
  const limit = () => (handle.api.internal as { limit: () => number }).limit()
  const controls = (current: Accessor<CartLine>): LineControls => ({
    price: () => money(current().cost.totalAmount),
    image: (sizes = "80px") => <img {...(imageAttrs(current().image, { sizes, widths: [80, 160, 240] }) as object)} alt="" />,
    quantity: () => (
      <NumberInput
        value={current().quantity}
        min={0}
        max={limit()}
        aria-label={`Quantity, ${lineName(current())}`}
        onValueChange={(value, details) => {
          if (value === 0) void handle.api.remove(current().id, { reason: "press", event: details.event }).catch(() => {})
        }}
        onValueCommit={(value, details) => {
          if (value == null || value === 0 || value === current().quantity) return
          void handle.api.setQuantity(current().id, value, { reason: "input", event: details?.event }).catch(() => {})
        }}
      >
        <NumberInputGroup>
          <NumberInputDecrement aria-label={current().quantity === 1 ? `Remove ${lineName(current())}` : "Decrease quantity"}>
            {current().quantity === 1 ? <TrashIcon /> : "−"}
          </NumberInputDecrement>
          <NumberInputControl aria-label={`Quantity, ${lineName(current())}`} />
          <NumberInputIncrement aria-label="Increase quantity">+</NumberInputIncrement>
        </NumberInputGroup>
      </NumberInput>
    ),
  })
  return usePart(
    shopCart,
    "lines",
    undefined,
    {
      ...rest,
      children: () => (
        <Show when={cart()?.lines.length} fallback={props.empty}>
          <ul data-shop-lines>
            <For each={cart()?.lines ?? []} keyed={(line) => line.id}>
              {(line) => <li data-line-id={line().id}>{props.children?.(line, controls(line))}</li>}
            </For>
          </ul>
        </Show>
      ),
    } as never,
    "div",
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  )
}

type CartShippingState = {
  progress: number
  unlocked: boolean
  remaining: Money | null
  remainingText: string
}

/**
 * Free-shipping threshold meter driven by `shopCart`'s `shipping` slot.
 * Exposes `--shop-shipping-progress` (0–1) and `data-unlocked`, and politely
 * announces when the cart crosses the threshold.
 */
function CartShipping(
  props: {
    threshold: number
    children?: (state: CartShippingState) => JSX.Element
  } & Omit<PartProps<"div">, "children">,
) {
  const { cart } = useCart()
  const rest = omit(props, "threshold", "children")
  let previousUnlocked: boolean | undefined
  createEffect(
    () => {
      const current = cart()
      if (!current || !current.lines.length) return null
      const threshold = Math.max(0, props.threshold || 0)
      const subtotal = Number(current.subtotal.amount)
      const left = Math.max(0, Math.round((threshold - subtotal) * 100) / 100)
      return {
        unlocked: subtotal >= threshold,
        remainingText: left > 0 ? money({ amount: left.toFixed(2), currencyCode: current.subtotal.currencyCode }) : "",
      }
    },
    (next) => {
      if (!next) {
        previousUnlocked = undefined
        return
      }
      if (previousUnlocked !== undefined && previousUnlocked !== next.unlocked) {
        announce(next.unlocked ? "Free shipping unlocked." : `Free shipping is ${next.remainingText} away.`)
      }
      previousUnlocked = next.unlocked
    },
  )
  return usePart(
    shopCart,
    "shipping",
    () => ({ threshold: props.threshold }),
    {
      ...rest,
      children: (state: CartShippingState) =>
        props.children ? (
          props.children(state)
        ) : (
          <>
            <p data-shop-shipping-text>
              {state.unlocked ? "Free shipping unlocked" : `Add ${state.remainingText} more for free shipping`}
            </p>
            <div data-shop-shipping-track aria-hidden="true">
              <span data-shop-shipping-fill style={{ width: `${Math.round(state.progress * 100)}%` }} />
            </div>
          </>
        ),
    } as never,
    "div",
  )
}

function CartUndo(props: { children?: (title: string) => JSX.Element } & Omit<PartProps<"div">, "children">) {
  const rest = omit(props, "children")
  return usePart(
    shopCart,
    "undo",
    undefined,
    {
      ...rest,
      children: (state: { line: string }) => (
        <>
          <span>{props.children ? props.children(state.line) : `Removed ${state.line}.`}</span>
          <CartUndoTrigger>Undo</CartUndoTrigger>
        </>
      ),
    } as never,
    "div",
  )
}

function CartUndoTrigger(props: PartProps<"button">) {
  return usePart(shopCart, "undo-trigger", undefined, { type: "button", ...props } as never, "button")
}

function CartSubtotal() {
  const { cart } = useCart()
  return <>{money(cart()?.subtotal)}</>
}

function CartDiscount(props: { placeholder?: string } & Omit<PartProps<"form">, "children">) {
  const { cart, handle } = useCart()
  const rest = omit(props, "placeholder")
  return usePart(
    shopCart,
    "discount",
    undefined,
    {
      ...rest,
      children: (state: { status: string; message: string }) => (
        <>
          <div data-discount-row>
            <input
              name="code"
              aria-label="Discount code"
              placeholder={props.placeholder ?? "Discount code"}
              aria-invalid={state.status === "rejected" || state.status === "error" ? "true" : undefined}
            />
            <button type="submit">Apply</button>
          </div>
          <p data-discount-status>{state.message}</p>
          <Show when={cart()?.discountCodes.length}>
            <ul data-discount-codes>
              <For each={cart()?.discountCodes ?? []} keyed={(code) => code.code}>
                {(code) => (
                  <li data-applicable={code().applicable ? "" : undefined}>
                    <span>
                      {code().code}
                      {code().applicable ? "" : " · not applicable"}
                    </span>
                    <button
                      type="button"
                      data-discount-remove
                      aria-label={`Remove discount ${code().code}`}
                      onClick={(event) => void handle.api.removeDiscount(code().code, { event })}
                    >
                      ×
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </>
      ),
    } as never,
    "form",
  )
}

function CartNote(props: { label?: string; placeholder?: string } & Omit<PartProps<"div">, "children">) {
  const { cart, handle } = useCart()
  const rest = omit(props, "label", "placeholder")
  return usePart(
    shopCart,
    "note",
    undefined,
    {
      ...rest,
      children: () => (
        <textarea
          aria-label={props.label ?? "Order note"}
          placeholder={props.placeholder ?? "Add an order note…"}
          value={cart()?.note ?? ""}
          onChange={(event) => void handle.api.setNote((event.currentTarget as HTMLTextAreaElement).value, { event }).catch(() => {})}
        />
      ),
    } as never,
    "div",
  )
}

function CartCheckout(props: PartProps<"a">) {
  return usePart(
    shopCart,
    "checkout",
    undefined,
    { "data-agent-confirm": "Go to Shopify checkout for this bag", ...props } as never,
    "a",
  )
}

function CartStatus(props: PartProps<"p">) {
  return usePart(shopCart, "status", undefined, { ...props, children: (state: { message: string }) => state.message } as never, "p")
}

/** A button that adds a variant straight from a listing, through the cart's api. */
function AddVariant(
  props: { variantId: string; quantity?: number; onAdded?: () => void; children: JSX.Element } & Omit<
    PartProps<"button">,
    "children"
  >,
) {
  const { handle } = useCart()
  const rest = omit(props, "variantId", "quantity", "onAdded", "children")
  return (
    <Button
      {...(rest as object)}
      pendingAnnouncement="Adding to bag"
      onClick={async (event: Event) => {
        await handle.api.add(props.variantId, props.quantity ?? 1, { event })
        props.onAdded?.()
      }}
    >
      {props.children}
    </Button>
  )
}

export {
  AddVariant,
  CartCheckout,
  CartCount,
  CartDiscount,
  CartLines,
  CartNote,
  CartShipping,
  CartStatus,
  CartSubtotal,
  CartUndo,
  ShopCart,
  lineName,
  useCart,
  type CartShippingState,
}
