import { describe, expect, it } from "vitest"
import { lineAmount, newProductLineDefaults, productLineErrors, productLinesTotal } from "./product-lines"

// The same rows as plugins/SalesApp.Plugins.Tests/ProductLineRulesTests.cs.
const amounts: Array<[number, number, number, number]> = [
  [1, 100, 0, 100],
  [2, 110, 0, 220],
  [1.5, 1450, 0, 2175],
  [3, 99.99, 10, 269.97],
  [1, 0.05, 50, 0.03],
  [1, 0.15, 50, 0.08],
  [3, 33.33, 0, 99.99],
  [1, 100, 100, 0],
  [0.01, 1, 0, 0.01],
  [7, 12.34, 12.5, 75.58],
  [1.5, 33.33, 0, 50],
  [0.5, 0.01, 0, 0.01],
]

describe("lineAmount", () => {
  it.each(amounts)("%s x %s less %s% is %s", (quantity, price, discount, expected) => {
    expect(lineAmount(quantity, price, discount)).toBe(expected)
  })
})

describe("productLinesTotal", () => {
  it("sums the rounded lines, not the rounded sum", () => {
    const lines = [0.15, 0.15, 0.15].map((price) => ({ lineAmount: lineAmount(1, price, 50) }))
    expect(productLinesTotal(lines)).toBe(0.24)
  })

  it("is 0 without lines", () => {
    expect(productLinesTotal([])).toBe(0)
  })

  it("does not drift on many cents", () => {
    expect(productLinesTotal(Array.from({ length: 10 }, () => ({ lineAmount: 0.1 })))).toBe(1)
  })
})

describe("productLineErrors", () => {
  it("accepts good values", () => {
    expect(productLineErrors({ quantity: 1.5, unitPrice: 0, discountPercent: 100 })).toEqual({})
  })

  it.each([0, -1, 0.004, 1.234, Number.NaN])("refuses quantity %s", (quantity) => {
    expect(productLineErrors({ quantity, unitPrice: 1 })).toHaveProperty("quantity")
  })

  it.each([-0.01, 1.005, Number.NaN])("refuses unit price %s", (unitPrice) => {
    expect(productLineErrors({ quantity: 1, unitPrice })).toHaveProperty("unitPrice")
  })

  it.each([-1, 100.01, 10.123, Number.NaN])("refuses discount %s", (discountPercent) => {
    expect(productLineErrors({ quantity: 1, unitPrice: 1, discountPercent })).toHaveProperty("discountPercent")
  })
})

describe("newProductLineDefaults", () => {
  it("copies the description and List price", () => {
    expect(newProductLineDefaults({ description: "Per hour", listPrice: 110 })).toEqual({
      description: "Per hour",
      quantity: 1,
      unitPrice: 110,
      discountPercent: 0,
    })
  })
})
