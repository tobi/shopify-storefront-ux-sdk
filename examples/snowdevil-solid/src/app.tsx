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
} from "shopify-storefront-ux-sdk/solid"
import { Button } from "@ui-sdk/solid/button"
import { Drawer, DrawerBackdrop, DrawerClose, DrawerContent, DrawerTitle, DrawerTrigger } from "@ui-sdk/solid/drawer"
import { SegmentedControl, SegmentedControlItem } from "@ui-sdk/solid/segmented-control"
import { createSignal, For, onSettled, Show } from "solid-js"

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
  const [route, setRoute] = createSignal<Route>(parseRoute(location.hash))
  onSettled(() => {
    const onChange = () => {
      setRoute(parseRoute(location.hash))
      window.scrollTo({ top: 0, behavior: "instant" })
    }
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  })
  return route
}

function singleVariantId(product: CatalogProduct) {
  if (!product.availableForSale || !product.variants.length) return null
  const available = product.variants.filter((v) => v.availableForSale)
  return available.length === 1 ? available[0]!.id : null
}

function App() {
  const route = useRoute()
  const [bagOpen, setBagOpen] = createSignal(false)

  return (
    <ShopCart endpoint={endpoint} country="CA" language="en" storageKey="snowdevil.solid.cart" aria-label="Shopping cart">
      <Drawer open={bagOpen()} onOpenChange={setBagOpen} side="right">
        <header class="masthead">
          <a class="wordmark" href="#/">
            <svg class="horns" viewBox="0 0 40 28" aria-hidden="true">
              <path d="M4 26C2 14 6 5 13 1c-3 7-2 13 3 17M36 26c2-12-2-21-9-25 3 7 2 13-3 17" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" />
            </svg>
            <span>Snowdevil</span>
          </a>
          <div class="masthead-actions">
            <ShopMarketSelector class="market" storageKey="snowdevil.solid.market" />
            <DrawerTrigger class="bag-trigger">
              <span>Bag</span>
              <CartCount class="bag-count" />
            </DrawerTrigger>
          </div>
        </header>

        <main>
          <Show
            when={route().page === "product" ? (route() as { page: "product"; handle: string }).handle : null}
            fallback={<CatalogView onAdded={() => setBagOpen(true)} />}
          >
            {(handle) => (
              <ShopProduct handle={handle()} class="product">
                <ProductView onAdded={() => setBagOpen(true)} />
              </ShopProduct>
            )}
          </Show>
        </main>

        <BagDrawer onNavigate={() => setBagOpen(false)} />
      </Drawer>
      <CartStatus class="visually-hidden" />
    </ShopCart>
  )
}

function CatalogView(props: { onAdded: () => void }) {
  return (
    <>
      <section class="hero">
        <div class="hero-inner">
          <p class="eyebrow">Est. 2004 · Ottawa, ON · SolidJS + shopify-storefront-ux-sdk</p>
          <h1>Go where the groomers end.</h1>
          <p>Snowboards, bindings, and mountain optics running live on Shopify Storefront API.</p>
        </div>
      </section>
      <ShopCatalog class="catalog" aria-label="Products" filters={["Snowboard", "Binding", "Goggles"]} defaultSort="featured" pageSize={24}>
        <div class="catalog-head">
          <h2>Shop winter gear</h2>
          <CatalogStatus class="catalog-status" />
        </div>
        <CatalogControls />
        <CatalogResults class="grid">
          {(product) => {
            const pct = () => discountPercent(product().price, product().compareAtPrice)
            const quickId = () => singleVariantId(product())
            return (
              <article class="card">
                <div class="plate">
                  <ShopImage image={product().featuredImage} alt="" sizes="(max-width: 640px) 50vw, 280px" />
                  <Show when={!product().availableForSale}>
                    <span class="badge badge-out">Sold out</span>
                  </Show>
                  <Show when={product().availableForSale && pct()}>
                    {(off) => <span class="badge badge-sale">-{off()}%</span>}
                  </Show>
                  <Show when={quickId()}>
                    {(id) => (
                      <AddVariant class="quick-add" variantId={id()} aria-label={`Quick add ${product().title}`} onAdded={props.onAdded}>
                        + Quick add
                      </AddVariant>
                    )}
                  </Show>
                </div>
                <div class="card-meta">
                  <span class="card-vendor">{product().vendor} · {product().productType}</span>
                  <a class="card-link" href={`#/products/${product().handle}`}>{product().title}</a>
                  <ShopPrice class="card-price" price={product().price} compareAtPrice={product().compareAtPrice} from={product().priceVaries} />
                </div>
              </article>
            )
          }}
        </CatalogResults>
        <CatalogEmpty class="empty">
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
    <div class="toolbar">
      <SegmentedControl
        class="departments"
        aria-label="Department"
        value={state().filter ?? "all"}
        onValueChange={(value, details) => {
          const dept = departments.find((d) => d.value === value)
          if (!dept || !handle.api.setFilter(dept.filter, { reason: "item-press", event: details.event })) details.cancel()
        }}
      >
        <For each={departments}>{(dept) => <SegmentedControlItem value={dept.value}>{dept.label}</SegmentedControlItem>}</For>
      </SegmentedControl>
      <input
        class="search-input"
        type="search"
        aria-label="Search products"
        placeholder="Search boards, brands…"
        value={state().query}
        onInput={(event) => handle.api.setQuery((event.currentTarget as HTMLInputElement).value, { reason: "input", event })}
      />
      <button
        type="button"
        class="chip"
        aria-pressed={state().onSale ? "true" : "false"}
        onClick={(event) => handle.api.setOnSale(!state().onSale, { reason: "item-press", event })}
      >
        On sale
      </button>
      <select
        class="sort-select"
        aria-label="Sort products"
        value={state().sort}
        onChange={(event) => handle.api.setSort((event.currentTarget as HTMLSelectElement).value as CatalogSort, { reason: "item-press", event })}
      >
        <For each={Object.entries(catalogSorts)}>{([value, sort]) => <option value={value}>{sort.label}</option>}</For>
      </select>
    </div>
  )
}

