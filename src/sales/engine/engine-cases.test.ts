// Runs the shared engine cases in process-engine/cases. The C# plug-in's
// engine runs the same files in xUnit; see process-engine/README.md.
/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import Ajv from "ajv"
import { describe, expect, it } from "vitest"
import { conditionsHold } from "./conditions"
import { checkProcessForPublish, checkRuleForPublish } from "./publish"
import { pickProcess } from "./process"
import { evaluateSave, type SaveInput } from "./save"
import type { ConditionGroup, EngineRecord, EngineTable, Parents, ProcessRow, ProcessVersionRow, Related } from "./types"

const root = join(process.cwd(), "process-engine")
const schema = JSON.parse(readFileSync(join(root, "schema/definition.schema.json"), "utf8"))
const ajv = new Ajv({ allErrors: true, strict: false })
ajv.addSchema(schema)
const validators = {
  process: ajv.getSchema(`${schema.$id}#/definitions/processDefinition`)!,
  rule: ajv.getSchema(`${schema.$id}#/definitions/businessRuleDefinition`)!,
}

type Expect = Record<string, unknown>
type Case =
  | { name: string; covers: string[]; type: "schema"; input: { kind: "process" | "rule"; definition: unknown }; expect: { valid: boolean } }
  | { name: string; covers: string[]; type: "condition"; input: { table: EngineTable; record: EngineRecord; parents: Parents; related: Related; group: ConditionGroup }; expect: { holds: boolean } }
  | { name: string; covers: string[]; type: "pick"; input: { table: EngineTable; record: EngineRecord; parents: Parents; processes: ProcessRow[]; versions: ProcessVersionRow[] }; expect: { processId: string | null; versionId?: string } }
  | { name: string; covers: string[]; type: "save"; input: SaveInput; expect: Expect }
  | { name: string; covers: string[]; type: "publishProcess"; input: Parameters<typeof checkProcessForPublish>[0]; expect: { errorCodes: string[]; warningCodes?: string[] } }
  | { name: string; covers: string[]; type: "publishRule"; input: Parameters<typeof checkRuleForPublish>[0]; expect: { errorCodes: string[]; warningCodes?: string[] } }

/** Every key in `expected` must match `actual`; arrays must match element by element and in length. */
function matches(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length && expected.every((e, i) => matches(actual[i], e))
  }
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object") return false
    return Object.entries(expected).every(([k, v]) => matches((actual as Record<string, unknown>)[k], v))
  }
  return actual === expected || (expected === null && actual === undefined)
}

const sorted = (list: string[]) => [...list].sort()

export const caseFiles = readdirSync(join(root, "cases"))
  .filter((f) => f.endsWith(".json"))
  .sort()

describe("shared engine cases", () => {
  for (const file of caseFiles) {
    const cases = JSON.parse(readFileSync(join(root, "cases", file), "utf8")) as Case[]
    describe(file, () => {
      it("has named cases that say which decisions they cover", () => {
        for (const c of cases) {
          expect(c.name, "name").toBeTruthy()
          expect(c.covers?.length, `${c.name}: covers`).toBeGreaterThan(0)
        }
        expect(new Set(cases.map((c) => c.name)).size, "case names are unique").toBe(cases.length)
      })

      for (const c of cases) {
        it(c.name, () => {
          switch (c.type) {
            case "schema": {
              const validate = validators[c.input.kind]
              const ok = validate(c.input.definition)
              expect(ok, JSON.stringify(validate.errors)).toBe(c.expect.valid)
              break
            }
            case "condition": {
              const { table, record, parents, related, group } = c.input
              expect(conditionsHold({ table, record, parents, related }, group)).toBe(c.expect.holds)
              break
            }
            case "pick": {
              const { table, record, parents, processes, versions } = c.input
              const picked = pickProcess({ table, record, parents }, processes, versions)
              expect(picked?.process.id ?? null).toBe(c.expect.processId)
              if (c.expect.versionId) expect(picked?.version.id).toBe(c.expect.versionId)
              break
            }
            case "save": {
              // Every definition in a save case must be valid against the schema.
              for (const v of c.input.versions ?? []) {
                expect(validators.process(v.definition), `${v.id}: ${JSON.stringify(validators.process.errors)}`).toBe(true)
              }
              for (const r of c.input.rules ?? []) {
                expect(validators.rule(r.definition), `${r.id}: ${JSON.stringify(validators.rule.errors)}`).toBe(true)
              }
              const outcome = evaluateSave(c.input)
              const { engineErrorCodes, taskCount, warningMessages, ...rest } = c.expect as Expect & {
                engineErrorCodes?: string[]
                taskCount?: number
                warningMessages?: string[]
              }
              if (engineErrorCodes) expect(sorted(outcome.engineErrors.map((e) => e.code))).toEqual(sorted(engineErrorCodes))
              if (taskCount !== undefined) expect(outcome.tasks).toHaveLength(taskCount)
              if (warningMessages) expect(sorted(outcome.warnings.map((w) => w.message))).toEqual(sorted(warningMessages))
              expect(matches(outcome, rest), JSON.stringify(outcome, null, 1)).toBe(true)
              break
            }
            case "publishProcess":
            case "publishRule": {
              const result =
                c.type === "publishProcess"
                  ? checkProcessForPublish(c.input)
                  : checkRuleForPublish(c.input)
              expect(sorted(result.errors.map((e) => e.code))).toEqual(sorted(c.expect.errorCodes))
              expect(sorted(result.warnings.map((w) => w.code))).toEqual(sorted(c.expect.warningCodes ?? []))
              break
            }
          }
        })
      }
    })
  }
})
