import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpCaller } from "./types";
import { mcpErrorFromUnknown, mcpJsonResult } from "../errors";

// Values are user-defined tags (Family, Health, Growth, …) that apply to goals.
// Each value can have a list of "behaviors that confirm it" — concrete evidence
// rows (e.g. Family → "Date night every Saturday") used during reflection.

export function registerValuesTools(server: McpServer, caller: McpCaller): void {
  server.registerTool(
    "list_values",
    {
      title: "List values",
      description:
        "All values defined by the user, with names and colors. Call before tagging goals so you have the right ids.",
      inputSchema: {},
    },
    async () => {
      try {
        return mcpJsonResult(await caller.goals.values.getAll());
      } catch (e) {
        return mcpErrorFromUnknown(e);
      }
    },
  );

  server.registerTool(
    "create_value",
    {
      title: "Create a value",
      description: "Create a new value tag. Color is any CSS-valid hex like #f97316.",
      inputSchema: {
        name: z.string().min(1),
        color: z.string().min(1).describe("CSS color, typically a hex like #f97316."),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await caller.goals.values.create(args));
      } catch (e) {
        return mcpErrorFromUnknown(e);
      }
    },
  );

  server.registerTool(
    "update_value",
    {
      title: "Update a value",
      description: "Rename or recolor a value. Pass only the fields you want to change.",
      inputSchema: {
        id: z.string(),
        name: z.string().min(1).optional(),
        color: z.string().min(1).optional(),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await caller.goals.values.update(args));
      } catch (e) {
        return mcpErrorFromUnknown(e);
      }
    },
  );

  server.registerTool(
    "delete_value",
    {
      title: "Delete a value",
      description: "Remove a value and untag every goal that used it. Confirm with the user.",
      inputSchema: { id: z.string() },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await caller.goals.values.delete({ id }));
      } catch (e) {
        return mcpErrorFromUnknown(e);
      }
    },
  );

  server.registerTool(
    "list_value_behaviors",
    {
      title: "List behaviors for a value",
      description:
        "Return the ordered list of behavior rows attached to a value — concrete evidence the user uses to confirm they're living it.",
      inputSchema: { valueId: z.string() },
    },
    async ({ valueId }) => {
      try {
        return mcpJsonResult(await caller.goals.valueBehaviors.list({ valueId }));
      } catch (e) {
        return mcpErrorFromUnknown(e);
      }
    },
  );

  server.registerTool(
    "add_value_behavior",
    {
      title: "Add a behavior to a value",
      description: "Append a concrete behavior row (e.g. 'Date night every Saturday') to a value.",
      inputSchema: {
        valueId: z.string(),
        content: z.string().min(1).max(500),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await caller.goals.valueBehaviors.create(args));
      } catch (e) {
        return mcpErrorFromUnknown(e);
      }
    },
  );

  server.registerTool(
    "delete_value_behavior",
    {
      title: "Delete a value behavior",
      description: "Remove a single behavior row from a value.",
      inputSchema: { id: z.string() },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await caller.goals.valueBehaviors.delete({ id }));
      } catch (e) {
        return mcpErrorFromUnknown(e);
      }
    },
  );
}
