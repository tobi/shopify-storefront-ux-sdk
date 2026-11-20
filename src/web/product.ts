import "@ui-sdk/web/button"
import "@ui-sdk/web/number-input"
import { createParts } from "@ui-sdk/web"
import { preloadImage, type Image } from "../images"
import { shopBundle, shopProduct, type CartApi, type SelectorApi } from "../primitives/product"
import { announce, fetchProduct, money, type LineInput, type Product } from "../shop"
import { firstAvailable, variantName, type Variant } from "../variants"
import { apiOf, setText } from "./util"

type Field = HTMLElement & { value: number | null }
type ActionDetail = { waitUntil: (promise: Promise<unknown>) => void }
type MediaApi = {
  preloadUrl: (url: string, view?: "main" | "lightbox") => boolean
  setImages: (images: Image[], title?: string, activeUrl?: string) => void
  showImage: (url: string, details?: { reason?: "variant"; event?: Event }) => boolean
}
type PriceElement = HTMLElement & { price: unknown; compareAtPrice: unknown }
type SelectorElement = HTMLElement & { variants: Variant[]; productOptions: Product["options"] }

/** The cart around an element, asked for at the moment it's needed. */
const cartAround = (el: HTMLElement): CartApi => ({
  add: (lines: LineInput[], details?: { event?: Event }) => {
    const cart = el.closest("shop-cart") as (HTMLElement & { api?: CartApi }) | null
    if (!cart?.api) return Promise.reject(new Error("Put this inside a shop-cart"))
    return cart.api.add(lines, details)
  },
})

const endpointAround = (el: HTMLElement) => el.closest("shop-cart")?.getAttribute("endpoint") ?? undefined
const limitAround = (el: HTMLElement) => Number(el.closest("shop-cart")?.getAttribute("max-quantity")) || 10

/** Only the parts that belong to this owner, not to a product or bundle nested inside it. */
function own<T extends Element>(el: HTMLElement, selector: string, owner: string) {
  return [...el.querySelectorAll<T>(selector)].filter((node) => node.parentElement?.closest(owner) === el)
}

/** The SDK's button runs the add, so it goes pending and announces it on its own. */
function wireAdd(button: HTMLElement | null, run: (event?: Event) => Promise<unknown>) {
  if (!button) return () => {}
  const onAction = (event: Event) => {
    const detail = (event as CustomEvent<ActionDetail>).detail
    detail?.waitUntil(run(event))
  }
  button.addEventListener("action", onAction)
  return () => button.removeEventListener("action", onAction)
}

/** A quantity field and a primitive's quantity, each following the other. */
function wireQuantity(field: Field | null, set: (value: number, details: { event?: Event }) => boolean) {
  if (!field) return () => {}
  const onChange = (event: Event) => {
    const detail = (event as CustomEvent<{ value: number | null; event?: Event }>).detail
    if (detail?.value == null) return
    if (!set(detail.value, { event: detail.event })) event.preventDefault()
  }
  field.addEventListener("valuechange", onChange)
  return () => field.removeEventListener("valuechange", onChange)
}

