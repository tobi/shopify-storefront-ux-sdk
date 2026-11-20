// shopify-storefront-ux-sdk, in three layers:
//
// 1. Data, with no UI: the Storefront client and cart store (./shop), Shopify
//    CDN images (./images) and the variant model (./variants).
// 2. Primitives, framework-agnostic `definePrimitive` definitions (also
//    exported without DOM side effects at `shopify-storefront-ux-sdk/core`).
// 3. Web components: importing this entry registers every element
//    (`<shop-image>`, `<shop-price>`, `<shop-variant-selector>`,
//    `<shop-product-media>`, `<shop-product>`, `<shop-bundle>`,
//    `<shop-cart>` and its parts, `<shop-store-picker>`).
import "./web/index"

export * from "./core"
