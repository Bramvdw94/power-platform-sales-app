import type { Contact, Lead } from "./types"

/** "First Last", or just the last name when there is no first name. */
export function fullName(person: Pick<Lead | Contact, "firstName" | "lastName">): string {
  return [person.firstName?.trim(), person.lastName.trim()].filter(Boolean).join(" ")
}
