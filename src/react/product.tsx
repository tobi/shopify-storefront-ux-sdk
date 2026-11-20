import { Button } from "@ui-sdk/react/button"
import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from "@ui-sdk/react/number-input"
import { usePart, usePrimitive, type PartProps, type PrimitiveHandle } from "@ui-sdk/react/primitive"
import { Radio, RadioGroup } from "@ui-sdk/react/radio"
import * as React from "react"
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
import { useCart } from "./cart"
import { useInstanceState } from "./use-state"

// ------------------------------------------------------------------ image

function ShopImage({
  image,
  alt,
  sizes,
  widths,
  loading,
  priority,
  ...rest
}: { image: Image | null | undefined } & ImageAttrOptions &
  Omit<React.ImgHTMLAttributes<HTMLImageElement>, "loading" | "src" | "srcSet">) {
  const attrs = imageAttrs(image ?? null, { alt, sizes, widths, loading, priority })
  return (
    <img
      {...rest}
      src={attrs.src}
      srcSet={attrs.srcset}
      sizes={attrs.sizes}
      width={attrs.width}
      height={attrs.height}
      alt={attrs.alt}
      loading={attrs.loading}
      fetchPriority={attrs.fetchpriority as "high" | "low" | undefined}
      decoding="async"
      hidden={!image}
      data-shop-image=""
    />
  )
}

// ------------------------------------------------------------------ price

function ShopPrice({
  price,
  compareAtPrice,
  from,
  showSavings,
  ...rest
}: {
  price: Money | null | undefined
  compareAtPrice?: Money | null
  from?: boolean
  showSavings?: boolean
} & Omit<PartProps<"p">, "children">) {
  const handle = usePrimitive(shopPrice, {
    price: price ?? null,
    compareAtPrice: compareAtPrice ?? null,
  })
  return usePart(
    handle,
    "root",
    {},
    {
      ...rest,
      children: (state: ShopPriceState) => (
        <>
          <span data-price-amount="">
            <span className="visually-hidden">{state.onSale ? "Sale price " : "Price "}</span>
            {from ? "from " : ""}
            {state.text}
          </span>
          {state.onSale && (
            <s data-price-compare="">
              <span className="visually-hidden">Regular price </span>
              {state.compareText}
            </s>
          )}
          {showSavings && state.onSale && state.discountPercent && (
            <span data-price-savings="">
              Save {state.savingsText} · {state.discountPercent}% off
            </span>
          )}
        </>
      ),
    } as never,
    "p",
  )
}

// ---------------------------------------------------------------- product

type ProductContextValue = {
  product: Product | null
  variant: Variant | null
  quantity: number
  handle: PrimitiveHandle<typeof shopProduct>
  selector: PrimitiveHandle<typeof shopVariantSelector>
  error: string | null
}

const ProductContext = React.createContext<ProductContextValue | null>(null)

function useProduct() {
  const context = React.useContext(ProductContext)
  if (!context) throw new Error("Put this inside <ShopProduct>")
  return context
}

type ProductState = {
  product: Product | null
  quantity: number
  variant: Variant | null
  pending: boolean
  error: string | null
}
type SelectorState = { value: string | null; variants: Variant[]; productOptions: ProductOption[] }

