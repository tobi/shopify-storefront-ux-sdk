// Registers every element, low-level first, so a parent's render finds its
// children already defined: image and price, then the variant selector and the
// media gallery, then the product and bundle that compose them, then the cart.
import "./image"
import "./price"
import "./variant-selector"
import "./product-media"
import "./product"
import "./cart"
import "./store-picker"
