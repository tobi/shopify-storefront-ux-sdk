import {
  Carousel,
  CarouselContent,
  CarouselIndicator,
  CarouselIndicatorGroup,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselViewport,
} from "@ui-sdk/react/carousel"
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@ui-sdk/react/dialog"
import { usePart, usePrimitive, type PartProps } from "@ui-sdk/react/primitive"
import * as React from "react"
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

function ZoomFrame({ value, className, children }: { value: number; className?: string; children?: React.ReactNode }) {
  return usePart(shopProductMedia, "zoom", { value }, { className, children } as never, "div")
}

function LightboxBody({ className, children }: { className?: string; children?: React.ReactNode }) {
  return usePart(shopProductMedia, "lightbox", {}, { className, children } as never, "div")
}

/**
 * Product media gallery with thumbnails, fine-pointer hover zoom, and a modal
 * lightbox built on `shopProductMedia`, `@ui-sdk/react/carousel`, and
 * `@ui-sdk/react/dialog`.
 *
 * Inside `<ShopProduct>`, reads the product's images and follows variant
 * image changes automatically.
 */
function ShopProductMedia({
  images,
  productTitle,
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen,
  onOpenChange,
  hoverZoom,
  zoomScale,
  sizes,
  ...rest
}: ShopProductMediaOptions & Omit<PartProps<"div">, "children">) {
  let productCtx: ReturnType<typeof useProduct> | null = null
  try {
    productCtx = useProduct()
  } catch {
    productCtx = null
  }

  const resolvedImages = React.useMemo<Image[]>(() => {
    if (images) return images
    const product = productCtx?.product
    if (!product) return []
    const variantImages = product.variants.flatMap((entry) => (entry.image ? [entry.image] : []))
    const raw = [...(product.featuredImage ? [product.featuredImage] : []), ...product.images, ...variantImages]
    return [...new Map(raw.map((img) => [img.url, img])).values()]
  }, [images, productCtx?.product])

  const resolvedTitle = productTitle ?? productCtx?.product?.title ?? ""

  const handle = usePrimitive(shopProductMedia, {
    images: resolvedImages,
    productTitle: resolvedTitle,
    value,
    defaultValue,
    onValueChange,
    open,
    defaultOpen,
    onOpenChange,
    hoverZoom,
    zoomScale,
    sizes,
  })

  const state = useInstanceState(
    handle.instance as never as { get: () => MediaState; subscribe: (l: () => void) => () => void },
  )

  const lastVariantUrl = React.useRef<string | undefined>(undefined)
  const variantUrl = productCtx?.variant?.image?.url
  React.useEffect(() => {
    if (variantUrl && variantUrl !== lastVariantUrl.current) {
      handle.api.showImage(variantUrl, { reason: "variant" })
    }
    lastVariantUrl.current = variantUrl
  }, [variantUrl, handle])

  const preloadNeighbours = (view: "main" | "lightbox") => {
    if (state.images.length < 2) return
    handle.api.preload((state.value + 1) % state.images.length, view)
    handle.api.preload((state.value - 1 + state.images.length) % state.images.length, view)
  }

  const currentImage = state.images[state.value] ?? null
  const page = state.value + 1

  return usePart(
    handle,
    "root",
    {},
    {
      ...rest,
      children: (
        <>
          <Carousel
            className="media-main"
            aria-label="Product images"
            loop
            page={page}
            onPageChange={(nextPage, details) => {
              const index = nextPage - 1
              if (index === state.value) return
              if (!handle.api.setValue(index, { reason: details.reason as MediaChangeReason, event: details.event })) {
                details.cancel()
              }
            }}
            onPageChangeComplete={() => preloadNeighbours("main")}
          >
            <CarouselViewport className="media-viewport">
              <CarouselContent className="media-track">
                {state.images.map((img, index) => (
                  <CarouselItem key={img.url} className="media-slide">
                    <button
                      type="button"
                      className="media-open"
                      onClick={(event) => {
                        handle.api.setValue(index, { reason: "item-press", event: event.nativeEvent })
                        handle.api.setOpen(true, { reason: "trigger-press", event: event.nativeEvent })
                      }}
                    >
                      <ZoomFrame value={index} className="media-frame">
                        <ShopImage
                          className="media-image"
                          image={img}
                          alt={handle.api.internal.altFor(index)}
                          sizes={state.sizes}
                          loading={index === 0 ? "eager" : "lazy"}
                          priority={index === 0 ? "high" : "low"}
                        />
                      </ZoomFrame>
                      <span className="media-hint" aria-hidden="true">
                        <span className="media-hint-zoom">Hover to zoom · </span>Click to enlarge
                      </span>
                    </button>
                  </CarouselItem>
                ))}
              </CarouselContent>
            </CarouselViewport>

            {state.images.length > 1 && (
              <>
                <CarouselPrevious
                  className="media-step media-previous"
                  aria-label="Previous image"
                  onPointerEnter={() =>
                    handle.api.preload((state.value - 1 + state.images.length) % state.images.length, "main")
                  }
                >
                  ‹
                </CarouselPrevious>
                <CarouselNext
                  className="media-step media-next"
                  aria-label="Next image"
                  onPointerEnter={() => handle.api.preload((state.value + 1) % state.images.length, "main")}
                >
                  ›
                </CarouselNext>
                <CarouselIndicatorGroup className="thumbs" aria-label="Choose a product image">
                  {state.images.map((img, index) => (
                    <CarouselIndicator
                      key={img.url}
                      className="thumb"
                      page={index + 1}
                      aria-label={`Image ${index + 1} of ${state.images.length}`}
                      onPointerEnter={() => handle.api.preload(index, "main")}
                      onFocus={() => handle.api.preload(index, "main")}
                    >
                      <ShopImage image={img} alt="" sizes={thumbnailSizes} widths={[64, 128, 192]} loading="lazy" />
                    </CarouselIndicator>
                  ))}
                </CarouselIndicatorGroup>
              </>
            )}
          </Carousel>

          <Dialog
            open={state.open}
            onOpenChange={(nextOpen, details) => {
              if (nextOpen === state.open) return
              if (!handle.api.setOpen(nextOpen, { reason: details.reason as LightboxChangeReason, event: details.event })) {
                details.cancel()
              }
            }}
            onOpenChangeComplete={() => {
              if (state.open) preloadNeighbours("lightbox")
            }}
          >
            <DialogBackdrop className="image-backdrop" />
            <DialogContent className="image-viewer">
              <LightboxBody className="lightbox">
                <header className="image-viewer-head">
                  <DialogTitle>{state.title || "Product images"}</DialogTitle>
                  <DialogClose className="image-control image-close" aria-label="Close image lightbox">×</DialogClose>
                </header>
                <Carousel
                  className="lightbox"
                  aria-label="Enlarged product images"
                  loop
                  page={page}
                  onPageChange={(nextPage, details) => {
                    if (!state.open) return
                    const index = nextPage - 1
                    if (index === state.value) return
                    if (!handle.api.setValue(index, { reason: details.reason as MediaChangeReason, event: details.event })) {
                      details.cancel()
                    }
                  }}
                  onPageChangeComplete={() => preloadNeighbours("lightbox")}
                >
                  <div className="image-viewer-stage">
                    <CarouselViewport className="lightbox-viewport">
                      <CarouselContent className="lightbox-track">
                        {state.images.map((img, index) => (
                          <CarouselItem key={img.url} className="lightbox-slide">
                            <ShopImage
                              className="lightbox-image"
                              image={img}
                              alt={handle.api.internal.altFor(index)}
                              sizes={lightboxSizes}
                              widths={lightboxWidths}
                              loading="lazy"
                            />
                          </CarouselItem>
                        ))}
                      </CarouselContent>
                    </CarouselViewport>
                    {state.images.length > 1 && (
                      <>
                        <CarouselPrevious className="image-control image-previous" aria-label="Previous image">‹</CarouselPrevious>
                        <CarouselNext className="image-control image-next" aria-label="Next image">›</CarouselNext>
                      </>
                    )}
                  </div>
                  <footer className="image-viewer-foot">
                    <div className="image-viewer-meta">
                      <span className="image-caption">{currentImage?.altText?.trim() ?? ""}</span>
                      <span className="image-counter" aria-hidden="true">
                        {state.images.length ? `${page} / ${state.images.length}` : ""}
                      </span>
                    </div>
                    {state.images.length > 1 && (
                      <CarouselIndicatorGroup className="image-filmstrip" aria-label="Choose an enlarged image">
                        {state.images.map((img, index) => (
                          <CarouselIndicator
                            key={img.url}
                            className="image-film-thumb"
                            page={index + 1}
                            aria-label={`Image ${index + 1} of ${state.images.length}`}
                          >
                            <ShopImage image={img} alt="" sizes={thumbnailSizes} widths={[64, 128, 192]} loading="lazy" />
                          </CarouselIndicator>
                        ))}
                      </CarouselIndicatorGroup>
                    )}
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
