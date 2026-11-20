import { createParts } from "@ui-sdk/web"
import type { Image } from "../images"
import { shopSearch } from "../primitives/search"
import type { Money } from "../variants"
import { cloneEach, replaceGenerated, setText } from "./util"

type ShopImageElement = HTMLElement & { image: Image | null }
type PriceElement = HTMLElement & { price: Money | null; compareAtPrice: Money | null }

const parts = createParts(shopSearch, {
  root: {
    tag: "shop-search",
    display: "block",
    api: ["getResults", "setQuery", "clear", "search"],
    render(el, instance) {
      const input = el.querySelector<HTMLInputElement>("input")
      const productsHost = el.querySelector<HTMLElement>("[data-search-products]")
      let lastSig = ""

      const onInput = (event: Event) => {
        instance.api.setQuery((event.target as HTMLInputElement).value, { reason: "input", event })
      }
      input?.addEventListener("input", onInput)

      const paint = () => {
        const state = instance.get()
        if (input && input.value !== state.query) input.value = state.query
        const status = el.querySelector<HTMLElement>("shop-search-status")
        if (status) {
          const empty = Boolean(state.query.trim()) && state.status === "idle" && !state.products.length && !state.collections.length
          setText(
            status,
            state.status === "loading"
              ? "Searching…"
              : !state.query.trim()
                ? ""
                : empty
                  ? `No results for “${state.query}”.`
                  : `${state.products.length} products found for “${state.query}”.`,
          )
        }
        if (!productsHost) return
        const sig = state.products.map((p) => p.id).join(",")
        if (sig === lastSig) return
        lastSig = sig
        const pattern = el.getAttribute("product-href") ?? "#/products/{handle}"
        const nodes = cloneEach(productsHost, state.products, (node, product) => {
          const img = node.querySelector<ShopImageElement>("shop-image")
          if (img) img.image = product.featuredImage
          const price = node.querySelector<PriceElement>("shop-price")
          if (price) {
            price.price = product.price
            price.compareAtPrice = product.compareAtPrice
          }
          setText(node.querySelector("[data-search-title]"), product.title)
          setText(node.querySelector("[data-search-vendor]"), product.vendor)
          for (const link of node.querySelectorAll<HTMLAnchorElement>("[data-search-link]")) {
            link.href = pattern.replace("{handle}", encodeURIComponent(product.handle))
          }
        })
        replaceGenerated(productsHost, nodes)
      }

      paint()
      const unsubscribe = instance.subscribe(paint)
      return () => {
        unsubscribe()
        input?.removeEventListener("input", onInput)
      }
    },
  },
  status: { tag: "shop-search-status", display: "block" },
})

export { parts as shopSearchParts }
