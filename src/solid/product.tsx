import { imageAttrs, preloadImage, type Image, type ImageAttrOptions } from "../images"
import { shopPrice, type ShopPriceState } from "../primitives/price"
import { shopProduct } from "../primitives/product"
import { shopVariantSelector } from "../primitives/variant-selector"
import { announce, fetchProduct, money, shopConfig, subscribeConfig, type Product } from "../shop"
import {
  choicesOf,
  matches,
  selectionOf,
  swatchImageOf,
  swatchOf,
  variantName,
  type Money,
  type ProductOption,
  type Variant,
} from "../variants"
import { Button } from "@ui-sdk/solid/button"
import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from "@ui-sdk/solid/number-input"
import { usePart, usePrimitive, type PartProps, type PrimitiveHandle } from "@ui-sdk/solid/primitive"
import { Radio, RadioGroup } from "@ui-sdk/solid/radio"
import { createContext, createEffect, createSignal, For, omit, onCleanup, Show, useContext, type Accessor } from "solid-js"
import type { JSX } from "@solidjs/web"
import { useCart } from "./cart"
import { useInstanceState } from "./use-state"

// ------------------------------------------------------------------ image

function ShopImage(
  props: { image: Image | null | undefined } & ImageAttrOptions & Omit<JSX.ImgHTMLAttributes<HTMLImageElement>, "loading">,
) {
  const rest = omit(props, "image", "alt", "sizes", "widths", "loading", "priority")
  const attrs = () =>
    imageAttrs(props.image ?? null, {
      alt: props.alt,
      sizes: props.sizes,
      widths: props.widths,
      loading: props.loading,
      priority: props.priority,
    })
  return (
    <img
      {...rest}
      src={attrs().src}
      srcset={attrs().srcset}
      sizes={attrs().sizes}
      width={attrs().width}
      height={attrs().height}
      alt={attrs().alt}
      loading={attrs().loading}
      fetchpriority={attrs().fetchpriority as "high" | "low" | undefined}
      decoding="async"
      hidden={!props.image}
      data-shop-image=""
    />
  )
}

// ------------------------------------------------------------------ price

function ShopPrice(
  props: {
    price: Money | null | undefined
    compareAtPrice?: Money | null
    from?: boolean
    showSavings?: boolean
  } & Omit<PartProps<"p">, "children">,
) {
  const handle = usePrimitive(shopPrice, () => ({
    price: props.price ?? null,
    compareAtPrice: props.compareAtPrice ?? null,
  }))
  const rest = omit(props, "price", "compareAtPrice", "from", "showSavings")
  return usePart(
    handle,
    "root",
    undefined,
    {
      ...rest,
      children: (state: ShopPriceState) => (
        <>
          <span data-price-amount>
            <span class="visually-hidden">{state.onSale ? "Sale price " : "Price "}</span>
            {props.from ? "from " : ""}
            {state.text}
          </span>
          <Show when={state.onSale}>
            <s data-price-compare>
              <span class="visually-hidden">Regular price </span>
              {state.compareText}
            </s>
          </Show>
          <Show when={props.showSavings && state.onSale && state.discountPercent}>
            <span data-price-savings>
              Save {state.savingsText} · {state.discountPercent}% off
            </span>
          </Show>
        </>
      ),
    } as never,
    "p",
  )
}

// ---------------------------------------------------------------- product

type ProductContext = {
  product: Accessor<Product | null>
  variant: Accessor<Variant | null>
  quantity: Accessor<number>
  handle: PrimitiveHandle<typeof shopProduct>
  selector: PrimitiveHandle<typeof shopVariantSelector>
  error: Accessor<string | null>
}

const Context = createContext<ProductContext>()

function useProduct() {
  const context = useContext(Context)
  if (!context) throw new Error("Put this inside <ShopProduct>")
  return context
}

type ProductState = { product: Product | null; quantity: number; variant: Variant | null; pending: boolean; error: string | null }
type SelectorState = { value: string | null; variants: Variant[]; productOptions: ProductOption[] }

/**
 * A buy box. Owns a `shopProduct` and the `shopVariantSelector` it reads its
 * variant from, and connects them to the nearest `<ShopCart>`, the way the
 * `<shop-product>` element does for web components.
 */
