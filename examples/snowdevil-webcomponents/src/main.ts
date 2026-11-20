import "@ui-sdk/web/drawer"
import "@ui-sdk/web/radio"
import "@ui-sdk/web/segmented-control"
import { createAgent } from "@ui-sdk/web/agent"
import "shopify-storefront-ux-sdk"
import "shopify-storefront-ux-sdk/styles.css"

const agent = createAgent({ allow: (step) => (step.confirm ? window.confirm(step.confirm) : true) })
Object.assign(window, { agent })

type DrawerEl = HTMLElement & { open: boolean }
type CatalogEl = HTMLElement & {
  api?: {
    setFilter: (filter: string | null) => boolean
    setQuery: (query: string) => boolean
    setOnSale: (onSale: boolean) => boolean
    setSort: (sort: string) => boolean
  }
}

const drawer = document.querySelector<DrawerEl>("ui-drawer")!
const catalog = document.querySelector<CatalogEl>("shop-catalog")!
const product = document.querySelector<HTMLElement>("shop-product")!
const homeView = document.getElementById("view-home")!
const productView = document.getElementById("view-product")!

// Bag drawer triggers
document.querySelector(".bag-open")?.addEventListener("action", () => (drawer.open = true))
product.addEventListener("addcomplete", () => (drawer.open = true))
catalog.addEventListener("quickadd", () => (drawer.open = true))

// Catalog controls
document.querySelector("ui-segmented-control")?.addEventListener("valuechange", (event) => {
  const value = (event as CustomEvent<{ value: string }>).detail?.value
  catalog.api?.setFilter(value === "all" ? null : value)
})

let searchTimer: ReturnType<typeof setTimeout> | undefined
document.querySelector<HTMLInputElement>("[data-search]")?.addEventListener("input", (event) => {
  const value = (event.target as HTMLInputElement).value
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => catalog.api?.setQuery(value), 200)
})

const saleToggle = document.querySelector<HTMLButtonElement>("[data-sale-toggle]")
saleToggle?.addEventListener("click", () => {
  const next = saleToggle.getAttribute("aria-pressed") !== "true"
  saleToggle.setAttribute("aria-pressed", String(next))
  catalog.api?.setOnSale(next)
})

document.querySelector<HTMLSelectElement>("[data-sort]")?.addEventListener("change", (event) => {
  catalog.api?.setSort((event.target as HTMLSelectElement).value)
})

// Simple hash router
function syncRoute() {
  const match = location.hash.match(/^#\/products\/([\w-]+)/)
  if (match) {
    homeView.hidden = true
    productView.hidden = false
    product.setAttribute("handle", match[1]!)
    drawer.open = false
  } else {
    homeView.hidden = false
    productView.hidden = true
  }
  window.scrollTo({ top: 0, behavior: "instant" })
}

window.addEventListener("hashchange", syncRoute)
syncRoute()
