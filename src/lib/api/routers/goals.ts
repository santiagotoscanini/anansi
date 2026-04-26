import { z } from "zod";
import { eq, and, asc, isNull, inArray, sql } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { db } from "../../data";
import {
  users,
  values,
  valueBehaviors,
  goals,
  tasks,
  connections,
  goalValues,
  trackingItems,
  weeklySync,
  weeklySyncItems,
  syncTemplates,
  syncTemplateItems,
  attachments,
  people,
  userSelf,
  selfListItems,
  taskReferents,
  personGroups,
  peopleToGroups,
  tasksToGroups,
  nextBids,
  importantDates,
  bucketListItems,
  bucketListItemPeople,
} from "../../data/schema";
import {
  createValueSchema,
  updateValueSchema,
  createValueBehaviorSchema,
  createGoalSchema,
  updateGoalSchema,
  createTaskSchema,
  updateTaskSchema,
  createConnectionSchema,
  updateConnectionSchema,
  createTrackingItemSchema,
  updateTrackingItemSchema,
  createWeeklySyncSchema,
  createSyncTemplateSchema,
  updateSyncTemplateSchema,
  setSyncTemplateItemsSchema,
  addSyncItemSchema,
  removeSyncItemSchema,
  setSyncItemTextSchema,
  reorderSyncItemsSchema,
  uploadAttachmentSchema,
  createPersonSchema,
  updatePersonSchema,
  updateSelfSchema,
  createSelfListItemSchema,
  updateSelfListItemSchema,
  reorderSelfListItemsSchema,
  personCategoryValues,
  createPersonGroupSchema,
  updatePersonGroupSchema,
  createNextBidSchema,
  updateNextBidSchema,
  setNextBidCompletedSchema,
  createImportantDateSchema,
  updateImportantDateSchema,
  createBucketListItemSchema,
  updateBucketListItemSchema,
  backupSchema,
  type Goal,
} from "../types";
import { isValidBase64Image } from "../../image-upload";
import { writeFile, readFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { createId } from "@paralleldrive/cuid2";

const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

// Persist an attachment payload to disk under uploads/{userId}/attachments/{id}.{ext}.
// Caller is responsible for the matching DB row (kept atomic via tx-around-FS).
async function writeAttachmentToDisk(args: {
  data: string;
  userId: string;
  attachmentId: string;
  fileName: string;
}): Promise<{ storagePath: string; sizeBytes: number }> {
  const ext = path.extname(args.fileName);
  const relPath = path.join(args.userId, "attachments", `${args.attachmentId}${ext}`);
  const fullPath = path.join(UPLOADS_ROOT, relPath);
  const cleanBase64 = args.data.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(cleanBase64, "base64");
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);
  return { storagePath: relPath, sizeBytes: buffer.length };
}

async function unlinkAttachmentFromDisk(storagePath: string): Promise<boolean> {
  const fullPath = path.join(UPLOADS_ROOT, storagePath);
  if (!existsSync(fullPath)) return false;
  try {
    await unlink(fullPath);
    return true;
  } catch (err) {
    console.warn(`[attachments] failed to unlink ${fullPath}:`, err);
    return false;
  }
}

