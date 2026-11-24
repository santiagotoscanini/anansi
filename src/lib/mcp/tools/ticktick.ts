import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpCtx } from './types'
import { toolInput } from './fields'
import { mcpErrorFromUnknown, mcpJsonResult } from '../errors'
import * as ticktick from '~/server/services/ticktick'

// The TickTick sync, as far as a conversation needs it: how it stands, and a
// run on demand. Connecting and picking the list stay on the screen (Profile →
// TickTick): connecting is a browser sign-in at ticktick.com. Every goal and
// task tool already syncs on its own; these are for "is it in TickTick yet?".
export function registerTickTickTools(server: McpServer, ctx: McpCtx): void {
  server.registerTool(
    'get_ticktick_status',
    {
      title: 'TickTick sync status',
      description:
        "Whether the user's tasks sync with a TickTick list, which list (`list`), where captures go (`captureList`, a separate list of thoughts and voice notes to sort, tagged anansi; null is TickTick's Inbox), when it last synced, how many are linked, and the last error. Each task is a top-level task in the sync list, tagged with its goal; writes made through the other tools reach TickTick within seconds, and TickTick's changes arrive within about two minutes.",
      inputSchema: toolInput({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        return mcpJsonResult(await ticktick.status(ctx.userId))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'sync_ticktick',
    {
      title: 'Sync with TickTick now',
      description:
        'Run the two-way TickTick sync now instead of waiting for the next one, e.g. right after the user says they changed something in TickTick. Answers how many changes went each way and the status after it.',
      inputSchema: toolInput({}),
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        return mcpJsonResult(await ticktick.syncNow(ctx.userId))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )
}
