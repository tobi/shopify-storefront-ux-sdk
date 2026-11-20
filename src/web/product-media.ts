import "@ui-sdk/web/carousel"
import "@ui-sdk/web/dialog"
import { createParts } from "@ui-sdk/web"
import type { Image } from "../images"
import { shopProductMedia, type LightboxChangeReason, type MediaChangeReason } from "../primitives/product-media"
import { cloneEach, replaceGenerated, setText, uid } from "./util"

type Carousel = HTMLElement & { page: number }
type Dialog = HTMLElement & { open: boolean }
type ShopImageElement = HTMLElement & { image: Image | null }
type Detail<T> = CustomEvent<{ value: T; reason?: string; event?: Event }>

/** The parts a render needs, captured before the dialog portals its content away. */
type Captured = {
  main: Carousel | null
  /** Previous and Next, each with the step it takes and the view it pages. */
  steps: { button: HTMLElement; step: 1 | -1; view: "main" | "lightbox" }[]
  mainContent: HTMLElement | null
  mainThumbs: HTMLElement | null
  dialog: Dialog | null
  lightbox: Carousel | null
  lightboxContent: HTMLElement | null
  lightboxThumbs: HTMLElement | null
  count: HTMLElement | null
  caption: HTMLElement | null
  title: HTMLElement | null
  images: Image[] | null
  zoomed: Set<number>
  off: (() => void)[]
}

const captured = new WeakMap<HTMLElement, Captured>()

function capture(el: HTMLElement): Captured {
  const known = captured.get(el)
  if (known) return known
  const main = el.querySelector<Carousel>("ui-carousel[data-media-main]")
  const dialog = el.querySelector<Dialog>("ui-dialog")
  const lightbox = dialog?.querySelector<Carousel>("ui-carousel[data-media-lightbox]") ?? null
  const stepsOf = (carousel: Carousel | null, view: "main" | "lightbox") =>
    (carousel ? [...carousel.querySelectorAll<HTMLElement>("ui-carousel-previous, ui-carousel-next")] : [])
      .filter((part) => part.closest("ui-carousel") === carousel)
      .map((part) => ({
        button: part.querySelector<HTMLElement>("button") ?? part,
        step: (part.localName === "ui-carousel-next" ? 1 : -1) as 1 | -1,
        view,
      }))
  const found: Captured = {
    main,
    steps: [...stepsOf(main, "main"), ...stepsOf(lightbox, "lightbox")],
    mainContent: main?.querySelector("ui-carousel-content") ?? null,
    mainThumbs: main?.querySelector("ui-carousel-indicator-group") ?? null,
    dialog,
    lightbox,
    lightboxContent: lightbox?.querySelector("ui-carousel-content") ?? null,
    lightboxThumbs: lightbox?.querySelector("ui-carousel-indicator-group") ?? null,
    count: dialog?.querySelector("[data-media-count]") ?? null,
    caption: dialog?.querySelector("[data-media-caption]") ?? null,
    title: dialog?.querySelector("ui-dialog-title") ?? null,
    images: null,
    zoomed: new Set(),
    off: [],
  }
  if (dialog && !dialog.id) dialog.id = uid("shop-media-lightbox")
  captured.set(el, found)
  return found
}

function setImage(
  host: Element | null,
  image: Image,
  attrs: Record<string, string | undefined>,
) {
  const el = host?.querySelector<ShopImageElement>("shop-image")
  if (!el) return
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined) el.removeAttribute(name)
    else el.setAttribute(name, value)
  }
  el.image = image
}

