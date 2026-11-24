import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpCtx } from './types'
import { localDay, toolInput } from './fields'
import { mcpErrorFromUnknown, mcpJsonResult } from '../errors'
import * as health from '~/server/services/health'

// Apple Health, as the phone sends it: daily totals, one row per calendar day.
// Read only: only the phone writes them.

export function registerHealthTools(server: McpServer, ctx: McpCtx): void {
  server.registerTool(
    'get_health_days',
    {
      title: 'Get Apple Health days',
      description:
        "The user's Apple Health daily totals from `from` to `to` (both included, at most a year), oldest first; days with no data are left out. Each day's `data` may hold `sleepMinutes` (the night that ended that day) with `bedtime` and `wakeTime`, `steps`, `activeEnergyKcal`, `exerciseMinutes`, `workouts` ([{ type, minutes, energyKcal }]), `weightKg`, `bodyFatPercent`, `restingHeartRate` and `hrvMs`; a field Health had nothing for is missing. Sent by the phone when the user turns it on.",
      inputSchema: toolInput({ from: localDay, to: localDay }),
    },
    async ({ from, to }) => {
      try {
        return mcpJsonResult(await health.listDays(ctx.userId, { from, to }))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )
}