const productParts = createParts(shopProduct, {
  root: {
    tag: "shop-product",
    display: "block",
    api: ["getVariant", "setVariant", "setOption", "setQuantity", "add"],
    render(el, instance) {
      const api = instance.api
      const selectorEl = own<SelectorElement>(el, "shop-variant-selector", "shop-product")[0] ?? null
      const mediaEl = own<HTMLElement>(el, "shop-product-media", "shop-product")[0] ?? null
      const prices = own<PriceElement>(el, "shop-price", "shop-product")
      const quantity = own<Field>(el, "ui-number-input[data-quantity]", "shop-product")[0] ?? null
      const addButton =
        own<HTMLElement>(el, "ui-button[data-product-add]", "shop-product")[0] ??
        (el.querySelector("[data-add]")?.closest("ui-button") as HTMLElement | null)
      const off: (() => void)[] = []
      let cancelled = false
      let shown: Product | null = null
      let shownVariant: Variant | null = null

      const selector: SelectorApi = {
        getValue: () => (selectorEl as unknown as { api?: SelectorApi })?.api?.getValue() ?? null,
        getVariant: () => (selectorEl as unknown as { api?: SelectorApi })?.api?.getVariant() ?? null,
        setValue: (id, details) => (selectorEl as unknown as { api?: SelectorApi })?.api?.setValue(id, details) ?? false,
        setOption: (name, value, details) =>
          (selectorEl as unknown as { api?: SelectorApi })?.api?.setOption(name, value, details) ?? false,
      }
      api.internal.connect({ selector, cart: cartAround(el), limit: limitAround(el) })

      // The product's content, written once per product.
      async function showProduct(product: Product) {
        shown = product
        setText(el.querySelector("[data-product-title]"), product.title)
        setText(el.querySelector("[data-product-vendor]"), product.vendor)
        const description = el.querySelector<HTMLElement>("[data-product-description]")
        // Storefront HTML written by the merchant, from the store's own API.
        if (description) description.innerHTML = product.descriptionHtml
        if (selectorEl) {
          selectorEl.variants = product.variants
          selectorEl.productOptions = product.options
        }
        const variant = selector.getVariant() ?? firstAvailable(product.variants)
        const media = await apiOf<MediaApi>(mediaEl)
        if (cancelled || shown !== product) return
        // Every variant's picture is in the gallery, so choosing one can show it.
        const variantImages = product.variants.flatMap((entry) => (entry.image ? [entry.image] : []))
        media?.setImages(
          [product.featuredImage, ...product.images, ...variantImages],
          product.title,
          variant?.image?.url,
        )
      }

      // Everything that reads the variant follows the selector.
      function showVariant(variant: Variant | null, event?: Event) {
        const previous = shownVariant
        shownVariant = variant
        api.internal.follow(variant)
        for (const price of prices) {
          price.price = variant?.price ?? null
          price.compareAtPrice = variant?.compareAtPrice ?? null
        }
        const stock = el.querySelector<HTMLElement>("[data-product-stock]")
        if (stock) {
          stock.textContent = !variant
            ? ""
            : variant.availableForSale
              ? "In stock · ships in 1–2 business days"
              : "Sold out · join the waitlist"
          stock.classList.toggle("is-out", Boolean(variant && !variant.availableForSale))
        }
        addButton?.toggleAttribute("disabled", !variant?.availableForSale)
        // A choice within the same product is news; a new product is not.
        const sameProduct = previous && variant && shown?.variants.includes(previous) && shown.variants.includes(variant)
        if (sameProduct && previous !== variant) {
          announce(
            variant.availableForSale
              ? `${variantName(variant)}. ${money(variant.price)}.`
              : `${variantName(variant)} is sold out.`,
          )
        }
        if (previous && variant && previous !== variant && variant.image) {
          void apiOf<MediaApi>(mediaEl).then((media) =>
            media?.showImage(variant.image!.url, { reason: "variant", event }),
          )
        }
      }

      function paint() {
        const state = instance.get()
        if (state.product && state.product !== shown) void showProduct(state.product)
        if (quantity && quantity.value !== state.quantity) quantity.value = state.quantity
      }

      // `handle` loads the product from the cart's store when no `product` was given.
      const handle = el.getAttribute("handle")
      if (handle && !instance.get().product) {
        void fetchProduct(handle, endpointAround(el)).then((product) => {
          if (!cancelled && !instance.get().product) (el as HTMLElement & { product: Product }).product = product
        })
      }

      void apiOf<SelectorApi & { subscribe: (listener: (variant: Variant | null) => void) => () => void }>(
        selectorEl,
      ).then((found) => {
        if (!found || cancelled) return
        showVariant(found.getVariant())
        off.push(found.subscribe((variant) => showVariant(variant)))
      })

      // A value that would choose a variant with another image fetches that
      // image for the gallery, before the press that shows it.
      const onIntent = (event: Event) => {
        const id = (event as CustomEvent<{ value: string }>).detail?.value
        const image = shown?.variants.find((variant) => variant.id === id)?.image
        if (image) void apiOf<MediaApi>(mediaEl).then((media) => media?.preloadUrl(image.url))
      }
      selectorEl?.addEventListener("valueintent", onIntent)
      off.push(() => selectorEl?.removeEventListener("valueintent", onIntent))

      off.push(wireQuantity(quantity, (value, details) => api.setQuantity(value, details)))
      off.push(
        wireAdd(addButton, async (event) => {
          const variant = api.getVariant()
          try {
            const added = await api.add({ event })
            if (added) {
              announce(
                `Added ${instance.get().quantity} × ${shown?.title ?? "the item"}${variant ? `, ${variantName(variant)}` : ""}.`,
              )
            }
          } catch (error) {
            announce(`Could not add to bag. ${(error as Error).message}`)
            throw error
          }
        }),
      )

      paint()
      const unsubscribe = instance.subscribe(paint)
      return () => {
        cancelled = true
        unsubscribe()
        for (const dispose of off.splice(0)) dispose()
      }
    },
  },
})

// ------------------------------------------------------------------ bundle

type ItemElement = HTMLElement & { getAttribute(name: "value" | "handle"): string | null }

