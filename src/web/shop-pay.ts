import { createParts, wrappedButton } from "@ui-sdk/web"
import { shopPay } from "../primitives/shop-pay"
import { setText } from "./util"

const shopPayLockup = `<span class="shop-pay-label">Buy with</span><span class="shop-pay-wordmark" aria-label="Shop Pay"><span class="shop-pay-shop">Shop</span><span class="shop-pay-badge">Pay</span></span>`

const parts = createParts(shopPay, {
  root: {
    tag: "shop-pay",
    display: "block",
    api: ["getUrl", "isReady", "getInstallment", "checkout"],
    render(el, instance) {
      const paint = () => {
        const inst = instance.api.getInstallment()
        for (const btn of el.querySelectorAll<HTMLElement>("shop-pay-button a, shop-pay-button button")) {
          btn.setAttribute("data-shop-pay-button", "")
          if (!btn.textContent?.trim() && !btn.children.length) {
            btn.innerHTML = shopPayLockup
          }
        }
        for (const node of el.querySelectorAll<HTMLElement>("shop-pay-installments")) {
          const target = node.querySelector("[data-text]") ?? node
          setText(target, inst.eligible ? inst.message : "")
        }
      }
      paint()
      return instance.subscribe(paint)
    },
  },
  button: { tag: "shop-pay-button", display: "contents", target: wrappedButton },
  installments: { tag: "shop-pay-installments", display: "block" },
})

export { parts as shopPayParts }
