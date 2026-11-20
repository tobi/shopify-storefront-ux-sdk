import { Button } from "@ui-sdk/react/button"
import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from "@ui-sdk/react/number-input"
import { usePart, usePrimitive, type PartProps, type PrimitiveHandle } from "@ui-sdk/react/primitive"
import * as React from "react"
import { imageAttrs } from "../images"
import { shopCart, type ShopCartOptions } from "../primitives/cart"
import { announce, money, type Cart, type CartLine, type Money } from "../shop"
import { useInstanceState } from "./use-state"

type CartContextValue = {
  handle: PrimitiveHandle<typeof shopCart>
  cart: Cart | null
  endpoint: string
}

const CartContext = React.createContext<CartContextValue | null>(null)

function useCart() {
  const context = React.useContext(CartContext)
  if (!context) throw new Error("Put this inside <ShopCart>")
  return context
}

const lineName = (line: Pick<CartLine, "title" | "variantTitle">) =>
  `${line.title}${line.variantTitle ? `, ${line.variantTitle}` : ""}`

function ShopCart({
  endpoint,
  token,
  storageKey,
  country,
  language,
  maxQuantity,
  onCartChange,
  onLineAdd,
  onLineQuantityChange,
  onLineRemove,
  onDiscountApply,
  onDiscountRemove,
  onNoteChange,
  children,
  ...rest
}: ShopCartOptions & { endpoint: string; children?: React.ReactNode } & Omit<PartProps<"div">, "children">) {
  const handle = usePrimitive(shopCart, {
    endpoint,
    token,
    storageKey,
    country,
    language,
    maxQuantity,
    onCartChange,
    onLineAdd,
    onLineQuantityChange,
    onLineRemove,
    onDiscountApply,
    onDiscountRemove,
    onNoteChange,
  })
  const state = useInstanceState(
    handle.instance as never as { get: () => { cart: Cart | null }; subscribe: (l: () => void) => () => void },
  )
  const value = React.useMemo<CartContextValue>(
    () => ({ handle, cart: state.cart, endpoint }),
    [handle, state.cart, endpoint],
  )
  return (
    <CartContext.Provider value={value}>
      {usePart(handle, "root", {}, { ...rest, children } as never, "div")}
    </CartContext.Provider>
  )
}

function CartCount(props: Omit<PartProps<"span", { count: number; empty: boolean }>, "children">) {
  return usePart(
    shopCart,
    "count",
    {},
    { ...props, children: (state: { count: number }) => state.count } as never,
    "span",
  )
}

type LineControls = {
  quantity: () => React.ReactNode
  image: (sizes?: string) => React.ReactNode
  price: () => string
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  )
}

/** One row per line, keyed by line id. The stepper's floor is 0: the last decrement removes the line. */
function CartLines({
  empty,
  children,
  ...rest
}: {
  empty?: React.ReactNode
  children: (line: CartLine, controls: LineControls) => React.ReactNode
} & Omit<PartProps<"div">, "children">) {
  const { cart, handle } = useCart()
  const limit = (handle.api.internal as { limit: () => number }).limit()
  const lines = cart?.lines ?? []

  const controlsFor = (line: CartLine): LineControls => ({
    price: () => money(line.cost.totalAmount),
    image: (sizes = "80px") => {
      const attrs = imageAttrs(line.image, { sizes, widths: [80, 160, 240], alt: "" })
      if (!line.image) return null
      return (
        <img
          src={attrs.src}
          srcSet={attrs.srcset}
          sizes={attrs.sizes}
          width={attrs.width}
          height={attrs.height}
          alt=""
          loading={attrs.loading}
          decoding="async"
        />
      )
    },
    quantity: () => (
      <NumberInput
        value={line.quantity}
        min={0}
        max={limit}
        aria-label={`Quantity, ${lineName(line)}`}
        onValueChange={(value, details) => {
          if (value === 0) void handle.api.remove(line.id, { reason: "press", event: details.event }).catch(() => {})
        }}
        onValueCommit={(value, details) => {
          if (value == null || value === 0 || value === line.quantity) return
          void handle.api.setQuantity(line.id, value, { reason: "input", event: details?.event }).catch(() => {})
        }}
      >
        <NumberInputGroup>
          <NumberInputDecrement
            aria-label={line.quantity === 1 ? `Remove ${lineName(line)}` : "Decrease quantity"}
          >
            {line.quantity === 1 ? <TrashIcon /> : "−"}
          </NumberInputDecrement>
          <NumberInputControl />
          <NumberInputIncrement aria-label="Increase quantity">+</NumberInputIncrement>
        </NumberInputGroup>
      </NumberInput>
    ),
  })

  return usePart(
    shopCart,
    "lines",
    {},
    {
      ...rest,
      children: lines.length ? (
        <ul data-shop-lines="">
          {lines.map((line) => (
            <li key={line.id} data-line-id={line.id}>
              {children(line, controlsFor(line))}
            </li>
          ))}
        </ul>
      ) : (
        empty
      ),
    } as never,
    "div",
  )
}

type CartShippingState = {
  progress: number
  unlocked: boolean
  remaining: Money | null
  remainingText: string
}

