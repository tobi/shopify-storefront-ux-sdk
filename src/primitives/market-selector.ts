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

type MarketChangeReason = "item-press" | "imperative"

type ShopMarketSelectorOptions = {
  /** Storefront API URL. Defaults to the configured shop endpoint. */
  endpoint?: string
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

type State = {
  country: string
  language: string
  countries: MarketCountry[]
  status: MarketStatus
  error: string | null
}

type ShopMarketSelectorState = {
  country: string
  language: string
  currency: string
  symbol: string
  countryName: string
  status: MarketStatus
  countries: MarketCountry[]
  languages: MarketLanguage[]
}

const currentCountryOf = (state: State) =>
  state.countries.find((entry) => entry.isoCode.toUpperCase() === state.country.toUpperCase()) ?? null

const marketState = (state: State): ShopMarketSelectorState => {
  const active = currentCountryOf(state)
  return {
    country: state.country,
    language: state.language,
    currency: active?.currency.isoCode ?? "",
    symbol: active?.currency.symbol ?? "",
    countryName: active?.name ?? state.country,
    status: state.status,
    countries: state.countries,
    languages: active?.availableLanguages ?? [],
  }
}

/**
 * Market / currency / language selector backed by Shopify's `localization` API.
 *
 * Switching country updates `configureShop({ country, language })`, which
 * updates `@inContext` for all subsequent Storefront queries, updates the live
 * cart's `buyerIdentity`, and triggers active catalogs/products to re-fetch in
 * the newly selected currency.
 */
const shopMarketSelector = definePrimitive({
  name: "shop-market-selector",
  options: {
    endpoint: "string",
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
    const countries = options.countries ?? []
    return {
      country: (options.country ?? options.defaultCountry ?? cfg.country).toUpperCase(),
      language: (options.language ?? options.defaultLanguage ?? cfg.language).toUpperCase(),
      countries,
      status: countries.length ? "idle" : "loading",
      error: null,
    }
  },
  sync: (options: ShopMarketSelectorOptions) => ({
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
    queueMicrotask(() => void load())
    context.onDestroy(() => controller?.abort())

    return {
      getMarket: () => marketState(store.get()),
      getCountries: () => store.get().countries,
      setCountry: (isoCode: string, details: { reason?: MarketChangeReason; event?: Event } = {}) => {
        const next = isoCode.trim().toUpperCase()
        if (!next) return false
        const countries = store.get().countries
        const match = countries.find((entry) => entry.isoCode.toUpperCase() === next)
        if (countries.length && !match) return false
        const reason = details.reason ?? (details.event ? "item-press" : "imperative")
        const accepted = change("country", next, { reason, event: details.event })
        if (!accepted) return false
        configureShop({ country: next })
        if (match) announce(`Market set to ${match.name} (${match.currency.isoCode}).`)
        return true
      },
      setLanguage: (isoCode: string, details: { reason?: MarketChangeReason; event?: Event } = {}) => {
        const next = isoCode.trim().toUpperCase()
        if (!next) return false
        const reason = details.reason ?? (details.event ? "item-press" : "imperative")
        const accepted = change("language", next, { reason, event: details.event })
        if (!accepted) return false
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
        "aria-label": "Country and currency",
        "data-country": state.country,
        "data-currency": currentCountryOf(state)?.currency.isoCode,
        "data-status": state.status,
      }),
    }),
  }),
  agent: { actions: ["setCountry", "setLanguage"] },
})

export {
  shopMarketSelector,
  type MarketChangeReason,
  type MarketStatus,
  type ShopMarketSelectorOptions,
  type ShopMarketSelectorState,
}
