import { createParts } from "@ui-sdk/web"
import type { Image } from "../images"
import { shopRecommendations } from "../primitives/recommendations"
import type { Money } from "../variants"
import { cloneEach, replaceGenerated, setText } from "./util"

type ShopImageElement = HTMLElement & { image: Image | null }
type PriceElement = HTMLElement & { price: Money | null; compareAtPrice: Money | null }

const parts = createParts(shopRecommendations, {
  root: {
    tag: "shop-recommendations",
    display: "block",
    api: ["getProducts", "refresh"],
    render(el, instance) {
      const host = el.querySelector<HTMLElement>("[data-recommendations-list]") ?? el
      let lastSig = ""
      const paint = () => {
        const products = instance.api.getProducts()
        const sig = products.map((p) => `${p.id}:${p.price.amount}:${p.price.currencyCode}`).join(",")
        if (sig === lastSig) return
        lastSig = sig
        const pattern = el.getAttribute("product-href") ?? "#/products/{handle}"
        const nodes = cloneEach(host, products, (node, product) => {
          const img = node.querySelector<ShopImageElement>("shop-image")
          if (img) img.image = product.featuredImage
          const price = node.querySelector<PriceElement>("shop-price")
          if (price) {
            price.price = product.price
            price.compareAtPrice = product.compareAtPrice
          }
          setText(node.querySelector("[data-recommendation-title]"), product.title)
          setText(node.querySelector("[data-recommendation-vendor]"), product.vendor)
          for (const link of node.querySelectorAll<HTMLAnchorElement>("[data-recommendation-link]")) {
            link.href = pattern.replace("{handle}", encodeURIComponent(product.handle))
          }
        })
        replaceGenerated(host, nodes)
      }
      paint()
      return instance.subscribe(paint)
    },
  },
})

export { parts as shopRecommendationsParts }
