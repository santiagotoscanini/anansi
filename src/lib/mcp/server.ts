// No `import 'server-only'` here, deliberately. That package throws under
// Vite: its exports map the `react-server` condition to an empty module and
// everything else to a bare `throw`, and Vite's SSR pass does not apply that
// condition — so the guard fires on the server it was meant to protect.
// `vite build` tolerates it; `vite dev` 500s on the first request. The boundary
// is enforced by the `no-restricted-imports` rule in eslint.config.mjs instead.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAllTools } from './tools'
import type { McpCtx } from './tools/types'

// Build a fresh McpServer per request. Stateless mode + ephemeral server keeps
// the implementation simple — there's no shared state across requests and no
// session to track; each tool call dispatches against the userId the bearer
// token resolved to.
//
// The McpServer carries no business logic itself; all tools are registered in
// src/lib/mcp/tools/, each one a thin shim over a service function.
export function buildMcpServer(ctx: McpCtx): McpServer {
  const server = new McpServer({
    name: 'anansi',
    version: '0.1.0',
  })
  registerAllTools(server, ctx)
  return server
}
