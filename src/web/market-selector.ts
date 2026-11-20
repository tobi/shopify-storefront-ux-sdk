import { createParts } from "@ui-sdk/web"
import { shopMarketSelector } from "../primitives/market-selector"
import { setText } from "./util"

const parts = createParts(shopMarketSelector, {
  root: {
    tag: "shop-market-selector",
    display: "block",
    api: ["getMarket", "getCountries", "getChoices", "setCountry", "setLanguage", "refresh"],
    render(el, instance) {
      const select = el.querySelector<HTMLSelectElement>("select")
      let lastChoices = ""

      const onChange = (event: Event) => {
        const value = (event.target as HTMLSelectElement).value
        if (value) instance.api.setCountry(value, { reason: "input", event })
      }
      select?.addEventListener("change", onChange)

      const paint = () => {
        const market = instance.api.getMarket()
        setText(el.querySelector("[data-market-label]"), market.currency ? `${market.currency} ${market.symbol}`.trim() : market.country)
        setText(el.querySelector("[data-market-currency]"), market.currency)
        if (!select) return
        const sig = market.choices.map((c) => `${c.value}:${c.label}`).join("|")
        if (sig !== lastChoices && market.choices.length) {
          lastChoices = sig
          select.replaceChildren(
            ...market.choices.map((c) => {
              const option = document.createElement("option")
              option.value = c.value
              option.textContent = c.label
              return option
            }),
          )
        }
        select.disabled = market.choices.length <= 1
        if (select.value !== market.selectedValue) select.value = market.selectedValue
      }

      paint()
      const unsubscribe = instance.subscribe(paint)
      return () => {
        unsubscribe()
        select?.removeEventListener("change", onChange)
      }
    },
  },
})

export { parts as shopMarketSelectorParts }
