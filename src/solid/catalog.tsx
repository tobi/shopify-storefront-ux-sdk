import { usePart, usePrimitive, type PartProps, type PrimitiveHandle } from "@ui-sdk/solid/primitive"
import { createContext, For, omit, useContext, type Accessor } from "solid-js"
import type { JSX } from "@solidjs/web"
import {
  shopCatalog,
  visibleProducts,
  type CatalogProduct,
  type CatalogSort,
  type ShopCatalogOptions,
} from "../primitives/catalog"
import { useCart } from "./cart"
import { useInstanceState } from "./use-state"

type CatalogState = {
  query: string
  filter: string | null
  vendor: string | null
  onSale: boolean
  sort: CatalogSort
  products: CatalogProduct[]
  status: "loading" | "idle" | "error"
  hasNext: boolean
}

type CatalogContext = { handle: PrimitiveHandle<typeof shopCatalog>; state: Accessor<CatalogState> }
const Context = createContext<CatalogContext>()

function useCatalog() {
  const context = useContext(Context)
  if (!context) throw new Error("Put this inside <ShopCatalog>")
  return context
}

function ShopCatalog(
  props: Omit<ShopCatalogOptions, "endpoint"> & { endpoint?: string; children?: JSX.Element } & Omit<
    PartProps<"section">,
    "children"
  >,
) {
  const cart = useCart()
  const handle = usePrimitive(shopCatalog, () => ({
    endpoint: props.endpoint ?? cart.endpoint(),
    filters: props.filters,
    query: props.query,
    defaultQuery: props.defaultQuery,
    filter: props.filter,
    defaultFilter: props.defaultFilter,
    vendor: props.vendor,
    defaultVendor: props.defaultVendor,
    onSale: props.onSale,
    defaultOnSale: props.defaultOnSale,
    sort: props.sort,
    defaultSort: props.defaultSort,
    pageSize: props.pageSize,
    onQueryChange: props.onQueryChange,
    onFilterChange: props.onFilterChange,
    onVendorChange: props.onVendorChange,
    onOnSaleChange: props.onOnSaleChange,
    onSortChange: props.onSortChange,
  }))
  const state = useInstanceState(
    handle.instance as never as { get: () => CatalogState; subscribe: (l: () => void) => () => void },
  )
  const rest = omit(
    props,
    "endpoint",
    "filters",
    "query",
    "defaultQuery",
    "filter",
    "defaultFilter",
    "vendor",
    "defaultVendor",
    "onSale",
    "defaultOnSale",
    "sort",
    "defaultSort",
    "pageSize",
    "onQueryChange",
    "onFilterChange",
    "onVendorChange",
    "onOnSaleChange",
    "onSortChange",
    "children",
  )
  return (
    <Context value={{ handle, state }}>
      {usePart(handle, "root", undefined, { ...rest, children: () => props.children } as never, "section")}
    </Context>
  )
}

function CatalogResults(
  props: { children: (product: Accessor<CatalogProduct>, index: Accessor<number>) => JSX.Element } & Omit<
    PartProps<"ul">,
    "children"
  >,
) {
  const { state } = useCatalog()
  const rest = omit(props, "children")
  return usePart(
    shopCatalog,
    "results",
    undefined,
    {
      ...rest,
      children: () => (
        <For each={visibleProducts(state() as never)} keyed={(product) => product.id}>
          {(product, index) => <li>{props.children(product, index)}</li>}
        </For>
      ),
    } as never,
    "ul",
  )
}

function CatalogEmpty(props: PartProps<"div">) {
  return usePart(shopCatalog, "empty", undefined, props as never, "div")
}

function CatalogStatus(props: Omit<PartProps<"p">, "children">) {
  return usePart(shopCatalog, "status", undefined, { ...props, children: (state: { message: string }) => state.message } as never, "p")
}

export { CatalogEmpty, CatalogResults, CatalogStatus, ShopCatalog, useCatalog }