const parts = createParts(shopProductMedia, {
  root: {
    tag: "shop-product-media",
    display: "block",
    api: [
      "getValue",
      "getImage",
      "isOpen",
      "setImages",
      "setValue",
      "showImage",
      "next",
      "previous",
      "setOpen",
      "open",
      "close",
      "preload",
      "preloadUrl",
      "subscribe",
    ],
    render(el, instance) {
      const parts = capture(el)
      const api = instance.api
      for (const dispose of parts.off.splice(0)) dispose()
      const listen = (target: EventTarget | null, type: string, listener: (event: Event) => void) => {
        if (!target) return
        target.addEventListener(type, listener)
        parts.off.push(() => target.removeEventListener(type, listener))
      }

      const thumbLabel = (images: Image[], index: number) => {
        const alt = images[index]?.altText?.trim()
        return `Image ${index + 1} of ${images.length}${alt ? `: ${alt}` : ""}`
      }

      // The slides and thumbnails, from the templates in the author's markup.
      function build(images: Image[]) {
        if (parts.images === images) return
        parts.images = images
        parts.zoomed.clear()
        const state = instance.get()
        if (parts.mainContent) {
          replaceGenerated(
            parts.mainContent,
            cloneEach(parts.mainContent, images, (slide, image, index) => {
              const trigger = slide.querySelector<HTMLElement & { payload?: unknown }>("ui-dialog-trigger")
              if (trigger && parts.dialog) {
                trigger.setAttribute("for", parts.dialog.id)
                trigger.payload = index
              }
              slide.querySelector("shop-product-media-zoom")?.setAttribute("value", String(index))
              // The image a page opens on is the LCP candidate: eager, high
              // priority. The rest wait for their slide.
              setImage(slide, image, {
                alt: api.internal.altFor(index),
                sizes: state.sizes,
                loading: index === 0 ? "eager" : "lazy",
                priority: index === 0 ? "high" : "low",
              })
            }),
          )
        }
        for (const [host, view] of [
          [parts.mainThumbs, "main"],
          [parts.lightboxThumbs, "lightbox"],
        ] as const) {
          if (!host) continue
          replaceGenerated(
            host,
            cloneEach(host, images, (indicator, image, index) => {
              indicator.setAttribute("page", String(index + 1))
              const button = indicator.querySelector("button")
              button?.setAttribute("aria-label", thumbLabel(images, index))
              // The button is named; the picture inside it is decoration.
              setImage(indicator, image, {
                alt: "",
                sizes: api.internal.thumbnailSizes,
                widths: "64,128,192",
                loading: "lazy",
              })
              // Intent: a thumbnail under the pointer or focus fetches its slide.
              const intent = () => api.preload(index, view)
              button?.addEventListener("pointerenter", intent)
              button?.addEventListener("focus", intent)
            }),
          )
        }
        if (parts.lightboxContent) {
          replaceGenerated(
            parts.lightboxContent,
            cloneEach(parts.lightboxContent, images, (slide, image, index) => {
              // Lazy inside a closed dialog means not at all until it opens;
              // intent and neighbours are preloaded instead.
              setImage(slide, image, {
                alt: api.internal.altFor(index),
                sizes: api.internal.lightboxSizes,
                widths: api.internal.lightboxWidths.join(","),
                loading: "lazy",
              })
            }),
          )
        }
      }

      const neighbours = (view: "main" | "lightbox") => {
        const { value, images } = instance.get()
        if (images.length < 2) return
        api.preload((value + 1) % images.length, view)
        api.preload((value - 1 + images.length) % images.length, view)
      }

      function paint() {
        const state = instance.get()
        build(state.images)
        const page = state.value + 1
        if (parts.main && parts.main.page !== page) parts.main.page = page
        if (parts.lightbox && parts.lightbox.page !== page) parts.lightbox.page = page
        // Writing `open` fires no event, so the dialog never echoes the change.
        if (parts.dialog && parts.dialog.open !== state.open) parts.dialog.open = state.open
        const image = state.images[state.value]
        setText(parts.title, state.title || "Product images")
        setText(parts.caption, image?.altText?.trim() ?? "")
        setText(parts.count, state.images.length ? `${page} / ${state.images.length}` : "")
        // A zoom asks for the pixels it shows: once a slide has been zoomed,
        // its image keeps the larger candidate rather than swap back.
        if (state.zooming !== null && !parts.zoomed.has(state.zooming)) {
          const slide = parts.mainContent?.querySelectorAll<HTMLElement>(":scope > [data-generated]")[state.zooming]
          const zoom = slide?.querySelector("shop-image")
          const width = slide?.clientWidth ?? 0
          if (zoom && width) {
            parts.zoomed.add(state.zooming)
            zoom.setAttribute("sizes", `${Math.round(width * state.zoomScale)}px`)
          }
        }
      }

      // Intent: Previous or Next under the pointer or focus fetches the image
      // it would show, at the size of the view it pages.
      for (const { button, step, view } of parts.steps) {
        const intend = () => {
          const { value, images } = instance.get()
          if (images.length > 1) api.preload((value + step + images.length) % images.length, view)
        }
        listen(button, "pointerenter", intend)
        listen(button, "focus", intend)
      }

      // The carousels' pages are requests for the gallery's value.
      const follow = (event: Event) => {
        // A closed lightbox measures nothing: its pages aren't requests.
        if (event.currentTarget === parts.lightbox && !instance.get().open) return
        const { value: page, reason, event: cause } = (event as Detail<number>).detail
        const index = page - 1
        if (index === instance.get().value) return
        if (!api.setValue(index, { reason: reason as MediaChangeReason, event: cause })) event.preventDefault()
      }
      listen(parts.main, "pagechange", follow)
      listen(parts.lightbox, "pagechange", follow)
      listen(parts.main, "pagechangecomplete", () => neighbours("main"))
      listen(parts.lightbox, "pagechangecomplete", () => neighbours("lightbox"))

      // The dialog's open state is a request for the gallery's, as a
      // composed popup's is. Which slide opened it arrives as its payload.
      listen(parts.dialog, "payloadchange", (event) => {
        const { value, event: cause } = (event as Detail<unknown>).detail
        const index = Number(value)
        if (Number.isInteger(index)) api.setValue(index, { reason: "item-press", event: cause })
      })
      listen(parts.dialog, "openchange", (event) => {
        const { value, reason, event: cause } = (event as Detail<boolean>).detail
        if (value === instance.get().open) return
        if (!api.setOpen(value, { reason: reason as LightboxChangeReason, event: cause })) event.preventDefault()
      })
      listen(parts.dialog, "openchangecomplete", () => {
        const { open, value } = instance.get()
        if (!open) {
          // Focus goes back to the slide that opened the lightbox. When the
          // person paged on inside it, that slide is out of view and inert:
          // land on the one now showing instead.
          const active = document.activeElement
          const current = parts.mainContent
            ?.querySelectorAll<HTMLElement>(":scope > [data-generated]")
            [value]?.querySelector<HTMLElement>("button")
          const lost = !active || active === document.body || Boolean(active.closest("[inert]"))
          const elsewhere = active && parts.mainContent?.contains(active) && !current?.contains(active)
          if (current && (lost || elsewhere)) current.focus({ preventScroll: true })
          return
        }
        // The lightbox measures its slides once it shows; land on the image.
        if (parts.lightbox && parts.lightbox.page !== value + 1) parts.lightbox.page = value + 1
        neighbours("lightbox")
      })

      paint()
      const unsubscribe = instance.subscribe(paint)
      return () => {
        unsubscribe()
        for (const dispose of parts.off.splice(0)) dispose()
      }
    },
  },
  zoom: { tag: "shop-product-media-zoom", display: "block" },
  lightbox: { tag: "shop-product-media-lightbox", display: "contents" },
})

export { parts as shopProductMediaParts }
