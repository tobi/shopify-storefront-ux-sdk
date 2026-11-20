import { definePrimitive } from "@ui-sdk/core"
import { money } from "../shop"
import type { Money } from "../variants"

type ShopPriceOptions = {
  /** What it costs now. A property: `{ amount, currencyCode }`. */
  price?: Money | null
  /** What it cost before, shown struck through while it's higher. */
  compareAtPrice?: Money | null
}

type ShopPriceState = {
  /** The formatted price, like "$40.00". Empty while there's none. */
  text: string
  /** The formatted earlier price, while it's higher. */
  compareText: string
  onSale: boolean
}

type State = { price: Money | null; compareAtPrice: Money | null }

const settings = (options: ShopPriceOptions): State => ({
  price: options.price ?? null,
  compareAtPrice: options.compareAtPrice ?? null,
})

const onSale = (state: State) =>
  Boolean(
    state.price &&
      state.compareAtPrice &&
      state.compareAtPrice.currencyCode === state.price.currencyCode &&
      Number(state.compareAtPrice.amount) > Number(state.price.amount),
  )

const priceState = (state: State): ShopPriceState => ({
  text: money(state.price),
  compareText: onSale(state) ? money(state.compareAtPrice) : "",
  onSale: onSale(state),
})

/**
 * A price, formatted for the market by `Intl.NumberFormat`, never by hand.
 * The compare-at part shows only while the earlier price is higher, so a sale
 * reads "Sale price $30, regular price $40" with the labels in your markup.
 *
 * ```html
 * <shop-price>
 *   <span class="visually-hidden">Price</span><shop-price-amount></shop-price-amount>
 *   <shop-price-compare><span class="visually-hidden">Regular price</span><s data-text></s></shop-price-compare>
 * </shop-price>
 * ```
 */
const shopPrice = definePrimitive({
  name: "shop-price",
  options: { price: "value", compareAtPrice: "value" },
  controlled: [],
  state: settings,
  sync: settings,
  api: ({ store }) => ({
    getPrice: () => store.get().price,
    isOnSale: () => onSale(store.get()),
  }),
  slots: (slot) => ({
    root: slot<{}, ShopPriceState>({
      state: priceState,
      attrs: (state) => ({
        "data-on-sale": onSale(state) ? "" : undefined,
        "data-empty": state.price ? undefined : "",
      }),
    }),
    amount: slot<{}, ShopPriceState>({ state: priceState }),
    compare: slot<{}, ShopPriceState>({
      state: priceState,
      attrs: (state) => ({ hidden: onSale(state) ? undefined : "" }),
    }),
  }),
  agent: { actions: [], shown: () => false },
})

export { shopPrice, type ShopPriceOptions, type ShopPriceState }
