import { createChange, definePrimitive, dispatch, type ChangeDetails } from "@ui-sdk/core"
import {
  choicesOf,
  findVariant,
  firstAvailable,
  nextVariant,
  selectionOf,
  valueStatus,
  variantName,
  type ProductOption,
  type Variant,
} from "../variants"

/**
 * Why the variant changed: an option value was pressed or reached with the
 * arrow keys, or an `api` call, a property or a controller changed it.
 */
type VariantChangeReason = "item-press" | "list-navigation" | "imperative"

/** Why a value is about to be chosen: the pointer is over it, or focus is on it. */
type VariantIntentReason = "pointer" | "focus"

type ShopVariantSelectorOptions = {
  /** The product's variants. A property. */
  variants?: Variant[]
  /** The product's options, with their values and swatches. A property. */
  productOptions?: ProductOption[]
  /** The chosen variant's id. Pass it to control the choice. */
  value?: string
  /** The variant chosen first, when uncontrolled. Else the first one for sale. */
  defaultValue?: string
  /** Runs when the variant wants to change; `details.option` names the option pressed. */
  onValueChange?: (value: string, details: ChangeDetails<VariantChangeReason>) => void
  /**
   * Runs when a value under the pointer or focus would choose another variant,
   * before it's chosen: the moment to fetch what that variant shows, like its
   * image. Not state, and nothing changes; `details.option` and
   * `details.optionValue` say which value.
   */
  onValueIntent?: (value: string, details: ChangeDetails<VariantIntentReason>) => void
}

type State = {
  value: string | null
  variants: Variant[]
  productOptions: ProductOption[]
}

type ShopVariantSelectorState = {
  value: string | null
  available: boolean
  name: string
}

type ShopVariantOptionState = {
  /** The option's chosen value, like "Medium". */
  value: string
  /** Each value's standing, given the other options chosen. */
  values: { value: string; status: "available" | "sold-out" | "missing" }[]
}

const settings = (options: ShopVariantSelectorOptions) => ({
  variants: options.variants ?? [],
  productOptions: choicesOf(options.productOptions ?? []),
  ...(options.value === undefined ? {} : { value: options.value }),
})

const variantOf = (state: State) =>
  state.variants.find((variant) => variant.id === state.value) ?? null

/**
 * Chooses one variant of a product, one option at a time. The variant id is
 * the only state; each option's value is read from it, so price, media and
 * the add button can't disagree with what's chosen.
 *
 * Each `<shop-variant-option name="Size">` wraps any single-choice control
 * from the SDK: a radio group or a segmented control. The control
 * keeps its own keyboard, focus and ARIA; the option tells it which values
 * exist, which are sold out, and which one is chosen.
 *
 * ```html
 * <shop-variant-selector aria-label="Options">
 *   <shop-variant-option name="Size">
 *     <ui-radio-group aria-label="Size">…</ui-radio-group>
 *   </shop-variant-option>
 * </shop-variant-selector>
 * ```
 */
