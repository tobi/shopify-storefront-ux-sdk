import { usePart, usePrimitive, type PartProps, type PrimitiveHandle } from "@ui-sdk/react/primitive"
import * as React from "react"
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

type CatalogContextValue = {
  handle: PrimitiveHandle<typeof shopCatalog>
  state: CatalogState
}

const CatalogContext = React.createContext<CatalogContextValue | null>(null)

function useCatalog() {
  const context = React.useContext(CatalogContext)
  if (!context) throw new Error("Put this inside <ShopCatalog>")
  return context
}

function ShopCatalog({
  endpoint,
  collection,
  filters,
  query,
  defaultQuery,
  filter,
  defaultFilter,
  vendor,
  defaultVendor,
  onSale,
  defaultOnSale,
  sort,
  defaultSort,
  pageSize,
  onQueryChange,
  onFilterChange,
  onVendorChange,
  onOnSaleChange,
  onSortChange,
  children,
  ...rest
}: Omit<ShopCatalogOptions, "endpoint"> & { endpoint?: string; children?: React.ReactNode } & Omit<
  PartProps<"section">,
  "children"
>) {
  const cart = useCart()
  const handle = usePrimitive(shopCatalog, {
    endpoint: endpoint ?? cart.endpoint,
    collection,
    filters,
    query,
    defaultQuery,
    filter,
    defaultFilter,
    vendor,
    defaultVendor,
    onSale,
    defaultOnSale,
    sort,
    defaultSort,
    pageSize,
    onQueryChange,
    onFilterChange,
    onVendorChange,
    onOnSaleChange,
    onSortChange,
  })
  const state = useInstanceState(
    handle.instance as never as { get: () => CatalogState; subscribe: (l: () => void) => () => void },
  )
  const value = React.useMemo<CatalogContextValue>(() => ({ handle, state }), [handle, state])
  return (
    <CatalogContext.Provider value={value}>
      {usePart(handle, "root", {}, { ...rest, children } as never, "section")}
    </CatalogContext.Provider>
  )
}

function CatalogResults({
  children,
  ...rest
}: {
  children: (product: CatalogProduct, index: number) => React.ReactNode
} & Omit<PartProps<"ul">, "children">) {
  const { state } = useCatalog()
  const items = visibleProducts(state)
  return usePart(
    shopCatalog,
    "results",
    {},
    {
      ...rest,
      children: items.map((product, index) => <li key={product.id}>{children(product, index)}</li>),
    } as never,
    "ul",
  )
}

function CatalogEmpty(props: PartProps<"div">) {
  return usePart(shopCatalog, "empty", {}, props as never, "div")
}

function CatalogStatus(props: Omit<PartProps<"p">, "children">) {
  return usePart(
    shopCatalog,
    "status",
    {},
    { ...props, children: (state: { message: string }) => state.message } as never,
    "p",
  )
}

export { CatalogEmpty, CatalogResults, CatalogStatus, ShopCatalog, useCatalog }
