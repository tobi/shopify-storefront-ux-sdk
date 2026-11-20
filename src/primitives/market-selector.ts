import { createChange, definePrimitive, type ChangeDetails } from "@ui-sdk/core"
import {
  announce,
  configureShop,
  fetchLocalization,
  shopConfig,
  subscribeConfig,
  type MarketCountry,
  type MarketLanguage,
} from "../shop"

type MarketChangeReason = "input" | "item-press" | "imperative"
type MarketSelectorMode = "currency" | "country"

type ShopMarketSelectorOptions = {
  /** Storefront API URL. Defaults to the configured shop endpoint. */
  endpoint?: string
  /**
   * `"currency"` (default) deduplicates markets by currency so single-currency
   * stores only show that currency (e.g. `USD $`), while multi-currency stores
   * show one clean choice per currency. `"country"` lists every shipping country.
   */
  mode?: MarketSelectorMode
  /** Optional localStorage key to persist the shopper's chosen market across reloads. */
  storageKey?: string
  /** Optional explicit list of countries (skips network fetch if provided). */
  countries?: MarketCountry[]
  /** Controlled country ISO code (e.g. "CA", "US", "GB"). */
  country?: string
  defaultCountry?: string
  /** Controlled language ISO code (e.g. "EN", "FR"). */
  language?: string
  defaultLanguage?: string
  onCountryChange?: (country: string, details: ChangeDetails<MarketChangeReason>) => void
  onLanguageChange?: (language: string, details: ChangeDetails<MarketChangeReason>) => void
}

type MarketStatus = "loading" | "idle" | "error"

type MarketChoice = {
  /** Country ISO code sent to `@inContext(country)`. */
  value: string
  /** Display label ("USD $" in currency mode, "Canada (CAD $)" in country mode). */
  label: string
  country: MarketCountry
}

type State = {
  mode: MarketSelectorMode
  country: string
  language: string
  countries: MarketCountry[]
  status: MarketStatus
  error: string | null
}

type ShopMarketSelectorState = {
  mode: MarketSelectorMode
  country: string
  language: string
  currency: string
  symbol: string
  countryName: string
  hasMultipleCurrencies: boolean
  status: MarketStatus
  countries: MarketCountry[]
  /** Deduplicated currency choices (in `currency` mode) or full country list (in `country` mode). */
  choices: MarketChoice[]
  /** The `value` matching the active option in `choices`. */
  selectedValue: string
  languages: MarketLanguage[]
}

/** Preferred representative country when deduplicating by currency. */
const canonicalCountry: Record<string, string> = {
  USD: "US",
  CAD: "CA",
  GBP: "GB",
  EUR: "DE",
  AUD: "AU",
  NZD: "NZ",
  JPY: "JP",
  CHF: "CH",
  SEK: "SE",
  NOK: "NO",
  DKK: "DK",
  MXN: "MX",
  BRL: "BR",
  INR: "IN",
  SGD: "SG",
  HKD: "HK",
  KRW: "KR",
}

const currentCountryOf = (state: State) =>
  state.countries.find((entry) => entry.isoCode.toUpperCase() === state.country.toUpperCase()) ?? null

const hasMultipleCurrenciesOf = (countries: readonly MarketCountry[]) =>
  new Set(countries.map((c) => c.currency.isoCode)).size > 1

function choicesOfMarket(state: State): MarketChoice[] {
  if (state.mode === "country") {
    return state.countries.map((country) => ({
      value: country.isoCode,
      label: `${country.name} (${country.currency.isoCode} ${country.currency.symbol})`,
      country,
    }))
  }
  const byCurrency = new Map<string, MarketCountry>()
  const activeIso = state.country.toUpperCase()
  for (const country of state.countries) {
    const code = country.currency.isoCode
    const existing = byCurrency.get(code)
    if (!existing) {
      byCurrency.set(code, country)
      continue
    }
    const iso = country.isoCode.toUpperCase()
    if (iso === activeIso) {
      byCurrency.set(code, country)
    } else if (existing.isoCode.toUpperCase() !== activeIso && canonicalCountry[code] === iso) {
      byCurrency.set(code, country)
    }
  }
  return [...byCurrency.values()].map((country) => ({
    value: country.isoCode,
    label: `${country.currency.isoCode} ${country.currency.symbol}`.trim(),
    country,
  }))
}

const marketState = (state: State): ShopMarketSelectorState => {
  const active = currentCountryOf(state)
  const choices = choicesOfMarket(state)
  const selected =
    choices.find((c) => c.value.toUpperCase() === state.country.toUpperCase()) ??
    choices.find((c) => active && c.country.currency.isoCode === active.currency.isoCode) ??
    choices[0]
  return {
    mode: state.mode,
    country: state.country,
    language: state.language,
    currency: active?.currency.isoCode ?? "",
    symbol: active?.currency.symbol ?? "",
    countryName: active?.name ?? state.country,
    hasMultipleCurrencies: hasMultipleCurrenciesOf(state.countries),
    status: state.status,
    countries: state.countries,
    choices,
    selectedValue: selected?.value ?? state.country,
    languages: active?.availableLanguages ?? [],
  }
}

function readStoredMarket(storageKey?: string): { country?: string; language?: string } | null {
  if (!storageKey) return null
  try {
    const raw = globalThis.localStorage?.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === "object" ? (parsed as { country?: string; language?: string }) : null
  } catch {
    return null
  }
}

function writeStoredMarket(storageKey: string | undefined, value: { country: string; language: string }) {
  if (!storageKey) return
  try {
    globalThis.localStorage?.setItem(storageKey, JSON.stringify(value))
  } catch {
    // private browsing
  }
}

