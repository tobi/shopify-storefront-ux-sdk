import { describe, expect, test } from "bun:test"
import { imageUrl, imageSrcSet, type Image } from "../src/images"

const image: Image = { url: "http://cdn.shopify.com/s/files/1/test.jpg?v=42", width: 1000, height: 1500, altText: "Front" }

describe("Shopify CDN image sets", () => {
  test("uses HTTPS, preserves version and supports resize/crop/format", () => {
    const url = new URL(imageUrl(image, { width: 480, height: 600, crop: "center", format: "webp" }))
    expect(url.protocol).toBe("https:")
    expect(Object.fromEntries(url.searchParams)).toEqual({ v: "42", width: "480", height: "600", crop: "center", format: "webp" })
  })
  test("caps and deduplicates candidates at the source dimensions", () => {
    expect(imageSrcSet(image, [320, 640, 1280, 1920, 640, -1, NaN]).split(", ").map((part) => part.split(" ").at(-1)))
      .toEqual(["320w", "640w", "1000w"])
    expect(new URL(imageUrl(image, 2000)).searchParams.get("width")).toBe("1000")
  })
  test("limits unknown dimensions to Shopify's 5760 pixel maximum", () => {
    expect(new URL(imageUrl({ ...image, width: 0 }, 9000)).searchParams.get("width")).toBe("5760")
  })
  test("does not add unsupported transforms to third party images", () => {
    const other = { ...image, url: "https://example.com/image.jpg?v=1" }
    expect(imageUrl(other, 480)).toBe(other.url)
    expect(imageSrcSet(other)).toBe("")
  })
  test("supports same-origin Shopify /cdn/shop paths", () => {
    expect(imageUrl({ ...image, url: "https://shop.example/cdn/shop/files/image.jpg" }, 480)).toContain("width=480")
  })
})