export const goalsRouter = createTRPCRouter({
  // Values operations
  values: createTRPCRouter({
    getAll: protectedProcedure.query(async ({ ctx }) => {
      return await db.select().from(values).where(eq(values.userId, ctx.user.userId));
    }),

    create: protectedProcedure.input(createValueSchema).mutation(async ({ input, ctx }) => {
      const [newValue] = await db
        .insert(values)
        .values({ ...input, userId: ctx.user.userId })
        .returning();
      if (!newValue) {
        throw new Error("Failed to create value");
      }
      return newValue;
    }),

    update: protectedProcedure.input(updateValueSchema).mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input;
      const [updatedValue] = await db
        .update(values)
        .set({ ...updateData, updatedAt: new Date() })
        .where(and(eq(values.id, id), eq(values.userId, ctx.user.userId)))
        .returning();
      return updatedValue;
    }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      await db.delete(goalValues).where(eq(goalValues.valueId, input.id));
      await db.delete(values).where(and(eq(values.id, input.id), eq(values.userId, ctx.user.userId)));
      return { success: true };
    }),
  }),

  // Behaviors that confirm a value — concrete evidence per value.
  // Ownership is enforced via the parent value's user_id (no direct user_id
  // on value_behaviors; cascade-deletes when the value goes away).
  valueBehaviors: createTRPCRouter({
    list: protectedProcedure.input(z.object({ valueId: z.string() })).query(async ({ input, ctx }) => {
      // Verify the value belongs to the caller before returning behaviors.
      const [value] = await db
        .select()
        .from(values)
        .where(and(eq(values.id, input.valueId), eq(values.userId, ctx.user.userId)))
        .limit(1);
      if (!value) throw new Error("Value not found or access denied");
      return await db
        .select()
        .from(valueBehaviors)
        .where(eq(valueBehaviors.valueId, input.valueId))
        .orderBy(asc(valueBehaviors.orderIdx), asc(valueBehaviors.createdAt));
    }),

    listAll: protectedProcedure.query(async ({ ctx }) => {
      // Returns every behavior across all of the user's values — used by the
      // ValuesManager to render counts + the inline expansion in one round trip.
      return await db
        .select({
          id: valueBehaviors.id,
          valueId: valueBehaviors.valueId,
          content: valueBehaviors.content,
          orderIdx: valueBehaviors.orderIdx,
          createdAt: valueBehaviors.createdAt,
        })
        .from(valueBehaviors)
        .innerJoin(values, eq(valueBehaviors.valueId, values.id))
        .where(eq(values.userId, ctx.user.userId))
        .orderBy(asc(valueBehaviors.orderIdx), asc(valueBehaviors.createdAt));
    }),

    create: protectedProcedure.input(createValueBehaviorSchema).mutation(async ({ input, ctx }) => {
      const [value] = await db
        .select()
        .from(values)
        .where(and(eq(values.id, input.valueId), eq(values.userId, ctx.user.userId)))
        .limit(1);
      if (!value) throw new Error("Value not found or access denied");

      // Append at the end of the value's behavior list.
      const [maxRow] = await db
        .select({ max: sql<number>`coalesce(max(${valueBehaviors.orderIdx}), -1)` })
        .from(valueBehaviors)
        .where(eq(valueBehaviors.valueId, input.valueId));
      const nextOrder = (maxRow?.max ?? -1) + 1;

      const [created] = await db
        .insert(valueBehaviors)
        .values({ valueId: input.valueId, content: input.content, orderIdx: nextOrder })
        .returning();
      if (!created) throw new Error("Failed to add behavior");
      return created;
    }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      // Ownership via the parent value.
      const [row] = await db
        .select({ id: valueBehaviors.id })
        .from(valueBehaviors)
        .innerJoin(values, eq(valueBehaviors.valueId, values.id))
        .where(and(eq(valueBehaviors.id, input.id), eq(values.userId, ctx.user.userId)))
        .limit(1);
      if (!row) throw new Error("Behavior not found or access denied");
      await db.delete(valueBehaviors).where(eq(valueBehaviors.id, input.id));
      return { success: true };
    }),
  }),

  // Goals operations
  goals: createTRPCRouter({
    getAll: protectedProcedure.query(async ({ ctx }): Promise<Goal[]> => {
      const goalsData = await db
        .select()
        .from(goals)
        .where(and(eq(goals.userId, ctx.user.userId), eq(goals.status, "active")));
      const goalIds = goalsData.map((g) => g.id);

      // Get all tasks for user's goals
      const tasksData = await db
        .select()
        .from(tasks)
        .innerJoin(goals, eq(tasks.goalId, goals.id))
        .where(and(eq(goals.userId, ctx.user.userId), eq(goals.status, "active")));

      const taskIds = tasksData.map((t) => t.tasks.id);
      const referentsData = taskIds.length
        ? await db.select().from(taskReferents).where(inArray(taskReferents.taskId, taskIds))
        : [];
      const taskGroupsData = taskIds.length
        ? await db.select().from(tasksToGroups).where(inArray(tasksToGroups.taskId, taskIds))
        : [];

      // Get all goal-value relationships for user's goals
      const goalValuesData = await db
        .select()
        .from(goalValues)
        .innerJoin(goals, eq(goalValues.goalId, goals.id))
        .where(and(eq(goals.userId, ctx.user.userId), eq(goals.status, "active")));

      // Get all connections for user's goals
      const connectionsData =
        goalIds.length > 0
          ? await db
              .select()
              .from(connections)
              .innerJoin(goals, eq(connections.source, goals.id))
              .where(and(eq(goals.userId, ctx.user.userId), eq(goals.status, "active")))
          : [];

      // Helper function to calculate importance based on outgoing connections
      const calculateImportance = (goalId: string): "Low" | "Medium" | "High" => {
        const outgoingConnections = connectionsData
          .filter((item) => item.connections.source === goalId)
          .map((item) => item.connections);

        if (outgoingConnections.length === 0) return "Low";

        const totalWeight = outgoingConnections.reduce((sum, conn) => sum + conn.weight, 0);
        const averageWeight = totalWeight / outgoingConnections.length;

        if (averageWeight <= 33.3) return "Low";
        if (averageWeight < 66.6) return "Medium";
        return "High"; // averageWeight <= 100
      };

      return goalsData.map((goal) => ({
        id: goal.id,
        title: goal.title,
        description: goal.description,
        emoji: goal.emoji ?? undefined,
        parentId: goal.parentId ?? undefined,
        position: { x: goal.positionX, y: goal.positionY },
        importance: calculateImportance(goal.id),
        status: goal.status,
        valueIds: goalValuesData
          .filter((item) => item.goal_values.goalId === goal.id)
          .map((item) => item.goal_values.valueId),
        tasks: tasksData
          .filter((item) => item.tasks.goalId === goal.id)
          .map((item) => ({
            id: item.tasks.id,
            title: item.tasks.title,
            description: item.tasks.description ?? null,
            emoji: item.tasks.emoji ?? null,
            difficulty: item.tasks.difficulty as 1 | 2 | 3,
            completed: item.tasks.completed,
            scheduledAt: item.tasks.scheduledAt ?? null,
            referentIds: referentsData.filter((r) => r.taskId === item.tasks.id).map((r) => r.personId),
            groupIds: taskGroupsData.filter((g) => g.taskId === item.tasks.id).map((g) => g.groupId),
          })),
      }));
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
        throw new Error("Failed to create goal");
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

    update: protectedProcedure.input(updateGoalSchema).mutation(async ({ input, ctx }) => {
      const { id, valueIds, tasks: inputTasks, position, ...goalData } = input;

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
        // First verify the goal belongs to the user
        const goalExists = await db
          .select()
          .from(goals)
          .where(and(eq(goals.id, id), eq(goals.userId, ctx.user.userId)))
          .limit(1);
        if (goalExists.length === 0) throw new Error("Goal not found or access denied");

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

      // Update tasks if provided (full replace — cascades drop referents + group links).
      if (inputTasks !== undefined) {
        await db.delete(tasks).where(eq(tasks.goalId, id));
        if (inputTasks.length > 0) {
          const insertedTasks = await db
            .insert(tasks)
            .values(
              inputTasks.map(({ referentIds: _r, groupIds: _g, ...rest }) => ({
                ...rest,
                goalId: id,
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
        if (goalExists.length === 0) throw new Error("Goal not found or access denied");

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
        if (goalExists.length === 0) throw new Error("Goal not found or access denied");

        const { referentIds, groupIds, ...taskInput } = input;
        const [newTask] = await db.insert(tasks).values(taskInput).returning();
        if (!newTask) {
          throw new Error("Failed to create task");
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
        if (goalExists.length === 0) throw new Error("Goal not found or access denied");

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
        if (goalExists.length === 0) throw new Error("Goal not found or access denied");

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
        if (owned.length === 0) throw new Error("Task not found or access denied");

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
        throw new Error("Source or target goal not found or access denied");
      }

      const [newConnection] = await db.insert(connections).values(input).returning();
      if (!newConnection) {
        throw new Error("Failed to create connection");
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
        throw new Error("Connection not found or access denied");
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
        throw new Error("Connection not found or access denied");
      }

      await db.delete(connections).where(eq(connections.id, input.id));
      return { success: true };
    }),
  }),

  // Tracking Items — user-owned, optionally linked to a goal. The library
  // entry point: a tracking item exists in the user's library regardless of
  // any goal association. Items with goal_id IS NULL are surfaced as
  // "Unscoped" in the UI.
  trackingItems: createTRPCRouter({
    list: protectedProcedure
      .input(z.object({ goalId: z.string().optional() }).optional())
      .query(async ({ input, ctx }) => {
        const conditions = [
          eq(trackingItems.userId, ctx.user.userId),
          isNull(trackingItems.deletedAt),
          eq(trackingItems.status, "active"),
        ];
        if (input?.goalId) conditions.push(eq(trackingItems.goalId, input.goalId));
        return db
          .select()
          .from(trackingItems)
          .where(and(...conditions))
          .orderBy(asc(trackingItems.order), asc(trackingItems.createdAt));
      }),

    create: protectedProcedure.input(createTrackingItemSchema).mutation(async ({ input, ctx }) => {
      // If goalId provided, verify the goal belongs to the user.
      if (input.goalId) {
        const [g] = await db
          .select()
          .from(goals)
          .where(and(eq(goals.id, input.goalId), eq(goals.userId, ctx.user.userId)))
          .limit(1);
        if (!g) throw new Error("Goal not found or access denied");
      }
      const [created] = await db
        .insert(trackingItems)
        .values({
          userId: ctx.user.userId,
          goalId: input.goalId ?? null,
          title: input.title,
          description: input.description ?? null,
          order: input.order ?? 0,
        })
        .returning();
      if (!created) throw new Error("Failed to create tracking item");
      return created;
    }),

    update: protectedProcedure.input(updateTrackingItemSchema).mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input;
      // Direct user-scope ownership check — no goal join required.
      const [existing] = await db
        .select()
        .from(trackingItems)
        .where(and(eq(trackingItems.id, id), eq(trackingItems.userId, ctx.user.userId)))
        .limit(1);
      if (!existing) throw new Error("Tracking item not found or access denied");
      // If switching/setting goalId, verify the new goal belongs to the user too.
      if (updateData.goalId) {
        const [g] = await db
          .select()
          .from(goals)
          .where(and(eq(goals.id, updateData.goalId), eq(goals.userId, ctx.user.userId)))
          .limit(1);
        if (!g) throw new Error("Goal not found or access denied");
      }
      const [updated] = await db
        .update(trackingItems)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(trackingItems.id, id))
        .returning();
      return updated;
    }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      const [existing] = await db
        .select()
        .from(trackingItems)
        .where(and(eq(trackingItems.id, input.id), eq(trackingItems.userId, ctx.user.userId)))
        .limit(1);
      if (!existing) throw new Error("Tracking item not found or access denied");
      // Soft-delete if any sync references this item; hard-delete otherwise.
      const [referenced] = await db
        .select({ id: weeklySyncItems.id })
        .from(weeklySyncItems)
        .where(eq(weeklySyncItems.trackingItemId, input.id))
        .limit(1);
      if (referenced) {
        await db
          .update(trackingItems)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(trackingItems.id, input.id));
        return { success: true, type: "soft_delete" as const };
      }
      await db.delete(trackingItems).where(eq(trackingItems.id, input.id));
      return { success: true, type: "hard_delete" as const };
    }),
  }),

  // Sync Templates — named bundles of tracking items used to instantiate
  // weekly syncs. The default template auto-snapshots into each new sync.
  syncTemplates: createTRPCRouter({
    list: protectedProcedure.query(async ({ ctx }) => {
      const templates = await db
        .select()
        .from(syncTemplates)
        .where(eq(syncTemplates.userId, ctx.user.userId))
        .orderBy(asc(syncTemplates.createdAt));
      if (templates.length === 0)
        return [] as Array<(typeof templates)[number] & { items: (typeof syncTemplateItems.$inferSelect)[] }>;
      const templateIds = templates.map((t) => t.id);
      const items = await db
        .select()
        .from(syncTemplateItems)
        .where(inArray(syncTemplateItems.templateId, templateIds))
        .orderBy(asc(syncTemplateItems.orderIdx));
      return templates.map((t) => ({
        ...t,
        items: items.filter((i) => i.templateId === t.id),
      }));
    }),

    create: protectedProcedure.input(createSyncTemplateSchema).mutation(async ({ input, ctx }) => {
      // If marking default, clear any existing default first — partial unique
      // index would reject otherwise.
      return await db.transaction(async (tx) => {
        if (input.isDefault) {
          await tx
            .update(syncTemplates)
            .set({ isDefault: false, updatedAt: new Date() })
            .where(and(eq(syncTemplates.userId, ctx.user.userId), eq(syncTemplates.isDefault, true)));
        }
        const [created] = await tx
          .insert(syncTemplates)
          .values({
            userId: ctx.user.userId,
            name: input.name,
            isDefault: input.isDefault ?? false,
          })
          .returning();
        if (!created) throw new Error("Failed to create sync template");
        return created;
      });
    }),

    update: protectedProcedure.input(updateSyncTemplateSchema).mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input;
      return await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(syncTemplates)
          .where(and(eq(syncTemplates.id, id), eq(syncTemplates.userId, ctx.user.userId)))
          .limit(1);
        if (!existing) throw new Error("Template not found or access denied");
        if (updateData.isDefault) {
          await tx
            .update(syncTemplates)
            .set({ isDefault: false, updatedAt: new Date() })
            .where(and(eq(syncTemplates.userId, ctx.user.userId), eq(syncTemplates.isDefault, true)));
        }
        const [updated] = await tx
          .update(syncTemplates)
          .set({ ...updateData, updatedAt: new Date() })
          .where(eq(syncTemplates.id, id))
          .returning();
        return updated;
      });
    }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      const [existing] = await db
        .select()
        .from(syncTemplates)
        .where(and(eq(syncTemplates.id, input.id), eq(syncTemplates.userId, ctx.user.userId)))
        .limit(1);
      if (!existing) throw new Error("Template not found or access denied");
      await db.delete(syncTemplates).where(eq(syncTemplates.id, input.id));
      return { success: true };
    }),

    // Replace-set semantics on the template's item list. Mirror of
    // bucketList.update's personIds[] pattern.
    setItems: protectedProcedure.input(setSyncTemplateItemsSchema).mutation(async ({ input, ctx }) => {
      return await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(syncTemplates)
          .where(and(eq(syncTemplates.id, input.templateId), eq(syncTemplates.userId, ctx.user.userId)))
          .limit(1);
        if (!existing) throw new Error("Template not found or access denied");

        if (input.items.length > 0) {
          const ids = input.items.map((i) => i.trackingItemId);
          const owned = await tx
            .select({ id: trackingItems.id })
            .from(trackingItems)
            .where(and(inArray(trackingItems.id, ids), eq(trackingItems.userId, ctx.user.userId)));
          if (owned.length !== ids.length) {
            throw new Error("One or more tracking items not found or access denied");
          }
        }

        await tx.delete(syncTemplateItems).where(eq(syncTemplateItems.templateId, input.templateId));
        if (input.items.length > 0) {
          await tx.insert(syncTemplateItems).values(
            input.items.map((i) => ({
              templateId: input.templateId,
              trackingItemId: i.trackingItemId,
              orderIdx: i.orderIdx,
            })),
          );
        }
        return { success: true };
      });
    }),
  }),

  // Weekly Sync — template-driven snapshot at create time, mutable per period.
  weeklySync: createTRPCRouter({
    getByWeek: protectedProcedure.input(z.object({ weekStart: z.date() })).query(async ({ input, ctx }) => {
      const [row] = await db
        .select()
        .from(weeklySync)
        .where(and(eq(weeklySync.userId, ctx.user.userId), eq(weeklySync.weekDate, input.weekStart)))
        .limit(1);
      return row ?? null;
    }),

    // Hydrates everything the retro UI needs in one round trip:
    //   - the weeklySync row (or null)
    //   - the user's full tracking-items library (so the "+ add item" picker
    //     can render items not yet on this sync)
    //   - the weekly_sync_items with text_content inline + attachments hydrated
    //   - active goals (for grouping); items with goal_id IS NULL go into
    //     the separate `unscopedItems` array.
    getWeeklyRetrospectiveData: protectedProcedure
      .input(z.object({ weekStart: z.date() }))
      .query(async ({ input, ctx }) => {
        const [weeklySyncRecord] = await db
          .select()
          .from(weeklySync)
          .where(and(eq(weeklySync.userId, ctx.user.userId), eq(weeklySync.weekDate, input.weekStart)))
          .limit(1);

        const goalsData = await db
          .select()
          .from(goals)
          .where(and(eq(goals.userId, ctx.user.userId), eq(goals.status, "active")));

        const allConns = goalsData.length
          ? await db
              .select()
              .from(connections)
              .where(
                inArray(
                  connections.source,
                  goalsData.map((g) => g.id),
                ),
              )
          : [];
        const calcImportance = (goalId: string): "Low" | "Medium" | "High" => {
          const out = allConns.filter((c) => c.source === goalId);
          if (out.length === 0) return "Low";
          const avg = out.reduce((s, c) => s + c.weight, 0) / out.length;
          if (avg <= 33.3) return "Low";
          if (avg < 66.6) return "Medium";
          return "High";
        };

        // Full library — for the picker AND for hydrating sync items.
        const allItems = await db
          .select()
          .from(trackingItems)
          .where(
            and(
              eq(trackingItems.userId, ctx.user.userId),
              eq(trackingItems.status, "active"),
              isNull(trackingItems.deletedAt),
            ),
          )
          .orderBy(asc(trackingItems.order), asc(trackingItems.createdAt));

        let syncItemsData: (typeof weeklySyncItems.$inferSelect)[] = [];
        let attachmentsData: (typeof attachments.$inferSelect)[] = [];
        if (weeklySyncRecord) {
          syncItemsData = await db
            .select()
            .from(weeklySyncItems)
            .where(eq(weeklySyncItems.weeklySyncId, weeklySyncRecord.id))
            .orderBy(asc(weeklySyncItems.orderIdx), asc(weeklySyncItems.createdAt));
          if (syncItemsData.length > 0) {
            attachmentsData = await db
              .select()
              .from(attachments)
              .where(
                and(
                  eq(attachments.parentType, "weekly_sync_item"),
                  inArray(
                    attachments.parentId,
                    syncItemsData.map((i) => i.id),
                  ),
                ),
              )
              .orderBy(asc(attachments.createdAt));
          }
        }

        const goalById = new Map(goalsData.map((g) => [g.id, g] as const));
        const itemById = new Map(allItems.map((i) => [i.id, i] as const));

        const hydratedItems = syncItemsData
          .map((si) => {
            const ti = itemById.get(si.trackingItemId);
            if (!ti) return null; // soft-deleted/archived/cross-user — drop
            const itemAttachments = attachmentsData
              .filter((a) => a.parentId === si.id)
              .map((a) => ({
                id: a.id,
                fileName: a.fileName,
                fileType: a.fileType,
                url: `/uploads/${a.storagePath}`,
                sizeBytes: a.sizeBytes,
                createdAt: a.createdAt,
              }));
            return {
              id: si.id,
              trackingItemId: si.trackingItemId,
              title: ti.title,
              description: ti.description,
              orderIdx: si.orderIdx,
              textContent: si.textContent,
              attachments: itemAttachments,
              goalId: ti.goalId,
              createdAt: si.createdAt,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);

        // Group sync items by goal (with an "Unscoped" array for goalId IS NULL).
        const itemsByGoal = new Map<string, typeof hydratedItems>();
        const unscopedItems: typeof hydratedItems = [];
        for (const hi of hydratedItems) {
          if (hi.goalId === null || hi.goalId === undefined) {
            unscopedItems.push(hi);
            continue;
          }
          const arr = itemsByGoal.get(hi.goalId) ?? [];
          arr.push(hi);
          itemsByGoal.set(hi.goalId, arr);
        }

        const goalGroups = goalsData
          .filter((g) => itemsByGoal.has(g.id))
          .map((g) => ({
            id: g.id,
            title: g.title,
            description: g.description,
            importance: calcImportance(g.id),
            items: itemsByGoal.get(g.id) ?? [],
          }));

        return {
          weeklySync: weeklySyncRecord ?? null,
          allTrackingItems: allItems.map((i) => ({
            id: i.id,
            title: i.title,
            description: i.description,
            goalId: i.goalId,
            goalTitle: i.goalId ? (goalById.get(i.goalId)?.title ?? null) : null,
          })),
          goals: goalGroups,
          unscopedItems,
        };
      }),

    // Create a sync for the given week. If templateId is supplied (or omitted
    // and the user has a default template), the sync is auto-populated by
    // snapshotting the template's items in their template-defined order.
    create: protectedProcedure.input(createWeeklySyncSchema).mutation(async ({ input, ctx }) => {
      return await db.transaction(async (tx) => {
        let templateId: string | null = input.templateId ?? null;
        if (templateId === null) {
          const [defaultTemplate] = await tx
            .select()
            .from(syncTemplates)
            .where(and(eq(syncTemplates.userId, ctx.user.userId), eq(syncTemplates.isDefault, true)))
            .limit(1);
          templateId = defaultTemplate?.id ?? null;
        } else {
          const [t] = await tx
            .select()
            .from(syncTemplates)
            .where(and(eq(syncTemplates.id, templateId), eq(syncTemplates.userId, ctx.user.userId)))
            .limit(1);
          if (!t) throw new Error("Template not found or access denied");
        }

        const [created] = await tx
          .insert(weeklySync)
          .values({
            userId: ctx.user.userId,
            weekDate: input.weekDate,
            templateId,
          })
          .returning();
        if (!created) throw new Error("Failed to create weekly sync");

        if (templateId) {
          const templateItemRows = await tx
            .select()
            .from(syncTemplateItems)
            .where(eq(syncTemplateItems.templateId, templateId))
            .orderBy(asc(syncTemplateItems.orderIdx));
          if (templateItemRows.length > 0) {
            await tx.insert(weeklySyncItems).values(
              templateItemRows.map((row) => ({
                weeklySyncId: created.id,
                trackingItemId: row.trackingItemId,
                orderIdx: row.orderIdx,
              })),
            );
          }
        }

        return created;
      });
    }),

    // Add a single item to an existing sync. Idempotent — returns the existing
    // row if the (sync, item) pair is already there.
    addItem: protectedProcedure.input(addSyncItemSchema).mutation(async ({ input, ctx }) => {
      const [sync] = await db
        .select()
        .from(weeklySync)
        .where(and(eq(weeklySync.id, input.weeklySyncId), eq(weeklySync.userId, ctx.user.userId)))
        .limit(1);
      if (!sync) throw new Error("Weekly sync not found or access denied");
      const [item] = await db
        .select()
        .from(trackingItems)
        .where(and(eq(trackingItems.id, input.trackingItemId), eq(trackingItems.userId, ctx.user.userId)))
        .limit(1);
      if (!item) throw new Error("Tracking item not found or access denied");

      const [existing] = await db
        .select()
        .from(weeklySyncItems)
        .where(
          and(
            eq(weeklySyncItems.weeklySyncId, input.weeklySyncId),
            eq(weeklySyncItems.trackingItemId, input.trackingItemId),
          ),
        )
        .limit(1);
      if (existing) return existing;

      const [maxRow] = await db
        .select({ max: sql<number>`coalesce(max(${weeklySyncItems.orderIdx}), -1)` })
        .from(weeklySyncItems)
        .where(eq(weeklySyncItems.weeklySyncId, input.weeklySyncId));
      const nextOrder = (maxRow?.max ?? -1) + 1;

      const [created] = await db
        .insert(weeklySyncItems)
        .values({
          weeklySyncId: input.weeklySyncId,
          trackingItemId: input.trackingItemId,
          orderIdx: nextOrder,
        })
        .returning();
      if (!created) throw new Error("Failed to add sync item");
      return created;
    }),

    // Remove a single item from a sync. Does NOT touch the underlying
    // tracking item (it remains in the user's library). Cascades the item's
    // attachments via FK; we hand-unlink the files from disk after.
    removeItem: protectedProcedure.input(removeSyncItemSchema).mutation(async ({ input, ctx }) => {
      const [row] = await db
        .select({ syncItemId: weeklySyncItems.id })
        .from(weeklySyncItems)
        .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
        .where(and(eq(weeklySyncItems.id, input.weeklySyncItemId), eq(weeklySync.userId, ctx.user.userId)))
        .limit(1);
      if (!row) throw new Error("Sync item not found or access denied");

      const linkedAttachments = await db
        .select()
        .from(attachments)
        .where(and(eq(attachments.parentType, "weekly_sync_item"), eq(attachments.parentId, input.weeklySyncItemId)));

      // Delete the attachments rows first, then the sync item row. (FK cascade
      // would do this for us, but we want to know which storage paths to unlink.)
      if (linkedAttachments.length > 0) {
        await db.delete(attachments).where(
          inArray(
            attachments.id,
            linkedAttachments.map((a) => a.id),
          ),
        );
      }
      await db.delete(weeklySyncItems).where(eq(weeklySyncItems.id, input.weeklySyncItemId));

      for (const a of linkedAttachments) {
        await unlinkAttachmentFromDisk(a.storagePath);
      }
      return { success: true };
    }),

    setItemText: protectedProcedure.input(setSyncItemTextSchema).mutation(async ({ input, ctx }) => {
      const [row] = await db
        .select({ id: weeklySyncItems.id })
        .from(weeklySyncItems)
        .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
        .where(and(eq(weeklySyncItems.id, input.weeklySyncItemId), eq(weeklySync.userId, ctx.user.userId)))
        .limit(1);
      if (!row) throw new Error("Sync item not found or access denied");
      await db
        .update(weeklySyncItems)
        .set({ textContent: input.textContent, updatedAt: new Date() })
        .where(eq(weeklySyncItems.id, input.weeklySyncItemId));
      return { success: true };
    }),

    reorderItems: protectedProcedure.input(reorderSyncItemsSchema).mutation(async ({ input, ctx }) => {
      return await db.transaction(async (tx) => {
        const [sync] = await tx
          .select()
          .from(weeklySync)
          .where(and(eq(weeklySync.id, input.weeklySyncId), eq(weeklySync.userId, ctx.user.userId)))
          .limit(1);
        if (!sync) throw new Error("Sync not found or access denied");

        const ids = input.ordering.map((o) => o.id);
        if (ids.length > 0) {
          const owned = await tx
            .select({ id: weeklySyncItems.id })
            .from(weeklySyncItems)
            .where(and(eq(weeklySyncItems.weeklySyncId, input.weeklySyncId), inArray(weeklySyncItems.id, ids)));
          if (owned.length !== ids.length) {
            throw new Error("Ordering references items not in this sync");
          }
        }

        for (const o of input.ordering) {
          await tx
            .update(weeklySyncItems)
            .set({ orderIdx: o.orderIdx, updatedAt: new Date() })
            .where(eq(weeklySyncItems.id, o.id));
        }
        return { success: true };
      });
    }),
  }),

  // Generic polymorphic attachments — replaces the old weeklySyncItemFiles
  // routes. parent_type='weekly_sync_item' is the only producer today, but
  // the schema is permissive so other entities can opt in without migration.
  attachments: createTRPCRouter({
    upload: protectedProcedure.input(uploadAttachmentSchema).mutation(async ({ input, ctx }) => {
      // Validate ownership of the parent. Only weekly_sync_item is supported today;
      // adding more parent types means extending this switch.
      if (input.parentType === "weekly_sync_item") {
        const [owned] = await db
          .select({ id: weeklySyncItems.id })
          .from(weeklySyncItems)
          .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
          .where(and(eq(weeklySyncItems.id, input.parentId), eq(weeklySync.userId, ctx.user.userId)))
          .limit(1);
        if (!owned) throw new Error("Sync item not found or access denied");
      }

      // Sanity-check the base64 envelope before touching the FS.
      try {
        Buffer.from(input.data.replace(/^data:[^;]+;base64,/, ""), "base64");
      } catch {
        throw new Error("Invalid base64 data");
      }
      if (input.fileType === "image" && !isValidBase64Image(input.data)) {
        throw new Error("Invalid base64 image");
      }

      // DB row first; FS write inside the same tx. If FS fails the row rolls back.
      const attachmentId = createId();
      const ext = path.extname(input.fileName);
      const provisionalStoragePath = path.join(ctx.user.userId, "attachments", `${attachmentId}${ext}`);

      return await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(attachments)
          .values({
            id: attachmentId,
            userId: ctx.user.userId,
            parentType: input.parentType,
            parentId: input.parentId,
            fileName: input.fileName,
            fileType: input.fileType,
            storagePath: provisionalStoragePath,
            sizeBytes: 0,
          })
          .returning();
        if (!row) throw new Error("Failed to create attachment row");

        const { storagePath, sizeBytes } = await writeAttachmentToDisk({
          data: input.data,
          userId: ctx.user.userId,
          attachmentId: row.id,
          fileName: input.fileName,
        });

        await tx.update(attachments).set({ storagePath, sizeBytes }).where(eq(attachments.id, row.id));

        return {
          id: row.id,
          fileName: row.fileName,
          fileType: row.fileType,
          url: `/uploads/${storagePath}`,
          sizeBytes,
          createdAt: row.createdAt,
        };
      });
    }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      const [existing] = await db
        .select()
        .from(attachments)
        .where(and(eq(attachments.id, input.id), eq(attachments.userId, ctx.user.userId)))
        .limit(1);
      if (!existing) throw new Error("Attachment not found or access denied");
      await db.delete(attachments).where(eq(attachments.id, input.id));
      await unlinkAttachmentFromDisk(existing.storagePath);
      return { success: true };
    }),
  }),

  // User operations
  user: createTRPCRouter({
    getCurrent: protectedProcedure.query(async ({ ctx }) => {
      return {
        userId: ctx.user.userId,
        userName: ctx.user.userName,
      };
    }),
  }),

  // Debug operations
  debug: createTRPCRouter({
    getWeeklySyncData: protectedProcedure.query(async ({ ctx }) => {
      const weeklySyncs = await db.select().from(weeklySync).where(eq(weeklySync.userId, ctx.user.userId));

      const weeklySyncItemsData = await db
        .select()
        .from(weeklySyncItems)
        .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
        .where(eq(weeklySync.userId, ctx.user.userId));

      const attachmentsData = await db
        .select()
        .from(attachments)
        .where(and(eq(attachments.userId, ctx.user.userId), eq(attachments.parentType, "weekly_sync_item")));

      return {
        weeklySyncs,
        weeklySyncItems: weeklySyncItemsData,
        attachments: attachmentsData,
        counts: {
          weeklySyncs: weeklySyncs.length,
          weeklySyncItems: weeklySyncItemsData.length,
          attachments: attachmentsData.length,
        },
      };
    }),
  }),

  // Data operations (for importing/exporting)
  data: createTRPCRouter({
    getAll: protectedProcedure.query(async ({ ctx }) => {
      const valuesData = await db.select().from(values).where(eq(values.userId, ctx.user.userId));
      const goalsData = await db
        .select()
        .from(goals)
        .where(and(eq(goals.userId, ctx.user.userId), eq(goals.status, "active")));

      // Get tasks for user's goals only
      const goalIds = goalsData.map((g) => g.id);
      const tasksData =
        goalIds.length > 0
          ? await db
              .select()
              .from(tasks)
              .innerJoin(goals, eq(tasks.goalId, goals.id))
              .where(and(eq(goals.userId, ctx.user.userId), eq(goals.status, "active")))
          : [];

      const taskIds = tasksData.map((t) => t.tasks.id);
      const referentsData =
        taskIds.length > 0 ? await db.select().from(taskReferents).where(inArray(taskReferents.taskId, taskIds)) : [];
      const taskGroupsData =
        taskIds.length > 0 ? await db.select().from(tasksToGroups).where(inArray(tasksToGroups.taskId, taskIds)) : [];

      // Get connections for user's goals only
      const connectionsData =
        goalIds.length > 0
          ? await db
              .select()
              .from(connections)
              .innerJoin(goals, eq(connections.source, goals.id))
              .where(and(eq(goals.userId, ctx.user.userId), eq(goals.status, "active")))
          : [];

      // Get goal-value relationships for user's goals only
      const goalValuesData =
        goalIds.length > 0
          ? await db
              .select()
              .from(goalValues)
              .innerJoin(goals, eq(goalValues.goalId, goals.id))
              .where(and(eq(goals.userId, ctx.user.userId), eq(goals.status, "active")))
          : [];

      // Helper function to calculate importance based on outgoing connections
      const calculateImportance = (goalId: string): "Low" | "Medium" | "High" => {
        const outgoingConnections = connectionsData
          .filter((item) => item.connections.source === goalId)
          .map((item) => item.connections);

        if (outgoingConnections.length === 0) return "Low";

        const totalWeight = outgoingConnections.reduce((sum, conn) => sum + conn.weight, 0);
        const averageWeight = totalWeight / outgoingConnections.length;

        if (averageWeight <= 33.3) return "Low";
        if (averageWeight < 66.6) return "Medium";
        return "High"; // averageWeight <= 100
      };

      const mappedGoals: Goal[] = goalsData.map((goal) => ({
        id: goal.id,
        title: goal.title,
        description: goal.description,
        emoji: goal.emoji ?? undefined,
        parentId: goal.parentId ?? undefined,
        position: { x: goal.positionX, y: goal.positionY },
        importance: calculateImportance(goal.id),
        status: goal.status,
        valueIds: goalValuesData
          .filter((item) => item.goal_values.goalId === goal.id)
          .map((item) => item.goal_values.valueId),
        tasks: tasksData
          .filter((item) => item.tasks.goalId === goal.id)
          .map((item) => ({
            id: item.tasks.id,
            title: item.tasks.title,
            description: item.tasks.description ?? null,
            emoji: item.tasks.emoji ?? null,
            difficulty: item.tasks.difficulty as 1 | 2 | 3,
            completed: item.tasks.completed,
            scheduledAt: item.tasks.scheduledAt ?? null,
            referentIds: referentsData.filter((r) => r.taskId === item.tasks.id).map((r) => r.personId),
            groupIds: taskGroupsData.filter((g) => g.taskId === item.tasks.id).map((g) => g.groupId),
          })),
      }));

      return {
        values: valuesData,
        goals: mappedGoals,
        connections: connectionsData.map((item) => item.connections),
      };
    }),
  }),

  // Full-fidelity backup — export everything the user owns (all tables + files),
  // import replaces the current user's data wholesale inside a transaction.
  // See: /Users/stoscanini/.claude/plans/can-you-create-a-twinkly-hickey.md
  // People operations (Personal CRM)
  people: createTRPCRouter({
    getAll: protectedProcedure
      .input(z.object({ includeArchived: z.boolean().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const rows = await db.select().from(people).where(eq(people.userId, ctx.user.userId));
        const visible = input?.includeArchived ? rows : rows.filter((p) => p.archivedAt === null);
        if (visible.length === 0) return [] as ((typeof rows)[number] & { groupIds: string[] })[];

        // Hydrate group memberships so the directory can render group chips
        // without a per-row query.
        const memberships = await db
          .select()
          .from(peopleToGroups)
          .where(
            inArray(
              peopleToGroups.personId,
              visible.map((p) => p.id),
            ),
          );
        return visible.map((p) => ({
          ...p,
          groupIds: memberships.filter((m) => m.personId === p.id).map((m) => m.groupId),
        }));
      }),

    getById: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
      const [row] = await db
        .select()
        .from(people)
        .where(and(eq(people.id, input.id), eq(people.userId, ctx.user.userId)))
        .limit(1);
      if (!row) return null;
      const memberships = await db.select().from(peopleToGroups).where(eq(peopleToGroups.personId, row.id));
      return { ...row, groupIds: memberships.map((m) => m.groupId) };
    }),

    create: protectedProcedure.input(createPersonSchema).mutation(async ({ input, ctx }) => {
      const { groupIds, ...rest } = input;
      const [newPerson] = await db
        .insert(people)
        .values({ ...rest, userId: ctx.user.userId })
        .returning();
      if (!newPerson) throw new Error("Failed to create person");
      if (groupIds?.length) {
        await db.insert(peopleToGroups).values(groupIds.map((groupId) => ({ personId: newPerson.id, groupId })));
      }
      return newPerson;
    }),

    update: protectedProcedure.input(updatePersonSchema).mutation(async ({ input, ctx }) => {
      const { id, groupIds, ...updateData } = input;
      const [updated] = await db
        .update(people)
        .set({ ...updateData, updatedAt: new Date() })
        .where(and(eq(people.id, id), eq(people.userId, ctx.user.userId)))
        .returning();

      if (groupIds !== undefined) {
        await db.delete(peopleToGroups).where(eq(peopleToGroups.personId, id));
        if (groupIds.length > 0) {
          await db.insert(peopleToGroups).values(groupIds.map((groupId) => ({ personId: id, groupId })));
        }
      }
      return updated;
    }),

    archive: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      const [updated] = await db
        .update(people)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(people.id, input.id), eq(people.userId, ctx.user.userId)))
        .returning();
      return updated;
    }),

    unarchive: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      const [updated] = await db
        .update(people)
        .set({ archivedAt: null, updatedAt: new Date() })
        .where(and(eq(people.id, input.id), eq(people.userId, ctx.user.userId)))
        .returning();
      return updated;
    }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      await db.delete(people).where(and(eq(people.id, input.id), eq(people.userId, ctx.user.userId)));
      return { success: true };
    }),

    // Lightweight drag-drop endpoint — updates only category + boardOrder without
    // requiring the full person payload, and without triggering validation on the
    // other reflection fields.
    setCategory: protectedProcedure
      .input(
        z.object({
          id: z.string(),
          category: z.enum(personCategoryValues),
          boardOrder: z.number().int().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const [updated] = await db
          .update(people)
          .set({
            category: input.category,
            boardOrder: input.boardOrder ?? 0,
            updatedAt: new Date(),
          })
          .where(and(eq(people.id, input.id), eq(people.userId, ctx.user.userId)))
          .returning();
        return updated;
      }),

    // Tasks where this person is a referent — used by PersonModal to show the
    // action surface alongside the reflection fields.
    getTasksAsReferent: protectedProcedure.input(z.object({ personId: z.string() })).query(async ({ input, ctx }) => {
      // Verify the person belongs to the user (prevents enumeration via task refs).
      const [person] = await db
        .select({ id: people.id })
        .from(people)
        .where(and(eq(people.id, input.personId), eq(people.userId, ctx.user.userId)))
        .limit(1);
      if (!person) return [];

      const rows = await db
        .select({
          taskId: tasks.id,
          taskTitle: tasks.title,
          completed: tasks.completed,
          goalId: goals.id,
          goalTitle: goals.title,
          goalEmoji: goals.emoji,
        })
        .from(taskReferents)
        .innerJoin(tasks, eq(taskReferents.taskId, tasks.id))
        .innerJoin(goals, eq(tasks.goalId, goals.id))
        .where(
          and(
            eq(taskReferents.personId, input.personId),
            eq(goals.userId, ctx.user.userId),
            eq(goals.status, "active"),
          ),
        );
      return rows;
    }),

    // Upload a picture for a person. Writes to uploads/{userId}/people/{id}.{ext}
    // (id is fresh per upload, so old files become orphans rather than being
    // overwritten — acceptable trade-off for a personal app). Returns the
    // public URL so the caller can stash it in `people.emoji` (the column
    // already accepts URL-typed values via Avatar.tsx).
    uploadImage: protectedProcedure
      .input(
        z.object({
          fileName: z.string().min(1),
          // base64; data: prefix permitted but not required
          data: z.string().min(1),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const ext = (path.extname(input.fileName) || ".png").toLowerCase();
        if (![".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) {
          throw new Error("Unsupported image type");
        }
        const id = createId();
        const relPath = path.join(ctx.user.userId, "people", `${id}${ext}`);
        const fullPath = path.join(UPLOADS_ROOT, relPath);
        const cleanBase64 = input.data.replace(/^data:[^;]+;base64,/, "");
        const buffer = Buffer.from(cleanBase64, "base64");
        await mkdir(path.dirname(fullPath), { recursive: true });
        await writeFile(fullPath, buffer);
        return { url: `/uploads/${relPath}` };
      }),

    // Bucket list items the person is named on. Mirror of getTasksAsReferent — used
    // by PersonModal to surface the cross-link from the People side.
    getBucketListItemsAsParticipant: protectedProcedure
      .input(z.object({ personId: z.string() }))
      .query(async ({ input, ctx }) => {
        // Verify the person belongs to the user (prevents enumeration via junction rows).
        const [person] = await db
          .select({ id: people.id })
          .from(people)
          .where(and(eq(people.id, input.personId), eq(people.userId, ctx.user.userId)))
          .limit(1);
        if (!person) return [];

        const rows = await db
          .select({
            id: bucketListItems.id,
            content: bucketListItems.content,
            completedAt: bucketListItems.completedAt,
          })
          .from(bucketListItemPeople)
          .innerJoin(bucketListItems, eq(bucketListItemPeople.bucketItemId, bucketListItems.id))
          .where(and(eq(bucketListItemPeople.personId, input.personId), eq(bucketListItems.userId, ctx.user.userId)))
          .orderBy(asc(bucketListItems.createdAt));
        return rows;
      }),
  }),

  // Person groups — user-defined tags. A person can belong to any number of
  // groups. Groups are scoped per-user.
  groups: createTRPCRouter({
    getAll: protectedProcedure.query(async ({ ctx }) => {
      return await db
        .select()
        .from(personGroups)
        .where(eq(personGroups.userId, ctx.user.userId))
        .orderBy(asc(personGroups.orderIdx), asc(personGroups.createdAt));
    }),

    create: protectedProcedure.input(createPersonGroupSchema).mutation(async ({ input, ctx }) => {
      const [row] = await db
        .insert(personGroups)
        .values({ ...input, userId: ctx.user.userId })
        .returning();
      if (!row) throw new Error("Failed to create group");
      return row;
    }),

    update: protectedProcedure.input(updatePersonGroupSchema).mutation(async ({ input, ctx }) => {
      const { id, ...rest } = input;
      const [updated] = await db
        .update(personGroups)
        .set({ ...rest, updatedAt: new Date() })
        .where(and(eq(personGroups.id, id), eq(personGroups.userId, ctx.user.userId)))
        .returning();
      return updated;
    }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      await db.delete(personGroups).where(and(eq(personGroups.id, input.id), eq(personGroups.userId, ctx.user.userId)));
      return { success: true };
    }),

    // Tasks tagged with a group, joined with goal context. Used by the group
    // filter view to surface tasks alongside people. Ownership enforced via
    // the parent goal — and via the group's userId for the membership row.
    getTasks: protectedProcedure.input(z.object({ groupId: z.string() })).query(async ({ input, ctx }) => {
      const [group] = await db
        .select({ id: personGroups.id })
        .from(personGroups)
        .where(and(eq(personGroups.id, input.groupId), eq(personGroups.userId, ctx.user.userId)))
        .limit(1);
      if (!group) return [];

      const rows = await db
        .select({
          taskId: tasks.id,
          taskTitle: tasks.title,
          completed: tasks.completed,
          difficulty: tasks.difficulty,
          scheduledAt: tasks.scheduledAt,
          goalId: goals.id,
          goalTitle: goals.title,
          goalEmoji: goals.emoji,
        })
        .from(tasksToGroups)
        .innerJoin(tasks, eq(tasksToGroups.taskId, tasks.id))
        .innerJoin(goals, eq(tasks.goalId, goals.id))
        .where(
          and(eq(tasksToGroups.groupId, input.groupId), eq(goals.userId, ctx.user.userId), eq(goals.status, "active")),
        );
      return rows;
    }),
  }),

  // Self space — one row per user, distinct from a Person
  self: createTRPCRouter({
    get: protectedProcedure.query(async ({ ctx }) => {
      const [row] = await db.select().from(userSelf).where(eq(userSelf.userId, ctx.user.userId)).limit(1);
      return row ?? null;
    }),

    update: protectedProcedure.input(updateSelfSchema).mutation(async ({ input, ctx }) => {
      const userId = ctx.user.userId;
      const [existing] = await db.select().from(userSelf).where(eq(userSelf.userId, userId)).limit(1);
      if (existing) {
        const [updated] = await db
          .update(userSelf)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(userSelf.userId, userId))
          .returning();
        return updated;
      }
      const [created] = await db
        .insert(userSelf)
        .values({ ...input, userId })
        .returning();
      return created;
    }),
  }),

  // Self list items — atomic rows for every list-shaped section on the Self
  // page (energizers, drainers, just-for-me, patterns, triggers, releases,
  // year-ahead). One table for all kinds keeps the surface small; the UI
  // groups by `kind` (and by `patternCategory` when kind = 'pattern').
  selfListItems: createTRPCRouter({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db
        .select()
        .from(selfListItems)
        .where(eq(selfListItems.userId, ctx.user.userId))
        .orderBy(asc(selfListItems.kind), asc(selfListItems.orderIdx), asc(selfListItems.createdAt));
    }),

    create: protectedProcedure.input(createSelfListItemSchema).mutation(async ({ input, ctx }) => {
      const userId = ctx.user.userId;
      // Append: new items land at the end of their kind's list.
      const aggRows = await db
        .select({ maxIdx: sql<number>`COALESCE(MAX(${selfListItems.orderIdx}), -1)` })
        .from(selfListItems)
        .where(and(eq(selfListItems.userId, userId), eq(selfListItems.kind, input.kind)));
      const nextOrderIdx = (aggRows[0]?.maxIdx ?? -1) + 1;
      const [created] = await db
        .insert(selfListItems)
        .values({
          userId,
          kind: input.kind,
          // pattern_category only meaningful when kind = 'pattern'; null
          // everywhere else regardless of what the client sent.
          patternCategory: input.kind === "pattern" ? (input.patternCategory ?? null) : null,
          content: input.content,
          orderIdx: nextOrderIdx,
        })
        .returning();
      return created;
    }),

    update: protectedProcedure.input(updateSelfListItemSchema).mutation(async ({ input, ctx }) => {
      const [row] = await db
        .select()
        .from(selfListItems)
        .where(and(eq(selfListItems.id, input.id), eq(selfListItems.userId, ctx.user.userId)))
        .limit(1);
      if (!row) throw new Error("Self list item not found or access denied");
      const patch: { content?: string; patternCategory?: typeof row.patternCategory; updatedAt: Date } = {
        updatedAt: new Date(),
      };
      if (input.content !== undefined) patch.content = input.content;
      if (input.patternCategory !== undefined) {
        patch.patternCategory = row.kind === "pattern" ? (input.patternCategory ?? null) : null;
      }
      const [updated] = await db.update(selfListItems).set(patch).where(eq(selfListItems.id, input.id)).returning();
      return updated;
    }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      await db
        .delete(selfListItems)
        .where(and(eq(selfListItems.id, input.id), eq(selfListItems.userId, ctx.user.userId)));
      return { success: true };
    }),

    reorder: protectedProcedure.input(reorderSelfListItemsSchema).mutation(async ({ input, ctx }) => {
      const userId = ctx.user.userId;
      // Atomic re-numbering. Each row update is gated on userId + kind so a
      // forged id from another kind/user is a no-op rather than a bypass.
      await db.transaction(async (tx) => {
        for (const { id, orderIdx } of input.ordering) {
          await tx
            .update(selfListItems)
            .set({ orderIdx, updatedAt: new Date() })
            .where(and(eq(selfListItems.id, id), eq(selfListItems.userId, userId), eq(selfListItems.kind, input.kind)));
        }
      });
      return { success: true };
    }),
  }),

  // Bids (formerly "gift ideas") — per-person list of actionable improvements
  // to the relationship. Each bid can have an optional deadline (`dueAt`) and a
  // completion timestamp (`completedAt`). Completed bids stay visible.
  nextBids: createTRPCRouter({
    list: protectedProcedure.input(z.object({ personId: z.string() })).query(async ({ input, ctx }) => {
      // Verify the person belongs to the user before returning rows.
      const [person] = await db
        .select({ id: people.id })
        .from(people)
        .where(and(eq(people.id, input.personId), eq(people.userId, ctx.user.userId)))
        .limit(1);
      if (!person) return [];
      return db.select().from(nextBids).where(eq(nextBids.personId, input.personId)).orderBy(asc(nextBids.createdAt));
    }),

    create: protectedProcedure.input(createNextBidSchema).mutation(async ({ input, ctx }) => {
      const [person] = await db
        .select({ id: people.id })
        .from(people)
        .where(and(eq(people.id, input.personId), eq(people.userId, ctx.user.userId)))
        .limit(1);
      if (!person) throw new Error("Person not found or access denied");
      const [created] = await db
        .insert(nextBids)
        .values({
          personId: input.personId,
          content: input.content,
          dueAt: input.dueAt ?? null,
        })
        .returning();
      return created;
    }),

    update: protectedProcedure.input(updateNextBidSchema).mutation(async ({ input, ctx }) => {
      const [row] = await db
        .select({ id: nextBids.id })
        .from(nextBids)
        .innerJoin(people, eq(nextBids.personId, people.id))
        .where(and(eq(nextBids.id, input.id), eq(people.userId, ctx.user.userId)))
        .limit(1);
      if (!row) throw new Error("Bid not found or access denied");
      const patch: { content?: string; dueAt?: Date | null } = {};
      if (input.content !== undefined) patch.content = input.content;
      if (input.dueAt !== undefined) patch.dueAt = input.dueAt;
      const [updated] = await db.update(nextBids).set(patch).where(eq(nextBids.id, input.id)).returning();
      return updated;
    }),

    setCompleted: protectedProcedure.input(setNextBidCompletedSchema).mutation(async ({ input, ctx }) => {
      const [row] = await db
        .select({ id: nextBids.id })
        .from(nextBids)
        .innerJoin(people, eq(nextBids.personId, people.id))
        .where(and(eq(nextBids.id, input.id), eq(people.userId, ctx.user.userId)))
        .limit(1);
      if (!row) throw new Error("Bid not found or access denied");
      const [updated] = await db
        .update(nextBids)
        .set({ completedAt: input.completed ? new Date() : null })
        .where(eq(nextBids.id, input.id))
        .returning();
      return updated;
    }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      // Verify ownership via JOIN through people, then delete by id.
      const [row] = await db
        .select({ id: nextBids.id })
        .from(nextBids)
        .innerJoin(people, eq(nextBids.personId, people.id))
        .where(and(eq(nextBids.id, input.id), eq(people.userId, ctx.user.userId)))
        .limit(1);
      if (!row) throw new Error("Bid not found or access denied");
      await db.delete(nextBids).where(eq(nextBids.id, input.id));
      return { success: true };
    }),

    // All upcoming open bids across the user's people, joined with the
    // person's name + emoji for inline rendering. Drives the unified
    // Pulse "Upcoming" feed. `withinDays` defaults to 60 — wider than
    // important dates (30) so bids that don't have a tight deadline still
    // surface as time approaches.
    listUpcoming: protectedProcedure
      .input(z.object({ withinDays: z.number().int().min(1).max(365).default(60) }).optional())
      .query(async ({ input, ctx }) => {
        const days = input?.withinDays ?? 60;
        const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        const rows = await db
          .select({
            id: nextBids.id,
            personId: nextBids.personId,
            content: nextBids.content,
            dueAt: nextBids.dueAt,
            completedAt: nextBids.completedAt,
            personName: people.name,
            personEmoji: people.emoji,
          })
          .from(nextBids)
          .innerJoin(people, eq(nextBids.personId, people.id))
          .where(and(eq(people.userId, ctx.user.userId), isNull(nextBids.completedAt), isNull(people.archivedAt)))
          .orderBy(asc(nextBids.dueAt));
        // Drizzle doesn't have a tidy "between" for nullable + bound, so
        // filter in JS — small N (per user, open bids only).
        return rows.filter((r) => r.dueAt !== null && r.dueAt.getTime() <= cutoff.getTime());
      }),
  }),

  // Important dates — yearly recurring (birthday, anniversary, …). Per-person.
  importantDates: createTRPCRouter({
    list: protectedProcedure.input(z.object({ personId: z.string() }).optional()).query(async ({ input, ctx }) => {
      if (input?.personId) {
        const [person] = await db
          .select({ id: people.id })
          .from(people)
          .where(and(eq(people.id, input.personId), eq(people.userId, ctx.user.userId)))
          .limit(1);
        if (!person) return [];
        return db
          .select()
          .from(importantDates)
          .where(eq(importantDates.personId, input.personId))
          .orderBy(asc(importantDates.month), asc(importantDates.day));
      }
      // No personId: return everything for this user across all their people.
      return db
        .select({
          id: importantDates.id,
          personId: importantDates.personId,
          label: importantDates.label,
          month: importantDates.month,
          day: importantDates.day,
          year: importantDates.year,
          createdAt: importantDates.createdAt,
          updatedAt: importantDates.updatedAt,
        })
        .from(importantDates)
        .innerJoin(people, eq(importantDates.personId, people.id))
        .where(eq(people.userId, ctx.user.userId))
        .orderBy(asc(importantDates.month), asc(importantDates.day));
    }),

    create: protectedProcedure.input(createImportantDateSchema).mutation(async ({ input, ctx }) => {
      const [person] = await db
        .select({ id: people.id })
        .from(people)
        .where(and(eq(people.id, input.personId), eq(people.userId, ctx.user.userId)))
        .limit(1);
      if (!person) throw new Error("Person not found or access denied");
      const [created] = await db
        .insert(importantDates)
        .values({
          personId: input.personId,
          label: input.label,
          month: input.month,
          day: input.day,
          year: input.year ?? null,
        })
        .returning();
      return created;
    }),

    update: protectedProcedure.input(updateImportantDateSchema).mutation(async ({ input, ctx }) => {
      const [row] = await db
        .select({ id: importantDates.id })
        .from(importantDates)
        .innerJoin(people, eq(importantDates.personId, people.id))
        .where(and(eq(importantDates.id, input.id), eq(people.userId, ctx.user.userId)))
        .limit(1);
      if (!row) throw new Error("Important date not found or access denied");
      const patch: { label?: string; month?: number; day?: number; year?: number | null; updatedAt?: Date } = {
        updatedAt: new Date(),
      };
      if (input.label !== undefined) patch.label = input.label;
      if (input.month !== undefined) patch.month = input.month;
      if (input.day !== undefined) patch.day = input.day;
      if (input.year !== undefined) patch.year = input.year;
      const [updated] = await db.update(importantDates).set(patch).where(eq(importantDates.id, input.id)).returning();
      return updated;
    }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      const [row] = await db
        .select({ id: importantDates.id })
        .from(importantDates)
        .innerJoin(people, eq(importantDates.personId, people.id))
        .where(and(eq(importantDates.id, input.id), eq(people.userId, ctx.user.userId)))
        .limit(1);
      if (!row) throw new Error("Important date not found or access denied");
      await db.delete(importantDates).where(eq(importantDates.id, input.id));
      return { success: true };
    }),
  }),

  // Bucket list — things the user wants to do before dying. Flat list, user-scoped.
  bucketList: createTRPCRouter({
    list: protectedProcedure.query(async ({ ctx }) => {
      const items = await db
        .select()
        .from(bucketListItems)
        .where(eq(bucketListItems.userId, ctx.user.userId))
        .orderBy(asc(bucketListItems.createdAt));
      if (items.length === 0) return [] as ((typeof items)[number] & { personIds: string[] })[];

      // Hydrate person links in a single query, then group by item id.
      const links = await db
        .select()
        .from(bucketListItemPeople)
        .where(
          inArray(
            bucketListItemPeople.bucketItemId,
            items.map((i) => i.id),
          ),
        );
      return items.map((it) => ({
        ...it,
        personIds: links.filter((l) => l.bucketItemId === it.id).map((l) => l.personId),
      }));
    }),

    create: protectedProcedure.input(createBucketListItemSchema).mutation(async ({ input, ctx }) => {
      const [created] = await db
        .insert(bucketListItems)
        .values({
          content: input.content,
          description: input.description ?? null,
          userId: ctx.user.userId,
        })
        .returning();
      if (!created) throw new Error("Failed to create item");
      if (input.personIds?.length) {
        await db
          .insert(bucketListItemPeople)
          .values(input.personIds.map((personId) => ({ bucketItemId: created.id, personId })));
      }
      return created;
    }),

    update: protectedProcedure.input(updateBucketListItemSchema).mutation(async ({ input, ctx }) => {
      const [updated] = await db
        .update(bucketListItems)
        .set({
          content: input.content,
          description: input.description ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(bucketListItems.id, input.id), eq(bucketListItems.userId, ctx.user.userId)))
        .returning();
      if (!updated) throw new Error("Item not found or access denied");

      // Replace the person link set if the caller provided one. `undefined` = leave unchanged.
      if (input.personIds !== undefined) {
        await db.delete(bucketListItemPeople).where(eq(bucketListItemPeople.bucketItemId, input.id));
        if (input.personIds.length > 0) {
          await db
            .insert(bucketListItemPeople)
            .values(input.personIds.map((personId) => ({ bucketItemId: input.id, personId })));
        }
      }
      return updated;
    }),

    // Toggle completion: pass `completed: true` to mark done (sets completedAt = now),
    // `false` to mark pending again (clears completedAt).
    toggleCompleted: protectedProcedure
      .input(z.object({ id: z.string(), completed: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const [updated] = await db
          .update(bucketListItems)
          .set({
            completedAt: input.completed ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(and(eq(bucketListItems.id, input.id), eq(bucketListItems.userId, ctx.user.userId)))
          .returning();
        if (!updated) throw new Error("Item not found or access denied");
        return updated;
      }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      await db
        .delete(bucketListItems)
        .where(and(eq(bucketListItems.id, input.id), eq(bucketListItems.userId, ctx.user.userId)));
      return { success: true };
    }),
  }),

  // Full-fidelity backup — exports everything the user owns (DB + files);
  // import wipes the user's data wholesale inside a tx, then rewrites files
  // under the new caller's userId. Schema is strict — no back-compat shims.
  backup: createTRPCRouter({
    export: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user.userId;

      const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!userRow) throw new Error("User not found");

      const valuesRows = await db.select().from(values).where(eq(values.userId, userId));
      const goalsRows = await db.select().from(goals).where(eq(goals.userId, userId));
      const goalIds = goalsRows.map((g) => g.id);

      const tasksRows = goalIds.length ? await db.select().from(tasks).where(inArray(tasks.goalId, goalIds)) : [];
      const connectionsRows = goalIds.length
        ? await db.select().from(connections).where(inArray(connections.source, goalIds))
        : [];
      const goalValuesRows = goalIds.length
        ? await db.select().from(goalValues).where(inArray(goalValues.goalId, goalIds))
        : [];

      // Tracking items are now user-owned — query by userId, not goalId.
      const trackingItemsRows = await db.select().from(trackingItems).where(eq(trackingItems.userId, userId));
      const trackingItemIds = trackingItemsRows.map((t) => t.id);

      const weeklySyncRows = await db.select().from(weeklySync).where(eq(weeklySync.userId, userId));
      const weeklySyncIds = weeklySyncRows.map((ws) => ws.id);

      const weeklySyncItemsRows = weeklySyncIds.length
        ? await db.select().from(weeklySyncItems).where(inArray(weeklySyncItems.weeklySyncId, weeklySyncIds))
        : [];
      const weeklySyncItemIds = weeklySyncItemsRows.map((wsi) => wsi.id);

      const syncTemplateRows = await db.select().from(syncTemplates).where(eq(syncTemplates.userId, userId));
      const syncTemplateIds = syncTemplateRows.map((t) => t.id);

      const syncTemplateItemRows = syncTemplateIds.length
        ? await db.select().from(syncTemplateItems).where(inArray(syncTemplateItems.templateId, syncTemplateIds))
        : [];

      const attachmentRows = weeklySyncItemIds.length
        ? await db
            .select()
            .from(attachments)
            .where(
              and(
                eq(attachments.userId, userId),
                eq(attachments.parentType, "weekly_sync_item"),
                inArray(attachments.parentId, weeklySyncItemIds),
              ),
            )
        : [];

      const peopleRows = await db.select().from(people).where(eq(people.userId, userId));
      const [userSelfRow] = await db.select().from(userSelf).where(eq(userSelf.userId, userId)).limit(1);
      const personGroupRows = await db.select().from(personGroups).where(eq(personGroups.userId, userId));
      const peopleToGroupsRows = peopleRows.length
        ? await db
            .select()
            .from(peopleToGroups)
            .where(
              inArray(
                peopleToGroups.personId,
                peopleRows.map((p) => p.id),
              ),
            )
        : [];

      const nextBidsRows = peopleRows.length
        ? await db
            .select()
            .from(nextBids)
            .where(
              inArray(
                nextBids.personId,
                peopleRows.map((p) => p.id),
              ),
            )
        : [];

      const bucketListRows = await db.select().from(bucketListItems).where(eq(bucketListItems.userId, userId));

      const selfListItemRows = await db.select().from(selfListItems).where(eq(selfListItems.userId, userId));

      const bucketListItemPeopleRows = bucketListRows.length
        ? await db
            .select()
            .from(bucketListItemPeople)
            .where(
              inArray(
                bucketListItemPeople.bucketItemId,
                bucketListRows.map((b) => b.id),
              ),
            )
        : [];

      const taskReferentsRows = goalIds.length
        ? await db
            .select({
              id: taskReferents.id,
              taskId: taskReferents.taskId,
              personId: taskReferents.personId,
              createdAt: taskReferents.createdAt,
            })
            .from(taskReferents)
            .innerJoin(tasks, eq(taskReferents.taskId, tasks.id))
            .where(inArray(tasks.goalId, goalIds))
        : [];

      const tasksToGroupsRows = goalIds.length
        ? await db
            .select({
              id: tasksToGroups.id,
              taskId: tasksToGroups.taskId,
              groupId: tasksToGroups.groupId,
              createdAt: tasksToGroups.createdAt,
            })
            .from(tasksToGroups)
            .innerJoin(tasks, eq(tasksToGroups.taskId, tasks.id))
            .where(inArray(tasks.goalId, goalIds))
        : [];

      // Read each attachment file off disk and base64-encode. Skip missing
      // files (deliver a partial backup rather than failing entirely).
      const files: { attachmentId: string; data: string }[] = [];
      for (const a of attachmentRows) {
        const abs = path.join(UPLOADS_ROOT, a.storagePath);
        try {
          const buf = await readFile(abs);
          files.push({ attachmentId: a.id, data: buf.toString("base64") });
        } catch {
          console.warn(`[backup.export] missing file skipped: ${a.storagePath}`);
        }
      }

      // Strip user-discriminator columns from rows that include them; the
      // import path inserts under whatever userId is in ctx.
      const stripUser = <T extends { userId?: string }>(row: T): Omit<T, "userId"> => {
        const rest: Record<string, unknown> = { ...row };
        delete rest.userId;
        return rest as Omit<T, "userId">;
      };

      return {
        version: 1 as const,
        exportedAt: new Date(),
        user: { name: userRow.name, email: userRow.email },
        values: valuesRows.map(stripUser),
        goals: goalsRows.map(stripUser),
        tasks: tasksRows,
        connections: connectionsRows,
        goalValues: goalValuesRows,
        trackingItems: trackingItemsRows.map(stripUser),
        weeklySync: weeklySyncRows.map(stripUser),
        weeklySyncItems: weeklySyncItemsRows,
        syncTemplates: syncTemplateRows.map(stripUser),
        syncTemplateItems: syncTemplateItemRows,
        attachments: attachmentRows.map(stripUser),
        files,
        people: peopleRows.map(stripUser),
        userSelf: userSelfRow ? stripUser(userSelfRow) : null,
        taskReferents: taskReferentsRows,
        personGroups: personGroupRows.map(stripUser),
        peopleToGroups: peopleToGroupsRows,
        tasksToGroups: tasksToGroupsRows,
        nextBids: nextBidsRows,
        bucketListItems: bucketListRows.map(stripUser),
        bucketListItemPeople: bucketListItemPeopleRows,
        selfListItems: selfListItemRows.map(stripUser),
        // Touched-but-unused — harmless extra context for v2 importers.
        _trackingItemIds: trackingItemIds,
      };
    }),

    import: protectedProcedure
      .input(
        z.object({
          backup: backupSchema,
          confirmReplace: z.literal(true),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const userId = ctx.user.userId;
        const b = input.backup;

        await db.transaction(async (tx) => {
          // Nuke. Cascades take care of children: tasks, connections,
          // goalValues, weeklySyncItems, syncTemplateItems, attachments
          // (via user_id on attachments), tracking_items, etc.
          await tx.delete(goals).where(eq(goals.userId, userId));
          await tx.delete(values).where(eq(values.userId, userId));
          await tx.delete(weeklySync).where(eq(weeklySync.userId, userId));
          await tx.delete(syncTemplates).where(eq(syncTemplates.userId, userId));
          await tx.delete(trackingItems).where(eq(trackingItems.userId, userId));
          await tx.delete(attachments).where(eq(attachments.userId, userId));
          await tx.delete(people).where(eq(people.userId, userId));
          await tx.delete(userSelf).where(eq(userSelf.userId, userId));
          await tx.delete(selfListItems).where(eq(selfListItems.userId, userId));
          await tx.delete(personGroups).where(eq(personGroups.userId, userId));
          await tx.delete(bucketListItems).where(eq(bucketListItems.userId, userId));

          if (b.values.length) {
            await tx.insert(values).values(b.values.map((v) => ({ ...v, userId })));
          }

          // Insert goals with parentId nulled first, then fix up parents in a
          // second pass — handles forward references in the export.
          if (b.goals.length) {
            await tx.insert(goals).values(
              b.goals.map((g) => ({
                id: g.id,
                title: g.title,
                description: g.description,
                emoji: g.emoji,
                parentId: null,
                positionX: g.positionX,
                positionY: g.positionY,
                status: g.status,
                userId,
                createdAt: g.createdAt,
                updatedAt: g.updatedAt,
              })),
            );
            for (const g of b.goals) {
              if (g.parentId) {
                await tx.update(goals).set({ parentId: g.parentId }).where(eq(goals.id, g.id));
              }
            }
          }

          if (b.tasks.length) await tx.insert(tasks).values(b.tasks);
          if (b.goalValues.length) await tx.insert(goalValues).values(b.goalValues);
          if (b.connections.length) await tx.insert(connections).values(b.connections);

          if (b.trackingItems.length) {
            await tx.insert(trackingItems).values(
              b.trackingItems.map((t) => ({
                ...t,
                userId,
              })),
            );
          }

          if (b.syncTemplates.length) {
            await tx.insert(syncTemplates).values(b.syncTemplates.map((t) => ({ ...t, userId })));
          }
          if (b.syncTemplateItems.length) {
            await tx.insert(syncTemplateItems).values(b.syncTemplateItems);
          }

          if (b.weeklySync.length) {
            await tx.insert(weeklySync).values(b.weeklySync.map((ws) => ({ ...ws, userId })));
          }
          if (b.weeklySyncItems.length) await tx.insert(weeklySyncItems).values(b.weeklySyncItems);

          // Attachments: keep ids, rewrite storage_path to land under the new
          // user. The on-disk write happens after the DB commit below; the
          // path stored here is the post-rewrite path.
          if (b.attachments.length) {
            await tx.insert(attachments).values(
              b.attachments.map((a) => {
                const ext = path.extname(a.fileName);
                return {
                  id: a.id,
                  userId,
                  parentType: a.parentType,
                  parentId: a.parentId,
                  fileName: a.fileName,
                  fileType: a.fileType,
                  storagePath: path.join(userId, "attachments", `${a.id}${ext}`),
                  sizeBytes: a.sizeBytes,
                  createdAt: a.createdAt,
                };
              }),
            );
          }

          if (b.people.length) {
            await tx.insert(people).values(b.people.map((p) => ({ ...p, userId })));
          }
          if (b.userSelf) {
            await tx.insert(userSelf).values({ ...b.userSelf, userId });
          }
          if (b.taskReferents.length) {
            await tx.insert(taskReferents).values(b.taskReferents);
          }
          if (b.personGroups.length) {
            await tx.insert(personGroups).values(b.personGroups.map((g) => ({ ...g, userId })));
          }
          if (b.peopleToGroups.length) {
            await tx.insert(peopleToGroups).values(b.peopleToGroups);
          }
          if (b.tasksToGroups.length) {
            await tx.insert(tasksToGroups).values(b.tasksToGroups);
          }
          if (b.nextBids.length) {
            await tx.insert(nextBids).values(b.nextBids);
          }
          if (b.bucketListItems.length) {
            await tx.insert(bucketListItems).values(b.bucketListItems.map((it) => ({ ...it, userId })));
          }
          if (b.bucketListItemPeople.length) {
            await tx.insert(bucketListItemPeople).values(b.bucketListItemPeople);
          }
          if (b.selfListItems.length) {
            await tx.insert(selfListItems).values(b.selfListItems.map((it) => ({ ...it, userId })));
          }
        });

        // Files land on disk after the DB commit. The new storage_path is
        // uploads/{userId}/attachments/{id}.{ext} — keyed only on user, no
        // goal/date in the tree.
        const fileFailures: string[] = [];
        for (const f of b.files) {
          const attachment = b.attachments.find((a) => a.id === f.attachmentId);
          if (!attachment) continue;
          const ext = path.extname(attachment.fileName);
          const relPath = path.join(userId, "attachments", `${attachment.id}${ext}`);
          const fullPath = path.join(UPLOADS_ROOT, relPath);
          try {
            const cleanBase64 = f.data.replace(/^data:[^;]+;base64,/, "");
            const buf = Buffer.from(cleanBase64, "base64");
            await mkdir(path.dirname(fullPath), { recursive: true });
            await writeFile(fullPath, buf);
          } catch (err) {
            console.error(`[backup.import] failed to write ${relPath}:`, err);
            fileFailures.push(relPath);
          }
        }

        return {
          success: true,
          counts: {
            values: b.values.length,
            goals: b.goals.length,
            tasks: b.tasks.length,
            connections: b.connections.length,
            goalValues: b.goalValues.length,
            trackingItems: b.trackingItems.length,
            weeklySync: b.weeklySync.length,
            weeklySyncItems: b.weeklySyncItems.length,
            syncTemplates: b.syncTemplates.length,
            syncTemplateItems: b.syncTemplateItems.length,
            attachments: b.attachments.length,
            files: b.files.length,
            people: b.people.length,
            userSelf: b.userSelf ? 1 : 0,
            taskReferents: b.taskReferents.length,
            personGroups: b.personGroups.length,
            peopleToGroups: b.peopleToGroups.length,
            tasksToGroups: b.tasksToGroups.length,
            selfListItems: b.selfListItems.length,
          },
          fileFailures,
        };
      }),
  }),
});