function ShopProduct({
  handle: productHandle,
  product: givenProduct,
  defaultVariant,
  onProductLoad,
  children,
  ...rest
}: {
  handle?: string
  product?: Product | null
  defaultVariant?: string
  onProductLoad?: (product: Product) => void
  children?: React.ReactNode
} & Omit<PartProps<"div">, "children">) {
  const cart = useCart()
  const [loaded, setLoaded] = React.useState<Product | null>(givenProduct ?? null)
  const [error, setError] = React.useState<string | null>(null)
  const [marketKey, setMarketKey] = React.useState(() => `${shopConfig().country}:${shopConfig().language}`)
  const product = givenProduct ?? loaded

  React.useEffect(() => {
    return subscribeConfig((cfg) => setMarketKey(`${cfg.country}:${cfg.language}`))
  }, [])

  const onLoadRef = React.useRef(onProductLoad)
  onLoadRef.current = onProductLoad

  React.useEffect(() => {
    if (givenProduct || !productHandle) {
      setError(null)
      return
    }
    const controller = new AbortController()
    setError(null)
    setLoaded((prev) => (prev?.handle === productHandle ? prev : null))
    fetchProduct(productHandle, cart.endpoint, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return
        setLoaded(next)
        onLoadRef.current?.(next)
      })
      .catch((reason: Error) => {
        if (controller.signal.aborted) return
        setError(reason.message)
      })
    return () => controller.abort()
  }, [givenProduct, productHandle, cart.endpoint, marketKey])

  const handle = usePrimitive(shopProduct, { product })
  const selector = usePrimitive(shopVariantSelector, {
    variants: product?.variants ?? [],
    productOptions: product?.options ?? [],
    defaultValue: defaultVariant,
    onValueIntent: (id: string) => {
      const image = product?.variants.find((v) => v.id === id)?.image
      if (image) preloadImage(image, { sizes: "(max-width: 900px) 100vw, 50vw" })
    },
  })

  const productState = useInstanceState(
    handle.instance as never as { get: () => ProductState; subscribe: (l: () => void) => () => void },
  )
  const selectorState = useInstanceState(
    selector.instance as never as { get: () => SelectorState; subscribe: (l: () => void) => () => void },
  )

  const variant = React.useMemo(
    () => selectorState.variants.find((entry) => entry.id === selectorState.value) ?? null,
    [selectorState.variants, selectorState.value],
  )

  React.useEffect(() => {
    const internal = handle.api.internal as unknown as {
      connect: (next: object) => void
      follow: (v: Variant | null) => void
    }
    internal.connect({
      selector: selector.api,
      cart: { add: (lines: never, details?: { event?: Event }) => cart.handle.api.add(lines, details) },
      limit: (cart.handle.api.internal as { limit: () => number }).limit(),
    })
    internal.follow(variant)
  }, [handle, selector, cart.handle, variant])

  const prevVariantRef = React.useRef<Variant | null>(null)
  React.useEffect(() => {
    const previous = prevVariantRef.current
    if (previous && variant && previous !== variant && product?.variants.includes(previous)) {
      const name = variantName(variant)
      announce(
        variant.availableForSale
          ? `${name ? `${name}. ` : ""}${money(variant.price)}.`
          : `${name || "Variant"} is sold out.`,
      )
    }
    prevVariantRef.current = variant
  }, [variant, product])

  const value = React.useMemo<ProductContextValue>(
    () => ({
      product,
      variant,
      quantity: productState.quantity,
      handle,
      selector,
      error: error ?? productState.error,
    }),
    [product, variant, productState.quantity, productState.error, handle, selector, error],
  )

  return (
    <ProductContext.Provider value={value}>
      {usePart(handle, "root", {}, { "aria-label": product?.title ?? "Product", ...rest, children } as never, "div")}
    </ProductContext.Provider>
  )
}

function VariantOption({ name, ...rest }: { name: string } & Omit<PartProps<"div">, "name">) {
  const { selector } = useProduct()
  return usePart(selector, "option", { name }, rest as never, "div")
}

