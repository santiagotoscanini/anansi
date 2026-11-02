import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpCtx } from './types'
import { toolInput } from './fields'
import { mcpErrorFromUnknown, mcpJsonResult } from '../errors'
import * as connections from '~/server/services/connections'

// Connections: the weighted edges of the goal graph. A goal's importance is
// computed from its outgoing weights, so these move what `list_goals` calls Low,
// Medium and High.

const weight = z.number().min(0).max(100).describe('0 to 100.')

export function registerConnectionsTools(server: McpServer, ctx: McpCtx): void {
  server.registerTool(
    'list_connections',
    {
      title: 'List goal connections',
      description: 'Every weighted edge between active goals: `source` goal id, `target` goal id, `weight`.',
      inputSchema: toolInput({}),
    },
    async () => {
      try {
        return mcpJsonResult(await connections.list(ctx.userId))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'create_connection',
    {
      title: 'Connect two goals',
      description: 'Add a weighted edge from one goal to another. Both must be yours.',
      inputSchema: toolInput({ source: z.string(), target: z.string(), weight }),
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await connections.create(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'update_connection',
    {
      title: 'Change a connection weight',
      description: 'Set the weight of an edge. To change its ends, delete it and create another.',
      inputSchema: toolInput({ id: z.string(), weight }),
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await connections.update(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'delete_connection',
    {
      title: 'Delete a connection',
      description: 'Remove an edge between two goals. Both goals stay.',
      inputSchema: toolInput({ id: z.string() }),
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await connections.remove(ctx.userId, id))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )
}