const bundleParts = createParts(shopBundle, {
  root: {
    tag: "shop-bundle",
    display: "block",
    api: ["getItems", "setVariant", "setOption", "setQuantity", "add"],
    render(el, instance) {
      const api = instance.api
      api.internal.connect({ cart: cartAround(el) })
      const items = [...el.querySelectorAll<ItemElement>("shop-bundle-item")]
      const quantity = own<Field>(el, "ui-number-input[data-quantity]", "shop-bundle")[0] ?? null
      const total = el.querySelector<PriceElement>("shop-price[data-bundle-total]")
      const addButton = el.querySelector<HTMLElement>("ui-button[data-bundle-add]")
      const status = el.querySelector<HTMLElement>("[data-bundle-status]")
      const titles = new Map<string, string>()
      const off: (() => void)[] = []
      let cancelled = false

      function paint() {
        const state = instance.get()
        const chosen = Object.values(state.items)
        const ready = chosen.length === items.length && chosen.every((variant) => variant?.availableForSale)
        const first = chosen.find(Boolean)
        if (total && first) {
          const sum = chosen.reduce((acc, variant) => acc + Number(variant?.price.amount ?? 0), 0)
          total.price = { amount: String(sum * state.quantity), currencyCode: first.price.currencyCode }
          total.compareAtPrice = null
        }
        addButton?.toggleAttribute("disabled", !ready)
        const waiting = Object.entries(state.items)
          .filter(([, variant]) => !variant?.availableForSale)
          .map(([key]) => titles.get(key) ?? key)
        setText(
          status,
          chosen.length < items.length
            ? "Loading the set…"
            : waiting.length
              ? `Choose an available option for ${waiting.join(" and ")}.`
              : `${items.length} items, added together.`,
        )
        if (quantity && quantity.value !== state.quantity) quantity.value = state.quantity
      }

      for (const item of items) {
        const key = item.getAttribute("value") ?? ""
        const selectorEl = item.querySelector<SelectorElement>("shop-variant-selector")
        const image = item.querySelector<HTMLElement & { image: Image | null; alt?: string }>("shop-image")
        const price = item.querySelector<PriceElement>("shop-price")
        const show = (variant: Variant | null, product?: Product) => {
          api.internal.follow(key, variant)
          if (price) {
            price.price = variant?.price ?? null
            price.compareAtPrice = variant?.compareAtPrice ?? null
          }
          const picture = variant?.image ?? product?.featuredImage
          if (image && picture) image.image = picture
          item.toggleAttribute("data-sold-out", Boolean(variant && !variant.availableForSale))
        }
        // The item's picture follows its variant: fetch the one a value would show.
        let variants: Variant[] = []
        const onIntent = (event: Event) => {
          const id = (event as CustomEvent<{ value: string }>).detail?.value
          const next = variants.find((variant) => variant.id === id)?.image
          if (next && next.url !== image?.image?.url) {
            preloadImage(next, { sizes: image?.getAttribute("sizes") ?? "100vw" })
          }
        }
        selectorEl?.addEventListener("valueintent", onIntent)
        off.push(() => selectorEl?.removeEventListener("valueintent", onIntent))
        const handle = item.getAttribute("handle")
        const load = handle
          ? fetchProduct(handle, endpointAround(el))
          : Promise.resolve(null)
        void Promise.all([load, apiOf<SelectorApi & { subscribe: (l: (v: Variant | null) => void) => () => void }>(selectorEl)])
          .then(([product, selector]) => {
            if (cancelled || !selector) return
            off.push(api.internal.register(key, selector))
            if (product) {
              variants = product.variants
              titles.set(key, product.title)
              setText(item.querySelector("[data-bundle-item-title]"), product.title)
              if (selectorEl) {
                selectorEl.variants = product.variants
                selectorEl.productOptions = product.options
              }
            }
            show(selector.getVariant(), product ?? undefined)
            off.push(selector.subscribe((variant) => show(variant, product ?? undefined)))
          })
          .catch((error: Error) => setText(status, `This set could not load: ${error.message}`))
      }

      off.push(wireQuantity(quantity, (value, details) => api.setQuantity(value, details)))
      off.push(
        wireAdd(addButton, async (event) => {
          try {
            const added = await api.add({ event })
            if (added) {
              const state = instance.get()
              announce(`Added ${state.title}: ${[...titles.values()].join(" and ")}, ${money(total?.price as never)}.`)
            }
          } catch (error) {
            announce(`Could not add the set. ${(error as Error).message}`)
            throw error
          }
        }),
      )

      paint()
      const unsubscribe = instance.subscribe(paint)
      return () => {
        cancelled = true
        unsubscribe()
        for (const dispose of off.splice(0)) dispose()
      }
    },
  },
  item: { tag: "shop-bundle-item", display: "block" },
})

export { bundleParts as shopBundleParts, productParts as shopProductParts }
