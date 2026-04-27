import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { db } from "../../../data";
import {
  connections,
  goalValues,
  goals,
  taskReferents,
  tasks,
  tasksToGroups,
  trackingItems,
  values,
} from "../../../data/schema";
import {
  createConnectionSchema,
  createGoalSchema,
  createTaskSchema,
  updateConnectionSchema,
  updateGoalSchema,
  updateTaskSchema,
  type Goal,
} from "../../types";
import { loadGoalsForUser } from "../../../data/queries/load-goals";

export const goalsRouter = createTRPCRouter({
  goals: createTRPCRouter({
    getAll: protectedProcedure.query(async ({ ctx }): Promise<Goal[]> => {
      const { goals } = await loadGoalsForUser(ctx.user.userId);
      return goals;
    }),

    create: protectedProcedure.input(createGoalSchema).mutation(async ({ input, ctx }) => {
      const { valueIds, tasks: inputTasks, position, ...goalData } = input;

      const [newGoal] = await db
        .insert(goals)
        .values({
          ...goalData,
          userId: ctx.user.userId,
          positionX: position.x,
          positionY: position.y,
        })
        .returning();

      if (!newGoal) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create goal" });
      }

      // Insert value associations
      if (valueIds.length > 0) {
        await db.insert(goalValues).values(
          valueIds.map((valueId) => ({
            goalId: newGoal.id,
            valueId,
          })),
        );
      }

      // Insert tasks and their referents + group memberships
      if (inputTasks.length > 0) {
        const insertedTasks = await db
          .insert(tasks)
          .values(
            inputTasks.map(({ referentIds: _r, groupIds: _g, ...rest }) => ({
              ...rest,
              goalId: newGoal.id,
            })),
          )
          .returning();

        const referentRows = inputTasks.flatMap((task, idx) => {
          const inserted = insertedTasks[idx];
          if (!inserted || !task.referentIds?.length) return [];
          return task.referentIds.map((personId) => ({ taskId: inserted.id, personId }));
        });
        if (referentRows.length > 0) await db.insert(taskReferents).values(referentRows);

        const groupRows = inputTasks.flatMap((task, idx) => {
          const inserted = insertedTasks[idx];
          if (!inserted || !task.groupIds?.length) return [];
          return task.groupIds.map((groupId) => ({ taskId: inserted.id, groupId }));
        });
        if (groupRows.length > 0) await db.insert(tasksToGroups).values(groupRows);
      }

      return newGoal;
    }),

    // Goal updates intentionally don't touch tasks — the schema rejects a
    // `tasks` field. Per-task edits go through goals.tasks.{create,update,delete}.
    update: protectedProcedure.input(updateGoalSchema).mutation(async ({ input, ctx }) => {
      const { id, valueIds, position, ...goalData } = input;

      // Update goal
      if (Object.keys(goalData).length > 0 || position) {
        const updateData: Partial<typeof goals.$inferInsert> = { ...goalData, updatedAt: new Date() };
        if (position) {
          updateData.positionX = position.x;
          updateData.positionY = position.y;
        }
        await db
          .update(goals)
          .set(updateData)
          .where(and(eq(goals.id, id), eq(goals.userId, ctx.user.userId)));
      }

      // Update value associations if provided
      if (valueIds !== undefined) {
        const goalExists = await db
          .select()
          .from(goals)
          .where(and(eq(goals.id, id), eq(goals.userId, ctx.user.userId)))
          .limit(1);
        if (goalExists.length === 0)
          throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found or access denied" });

        await db.delete(goalValues).where(eq(goalValues.goalId, id));
        if (valueIds.length > 0) {
          await db.insert(goalValues).values(
            valueIds.map((valueId) => ({
              goalId: id,
              valueId,
            })),
          );
        }
      }

      return { success: true };
    }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      return await db.transaction(async (tx) => {
        // Verify the goal belongs to the user
        const goalExists = await tx
          .select()
          .from(goals)
          .where(and(eq(goals.id, input.id), eq(goals.userId, ctx.user.userId)))
          .limit(1);
        if (goalExists.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found or access denied" });

        // Archive the goal (set status to "archived")
        await tx.update(goals).set({ status: "archived", updatedAt: new Date() }).where(eq(goals.id, input.id));

        // Delete all connections where this goal is either source or target
        await tx.delete(connections).where(eq(connections.source, input.id));

        await tx.delete(connections).where(eq(connections.target, input.id));

        // Archive all tracking items belonging to this goal
        await tx
          .update(trackingItems)
          .set({ status: "archived", updatedAt: new Date() })
          .where(eq(trackingItems.goalId, input.id));

        return { success: true };
      });
    }),
  }),

  // Tasks operations
  tasks: createTRPCRouter({
    create: protectedProcedure
      .input(createTaskSchema.extend({ goalId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        // Verify the goal belongs to the user before creating task
        const goalExists = await db
          .select()
          .from(goals)
          .where(and(eq(goals.id, input.goalId), eq(goals.userId, ctx.user.userId)))
          .limit(1);
        if (goalExists.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found or access denied" });

        const { referentIds, groupIds, ...taskInput } = input;
        const [newTask] = await db.insert(tasks).values(taskInput).returning();
        if (!newTask) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create task" });
        }
        if (referentIds?.length) {
          await db.insert(taskReferents).values(referentIds.map((personId) => ({ taskId: newTask.id, personId })));
        }
        if (groupIds?.length) {
          await db.insert(tasksToGroups).values(groupIds.map((groupId) => ({ taskId: newTask.id, groupId })));
        }
        return newTask;
      }),

    update: protectedProcedure
      .input(updateTaskSchema.extend({ goalId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { id, goalId, referentIds, groupIds, ...updateData } = input;
        // Verify the goal belongs to the user
        const goalExists = await db
          .select()
          .from(goals)
          .where(and(eq(goals.id, goalId), eq(goals.userId, ctx.user.userId)))
          .limit(1);
        if (goalExists.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found or access denied" });

        const [updatedTask] = await db
          .update(tasks)
          .set({ ...updateData, updatedAt: new Date() })
          .where(and(eq(tasks.id, id), eq(tasks.goalId, goalId)))
          .returning();

        // Replace referent set if caller provided one.
        if (referentIds !== undefined) {
          await db.delete(taskReferents).where(eq(taskReferents.taskId, id));
          if (referentIds.length > 0) {
            await db.insert(taskReferents).values(referentIds.map((personId) => ({ taskId: id, personId })));
          }
        }
        // Replace group memberships if caller provided one.
        if (groupIds !== undefined) {
          await db.delete(tasksToGroups).where(eq(tasksToGroups.taskId, id));
          if (groupIds.length > 0) {
            await db.insert(tasksToGroups).values(groupIds.map((groupId) => ({ taskId: id, groupId })));
          }
        }
        return updatedTask;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string(), goalId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        // Verify the goal belongs to the user
        const goalExists = await db
          .select()
          .from(goals)
          .where(and(eq(goals.id, input.goalId), eq(goals.userId, ctx.user.userId)))
          .limit(1);
        if (goalExists.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found or access denied" });

        await db.delete(tasks).where(and(eq(tasks.id, input.id), eq(tasks.goalId, input.goalId)));
        return { success: true };
      }),

    // Lightweight drag-drop endpoint for the Horizons board. Sets (or
    // clears) the task's scheduled date. The bucket the task lands in
    // (monthly/quarterly/yearly) is computed client-side from this date and
    // current time — see src/lib/horizon-period.ts. Ownership enforced via
    // the parent goal.
    setScheduled: protectedProcedure
      .input(z.object({ id: z.string(), scheduledAt: z.coerce.date().nullable() }))
      .mutation(async ({ input, ctx }) => {
        const owned = await db
          .select({ taskId: tasks.id })
          .from(tasks)
          .innerJoin(goals, eq(tasks.goalId, goals.id))
          .where(and(eq(tasks.id, input.id), eq(goals.userId, ctx.user.userId)))
          .limit(1);
        if (owned.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found or access denied" });

        await db
          .update(tasks)
          .set({ scheduledAt: input.scheduledAt, updatedAt: new Date() })
          .where(eq(tasks.id, input.id));
        return { success: true };
      }),
  }),

  // Connections operations
  connections: createTRPCRouter({
    getAll: protectedProcedure.query(async ({ ctx }) => {
      // Get connections where both source and target goals belong to the user and are active
      const sourceGoals = goals;
      const targetGoals = goals;

      return await db
        .select()
        .from(connections)
        .innerJoin(sourceGoals, eq(connections.source, sourceGoals.id))
        .innerJoin(targetGoals, eq(connections.target, targetGoals.id))
        .where(
          and(
            eq(sourceGoals.userId, ctx.user.userId),
            eq(targetGoals.userId, ctx.user.userId),
            eq(sourceGoals.status, "active"),
            eq(targetGoals.status, "active"),
          ),
        );
    }),

    create: protectedProcedure.input(createConnectionSchema).mutation(async ({ input, ctx }) => {
      // Verify both source and target goals belong to the user
      const sourceGoal = await db
        .select()
        .from(goals)
        .where(and(eq(goals.id, input.source), eq(goals.userId, ctx.user.userId)))
        .limit(1);
      const targetGoal = await db
        .select()
        .from(goals)
        .where(and(eq(goals.id, input.target), eq(goals.userId, ctx.user.userId)))
        .limit(1);

      if (sourceGoal.length === 0 || targetGoal.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Source or target goal not found or access denied" });
      }

      const [newConnection] = await db.insert(connections).values(input).returning();
      if (!newConnection) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create connection" });
      }
      return newConnection;
    }),

    update: protectedProcedure.input(updateConnectionSchema).mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input;
      // Verify connection belongs to user by checking the source goal
      const connection = await db
        .select()
        .from(connections)
        .innerJoin(goals, eq(connections.source, goals.id))
        .where(and(eq(connections.id, id), eq(goals.userId, ctx.user.userId)))
        .limit(1);

      if (connection.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Connection not found or access denied" });
      }

      const [updatedConnection] = await db
        .update(connections)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(connections.id, id))
        .returning();
      return updatedConnection;
    }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      // Verify connection belongs to user by checking the source goal
      const connection = await db
        .select()
        .from(connections)
        .innerJoin(goals, eq(connections.source, goals.id))
        .where(and(eq(connections.id, input.id), eq(goals.userId, ctx.user.userId)))
        .limit(1);

      if (connection.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Connection not found or access denied" });
      }

      await db.delete(connections).where(eq(connections.id, input.id));
      return { success: true };
    }),
  }),

  // Tracking Items — user-owned, optionally linked to a goal. The library
  // entry point: a tracking item exists in the user's library regardless of
  // any goal association. Items with goal_id IS NULL are surfaced as
  // "Unscoped" in the UI.
  data: createTRPCRouter({
    getAll: protectedProcedure.query(async ({ ctx }) => {
      // values is the only table data.getAll exposes that goals.getAll
      // doesn't — load it in parallel with the merged goals payload.
      const [valuesData, loaded] = await Promise.all([
        db.select().from(values).where(eq(values.userId, ctx.user.userId)),
        loadGoalsForUser(ctx.user.userId),
      ]);
      return {
        values: valuesData,
        goals: loaded.goals,
        connections: loaded.connections,
      };
    }),
  }),

  // Full-fidelity backup — export everything the user owns (all tables + files),
  // import replaces the current user's data wholesale inside a transaction.
  // See: /Users/stoscanini/.claude/plans/can-you-create-a-twinkly-hickey.md
  // People operations (Personal CRM)
});
