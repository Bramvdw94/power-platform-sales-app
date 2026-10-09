import { GatewayError } from "@/data/gateway"

/** A message a salesperson can act on, for an error from the sales data gateway. */
export function describeError(error: unknown): string {
  if (error instanceof GatewayError) {
    switch (error.code) {
      case "forbidden":
        return "Only the Owner or the Owner's manager can change this record. It may have been reassigned meanwhile; reload to see who owns it now."
      case "notFound":
        return "This record no longer exists."
      case "invalid":
        return Object.keys(error.fieldErrors).length > 0 ? "Fix the fields marked below." : error.message
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  return `Something went wrong: ${message}`
}

/** The per-field messages a refused save carries, if any. */
export function fieldErrorsOf(error: unknown): Record<string, string> {
  return error instanceof GatewayError ? error.fieldErrors : {}
}
