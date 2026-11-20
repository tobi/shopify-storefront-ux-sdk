import { usePart, usePrimitive, type PartProps } from "@ui-sdk/react/primitive"
import * as React from "react"
import {
  shopMarketSelector,
  type ShopMarketSelectorOptions,
  type ShopMarketSelectorState,
} from "../primitives/market-selector"
import { shopRecommendations, type ShopRecommendationsOptions } from "../primitives/recommendations"
import { shopSearch, type ShopSearchOptions } from "../primitives/search"
import { shopPay, type ShopPayOptions, type ShopPayState } from "../primitives/shop-pay"
import { shopPromise, type ShopPromiseOptions, type ShopPromiseState } from "../primitives/shop-promise"
import type { CollectionSummary, PredictiveSearchQuery, ProductCardData } from "../shop"
import { useCart } from "./cart"
import { useInstanceState } from "./use-state"

// ------------------------------------------------------------------ Shop Pay

/** On-brand Shop Pay wordmark: bold white "Shop" + white pill "Pay" badge in #5A31F4. */
function ShopPayMark({ prefix = "Buy with" }: { prefix?: string }) {
  return (
    <>
      {prefix !== "" && <span className="shop-pay-label">{prefix}</span>}
      <span className="shop-pay-wordmark" aria-label="Shop Pay">
        <span className="shop-pay-shop">Shop</span>
        <span className="shop-pay-badge">Pay</span>
      </span>
    </>
  )
}

const shopPayInlineStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  width: "100%",
  minHeight: 46,
  padding: "11px 20px",
  border: 0,
  borderRadius: "var(--shop-pay-radius, 8px)",
  background: "#5a31f4",
  color: "#ffffff",
  fontWeight: 600,
  fontSize: 15,
  lineHeight: 1,
  textDecoration: "none",
}

function ShopPay({
  lines,
  checkoutUrl,
  endpoint,
  disabled,
  price,
  installments,
  minInstallmentPrice,
  maxInstallmentPrice,
  onCheckout,
  children,
  ...rest
}: ShopPayOptions & { children?: React.ReactNode } & Omit<PartProps<"div">, "children">) {
  const cart = useCart()
  const handle = usePrimitive(shopPay, {
    lines,
    checkoutUrl,
    endpoint: endpoint ?? cart.endpoint,
    disabled,
    price,
    installments,
    minInstallmentPrice,
    maxInstallmentPrice,
    onCheckout,
  })
  return usePart(handle, "root", {}, { ...rest, children } as never, "div")
}

function ShopPayButton({
  prefix,
  children,
  style,
  ...rest
}: { prefix?: string } & Omit<PartProps<"a", ShopPayState>, "children"> & {
  children?: React.ReactNode | ((state: ShopPayState) => React.ReactNode)
}) {
  return usePart(
    shopPay,
    "button",
    {},
    {
      "data-shop-pay-button": "",
      style: typeof style === "function" ? style : { ...shopPayInlineStyle, ...style },
      ...rest,
      children: (state: ShopPayState) =>
        typeof children === "function"
          ? children(state)
          : children ?? <ShopPayMark prefix={prefix} />,
    } as never,
    "a",
  )
}

function ShopPayInstallments({
  children,
  ...rest
}: Omit<PartProps<"p", ShopPayState>, "children"> & {
  children?: (state: ShopPayState) => React.ReactNode
}) {
  return usePart(
    shopPay,
    "installments",
    {},
    {
      "data-shop-pay-installments": "",
      ...rest,
      children: (state: ShopPayState) =>
        children ? (
          children(state)
        ) : (
          <>
            Pay in {state.installments} interest-free installments of{" "}
            <strong>{state.installmentText}</strong> with{" "}
            <strong style={{ color: "#5a31f4" }}>Shop Pay</strong>
          </>
        ),
    } as never,
    "p",
  )
}

// -------------------------------------------------------------- Shop Promise