function CartShipping({
  threshold,
  children,
  ...rest
}: {
  threshold: number
  children?: (state: CartShippingState) => React.ReactNode
} & Omit<PartProps<"div">, "children">) {
  const { cart } = useCart()
  const prevUnlocked = React.useRef<boolean | undefined>(undefined)

  React.useEffect(() => {
    if (!cart || !cart.lines.length) {
      prevUnlocked.current = undefined
      return
    }
    const goal = Math.max(0, threshold || 0)
    const subtotal = Number(cart.subtotal.amount)
    const left = Math.max(0, Math.round((goal - subtotal) * 100) / 100)
    const unlocked = subtotal >= goal
    if (prevUnlocked.current !== undefined && prevUnlocked.current !== unlocked) {
      const remainingText = left > 0 ? money({ amount: left.toFixed(2), currencyCode: cart.subtotal.currencyCode }) : ""
      announce(unlocked ? "Free shipping unlocked." : `Free shipping is ${remainingText} away.`)
    }
    prevUnlocked.current = unlocked
  }, [cart, threshold])

  return usePart(
    shopCart,
    "shipping",
    { threshold },
    {
      ...rest,
      children: (state: CartShippingState) =>
        children ? (
          children(state)
        ) : (
          <>
            <p data-shop-shipping-text="">
              {state.unlocked ? "Free shipping unlocked" : `Add ${state.remainingText} more for free shipping`}
            </p>
            <div data-shop-shipping-track="" aria-hidden="true">
              <span data-shop-shipping-fill="" style={{ width: `${Math.round(state.progress * 100)}%` }} />
            </div>
          </>
        ),
    } as never,
    "div",
  )
}

function CartUndoTrigger(props: PartProps<"button">) {
  return usePart(shopCart, "undo-trigger", {}, { type: "button", ...props } as never, "button")
}

function CartUndo({
  children,
  ...rest
}: { children?: (title: string) => React.ReactNode } & Omit<PartProps<"div">, "children">) {
  return usePart(
    shopCart,
    "undo",
    {},
    {
      ...rest,
      children: (state: { line: string }) => (
        <>
          <span>{children ? children(state.line) : `Removed ${state.line}.`}</span>
          <CartUndoTrigger>Undo</CartUndoTrigger>
        </>
      ),
    } as never,
    "div",
  )
}

function CartSubtotal() {
  const { cart } = useCart()
  return <>{money(cart?.subtotal)}</>
}

function CartDiscount({
  placeholder = "Discount code",
  ...rest
}: { placeholder?: string } & Omit<PartProps<"form">, "children">) {
  const { cart, handle } = useCart()
  const codes = cart?.discountCodes ?? []
  return usePart(
    shopCart,
    "discount",
    {},
    {
      ...rest,
      children: (state: { status: string; message: string }) => (
        <>
          <div data-discount-row="">
            <input
              name="code"
              aria-label="Discount code"
              placeholder={placeholder}
              aria-invalid={state.status === "rejected" || state.status === "error" ? "true" : undefined}
            />
            <button type="submit">Apply</button>
          </div>
          <p data-discount-status="">{state.message}</p>
          {codes.length > 0 && (
            <ul data-discount-codes="">
              {codes.map((entry) => (
                <li key={entry.code} data-applicable={entry.applicable ? "" : undefined}>
                  <span>
                    {entry.code}
                    {entry.applicable ? "" : " · not applicable"}
                  </span>
                  <button
                    type="button"
                    data-discount-remove=""
                    aria-label={`Remove discount ${entry.code}`}
                    onClick={(event) => void handle.api.removeDiscount(entry.code, { event: event.nativeEvent })}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ),
    } as never,
    "form",
  )
}

function CartNote({
  label = "Order note",
  placeholder = "Add an order note…",
  ...rest
}: { label?: string; placeholder?: string } & Omit<PartProps<"div">, "children">) {
  const { cart, handle } = useCart()
  const [draft, setDraft] = React.useState(cart?.note ?? "")
  React.useEffect(() => {
    setDraft(cart?.note ?? "")
  }, [cart?.note])
  return usePart(
    shopCart,
    "note",
    {},
    {
      ...rest,
      children: (
        <textarea
          aria-label={label}
          placeholder={placeholder}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={(event) => {
            if (draft !== (cart?.note ?? "")) {
              void handle.api.setNote(draft, { event: event.nativeEvent }).catch(() => {})
            }
          }}
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
    {},
    { "data-agent-confirm": "Go to Shopify checkout for this bag", ...props } as never,
    "a",
  )
}

function CartStatus(props: Omit<PartProps<"p">, "children">) {
  return usePart(
    shopCart,
    "status",
    {},
    { ...props, children: (state: { message: string }) => state.message } as never,
    "p",
  )
}

function AddVariant({
  variantId,
  quantity = 1,
  onAdded,
  children,
  ...rest
}: {
  variantId: string
  quantity?: number
  onAdded?: () => void
  children: React.ReactNode
} & Omit<PartProps<"button">, "children" | "onClick">) {
  const { handle } = useCart()
  return (
    <Button
      {...(rest as object)}
      pendingAnnouncement="Adding to bag"
      onClick={async (event) => {
        await handle.api.add(variantId, quantity, { event: event.nativeEvent })
        onAdded?.()
      }}
    >
      {children}
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
