import { usePart, usePrimitive, type PartProps } from "@ui-sdk/solid/primitive"
import { For, omit, Show, type Accessor } from "solid-js"
import type { JSX } from "@solidjs/web"
import { shopMarketSelector, type ShopMarketSelectorOptions, type ShopMarketSelectorState } from "../primitives/market-selector"
import { shopRecommendations, type ShopRecommendationsOptions } from "../primitives/recommendations"
import { shopSearch, type ShopSearchOptions } from "../primitives/search"
import { shopPay, type ShopPayOptions, type ShopPayState } from "../primitives/shop-pay"
import { shopPromise, type ShopPromiseOptions, type ShopPromiseState } from "../primitives/shop-promise"
import type { CollectionSummary, PredictiveSearchQuery, ProductCardData } from "../shop"
import { useCart } from "./cart"
import { useInstanceState } from "./use-state"

// ------------------------------------------------------------------ Shop Pay

/** On-brand Shop Pay wordmark: bold white "Shop" + white pill "Pay" badge in #5A31F4. */
function ShopPayMark(props: { prefix?: string }) {
  return (
    <>
      <Show when={props.prefix !== ""}>
        <span class="shop-pay-label">{props.prefix ?? "Buy with"}</span>
      </Show>
      <span class="shop-pay-wordmark" aria-label="Shop Pay">
        <span class="shop-pay-shop">Shop</span>
        <span class="shop-pay-badge">Pay</span>
      </span>
    </>
  )
}

const shopPayInlineStyle: JSX.CSSProperties = {
  display: "inline-flex",
  "align-items": "center",
  "justify-content": "center",
  gap: "7px",
  width: "100%",
  "min-height": "46px",
  padding: "11px 20px",
  border: "0",
  "border-radius": "var(--shop-pay-radius, 8px)",
  background: "#5a31f4",
  color: "#ffffff",
  "font-weight": "600",
  "font-size": "15px",
  "line-height": "1",
  "text-decoration": "none",
}

function ShopPay(
  props: ShopPayOptions & { children?: JSX.Element } & Omit<PartProps<"div">, "children">,
) {
  const cart = useCart()
  const handle = usePrimitive(shopPay, () => ({
    lines: props.lines,
    checkoutUrl: props.checkoutUrl,
    endpoint: props.endpoint ?? cart.endpoint(),
    disabled: props.disabled,
    price: props.price,
    installments: props.installments,
    minInstallmentPrice: props.minInstallmentPrice,
    maxInstallmentPrice: props.maxInstallmentPrice,
    onCheckout: props.onCheckout,
  }))
  const rest = omit(
    props,
    "lines",
    "checkoutUrl",
    "endpoint",
    "disabled",
    "price",
    "installments",
    "minInstallmentPrice",
    "maxInstallmentPrice",
    "onCheckout",
    "children",
  )
  return usePart(
    handle,
    "root",
    undefined,
    { ...rest, children: () => props.children } as never,
    "div",
  )
}

function ShopPayButton(
  props: { prefix?: string } & Omit<PartProps<"a", ShopPayState>, "children"> & {
    children?: JSX.Element | ((state: ShopPayState) => JSX.Element)
  },
) {
  const rest = omit(props, "prefix", "children")
  return usePart(
    shopPay,
    "button",
    undefined,
    {
      "data-shop-pay-button": "",
      style: shopPayInlineStyle,
      ...rest,
      children: (state: ShopPayState) =>
        typeof props.children === "function"
          ? props.children(state)
          : props.children ?? <ShopPayMark prefix={props.prefix} />,
    } as never,
    "a",
  )
}

