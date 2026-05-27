import { TRPCError } from "@trpc/server";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Translate a thrown tRPC error into an MCP-shaped tool error so the LLM gets
// something it can actually surface to the user. `isError: true` is the spec
// signal — the client renders this differently from a normal text response.
//
// We deliberately strip stack traces and internal codes from user-visible
// text; the underlying TRPCError code goes into `_meta` for debugging.
export function mcpErrorFromUnknown(err: unknown): CallToolResult {
  if (err instanceof TRPCError) {
    const messageByCode: Record<string, string> = {
      UNAUTHORIZED: "Not authorized. Re-authenticate the Anansi MCP connection.",
      FORBIDDEN: "You don't have permission to do that.",
      NOT_FOUND: "That record doesn't exist (or doesn't belong to you).",
      BAD_REQUEST: err.message || "Invalid input.",
      CONFLICT: err.message || "Conflict with existing data.",
      TOO_MANY_REQUESTS: "Slow down — too many requests.",
    };
    const text = messageByCode[err.code] ?? err.message ?? `Error: ${err.code}`;
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
