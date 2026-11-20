// shopify-storefront-ux-sdk, in three layers:
//
// 1. Data, with no UI: the Storefront client and cart store (./shop), Shopify
//    CDN images (./images) and the variant model (./variants).
// 2. Primitives, framework-agnostic `definePrimitive` definitions, from the
//    low level up: image, price, variant selector; product media; product and
//    bundle; the cart and its parts; the store picker.
// 3. Web components: importing this entry registers every element
//    (`<shop-image>`, `<shop-price>`, `<shop-variant-selector>`,
//    `<shop-product-media>`, `<shop-product>`, `<shop-bundle>`,
//    `<shop-cart>` and its parts, `<shop-store-picker>`).
import "./web/index"

export * from "./images"
export * from "./variants"
export {
  addLine,
  addLines,
  announce,
  applyDiscount,
  cart,
  clearUndo,
  configureShop,
  ensureCart,
  fetchProduct,
  money,
  quantityLimit,
  removeLine,
  setLineQuantity,
  status,
  subscribeAnnouncements,
  subscribeCart,
  subscribeUndo,
  type Cart,
  type CartDiscount,
  type CartLine,
  type DiscountCode,
  type LineAttribute,
  type LineInput,
  type Product,
  type RemovedLine,
  type ShopConfig,
} from "./shop"
export { shopImage, type ShopImageOptions, type ShopImageStatus } from "./primitives/image"
export { shopPrice, type ShopPriceOptions, type ShopPriceState } from "./primitives/price"
export {
  shopVariantSelector,
  type ShopVariantOptionState,
  type ShopVariantSelectorOptions,
  type ShopVariantSelectorState,
  type VariantChangeReason,
} from "./primitives/variant-selector"
export {
  shopProductMedia,
  type LightboxChangeReason,
  type MediaChangeReason,
  type ShopProductMediaOptions,
  type ShopProductMediaState,
} from "./primitives/product-media"
export {
  shopBundle,
  shopProduct,
  type ShopBundleOptions,
  type ShopBundleState,
  type ShopProductOptions,
  type ShopProductState,
} from "./primitives/product"
export {
  shopCart,
  type CartStatus,
  type DiscountStatus,
  type LineReason,
  type ShopCartOptions,
  type ShopCartState,
} from "./primitives/cart"
export { shopStorePicker } from "./primitives/store-picker"
