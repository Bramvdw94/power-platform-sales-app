export type FieldErrors = Record<string, string>

/** A sales rule refused an action, for example a Disqualify without a reason. */
export class SalesRuleError extends Error {
  readonly fieldErrors: FieldErrors

  constructor(message: string, fieldErrors: FieldErrors = {}) {
    super(message)
    this.name = "SalesRuleError"
    this.fieldErrors = fieldErrors
  }
}

/** Throws a SalesRuleError listing every field error, if there are any. */
export function throwIfFieldErrors(message: string, fieldErrors: FieldErrors): void {
  if (Object.keys(fieldErrors).length > 0) throw new SalesRuleError(message, fieldErrors)
}
