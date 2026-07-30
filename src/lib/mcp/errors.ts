import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { AppError, type AppErrorCode } from "~/server/services/errors";

// Translate a thrown service error into an MCP-shaped tool error so the LLM
// gets something it can actually surface to the user. `isError: true` is the
// spec signal — the client renders this differently from a normal text
// response.
//
// We deliberately strip stack traces and internal codes from user-visible
// text; the code goes into `_meta` for debugging.
//
// The `_meta` key stays `trpc_code` even though tRPC is no longer in this
// path. It's an opaque private field that shipped in the tool contract and is
// asserted on by the golden `tools/list` checks — renaming it would be a wire
// change for zero benefit. Tools now call services in-process, so an AppError
// arrives with full fidelity; there is no cross-serialisation downgrade to
// work around like there was through tRPC.
export function mcpErrorFromUnknown(err: unknown): CallToolResult {
  if (err instanceof AppError) {
    // Keyed by AppErrorCode, so adding a code to the taxonomy without a
    // user-facing message here is a type error rather than a raw code leaking
    // into the LLM's context. There is deliberately no FORBIDDEN: an ownership
    // failure returns NOT_FOUND so a caller can't distinguish "someone else's
    // record" from "no such record".
    const messageByCode: Record<AppErrorCode, string> = {
      UNAUTHORIZED: "Not authorized. Re-authenticate the Anansi MCP connection.",
      NOT_FOUND: "That record doesn't exist (or doesn't belong to you).",
      BAD_REQUEST: err.message || "Invalid input.",
      CONFLICT: err.message || "Conflict with existing data.",
      TOO_MANY_REQUESTS: "Slow down — too many requests.",
      INTERNAL_SERVER_ERROR: "Something went wrong on the Anansi side.",
    };
    const text = messageByCode[err.code];
    return {
      isError: true,
      content: [{ type: "text", text }],
      _meta: { trpc_code: err.code },
    };
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

// Convenience: wrap a tool's success payload as a single JSON text block.
// MCP clients render text content directly to the LLM; structured data goes
// through JSON.stringify so the model can reason over it without us building
// a tool-specific text rendering for every endpoint.
//
// Use BigInt-safe JSON serialization to avoid TypeError on Date/BigInt
// (Date.toJSON is fine; BigInt is unused but cheap to guard).
export function mcpJsonResult(payload: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v), 2),
      },
    ],
  };
}
