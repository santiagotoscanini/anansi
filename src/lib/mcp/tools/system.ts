import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpCtx } from './types'
import { mcpErrorFromUnknown, mcpJsonResult } from '../errors'
import * as authService from '~/server/services/auth'

// System-level diagnostic tools. `whoami` is the smoke-test: if a tool call
// reaches here and returns the right name, the bearer → token → service chain
// is healthy end-to-end. Keep it cheap; intended for connectivity checks.
export function registerSystemTools(server: McpServer, ctx: McpCtx): void {
  server.registerTool(
    'whoami',
    {
      title: 'Who am I?',
      description:
        'Return the Anansi profile of the user whose token is being used. Useful for verifying the MCP connection works.',
      inputSchema: {},
    },
    async () => {
      try {
        const me = await authService.me(ctx.userId)
        return mcpJsonResult({ id: me.id, name: me.name, email: me.email })
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )
}
