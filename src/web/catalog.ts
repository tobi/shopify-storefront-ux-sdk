import { createParts } from "@ui-sdk/web"
import type { Image } from "../images"
import { shopCatalog, visibleProducts, type CatalogProduct } from "../primitives/catalog"
import type { CartApi } from "../primitives/product"
import { discountPercent, type Money } from "../variants"
import { cloneEach, replaceGenerated, setText } from "./util"

type ShopImageElement = HTMLElement & { image: Image | null }
type PriceElement = HTMLElement & { price: Money | null; compareAtPrice: Money | null }

const singleAvailableVariantId = (product: CatalogProduct): string | null => {
  if (!product.availableForSale || !product.variants.length) return null
  if (product.variants.length === 1) return product.variants[0]!.availableForSale ? product.variants[0]!.id : null
  const available = product.variants.filter((v) => v.availableForSale)
  return available.length === 1 ? available[0]!.id : null
}

const parts = createParts(shopCatalog, {
  root: {
    tag: "shop-catalog",
    display: "block",
    api: [
      "getProducts",
      "getCollection",
      "getFilters",
      "setQuery",
      "setFilter",
      "setVendor",
      "setOnSale",
      "setSort",
      "reset",
      "loadMore",
      "refresh",
    ],
    render(el, instance) {
      const resultsHost = el.querySelector<HTMLElement>("shop-catalog-results")
      const loadMoreBtn = el.querySelector<HTMLElement>("[data-catalog-load-more]")
      let lastSignature = ""
      const off: (() => void)[] = []

      const onLoadMore = () => {
        void instance.api.loadMore()
      }
      if (loadMoreBtn) {
        loadMoreBtn.addEventListener("click", onLoadMore)
        off.push(() => loadMoreBtn.removeEventListener("click", onLoadMore))
      }

      const hrefPattern = () => el.getAttribute("product-href") ?? "#/products/{handle}"

      const paint = () => {
        const state = instance.get()
        const shown = visibleProducts(state)
        const statusPart = el.querySelector<HTMLElement>("shop-catalog-status")
        if (statusPart) {
          const count = shown.length
          const noun = count === 1 ? "product" : "products"
          const scope = [
            state.collectionInfo?.title,
            state.vendor,
            state.filter,
            state.onSale && "On sale",
            state.query && `matching “${state.query}”`,
          ]
            .filter(Boolean)
            .join(" · ")
          setText(
            statusPart,
            state.status === "loading"
              ? "Loading products…"
              : state.status === "error"
                ? `Products could not load. ${state.error ?? ""}`.trim()
                : `${count}${state.hasNext ? "+" : ""} ${noun}${scope ? ` · ${scope}` : ""}`,
          )
        }

        if (loadMoreBtn) {
          loadMoreBtn.hidden = !state.hasNext
          loadMoreBtn.toggleAttribute("disabled", state.status === "loading")
        }

        if (!resultsHost) return
        const signature = JSON.stringify(
          shown.map((p) => [p.id, p.price.amount, p.price.currencyCode, p.compareAtPrice?.amount, p.availableForSale]),
        )
        if (signature === lastSignature) return
        lastSignature = signature

        const pattern = hrefPattern()
        const nodes = cloneEach(resultsHost, shown, (node, product) => {
          node.setAttribute("data-handle", product.handle)
          node.toggleAttribute("data-sold-out", !product.availableForSale)
          const img = node.querySelector<ShopImageElement>("shop-image")
          if (img) img.image = product.featuredImage
          const price = node.querySelector<PriceElement>("shop-price")
          if (price) {
            price.price = product.price
            price.compareAtPrice = product.compareAtPrice
          }
          setText(node.querySelector("[data-catalog-title]"), product.title)
          setText(node.querySelector("[data-catalog-vendor]"), product.vendor)
          setText(node.querySelector("[data-catalog-type]"), product.productType)
          for (const link of node.querySelectorAll<HTMLAnchorElement>("[data-catalog-link]")) {
            link.href = pattern.replace("{handle}", encodeURIComponent(product.handle))
          }
          const pct = discountPercent(product.price, product.compareAtPrice)
          const saleBadge = node.querySelector<HTMLElement>("[data-catalog-badge-sale]")
          if (saleBadge) {
            saleBadge.hidden = !product.availableForSale || !pct
            if (pct) setText(saleBadge, `-${pct}%`)
          }
          const outBadge = node.querySelector<HTMLElement>("[data-catalog-badge-sold-out]")
          if (outBadge) outBadge.hidden = product.availableForSale

          const quickAdd = node.querySelector<HTMLButtonElement>("[data-catalog-quick-add]")
          if (quickAdd) {
            const vid = singleAvailableVariantId(product)
            quickAdd.hidden = !vid
            if (vid) {
              quickAdd.setAttribute("aria-label", `Quick add ${product.title} to bag`)
              quickAdd.addEventListener("click", (event) => {
                event.preventDefault()
                const cart = el.closest("shop-cart") as (HTMLElement & { api?: CartApi }) | null
                if (!cart?.api) return
                quickAdd.disabled = true
                void cart.api
                  .add([{ variantId: vid, quantity: 1 }], { event })
                  .then(() => {
                    el.dispatchEvent(new CustomEvent("quickadd", { bubbles: true, detail: { product, variantId: vid } }))
                  })
                  .finally(() => {
                    quickAdd.disabled = false
                  })
              })
            }
          }
        })
        replaceGenerated(resultsHost, nodes)
      }

      paint()
      const unsubscribe = instance.subscribe(paint)
      return () => {
        unsubscribe()
        for (const dispose of off.splice(0)) dispose()
      }
    },
  },
  results: { tag: "shop-catalog-results", display: "block" },
  empty: { tag: "shop-catalog-empty", display: "block" },
  status: { tag: "shop-catalog-status", display: "block" },
})

export { parts as shopCatalogParts }
