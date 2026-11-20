import { createChange, definePrimitive, isRTL, type ChangeDetails } from "@ui-sdk/core"
import { preloadImage, type Image } from "../images"

/**
 * Why the image changed. The carousel's own reasons pass through: a thumbnail
 * (`item-press`), arrow keys (`list-navigation`), Previous and Next, a swipe
 * or a scroll. `variant` is the buy box showing the chosen variant's image.
 */
type MediaChangeReason =
  | "item-press"
  | "list-navigation"
  | "previous-press"
  | "next-press"
  | "swipe"
  | "scroll"
  | "content-resize"
  | "variant"
  | "imperative"

/** Why the lightbox opened or closed: the dialog's reasons pass through. */
type LightboxChangeReason =
  | "trigger-press"
  | "close-press"
  | "escape-key"
  | "outside-press"
  | "parent-close"
  | "back"
  | "action"
  | "shortcut"
  | "swipe"
  | "imperative"

type ShopProductMediaOptions = {
  /** The product's images, in order. A property. */
  images?: Image[]
  /**
   * The product's name, for alt text an image doesn't have and the lightbox
   * title. Not `title`: that attribute is the browser's tooltip.
   */
  productTitle?: string
  /** The shown image's index, from 0. Pass it to control the gallery. */
  value?: number
  defaultValue?: number
  onValueChange?: (value: number, details: ChangeDetails<MediaChangeReason>) => void
  /** Whether the lightbox is open. Pass it to control it. */
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean, details: ChangeDetails<LightboxChangeReason>) => void
  /** Magnifies the image under a fine pointer, at `zoom-scale` (default 2). */
  hoverZoom?: boolean
  zoomScale?: number
  /** The main image's rendered slot, for the browser to pick a candidate. */
  sizes?: string
}

type State = {
  value: number
  open: boolean
  images: Image[]
  title: string
  hoverZoom: boolean
  zoomScale: number
  sizes: string
  /** The slide a fine pointer is zooming, or null. */
  zooming: number | null
}

type ShopProductMediaState = {
  value: number
  count: number
  open: boolean
  /** "3 of 8". */
  position: string
}

/** The main image's slot in the demo's buy box. Override with `sizes`. */
const defaultSizes = "(max-width: 900px) calc(100vw - 64px), (max-width: 1280px) 45vw, 560px"
/** The lightbox panel: 1040px at most, with a gutter on every screen. */
const lightboxSizes = "(max-width: 600px) calc(100vw - 24px), min(1040px, calc(100vw - 96px))"
const thumbnailSizes = "64px"
const lightboxWidths = [640, 960, 1280, 1600, 1920, 2560, 3200, 3840]

const unique = (images: readonly Image[]) => [
  ...new Map(images.filter(Boolean).map((image) => [image.url, image])).values(),
]

const clampIndex = (value: number, count: number) =>
  count ? Math.min(count - 1, Math.max(0, Math.round(value) || 0)) : 0

const settings = (options: ShopProductMediaOptions) => ({
  ...(options.images ? { images: unique(options.images) } : {}),
  // Set by `setImages` too: an option sync mustn't clear it.
  ...(options.productTitle === undefined ? {} : { title: options.productTitle }),
  hoverZoom: Boolean(options.hoverZoom),
  zoomScale: Math.max(1.25, Math.min(4, options.zoomScale ?? 2)),
  sizes: options.sizes ?? defaultSizes,
  ...(options.value === undefined ? {} : { value: options.value }),
  ...(options.open === undefined ? {} : { open: options.open }),
})

/** The alt text a slide reads: the merchant's, else what and which. */
const altFor = (state: Pick<State, "images" | "title">, index: number) => {
  const image = state.images[index]
  const position = `image ${index + 1} of ${state.images.length}`
  return image?.altText?.trim() || (state.title ? `${state.title}, ${position}` : `Product ${position}`)
}

/**
 * A product's images: a gallery with thumbnails, optional hover zoom, and a
 * lightbox over the page. The shown image's index and whether the lightbox is
 * open are its state; the SDK's carousel does paging, swiping, keys and slide
 * semantics, and its dialog does modality, focus and dismissal.
 *
 * Loading follows intent. The first image is eager and high priority, the rest
 * lazy. A thumbnail that's hovered or focused preloads its slide; a slide that's
 * hovered or focused preloads its lightbox image, and its zoomed pixels when
 * zoom is on; resting on a page preloads its neighbours. None of that runs
 * while the person is saving data.
 */
