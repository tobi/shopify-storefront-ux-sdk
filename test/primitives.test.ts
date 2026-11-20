import { describe, expect, test } from "bun:test"
import { imageAttrs, type Image } from "../src/images"
import { shopPrice } from "../src/primitives/price"
import { shopProductMedia } from "../src/primitives/product-media"
import { shopBundle, shopProduct } from "../src/primitives/product"
import { shopVariantSelector } from "../src/primitives/variant-selector"
import { nextVariant, valueStatus, choicesOf, type Variant } from "../src/variants"

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
  test("a lone Default Title is no choice", () => {
    expect(choicesOf([{ name: "Title", values: ["Default Title"] }, ...productOptions])).toHaveLength(2)
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
  test("on sale only while the earlier price is higher, in the same currency", () => {
    expect(shopPrice({ id: "p", price: money("30"), compareAtPrice: money("40") }).api.isOnSale()).toBe(true)
    expect(shopPrice({ id: "p", price: money("40"), compareAtPrice: money("40") }).api.isOnSale()).toBe(false)
    expect(
      shopPrice({ id: "p", price: money("30"), compareAtPrice: { amount: "40", currencyCode: "CAD" } }).api.isOnSale(),
    ).toBe(false)
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
