import { discountPercent, variantName } from "shopify-storefront-ux-sdk/core"
import {
  AddToCart,
  AddVariant,
  CartCheckout,
  CartCount,
  CartDiscount,
  CartLines,
  CartNote,
  CartShipping,
  CartStatus,
  CartSubtotal,
  CartUndo,
  CatalogEmpty,
  CatalogResults,
  CatalogStatus,
  catalogSorts,
  ProductQuantity,
  ShopCart,
  ShopCatalog,
  ShopImage,
  ShopMarketSelector,
  ShopPay,
  ShopPayButton,
  ShopPayInstallments,
  ShopPrice,
  ShopProduct,
  ShopProductMedia,
  ShopPromise,
  useCart,
  useCatalog,
  useProduct,
  VariantSelector,
  type CatalogProduct,
  type CatalogSort,
} from "shopify-storefront-ux-sdk/react"
import { Button } from "@ui-sdk/react/button"
import { Drawer, DrawerBackdrop, DrawerClose, DrawerContent, DrawerTitle, DrawerTrigger } from "@ui-sdk/react/drawer"
import { SegmentedControl, SegmentedControlItem } from "@ui-sdk/react/segmented-control"
import * as React from "react"

const endpoint = "https://www.snowdevil.ca/api/2026-10/graphql.json"
const departments = [
  { value: "all", filter: null, label: "Everything" },
  { value: "Snowboard", filter: "Snowboard", label: "Boards" },
  { value: "Binding", filter: "Binding", label: "Bindings" },
  { value: "Goggles", filter: "Goggles", label: "Goggles" },
] as const

type Route = { page: "home" } | { page: "product"; handle: string }

function parseRoute(hash: string): Route {
  const match = hash.match(/^#\/products\/([\w-]+)/)
  return match ? { page: "product", handle: match[1]! } : { page: "home" }
}

function useRoute() {
  const [route, setRoute] = React.useState<Route>(() => parseRoute(location.hash))
  React.useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(location.hash))
      window.scrollTo({ top: 0, behavior: "instant" })
    }
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])
  return route
}

function singleVariantId(product: CatalogProduct) {
  if (!product.availableForSale || !product.variants.length) return null
  const available = product.variants.filter((v) => v.availableForSale)
  return available.length === 1 ? available[0]!.id : null
}

function App() {
  const route = useRoute()
  const [bagOpen, setBagOpen] = React.useState(false)

  return (
    <ShopCart endpoint={endpoint} country="CA" language="en" storageKey="snowdevil.react.cart" aria-label="Shopping cart">
      <Drawer open={bagOpen} onOpenChange={setBagOpen} side="right">
        <header className="masthead">
          <a className="wordmark" href="#/">
            <svg className="horns" viewBox="0 0 40 28" aria-hidden="true">
              <path d="M4 26C2 14 6 5 13 1c-3 7-2 13 3 17M36 26c2-12-2-21-9-25 3 7 2 13-3 17" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
            </svg>
            <span>Snowdevil</span>
          </a>
          <div className="masthead-actions">
            <ShopMarketSelector className="market" />
            <DrawerTrigger className="bag-trigger">
              <span>Bag</span>
              <CartCount className="bag-count" />
            </DrawerTrigger>
          </div>
        </header>

        <main>
          {route.page === "product" ? (
            <ShopProduct handle={route.handle} className="product">
              <ProductView onAdded={() => setBagOpen(true)} />
            </ShopProduct>
          ) : (
            <CatalogView onAdded={() => setBagOpen(true)} />
          )}
        </main>

        <BagDrawer onNavigate={() => setBagOpen(false)} />
      </Drawer>
      <CartStatus className="visually-hidden" />
    </ShopCart>
  )
}

function CatalogView({ onAdded }: { onAdded: () => void }) {
  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <p className="eyebrow">Est. 2004 · Ottawa, ON · React + shopify-storefront-ux-sdk</p>
          <h1>Go where the groomers end.</h1>
          <p>Snowboards, bindings, and mountain optics running live on Shopify Storefront API.</p>
        </div>
      </section>
      <ShopCatalog className="catalog" aria-label="Products" filters={["Snowboard", "Binding", "Goggles"]} defaultSort="featured" pageSize={24}>
        <div className="catalog-head">
          <h2>Shop winter gear</h2>
          <CatalogStatus className="catalog-status" />
        </div>
        <CatalogControls />
        <CatalogResults className="grid">
          {(product) => {
            const pct = discountPercent(product.price, product.compareAtPrice)
            const quickId = singleVariantId(product)
            return (
              <article className="card">
                <div className="plate">
                  <ShopImage image={product.featuredImage} alt="" sizes="(max-width: 640px) 50vw, 280px" />
                  {!product.availableForSale && <span className="badge badge-out">Sold out</span>}
                  {product.availableForSale && pct && <span className="badge badge-sale">-{pct}%</span>}
                  {quickId && (
                    <AddVariant className="quick-add" variantId={quickId} aria-label={`Quick add ${product.title}`} onAdded={onAdded}>
                      + Quick add
                    </AddVariant>
                  )}
                </div>
                <div className="card-meta">
                  <span className="card-vendor">{product.vendor} · {product.productType}</span>
                  <a className="card-link" href={`#/products/${product.handle}`}>{product.title}</a>
                  <ShopPrice className="card-price" price={product.price} compareAtPrice={product.compareAtPrice} from={product.priceVaries} />
                </div>
              </article>
            )
          }}
        </CatalogResults>
        <CatalogEmpty className="empty">
          <p>Nothing matches your current filters.</p>
        </CatalogEmpty>
        <LoadMore />
      </ShopCatalog>
    </>
  )
}

