import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpCaller } from "./types";
import { mcpErrorFromUnknown, mcpJsonResult } from "../errors";

// Groups are cross-entity tags — the same group row tags BOTH people and tasks
// (e.g. "Family" can hold both my partner and the "call mom" task). The DB
// keeps the legacy `person_groups` table name; in the product it's just
// "groups."

export function registerGroupsTools(server: McpServer, caller: McpCaller): void {
  server.registerTool(
    "list_groups",
    {
      title: "List groups",
      description: "All groups the user has defined. Each group can tag people AND tasks.",
      inputSchema: {},
    },
    async () => {
      try {
        return mcpJsonResult(await caller.goals.groups.getAll());
      } catch (e) {
        return mcpErrorFromUnknown(e);
      }
    },
  );

  server.registerTool(
    "create_group",
    {
      title: "Create a group",
      description: "Add a new group. Color is any CSS hex like #f97316.",
      inputSchema: {
        name: z.string().min(1),
        color: z.string().min(1),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await caller.goals.groups.create(args));
      } catch (e) {
        return mcpErrorFromUnknown(e);
      }
    },
  );

  server.registerTool(
    "update_group",
    {
      title: "Update a group",
      description: "Rename, recolor, or reorder a group.",
      inputSchema: {
        id: z.string(),
        name: z.string().min(1).optional(),
        color: z.string().min(1).optional(),
        orderIdx: z.number().int().optional(),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await caller.goals.groups.update(args));
      } catch (e) {
        return mcpErrorFromUnknown(e);
      }
    },
  );

  server.registerTool(
    "delete_group",
    {
      title: "Delete a group",
      description: "Remove a group. Cascades to its memberships (people and tasks lose this tag).",
      inputSchema: { id: z.string() },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await caller.goals.groups.delete({ id }));
      } catch (e) {
        return mcpErrorFromUnknown(e);
      }
    },
  );

  server.registerTool(
    "list_group_tasks",
    {
      title: "Tasks in a group",
      description: "Every task tagged with the group, joined with the parent goal's context.",
      inputSchema: { groupId: z.string() },
    },
    async ({ groupId }) => {
      try {
        return mcpJsonResult(await caller.goals.groups.getTasks({ groupId }));
      } catch (e) {
        return mcpErrorFromUnknown(e);
      }
    },
  );
}
