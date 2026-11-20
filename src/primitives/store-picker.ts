import { definePrimitive } from "@ui-sdk/core"
import type { ListData } from "@ui-sdk/web/select"
import type { MockShop } from "../directory"

//
// The element owns the data and the one verb; the select, its trigger and its
// list are the author's markup. A group is the first category a store lists.

const storePickerSelect = "ui-select"

function groupedStores(stores: MockShop[]) {
  const groups = new Map<string, MockShop[]>()
  for (const store of stores) {
    const label = store.categories[0] ?? "Other stores"
    const group = groups.get(label) ?? []
    group.push(store)
    groups.set(label, group)
  }
  const items: ListData = []
  for (const [label, group] of groups) {
    items.push({
      type: "group",
      label,
      items: group.map((store) => ({
        value: store.endpoint,
        label: store.name,
        keywords: [store.host],
      })),
    })
  }
  return items
}

type SelectPart = HTMLElement & {
  value: string | null
  items?: ListData
  api?: {
    getValue: () => string | null
    setValue: (value: string, details?: { reason?: string; event?: Event }) => boolean
  }
}

const shopStorePicker = definePrimitive({
  name: "shop-store-picker",
  state: () => ({}),
  api: (context) => ({
    // The same path a person's press takes: the select chooses, then reports.
    select: (endpoint: string) => {
      const select = context.element("root")?.querySelector<SelectPart>(storePickerSelect)
      if (!select) return false
      select.value = endpoint
      return select.value === endpoint
    },
  }),
  slots: (slot) => ({ root: slot({}) }),
  agent: { actions: ["select"] },
})


export { groupedStores, shopStorePicker, storePickerSelect, type SelectPart }
