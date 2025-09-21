import { z } from "zod";
import { eq, and, asc, isNull, gte, lte } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { db } from "../../data";
import {
  values,
  goals,
  tasks,
  connections,
  goalValues,
  trackingItems,
  weeklySync,
  weeklySyncItems,
  weeklySyncItemFiles
} from "../../data/schema";
import {
  createValueSchema,
  updateValueSchema,
  createGoalSchema,
  updateGoalSchema,
  createTaskSchema,
  updateTaskSchema,
  createConnectionSchema,
  updateConnectionSchema,
  createTrackingItemSchema,
  updateTrackingItemSchema,
  createWeeklySyncSchema,
  updateWeeklySyncSchema,
  createWeeklySyncItemSchema,
  updateWeeklySyncItemSchema,
  createWeeklySyncItemFileSchema,
  updateWeeklySyncItemFileSchema,
  type Goal,
  type TrackingItem,
  type WeeklySync,
  type WeeklySyncItem,
  type WeeklySyncItemFile,
} from "../types";
import {
  saveImageToFile,
  deleteImageFile,
  isValidBase64Image,
  saveWeeklySyncFile,
  saveOrUpdateTextFile,
  readTextFile,
  readTrackingItemTextFile,
  getTextFilePath,
  deleteFile,
  type FileUploadResult
} from "../../image-upload";

