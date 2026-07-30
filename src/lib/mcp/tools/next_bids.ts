import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpCtx } from "./types";
import { mcpErrorFromUnknown, mcpJsonResult } from "../errors";
import * as nextBids from "~/server/services/next-bids";

// Next bids — actionable items toward a specific person (gift, gesture,
// check-in, apology). Captured when noticed, not when needed. Completed bids
// stay visible (struck-through) so the fulfilled trail is preserved.

export function registerNextBidsTools(server: McpServer, ctx: McpCtx): void {
  server.registerTool(
    "list_next_bids",
    {
      title: "List next bids for a person",
      description: "All open + completed bids for one person, ordered oldest-first.",
      inputSchema: { personId: z.string() },
    },
    async ({ personId }) => {
      try {
        return mcpJsonResult(await nextBids.list(ctx.userId, personId));
      } catch (e) {
        return mcpErrorFromUnknown(e);
      }
    },
  );

  server.registerTool(
    "list_upcoming_next_bids",
    {
      title: "Upcoming bids across all people",
      description:
        "Open bids with a `dueAt` falling within the window, across every active person. Joined with person name + emoji. Default window 60 days.",
      inputSchema: {
        withinDays: z.number().int().min(1).max(365).default(60),
      },
    },
    async ({ withinDays }) => {
      try {
        return mcpJsonResult(await nextBids.listUpcoming(ctx.userId, { withinDays }));
      } catch (e) {
        return mcpErrorFromUnknown(e);
      }
    },
  );

  server.registerTool(
    "create_next_bid",
    {
      title: "Capture a next bid",
      description:
        "Record an actionable bid toward a person. `dueAt` is optional — bids without a deadline appear in the person's list but never on the upcoming feed.",
      inputSchema: {
        personId: z.string(),
        content: z.string().min(1).max(500),
        dueAt: z.coerce.date().nullable().optional(),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await nextBids.create(ctx.userId, args));
      } catch (e) {
        return mcpErrorFromUnknown(e);
      }
    },
  );

  server.registerTool(
    "update_next_bid",
    {
      title: "Update a next bid",
      description: "Patch content or deadline. Pass `dueAt: null` to clear the deadline.",
      inputSchema: {
        id: z.string(),
        content: z.string().min(1).max(500).optional(),
        dueAt: z.coerce.date().nullable().optional(),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await nextBids.update(ctx.userId, args));
      } catch (e) {
        return mcpErrorFromUnknown(e);
      }
    },
  );

  server.registerTool(
    "set_next_bid_done",
    {
      title: "Mark a bid done (or reopen)",
      description: "Toggle completion. Done bids stay visible — the trail of fulfilled bids is intentional.",
      inputSchema: {
        id: z.string(),
        completed: z.boolean(),
      },
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, completed }) => {
      try {
        return mcpJsonResult(await nextBids.setCompleted(ctx.userId, { id, completed }));
      } catch (e) {
        return mcpErrorFromUnknown(e);
      }
    },
  );

  server.registerTool(
    "delete_next_bid",
    {
      title: "Delete a next bid",
      description: "Hard-delete. Only use for entries that were captured incorrectly — prefer `set_next_bid_done`.",
      inputSchema: { id: z.string() },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await nextBids.remove(ctx.userId, id));
      } catch (e) {
        return mcpErrorFromUnknown(e);
      }
    },
  );
}