/**
 * Market / currency / language selector backed by Shopify's `localization` API.
 *
 * Defaults to `mode: "currency"`, deduplicating countries by currency so a
 * single-currency store cleanly shows only that currency (e.g. `USD $`) instead
 * of hundreds of identical-currency countries. Pass `mode: "country"` for a full
 * shipping-country picker.
 */
const shopMarketSelector = definePrimitive({
  name: "shop-market-selector",
  options: {
    endpoint: "string",
    mode: "string",
    storageKey: "string",
    countries: "value",
    country: "string",
    defaultCountry: "string",
    language: "string",
    defaultLanguage: "string",
    onCountryChange: "callback",
    onLanguageChange: "callback",
  },
  controlled: ["country", "language"],
  state: (options: ShopMarketSelectorOptions): State => {
    const cfg = shopConfig()
    const saved = options.country === undefined ? readStoredMarket(options.storageKey) : null
    const countries = options.countries ?? []
    const country = (options.country ?? saved?.country ?? options.defaultCountry ?? cfg.country).toUpperCase()
    const language = (options.language ?? saved?.language ?? options.defaultLanguage ?? cfg.language).toUpperCase()
    return {
      mode: options.mode === "country" ? "country" : "currency",
      country,
      language,
      countries,
      status: countries.length ? "idle" : "loading",
      error: null,
    }
  },
  sync: (options: ShopMarketSelectorOptions) => ({
    ...(options.mode === undefined ? {} : { mode: options.mode === "country" ? ("country" as const) : ("currency" as const) }),
    ...(options.countries ? { countries: options.countries, status: "idle" as const } : {}),
    ...(options.country === undefined ? {} : { country: options.country.toUpperCase() }),
    ...(options.language === undefined ? {} : { language: options.language.toUpperCase() }),
  }),
  api: (context) => {
    const { store, options } = context
    const change = createChange(context)
    let controller: AbortController | null = null
    let loadedEndpoint = ""

    const load = async () => {
      if (options().countries?.length) return
      const endpoint = options().endpoint ?? shopConfig().endpoint
      if (!endpoint || endpoint === loadedEndpoint) return
      loadedEndpoint = endpoint
      controller?.abort()
      const mine = (controller = new AbortController())
      store.set({ status: "loading", error: null })
      try {
        const loc = await fetchLocalization(endpoint, mine.signal)
        if (mine.signal.aborted) return
        const countries = loc.availableCountries.length ? loc.availableCountries : [loc.country]
        store.set({ countries, status: "idle" })
      } catch (error) {
        if (mine.signal.aborted) return
        store.set({ status: "error", error: (error as Error).message })
      }
    }

    context.onDestroy(
      subscribeConfig((cfg) => {
        const state = store.get()
        const nextCountry = cfg.country.toUpperCase()
        const nextLanguage = cfg.language.toUpperCase()
        if (options().country === undefined && nextCountry !== state.country) {
          store.set({ country: nextCountry })
        }
        if (options().language === undefined && nextLanguage !== state.language) {
          store.set({ language: nextLanguage })
        }
        void load()
      }),
    )
    context.onOptions(() => void load())
    queueMicrotask(() => {
      const saved = options().country === undefined ? readStoredMarket(options().storageKey) : null
      if (saved?.country) {
        const nextCountry = saved.country.toUpperCase()
        const nextLanguage = (saved.language ?? store.get().language).toUpperCase()
        store.set({ country: nextCountry, language: nextLanguage })
        if (nextCountry !== shopConfig().country.toUpperCase()) {
          configureShop({ country: nextCountry, language: nextLanguage })
        }
      }
      void load()
    })
    context.onDestroy(() => controller?.abort())

    return {
      getMarket: () => marketState(store.get()),
      getCountries: () => store.get().countries,
      getChoices: () => choicesOfMarket(store.get()),
      setCountry: (isoCode: string, details: { reason?: MarketChangeReason; event?: Event } = {}) => {
        const next = isoCode.trim().toUpperCase()
        if (!next) return false
        const countries = store.get().countries
        const match = countries.find((entry) => entry.isoCode.toUpperCase() === next)
        if (countries.length && !match) return false
        const reason = details.reason ?? (details.event ? "input" : "imperative")
        const accepted = change("country", next, { reason, event: details.event })
        if (!accepted) return false
        writeStoredMarket(options().storageKey, { country: next, language: store.get().language })
        configureShop({ country: next })
        if (match) announce(`Market set to ${match.name} (${match.currency.isoCode}).`)
        return true
      },
      setLanguage: (isoCode: string, details: { reason?: MarketChangeReason; event?: Event } = {}) => {
        const next = isoCode.trim().toUpperCase()
        if (!next) return false
        const reason = details.reason ?? (details.event ? "input" : "imperative")
        const accepted = change("language", next, { reason, event: details.event })
        if (!accepted) return false
        writeStoredMarket(options().storageKey, { country: store.get().country, language: next })
        configureShop({ language: next })
        return true
      },
      refresh: () => {
        loadedEndpoint = ""
        return load()
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, ShopMarketSelectorState>({
      role: "group",
      state: marketState,
      attrs: (state) => ({
        "aria-label": state.mode === "country" ? "Country and currency" : "Currency",
        "data-mode": state.mode,
        "data-country": state.country,
        "data-currency": currentCountryOf(state)?.currency.isoCode,
        "data-multi-currency": hasMultipleCurrenciesOf(state.countries) ? "" : undefined,
        "data-status": state.status,
      }),
    }),
  }),
  agent: { actions: ["setCountry", "setLanguage"] },
})

export {
  shopMarketSelector,
  type MarketChangeReason,
  type MarketChoice,
  type MarketSelectorMode,
  type MarketStatus,
  type ShopMarketSelectorOptions,
  type ShopMarketSelectorState,
}
