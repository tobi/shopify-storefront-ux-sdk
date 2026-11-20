import { createParts } from "@ui-sdk/web"
import { shopPromise } from "../primitives/shop-promise"
import { setText } from "./util"

const parts = createParts(shopPromise, {
  root: {
    tag: "shop-promise",
    display: "block",
    api: ["getEstimate", "isEligible"],
    render(el, instance) {
      const paint = () => {
        const estimate = instance.api.getEstimate()
        setText(el.querySelector("[data-promise-date]"), estimate.dateText)
        const target = el.querySelector("[data-promise-message]") ?? (!el.querySelector("[data-promise-date]") ? el : null)
        if (target) setText(target, estimate.message)
      }
      paint()
      return instance.subscribe(paint)
    },
  },
})

export { parts as shopPromiseParts }
