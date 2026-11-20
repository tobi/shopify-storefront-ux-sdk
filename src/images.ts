/**
 * Shopify CDN images, with no UI: URLs, candidate sets, the attributes an
 * `<img>` needs, and preloading. Pure apart from `preloadImage`, which writes
 * one `<link rel="preload">` per distinct request.
 */

type Image = { id?: string | null; url: string; altText: string | null; width: number; height: number }

/** Shopify's modern CDN transforms; other image hosts are left untouched. */
type ImageTransform = {
  width?: number
  height?: number
  crop?: "center" | "top" | "bottom" | "left" | "right"
  format?: "jpg" | "pjpg" | "webp"
}

type ImageLoading = "lazy" | "eager"
type ImagePriority = "high" | "low" | "auto"

/** Widths a product photo is offered at, before capping at the source. */
const defaultWidths = [320, 480, 640, 960, 1280, 1600, 1920]
const maxDimension = 5760

function isShopifyImage(url: URL) {
  return url.hostname === "cdn.shopify.com" || url.pathname.startsWith("/cdn/shop/")
}

function parse(url: string) {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

function dimension(value: number, original: number) {
  const cap = original > 0 ? Math.min(original, maxDimension) : maxDimension
  return Math.min(cap, Math.max(1, Math.round(value)))
}

function imageUrl(image: Image, transform: number | ImageTransform) {
  const url = parse(image.url)
  if (!url || !isShopifyImage(url)) return image.url
  // HTTPS even when the API handed back http; version tokens stay.
  url.protocol = "https:"
  const options = typeof transform === "number" ? { width: transform } : transform
  for (const key of ["width", "height"] as const) {
    const value = options[key]
    if (value !== undefined && Number.isFinite(value)) {
      url.searchParams.set(key, String(dimension(value, image[key])))
    }
  }
  if (options.crop && options.width && options.height) url.searchParams.set("crop", options.crop)
  // Without `format`, the CDN negotiates AVIF/WebP from the Accept header.
  if (options.format) url.searchParams.set("format", options.format)
  return url.toString()
}

/** Candidate widths that tell the truth: capped at the source and deduplicated. */
function candidateWidths(image: Image, widths: readonly number[] = defaultWidths) {
  const usable = widths.filter((width) => Number.isFinite(width) && width > 0)
  return [...new Set(usable.map((width) => dimension(width, image.width)))].sort((a, b) => a - b)
}

function imageSrcSet(image: Image, widths: readonly number[] = defaultWidths) {
  const url = parse(image.url)
  if (!url || !isShopifyImage(url)) return ""
  return candidateWidths(image, widths)
    .map((width) => `${imageUrl(image, width)} ${width}w`)
    .join(", ")
}

type ImageAttrOptions = {
  alt?: string
  sizes?: string
  widths?: readonly number[]
  loading?: ImageLoading
  priority?: ImagePriority
}

/**
 * Everything an `<img>` needs to load the right pixels without shifting the
 * layout: intrinsic dimensions, a candidate set the browser picks from with
 * `sizes`, and loading hints. `src` is the middle candidate, for browsers
 * that ignore `srcset`. Pure, so it renders the same on a server.
 */
function imageAttrs(image: Image | null, options: ImageAttrOptions = {}) {
  if (!image) return { hidden: "" as const, alt: "" }
  const widths = candidateWidths(image, options.widths)
  const fallback = widths[Math.floor(widths.length / 2)] ?? image.width
  const srcset = imageSrcSet(image, widths)
  return {
    src: imageUrl(image, fallback),
    srcset: srcset || undefined,
    sizes: srcset ? (options.sizes ?? "100vw") : undefined,
    width: image.width ? String(image.width) : undefined,
    height: image.height ? String(image.height) : undefined,
    alt: options.alt ?? image.altText ?? "",
    loading: options.loading ?? "lazy",
    fetchpriority: options.priority && options.priority !== "auto" ? options.priority : undefined,
    decoding: "async",
    hidden: undefined,
  }
}

const preloaded = new Set<string>()

/** Whether the person asked to save data, or is on a connection too slow to spend it. */
function savingData() {
  const connection = (globalThis.navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string }
  })?.connection
  return Boolean(connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? ""))
}

/**
 * Asks for the candidate an `<img>` with the same `srcset` and `sizes` would
 * pick, before it exists or before it's shown, like the next slide or a
 * zoomed view. The browser reuses the response when the image asks for it.
 * Skipped when saving data; returns whether a request was made.
 */
function preloadImage(
  image: Image | null | undefined,
  options: { sizes: string; widths?: readonly number[]; priority?: ImagePriority } = { sizes: "100vw" },
) {
  if (!image || typeof document === "undefined" || savingData()) return false
  const srcset = imageSrcSet(image, options.widths)
  const key = srcset ? `${srcset}|${options.sizes}` : image.url
  if (preloaded.has(key)) return false
  preloaded.add(key)
  const link = document.createElement("link")
  link.rel = "preload"
  link.as = "image"
  // `href` is the same fallback the <img>'s `src` uses: browsers without
  // `imagesrcset` fetch it, the rest pick from the set.
  const widths = candidateWidths(image, options.widths)
  link.href = srcset ? imageUrl(image, widths[Math.floor(widths.length / 2)] ?? image.width) : image.url
  if (srcset) {
    link.setAttribute("imagesrcset", srcset)
    link.setAttribute("imagesizes", options.sizes)
  }
  link.setAttribute("fetchpriority", options.priority ?? "low")
  document.head.append(link)
  return true
}

export {
  candidateWidths,
  defaultWidths,
  imageAttrs,
  imageSrcSet,
  imageUrl,
  isShopifyImage,
  preloadImage,
  savingData,
  type Image,
  type ImageAttrOptions,
  type ImageLoading,
  type ImagePriority,
  type ImageTransform,
}