function ShopProduct(
  props: {
    handle?: string
    product?: Product | null
    defaultVariant?: string
    onProductLoad?: (product: Product) => void
    children?: JSX.Element
  } & Omit<PartProps<"div">, "children">,
) {
  const cart = useCart()
  const [loaded, setLoaded] = createSignal<Product | null>(props.product ?? null)
  const [error, setError] = createSignal<string | null>(null)
  const product = () => props.product ?? loaded()

  const handle = usePrimitive(shopProduct, () => ({ product: product() }))
  const selector = usePrimitive(shopVariantSelector, () => ({
    variants: product()?.variants ?? [],
    productOptions: product()?.options ?? [],
    defaultValue: props.defaultVariant,
    onValueIntent: (id: string) => {
      const image = product()?.variants.find((variant) => variant.id === id)?.image
      if (image) preloadImage(image, { sizes: "(max-width: 900px) 100vw, 50vw" })
    },
  }))
  const productState = useInstanceState(
    handle.instance as never as { get: () => ProductState; subscribe: (l: () => void) => () => void },
  )
  const selectorState = useInstanceState(
    selector.instance as never as { get: () => SelectorState; subscribe: (l: () => void) => () => void },
  )

  const selectorApi = selector.api as unknown as {
    getValue: () => string | null
    getVariant: () => Variant | null
    setValue: (id: string, details?: object) => boolean
    setOption: (name: string, value: string, details?: object) => boolean
  }
  const internal = handle.api.internal as unknown as {
    connect: (next: object) => void
    follow: (variant: Variant | null) => void
  }
  internal.connect({
    selector: selectorApi,
    cart: { add: (lines: never, details?: { event?: Event }) => cart.handle.api.add(lines, details) },
    limit: (cart.handle.api.internal as { limit: () => number }).limit(),
  })

  const follow = () => internal.follow(selectorApi.getVariant())
  follow()
  onCleanup((selector.instance as unknown as { subscribe: (l: () => void) => () => void }).subscribe(follow))

  let previous: Variant | null = null
  onCleanup(
    (selector.instance as unknown as { subscribe: (l: () => void) => () => void }).subscribe(() => {
      const variant = selectorApi.getVariant()
      if (previous && variant && previous !== variant && product()?.variants.includes(previous)) {
        const name = variantName(variant)
        announce(variant.availableForSale ? `${name ? `${name}. ` : ""}${money(variant.price)}.` : `${name || "Variant"} is sold out.`)
      }
      previous = variant
    }),
  )

  const [marketKey, setMarketKey] = createSignal(`${shopConfig().country}:${shopConfig().language}`)
  onCleanup(subscribeConfig((cfg) => setMarketKey(`${cfg.country}:${cfg.language}`)))

  let fetchController: AbortController | null = null
  createEffect(
    () => ({
      product: props.product,
      handle: props.handle,
      endpoint: cart.endpoint(),
      market: marketKey(),
    }),
    ({ product: given, handle: nextHandle, endpoint }) => {
      fetchController?.abort()
      if (given || !nextHandle) {
        setError(null)
        return
      }
      const mine = (fetchController = new AbortController())
      setError(null)
      fetchProduct(nextHandle, endpoint, mine.signal)
        .then((next) => {
          if (mine.signal.aborted) return
          setLoaded(next)
          props.onProductLoad?.(next)
        })
        .catch((reason: Error) => {
          if (mine.signal.aborted) return
          setError(reason.message)
        })
    },
  )
  onCleanup(() => fetchController?.abort())

  const variant = () => {
    const state = selectorState()
    return state.variants.find((entry) => entry.id === state.value) ?? null
  }
  const rest = omit(props, "handle", "product", "defaultVariant", "onProductLoad", "children")
  const value: ProductContext = {
    product,
    variant,
    quantity: () => productState().quantity,
    handle,
    selector,
    error: () => error() ?? productState().error,
  }

  return (
    <Context value={value}>
      {usePart(handle, "root", undefined, { "aria-label": product()?.title ?? "Product", ...rest, children: () => props.children } as never, "div")}
    </Context>
  )
}

