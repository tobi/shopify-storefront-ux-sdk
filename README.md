# shopify-storefront-ux-sdk

Storefront components for Shopify's [Storefront API](https://shopify.dev/docs/api/storefront):
responsive product images, prices, variant selectors, a product gallery with a
lightbox, a buy box, bundles and a cart. They're custom elements built on
[ui-sdk](https://github.com/vercel-labs/ui): keyboard, focus, dismissal,
announcements and ARIA come from the SDK; product data, money and the cart
come from Shopify; the markup and styles are yours.

- **Works with any markup.** Each component fills in markup you write, from
  `<template>`s and `data-*` hooks. No shadow DOM, no HTML strings.
- **Accessible by default.** It uses the SDK's carousel, dialog, radio group
  and number input. Sold-out and unavailable choices say so in text, and focus
  returns where it should.
- **Fast images.** Shopify CDN `srcset`s capped at the source size, intrinsic
  dimensions, an eager LCP image, and preloads on hover and focus. Nothing
  extra loads when the visitor is saving data.
- **Agent-ready.** Every component lists the methods an agent can call, and an
  agent's changes fire the same cancelable events as a person's.

```text
data          images.ts · variants.ts · shop.ts        no UI: CDN URLs, variant model, Storefront client + cart store
low level     <shop-image>  <shop-price>  <shop-variant-selector>
mid level     <shop-product-media>                     gallery + lightbox, on ui-carousel and ui-dialog
high level    <shop-product>  <shop-bundle>            compose the low-level pieces
cart          <shop-cart> and its parts                one owner for count, lines, totals, codes, checkout
```

## Quick start

From an empty folder, with [Bun](https://bun.sh) (any bundler that compiles
TypeScript, like Vite, works the same way):

```sh
bun init -y
bun add github:tobi/shopify-storefront-ux-sdk @ui-sdk/web @ui-sdk/core
```

`main.ts` registers the elements and the SDK controls your markup uses:

```ts
import "@ui-sdk/web/drawer"
import "@ui-sdk/web/radio"
import "shopify-storefront-ux-sdk"
import "shopify-storefront-ux-sdk/styles.css"

type Drawer = HTMLElement & { open: boolean }
const drawer = document.querySelector<Drawer>("ui-drawer")!

// Open the bag from its button, and once an item is in it.
document.querySelector(".bag-open")!.addEventListener("action", () => (drawer.open = true))
document.querySelector("shop-product")!.addEventListener("addcomplete", () => (drawer.open = true))
```

`index.html` is a buy box and a cart drawer for the
[mock.shop](https://mock.shop) sample store. Point `endpoint` at your own
store's Storefront API to use your products.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Storefront</title>
    <link rel="stylesheet" href="./style.css" />
    <script type="module" src="./main.ts"></script>
  </head>
  <body>
    <shop-cart endpoint="https://demostore.mock.shop/api" country="US" language="en">
      <header>
        <ui-button class="bag-open">
          <button type="button" aria-haspopup="dialog">Bag <shop-cart-count>0</shop-cart-count></button>
        </ui-button>
      </header>

      <main>
        <shop-product handle="sweatpants" aria-label="Buy box">
          <!-- Product media: a gallery with thumbnails, hover zoom and a lightbox -->
          <shop-product-media hover-zoom sizes="(max-width: 900px) 100vw, 560px">
            <ui-carousel data-media-main aria-label="Product images" loop>
              <ui-carousel-viewport class="media-viewport">
                <ui-carousel-content class="media-track">
                  <template>
                    <ui-carousel-item class="media-slide">
                      <ui-dialog-trigger>
                        <button type="button" class="media-open">
                          <shop-product-media-zoom class="media-frame">
                            <shop-image><img class="media-image" /></shop-image>
                          </shop-product-media-zoom>
                          <span class="media-hint" aria-hidden="true"><span class="media-hint-zoom">Hover to zoom · </span>Click to enlarge</span>
                        </button>
                      </ui-dialog-trigger>
                    </ui-carousel-item>
                  </template>
                </ui-carousel-content>
              </ui-carousel-viewport>
              <ui-carousel-previous><button type="button" class="media-step media-previous" aria-label="Previous image">‹</button></ui-carousel-previous>
              <ui-carousel-next><button type="button" class="media-step media-next" aria-label="Next image">›</button></ui-carousel-next>
              <ui-carousel-indicator-group class="thumbs" aria-label="Choose a product image">
                <template>
                  <ui-carousel-indicator><button type="button" class="thumb"><shop-image><img /></shop-image></button></ui-carousel-indicator>
                </template>
              </ui-carousel-indicator-group>
            </ui-carousel>

            <ui-dialog>
              <ui-dialog-backdrop class="image-backdrop" hidden></ui-dialog-backdrop>
              <ui-dialog-content class="image-viewer" hidden>
                <shop-product-media-lightbox>
                  <header class="image-viewer-head">
                    <ui-dialog-title>Product images</ui-dialog-title>
                    <ui-dialog-close><button type="button" class="image-control image-close" aria-label="Close image lightbox">×</button></ui-dialog-close>
                  </header>
                  <ui-carousel class="lightbox" data-media-lightbox aria-label="Enlarged product images" loop>
                    <div class="image-viewer-stage">
                      <ui-carousel-viewport class="lightbox-viewport">
                        <ui-carousel-content class="lightbox-track">
                          <template>
                            <ui-carousel-item class="lightbox-slide"><shop-image><img class="lightbox-image" /></shop-image></ui-carousel-item>
                          </template>
                        </ui-carousel-content>
                      </ui-carousel-viewport>
                      <ui-carousel-previous><button type="button" class="image-control image-previous" aria-label="Previous image">‹</button></ui-carousel-previous>
                      <ui-carousel-next><button type="button" class="image-control image-next" aria-label="Next image">›</button></ui-carousel-next>
                    </div>
                    <footer class="image-viewer-foot">
                      <div class="image-viewer-meta">
                        <span class="image-caption" data-media-caption></span>
                        <span class="image-counter" data-media-count aria-hidden="true"></span>
                      </div>
                      <ui-carousel-indicator-group class="image-filmstrip" aria-label="Choose an enlarged image">
                        <template>
                          <ui-carousel-indicator><button type="button" class="image-film-thumb"><shop-image><img /></shop-image></button></ui-carousel-indicator>
                        </template>
                      </ui-carousel-indicator-group>
                    </footer>
                  </ui-carousel>
                </shop-product-media-lightbox>
              </ui-dialog-content>
            </ui-dialog>
          </shop-product-media>

          <!-- Details, price, options, quantity and add -->
          <h1 data-product-title></h1>
          <shop-price>
            <span class="visually-hidden">Price</span>
            <shop-price-amount></shop-price-amount>
            <shop-price-compare><span class="visually-hidden">Regular price</span><s data-text></s></shop-price-compare>
          </shop-price>
          <div data-product-description></div>

          <shop-variant-selector aria-label="Options">
            <div data-variant-options>
              <template>
                <shop-variant-option class="variant">
                  <p><span data-option-name></span>: <span data-picked></span></p>
                  <ui-radio-group class="swatches">
                    <template>
                      <label class="swatch">
                        <ui-radio></ui-radio>
                        <span class="dot" data-option-swatch aria-hidden="true" hidden></span>
                        <span data-option-label></span><span class="visually-hidden" data-option-note></span>
                      </label>
                    </template>
                  </ui-radio-group>
                </shop-variant-option>
              </template>
            </div>
          </shop-variant-selector>

          <ui-number-input data-quantity default-value="1" min="1" max="10" aria-label="Quantity">
            <ui-number-input-group>
              <ui-number-input-decrement><button type="button" aria-label="Decrease quantity">−</button></ui-number-input-decrement>
              <ui-number-input-control><input aria-label="Quantity" /></ui-number-input-control>
              <ui-number-input-increment><button type="button" aria-label="Increase quantity">+</button></ui-number-input-increment>
            </ui-number-input-group>
          </ui-number-input>
          <ui-button data-product-add pending-announcement="Adding to bag">
            <button type="button">Add to bag</button>
          </ui-button>
          <p data-product-stock></p>
        </shop-product>
      </main>

      <!-- The bag: a drawer whose contents are the cart's parts -->
      <ui-drawer side="right">
        <ui-drawer-backdrop hidden></ui-drawer-backdrop>
        <ui-drawer-content hidden>
          <ui-drawer-title>Bag</ui-drawer-title>
          <ui-drawer-close><button type="button">Close</button></ui-drawer-close>

          <shop-cart-lines empty-message="Your bag is empty.">
            <p class="shop-empty" data-shop-empty></p>
            <ul class="shop-lines" data-shop-lines></ul>
            <template>
              <li class="shop-line">
                <span class="shop-line-image" data-shop-line-image><img alt="" width="64" height="80" /></span>
                <div class="shop-line-main">
                  <p class="shop-line-title" data-shop-line-title></p>
                  <p class="shop-line-variant" data-shop-line-variant></p>
                  <p class="shop-line-bundle" data-shop-line-bundle hidden></p>
                  <p class="shop-line-notice" data-shop-line-notice hidden></p>
                  <div class="shop-line-controls">
                    <ui-number-input>
                      <ui-number-input-group>
                        <ui-number-input-decrement>
                          <button type="button" data-step="dec">
                            <span data-shop-minus aria-hidden="true">−</span>
                            <span data-shop-bin aria-hidden="true" hidden>🗑</span>
                          </button>
                        </ui-number-input-decrement>
                        <ui-number-input-control><input aria-label="Quantity" /></ui-number-input-control>
                        <ui-number-input-increment><button type="button" data-step="inc">+</button></ui-number-input-increment>
                      </ui-number-input-group>
                    </ui-number-input>
                  </div>
                </div>
                <span class="shop-line-price" data-shop-line-price></span>
              </li>
            </template>
            <shop-cart-undo class="shop-undo" hidden>
              <shop-cart-undo-trigger><button type="button" class="shop-undo-button">Undo</button></shop-cart-undo-trigger>
            </shop-cart-undo>
          </shop-cart-lines>

          <shop-cart-shipping threshold="75">
            <p class="shop-shipping" data-shop-shipping-text></p>
            <span class="shop-shipping-bar"></span>
          </shop-cart-shipping>

          <shop-cart-discount>
            <form class="shop-discount">
              <div class="shop-discount-row">
                <input name="code" aria-label="Discount code" placeholder="Discount code" data-shop-discount-input />
                <button type="submit" class="shop-discount-apply">Apply</button>
              </div>
              <p class="shop-discount-status" data-shop-discount-status></p>
              <ul class="shop-discount-applied" data-shop-discount-applied>
                <template><li class="shop-discount-code"><span data-shop-discount-code></span> <span data-shop-discount-note></span></li></template>
              </ul>
            </form>
          </shop-cart-discount>

          <shop-cart-summary>
            <p class="shop-total"><span>Subtotal</span> <span data-shop-subtotal></span></p>
            <shop-cart-checkout><a class="shop-checkout" href="#" data-agent-confirm="Go to checkout">Checkout</a></shop-cart-checkout>
          </shop-cart-summary>
        </ui-drawer-content>
      </ui-drawer>

      <shop-cart-status class="visually-hidden"></shop-cart-status>
    </shop-cart>
  </body>
</html>
```

`style.css` is your page's own look. The library's `styles.css` already styles
the cart parts, the gallery and the lightbox; this lays out the page, the
options, the steppers and the drawer:

```css
@layer ui-sdk; /* your styles win over the SDK's few base rules */

:root { color: #1b1d21; background: #f6f3ec; font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; }
body { margin: 0; }
header { display: flex; justify-content: flex-end; padding: 16px 24px; }
main { max-width: 1100px; margin: 0 auto; padding: 0 24px 48px; }
button { font: inherit; color: inherit; cursor: pointer; }

/* The buy box: the gallery beside everything else */
shop-product { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); column-gap: 40px; align-items: start; }
shop-product > * { grid-column: 2; }
shop-product > shop-product-media { grid-column: 1; grid-row: 1 / span 9; }
@media (max-width: 800px) {
  shop-product { grid-template-columns: minmax(0, 1fr); }
  shop-product > *, shop-product > shop-product-media { grid-column: 1; grid-row: auto; }
}
[data-product-title] { margin: 0 0 4px; font-size: 2rem; letter-spacing: -0.03em; }
[data-product-description] { color: #5c6169; }

/* Option values */
.swatches { display: flex; flex-wrap: wrap; gap: 8px; }
.swatch { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border: 1px solid #e0dbd0; border-radius: 999px; background: #fffdf8; cursor: pointer; }
.swatch:has(ui-radio[data-checked]) { background: #1b1d21; border-color: #1b1d21; color: #fff; }
.swatch[data-status="sold-out"] [data-option-label] { text-decoration: line-through; }
.swatch[data-status="missing"] { border-style: dashed; }
.dot { width: 12px; height: 12px; border-radius: 50%; background: var(--shop-swatch); }

/* Steppers and buttons */
ui-number-input { display: inline-block; margin-top: 16px; }
ui-number-input-group { display: inline-flex; align-items: center; border: 1px solid #e0dbd0; border-radius: 999px; background: #fffdf8; }
ui-number-input-group button { width: 38px; height: 38px; border: 0; background: none; }
ui-number-input-control input { width: 34px; border: 0; background: none; font: inherit; text-align: center; }
[data-product-add] button, .bag-open button { padding: 12px 22px; border: 0; border-radius: 999px; background: #1b1d21; color: #fff; }
[data-product-add] button { display: block; width: 100%; margin-top: 12px; }
[data-product-add] button[aria-disabled="true"] { opacity: 0.45; cursor: not-allowed; }
shop-cart-count { margin-left: 6px; font-variant-numeric: tabular-nums; }

/* The bag drawer */
ui-drawer-backdrop { position: fixed; inset: 0; background: rgb(20 18 14 / 45%); }
ui-drawer-content { display: flex; flex-direction: column; gap: 18px; width: min(420px, 100vw); height: 100dvh; margin-inline-start: auto; padding: 20px; overflow: auto; box-sizing: border-box; background: #f6f3ec; box-shadow: -24px 0 70px rgb(0 0 0 / 30%); }
ui-drawer-title { font-weight: 600; }
ui-drawer-close button { align-self: flex-end; padding: 6px 14px; border: 1px solid #e0dbd0; border-radius: 999px; background: none; }
```

Run it:

```sh
bun ./index.html
```

Bun serves the page on port 3000, bundling `main.ts` and both stylesheets.
The buy box loads the product by its handle, and **Add to bag** creates a real
anonymous cart. The **Checkout** link goes to Shopify's checkout for that cart.

## Components

Every component is a `definePrimitive` from `@ui-sdk/core`, rendered as custom
elements with `createParts` from `@ui-sdk/web`. The same rules hold for all of
them:

- **Options are attributes** (`hover-zoom`, `max-quantity`), and rich data is
  a property (`el.product = …`, `el.images = …`).
- **Controlled state** (`value`, `open`, `quantity`) takes `default-<key>`
  and fires a `<key>change` event. Setting the property fires no event, so a
  page that writes state back never hears itself.
- **Events** fire on their own element and don't bubble. `event.detail` is
  `{ value, reason, event, source }`, and `event.preventDefault()` refuses the
  change. `source` is `"agent"` when an agent asked.
- **Methods** are on `el.api`. The ones listed under "agent" show up in a
  `@ui-sdk/web/agent` bridge's snapshot.
- **Focus** is never the browser's square outline. Keyboard focus gets one
  ring that follows each control's shape (`--shop-focus-ring`), and a text
  field rings the control it sits in.

### `<shop-image>`: a responsive Shopify image

```html
<shop-image sizes="(max-width: 600px) 100vw, 480px" loading="eager" priority="high"><img /></shop-image>
```

Binds the `<img>` inside it. It sets `width`/`height` from Shopify,
`srcset` from the CDN (capped at the source size and 5,760px, deduplicated, `v`
token kept), `sizes`, `loading`, `fetchpriority`, `decoding="async"` and
`data-status` (`empty`, `loading`, `loaded`, `error`).

| | |
| --- | --- |
| Properties | `image` (a Storefront `Image`: `{ url, altText, width, height }`) |
| Attributes | `alt` (overrides `altText`; `""` for decoration), `sizes`, `widths` (comma list), `loading` (`lazy` \| `eager`), `priority` (`high` \| `low` \| `auto`) |
| API | `getImage()`, `getStatus()`, `preload(sizes?, priority?)` |

### `<shop-price>`: money for the market

```html
<shop-price>
  <shop-price-amount></shop-price-amount>
  <shop-price-compare><s data-text></s></shop-price-compare>
</shop-price>
```

Formats with `Intl.NumberFormat` for the store's currency. The compare-at part
shows only while the earlier price is higher, in the same currency; the root
gets `data-on-sale`. Text goes into `[data-text]` inside a part, else the part.

| | |
| --- | --- |
| Properties | `price`, `compareAtPrice` (`{ amount, currencyCode }`) |
| API | `getPrice()`, `isOnSale()` |

### `<shop-variant-selector>` and `<shop-variant-option>`: choose a variant

Holds one value, the chosen variant's id. Each option's value is read from it,
so price, media and the add button can't disagree with what's chosen. Each
`<shop-variant-option>` is cloned from the `<template>` in
`[data-variant-options]`, one per product option, and wraps an SDK
single-choice control, **`ui-radio-group`** or **`ui-segmented-control`**. The
control keeps its own keyboard, roving focus and ARIA. Import the control you
use, like `@ui-sdk/web/radio`.

Values are cloned from the control's own `<template>`, with these filled in:
`[data-option-label]`, `[data-option-swatch]` (Shopify's swatch colour as
`--shop-swatch`), `[data-option-note]` and `data-status` on each value:

- `available`
- `sold-out`: still choosable; the note reads ", sold out".
- `missing`: the other choices don't come in this value. It's still choosable
  and the others move to the nearest variant; the note says so.
- A value no variant has is disabled.

| | |
| --- | --- |
| Properties | `variants`, `productOptions` (set by `<shop-product>` / `<shop-bundle>`, or by you) |
| Attributes | `value` (controlled), `default-value` |
| Events | `valuechange` (`detail.option` names the option pressed), `valueintent` (not state: a value under the pointer or focus would choose `detail.value`, the moment to preload its image) |
| API | `getValue()`, `getVariant()`, `getSelection()`, `setValue(id)`, `setOption(name, value)`, `preview(name, value)`, `valueStatus(name, value)`, `findVariant(selection)`, `subscribe(listener)` |
| Agent | `setValue`, `setOption` |

### `<shop-product-media>`: gallery, hover zoom and lightbox

Owns two things: which image is shown (`value`, from 0) and whether the
lightbox is open (`open`). The SDK's `ui-carousel` does paging, swipe, arrow
keys, slide semantics and inert off-screen slides. Its `ui-dialog` does
modality, the focus trap, Escape, outside press and returning focus. See the
quick start for the full markup. Slides and thumbnails are cloned from the
`<template>`s inside each `ui-carousel-content` and
`ui-carousel-indicator-group`.

**Loading:**
- The first slide is `eager` and `high` priority, the rest `lazy` and `low`.
- Lightbox images load nothing until it opens.

**Preloads,** as `<link rel="preload" imagesrcset imagesizes>` with the same
candidates the image asks for:
- A hovered or focused thumbnail preloads its slide.
- Previous and Next preload the image they'd show, at that view's size.
- A slide preloads its lightbox image, and its zoomed pixels with `hover-zoom`.
- Resting on a page preloads its neighbours.
- All skipped under `saveData` or 2G.

**Names and focus:**
- Slides use the merchant's alt text, or "Title, image 3 of 8".
- Thumbnails are a tablist named "Image 2 of 8: alt", with pictures marked
  decorative.
- After the lightbox closes, focus lands on the slide now showing.

| | |
| --- | --- |
| Properties | `images`, or `api.setImages(images, title?, activeUrl?)` |
| Attributes | `hover-zoom` (fine pointers only), `zoom-scale` (default 2), `sizes`, `product-title`, `value`/`default-value`, `open`/`default-open` |
| Events | `valuechange` (the carousel's reasons pass through, plus `variant`), `openchange` |
| API | `getValue()`, `getImage()`, `isOpen()`, `setImages()`, `setValue(i)`, `showImage(url)`, `next()`, `previous()`, `open()`, `close()`, `setOpen(open)`, `preload(i, view)`, `preloadUrl(url, view?)`, `subscribe()` |
| Agent | `setValue`, `next`, `previous`, `open`, `close` |

### `<shop-product>`: the buy box

Give it a product and it renders the rest: `[data-product-title]`,
`[data-product-vendor]`, `[data-product-description]`, `[data-product-stock]`,
every `<shop-price>`, the `<shop-variant-selector>` and the
`<shop-product-media>` inside it. When the variant changes, the price, stock
and gallery image follow, and the change is announced. Hovering a value that
would change the image preloads it. `ui-number-input[data-quantity]` and
`ui-button[data-product-add]` are wired to its quantity and `add`, and the
button goes pending and disabled when the variant is sold out.

| | |
| --- | --- |
| Properties | `product` (from `fetchProduct(handle, endpoint?)`) |
| Attributes | `handle` (loads the product from the cart's store), `quantity` (controlled), `default-quantity` |
| Events | `quantitychange`, `add` (cancelable, before the cart hears of it), `addcomplete` |
| API | `getVariant()`, `setVariant(id)`, `setOption(name, value)`, `setQuantity(n)`, `add()` |
| Agent | `setVariant`, `setOption`, `setQuantity`, `add`, shown once it has a product |

### `<shop-bundle>` and `<shop-bundle-item>`: products bought together

```html
<shop-bundle name="Matching set">
  <shop-bundle-item value="tee" handle="men-t-shirt">
    <h3 id="tee-title" data-bundle-item-title></h3>
    <shop-image sizes="200px"><img /></shop-image>
    <shop-price><shop-price-amount></shop-price-amount></shop-price>
    <shop-variant-selector aria-labelledby="tee-title">…the same option markup…</shop-variant-selector>
  </shop-bundle-item>
  <shop-bundle-item value="pants" handle="sweatpants">…</shop-bundle-item>

  <shop-price data-bundle-total><shop-price-amount></shop-price-amount></shop-price>
  <ui-number-input data-quantity min="1" max="10" aria-label="Sets">…</ui-number-input>
  <ui-button data-bundle-add><button type="button" aria-describedby="bundle-status">Add set to bag</button></ui-button>
  <p id="bundle-status" data-bundle-status></p>
</shop-bundle>
```

Each item loads its product by `handle` and has its own variant selector. The
bundle totals the items' prices and says which item still needs an available
choice. `add` sends one `cartLinesAdd` with a line per item, each tagged with a
`_bundle` attribute (its `name`), so the set arrives whole or not at all. Cart
lines show `[data-shop-line-bundle]` ("Part of Matching set").

| | |
| --- | --- |
| Attributes | `name`, `quantity`/`default-quantity`; on items, `value` (the key) and `handle` |
| Events | `quantitychange`, `add` (cancelable), `addcomplete` |
| API | `getItems()`, `setVariant(item, id)`, `setOption(item, name, value)`, `setQuantity(n)`, `add()` |
| Agent | `setVariant`, `setOption`, `setQuantity`, `add` |

### `<shop-cart>` and its parts: the cart

One instance per page owns the cart, from the Storefront API. The cart id is
kept in `localStorage`, it follows other tabs, and a stale id is recreated
once, silently. Every part finds the cart above it, so a drawer and a cart page
can't disagree.

| Attribute | |
| --- | --- |
| `endpoint` | Storefront API URL. Default `https://mock.shop/api` |
| `storage-key` | Where the cart id lives. Default `shop.cart` |
| `country`, `language` | The market, for `@inContext` |
| `max-quantity` | The most units a line may hold. Default 10 |

| Part | What it does |
| --- | --- |
| `<shop-cart-count>` | The number of units, `data-count`, `data-empty` |
| `<shop-cart-lines>` | One `<li>` per line, from its `<template>`: `[data-shop-line-image] img`, `-title`, `-variant`, `-bundle`, `-notice` ("Price changed from …"), `-price`, and a `ui-number-input` whose floor is 0. The last unit's decrement becomes a bin (`[data-shop-bin]` / `[data-shop-minus]`), and a bin, a typed 0 and one fewer all remove the line. `empty-message` fills `[data-shop-empty]`. Focus stays on the control it was on. |
| `<shop-cart-undo>` + `<shop-cart-undo-trigger>` | The removed line's undo, shown for eight seconds. Restores its attributes too |
| `<shop-cart-empty>` | Shown while the cart is empty: `text` → `[data-shop-empty-text]`, `[data-shop-empty-links]` |
| `<shop-cart-summary>` | `[data-shop-subtotal]` |
| `<shop-cart-total>` | `[data-shop-total-subtotal]`, `-shipping`, `-tax`, `-grand`, `-count`, and discount rows from the `<template>` in `[data-shop-total-discount-list]` |
| `<shop-cart-shipping threshold="75">` | `[data-shop-shipping-text]`, `[data-shop-shipping-remaining]`, `data-unlocked`, `--shop-shipping-progress` (0–1) for a bar inside; announces the crossing |
| `<shop-cart-discount>` | Wraps a `<form>` with an input named `code`: submit applies it. `[data-shop-discount-status]`, applied codes from the `<template>` in `[data-shop-discount-applied]`, `data-busy` / `data-applied` / `data-error`, `aria-invalid` on the input |
| `<shop-cart-checkout>` | Wraps the checkout `<a>`: `href` is the cart's `checkoutUrl`, disabled while empty. Mark it `data-agent-confirm` so an agent needs a person |
| `<shop-cart-status>` | The polite live region every cart change speaks through |

| | |
| --- | --- |
| Events | `cartchange` (the server's cart arrived), and cancelable `lineadd`, `linequantitychange`, `lineremove`, `discountapply` |
| API | `getCart()`, `getCount()`, `add(variantId, n)` or `add([{ variantId, quantity, attributes }])`, `setQuantity(lineId, n)`, `remove(lineId)`, `restore()`, `applyDiscount(code)`, `refresh()` |
| Agent | `add`, `setQuantity`, `remove`, `restore`, `applyDiscount` |

### `<shop-store-picker>`: switch between mock.shop stores

For prototypes: wraps a `ui-select` and fills it with the stores in the
[mock.shop directory](https://mock.shop/llms.txt), grouped by category. It fires
`storechange` with `{ endpoint, host, name }`; set the cart's `endpoint` from
it. Agent: `select(endpoint)`.

## Without the elements

The data layer and the primitives have no DOM and can be used on their own,
for example with another ui-sdk adapter or on a server:

```ts
import {
  fetchProduct, imageAttrs, imageSrcSet, imageUrl, preloadImage,
  valueStatus, nextVariant, variantName, money,
  shopVariantSelector, shopProductMedia, shopProduct, shopBundle, shopCart, shopImage, shopPrice,
} from "shopify-storefront-ux-sdk"

const product = await fetchProduct("sweatpants", "https://demostore.mock.shop/api")
imageAttrs(product.featuredImage, { sizes: "480px", loading: "eager", priority: "high" })
// → { src, srcset, sizes, width, height, alt, loading, fetchpriority, decoding }

const selector = shopVariantSelector({ id: "options", variants: product.variants, productOptions: product.options })
selector.api.setOption("Color", "Ocean")
selector.api.getVariant()
```

## Agents

```ts
import { createAgent } from "@ui-sdk/web/agent"

const agent = createAgent()        // once per page
agent.snapshot()                   // shop-product, shop-variant-selector, shop-product-media, shop-cart, …
await agent.act({ steps: [
  { ref: "Buy box", action: "setOption", args: ["Size", "Large"] },
  { ref: "Buy box", action: "add" },
] })
```

Agent steps go through the same `api` and the same change and cancel events
as a person's, with `source: "agent"`. Checkout is a link marked
`data-agent-confirm`, so an agent has to ask a person.

## Development

```sh
bun install
bun run typecheck
bun test          # the data layer and primitives, without a DOM
```

## License

MIT