const shopVariantSelector = definePrimitive({
  name: "shop-variant-selector",
  options: {
    variants: "value",
    productOptions: "value",
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
    onValueIntent: "callback",
  },
  controlled: ["value"],
  state: (options: ShopVariantSelectorOptions): State => {
    const base = { ...settings(options), value: null as string | null }
    const value =
      options.value ?? options.defaultValue ?? firstAvailable(base.variants)?.id ?? null
    return { ...base, value }
  },
  sync: settings,
  api: (context) => {
    const { store, options } = context
    const change = createChange(context)

    // New variants, like another product, start the choice again without a
    // change event, as `default-value` does: nothing was chosen yet.
    context.onOptions((next) => {
      const state = store.get()
      if (next.value !== undefined || variantOf(state)) return
      const start =
        state.variants.find((variant) => variant.id === next.defaultValue) ??
        firstAvailable(state.variants)
      if ((start?.id ?? null) !== state.value) store.set({ value: start?.id ?? null })
    })

    const getVariant = () => variantOf(store.get())

    return {
      getValue: () => store.get().value,
      getVariant,
      /** Follows the chosen variant, for a parent that composes the selector. Returns the unsubscribe. */
      subscribe: (listener: (variant: Variant | null) => void) => {
        let last = getVariant()
        return store.subscribe(() => {
          const next = getVariant()
          if (next === last) return
          last = next
          listener(next)
        })
      },
      getSelection: () => selectionOf(getVariant()),
      /** Chooses a variant by id. Returns false when it's unknown or the change is canceled. */
      setValue: (
        variantId: string,
        details: { reason?: VariantChangeReason; event?: Event } = {},
      ) => {
        if (!store.get().variants.some((variant) => variant.id === variantId)) return false
        return change("value", variantId, {
          reason: details.reason ?? "imperative",
          event: details.event,
        })
      },
      /**
       * Chooses one option's value, like `setOption("Size", "Medium")`. When
       * that exact combination doesn't exist, the nearest variant that keeps
       * the new value is chosen, so the choice is never refused.
       */
      setOption: (
        name: string,
        value: string,
        details: { reason?: VariantChangeReason; event?: Event } = {},
      ) => {
        const state = store.get()
        const target = nextVariant(state.variants, variantOf(state), name, value)
        if (!target) return false
        return change("value", target.id, {
          reason: details.reason ?? "imperative",
          event: details.event,
          option: name,
        })
      },
      /** The variant choosing this value would pick, without choosing it. */
      preview: (name: string, value: string) => {
        const state = store.get()
        return nextVariant(state.variants, variantOf(state), name, value)
      },
      /**
       * Says a value is about to be chosen. Fires `onValueIntent` with the
       * variant it would pick, when that's another variant. Returns it.
       */
      intend: (
        name: string,
        value: string,
        details: { reason?: VariantIntentReason; event?: Event } = {},
      ) => {
        const state = store.get()
        const target = nextVariant(state.variants, variantOf(state), name, value)
        if (!target || target.id === state.value) return null
        dispatch(context, "onValueIntent", target.id, {
          reason: details.reason ?? "pointer",
          event: details.event,
          option: name,
          optionValue: value,
        })
        return target
      },
      /** `available`, `sold-out` (still choosable, so it can say so) or `missing`. */
      valueStatus: (name: string, value: string) => {
        const state = store.get()
        const selection = selectionOf(variantOf(state))
        return valueStatus(state.variants, name, value, selection)
      },
      findVariant: (selection: Record<string, string>) =>
        findVariant(store.get().variants, selection) ?? null,
      internal: { controlled: () => options().value !== undefined },
    }
  },
  slots: (slot) => ({
    root: slot<{}, ShopVariantSelectorState>({
      role: "group",
      state: (state) => {
        const variant = variantOf(state)
        return {
          value: state.value,
          available: Boolean(variant?.availableForSale),
          name: variantName(variant),
        }
      },
      attrs: (state) => {
        const variant = variantOf(state)
        return {
          "data-sold-out": variant && !variant.availableForSale ? "" : undefined,
          "data-empty": state.productOptions.length ? undefined : "",
        }
      },
    }),
    option: slot<{ name: string }, ShopVariantOptionState>({
      props: { name: "string" },
      state: (state, part) => {
        const option = state.productOptions.find((entry) => entry.name === part.props.name)
        const selection = selectionOf(variantOf(state))
        return {
          value: selection[part.props.name] ?? "",
          values: (option?.values ?? []).map((value) => ({
            value,
            status: valueStatus(state.variants, part.props.name, value, selection),
          })),
        }
      },
      attrs: (state, part) => ({
        "data-option": part.props.name,
        hidden: state.productOptions.some((entry) => entry.name === part.props.name)
          ? undefined
          : "",
      }),
    }),
  }),
  agent: { actions: ["setValue", "setOption"] },
})

export {
  shopVariantSelector,
  type ShopVariantOptionState,
  type ShopVariantSelectorOptions,
  type ShopVariantSelectorState,
  type VariantChangeReason,
  type VariantIntentReason,
}