// One radio group per option. Sold-out values stay choosable and say so;
// a value no variant has is disabled; a value that moves the other options says that.
function VariantSelector(props: { label?: (name: string) => string; swatches?: boolean } & Omit<PartProps<"div">, "children">) {
  const { selector } = useProduct()
  const state = useInstanceState(
    selector.instance as never as { get: () => SelectorState; subscribe: (l: () => void) => () => void },
  )
  const rest = omit(props, "label", "swatches")
  const api = selector.api as unknown as {
    setOption: (name: string, value: string, details?: object) => boolean
    intend: (name: string, value: string, details?: object) => unknown
    valueStatus: (name: string, value: string) => "available" | "sold-out" | "missing"
  }
  const selection = () => selectionOf(state().variants.find((variant) => variant.id === state().value))
  return usePart(
    selector,
    "root",
    undefined,
    {
      "aria-label": "Options",
      ...rest,
      children: () => (
        <For each={choicesOf(state().productOptions)} keyed={(option) => option.name}>
          {(option) => (
            <VariantOption name={option().name}>
              <p data-option-heading>
                <span data-option-name>{props.label?.(option().name) ?? option().name}</span>
                <span data-option-picked>{selection()[option().name]}</span>
              </p>
              <RadioGroup
                aria-label={props.label?.(option().name) ?? option().name}
                value={selection()[option().name] ?? null}
                onValueChange={(value, details) => {
                  if (value == null) return
                  const reason = details.reason === "list-navigation" ? "list-navigation" : "item-press"
                  if (!api.setOption(option().name, String(value), { reason, event: details.event })) details.cancel()
                }}
              >
                <For each={option().values} keyed={(value) => value}>
                  {(value) => {
                    const status = () => (state(), api.valueStatus(option().name, value()))
                    const exists = () => state().variants.some((variant) => matches(variant, { [option().name]: value() }))
                    const color = () => (props.swatches ? swatchOf(option(), value()) : null)
                    const swatchImg = () => (props.swatches ? swatchImageOf(option(), value()) : null)
                    return (
                      <label
                        data-choice
                        data-status={status()}
                        onPointerEnter={(event) => api.intend(option().name, value(), { reason: "pointer", event })}
                        onFocusIn={(event) => api.intend(option().name, value(), { reason: "focus", event })}
                      >
                        <Radio value={value()} disabled={!exists()} />
                        <Show when={color() || swatchImg()}>
                          <span
                            data-swatch
                            aria-hidden="true"
                            style={{
                              ...(color() ? { "--shop-swatch": color()! } : {}),
                              ...(swatchImg() ? { "--shop-swatch-image": `url("${swatchImg()!.url}")` } : {}),
                            }}
                          />
                        </Show>
                        <span data-choice-label>{value()}</span>
                        <span class="visually-hidden">
                          {!exists()
                            ? ", unavailable"
                            : status() === "sold-out"
                              ? ", sold out"
                              : status() === "missing"
                                ? ", changes your other choices"
                                : ""}
                        </span>
                      </label>
                    )
                  }}
                </For>
              </RadioGroup>
            </VariantOption>
          )}
        </For>
      ),
    } as never,
    "div",
  )
}

function VariantOption(props: { name: string } & Omit<PartProps<"div">, "name">) {
  const { selector } = useProduct()
  return usePart(selector, "option", () => ({ name: props.name }), omit(props, "name") as never, "div")
}

function ProductQuantity(props: { label?: string }) {
  const { handle, quantity } = useProduct()
  const cart = useCart()
  return (
    <NumberInput
      value={quantity()}
      min={1}
      max={(cart.handle.api.internal as { limit: () => number }).limit()}
      aria-label={props.label ?? "Quantity"}
      onValueChange={(value, details) => {
        if (value == null) return
        if (!handle.api.setQuantity(value, { event: details.event })) details.cancel()
      }}
    >
      <NumberInputGroup>
        <NumberInputDecrement aria-label="Decrease quantity">−</NumberInputDecrement>
        <NumberInputControl />
        <NumberInputIncrement aria-label="Increase quantity">+</NumberInputIncrement>
      </NumberInputGroup>
    </NumberInput>
  )
}

function AddToCart(
  props: {
    onAdded?: () => void
    children?: (state: { available: boolean; variant: Variant | null }) => JSX.Element
  } & Omit<PartProps<"button">, "children" | "onClick">,
) {
  const { handle, variant, product, quantity } = useProduct()
  const rest = omit(props, "onAdded", "children")
  const available = () => Boolean(variant()?.availableForSale)
  return (
    <Button
      {...(rest as object)}
      disabled={!available()}
      focusableWhenDisabled
      data-product-add=""
      pendingAnnouncement="Adding to bag"
      onClick={async (event: Event) => {
        const chosen = variant()
        try {
          const added = await handle.api.add({ event })
          if (added) {
            const label = variantName(chosen)
            announce(`Added ${quantity()} × ${product()?.title ?? "the item"}${label ? `, ${label}` : ""}.`)
            props.onAdded?.()
          }
        } catch (error) {
          announce(`Could not add to bag. ${(error as Error).message}`)
        }
      }}
    >
      {props.children?.({ available: available(), variant: variant() }) ?? (available() ? "Add to bag" : "Sold out")}
    </Button>
  )
}

export { AddToCart, ProductQuantity, ShopImage, ShopPrice, ShopProduct, useProduct, VariantSelector }
