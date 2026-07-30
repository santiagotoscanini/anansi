import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "./tools";
import type { McpCtx } from "./tools/types";

// Build a fresh McpServer per request. Stateless mode + ephemeral server keeps
// the implementation simple — there's no shared state across requests and no
// session to track; each tool call dispatches against the userId the bearer
// token resolved to.
//
// The McpServer carries no business logic itself; all tools are registered in
// src/lib/mcp/tools/, each one a thin shim over a service function.
export function buildMcpServer(ctx: McpCtx): McpServer {
  const server = new McpServer({
    name: "anansi",
    version: "0.1.0",
  });
  registerAllTools(server, ctx);
  return server;
}
