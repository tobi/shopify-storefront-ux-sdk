import { createParts } from "@ui-sdk/web"
import { shopPrice } from "../primitives/price"
import { money } from "../shop"
import { setText } from "./util"

const textOf = (part: Element) => part.querySelector("[data-text]") ?? part

const parts = createParts(shopPrice, {
  root: {
    tag: "shop-price",

    api: ["getPrice", "isOnSale"],
    // Text is content, not an attribute: the data element writes it.
    render(el, instance) {
      const paint = () => {
        const { price, compareAtPrice } = instance.get()
        const sale = instance.api.isOnSale()
        for (const amount of el.querySelectorAll("shop-price-amount")) setText(textOf(amount), money(price))
        for (const compare of el.querySelectorAll("shop-price-compare")) {
          setText(textOf(compare), sale ? money(compareAtPrice) : "")
        }
      }
      paint()
      return instance.subscribe(paint)
    },
  },
  amount: "shop-price-amount",
  compare: "shop-price-compare",
})

export { parts as shopPriceParts }
