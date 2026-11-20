import { describe, expect, test } from "bun:test"
import { imageAttrs, type Image } from "../src/images"
import { searchString, shopCatalog, visibleProducts } from "../src/primitives/catalog"
import { shopMarketSelector } from "../src/primitives/market-selector"
import { shopPrice } from "../src/primitives/price"
import { shopProductMedia } from "../src/primitives/product-media"
import { shopBundle, shopProduct } from "../src/primitives/product"
import { shopRecommendations } from "../src/primitives/recommendations"
import { shopSearch } from "../src/primitives/search"
import { shopPay } from "../src/primitives/shop-pay"
import { addBusinessDays, shopPromise } from "../src/primitives/shop-promise"
import { shopVariantSelector } from "../src/primitives/variant-selector"
import { configureShop, shopConfig, shopPayUrl } from "../src/shop"
import {
  choicesOf,
  discountPercent,
  isOnSale,
  nextVariant,
  numericGid,
  savingsAmount,
  swatchImageOf,
  valueStatus,
  variantName,
  type Variant,
} from "../src/variants"

const money = (amount: string) => ({ amount, currencyCode: "USD" })
const variant = (id: string, size: string, color: string, available = true): Variant => ({
  id,
  title: `${size} / ${color}`,
  availableForSale: available,
  selectedOptions: [
    { name: "Size", value: size },
    { name: "Color", value: color },
  ],
  price: money(size === "L" ? "50" : "40"),
  compareAtPrice: null,
  image: { url: `https://cdn.shopify.com/${color}.jpg`, altText: null, width: 1000, height: 1250 },
})
// M/Red is sold out; S/Blue doesn't exist.
const variants = [
  variant("s-red", "S", "Red"),
  variant("m-red", "M", "Red", false),
  variant("m-blue", "M", "Blue"),
  variant("l-blue", "L", "Blue"),
]
const productOptions = [
  { name: "Size", values: ["S", "M", "L"] },
  { name: "Color", values: ["Red", "Blue"] },
]
const images: Image[] = ["a", "b", "c"].map((name) => ({
  url: `https://cdn.shopify.com/${name}.jpg`,
  altText: name === "b" ? "Back view" : null,
  width: 2000,
  height: 2500,
}))

describe("variant model", () => {
  test("sold out is choosable, a combination that doesn't exist is missing", () => {
    expect(valueStatus(variants, "Size", "M", { Size: "S", Color: "Red" })).toBe("sold-out")
    expect(valueStatus(variants, "Size", "S", { Size: "M", Color: "Blue" })).toBe("missing")
    expect(valueStatus(variants, "Size", "L", { Size: "M", Color: "Blue" })).toBe("available")
  })
  test("a value the current combination lacks moves the other options, available first", () => {
    expect(nextVariant(variants, variants[0], "Color", "Blue")?.id).toBe("m-blue")
    expect(nextVariant(variants, variants[2], "Size", "M")?.id).toBe("m-blue")
    expect(nextVariant(variants, variants[0], "Size", "M")?.id).toBe("m-red")
  })
  test("a lone Default Title, Default, or single-value option is no choice", () => {
    expect(choicesOf([{ name: "Title", values: ["Default Title"] }, ...productOptions])).toHaveLength(2)
    expect(choicesOf([{ name: "Title", values: ["Default"] }, { name: "Size", values: ["One Size"] }, ...productOptions])).toHaveLength(2)
    expect(variantName({ ...variants[0], title: "Default", selectedOptions: [{ name: "Title", value: "Default" }] })).toBe("")
  })
})

describe("shop-variant-selector", () => {
  test("starts on the first variant for sale, without an event", () => {
    const calls: unknown[] = []
    const selector = shopVariantSelector({ id: "s", variants, productOptions, onValueChange: (v) => calls.push(v) })
    expect(selector.get().value).toBe("s-red")
    expect(calls).toEqual([])
  })
  test("an option change reports the variant, its reason and the option, and can be canceled", () => {
    const seen: { value: string; reason: string; option: unknown; source: string }[] = []
    let cancel = true
    const selector = shopVariantSelector({
      id: "s",
      variants,
      productOptions,
      onValueChange: (value, details) => {
        seen.push({ value, reason: details.reason, option: (details as unknown as { option: string }).option, source: details.source })
        if (cancel) details.cancel()
      },
    })
    expect(selector.api.setOption("Color", "Blue", { reason: "item-press" })).toBe(false)
    expect(selector.get().value).toBe("s-red")
    cancel = false
    expect(selector.api.setOption("Color", "Blue", { reason: "item-press" })).toBe(true)
    expect(selector.get().value).toBe("m-blue")
    expect(seen.at(-1)).toMatchObject({ value: "m-blue", reason: "item-press", option: "Color" })
  })
  test("controlled: the change is reported, the value waits for its owner", () => {
    const selector = shopVariantSelector({ id: "s", variants, productOptions, value: "s-red", onValueChange: () => {} })
    expect(selector.api.setValue("l-blue")).toBe(true)
    expect(selector.get().value).toBe("s-red")
  })
  test("an unknown id is refused", () => {
    const selector = shopVariantSelector({ id: "s", variants, productOptions })
    expect(selector.api.setValue("nope")).toBe(false)
  })
})

