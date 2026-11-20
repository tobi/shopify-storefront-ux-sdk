import {
  Carousel,
  CarouselContent,
  CarouselIndicator,
  CarouselIndicatorGroup,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselViewport,
} from "@ui-sdk/solid/carousel"
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@ui-sdk/solid/dialog"
import { usePart, usePrimitive, type PartProps } from "@ui-sdk/solid/primitive"
import { createEffect, createMemo, For, omit, Show } from "solid-js"
import type { Image } from "../images"
import {
  lightboxSizes,
  lightboxWidths,
  shopProductMedia,
  thumbnailSizes,
  type LightboxChangeReason,
  type MediaChangeReason,
  type ShopProductMediaOptions,
} from "../primitives/product-media"
import { ShopImage, useProduct } from "./product"
import { useInstanceState } from "./use-state"

type MediaState = {
  value: number
  open: boolean
  images: Image[]
  title: string
  hoverZoom: boolean
  zoomScale: number
  sizes: string
  zooming: number | null
}

function ZoomFrame(props: { value: number; class?: string; children?: any }) {
  return usePart(
    shopProductMedia,
    "zoom",
    () => ({ value: props.value }),
    { class: props.class, children: () => props.children } as never,
    "div",
  )
}

function LightboxBody(props: { class?: string; children?: any }) {
  return usePart(
    shopProductMedia,
    "lightbox",
    undefined,
    { class: props.class, children: () => props.children } as never,
    "div",
  )
}

/**
 * Product media gallery with thumbnails, fine-pointer hover zoom, and a modal
 * lightbox built on `shopProductMedia`, `@ui-sdk/solid/carousel`, and
 * `@ui-sdk/solid/dialog`.
 *
 * Inside `<ShopProduct>`, reads the product's images and follows variant
 * image changes automatically.
 */
