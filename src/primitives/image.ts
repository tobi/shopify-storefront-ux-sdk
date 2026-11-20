import { definePrimitive } from "@ui-sdk/core"
import {
  imageAttrs,
  preloadImage,
  type Image,
  type ImageLoading,
  type ImagePriority,
} from "../images"

/** Where the pixels are: nothing to show, on their way, shown, or failed. */
type ShopImageStatus = "empty" | "loading" | "loaded" | "error"

type ShopImageOptions = {
  /** A Storefront `Image`: `{ url, altText, width, height }`. A property, not an attribute. */
  image?: Image | null
  /** Replaces the image's own `altText`. Pass `""` for a decorative image. */
  alt?: string
  /** The rendered slot, for the browser to pick a candidate. Defaults to `100vw`. */
  sizes?: string
  /** Candidate widths, capped at the source. */
  widths?: string[]
  /** `lazy` (default) or `eager`, for the image a page opens on. */
  loading?: ImageLoading
  /** `high` for the LCP image, `low` for images that aren't shown yet. */
  priority?: ImagePriority
}

type State = {
  image: Image | null
  alt: string | undefined
  sizes: string
  widths: number[] | undefined
  loading: ImageLoading
  priority: ImagePriority
  status: ShopImageStatus
}

const settings = (options: ShopImageOptions) => ({
  image: options.image ?? null,
  alt: options.alt,
  sizes: options.sizes ?? "100vw",
  widths: options.widths?.map(Number).filter((width) => width > 0),
  loading: options.loading === "eager" ? ("eager" as const) : ("lazy" as const),
  priority: options.priority ?? "auto",
})

/**
 * A responsive Shopify image: one `<img>` with intrinsic dimensions, a CDN
 * candidate set, `sizes`, and loading hints, so it reserves its box and
 * downloads only the pixels its slot needs. Its `status` follows the load, as
 * `data-status` on the image. The building block every other image uses.
 *
 * ```html
 * <shop-image sizes="(max-width: 600px) 100vw, 480px"><img /></shop-image>
 * ```
 */
const shopImage = definePrimitive({
  name: "shop-image",
  options: {
    image: "value",
    alt: "string",
    sizes: "string",
    widths: "list",
    loading: "string",
    priority: "string",
  },
  // A reading of the network, not a choice anyone makes.
  controlled: [],
  state: (options: ShopImageOptions): State => ({
    ...settings(options),
    status: options.image ? "loading" : "empty",
  }),
  sync: settings,
  api: (context) => {
    const { store } = context
    let url = store.get().image?.url
    context.onOptions((options) => {
      const next = options.image?.url
      if (next === url) return
      url = next
      store.set({ status: next ? "loading" : "empty" })
    })
    return {
      getImage: () => store.get().image,
      getStatus: () => store.get().status,
      /**
       * Requests the candidate this image would pick at `sizes`, like a zoomed
       * or expanded view, before it's shown. Returns whether it asked.
       */
      preload: (sizes?: string, priority: ImagePriority = "low") => {
        const state = store.get()
        return preloadImage(state.image, { sizes: sizes ?? state.sizes, widths: state.widths, priority })
      },
      internal: {
        settle: (status: "loaded" | "error") => {
          if (store.get().image) store.set({ status })
        },
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, { status: ShopImageStatus }>({
      state: (state) => ({ status: state.status }),
      attrs: (state) => ({
        ...imageAttrs(state.image, {
          alt: state.alt,
          sizes: state.sizes,
          widths: state.widths,
          loading: state.loading,
          priority: state.priority,
        }),
        "data-status": state.status,
      }),
      bind: (el, { api }) => {
        const image = el as HTMLImageElement
        const loaded = () => api.internal.settle("loaded")
        const failed = () => api.internal.settle("error")
        image.addEventListener("load", loaded)
        image.addEventListener("error", failed)
        // Cached images can finish before the element binds.
        if (image.complete && image.currentSrc) {
          if (image.naturalWidth) loaded()
          else failed()
        }
        return () => {
          image.removeEventListener("load", loaded)
          image.removeEventListener("error", failed)
        }
      },
    }),
  }),
  // A picture is content: the image's alt text already names it.
  agent: { actions: [], shown: () => false },
})

export { shopImage, type ShopImageOptions, type ShopImageStatus }
