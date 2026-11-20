import "@ui-sdk/web/select"
import { createParts } from "@ui-sdk/web"
import { loadDirectory, type MockShop } from "../directory"
import { groupedStores, shopStorePicker, storePickerSelect, type SelectPart } from "../primitives/store-picker"

const parts = createParts(shopStorePicker, {
  root: {
    tag: "shop-store-picker",
    display: "block",
    render(el) {
      const found = el.querySelector<SelectPart>(storePickerSelect)
      if (!found) return
      const select: SelectPart = found
      let stores: MockShop[] = []
      // An endpoint the page writes is a state to show, not a person choosing.
      let silent = false

      function show(endpoint: string | null) {
        if (!endpoint || !stores.length) return
        if (select.api?.getValue() === endpoint) return
        silent = true
        if (select.api) select.api.setValue(endpoint, { reason: "imperative" })
        else select.value = endpoint
        silent = false
      }

      function choose(event: Event) {
        const endpoint = (event as CustomEvent<{ value: string | null }>).detail?.value
        if (!endpoint) return
        if (el.getAttribute("endpoint") !== endpoint) el.setAttribute("endpoint", endpoint)
        if (silent) return
        const store = stores.find((entry) => entry.endpoint === endpoint)
        el.dispatchEvent(
          new CustomEvent("storechange", {
            bubbles: true,
            detail: { endpoint, host: store?.host ?? "", name: store?.name ?? "" },
          }),
        )
      }

      select.addEventListener("valuechange", choose)
      const observer = new MutationObserver(() => show(el.getAttribute("endpoint")))
      observer.observe(el, { attributes: true, attributeFilter: ["endpoint"] })

      let cancelled = false
      loadDirectory()
        .then((found) => {
          if (cancelled) return
          stores = found
          select.items = groupedStores(found)
          show(el.getAttribute("endpoint"))
        })
        .catch((error: Error) => {
          el.setAttribute("data-error", error.message)
        })

      return () => {
        cancelled = true
        observer.disconnect()
        select.removeEventListener("valuechange", choose)
      }
    },
  },
})

export { parts as shopStorePickerParts }