describe("shop-product-media", () => {
  test("clamps, wraps and reports the carousel's reasons", () => {
    const reasons: string[] = []
    const media = shopProductMedia({ id: "m", images, onValueChange: (_, details) => reasons.push(details.reason) })
    expect(media.api.setValue(9)).toBe(true)
    expect(media.get().value).toBe(2)
    media.api.next()
    expect(media.get().value).toBe(0)
    media.api.previous()
    expect(media.get().value).toBe(2)
    media.api.showImage(images[1].url)
    expect(media.get().value).toBe(1)
    expect(reasons).toEqual(["imperative", "next-press", "previous-press", "variant"])
  })
  test("new images keep the shown image when it's still there, quietly", () => {
    const calls: number[] = []
    const media = shopProductMedia({ id: "m", images, defaultValue: 1, onValueChange: (value) => calls.push(value) })
    media.api.setImages([images[2], images[1]])
    expect(media.get().value).toBe(1)
    expect(calls).toEqual([])
  })
  test("alt text falls back to what and which, and the lightbox can't open empty", () => {
    const media = shopProductMedia({ id: "m", images, productTitle: "Hoodie" })
    expect(media.api.internal.altFor(0)).toBe("Hoodie, image 1 of 3")
    expect(media.api.internal.altFor(1)).toBe("Back view")
    const empty = shopProductMedia({ id: "e" })
    expect(empty.api.open()).toBe(false)
  })
  test("opening can be canceled", () => {
    const media = shopProductMedia({ id: "m", images, onOpenChange: (_, details) => details.cancel() })
    expect(media.api.open()).toBe(false)
    expect(media.get().open).toBe(false)
  })
})

describe("images", () => {
  test("an <img> that reserves its box and loads by priority", () => {
    const attrs = imageAttrs(images[0], { sizes: "480px", loading: "eager", priority: "high" })
    expect(attrs).toMatchObject({ width: "2000", height: "2500", sizes: "480px", loading: "eager", fetchpriority: "high", decoding: "async" })
    expect(attrs.srcset).toContain("1920w")
    expect(imageAttrs(images[0], { alt: "" }).alt).toBe("")
    expect(imageAttrs(null)).toMatchObject({ hidden: "" })
  })
  test("a host without Shopify's transforms gets no invented candidates", () => {
    const attrs = imageAttrs({ ...images[0], url: "https://example.com/a.jpg" })
    expect(attrs.srcset).toBeUndefined()
    expect(attrs.sizes).toBeUndefined()
  })
})

describe("shop-price", () => {
  test("on sale only while the earlier price is higher, in the same currency, with discount percent", () => {
    const sale = shopPrice({ id: "p", price: money("199"), compareAtPrice: money("499") })
    expect(sale.api.isOnSale()).toBe(true)
    expect(sale.api.getDiscountPercent()).toBe(60)
    expect(shopPrice({ id: "p", price: money("40"), compareAtPrice: money("40") }).api.isOnSale()).toBe(false)
    expect(shopPrice({ id: "p", price: money("40"), compareAtPrice: money("40") }).api.getDiscountPercent()).toBeNull()
    expect(
      shopPrice({ id: "p", price: money("30"), compareAtPrice: { amount: "40", currencyCode: "CAD" } }).api.isOnSale(),
    ).toBe(false)
  })
})