function ShopPromise({
  available,
  minDays,
  maxDays,
  cutoffHour,
  now,
  deliveryDate,
  locale,
  children,
  ...rest
}: ShopPromiseOptions &
  Omit<PartProps<"div", ShopPromiseState>, "children"> & {
    children?: (state: ShopPromiseState) => React.ReactNode
  }) {
  const handle = usePrimitive(shopPromise, {
    available,
    minDays,
    maxDays,
    cutoffHour,
    now,
    deliveryDate,
    locale,
  })
  return usePart(
    handle,
    "root",
    {},
    {
      "data-shop-promise": "",
      ...rest,
      children: (state: ShopPromiseState) =>
        children ? (
          children(state)
        ) : (
          <>
            <span className="shop-promise-badge">Shop Promise</span>
            <span>
              Expected <strong>{state.dateText}</strong>
            </span>
          </>
        ),
    } as never,
    "div",
  )
}

// ----------------------------------------------------- Market / Currency Switcher

function ShopMarketSelector({
  endpoint,
  countries,
  country,
  defaultCountry,
  language,
  defaultLanguage,
  onCountryChange,
  onLanguageChange,
  label = "Country and currency",
  ...rest
}: ShopMarketSelectorOptions & { label?: string } & Omit<PartProps<"div", ShopMarketSelectorState>, "children">) {
  const cart = useCart()
  const handle = usePrimitive(shopMarketSelector, {
    endpoint: endpoint ?? cart.endpoint,
    countries,
    country,
    defaultCountry,
    language,
    defaultLanguage,
    onCountryChange,
    onLanguageChange,
  })
  return usePart(
    handle,
    "root",
    {},
    {
      ...rest,
      children: (state: ShopMarketSelectorState) => (
        <select
          aria-label={label}
          value={state.country}
          onChange={(event) =>
            handle.api.setCountry(event.currentTarget.value, {
              reason: "item-press",
              event: event.nativeEvent,
            })
          }
        >
          {state.countries.length > 0 ? (
            state.countries.map((entry) => (
              <option key={entry.isoCode} value={entry.isoCode}>
                {entry.name} ({entry.currency.isoCode} {entry.currency.symbol})
              </option>
            ))
          ) : (
            <option value={state.country}>{state.country}</option>
          )}
        </select>
      ),
    } as never,
    "div",
  )
}

// ---------------------------------------------------------- Predictive Search

type SearchRenderState = {
  query: string
  status: "idle" | "loading" | "error"
  queries: PredictiveSearchQuery[]
  products: ProductCardData[]
  collections: CollectionSummary[]
  setQuery: (query: string, event?: Event) => void
  clear: (event?: Event) => void
}

function ShopSearch({
  endpoint,
  query,
  defaultQuery,
  limit,
  debounceMs,
  onQueryChange,
  children,
  ...rest
}: ShopSearchOptions & {
  children: (state: SearchRenderState) => React.ReactNode
} & Omit<PartProps<"div">, "children">) {
  const cart = useCart()
  const handle = usePrimitive(shopSearch, {
    endpoint: endpoint ?? cart.endpoint,
    query,
    defaultQuery,
    limit,
    debounceMs,
    onQueryChange,
  })
  const raw = useInstanceState(
    handle.instance as never as {
      get: () => {
        query: string
        status: "idle" | "loading" | "error"
        queries: PredictiveSearchQuery[]
        products: ProductCardData[]
        collections: CollectionSummary[]
      }
      subscribe: (l: () => void) => () => void
    },
  )
  const view: SearchRenderState = {
    ...raw,
    setQuery: (next, event) => handle.api.setQuery(next, { reason: "input", event }),
    clear: (event) => handle.api.clear({ event }),
  }
  return usePart(handle, "root", {}, { ...rest, children: children(view) } as never, "div")
}

// ----------------------------------------------------------- Recommendations

function ShopRecommendations({
  productId,
  intent,
  limit,
  endpoint,
  children,
  ...rest
}: ShopRecommendationsOptions & {
  children: (products: ProductCardData[]) => React.ReactNode
} & Omit<PartProps<"section">, "children">) {
  const cart = useCart()
  const handle = usePrimitive(shopRecommendations, {
    productId,
    intent,
    limit,
    endpoint: endpoint ?? cart.endpoint,
  })
  const state = useInstanceState(
    handle.instance as never as {
      get: () => { products: ProductCardData[] }
      subscribe: (l: () => void) => () => void
    },
  )
  return usePart(handle, "root", {}, { ...rest, children: children(state.products) } as never, "section")
}

export {
  ShopMarketSelector,
  ShopPay,
  ShopPayButton,
  ShopPayInstallments,
  ShopPayMark,
  ShopPromise,
  ShopRecommendations,
  ShopSearch,
}