function ShopPayInstallments(
  props: Omit<PartProps<"p", ShopPayState>, "children"> & {
    children?: (state: ShopPayState) => JSX.Element
  },
) {
  const rest = omit(props, "children")
  return usePart(
    shopPay,
    "installments",
    undefined,
    {
      "data-shop-pay-installments": "",
      ...rest,
      children: (state: ShopPayState) =>
        props.children ? (
          props.children(state)
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

function ShopPromise(
  props: ShopPromiseOptions &
    Omit<PartProps<"div", ShopPromiseState>, "children"> & {
      children?: (state: ShopPromiseState) => JSX.Element
    },
) {
  const handle = usePrimitive(shopPromise, () => ({
    available: props.available,
    minDays: props.minDays,
    maxDays: props.maxDays,
    cutoffHour: props.cutoffHour,
    now: props.now,
    deliveryDate: props.deliveryDate,
    locale: props.locale,
  }))
  const rest = omit(
    props,
    "available",
    "minDays",
    "maxDays",
    "cutoffHour",
    "now",
    "deliveryDate",
    "locale",
    "children",
  )
  return usePart(
    handle,
    "root",
    undefined,
    {
      "data-shop-promise": "",
      ...rest,
      children: (state: ShopPromiseState) =>
        props.children ? (
          props.children(state)
        ) : (
          <>
            <span class="shop-promise-badge">Shop Promise</span>
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

function ShopMarketSelector(
  props: ShopMarketSelectorOptions & { label?: string } & Omit<PartProps<"div", ShopMarketSelectorState>, "children">,
) {
  const cart = useCart()
  const handle = usePrimitive(shopMarketSelector, () => ({
    endpoint: props.endpoint ?? cart.endpoint(),
    mode: props.mode,
    storageKey: props.storageKey,
    countries: props.countries,
    country: props.country,
    defaultCountry: props.defaultCountry,
    language: props.language,
    defaultLanguage: props.defaultLanguage,
    onCountryChange: props.onCountryChange,
    onLanguageChange: props.onLanguageChange,
  }))
  const rest = omit(
    props,
    "endpoint",
    "mode",
    "storageKey",
    "countries",
    "country",
    "defaultCountry",
    "language",
    "defaultLanguage",
    "onCountryChange",
    "onLanguageChange",
    "label",
  )
  return usePart(
    handle,
    "root",
    undefined,
    {
      ...rest,
      children: (state: ShopMarketSelectorState) => (
        <select
          aria-label={props.label ?? (state.mode === "country" ? "Country and currency" : "Currency")}
          disabled={state.choices.length <= 1}
          value={state.selectedValue}
          onChange={(event) =>
            handle.api.setCountry((event.currentTarget as HTMLSelectElement).value, {
              reason: "input",
              event,
            })
          }
        >
          <Show
            when={state.choices.length > 0}
            fallback={<option value={state.country}>{state.currency || state.country}</option>}
          >
            <For each={state.choices} keyed={(choice) => choice.value}>
              {(choice) => (
                <option value={choice().value} selected={choice().value === state.selectedValue}>
                  {choice().label}
                </option>
              )}
            </For>
          </Show>
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

function ShopSearch(
  props: ShopSearchOptions & {
    children: (state: Accessor<SearchRenderState>) => JSX.Element
  } & Omit<PartProps<"div">, "children">,
) {
  const cart = useCart()
  const handle = usePrimitive(shopSearch, () => ({
    endpoint: props.endpoint ?? cart.endpoint(),
    query: props.query,
    defaultQuery: props.defaultQuery,
    limit: props.limit,
    debounceMs: props.debounceMs,
    onQueryChange: props.onQueryChange,
  }))
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
  const rest = omit(props, "endpoint", "query", "defaultQuery", "limit", "debounceMs", "onQueryChange", "children")
  const view: Accessor<SearchRenderState> = () => ({
    ...raw(),
    setQuery: (query, event) => handle.api.setQuery(query, { reason: "input", event }),
    clear: (event) => handle.api.clear({ event }),
  })
  return usePart(
    handle,
    "root",
    undefined,
    { ...rest, children: () => props.children(view) } as never,
    "div",
  )
}

// ----------------------------------------------------------- Recommendations

function ShopRecommendations(
  props: ShopRecommendationsOptions & {
    children: (products: Accessor<ProductCardData[]>) => JSX.Element
  } & Omit<PartProps<"section">, "children">,
) {
  const cart = useCart()
  const handle = usePrimitive(shopRecommendations, () => ({
    productId: props.productId,
    intent: props.intent,
    limit: props.limit,
    endpoint: props.endpoint ?? cart.endpoint(),
  }))
  const state = useInstanceState(
    handle.instance as never as {
      get: () => { products: ProductCardData[] }
      subscribe: (l: () => void) => () => void
    },
  )
  const rest = omit(props, "productId", "intent", "limit", "endpoint", "children")
  return usePart(
    handle,
    "root",
    undefined,
    { ...rest, children: () => props.children(() => state().products) } as never,
    "section",
  )
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