describe("shop-catalog", () => {
  test("combines free text with product_type and vendor field terms", () => {
    expect(searchString("", null)).toBeNull()
    expect(searchString(" freeride ", null)).toBe("freeride")
    expect(searchString("arbor", "Snowboard")).toBe('arbor product_type:"Snowboard"')
    expect(searchString("", "Snowboard", "Never Summer")).toBe('product_type:"Snowboard" vendor:"Never Summer"')
  })
  test("validates filters, sorts, vendor, onSale and reset", () => {
    const catalog = shopCatalog({ id: "c", endpoint: "", filters: ["Snowboard", "Binding"], defaultSort: "featured" })
    expect(catalog.api.setFilter("snowboard")).toBe(true)
    expect(catalog.get().filter).toBe("Snowboard")
    expect(catalog.api.setFilter("Unknown")).toBe(false)
    expect(catalog.api.setVendor("Arbor")).toBe(true)
    expect(catalog.get().vendor).toBe("Arbor")
    expect(catalog.api.setOnSale(true)).toBe(true)
    expect(catalog.get().onSale).toBe(true)
    expect(catalog.api.setSort("price-low")).toBe(true)
    expect(catalog.get().sort).toBe("price-low")
    expect(catalog.api.reset()).toBe(true)
    expect(catalog.get()).toMatchObject({ query: "", filter: null, vendor: null, onSale: false })
    catalog.destroy()
  })
  test("filters visible products when onSale is active", () => {
    const items = [
      { id: "1", handle: "a", title: "A", vendor: "Arbor", productType: "Snowboard", tags: [], availableForSale: true, featuredImage: null, price: money("199"), compareAtPrice: money("499"), variants: [] },
      { id: "2", handle: "b", title: "B", vendor: "Arbor", productType: "Snowboard", tags: [], availableForSale: true, featuredImage: null, price: money("199"), compareAtPrice: null, variants: [] },
    ]
    expect(visibleProducts({ products: items, onSale: false } as never)).toHaveLength(2)
    expect(visibleProducts({ products: items, onSale: true } as never).map((p) => p.id)).toEqual(["1"])
  })
})

describe("shop-product and shop-bundle", () => {
  test("add reads the selector's variant, and onAdd can keep it out of the cart", async () => {
    const added: unknown[] = []
    let refuse = true
    const product = shopProduct({
      id: "p",
      defaultQuantity: 2,
      onAdd: (_, details) => refuse && details.cancel(),
    })
    product.api.internal.connect({ cart: { add: async (lines) => added.push(lines) } })
    product.api.internal.follow(variants[2])
    expect(await product.api.add()).toBe(false)
    refuse = false
    expect(await product.api.add()).toBe(true)
    expect(added).toEqual([[{ variantId: "m-blue", quantity: 2 }]])
  })
  test("a sold-out variant isn't added", async () => {
    const product = shopProduct({ id: "p" })
    product.api.internal.connect({ cart: { add: async () => {} } })
    product.api.internal.follow(variants[1])
    await expect(product.api.add()).rejects.toThrow(/sold out/)
  })
  test("a bundle adds one line per item, tagged with the set, only once every item can be bought", async () => {
    const added: unknown[] = []
    const bundle = shopBundle({ id: "b", name: "Matching set" })
    bundle.api.internal.connect({ cart: { add: async (lines) => added.push(lines) } })
    bundle.api.internal.follow("tee", variants[1])
    bundle.api.internal.follow("pants", variants[3])
    await expect(bundle.api.add()).rejects.toThrow(/every item/)
    bundle.api.internal.follow("tee", variants[0])
    expect(await bundle.api.add()).toBe(true)
    const attributes = [{ key: "_bundle", value: "Matching set" }]
    expect(added).toEqual([
      [
        { variantId: "s-red", quantity: 1, attributes },
        { variantId: "l-blue", quantity: 1, attributes },
      ],
    ])
  })
})

describe("price, gid and swatch helpers", () => {
  test("computes sale state, discount percent, savings, numeric GIDs and swatch images", () => {
    expect(isOnSale(money("199"), money("499"))).toBe(true)
    expect(discountPercent(money("199"), money("499"))).toBe(60)
    expect(savingsAmount(money("199"), money("499"))).toEqual({ amount: "300.00", currencyCode: "USD" })
    expect(numericGid("gid://shopify/ProductVariant/44123456789")).toBe("44123456789")
    expect(numericGid("999")).toBe("999")
    expect(numericGid("not-a-gid")).toBeNull()
    const pattern = { url: "https://cdn.shopify.com/plaid.jpg", altText: "Plaid", width: 200, height: 200 }
    expect(
      swatchImageOf(
        { name: "Pattern", values: ["Plaid"], optionValues: [{ name: "Plaid", swatch: { color: null, image: { previewImage: pattern } } }] },
        "Plaid",
      ),
    ).toEqual(pattern)
  })
})