const shopProductMedia = definePrimitive({
  name: "shop-product-media",
  options: {
    images: "value",
    productTitle: "string",
    value: "number",
    defaultValue: "number",
    onValueChange: "callback",
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChange: "callback",
    hoverZoom: "boolean",
    zoomScale: "number",
    sizes: "string",
  },
  controlled: ["value", "open"],
  state: (options: ShopProductMediaOptions): State => {
    const images = unique(options.images ?? [])
    return {
      images,
      title: options.productTitle ?? "",
      hoverZoom: Boolean(options.hoverZoom),
      zoomScale: Math.max(1.25, Math.min(4, options.zoomScale ?? 2)),
      sizes: options.sizes ?? defaultSizes,
      value: clampIndex(options.value ?? options.defaultValue ?? 0, images.length),
      open: Boolean(options.open ?? options.defaultOpen),
      zooming: null,
    }
  },
  sync: settings,
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const count = () => store.get().images.length

    const setValue = (
      value: number,
      details: { reason?: MediaChangeReason; event?: Event } = {},
    ) => {
      if (!count()) return false
      return change("value", clampIndex(value, count()), {
        reason: details.reason ?? "imperative",
        event: details.event,
      })
    }
    const setOpen = (
      open: boolean,
      details: { reason?: LightboxChangeReason; event?: Event } = {},
    ) => {
      if (open && !count()) return false
      return change("open", open, { reason: details.reason ?? "imperative", event: details.event })
    }
    const preload = (index: number, view: "main" | "lightbox" | "thumbnail", priority: "low" | "high" = "low") => {
      const state = store.get()
      const image = state.images[index]
      if (view === "lightbox") return preloadImage(image, { sizes: lightboxSizes, widths: lightboxWidths, priority })
      if (view === "thumbnail") return preloadImage(image, { sizes: thumbnailSizes, widths: [64, 128, 192] })
      return preloadImage(image, { sizes: state.sizes, priority })
    }

    return {
      getValue: () => store.get().value,
      /** Follows the state, for a parent that composes the gallery. Returns the unsubscribe. */
      subscribe: (listener: () => void) => store.subscribe(listener),
      getImage: () => store.get().images[store.get().value] ?? null,
      isOpen: () => store.get().open,
      /**
       * Replaces the images, like another product's. Starts on `activeUrl`, or
       * stays on the same image when it's still there. No change event: the
       * person didn't choose anything.
       */
      setImages: (images: Image[], title?: string, activeUrl?: string) => {
        const state = store.get()
        const next = unique(images)
        const keep = activeUrl ?? state.images[state.value]?.url
        const found = next.findIndex((image) => image.url === keep)
        store.set({
          images: next,
          title: title ?? state.title,
          value: found >= 0 ? found : 0,
          open: next.length ? state.open : false,
        })
      },
      setValue,
      /** Shows the image with this URL, like a variant's. Returns false when it isn't one. */
      showImage: (url: string, details: { reason?: MediaChangeReason; event?: Event } = {}) => {
        const index = store.get().images.findIndex((image) => image.url === url)
        return index >= 0 && (index === store.get().value || setValue(index, { reason: "variant", ...details }))
      },
      /**
       * Preloads the image with this URL for a view, like a variant's image a
       * person is about to choose. Returns whether it asked.
       */
      preloadUrl: (url: string, view: "main" | "lightbox" = "main") => {
        const index = store.get().images.findIndex((image) => image.url === url)
        return index >= 0 && index !== store.get().value && preload(index, view)
      },
      next: (details: { reason?: MediaChangeReason; event?: Event } = {}) =>
        count() > 1 && setValue((store.get().value + 1) % count(), { reason: "next-press", ...details }),
      previous: (details: { reason?: MediaChangeReason; event?: Event } = {}) =>
        count() > 1 &&
        setValue((store.get().value - 1 + count()) % count(), { reason: "previous-press", ...details }),
      setOpen,
      open: () => setOpen(true),
      close: () => setOpen(false),
      preload,
      internal: {
        altFor: (index: number) => altFor(store.get(), index),
        lightboxSizes,
        lightboxWidths,
        thumbnailSizes,
        /** A slide was hovered or focused: fetch what pressing it will need. */
        intent: (index: number, zoomWidth?: number) => {
          preload(index, "lightbox")
          const state = store.get()
          if (zoomWidth && state.hoverZoom) {
            preloadImage(state.images[index], { sizes: `${Math.round(zoomWidth * state.zoomScale)}px` })
          }
        },
        zoom: (index: number | null) => {
          if (store.get().zooming !== index) store.set({ zooming: index })
        },
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, ShopProductMediaState>({
      state: (state) => ({
        value: state.value,
        count: state.images.length,
        open: state.open,
        position: state.images.length ? `${state.value + 1} of ${state.images.length}` : "",
      }),
      attrs: (state) => ({
        "data-open": state.open ? "" : undefined,
        "data-hover-zoom": state.hoverZoom ? "" : undefined,
        "data-empty": state.images.length ? undefined : "",
        "data-single": state.images.length === 1 ? "" : undefined,
        style: `--shop-media-zoom: ${state.zoomScale}`,
      }),
    }),
    // The frame inside one slide's trigger button: pointer zoom and intent.
    zoom: slot<{ value: number }, { zooming: boolean }>({
      props: { value: "number" },
      state: (state, part) => ({ zooming: state.zooming === part.props.value }),
      attrs: (state, part) => ({
        "data-zooming": state.zooming === part.props.value ? "" : undefined,
        "data-zoomable": state.hoverZoom ? "" : undefined,
      }),
      bind: (el, part) => {
        let rect: DOMRect | null = null
        let frame = 0
        let x = 50
        let y = 50
        const index = () => part.props.value
        const fine = (event: PointerEvent) => event.pointerType === "mouse" || event.pointerType === "pen"
        const write = () => {
          frame = 0
          el.style.setProperty("--shop-media-x", `${x}%`)
          el.style.setProperty("--shop-media-y", `${y}%`)
        }
        const enter = (event: PointerEvent) => {
          // One layout read per hover, never one per move.
          rect = el.getBoundingClientRect()
          part.api.internal.intent(index(), fine(event) ? rect.width : undefined)
          if (fine(event) && part.store.get().hoverZoom) part.api.internal.zoom(index())
        }
        const move = (event: PointerEvent) => {
          if (!rect || !fine(event) || !part.store.get().hoverZoom) return
          x = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100))
          y = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100))
          frame ||= requestAnimationFrame(write)
        }
        const leave = () => {
          rect = null
          part.api.internal.zoom(null)
          el.style.removeProperty("--shop-media-x")
          el.style.removeProperty("--shop-media-y")
        }
        const focus = () => part.api.internal.intent(index())
        el.addEventListener("pointerenter", enter)
        el.addEventListener("pointermove", move)
        el.addEventListener("pointerleave", leave)
        el.addEventListener("focusin", focus)
        return () => {
          cancelAnimationFrame(frame)
          el.removeEventListener("pointerenter", enter)
          el.removeEventListener("pointermove", move)
          el.removeEventListener("pointerleave", leave)
          el.removeEventListener("focusin", focus)
        }
      },
    }),
    // The lightbox's content: left and right page it from anywhere inside,
    // where the carousel's viewport and thumbnails don't already.
    lightbox: slot<{}, ShopProductMediaState>({
      state: (state) => ({
        value: state.value,
        count: state.images.length,
        open: state.open,
        position: state.images.length ? `${state.value + 1} of ${state.images.length}` : "",
      }),
      on: {
        keydown: (event, { el, api }) => {
          const key = event as KeyboardEvent
          if (key.defaultPrevented || key.altKey || key.ctrlKey || key.metaKey || key.shiftKey) return
          if (key.key !== "ArrowLeft" && key.key !== "ArrowRight") return
          const target = key.target as Element | null
          if (target?.closest("ui-carousel-viewport, ui-carousel-indicator-group, input, textarea")) return
          const forward = (key.key === "ArrowRight") !== (el ? isRTL(el) : false)
          key.preventDefault()
          if (forward) api.next({ reason: "list-navigation", event: key })
          else api.previous({ reason: "list-navigation", event: key })
        },
      },
    }),
  }),
  agent: { actions: ["setValue", "next", "previous", "open", "close"] },
})

export {
  lightboxSizes,
  lightboxWidths,
  shopProductMedia,
  thumbnailSizes,
  type LightboxChangeReason,
  type MediaChangeReason,
  type ShopProductMediaOptions,
  type ShopProductMediaState,
}
