import { definePrimitive } from "@ui-sdk/core"
import { money } from "../shop"
import { discountPercent, isOnSale, savingsAmount, type Money } from "../variants"

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
  /** The integer percentage saved while on sale, like 25 for 25% off. */
  discountPercent: number | null
  /** The exact money saved while on sale. */
  savings: Money | null
  /** The formatted amount saved while on sale, like "$10.00". */
  savingsText: string
  onSale: boolean
}

type State = { price: Money | null; compareAtPrice: Money | null }

const settings = (options: ShopPriceOptions): State => ({
  price: options.price ?? null,
  compareAtPrice: options.compareAtPrice ?? null,
})

const onSale = (state: State) => isOnSale(state.price, state.compareAtPrice)

const priceState = (state: State): ShopPriceState => {
  const sale = onSale(state)
  const savings = savingsAmount(state.price, state.compareAtPrice)
  return {
    text: money(state.price),
    compareText: sale ? money(state.compareAtPrice) : "",
    discountPercent: discountPercent(state.price, state.compareAtPrice),
    savings,
    savingsText: savings ? money(savings) : "",
    onSale: sale,
  }
}

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
    getDiscountPercent: () => discountPercent(store.get().price, store.get().compareAtPrice),
    getSavings: () => savingsAmount(store.get().price, store.get().compareAtPrice),
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
    savings: slot<{}, ShopPriceState>({
      state: priceState,
      attrs: (state) => ({ hidden: onSale(state) ? undefined : "" }),
    }),
  }),
  agent: { actions: [], shown: () => false },
})

export { shopPrice, type ShopPriceOptions, type ShopPriceState }