describe("shop-pay", () => {
  test("builds Shop Pay permalink URLs and cart checkout URLs", () => {
    expect(
      shopPayUrl(
        [{ variantId: "gid://shopify/ProductVariant/12345", quantity: 2 }],
        "https://www.snowdevil.ca/api/2026-10/graphql.json",
      ),
    ).toBe("https://www.snowdevil.ca/cart/12345:2?payment=shop_pay")
    expect(shopPayUrl({ checkoutUrl: "https://www.snowdevil.ca/cart/c/abc123" })).toBe(
      "https://www.snowdevil.ca/cart/c/abc123?payment=shop_pay",
    )
  })
  test("computes installments within bounds and supports cancelable checkout", () => {
    let cancel = true
    const pay = shopPay({
      id: "pay",
      endpoint: "https://www.snowdevil.ca/api/2026-10/graphql.json",
      lines: [{ variantId: "gid://shopify/ProductVariant/12345", quantity: 1 }],
      price: money("200"),
      onCheckout: (_, details) => cancel && details.cancel(),
    })
    expect(pay.api.isReady()).toBe(true)
    expect(pay.api.getInstallment()).toMatchObject({ eligible: true, each: { amount: "50.00", currencyCode: "USD" } })
    expect(pay.api.checkout()).toBeNull()
    cancel = false
    expect(pay.api.checkout()).toBe("https://www.snowdevil.ca/cart/12345:1?payment=shop_pay")
    const cheap = shopPay({ id: "cheap", price: money("20") })
    expect(cheap.api.getInstallment().eligible).toBe(false)
  })
})

describe("shop-promise", () => {
  test("skips weekends, honors cutoff hour and hides when sold out", () => {
    // Friday Nov 20, 2026 at 10:00 (before 14:00 cutoff): +2 business days => Tue Nov 24
    const fridayMorning = new Date(2026, 10, 20, 10, 0, 0).getTime()
    expect(addBusinessDays(new Date(fridayMorning), 2).getDay()).toBe(2)
    const before = shopPromise({ id: "p1", now: fridayMorning, minDays: 2, maxDays: 2, cutoffHour: 14, locale: "en-US" })
    expect(before.api.isEligible()).toBe(true)
    expect(before.api.getEstimate().dateText).toContain("Nov 24")

    // Friday Nov 20, 2026 at 16:00 (after cutoff): +3 business days => Wed Nov 25
    const fridayAfternoon = new Date(2026, 10, 20, 16, 0, 0).getTime()
    const after = shopPromise({ id: "p2", now: fridayAfternoon, minDays: 2, maxDays: 2, cutoffHour: 14, locale: "en-US" })
    expect(after.api.getEstimate().dateText).toContain("Nov 25")

    const soldOut = shopPromise({ id: "p3", available: false })
    expect(soldOut.api.isEligible()).toBe(false)
    expect(soldOut.api.getEstimate().message).toBe("")
  })
})

describe("shop-market-selector", () => {
  test("validates countries, updates shopConfig and supports cancelable changes", () => {
    const prev = shopConfig()
    const countries = [
      { isoCode: "US", name: "United States", currency: { isoCode: "USD", symbol: "$" } },
      { isoCode: "CA", name: "Canada", currency: { isoCode: "CAD", symbol: "$" } },
      { isoCode: "DE", name: "Germany", currency: { isoCode: "EUR", symbol: "€" } },
    ]
    let cancel = true
    const market = shopMarketSelector({
      id: "mkt",
      countries,
      defaultCountry: "US",
      onCountryChange: (_, details) => cancel && details.cancel(),
    })
    expect(market.api.setCountry("ZZ")).toBe(false)
    expect(market.api.setCountry("CA")).toBe(false)
    expect(market.api.getMarket().country).toBe("US")
    cancel = false
    expect(market.api.setCountry("DE")).toBe(true)
    expect(market.api.getMarket()).toMatchObject({ country: "DE", currency: "EUR", symbol: "€" })
    expect(shopConfig().country).toBe("DE")
    market.destroy()
    configureShop({ country: prev.country, language: prev.language })
  })
})

describe("shop-search and shop-recommendations", () => {
  test("manages query state and empty recommendations cleanly", () => {
    const search = shopSearch({ id: "search", endpoint: "" })
    expect(search.api.setQuery("arbor")).toBe(true)
    expect(search.get().query).toBe("arbor")
    expect(search.api.clear()).toBe(true)
    expect(search.get().query).toBe("")
    search.destroy()

    const recs = shopRecommendations({ id: "recs", productId: null })
    expect(recs.api.getProducts()).toEqual([])
    recs.destroy()
  })
})
