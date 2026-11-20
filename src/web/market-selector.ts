import { createParts } from "@ui-sdk/web"
import { shopMarketSelector } from "../primitives/market-selector"
import { setText } from "./util"

const parts = createParts(shopMarketSelector, {
  root: {
    tag: "shop-market-selector",
    display: "block",
    api: ["getMarket", "getCountries", "setCountry", "setLanguage", "refresh"],
    render(el, instance) {
      const select = el.querySelector<HTMLSelectElement>("select")
      let lastCountries = ""

      const onChange = (event: Event) => {
        const value = (event.target as HTMLSelectElement).value
        if (value) instance.api.setCountry(value, { reason: "input", event })
      }
      select?.addEventListener("change", onChange)

      const paint = () => {
        const market = instance.api.getMarket()
        setText(el.querySelector("[data-market-label]"), market.currency ? `${market.country} · ${market.currency}` : market.country)
        setText(el.querySelector("[data-market-currency]"), market.currency)
        if (!select) return
        const sig = market.countries.map((c) => `${c.isoCode}:${c.currency.isoCode}`).join(",")
        if (sig !== lastCountries && market.countries.length) {
          lastCountries = sig
          select.replaceChildren(
            ...market.countries.map((c) => {
              const option = document.createElement("option")
              option.value = c.isoCode
              option.textContent = `${c.name} (${c.currency.isoCode} ${c.currency.symbol})`
              return option
            }),
          )
        }
        if (select.value !== market.country) select.value = market.country
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
