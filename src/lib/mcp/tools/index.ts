import "server-only";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpCaller } from "./types";
import { registerGoalsTools } from "./goals";
import { registerTasksTools } from "./tasks";
import { registerValuesTools } from "./values";
import { registerPeopleTools } from "./people";
import { registerNextBidsTools } from "./next_bids";
import { registerImportantDatesTools } from "./important_dates";
import { registerGroupsTools } from "./groups";
import { registerBucketListTools } from "./bucket_list";
import { registerSelfTools } from "./self";
import { registerSystemTools } from "./system";

// Single entry point — one call per domain. New domains add a new file and
// a one-line registration here.
export function registerAllTools(server: McpServer, caller: McpCaller): void {
  registerSystemTools(server, caller);
  registerGoalsTools(server, caller);
  registerTasksTools(server, caller);
  registerValuesTools(server, caller);
  registerPeopleTools(server, caller);
  registerNextBidsTools(server, caller);
  registerImportantDatesTools(server, caller);
  registerGroupsTools(server, caller);
  registerBucketListTools(server, caller);
  registerSelfTools(server, caller);
}
