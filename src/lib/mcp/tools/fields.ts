import { z } from 'zod'

/**
 * A date field as it crosses the MCP wire: an ISO 8601 string.
 *
 * This exists because `z.coerce.date()` cannot be rendered into JSON Schema.
 * Zod 3 silently emitted `{ type: 'string', format: 'date-time' }` for it; zod 4
 * refuses and throws `Date cannot be represented in JSON Schema` — from inside
 * `tools/list`, which means the entire catalog 500s and every connected client
 * loses all 51 tools at once. Nothing in `tsc` or `vite build` sees it, because
 * the failure is in a runtime schema conversion.
 *
 * `.meta({ format: 'date-time' })` on a plain string is what reproduces the zod 3
 * output byte-for-byte. The obvious-looking alternative, `z.iso.datetime()`, is
 * wrong twice over: it bakes a 300-character `pattern` into the emitted schema
 * (a visible change to every client's view of the tool), and it tightens runtime
 * acceptance to strict RFC 3339 — so a model answering "next Tuesday" with
 * `"2026-08-04"` would start getting rejected where it used to be understood.
 *
 * Coercion still happens, one layer down: every handler re-parses `args` with
 * the canonical schema from `~/lib/api/types`, whose `z.coerce.date()` turns
 * this string into a real `Date`. So the LLM-facing contract is a string, the
 * service-facing contract is a Date, and neither side had to change.
 */
export const isoDate = z.string().meta({ format: 'date-time' })

/**
 * Wrap a tool's field shape into the object the MCP SDK publishes.
 *
 * The SDK accepts either a raw shape or a whole Zod schema; passing a raw shape
 * makes it build a plain `z.object()` internally, and that is the problem. Zod 3
 * rendered `z.object()` as `additionalProperties: false`, zod 4 renders it as
 * nothing at all — so a bare shape silently drops that keyword from 44 of the 51
 * published `inputSchema`s. It is the annotation that tells a model not to
 * invent parameters, and several providers require it for strict tool calling.
 *
 * `.meta()` puts it back as pure schema metadata, which matters more than it
 * looks. The obvious fix, `z.strictObject()`, also emits the keyword — but it
 * changes what happens at runtime: unknown keys go from being *stripped* (zod 3's
 * behaviour, and what these tools have always done) to being *rejected*. A model
 * that tacks on one stray field would go from "call succeeds" to "call fails".
 * This keeps the published contract and the runtime behaviour both exactly as
 * they were.
 */
export function closedObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).meta({ additionalProperties: false })
}

/**
 * The object form of a tool's top-level `inputSchema`.
 *
 * Identical to {@link closedObject} except for the empty shape, which is left
 * alone: zod 3's converter emitted `{ properties: {}, type: 'object' }` with no
 * `additionalProperties` for a tool that takes no arguments, and seven tools
 * (`whoami`, `get_self`, the parameterless `list_*`) are published that way. The
 * asymmetry is a quirk of the old converter rather than a decision, but it is
 * part of the wire format, so it is reproduced rather than tidied.
 */
export function toolInput<T extends z.ZodRawShape>(shape: T) {
  return Object.keys(shape).length === 0 ? z.object(shape) : closedObject(shape)
}
