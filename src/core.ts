// Headless entry: non-lossy Storefront data layer and framework-agnostic
// `definePrimitive` definitions, with no custom-element registration side
// effects. Use this from Solid, React, server renders, or custom adapters.
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
  currentCart,
  ensureCart,
  fetchCollection,
  fetchCollections,
  fetchLocalization,
  fetchMenu,
  fetchPredictiveSearch,
  fetchProduct,
  fetchProductRecommendations,
  fetchShop,
  graphql,
  money,
  quantityLimit,
  removeDiscount,
  removeLine,
  removeLines,
  setLineQuantity,
  shopConfig,
  shopPayUrl,
  status,
  subscribeAnnouncements,
  subscribeCart,
  subscribeConfig,
  subscribeUndo,
  updateBuyerIdentity,
  updateCartAttributes,
  updateCartNote,
  type Cart,
  type CartDiscount,
  type CartLine,
  type CartLineCost,
  type CollectionFilter,
  type CollectionFilterValue,
  type CollectionPage,
  type CollectionSummary,
  type DiscountCode,
  type LineAttribute,
  type LineInput,
  type Localization,
  type MarketCountry,
  type MarketCurrency,
  type MarketLanguage,
  type MenuItem,
  type PredictiveSearchQuery,
  type PredictiveSearchResult,
  type PriceRange,
  type Product,
  type ProductCardData,
  type RemovedLine,
  type RequestOptions,
  type Seo,
  type ShopConfig,
  type ShopInfo,
  type ShopMenu,
} from "./shop"
export { shopImage, type ShopImageOptions, type ShopImageStatus } from "./primitives/image"
export { shopPrice, type ShopPriceOptions, type ShopPriceState } from "./primitives/price"
export {
  shopVariantSelector,
  type ShopVariantOptionState,
  type ShopVariantSelectorOptions,
  type ShopVariantSelectorState,
  type VariantChangeReason,
  type VariantIntentReason,
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
export {
  catalogSorts,
  fetchCatalog,
  searchString,
  shopCatalog,
  visibleProducts,
  type CatalogPage,
  type CatalogProduct,
  type CatalogReason,
  type CatalogSort,
  type CatalogStatus,
  type CatalogVariant,
  type ShopCatalogOptions,
  type ShopCatalogState,
} from "./primitives/catalog"
export {
  shopPay,
  type ShopPayOptions,
  type ShopPayState,
} from "./primitives/shop-pay"
export {
  addBusinessDays,
  shopPromise,
  type ShopPromiseOptions,
  type ShopPromiseState,
} from "./primitives/shop-promise"
export {
  shopMarketSelector,
  type MarketChangeReason,
  type MarketStatus,
  type ShopMarketSelectorOptions,
  type ShopMarketSelectorState,
} from "./primitives/market-selector"
export {
  shopSearch,
  type SearchReason,
  type SearchStatus,
  type ShopSearchOptions,
  type ShopSearchState,
} from "./primitives/search"
export {
  shopRecommendations,
  type RecommendationsStatus,
  type ShopRecommendationsOptions,
  type ShopRecommendationsState,
} from "./primitives/recommendations"
export { shopStorePicker } from "./primitives/store-picker"