function CatalogControls() {
  const { handle, state } = useCatalog()
  return (
    <div className="toolbar">
      <SegmentedControl
        className="departments"
        aria-label="Department"
        value={state.filter ?? "all"}
        onValueChange={(value, details) => {
          const dept = departments.find((d) => d.value === value)
          if (!dept || !handle.api.setFilter(dept.filter, { reason: "item-press", event: details.event })) details.cancel()
        }}
      >
        {departments.map((dept) => (
          <SegmentedControlItem key={dept.value} value={dept.value}>{dept.label}</SegmentedControlItem>
        ))}
      </SegmentedControl>
      <input
        className="search-input"
        type="search"
        aria-label="Search products"
        placeholder="Search boards, brands…"
        value={state.query}
        onChange={(event) => handle.api.setQuery(event.currentTarget.value, { reason: "input", event: event.nativeEvent })}
      />
      <button
        type="button"
        className="chip"
        aria-pressed={state.onSale ? "true" : "false"}
        onClick={(event) => handle.api.setOnSale(!state.onSale, { reason: "item-press", event: event.nativeEvent })}
      >
        On sale
      </button>
      <select
        className="sort-select"
        aria-label="Sort products"
        value={state.sort}
        onChange={(event) => handle.api.setSort(event.currentTarget.value as CatalogSort, { reason: "item-press", event: event.nativeEvent })}
      >
        {Object.entries(catalogSorts).map(([value, sort]) => (
          <option key={value} value={value}>{sort.label}</option>
        ))}
      </select>
    </div>
  )
}

function LoadMore() {
  const { handle, state } = useCatalog()
  if (!state.hasNext) return null
  return <Button className="load-more" onClick={() => handle.api.loadMore()}>Show more</Button>
}

function ProductView({ onAdded }: { onAdded: () => void }) {
  const { product, variant, quantity, error } = useProduct()
  if (!product) return <p className="empty">{error ?? "Loading product…"}</p>
  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href="#/">← Back to all gear</a>
      </nav>
      <ShopProductMedia hoverZoom sizes="(max-width: 900px) 90vw, 540px" />
      <div className="product-buy">
        <p className="eyebrow">{product.vendor} · {product.productType}</p>
        <h1 className="product-title">{product.title}</h1>
        <ShopPrice className="product-price" price={variant?.price} compareAtPrice={variant?.compareAtPrice} showSavings />
        <ShopPromise available={Boolean(variant?.availableForSale)} />
        <VariantSelector className="options" label={(name) => (name === "Title" ? "Size" : name)} swatches />
        <div className="buy-row">
          <ProductQuantity />
          <AddToCart className="add" onAdded={onAdded} />
        </div>
        <ShopPay
          lines={variant ? [{ variantId: variant.id, quantity }] : []}
          price={variant?.price}
          disabled={!variant?.availableForSale}
        >
          <ShopPayButton />
          <ShopPayInstallments />
        </ShopPay>
        <p className="stock" data-out={variant && !variant.availableForSale ? "" : undefined}>
          {variant?.availableForSale ? `${variantName(variant) ? `${variantName(variant)} · ` : ""}In stock` : "Sold out"}
        </p>
        <div className="description" dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />
      </div>
    </>
  )
}

function BagDrawer({ onNavigate }: { onNavigate: () => void }) {
  const { cart } = useCart()
  return (
    <>
      <DrawerBackdrop className="bag-backdrop" />
      <DrawerContent className="bag">
        <header className="bag-head">
          <DrawerTitle>Your bag</DrawerTitle>
          <DrawerClose className="bag-close" aria-label="Close bag">×</DrawerClose>
        </header>
        <CartShipping threshold={250} className="shipping-meter">
          {(state) => (
            <>
              <p>{state.unlocked ? "Free shipping unlocked" : `Add ${state.remainingText} more for free shipping`}</p>
              <div className="shipping-track" aria-hidden="true">
                <span className="shipping-fill" style={{ width: `${Math.round(state.progress * 100)}%` }} />
              </div>
            </>
          )}
        </CartShipping>
        <CartLines className="bag-lines" empty={<p className="empty">Your bag is empty.</p>}>
          {(line, controls) => (
            <article className="line">
              <span className="line-image">{controls.image("64px")}</span>
              <div>
                <a href={`#/products/${line.handle}`} onClick={onNavigate}>
                  <p className="line-title">{line.title}</p>
                </a>
                {line.variantTitle && <p className="line-variant">{line.variantTitle}</p>}
                {controls.quantity()}
              </div>
              <span className="line-price">{controls.price()}</span>
            </article>
          )}
        </CartLines>
        <CartUndo className="undo" />
        <footer className="bag-foot">
          <CartDiscount className="discount" />
          <CartNote className="cart-note" />
          <p className="subtotal">
            <span>Subtotal</span>
            <strong><CartSubtotal /></strong>
          </p>
          <ShopPay checkoutUrl={cart?.checkoutUrl} disabled={!cart?.lines.length}>
            <ShopPayButton prefix="Check out with" />
          </ShopPay>
          <CartCheckout className="checkout">Checkout</CartCheckout>
        </footer>
      </DrawerContent>
    </>
  )
}

export { App }