export const goalsRouter = createTRPCRouter({
  // Values operations
  values: createTRPCRouter({
    getAll: protectedProcedure.query(async ({ ctx }) => {
      return await db.select().from(values).where(eq(values.userId, ctx.user.userId));
    }),

    create: protectedProcedure
      .input(createValueSchema)
      .mutation(async ({ input, ctx }) => {
        const [newValue] = await db
          .insert(values)
          .values({ ...input, userId: ctx.user.userId })
          .returning();
        if (!newValue) {
          throw new Error("Failed to create value");
        }
        return newValue;
      }),

    update: protectedProcedure
      .input(updateValueSchema)
      .mutation(async ({ input, ctx }) => {
        const { id, ...updateData } = input;
        const [updatedValue] = await db
          .update(values)
          .set({ ...updateData, updatedAt: new Date() })
          .where(and(eq(values.id, id), eq(values.userId, ctx.user.userId)))
          .returning();
        return updatedValue;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await db.delete(goalValues).where(eq(goalValues.valueId, input.id));
        await db.delete(values).where(and(eq(values.id, input.id), eq(values.userId, ctx.user.userId)));
        return { success: true };
      }),
  }),

  // Goals operations
  goals: createTRPCRouter({
    getAll: protectedProcedure.query(async ({ ctx }): Promise<Goal[]> => {
      const goalsData = await db.select().from(goals).where(eq(goals.userId, ctx.user.userId));
      const goalIds = goalsData.map(g => g.id);

      // Get all tasks for user's goals
      const tasksData = await db
        .select()
        .from(tasks)
        .innerJoin(goals, eq(tasks.goalId, goals.id))
        .where(eq(goals.userId, ctx.user.userId));

      // Get all goal-value relationships for user's goals
      const goalValuesData = await db
        .select()
        .from(goalValues)
        .innerJoin(goals, eq(goalValues.goalId, goals.id))
        .where(eq(goals.userId, ctx.user.userId));

      // Get all connections for user's goals
      const connectionsData = goalIds.length > 0 ? await db
        .select()
        .from(connections)
        .innerJoin(goals, eq(connections.source, goals.id))
        .where(eq(goals.userId, ctx.user.userId)) : [];

      // Helper function to calculate importance based on outgoing connections
      const calculateImportance = (goalId: string): "Low" | "Medium" | "High" => {
        const outgoingConnections = connectionsData
          .filter(item => item.connections.source === goalId)
          .map(item => item.connections);

        if (outgoingConnections.length === 0) return "Low";

        const totalWeight = outgoingConnections.reduce((sum, conn) => sum + conn.weight, 0);
        const averageWeight = totalWeight / outgoingConnections.length;

        if (averageWeight <= 33.3) return "Low";
        if (averageWeight < 66.6) return "Medium";
        return "High"; // averageWeight <= 100
      };

      return goalsData.map(goal => ({
        id: goal.id,
        title: goal.title,
        description: goal.description,
        parentId: goal.parentId || undefined,
        position: { x: goal.positionX, y: goal.positionY },
        importance: calculateImportance(goal.id),
        valueIds: goalValuesData
          .filter(item => item.goal_values.goalId === goal.id)
          .map(item => item.goal_values.valueId),
        tasks: tasksData
          .filter(item => item.tasks.goalId === goal.id)
          .map(item => ({
            id: item.tasks.id,
            title: item.tasks.title,
            difficulty: item.tasks.difficulty as 1 | 2 | 3,
            completed: item.tasks.completed,
          })),
      }));
    }),

    create: protectedProcedure
      .input(createGoalSchema)
      .mutation(async ({ input, ctx }) => {
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
            valueIds.map(valueId => ({
              goalId: newGoal.id,
              valueId,
            }))
          );
        }

        // Insert tasks
        if (inputTasks.length > 0) {
          await db.insert(tasks).values(
            inputTasks.map(task => ({
              ...task,
              goalId: newGoal.id,
            }))
          );
        }

        return newGoal;
      }),

    update: protectedProcedure
      .input(updateGoalSchema)
      .mutation(async ({ input, ctx }) => {
        const { id, valueIds, tasks: inputTasks, position, ...goalData } = input;

        // Update goal
        if (Object.keys(goalData).length > 0 || position) {
          const updateData = { ...goalData, updatedAt: new Date() } as any;
          if (position) {
            updateData.positionX = position.x;
            updateData.positionY = position.y;
          }
          await db.update(goals).set(updateData).where(and(eq(goals.id, id), eq(goals.userId, ctx.user.userId)));
        }

        // Update value associations if provided
        if (valueIds !== undefined) {
          // First verify the goal belongs to the user
          const goalExists = await db.select().from(goals).where(and(eq(goals.id, id), eq(goals.userId, ctx.user.userId))).limit(1);
          if (goalExists.length === 0) throw new Error("Goal not found or access denied");

          await db.delete(goalValues).where(eq(goalValues.goalId, id));
          if (valueIds.length > 0) {
            await db.insert(goalValues).values(
              valueIds.map(valueId => ({
                goalId: id,
                valueId,
              }))
            );
          }
        }

        // Update tasks if provided
        if (inputTasks !== undefined) {
          await db.delete(tasks).where(eq(tasks.goalId, id));
          if (inputTasks.length > 0) {
            await db.insert(tasks).values(
              inputTasks.map(task => ({
                ...task,
                goalId: id,
              }))
            );
          }
        }

        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await db.delete(goals).where(and(eq(goals.id, input.id), eq(goals.userId, ctx.user.userId)));
        return { success: true };
      }),
  }),

  // Tasks operations
  tasks: createTRPCRouter({
    create: protectedProcedure
      .input(createTaskSchema.extend({ goalId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        // Verify the goal belongs to the user before creating task
        const goalExists = await db.select().from(goals).where(and(eq(goals.id, input.goalId), eq(goals.userId, ctx.user.userId))).limit(1);
        if (goalExists.length === 0) throw new Error("Goal not found or access denied");

        const [newTask] = await db.insert(tasks).values(input).returning();
        if (!newTask) {
          throw new Error("Failed to create task");
        }
        return newTask;
      }),

    update: protectedProcedure
      .input(updateTaskSchema.extend({ goalId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { id, goalId, ...updateData } = input;
        // Verify the goal belongs to the user
        const goalExists = await db.select().from(goals).where(and(eq(goals.id, goalId), eq(goals.userId, ctx.user.userId))).limit(1);
        if (goalExists.length === 0) throw new Error("Goal not found or access denied");

        const [updatedTask] = await db
          .update(tasks)
          .set({ ...updateData, updatedAt: new Date() })
          .where(and(eq(tasks.id, id), eq(tasks.goalId, goalId)))
          .returning();
        return updatedTask;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string(), goalId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        // Verify the goal belongs to the user
        const goalExists = await db.select().from(goals).where(and(eq(goals.id, input.goalId), eq(goals.userId, ctx.user.userId))).limit(1);
        if (goalExists.length === 0) throw new Error("Goal not found or access denied");

        await db.delete(tasks).where(
          and(eq(tasks.id, input.id), eq(tasks.goalId, input.goalId))
        );
        return { success: true };
      }),
  }),

  // Connections operations
  connections: createTRPCRouter({
    getAll: protectedProcedure.query(async ({ ctx }) => {
      // Get connections where both source and target goals belong to the user
      return await db
        .select()
        .from(connections)
        .innerJoin(goals, eq(connections.source, goals.id))
        .where(eq(goals.userId, ctx.user.userId));
    }),

    create: protectedProcedure
      .input(createConnectionSchema)
      .mutation(async ({ input, ctx }) => {
        // Verify both source and target goals belong to the user
        const sourceGoal = await db.select().from(goals).where(and(eq(goals.id, input.source), eq(goals.userId, ctx.user.userId))).limit(1);
        const targetGoal = await db.select().from(goals).where(and(eq(goals.id, input.target), eq(goals.userId, ctx.user.userId))).limit(1);

        if (sourceGoal.length === 0 || targetGoal.length === 0) {
          throw new Error("Source or target goal not found or access denied");
        }

        const [newConnection] = await db.insert(connections).values(input).returning();
        if (!newConnection) {
          throw new Error("Failed to create connection");
        }
        return newConnection;
      }),

    update: protectedProcedure
      .input(updateConnectionSchema)
      .mutation(async ({ input, ctx }) => {
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

    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
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

  // Tracking Items operations
  trackingItems: createTRPCRouter({
    getAll: protectedProcedure
      .input(z.object({ goalId: z.string() }))
      .query(async ({ input, ctx }): Promise<TrackingItem[]> => {
        // Verify the goal belongs to the user
        const goalExists = await db.select().from(goals).where(and(eq(goals.id, input.goalId), eq(goals.userId, ctx.user.userId))).limit(1);
        if (goalExists.length === 0) throw new Error("Goal not found or access denied");

        const items = await db
          .select()
          .from(trackingItems)
          .where(and(eq(trackingItems.goalId, input.goalId), isNull(trackingItems.deletedAt)))
          .orderBy(asc(trackingItems.order), asc(trackingItems.createdAt));

        // Map database result to match TypeScript type (null -> undefined)
        return items.map(item => ({
          id: item.id,
          goalId: item.goalId,
          title: item.title,
          description: item.description || undefined,
          order: item.order,
        }));
      }),

    create: protectedProcedure
      .input(createTrackingItemSchema)
      .mutation(async ({ input, ctx }) => {
        // Verify the goal belongs to the user
        const goalExists = await db.select().from(goals).where(and(eq(goals.id, input.goalId), eq(goals.userId, ctx.user.userId))).limit(1);
        if (goalExists.length === 0) throw new Error("Goal not found or access denied");

        const [newTrackingItem] = await db
          .insert(trackingItems)
          .values(input)
          .returning();

        if (!newTrackingItem) {
          throw new Error("Failed to create tracking item");
        }

        return newTrackingItem;
      }),

    update: protectedProcedure
      .input(updateTrackingItemSchema)
      .mutation(async ({ input, ctx }) => {
        const { id, ...updateData } = input;

        // Verify the tracking item belongs to a goal owned by the user
        const trackingItemWithGoal = await db
          .select()
          .from(trackingItems)
          .innerJoin(goals, eq(trackingItems.goalId, goals.id))
          .where(and(eq(trackingItems.id, id), eq(goals.userId, ctx.user.userId)))
          .limit(1);

        if (trackingItemWithGoal.length === 0) {
          throw new Error("Tracking item not found or access denied");
        }

        const [updatedTrackingItem] = await db
          .update(trackingItems)
          .set({ ...updateData, updatedAt: new Date() })
          .where(eq(trackingItems.id, id))
          .returning();

        return updatedTrackingItem;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        // Verify the tracking item belongs to a goal owned by the user
        const trackingItemWithGoal = await db
          .select()
          .from(trackingItems)
          .innerJoin(goals, eq(trackingItems.goalId, goals.id))
          .where(and(eq(trackingItems.id, input.id), eq(goals.userId, ctx.user.userId)))
          .limit(1);

        if (trackingItemWithGoal.length === 0) {
          throw new Error("Tracking item not found or access denied");
        }

        // Check if tracking item has associated weekly sync items
        const hasWeeklySyncItems = await db
          .select()
          .from(weeklySyncItems)
          .where(eq(weeklySyncItems.trackingItemId, input.id))
          .limit(1);

        if (hasWeeklySyncItems.length > 0) {
          // Soft delete - mark as deleted but preserve data
          await db
            .update(trackingItems)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(eq(trackingItems.id, input.id));

          return { success: true, type: "soft_delete" };
        } else {
          // Hard delete - actually remove from database
          await db.delete(trackingItems).where(eq(trackingItems.id, input.id));

          return { success: true, type: "hard_delete" };
        }
      }),
  }),

  // Weekly Sync operations
  weeklySync: createTRPCRouter({
    // Get weekly sync for a specific week (Monday-Sunday based on creation date)
    getByWeek: protectedProcedure
      .input(z.object({ weekStart: z.date() }))
      .query(async ({ input, ctx }) => {
        const weekEnd = new Date(input.weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const [syncRecord] = await db
          .select()
          .from(weeklySync)
          .where(
            and(
              eq(weeklySync.userId, ctx.user.userId),
              and(
                gte(weeklySync.createdAt, input.weekStart),
                lte(weeklySync.createdAt, weekEnd)
              )
            )
          )
          .limit(1);

        return syncRecord || null;
      }),

    // Create weekly sync for current week
    create: protectedProcedure
      .input(createWeeklySyncSchema)
      .mutation(async ({ input, ctx }) => {
        const [newWeeklySync] = await db
          .insert(weeklySync)
          .values({ ...input, userId: ctx.user.userId })
          .returning();

        if (!newWeeklySync) {
          throw new Error("Failed to create weekly sync");
        }

        return newWeeklySync;
      }),

    // Delete weekly sync
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        // Verify ownership
        const [existingSync] = await db
          .select()
          .from(weeklySync)
          .where(and(eq(weeklySync.id, input.id), eq(weeklySync.userId, ctx.user.userId)))
          .limit(1);

        if (!existingSync) {
          throw new Error("Weekly sync not found or access denied");
        }

        await db.delete(weeklySync).where(eq(weeklySync.id, input.id));
        return { success: true };
      }),
  }),

  // Weekly Sync Items operations
  weeklySyncItems: createTRPCRouter({
    // Get all sync items for a weekly sync
    getByWeeklySync: protectedProcedure
      .input(z.object({ weeklySyncId: z.string() }))
      .query(async ({ input, ctx }) => {
        return await db
          .select()
          .from(weeklySyncItems)
          .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
          .where(
            and(
              eq(weeklySyncItems.weeklySyncId, input.weeklySyncId),
              eq(weeklySync.userId, ctx.user.userId)
            )
          );
      }),

    // Create weekly sync item
    create: protectedProcedure
      .input(createWeeklySyncItemSchema)
      .mutation(async ({ input, ctx }) => {
        // Verify weekly sync ownership
        const [existingSync] = await db
          .select()
          .from(weeklySync)
          .where(and(eq(weeklySync.id, input.weeklySyncId), eq(weeklySync.userId, ctx.user.userId)))
          .limit(1);

        if (!existingSync) {
          throw new Error("Weekly sync not found or access denied");
        }

        const [newSyncItem] = await db
          .insert(weeklySyncItems)
          .values(input)
          .returning();

        if (!newSyncItem) {
          throw new Error("Failed to create weekly sync item");
        }

        return newSyncItem;
      }),

    // Delete weekly sync item
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        // Verify ownership through weekly sync
        const [existingItem] = await db
          .select()
          .from(weeklySyncItems)
          .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
          .where(
            and(
              eq(weeklySyncItems.id, input.id),
              eq(weeklySync.userId, ctx.user.userId)
            )
          )
          .limit(1);

        if (!existingItem) {
          throw new Error("Weekly sync item not found or access denied");
        }

        await db.delete(weeklySyncItems).where(eq(weeklySyncItems.id, input.id));
        return { success: true };
      }),
  }),

  // Weekly Sync Item Files operations
  weeklySyncItemFiles: createTRPCRouter({
    // Get all files for a sync item
    getBySyncItem: protectedProcedure
      .input(z.object({ weeklySyncItemId: z.string() }))
      .query(async ({ input, ctx }) => {
        return await db
          .select()
          .from(weeklySyncItemFiles)
          .innerJoin(weeklySyncItems, eq(weeklySyncItemFiles.weeklySyncItemId, weeklySyncItems.id))
          .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
          .where(
            and(
              eq(weeklySyncItemFiles.weeklySyncItemId, input.weeklySyncItemId),
              eq(weeklySync.userId, ctx.user.userId)
            )
          );
      }),

    // Create file for sync item
    create: protectedProcedure
      .input(createWeeklySyncItemFileSchema)
      .mutation(async ({ input, ctx }) => {
        // Verify ownership through weekly sync
        const [existingItem] = await db
          .select()
          .from(weeklySyncItems)
          .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
          .where(
            and(
              eq(weeklySyncItems.id, input.weeklySyncItemId),
              eq(weeklySync.userId, ctx.user.userId)
            )
          )
          .limit(1);

        if (!existingItem) {
          throw new Error("Weekly sync item not found or access denied");
        }

        const [newFile] = await db
          .insert(weeklySyncItemFiles)
          .values(input)
          .returning();

        if (!newFile) {
          throw new Error("Failed to create file record");
        }

        return newFile;
      }),

    // Delete file
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        // Verify ownership through weekly sync
        const [existingFile] = await db
          .select()
          .from(weeklySyncItemFiles)
          .innerJoin(weeklySyncItems, eq(weeklySyncItemFiles.weeklySyncItemId, weeklySyncItems.id))
          .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
          .where(
            and(
              eq(weeklySyncItemFiles.id, input.id),
              eq(weeklySync.userId, ctx.user.userId)
            )
          )
          .limit(1);

        if (!existingFile) {
          throw new Error("File not found or access denied");
        }

        await db.delete(weeklySyncItemFiles).where(eq(weeklySyncItemFiles.id, input.id));
        return { success: true };
      }),
  }),

  // Data operations (for importing/exporting)
  data: createTRPCRouter({
    getAll: protectedProcedure.query(async ({ ctx }) => {
      const valuesData = await db.select().from(values).where(eq(values.userId, ctx.user.userId));
      const goalsData = await db.select().from(goals).where(eq(goals.userId, ctx.user.userId));

      // Get tasks for user's goals only
      const goalIds = goalsData.map(g => g.id);
      const tasksData = goalIds.length > 0 ? await db.select().from(tasks).innerJoin(goals, eq(tasks.goalId, goals.id)).where(eq(goals.userId, ctx.user.userId)) : [];

      // Get connections for user's goals only
      const connectionsData = goalIds.length > 0 ? await db.select().from(connections).innerJoin(goals, eq(connections.source, goals.id)).where(eq(goals.userId, ctx.user.userId)) : [];

      // Get goal-value relationships for user's goals only
      const goalValuesData = goalIds.length > 0 ? await db.select().from(goalValues).innerJoin(goals, eq(goalValues.goalId, goals.id)).where(eq(goals.userId, ctx.user.userId)) : [];

      // Helper function to calculate importance based on outgoing connections
      const calculateImportance = (goalId: string): "Low" | "Medium" | "High" => {
        const outgoingConnections = connectionsData
          .filter(item => item.connections.source === goalId)
          .map(item => item.connections);

        if (outgoingConnections.length === 0) return "Low";

        const totalWeight = outgoingConnections.reduce((sum, conn) => sum + conn.weight, 0);
        const averageWeight = totalWeight / outgoingConnections.length;

        if (averageWeight <= 33.3) return "Low";
        if (averageWeight < 66.6) return "Medium";
        return "High"; // averageWeight <= 100
      };

      const mappedGoals: Goal[] = goalsData.map(goal => ({
        id: goal.id,
        title: goal.title,
        description: goal.description,
        parentId: goal.parentId || undefined,
        position: { x: goal.positionX, y: goal.positionY },
        importance: calculateImportance(goal.id),
        valueIds: goalValuesData
          .filter(item => item.goal_values.goalId === goal.id)
          .map(item => item.goal_values.valueId),
        tasks: tasksData
          .filter(item => item.tasks.goalId === goal.id)
          .map(item => ({
            id: item.tasks.id,
            title: item.tasks.title,
            difficulty: item.tasks.difficulty as 1 | 2 | 3,
            completed: item.tasks.completed,
          })),
      }));

      return {
        values: valuesData,
        goals: mappedGoals,
        connections: connectionsData.map(item => item.connections),
      };
    }),
  }),

  // Image operations
  images: createTRPCRouter({
    upload: protectedProcedure
      .input(z.object({
        base64Data: z.string(),
        fileName: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Validate base64 image
        if (!isValidBase64Image(input.base64Data)) {
          throw new Error("Invalid base64 image data");
        }

        // Save image to file system
        const result = await saveImageToFile(
          input.base64Data,
          ctx.user.userId,
          ctx.user.userName,
          input.fileName
        );

        return {
          url: result.url,
          fileName: result.fileName,
          filePath: result.filePath,
        };
      }),

    uploadMultiple: protectedProcedure
      .input(z.object({
        images: z.array(z.object({
          base64Data: z.string(),
          fileName: z.string().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const results = [];

        for (const image of input.images) {
          // Validate base64 image
          if (!isValidBase64Image(image.base64Data)) {
            throw new Error(`Invalid base64 image data for ${image.fileName || "unknown file"}`);
          }

          // Save image to file system
          const result = await saveImageToFile(
            image.base64Data,
            ctx.user.userId,
            ctx.user.userName,
            image.fileName
          );
          results.push({
            url: result.url,
            fileName: result.fileName,
            filePath: result.filePath,
          });
        }

        return results;
      }),

    // Upload file for weekly sync (images or documents)
    uploadWeeklySyncFile: protectedProcedure
      .input(z.object({
        data: z.string(),
        goalId: z.string(),
        trackingItemId: z.string(),
        fileName: z.string().optional(),
        isText: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!input.isText) {
          // Validate base64 data for non-text files
          if (!isValidBase64Image(input.data)) {
            throw new Error("Invalid base64 data");
          }
        }

        // Save file to weekly sync structure
        const result = await saveWeeklySyncFile(
          input.data,
          ctx.user.userId,
          ctx.user.userName,
          input.goalId,
          input.trackingItemId,
          input.fileName,
          input.isText
        );

        return {
          url: result.url,
          fileName: result.fileName,
          filePath: result.filePath,
          fileType: result.fileType,
        };
      }),

    // Save or update text file for weekly sync
    saveTextFile: protectedProcedure
      .input(z.object({
        content: z.string(),
        goalId: z.string(),
        trackingItemId: z.string(),
        existingFileName: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await saveOrUpdateTextFile(
          input.content,
          ctx.user.userId,
          ctx.user.userName,
          input.goalId,
          input.trackingItemId,
          input.existingFileName
        );

        return {
          url: result.url,
          fileName: result.fileName,
          filePath: result.filePath,
          fileType: result.fileType,
        };
      }),

    // Read text file content by file path
    readTextFile: protectedProcedure
      .input(z.object({
        filePath: z.string(),
      }))
      .query(async ({ input, ctx }) => {
        // Verify the file path belongs to the user (new structure only)
        const expectedUserFolder = `uploads/${ctx.user.userId}`;

        if (!input.filePath.startsWith(expectedUserFolder)) {
          throw new Error("Access denied: File does not belong to user");
        }

        const content = await readTextFile(input.filePath);

        if (content === null) {
          throw new Error("File not found or unable to read");
        }

        return { content };
      }),

    // Read text file content for a tracking item (recommended approach)
    readTrackingItemText: protectedProcedure
      .input(z.object({
        goalId: z.string(),
        trackingItemId: z.string(),
        date: z.date().optional(),
      }))
      .query(async ({ input, ctx }) => {
        // Verify the goal belongs to the user
        const goalExists = await db
          .select()
          .from(goals)
          .where(and(eq(goals.id, input.goalId), eq(goals.userId, ctx.user.userId)))
          .limit(1);

        if (goalExists.length === 0) {
          throw new Error("Goal not found or access denied");
        }

        // Verify the tracking item belongs to the goal
        const trackingItemExists = await db
          .select()
          .from(trackingItems)
          .where(and(eq(trackingItems.id, input.trackingItemId), eq(trackingItems.goalId, input.goalId)))
          .limit(1);

        if (trackingItemExists.length === 0) {
          throw new Error("Tracking item not found or access denied");
        }

        const content = await readTrackingItemTextFile(
          ctx.user.userId,
          input.goalId,
          input.trackingItemId,
          input.date
        );

        if (content === null) {
          // Return empty content instead of error for better UX
          return {
            content: "",
            filePath: getTextFilePath(ctx.user.userId, input.goalId, input.trackingItemId, input.date)
          };
        }

        return {
          content,
          filePath: getTextFilePath(ctx.user.userId, input.goalId, input.trackingItemId, input.date)
        };
      }),

    delete: protectedProcedure
      .input(z.object({
        filePath: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Verify the file path belongs to the user (check if path contains user ID)
        const sanitizedUserName = ctx.user.userName.replace(/[^a-zA-Z0-9_-]/g, "_");
        const expectedUserFolder = `uploads/${ctx.user.userId}_${sanitizedUserName}`;

        if (!input.filePath.startsWith(expectedUserFolder)) {
          throw new Error("Access denied: File does not belong to user");
        }

        const success = await deleteFile(input.filePath);

        if (!success) {
          throw new Error("Failed to delete image file");
        }

        return { success: true };
      }),
  }),
});