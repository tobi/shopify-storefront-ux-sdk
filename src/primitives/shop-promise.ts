import { definePrimitive } from "@ui-sdk/core"
import { shopConfig } from "../shop"

type ShopPromiseOptions = {
  /** Whether the selected item is in stock and eligible for Shop Promise. Defaults to true. */
  available?: boolean
  /** Minimum business days until delivery. Defaults to 2. */
  minDays?: number
  /** Maximum business days until delivery. Defaults to 4. */
  maxDays?: number
  /** Local hour (0-23) cutoff for same-day dispatch. Defaults to 14 (2 PM). */
  cutoffHour?: number
  /** Reference timestamp (ms) or Date for deterministic rendering/testing. */
  now?: number
  /** Optional explicit promised arrival date (ISO string), overriding day math. */
  deliveryDate?: string
  /** Optional locale override for date formatting. */
  locale?: string
}

type State = {
  available: boolean
  minDays: number
  maxDays: number
  cutoffHour: number
  now: number | undefined
  deliveryDate: string | undefined
  locale: string | undefined
}

type ShopPromiseState = {
  eligible: boolean
  /** Earliest estimated delivery Date. */
  earliest: Date | null
  /** Latest estimated delivery Date. */
  latest: Date | null
  /** Formatted range, like "Thu, Nov 26" or "Thu, Nov 26 – Mon, Nov 30". */
  dateText: string
  /** Full accessible promise copy, like "Get it by Thu, Nov 26 with Shop Promise". */
  message: string
}

const settings = (options: ShopPromiseOptions): State => ({
  available: options.available ?? true,
  minDays: Math.max(0, Math.round(options.minDays ?? 2)),
  maxDays: Math.max(Math.max(0, Math.round(options.minDays ?? 2)), Math.round(options.maxDays ?? 4)),
  cutoffHour: Math.min(23, Math.max(0, Math.round(options.cutoffHour ?? 14))),
  now: options.now,
  deliveryDate: options.deliveryDate,
  locale: options.locale,
})

function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start.getTime())
  let remaining = days
  while (remaining > 0) {
    result.setDate(result.getDate() + 1)
    const day = result.getDay()
    if (day !== 0 && day !== 6) remaining--
  }
  return result
}

function formatShortDate(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale ?? shopConfig().locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date)
}

function computePromise(state: State): ShopPromiseState {
  if (!state.available) {
    return { eligible: false, earliest: null, latest: null, dateText: "", message: "" }
  }
  if (state.deliveryDate) {
    const target = new Date(state.deliveryDate)
    if (!Number.isNaN(target.getTime())) {
      const dateText = formatShortDate(target, state.locale)
      return {
        eligible: true,
        earliest: target,
        latest: target,
        dateText,
        message: `Get it by ${dateText} with Shop Promise`,
      }
    }
  }
  const base = state.now !== undefined ? new Date(state.now) : new Date()
  const extra = base.getHours() >= state.cutoffHour ? 1 : 0
  const earliest = addBusinessDays(base, state.minDays + extra)
  const latest = addBusinessDays(base, state.maxDays + extra)
  const earliestText = formatShortDate(earliest, state.locale)
  const latestText = formatShortDate(latest, state.locale)
  const sameDay = earliest.toDateString() === latest.toDateString()
  const dateText = sameDay ? earliestText : `${earliestText} – ${latestText}`
  return {
    eligible: true,
    earliest,
    latest,
    dateText,
    message: sameDay
      ? `Get it by ${earliestText} with Shop Promise`
      : `Expected ${dateText} with Shop Promise`,
  }
}

/**
 * Shop Promise delivery badge and estimated arrival window.
 *
 * Computes business-day delivery windows honoring a daily dispatch cutoff,
 * formats dates in the active locale, and hides automatically when the
 * selected variant is sold out.
 */
const shopPromise = definePrimitive({
  name: "shop-promise",
  options: {
    available: "boolean",
    minDays: "number",
    maxDays: "number",
    cutoffHour: "number",
    now: "number",
    deliveryDate: "string",
    locale: "string",
  },
  controlled: [],
  state: settings,
  sync: settings,
  api: ({ store }) => ({
    getEstimate: () => computePromise(store.get()),
    isEligible: () => computePromise(store.get()).eligible,
  }),
  slots: (slot) => ({
    root: slot<{}, ShopPromiseState>({
      state: computePromise,
      attrs: (state) => {
        const current = computePromise(state)
        return {
          hidden: current.eligible ? undefined : "",
          "data-eligible": current.eligible ? "" : undefined,
        }
      },
    }),
  }),
  agent: { actions: [], shown: () => false },
})

export { addBusinessDays, shopPromise, type ShopPromiseOptions, type ShopPromiseState }
