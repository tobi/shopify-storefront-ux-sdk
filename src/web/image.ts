import { createParts, wrappedChild } from "@ui-sdk/web"
import { shopImage } from "../primitives/image"

// <shop-image> binds the <img> inside it, so the image stays a real image:
// alt text, intrinsic size and native lazy loading all stay the browser's.
const parts = createParts(shopImage, {
  root: {
    tag: "shop-image",
    display: "contents",
    target: wrappedChild("img"),
    api: ["getImage", "getStatus", "preload"],
  },
})

export { parts as shopImageParts }
