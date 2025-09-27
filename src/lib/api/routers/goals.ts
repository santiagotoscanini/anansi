import { z } from "zod";
import { eq, and, asc, isNull, gte, lte, inArray } from "drizzle-orm";
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
  weeklySyncItemFiles,
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
  createWeeklySyncItemSchema,
  createWeeklySyncItemFileSchema,
  type Goal,
  type TrackingItem,
} from "../types";
import {
  isValidBase64Image,
  saveWeeklySyncFile,
  saveOrUpdateTextFile,
  readTextFile,
  readTrackingItemTextFile,
  getTextFilePath,
  deleteFile,
} from "../../image-upload";
import { log } from "console";
import path from "path";

// Helper function to generate timestamped filename for collision prevention
function generateTimestampedFileName(originalFileName: string): string {
  const timestamp = Date.now();
  const { name, ext } = path.parse(originalFileName);
  return `${timestamp}_${name}${ext}`;
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

  // Goals operations
  goals: createTRPCRouter({
    getAll: protectedProcedure.query(async ({ ctx }): Promise<Goal[]> => {
      const goalsData = await db.select().from(goals).where(and(eq(goals.userId, ctx.user.userId), eq(goals.status, "active")));
      const goalIds = goalsData.map((g) => g.id);

      // Get all tasks for user's goals
      const tasksData = await db
        .select()
        .from(tasks)
        .innerJoin(goals, eq(tasks.goalId, goals.id))
        .where(and(eq(goals.userId, ctx.user.userId), eq(goals.status, "active")));

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
        parentId: goal.parentId || undefined,
        position: { x: goal.positionX, y: goal.positionY },
        importance: calculateImportance(goal.id),
        status: goal.status as "active" | "archived",
        valueIds: goalValuesData
          .filter((item) => item.goal_values.goalId === goal.id)
          .map((item) => item.goal_values.valueId),
        tasks: tasksData
          .filter((item) => item.tasks.goalId === goal.id)
          .map((item) => ({
            id: item.tasks.id,
            title: item.tasks.title,
            difficulty: item.tasks.difficulty as 1 | 2 | 3,
            completed: item.tasks.completed,
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

      // Insert tasks
      if (inputTasks.length > 0) {
        await db.insert(tasks).values(
          inputTasks.map((task) => ({
            ...task,
            goalId: newGoal.id,
          })),
        );
      }

      return newGoal;
    }),

    update: protectedProcedure.input(updateGoalSchema).mutation(async ({ input, ctx }) => {
      const { id, valueIds, tasks: inputTasks, position, ...goalData } = input;

      // Update goal
      if (Object.keys(goalData).length > 0 || position) {
        const updateData = { ...goalData, updatedAt: new Date() } as any;
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

      // Update tasks if provided
      if (inputTasks !== undefined) {
        await db.delete(tasks).where(eq(tasks.goalId, id));
        if (inputTasks.length > 0) {
          await db.insert(tasks).values(
            inputTasks.map((task) => ({
              ...task,
              goalId: id,
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
        if (goalExists.length === 0) throw new Error("Goal not found or access denied");

        // Archive the goal (set status to "archived")
        await tx
          .update(goals)
          .set({ status: "archived", updatedAt: new Date() })
          .where(eq(goals.id, input.id));

        // Delete all connections where this goal is either source or target
        await tx
          .delete(connections)
          .where(eq(connections.source, input.id));

        await tx
          .delete(connections)
          .where(eq(connections.target, input.id));

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
        .where(and(
          eq(sourceGoals.userId, ctx.user.userId),
          eq(targetGoals.userId, ctx.user.userId),
          eq(sourceGoals.status, "active"),
          eq(targetGoals.status, "active")
        ));
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

  // Tracking Items operations
  trackingItems: createTRPCRouter({
    getAll: protectedProcedure
      .input(z.object({ goalId: z.string() }))
      .query(async ({ input, ctx }): Promise<TrackingItem[]> => {
        // Verify the goal belongs to the user
        const goalExists = await db
          .select()
          .from(goals)
          .where(and(eq(goals.id, input.goalId), eq(goals.userId, ctx.user.userId)))
          .limit(1);
        if (goalExists.length === 0) throw new Error("Goal not found or access denied");

        const items = await db
          .select()
          .from(trackingItems)
          .where(and(eq(trackingItems.goalId, input.goalId), isNull(trackingItems.deletedAt), eq(trackingItems.status, "active")))
          .orderBy(asc(trackingItems.order), asc(trackingItems.createdAt));

        // Map database result to match TypeScript type (null -> undefined)
        return items.map((item) => ({
          id: item.id,
          goalId: item.goalId,
          title: item.title,
          description: item.description || undefined,
          order: item.order,
          status: item.status as "active" | "archived",
          deletedAt: item.deletedAt || undefined,
        }));
      }),

    create: protectedProcedure.input(createTrackingItemSchema).mutation(async ({ input, ctx }) => {
      // Verify the goal belongs to the user
      const goalExists = await db
        .select()
        .from(goals)
        .where(and(eq(goals.id, input.goalId), eq(goals.userId, ctx.user.userId)))
        .limit(1);
      if (goalExists.length === 0) throw new Error("Goal not found or access denied");

      const [newTrackingItem] = await db.insert(trackingItems).values(input).returning();

      if (!newTrackingItem) {
        throw new Error("Failed to create tracking item");
      }

      return newTrackingItem;
    }),

    update: protectedProcedure.input(updateTrackingItemSchema).mutation(async ({ input, ctx }) => {
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

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
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
    getByWeek: protectedProcedure.input(z.object({ weekStart: z.date() })).query(async ({ input, ctx }) => {
      const [syncRecord] = await db
        .select()
        .from(weeklySync)
        .where(and(eq(weeklySync.userId, ctx.user.userId), eq(weeklySync.weekDate, input.weekStart)))
        .limit(1);

      return syncRecord || null;
    }),

    // Get complete weekly retrospective data in a single optimized query
    getWeeklyRetrospectiveData: protectedProcedure
      .input(z.object({ weekStart: z.date() }))
      .query(async ({ input, ctx }) => {
        // Get weekly sync
        const [weeklySyncRecord] = await db
          .select()
          .from(weeklySync)
          .where(and(eq(weeklySync.userId, ctx.user.userId), eq(weeklySync.weekDate, input.weekStart)))
          .limit(1);

        // Get all active goals with their tracking items for this user
        const goalsData = await db.select().from(goals).where(and(eq(goals.userId, ctx.user.userId), eq(goals.status, "active")));

        // Get all tracking items for user's goals
        const goalIds = goalsData.map((g) => g.id);
        let trackingItemsData: any[] = [];

        if (goalIds.length > 0) {
          trackingItemsData = await db.select().from(trackingItems).where(and(inArray(trackingItems.goalId, goalIds), eq(trackingItems.status, "active")));
        }

        // Get weekly sync items if weekly sync exists
        let weeklySyncItemsData: any[] = [];
        let weeklySyncItemFilesData: any[] = [];

        if (weeklySyncRecord) {
          // Get weekly sync items
          weeklySyncItemsData = await db
            .select()
            .from(weeklySyncItems)
            .where(eq(weeklySyncItems.weeklySyncId, weeklySyncRecord.id));

          // Get all files for weekly sync items
          const weeklySyncItemIds = weeklySyncItemsData.map((item) => item.id);
          if (weeklySyncItemIds.length > 0) {
            weeklySyncItemFilesData = await db
              .select()
              .from(weeklySyncItemFiles)
              .where(inArray(weeklySyncItemFiles.weeklySyncItemId, weeklySyncItemIds));
          }
        }

        // Helper function to calculate importance
        const calculateImportance = async (goalId: string): Promise<"Low" | "Medium" | "High"> => {
          const outgoingConnections = await db.select().from(connections).where(eq(connections.source, goalId));

          if (outgoingConnections.length === 0) return "Low";

          const totalWeight = outgoingConnections.reduce((sum, conn) => sum + conn.weight, 0);
          const averageWeight = totalWeight / outgoingConnections.length;

          if (averageWeight <= 33.3) return "Low";
          if (averageWeight < 66.6) return "Medium";
          return "High";
        };


        // Helper function to read text content from files array
        const readTextContent = async (files: any[]): Promise<string | null> => {
          try {
            // Find notes.txt file in the files array
            const textFile = files.find((file) => file.fileName === "notes.txt" && file.fileType === "document");
            if (!textFile) {
              console.log("📄 No text file found in files array");
              return null;
            }

            console.log("📖 Reading text content from file:", textFile.url);
            // Extract the relative path from the URL (remove leading slash)
            const filePath = textFile.url.startsWith("/") ? textFile.url.slice(1) : textFile.url;
            const content = await readTextFile(filePath);
            console.log("📄 Text content result:", content ? `${content.length} characters` : "null");
            return content;
          } catch (error) {
            console.error("❌ Error reading text content:", error);
            return null;
          }
        };

        // Build the response data structure
        const responseData = {
          weeklySync: weeklySyncRecord || null,
          goals: await Promise.all(
            goalsData
              .filter((goal) => {
                // Only include active goals that have active tracking items
                return goal.status === "active" && trackingItemsData.some((item) => item.goalId === goal.id && item.status === "active");
              })
              .map(async (goal) => {
                const goalTrackingItems = trackingItemsData.filter((item) => item.goalId === goal.id && item.status === "active");

                const importance = await calculateImportance(goal.id);

                return {
                  id: goal.id,
                  title: goal.title,
                  description: goal.description,
                  importance,
                  trackingItems: await Promise.all(
                    goalTrackingItems.map(async (trackingItem) => {
                      // Find weekly sync item for this tracking item
                      const weeklySyncItem = weeklySyncItemsData.find(
                        (syncItem) => syncItem.trackingItemId === trackingItem.id,
                      );

                      // Get files for this weekly sync item
                      const files = weeklySyncItem
                        ? weeklySyncItemFilesData
                            .filter((file) => file.weeklySyncItemId === weeklySyncItem.id)
                            .map((file) => ({
                              id: file.id,
                              fileName: path.basename(file.filePath),
                              fileType: file.fileType,
                              url: `/uploads/${file.filePath}`,
                              createdAt: file.createdAt,
                            }))
                        : [];

                      // Load text content from files
                      const textContent = await readTextContent(files);

                      return {
                        id: trackingItem.id,
                        title: trackingItem.title,
                        description: trackingItem.description,
                        order: trackingItem.order,
                        deletedAt: trackingItem.deletedAt,
                        weeklySyncItem: weeklySyncItem
                          ? {
                              id: weeklySyncItem.id,
                              createdAt: weeklySyncItem.createdAt,
                            }
                          : null,
                        files,
                        textContent,
                      };
                    }),
                  ),
                };
              }),
          ),
        };

        // Optional debug logging (disabled)
        // console.log("=== DEBUG: Weekly Retrospective Query ===");

        log("Weekly Retrospective Data:", JSON.stringify(responseData, null, 2));
        return responseData;
      }),

    // Create weekly sync for current week
    create: protectedProcedure.input(createWeeklySyncSchema).mutation(async ({ input, ctx }) => {
      const [newWeeklySync] = await db
        .insert(weeklySync)
        .values({ ...input, userId: ctx.user.userId })
        .returning();

      if (!newWeeklySync) {
        throw new Error("Failed to create weekly sync");
      }

      return newWeeklySync;
    }),
  }),

  // Weekly Sync Items operations
  weeklySyncItems: createTRPCRouter({
    // Get all sync items for a weekly sync
    getByWeeklySync: protectedProcedure.input(z.object({ weeklySyncId: z.string() })).query(async ({ input, ctx }) => {
      return await db
        .select()
        .from(weeklySyncItems)
        .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
        .where(and(eq(weeklySyncItems.weeklySyncId, input.weeklySyncId), eq(weeklySync.userId, ctx.user.userId)));
    }),

    // Create weekly sync item
    create: protectedProcedure.input(createWeeklySyncItemSchema).mutation(async ({ input, ctx }) => {
      // Verify weekly sync ownership
      const [existingSync] = await db
        .select()
        .from(weeklySync)
        .where(and(eq(weeklySync.id, input.weeklySyncId), eq(weeklySync.userId, ctx.user.userId)))
        .limit(1);

      if (!existingSync) {
        throw new Error("Weekly sync not found or access denied");
      }

      // Check if weekly sync item already exists
      const [existingItem] = await db
        .select()
        .from(weeklySyncItems)
        .where(
          and(
            eq(weeklySyncItems.weeklySyncId, input.weeklySyncId),
            eq(weeklySyncItems.trackingItemId, input.trackingItemId),
          ),
        )
        .limit(1);

      if (existingItem) {
        return existingItem;
      }

      const [newSyncItem] = await db.insert(weeklySyncItems).values(input).returning();

      if (!newSyncItem) {
        throw new Error("Failed to create weekly sync item");
      }

      return newSyncItem;
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
              eq(weeklySync.userId, ctx.user.userId),
            ),
          );
      }),

    // Create WeeklySyncItemFile with ACID transactions and full auth validation
    create: protectedProcedure.input(createWeeklySyncItemFileSchema).mutation(async ({ input, ctx }) => {
      // Validate file data early
      if (!input.isText && !isValidBase64Image(input.data)) {
        throw new Error("Invalid base64 data");
      }

      return await db.transaction(async (tx) => {
        // Step 1: Validate ownership through WeeklySyncItem chain: User -> WeeklySync -> WeeklySyncItem
        const ownershipQuery = await tx
          .select({
            weeklySyncItem: weeklySyncItems,
            weeklySync: weeklySync,
            trackingItem: trackingItems,
            goal: goals,
          })
          .from(weeklySyncItems)
          .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
          .innerJoin(trackingItems, eq(weeklySyncItems.trackingItemId, trackingItems.id))
          .innerJoin(goals, eq(trackingItems.goalId, goals.id))
          .where(and(eq(weeklySyncItems.id, input.weeklySyncItemId), eq(weeklySync.userId, ctx.user.userId)))
          .limit(1);

        if (ownershipQuery.length === 0) {
          throw new Error("Weekly sync item not found or access denied");
        }

        const result = ownershipQuery[0]!;
        const targetWeeklySync = result.weeklySync;
        const trackingItem = result.trackingItem;
        const goal = result.goal;

        // Step 2: Generate final filename with timestamp prefix (except for text files)
        const finalFileName = input.isText ? input.fileName : generateTimestampedFileName(input.fileName);

        // Step 3: Generate full relative path (excluding /uploads base)
        const dateString = targetWeeklySync.weekDate.toISOString().split("T")[0];
        const relativePath = `${ctx.user.userId}/${goal.id}/${dateString}/${trackingItem.id}/${finalFileName}`;

        // Step 4: Check if file record already exists (for text files to avoid duplicates)
        if (input.isText) {
          const [existingTextFile] = await tx
            .select()
            .from(weeklySyncItemFiles)
            .where(
              and(
                eq(weeklySyncItemFiles.weeklySyncItemId, input.weeklySyncItemId),
                eq(weeklySyncItemFiles.filePath, relativePath),
                eq(weeklySyncItemFiles.fileType, "document"),
              ),
            )
            .limit(1);

          if (existingTextFile) {
            // Update existing text file - save file after successful DB lookup
            const fileResult = await saveOrUpdateTextFile(input.data, relativePath);

            return {
              url: fileResult.url,
              fileName: fileResult.fileName,
              filePath: fileResult.filePath,
              fileType: fileResult.fileType,
              weeklySyncItemFileId: existingTextFile.id,
            };
          }
        }

        // Step 5: Create database file record FIRST (before touching file system)
        const [weeklySyncItemFile] = await tx
          .insert(weeklySyncItemFiles)
          .values({
            weeklySyncItemId: input.weeklySyncItemId,
            filePath: relativePath,
            fileType: input.fileType,
          })
          .returning();

        if (!weeklySyncItemFile) {
          throw new Error("Failed to create file record");
        }

        // Step 5: Save physical file LAST (after successful DB operations)
        try {
          const fileResult = input.isText
            ? await saveOrUpdateTextFile(input.data, relativePath)
            : await saveWeeklySyncFile(input.data, relativePath, false);


          return {
            url: fileResult.url,
            fileName: fileResult.fileName,
            filePath: fileResult.filePath,
            fileType: fileResult.fileType,
            weeklySyncItemFileId: weeklySyncItemFile.id,
          };
        } catch (fileError) {
          // If file operation fails, the transaction will roll back the database changes
          throw new Error(`Failed to save file: ${fileError}`);
        }
      });
    }),

    // Read text file content for a tracking item
    readTrackingItemText: protectedProcedure
      .input(
        z.object({
          goalId: z.string(),
          trackingItemId: z.string(),
          date: z.date().optional(),
        }),
      )
      .query(async ({ input, ctx }) => {
        // Validate complete ownership chain
        const ownershipQuery = await db
          .select({
            goal: goals,
            trackingItem: trackingItems,
          })
          .from(goals)
          .innerJoin(trackingItems, eq(trackingItems.goalId, goals.id))
          .where(
            and(
              eq(goals.id, input.goalId),
              eq(goals.userId, ctx.user.userId),
              eq(trackingItems.id, input.trackingItemId),
              eq(trackingItems.goalId, input.goalId),
            ),
          )
          .limit(1);

        if (ownershipQuery.length === 0) {
          throw new Error("Goal or tracking item not found or access denied");
        }

        // Determine the date to use
        const targetDate = input.date || new Date();
        const weekStart = new Date(targetDate);
        weekStart.setDate(targetDate.getDate() - targetDate.getDay() + 1); // Start of week (Monday)
        weekStart.setHours(0, 0, 0, 0);

        const [targetWeeklySync] = await db
          .select()
          .from(weeklySync)
          .where(and(eq(weeklySync.userId, ctx.user.userId), eq(weeklySync.weekDate, weekStart)))
          .limit(1);

        if (!targetWeeklySync) {
          return { content: "", filePath: "" };
        }

        const content = await readTrackingItemTextFile(
          ctx.user.userId,
          input.goalId,
          input.trackingItemId,
          targetWeeklySync.weekDate,
        );

        return {
          content: content || "",
          filePath: content
            ? getTextFilePath(ctx.user.userId, input.goalId, input.trackingItemId, targetWeeklySync.weekDate)
            : "",
        };
      }),

    // Delete file atomically (both database record and physical file)
    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      return await db.transaction(async (tx) => {
        // Get file metadata and verify ownership
        const fileQuery = await tx
          .select({
            file: weeklySyncItemFiles,
            trackingItem: trackingItems,
            weeklySync: weeklySync,
          })
          .from(weeklySyncItemFiles)
          .innerJoin(weeklySyncItems, eq(weeklySyncItemFiles.weeklySyncItemId, weeklySyncItems.id))
          .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
          .innerJoin(trackingItems, eq(weeklySyncItems.trackingItemId, trackingItems.id))
          .innerJoin(goals, eq(trackingItems.goalId, goals.id))
          .where(and(eq(weeklySyncItemFiles.id, input.id), eq(weeklySync.userId, ctx.user.userId)))
          .limit(1);

        if (fileQuery.length === 0) {
          throw new Error("File not found or access denied");
        }

        const { file, trackingItem, weeklySync: sync } = fileQuery[0]!;

        // Use stored file path from database
        const filePath = `uploads/${file.filePath}`;

        // Delete database record first
        await tx.delete(weeklySyncItemFiles).where(eq(weeklySyncItemFiles.id, input.id));

        // Delete physical file
        const fileDeleted = await deleteFile(filePath);
        if (!fileDeleted) {
          console.warn(`Physical file not found but database record was deleted: ${filePath}`);
        }

        return { success: true };
      });
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
      // Get all weekly syncs for user
      const weeklySyncs = await db.select().from(weeklySync).where(eq(weeklySync.userId, ctx.user.userId));

      // Get all weekly sync items for user
      const weeklySyncItemsData = await db
        .select()
        .from(weeklySyncItems)
        .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
        .where(eq(weeklySync.userId, ctx.user.userId));

      // Get all weekly sync item files for user
      const weeklySyncItemFilesData = await db
        .select()
        .from(weeklySyncItemFiles)
        .innerJoin(weeklySyncItems, eq(weeklySyncItemFiles.weeklySyncItemId, weeklySyncItems.id))
        .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
        .where(eq(weeklySync.userId, ctx.user.userId));

      return {
        weeklySyncs,
        weeklySyncItems: weeklySyncItemsData,
        weeklySyncItemFiles: weeklySyncItemFilesData,
        counts: {
          weeklySyncs: weeklySyncs.length,
          weeklySyncItems: weeklySyncItemsData.length,
          weeklySyncItemFiles: weeklySyncItemFilesData.length,
        },
      };
    }),
  }),

  // Data operations (for importing/exporting)
  data: createTRPCRouter({
    getAll: protectedProcedure.query(async ({ ctx }) => {
      const valuesData = await db.select().from(values).where(eq(values.userId, ctx.user.userId));
      const goalsData = await db.select().from(goals).where(and(eq(goals.userId, ctx.user.userId), eq(goals.status, "active")));

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
        parentId: goal.parentId || undefined,
        position: { x: goal.positionX, y: goal.positionY },
        importance: calculateImportance(goal.id),
        status: goal.status as "active" | "archived",
        valueIds: goalValuesData
          .filter((item) => item.goal_values.goalId === goal.id)
          .map((item) => item.goal_values.valueId),
        tasks: tasksData
          .filter((item) => item.tasks.goalId === goal.id)
          .map((item) => ({
            id: item.tasks.id,
            title: item.tasks.title,
            difficulty: item.tasks.difficulty as 1 | 2 | 3,
            completed: item.tasks.completed,
          })),
      }));

      return {
        values: valuesData,
        goals: mappedGoals,
        connections: connectionsData.map((item) => item.connections),
      };
    }),
  }),
});