function LoadMore() {
  const { handle, state } = useCatalog()
  return (
    <Show when={state().hasNext}>
      <Button class="load-more" onClick={() => handle.api.loadMore()}>Show more</Button>
    </Show>
  )
}

function ProductView(props: { onAdded: () => void }) {
  const { product, variant, quantity, error } = useProduct()
  return (
    <Show when={product()} fallback={<p class="empty">{error() ?? "Loading product…"}</p>}>
      {(current) => (
        <>
          <nav class="breadcrumb" aria-label="Breadcrumb">
            <a href="#/">← Back to all gear</a>
          </nav>
          <ShopProductMedia hoverZoom sizes="(max-width: 900px) 90vw, 540px" />
          <div class="product-buy">
            <p class="eyebrow">{current().vendor} · {current().productType}</p>
            <h1 class="product-title">{current().title}</h1>
            <ShopPrice class="product-price" price={variant()?.price} compareAtPrice={variant()?.compareAtPrice} showSavings />
            <ShopPromise available={Boolean(variant()?.availableForSale)} />
            <VariantSelector class="options" label={(name) => (name === "Title" ? "Size" : name)} swatches />
            <div class="buy-row">
              <ProductQuantity />
              <AddToCart class="add" onAdded={props.onAdded} />
            </div>
            <ShopPay
              lines={variant() ? [{ variantId: variant()!.id, quantity: quantity() }] : []}
              price={variant()?.price}
              disabled={!variant()?.availableForSale}
            >
              <ShopPayButton />
              <ShopPayInstallments />
            </ShopPay>
            <p class="stock" data-out={variant() && !variant()!.availableForSale ? "" : undefined}>
              {variant()?.availableForSale ? `${variantName(variant()) ? `${variantName(variant())} · ` : ""}In stock` : "Sold out"}
            </p>
            <div class="description" innerHTML={current().descriptionHtml} />
          </div>
        </>
      )}
    </Show>
  )
}

function BagDrawer(props: { onNavigate: () => void }) {
  const { cart } = useCart()
  return (
    <>
      <DrawerBackdrop class="bag-backdrop" />
      <DrawerContent class="bag">
        <header class="bag-head">
          <DrawerTitle>Your bag</DrawerTitle>
          <DrawerClose class="bag-close" aria-label="Close bag">×</DrawerClose>
        </header>
        <CartShipping threshold={250} class="shipping-meter">
          {(state) => (
            <>
              <p>{state.unlocked ? "Free shipping unlocked" : `Add ${state.remainingText} more for free shipping`}</p>
              <div class="shipping-track" aria-hidden="true">
                <span class="shipping-fill" style={{ width: `${Math.round(state.progress * 100)}%` }} />
              </div>
            </>
          )}
        </CartShipping>
        <CartLines class="bag-lines" empty={<p class="empty">Your bag is empty.</p>}>
          {(line, controls) => (
            <article class="line">
              <span class="line-image">{controls.image("64px")}</span>
              <div>
                <a href={`#/products/${line().handle}`} onClick={props.onNavigate}>
                  <p class="line-title">{line().title}</p>
                </a>
                <Show when={line().variantTitle}>
                  <p class="line-variant">{line().variantTitle}</p>
                </Show>
                {controls.quantity()}
              </div>
              <span class="line-price">{controls.price()}</span>
            </article>
          )}
        </CartLines>
        <CartUndo class="undo" />
        <footer class="bag-foot">
          <CartDiscount class="discount" />
          <CartNote class="cart-note" />
          <p class="subtotal">
            <span>Subtotal</span>
            <strong><CartSubtotal /></strong>
          </p>
          <ShopPay checkoutUrl={cart()?.checkoutUrl} disabled={!cart()?.lines.length}>
            <ShopPayButton prefix="Check out with" />
          </ShopPay>
          <CartCheckout class="checkout">Checkout</CartCheckout>
        </footer>
      </DrawerContent>
    </>
  )
}

export { App }
