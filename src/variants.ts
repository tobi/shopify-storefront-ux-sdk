/**
 * The variant model, with no UI: which variant a set of option values names,
 * which values can still be bought, and what to pick when one option changes.
 * Every variant component reads these; none of them keeps its own copy.
 */
import type { Image } from "./images"

type Money = { amount: string; currencyCode: string }
type SelectedOption = { name: string; value: string }
type Selection = Record<string, string>

type Variant = {
  id: string
  title: string
  availableForSale: boolean
  selectedOptions: SelectedOption[]
  price: Money
  compareAtPrice: Money | null
  image: Image | null
}

type OptionValue = { name: string; swatch: { color: string | null } | null }
type ProductOption = { name: string; values: string[]; optionValues?: OptionValue[] }

/** How a value stands, given the other options chosen. */
type ValueStatus = "available" | "sold-out" | "missing"

/** The options a person chooses between: a lone "Default Title" is no choice. */
const choicesOf = (options: readonly ProductOption[]) =>
  options.filter((option) => !(option.values.length === 1 && option.values[0] === "Default Title"))

const selectionOf = (variant: Variant | null | undefined): Selection => {
  const selection: Selection = {}
  for (const option of variant?.selectedOptions ?? []) selection[option.name] = option.value
  return selection
}

/** Whether a variant agrees with every option a selection names. */
const matches = (variant: Variant, selection: Selection) =>
  variant.selectedOptions.every(
    (option) => !(option.name in selection) || selection[option.name] === option.value,
  )

const findVariant = (variants: readonly Variant[], selection: Selection) =>
  variants.find(
    (variant) =>
      variant.selectedOptions.length === Object.keys(selection).length && matches(variant, selection),
  ) ?? variants.find((variant) => matches(variant, selection))

/** Sold out is still a choice a person can see and pick; missing is no choice. */
function valueStatus(
  variants: readonly Variant[],
  name: string,
  value: string,
  selection: Selection,
): ValueStatus {
  const probe = { ...selection, [name]: value }
  const real = variants.filter((variant) => matches(variant, probe))
  if (!real.length) return "missing"
  return real.some((variant) => variant.availableForSale) ? "available" : "sold-out"
}

/**
 * The variant to show after one option changes: the exact combination when it
 * exists, else the nearest one that keeps the new value, available first. So
 * picking a colour the current size doesn't come in moves the size, rather
 * than refusing the colour.
 */
function nextVariant(
  variants: readonly Variant[],
  current: Variant | null,
  name: string,
  value: string,
) {
  const wanted = { ...selectionOf(current), [name]: value }
  const exact = findVariant(variants, wanted)
  if (exact && matches(exact, wanted)) return exact
  const keeping = variants.filter((variant) => matches(variant, { [name]: value }))
  const score = (variant: Variant) =>
    variant.selectedOptions.filter((option) => wanted[option.name] === option.value).length
  const ranked = [...keeping].sort(
    (a, b) => Number(b.availableForSale) - Number(a.availableForSale) || score(b) - score(a),
  )
  return ranked[0] ?? null
}

const firstAvailable = (variants: readonly Variant[]) =>
  variants.find((variant) => variant.availableForSale) ?? variants[0] ?? null

/** The variant said the way a person says it: "Large, Ocean", not "Large / Ocean". */
const variantName = (variant: Variant | null | undefined) =>
  !variant
    ? ""
    : variant.selectedOptions
        .filter((option) => option.value !== "Default Title")
        .map((option) => option.value)
        .join(", ") || variant.title

const swatchOf = (option: ProductOption, value: string) =>
  option.optionValues?.find((entry) => entry.name === value)?.swatch?.color ?? null

export {
  choicesOf,
  findVariant,
  firstAvailable,
  matches,
  nextVariant,
  selectionOf,
  swatchOf,
  valueStatus,
  variantName,
  type Money,
  type OptionValue,
  type ProductOption,
  type SelectedOption,
  type Selection,
  type ValueStatus,
  type Variant,
}
