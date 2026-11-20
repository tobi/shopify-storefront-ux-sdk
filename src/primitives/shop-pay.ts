import { definePrimitive, dispatch, type ChangeDetails } from "@ui-sdk/core"
import { money, shopConfig, shopPayUrl, type LineInput } from "../shop"
import type { Money } from "../variants"

type ShopPayOptions = {
  /** Direct checkout lines (e.g. the currently selected product variant + quantity). */
  lines?: LineInput[]
  /** Fallback active cart checkout URL when checking out the whole bag with Shop Pay. */
  checkoutUrl?: string | null
  /** Storefront API endpoint used to derive the shop origin for cart permalinks. */
  endpoint?: string
  /** Disables the button (e.g. when the chosen variant is sold out). */
  disabled?: boolean
  /** Price used to compute Shop Pay Installments messaging. */
  price?: Money | null
  /** Number of interest-free installments. Defaults to 4. */
  installments?: number
  /** Minimum eligible price for installments. Defaults to 50. */
  minInstallmentPrice?: number
  /** Maximum eligible price for installments. Defaults to 17500. */
  maxInstallmentPrice?: number
  /** Runs before opening Shop Pay. `details.cancel()` stops navigation. */
  onCheckout?: (url: string, details: ChangeDetails<"press" | "imperative">) => void
}

type State = {
  lines: LineInput[]
  checkoutUrl: string | null
  endpoint: string | undefined
  disabled: boolean
  price: Money | null
  installments: number
  minInstallmentPrice: number
  maxInstallmentPrice: number
}

type ShopPayState = {
  ready: boolean
  href: string
  eligibleForInstallments: boolean
  installments: number
  installmentPrice: Money | null
  installmentText: string
  message: string
}

const settings = (options: ShopPayOptions): State => ({
  lines: options.lines ?? [],
  checkoutUrl: options.checkoutUrl ?? null,
  endpoint: options.endpoint,
  disabled: Boolean(options.disabled),
  price: options.price ?? null,
  installments: Math.max(2, Math.round(options.installments ?? 4)),
  minInstallmentPrice: options.minInstallmentPrice ?? 50,
  maxInstallmentPrice: options.maxInstallmentPrice ?? 17_500,
})

function resolveUrl(state: State): string | null {
  if (state.disabled) return null
  const endpoint = state.endpoint ?? shopConfig().endpoint
  if (state.lines.length) return shopPayUrl(state.lines, endpoint)
  if (state.checkoutUrl) return shopPayUrl({ checkoutUrl: state.checkoutUrl }, endpoint)
  return null
}

function installmentOf(state: State): { eligible: boolean; each: Money | null; text: string; message: string } {
  const price = state.price
  if (!price) return { eligible: false, each: null, text: "", message: "" }
  const amount = Number(price.amount)
  if (
    !Number.isFinite(amount) ||
    amount < state.minInstallmentPrice ||
    amount > state.maxInstallmentPrice
  ) {
    return { eligible: false, each: null, text: "", message: "" }
  }
  const each: Money = {
    amount: (amount / state.installments).toFixed(2),
    currencyCode: price.currencyCode,
  }
  const text = money(each)
  return {
    eligible: true,
    each,
    text,
    message: `Pay in ${state.installments} interest-free installments of ${text} with Shop Pay`,
  }
}

function payState(state: State): ShopPayState {
  const url = resolveUrl(state)
  const inst = installmentOf(state)
  return {
    ready: Boolean(url),
    href: url ?? "#",
    eligibleForInstallments: inst.eligible,
    installments: state.installments,
    installmentPrice: inst.each,
    installmentText: inst.text,
    message: inst.message,
  }
}

/**
 * Shop Pay accelerated checkout + Shop Pay Installments.
 *
 * Works for either a single product buy box (passing `lines: [{ variantId, quantity }]`)
 * or a full cart (passing `checkoutUrl`). The trigger slot is always marked with
 * `data-agent-confirm` so autonomous agents ask a person before opening checkout.
 */
const shopPay = definePrimitive({
  name: "shop-pay",
  options: {
    lines: "value",
    checkoutUrl: "string",
    endpoint: "string",
    disabled: "boolean",
    price: "value",
    installments: "number",
    minInstallmentPrice: "number",
    maxInstallmentPrice: "number",
    onCheckout: "callback",
  },
  controlled: [],
  state: settings,
  sync: settings,
  api: (context) => {
    const { store } = context
    return {
      getUrl: () => resolveUrl(store.get()),
      isReady: () => Boolean(resolveUrl(store.get())),
      getInstallment: () => installmentOf(store.get()),
      checkout: (details: { event?: Event } = {}) => {
        const url = resolveUrl(store.get())
        if (!url) return null
        const reason = details.event ? "press" : "imperative"
        if (dispatch(context, "onCheckout", url, { reason, event: details.event })) return null
        return url
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, ShopPayState>({
      state: payState,
      attrs: (state) => {
        const current = payState(state)
        return {
          "data-ready": current.ready ? "" : undefined,
          "data-installments": current.eligibleForInstallments ? "" : undefined,
        }
      },
    }),
    button: slot<{}, ShopPayState>({
      state: payState,
      attrs: (state) => {
        const current = payState(state)
        return {
          href: current.href,
          "aria-disabled": current.ready ? undefined : "true",
          tabindex: current.ready ? undefined : "-1",
          "data-agent-confirm": "Buy now with Shop Pay",
        }
      },
      on: {
        click: (event, { api }) => {
          const url = api.checkout({ event })
          if (!url) event.preventDefault()
        },
      },
    }),
    installments: slot<{}, ShopPayState>({
      state: payState,
      attrs: (state) => {
        const current = payState(state)
        return {
          hidden: current.eligibleForInstallments ? undefined : "",
        }
      },
    }),
  }),
  agent: { actions: [], shown: () => false },
})

export { shopPay, type ShopPayOptions, type ShopPayState }
