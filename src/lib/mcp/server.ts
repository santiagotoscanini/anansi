import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "./tools";
import type { McpCaller } from "./tools/types";

// Build a fresh McpServer per request. Stateless mode + ephemeral server keeps
// the implementation simple — there's no shared state across requests, no
// session to track, and each tool call dispatches to a tRPC caller scoped to
// the bearer-token's userId.
//
// The McpServer carries no business logic itself; all tools are registered in
// src/lib/mcp/tools/, each one a thin shim over a tRPC procedure.
export function buildMcpServer(caller: McpCaller): McpServer {
  const server = new McpServer({
    name: "anansi",
    version: "0.1.0",
  });
  registerAllTools(server, caller);
  return server;
}
