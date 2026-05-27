import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpCaller } from "./types";
import { mcpErrorFromUnknown, mcpJsonResult } from "../errors";

// Goals — the top-level container. A goal can have a parent (sub-goal), tags
// (values), and tasks. The position is a {x,y} placement on the visual canvas
// — the LLM rarely cares about exact coords, so we accept it but the
// description doesn't push the LLM to micro-manage it.

const emoji = z
  .string()
  .regex(/^\S{1,8}$/u, "emoji glyph only — 1-8 non-whitespace characters")
  .optional();

export function registerGoalsTools(server: McpServer, caller: McpCaller): void {
  server.registerTool(
    "list_goals",
    {
      title: "List goals",
      description:
        "Return every active goal the user owns, with embedded tasks, value tags, parent-child links, and canvas position. The primary read tool for goals; call before mutating to learn the available ids.",
      inputSchema: {},
    },
    async () => {
      try {
        return mcpJsonResult(await caller.goals.goals.getAll());
      } catch (e) {
        return mcpErrorFromUnknown(e);
      }
    },
  );

  server.registerTool(
    "create_goal",
    {
      title: "Create a goal",
      description:
        "Create a new top-level or sub-goal. Pass parentId to nest under another goal. `position` is the {x,y} canvas placement — pick something around {x: 100, y: 100} if you don't have a preference. Add tasks separately with `create_task` after the goal exists.",
      inputSchema: {
        title: z.string().min(1).describe("Short goal title (the headline on the card)."),
        description: z.string().describe("One-paragraph description of the goal. Empty string is fine."),
        emoji,
        parentId: z.string().optional().describe("Goal id to nest under. Omit for a top-level goal."),
        valueIds: z.array(z.string()).default([]).describe("Existing value ids tagged on this goal."),
        position: z
          .object({ x: z.number(), y: z.number() })
          .describe("Canvas position. Pick {x:100,y:100} if you don't have a preference."),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        // The underlying tRPC schema has a historical quirk: `tasks` is typed
        // as the full task shape (with id) even at create-time, but the
        // handler doesn't actually need ids. We always send an empty array
        // and require the LLM to use create_task for follow-up tasks —
        // simpler mental model, avoids the typed-id confusion.
        return mcpJsonResult(await caller.goals.goals.create({ ...args, tasks: [] }));
      } catch (e) {
        return mcpErrorFromUnknown(e);
      }
    },
  );

  server.registerTool(
    "update_goal",
    {
      title: "Update a goal",
      description:
        "Patch a goal's metadata. Pass only the fields you want to change. `valueIds` REPLACES the entire tag set if passed (omit to leave tags alone). Tasks are NOT editable here — use the task tools.",
      inputSchema: {
        id: z.string().describe("Goal id."),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        emoji,
        parentId: z.string().optional().describe("New parent goal id (or omit to leave unchanged)."),
        valueIds: z.array(z.string()).optional().describe("Replace the goal's value tags with this set if passed."),
        position: z.object({ x: z.number(), y: z.number() }).optional(),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await caller.goals.goals.update(args));
      } catch (e) {
        return mcpErrorFromUnknown(e);
      }
    },
  );

  server.registerTool(
    "delete_goal",
    {
      title: "Delete a goal",
      description:
        "Archive a goal and its associated connections + tracking items. Children of the goal become parent-less (not deleted). Confirm with the user before calling — this is destructive.",
      inputSchema: { id: z.string() },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await caller.goals.goals.delete({ id }));
      } catch (e) {
        return mcpErrorFromUnknown(e);
      }
    },
  );
}
