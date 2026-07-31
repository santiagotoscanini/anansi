// No `import 'server-only'` here, deliberately. That package throws under
// Vite: its exports map the `react-server` condition to an empty module and
// everything else to a bare `throw`, and Vite's SSR pass does not apply that
// condition — so the guard fires on the server it was meant to protect.
// `vite build` tolerates it; `vite dev` 500s on the first request. The boundary
// is enforced by the `no-restricted-imports` rule in eslint.config.mjs instead.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpCtx } from './types'
import { registerGoalsTools } from './goals'
import { registerTasksTools } from './tasks'
import { registerValuesTools } from './values'
import { registerPeopleTools } from './people'
import { registerNextBidsTools } from './next_bids'
import { registerImportantDatesTools } from './important_dates'
import { registerGroupsTools } from './groups'
import { registerBucketListTools } from './bucket_list'
import { registerSelfTools } from './self'
import { registerSystemTools } from './system'

// Single entry point — one call per domain. New domains add a new file and
// a one-line registration here.
export function registerAllTools(server: McpServer, ctx: McpCtx): void {
  registerSystemTools(server, ctx)
  registerGoalsTools(server, ctx)
  registerTasksTools(server, ctx)
  registerValuesTools(server, ctx)
  registerPeopleTools(server, ctx)
  registerNextBidsTools(server, ctx)
  registerImportantDatesTools(server, ctx)
  registerGroupsTools(server, ctx)
  registerBucketListTools(server, ctx)
  registerSelfTools(server, ctx)
}
