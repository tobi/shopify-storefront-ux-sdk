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
  sku?: string | null
  availableForSale: boolean
  currentlyNotInStock?: boolean
  quantityAvailable?: number | null
  selectedOptions: SelectedOption[]
  price: Money
  compareAtPrice: Money | null
  unitPrice?: Money | null
  image: Image | null
}

type Swatch = {
  color: string | null
  image?: { previewImage: Image | null } | null
}
type OptionValue = { id?: string; name: string; swatch: Swatch | null }
type ProductOption = { id?: string; name: string; values: string[]; optionValues?: OptionValue[] }

/** How a value stands, given the other options chosen. */
type ValueStatus = "available" | "sold-out" | "missing"

const isDefaultValue = (value: string) => value === "Default Title" || value === "Default"

/** The options a person actually chooses between: single-value or default-only options offer no choice. */
const choicesOf = (options: readonly ProductOption[]) =>
  options.filter((option) => option.values.length > 1)

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

/** The variant said the way a person says it: "Large, Ocean", not "Large / Ocean". Empty for a default-only variant. */
const variantName = (variant: Variant | null | undefined) => {
  if (!variant) return ""
  const parts = variant.selectedOptions
    .filter((option) => !isDefaultValue(option.value))
    .map((option) => option.value)
  if (parts.length) return parts.join(", ")
  return isDefaultValue(variant.title) ? "" : variant.title
}

const swatchOf = (option: ProductOption, value: string) =>
  option.optionValues?.find((entry) => entry.name === value)?.swatch?.color ?? null

const swatchImageOf = (option: ProductOption, value: string) =>
  option.optionValues?.find((entry) => entry.name === value)?.swatch?.image?.previewImage ?? null

/** Whether `compareAtPrice` is strictly higher than `price` in the same currency. */
const isOnSale = (price: Money | null | undefined, compareAtPrice: Money | null | undefined): boolean =>
  Boolean(
    price &&
      compareAtPrice &&
      compareAtPrice.currencyCode === price.currencyCode &&
      Number(compareAtPrice.amount) > Number(price.amount),
  )

/** Integer percentage saved when on sale (e.g. 25 for 25% off), or null. */
const discountPercent = (
  price: Money | null | undefined,
  compareAtPrice: Money | null | undefined,
): number | null => {
  if (!isOnSale(price, compareAtPrice) || !price || !compareAtPrice) return null
  const current = Number(price.amount)
  const original = Number(compareAtPrice.amount)
  if (!Number.isFinite(current) || !Number.isFinite(original) || original <= 0) return null
  const pct = Math.round(((original - current) / original) * 100)
  return pct > 0 ? pct : null
}

/** Exact money saved when on sale, or null. */
const savingsAmount = (
  price: Money | null | undefined,
  compareAtPrice: Money | null | undefined,
): Money | null => {
  if (!isOnSale(price, compareAtPrice) || !price || !compareAtPrice) return null
  const diff = Number(compareAtPrice.amount) - Number(price.amount)
  if (!Number.isFinite(diff) || diff <= 0) return null
  return { amount: diff.toFixed(2), currencyCode: price.currencyCode }
}

/** Extracts the numeric ID from a Shopify GID like `gid://shopify/ProductVariant/12345`. */
const numericGid = (gid: string | null | undefined): string | null => {
  if (!gid) return null
  const match = /\/(\d+)(?:\?.*)?$/.exec(gid)
  if (match) return match[1]
  return /^\d+$/.test(gid) ? gid : null
}

export {
  choicesOf,
  discountPercent,
  findVariant,
  firstAvailable,
  isOnSale,
  matches,
  nextVariant,
  numericGid,
  savingsAmount,
  selectionOf,
  swatchImageOf,
  swatchOf,
  valueStatus,
  variantName,
  type Money,
  type OptionValue,
  type ProductOption,
  type SelectedOption,
  type Selection,
  type Swatch,
  type ValueStatus,
  type Variant,
}
