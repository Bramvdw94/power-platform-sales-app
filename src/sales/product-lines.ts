import type { FieldErrors } from "./errors"
import type { Product, ProductLine, ProductLineInput } from "./types"

/**
 * Quantity x unit price x (1 - discount %), rounded to cents (half away from zero).
 * Works on whole hundredths, so no floating-point drift decides a rounding.
 * The C# rule in plugins/SalesApp.Plugins/ProductLineRules.cs does the same sum.
 */
export function lineAmount(quantity: number, unitPrice: number, discountPercent: number): number {
  const q = BigInt(Math.round(quantity * 100))
  const p = BigInt(Math.round(unitPrice * 100))
  const d = BigInt(Math.round(discountPercent * 100))
  // euros x 10^8, so cents x 10^6; half a cent is 5 x 10^5
  const cents = (q * p * (10000n - d) + 500_000n) / 1_000_000n
  return Number(cents) / 100
}

/** The Estimated value of an Opportunity with lines: each line rounded to cents, then summed. */
export function productLinesTotal(lines: readonly Pick<ProductLine, "lineAmount">[]): number {
  return Math.round(lines.reduce((sum, line) => sum + Math.round(line.lineAmount * 100), 0)) / 100
}

function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6
}

/** What a new line starts from: the Product's description and List price. */
export function newProductLineDefaults(product: Pick<Product, "description" | "listPrice">) {
  return { description: product.description, quantity: 1, unitPrice: product.listPrice, discountPercent: 0 }
}

/** Field errors for a line's editable values, keyed by field name; empty means it may be saved. */
export function productLineErrors(line: Partial<Pick<ProductLineInput, "quantity" | "unitPrice" | "discountPercent">>): FieldErrors {
  const errors: FieldErrors = {}
  const { quantity, unitPrice, discountPercent } = line
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
    errors.quantity = "Quantity must be above 0."
  } else if (!hasAtMostTwoDecimals(quantity) || Math.round(quantity * 100) < 1) {
    errors.quantity = "Quantity has at most 2 decimals."
  }
  if (typeof unitPrice !== "number" || !Number.isFinite(unitPrice) || unitPrice < 0) {
    errors.unitPrice = "Unit price is required (0 or more)."
  } else if (!hasAtMostTwoDecimals(unitPrice)) {
    errors.unitPrice = "Unit price has at most 2 decimals."
  }
  if (discountPercent !== undefined) {
    if (typeof discountPercent !== "number" || !Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      errors.discountPercent = "Discount is a percentage from 0 to 100."
    } else if (!hasAtMostTwoDecimals(discountPercent)) {
      errors.discountPercent = "Discount has at most 2 decimals."
    }
  }
  return errors
}