function ShopProductMedia(
  props: ShopProductMediaOptions & Omit<PartProps<"div">, "children">,
) {
  let productCtx: ReturnType<typeof useProduct> | null = null
  try {
    productCtx = useProduct()
  } catch {
    productCtx = null
  }

  const resolvedImages = createMemo<Image[]>(() => {
    if (props.images) return props.images
    const product = productCtx?.product()
    if (!product) return []
    const variantImages = product.variants.flatMap((entry) => (entry.image ? [entry.image] : []))
    const raw = [...(product.featuredImage ? [product.featuredImage] : []), ...product.images, ...variantImages]
    return [...new Map(raw.map((img) => [img.url, img])).values()]
  })

  const resolvedTitle = () => props.productTitle ?? productCtx?.product()?.title ?? ""

  const handle = usePrimitive(shopProductMedia, () => ({
    images: resolvedImages(),
    productTitle: resolvedTitle(),
    value: props.value,
    defaultValue: props.defaultValue,
    onValueChange: props.onValueChange,
    open: props.open,
    defaultOpen: props.defaultOpen,
    onOpenChange: props.onOpenChange,
    hoverZoom: props.hoverZoom,
    zoomScale: props.zoomScale,
    sizes: props.sizes,
  }))

  const state = useInstanceState(
    handle.instance as never as { get: () => MediaState; subscribe: (l: () => void) => () => void },
  )

  // Follow variant image changes when placed inside <ShopProduct>.
  let lastVariantUrl: string | undefined
  createEffect(
    () => productCtx?.variant()?.image?.url,
    (url) => {
      if (url && url !== lastVariantUrl) {
        handle.api.showImage(url, { reason: "variant" })
      }
      lastVariantUrl = url
    },
  )

  const rest = omit(
    props,
    "images",
    "productTitle",
    "value",
    "defaultValue",
    "onValueChange",
    "open",
    "defaultOpen",
    "onOpenChange",
    "hoverZoom",
    "zoomScale",
    "sizes",
  )

  const preloadNeighbours = (view: "main" | "lightbox") => {
    const current = state()
    if (current.images.length < 2) return
    handle.api.preload((current.value + 1) % current.images.length, view)
    handle.api.preload((current.value - 1 + current.images.length) % current.images.length, view)
  }

  const currentImage = () => state().images[state().value] ?? null
  const page = () => state().value + 1

  return usePart(
    handle,
    "root",
    undefined,
    {
      ...rest,
      children: () => (
        <>
          <Carousel
            class="media-main"
            aria-label="Product images"
            loop
            page={page()}
            onPageChange={(nextPage, details) => {
              const index = nextPage - 1
              if (index === state().value) return
              if (!handle.api.setValue(index, { reason: details.reason as MediaChangeReason, event: details.event })) {
                details.cancel()
              }
            }}
            onPageChangeComplete={() => preloadNeighbours("main")}
          >
            <CarouselViewport class="media-viewport">
              <CarouselContent class="media-track">
                <For each={state().images} keyed={(img) => img.url}>
                  {(img, index) => (
                    <CarouselItem class="media-slide">
                      <button
                        type="button"
                        class="media-open"
                        aria-label={`Enlarge ${handle.api.internal.altFor(index())}`}
                        onClick={(event) => {
                          handle.api.setValue(index(), { reason: "item-press", event })
                          handle.api.setOpen(true, { reason: "trigger-press", event })
                        }}
                      >
                        <ZoomFrame value={index()} class="media-frame">
                          <ShopImage
                            class="media-image"
                            image={img()}
                            alt={handle.api.internal.altFor(index())}
                            sizes={state().sizes}
                            loading={index() === 0 ? "eager" : "lazy"}
                            priority={index() === 0 ? "high" : "low"}
                          />
                        </ZoomFrame>
                        <span class="media-hint" aria-hidden="true">
                          <span class="media-hint-zoom">Hover to zoom · </span>Click to enlarge
                        </span>
                      </button>
                    </CarouselItem>
                  )}
                </For>
              </CarouselContent>
            </CarouselViewport>

            <Show when={state().images.length > 1}>
              <CarouselPrevious
                class="media-step media-previous"
                aria-label="Previous image"
                onPointerEnter={() =>
                  handle.api.preload((state().value - 1 + state().images.length) % state().images.length, "main")
                }
              >
                ‹
              </CarouselPrevious>
              <CarouselNext
                class="media-step media-next"
                aria-label="Next image"
                onPointerEnter={() => handle.api.preload((state().value + 1) % state().images.length, "main")}
              >
                ›
              </CarouselNext>
              <CarouselIndicatorGroup class="thumbs" aria-label="Choose a product image">
                <For each={state().images} keyed={(img) => img.url}>
                  {(img, index) => (
                    <CarouselIndicator
                      class="thumb"
                      page={index() + 1}
                      aria-label={`Image ${index() + 1} of ${state().images.length}`}
                      onPointerEnter={() => handle.api.preload(index(), "main")}
                      onFocus={() => handle.api.preload(index(), "main")}
                    >
                      <ShopImage image={img()} alt="" sizes={thumbnailSizes} widths={[64, 128, 192]} loading="lazy" />
                    </CarouselIndicator>
                  )}
                </For>
              </CarouselIndicatorGroup>
            </Show>
          </Carousel>

          <Dialog
            open={state().open}
            onOpenChange={(nextOpen, details) => {
              if (nextOpen === state().open) return
              if (!handle.api.setOpen(nextOpen, { reason: details.reason as LightboxChangeReason, event: details.event })) {
                details.cancel()
              }
            }}
            onOpenChangeComplete={() => {
              if (state().open) preloadNeighbours("lightbox")
            }}
          >
            <DialogBackdrop class="image-backdrop" />
            <DialogContent class="image-viewer">
              <LightboxBody class="lightbox">
                <header class="image-viewer-head">
                  <DialogTitle>{state().title || "Product images"}</DialogTitle>
                  <DialogClose class="image-control image-close" aria-label="Close image lightbox">×</DialogClose>
                </header>
                <Carousel
                  class="lightbox"
                  aria-label="Enlarged product images"
                  loop
                  page={page()}
                  onPageChange={(nextPage, details) => {
                    if (!state().open) return
                    const index = nextPage - 1
                    if (index === state().value) return
                    if (!handle.api.setValue(index, { reason: details.reason as MediaChangeReason, event: details.event })) {
                      details.cancel()
                    }
                  }}
                  onPageChangeComplete={() => preloadNeighbours("lightbox")}
                >
                  <div class="image-viewer-stage">
                    <CarouselViewport class="lightbox-viewport">
                      <CarouselContent class="lightbox-track">
                        <For each={state().images} keyed={(img) => img.url}>
                          {(img, index) => (
                            <CarouselItem class="lightbox-slide">
                              <ShopImage
                                class="lightbox-image"
                                image={img()}
                                alt={handle.api.internal.altFor(index())}
                                sizes={lightboxSizes}
                                widths={lightboxWidths}
                                loading="lazy"
                              />
                            </CarouselItem>
                          )}
                        </For>
                      </CarouselContent>
                    </CarouselViewport>
                    <Show when={state().images.length > 1}>
                      <CarouselPrevious class="image-control image-previous" aria-label="Previous image">‹</CarouselPrevious>
                      <CarouselNext class="image-control image-next" aria-label="Next image">›</CarouselNext>
                    </Show>
                  </div>
                  <footer class="image-viewer-foot">
                    <div class="image-viewer-meta">
                      <span class="image-caption">{currentImage()?.altText?.trim() ?? ""}</span>
                      <span class="image-counter" aria-hidden="true">
                        {state().images.length ? `${page()} / ${state().images.length}` : ""}
                      </span>
                    </div>
                    <Show when={state().images.length > 1}>
                      <CarouselIndicatorGroup class="image-filmstrip" aria-label="Choose an enlarged image">
                        <For each={state().images} keyed={(img) => img.url}>
                          {(img, index) => (
                            <CarouselIndicator
                              class="image-film-thumb"
                              page={index() + 1}
                              aria-label={`Image ${index() + 1} of ${state().images.length}`}
                            >
                              <ShopImage image={img()} alt="" sizes={thumbnailSizes} widths={[64, 128, 192]} loading="lazy" />
                            </CarouselIndicator>
                          )}
                        </For>
                      </CarouselIndicatorGroup>
                    </Show>
                  </footer>
                </Carousel>
              </LightboxBody>
            </DialogContent>
          </Dialog>
        </>
      ),
    } as never,
    "div",
  )
}

export { ShopProductMedia }