function VariantSelector({
  label,
  swatches,
  ...rest
}: { label?: (name: string) => string; swatches?: boolean } & Omit<PartProps<"div">, "children">) {
  const { selector } = useProduct()
  const state = useInstanceState(
    selector.instance as never as { get: () => SelectorState; subscribe: (l: () => void) => () => void },
  )
  const api = selector.api as unknown as {
    setOption: (name: string, value: string, details?: object) => boolean
    intend: (name: string, value: string, details?: object) => unknown
    valueStatus: (name: string, value: string) => "available" | "sold-out" | "missing"
  }
  const selection = selectionOf(state.variants.find((variant) => variant.id === state.value))

  return usePart(
    selector,
    "root",
    {},
    {
      "aria-label": "Options",
      ...rest,
      children: choicesOf(state.productOptions).map((option) => (
        <VariantOption key={option.name} name={option.name}>
          <p data-option-heading="">
            <span data-option-name="">{label?.(option.name) ?? option.name}</span>
            <span data-option-picked="">{selection[option.name]}</span>
          </p>
          <RadioGroup
            aria-label={label?.(option.name) ?? option.name}
            value={selection[option.name] ?? undefined}
            onValueChange={(value, details) => {
              if (value == null) return
              const reason = details.reason === "list-navigation" ? "list-navigation" : "item-press"
              if (!api.setOption(option.name, String(value), { reason, event: details.event })) details.cancel()
            }}
          >
            {option.values.map((value) => {
              const status = api.valueStatus(option.name, value)
              const exists = state.variants.some((variant) => matches(variant, { [option.name]: value }))
              const color = swatches ? swatchOf(option, value) : null
              const swatchImg = swatches ? swatchImageOf(option, value) : null
              return (
                <label
                  key={value}
                  data-choice=""
                  data-status={status}
                  onPointerEnter={(event) => api.intend(option.name, value, { reason: "pointer", event: event.nativeEvent })}
                  onFocus={(event) => api.intend(option.name, value, { reason: "focus", event: event.nativeEvent })}
                >
                  <Radio value={value} disabled={!exists} />
                  {(color || swatchImg) && (
                    <span
                      data-swatch=""
                      aria-hidden="true"
                      style={
                        {
                          ...(color ? { "--shop-swatch": color } : {}),
                          ...(swatchImg ? { "--shop-swatch-image": `url("${swatchImg.url}")` } : {}),
                        } as React.CSSProperties
                      }
                    />
                  )}
                  <span data-choice-label="">{value}</span>
                  <span className="visually-hidden">
                    {!exists
                      ? ", unavailable"
                      : status === "sold-out"
                        ? ", sold out"
                        : status === "missing"
                          ? ", changes your other choices"
                          : ""}
                  </span>
                </label>
              )
            })}
          </RadioGroup>
        </VariantOption>
      )),
    } as never,
    "div",
  )
}

function ProductQuantity({ label = "Quantity" }: { label?: string }) {
  const { handle, quantity } = useProduct()
  const cart = useCart()
  return (
    <NumberInput
      value={quantity}
      min={1}
      max={(cart.handle.api.internal as { limit: () => number }).limit()}
      aria-label={label}
      onValueChange={(value, details) => {
        if (value == null) return
        if (!handle.api.setQuantity(value, { event: details.event })) details.cancel()
      }}
    >
      <NumberInputGroup>
        <NumberInputDecrement aria-label="Decrease quantity">−</NumberInputDecrement>
        <NumberInputControl aria-label={label} />
        <NumberInputIncrement aria-label="Increase quantity">+</NumberInputIncrement>
      </NumberInputGroup>
    </NumberInput>
  )
}

function AddToCart({
  onAdded,
  children,
  ...rest
}: {
  onAdded?: () => void
  children?: (state: { available: boolean; variant: Variant | null }) => React.ReactNode
} & Omit<PartProps<"button">, "children" | "onClick">) {
  const { handle, variant, product, quantity } = useProduct()
  const available = Boolean(variant?.availableForSale)
  return (
    <Button
      {...(rest as object)}
      disabled={!available}
      focusableWhenDisabled
      data-product-add=""
      pendingAnnouncement="Adding to bag"
      onClick={async (event) => {
        try {
          const added = await handle.api.add({ event: event.nativeEvent })
          if (added) {
            const label = variantName(variant)
            announce(`Added ${quantity} × ${product?.title ?? "the item"}${label ? `, ${label}` : ""}.`)
            onAdded?.()
          }
        } catch (error) {
          announce(`Could not add to bag. ${(error as Error).message}`)
        }
      }}
    >
      {children?.({ available, variant }) ?? (available ? "Add to bag" : "Sold out")}
    </Button>
  )
}

export { AddToCart, ProductQuantity, ShopImage, ShopPrice, ShopProduct, useProduct, VariantOption, VariantSelector }
