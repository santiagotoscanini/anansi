import "server-only";
import type { createMcpCaller } from "../caller";

// The caller returned by createMcpCaller is heavily generic and verbose to
// spell out at every tool-registration call site. This alias keeps the
// per-tool files terse without re-exporting tRPC internals.
export type McpCaller = ReturnType<typeof createMcpCaller>;
