import { createParts } from "@ui-sdk/web"
import { shopVariantSelector } from "../primitives/variant-selector"
import { matches, selectionOf, swatchOf, type ProductOption } from "../variants"
import { cloneEach, replaceGenerated, setText } from "./util"

/** The SDK's single-choice controls: each has a `value` property and fires `valuechange`. */
const controls = "ui-radio-group, ui-segmented-control"
const items = "ui-radio, ui-segmented-control-item"

type Control = HTMLElement & { value: unknown }
type Built = { name: string; node: HTMLElement; control: Control | null }
type Instance = {
  api: {
    intend: (name: string, value: string, details?: { reason?: "pointer" | "focus"; event?: Event }) => unknown
    setOption: (
      name: string,
      value: string,
      details?: { reason?: "item-press" | "list-navigation"; event?: Event },
    ) => boolean
    getSelection: () => Record<string, string>
  }
}

const built = new WeakMap<HTMLElement, { signature: string; options: Built[]; instance: Instance | null }>()

/** One option's values, from the control's own template: the author's markup, filled in. */
function fillValues(control: Control, option: ProductOption, cache: { instance: Instance | null }) {
  const nodes = cloneEach(control, option.values, (node, value) => {
    // Intent: a value under the pointer or focus says what it would choose.
    const intend = (reason: "pointer" | "focus") => (event: Event) =>
      cache.instance?.api.intend(option.name, value, { reason, event })
    node.addEventListener("pointerenter", intend("pointer"))
    node.addEventListener("focusin", intend("focus"))
    const item = node.matches(items) ? node : node.querySelector(items)
    item?.setAttribute("value", value)
    setText(node.querySelector("[data-option-label]"), value)
    const swatch = node.querySelector<HTMLElement>("[data-option-swatch]")
    if (swatch) {
      const color = swatchOf(option, value)
      swatch.hidden = !color
      if (color) swatch.style.setProperty("--shop-swatch", color)
    }
  })
  replaceGenerated(control, nodes)
}

const parts = createParts(shopVariantSelector, {
  root: {
    tag: "shop-variant-selector",
    display: "block",
    api: ["getValue", "getVariant", "getSelection", "setValue", "setOption", "valueStatus", "findVariant", "preview", "intend", "subscribe"],
    render(el, instance) {
      const host = el.querySelector<HTMLElement>("[data-variant-options]") ?? el
      const cache = built.get(el) ?? { signature: "", options: [], instance: null }
      built.set(el, cache)
      cache.instance = instance

      // A new set of options, like another product's: one option part each.
      function build() {
        const { productOptions } = instance.get()
        const signature = JSON.stringify(productOptions.map((option) => [option.name, option.values]))
        if (signature === cache.signature) return
        cache.signature = signature
        const nodes = cloneEach(host, productOptions, (node, option) => {
          node.setAttribute("name", option.name)
          setText(node.querySelector("[data-option-name]"), option.name)
        })
        replaceGenerated(host, nodes)
        cache.options = nodes.map((node, index) => {
          const option = productOptions[index]
          const control = node.querySelector<Control>(controls)
          if (control) {
            control.setAttribute("data-options", option.name)
            if (!control.hasAttribute("aria-label") && !control.hasAttribute("aria-labelledby")) {
              control.setAttribute("aria-label", option.name)
            }
            fillValues(control, option, cache)
            // The control's change is a request for the variant that keeps it.
            control.addEventListener("valuechange", (event) => {
              const detail = (event as CustomEvent<{ value: unknown; reason?: string; event?: Event }>).detail
              if (detail?.value == null || !cache.instance) return
              const api = cache.instance.api
              const value = String(detail.value)
              const reason = detail.reason === "list-navigation" ? "list-navigation" : "item-press"
              const accepted = api.setOption(option.name, value, { reason, event: detail.event })
              if (!accepted && api.getSelection()[option.name] !== value) event.preventDefault()
            })
          }
          return { name: option.name, node, control }
        })
      }

      // Each control shows what the variant says, and each value how it stands.
      function paint() {
        build()
        const state = instance.get()
        const selection = selectionOf(state.variants.find((variant) => variant.id === state.value))
        for (const { name, node, control } of cache.options) {
          const chosen = selection[name] ?? ""
          // Writing the property fires no event, so the page never hears itself.
          if (control && control.value !== chosen) control.value = chosen
          setText(node.querySelector("[data-picked]"), chosen)
          for (const item of control?.querySelectorAll<HTMLElement>(items) ?? []) {
            const value = item.getAttribute("value") ?? ""
            const status = instance.api.valueStatus(name, value)
            const wrapper = item.closest<HTMLElement>("[data-generated]") ?? item
            wrapper.setAttribute("data-status", status)
            // Every value a variant has stays choosable. Sold out says so; a
            // value the other options don't come in says choosing it moves
            // them. Only a value no variant has at all is disabled.
            const exists = state.variants.some((variant) => matches(variant, { [name]: value }))
            item.toggleAttribute("disabled", !exists)
            setText(
              wrapper.querySelector("[data-option-note]"),
              !exists
                ? ", unavailable"
                : status === "sold-out"
                  ? ", sold out"
                  : status === "missing"
                    ? ", changes your other choices"
                    : "",
            )
          }
        }
      }

      paint()
      return instance.subscribe(paint)
    },
  },
  option: { tag: "shop-variant-option", display: "block" },
})

export { parts as shopVariantSelectorParts }
