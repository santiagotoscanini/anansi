import { z } from "zod";
import { eq, and, asc, isNull, inArray } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { db } from "../../data";
import {
  users,
  values,
  goals,
  tasks,
  connections,
  goalValues,
  trackingItems,
  weeklySync,
  weeklySyncItems,
  weeklySyncItemFiles,
  people,
  userSelf,
  taskReferents,
  personGroups,
  peopleToGroups,
  giftIdeas,
  bucketListItems,
  bucketListItemPeople,
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
  createPersonSchema,
  updatePersonSchema,
  updateSelfSchema,
  personCategoryValues,
  createPersonGroupSchema,
  updatePersonGroupSchema,
  createGiftIdeaSchema,
  createBucketListItemSchema,
  updateBucketListItemSchema,
  backupSchema,
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
import { readFile } from "fs/promises";
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
            difficulty: item.tasks.difficulty as 1 | 2 | 3,
            completed: item.tasks.completed,
            referentIds: referentsData.filter((r) => r.taskId === item.tasks.id).map((r) => r.personId),
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

      // Insert tasks and their referents
      if (inputTasks.length > 0) {
        const insertedTasks = await db
          .insert(tasks)
          .values(
            inputTasks.map(({ referentIds: _ignored, ...rest }) => ({
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

      // Update tasks if provided (full replace — cascades drop their referents).
      if (inputTasks !== undefined) {
        await db.delete(tasks).where(eq(tasks.goalId, id));
        if (inputTasks.length > 0) {
          const insertedTasks = await db
            .insert(tasks)
            .values(
              inputTasks.map(({ referentIds: _ignored, ...rest }) => ({
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

        const { referentIds, ...taskInput } = input;
        const [newTask] = await db.insert(tasks).values(taskInput).returning();
        if (!newTask) {
          throw new Error("Failed to create task");
        }
        if (referentIds?.length) {
          await db.insert(taskReferents).values(referentIds.map((personId) => ({ taskId: newTask.id, personId })));
        }
        return newTask;
      }),

    update: protectedProcedure
      .input(updateTaskSchema.extend({ goalId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { id, goalId, referentIds, ...updateData } = input;
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
          .where(
            and(
              eq(trackingItems.goalId, input.goalId),
              isNull(trackingItems.deletedAt),
              eq(trackingItems.status, "active"),
            ),
          )
          .orderBy(asc(trackingItems.order), asc(trackingItems.createdAt));

        // Map database result to match TypeScript type (null -> undefined)
        return items.map((item) => ({
          id: item.id,
          goalId: item.goalId,
          title: item.title,
          description: item.description ?? undefined,
          order: item.order,
          status: item.status,
          deletedAt: item.deletedAt ?? undefined,
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

      return syncRecord ?? null;
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
        const goalsData = await db
          .select()
          .from(goals)
          .where(and(eq(goals.userId, ctx.user.userId), eq(goals.status, "active")));

        // Get all tracking items for user's goals
        const goalIds = goalsData.map((g) => g.id);
        let trackingItemsData: (typeof trackingItems.$inferSelect)[] = [];

        if (goalIds.length > 0) {
          trackingItemsData = await db
            .select()
            .from(trackingItems)
            .where(and(inArray(trackingItems.goalId, goalIds), eq(trackingItems.status, "active")));
        }

        // Get weekly sync items if weekly sync exists
        let weeklySyncItemsData: (typeof weeklySyncItems.$inferSelect)[] = [];
        let weeklySyncItemFilesData: (typeof weeklySyncItemFiles.$inferSelect)[] = [];

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
        type RetroFile = {
          id: string;
          fileName: string;
          fileType: (typeof weeklySyncItemFiles.$inferSelect)["fileType"];
          url: string;
          createdAt: Date;
        };
        const readTextContent = async (files: RetroFile[]): Promise<string | null> => {
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
          weeklySync: weeklySyncRecord ?? null,
          goals: await Promise.all(
            goalsData
              .filter((goal) => {
                // Only include active goals that have active tracking items
                return (
                  goal.status === "active" &&
                  trackingItemsData.some((item) => item.goalId === goal.id && item.status === "active")
                );
              })
              .map(async (goal) => {
                const goalTrackingItems = trackingItemsData.filter(
                  (item) => item.goalId === goal.id && item.status === "active",
                );

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
          throw new Error(`Failed to save file: ${String(fileError)}`);
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
        const targetDate = input.date ?? new Date();
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
          content: content ?? "",
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

        const { file } = fileQuery[0]!;

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
            difficulty: item.tasks.difficulty as 1 | 2 | 3,
            completed: item.tasks.completed,
            referentIds: referentsData.filter((r) => r.taskId === item.tasks.id).map((r) => r.personId),
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
          .where(
            and(
              eq(bucketListItemPeople.personId, input.personId),
              eq(bucketListItems.userId, ctx.user.userId),
            ),
          )
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

  // Gift ideas — per-person list. Captured when noticed; deleted when given.
  giftIdeas: createTRPCRouter({
    list: protectedProcedure.input(z.object({ personId: z.string() })).query(async ({ input, ctx }) => {
      // Verify the person belongs to the user before returning rows.
      const [person] = await db
        .select({ id: people.id })
        .from(people)
        .where(and(eq(people.id, input.personId), eq(people.userId, ctx.user.userId)))
        .limit(1);
      if (!person) return [];
      return db
        .select()
        .from(giftIdeas)
        .where(eq(giftIdeas.personId, input.personId))
        .orderBy(asc(giftIdeas.createdAt));
    }),

    create: protectedProcedure.input(createGiftIdeaSchema).mutation(async ({ input, ctx }) => {
      const [person] = await db
        .select({ id: people.id })
        .from(people)
        .where(and(eq(people.id, input.personId), eq(people.userId, ctx.user.userId)))
        .limit(1);
      if (!person) throw new Error("Person not found or access denied");
      const [created] = await db.insert(giftIdeas).values(input).returning();
      return created;
    }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      // Verify ownership via JOIN through people, then delete by id.
      const [row] = await db
        .select({ id: giftIdeas.id })
        .from(giftIdeas)
        .innerJoin(people, eq(giftIdeas.personId, people.id))
        .where(and(eq(giftIdeas.id, input.id), eq(people.userId, ctx.user.userId)))
        .limit(1);
      if (!row) throw new Error("Gift idea not found or access denied");
      await db.delete(giftIdeas).where(eq(giftIdeas.id, input.id));
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
      const trackingItemsRows = goalIds.length
        ? await db.select().from(trackingItems).where(inArray(trackingItems.goalId, goalIds))
        : [];

      const weeklySyncRows = await db.select().from(weeklySync).where(eq(weeklySync.userId, userId));
      const weeklySyncIds = weeklySyncRows.map((ws) => ws.id);

      const weeklySyncItemsRows = weeklySyncIds.length
        ? await db.select().from(weeklySyncItems).where(inArray(weeklySyncItems.weeklySyncId, weeklySyncIds))
        : [];
      const weeklySyncItemIds = weeklySyncItemsRows.map((wsi) => wsi.id);

      const weeklySyncItemFilesRows = weeklySyncItemIds.length
        ? await db
            .select()
            .from(weeklySyncItemFiles)
            .where(inArray(weeklySyncItemFiles.weeklySyncItemId, weeklySyncItemIds))
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

      const giftIdeasRows = peopleRows.length
        ? await db
            .select()
            .from(giftIdeas)
            .where(
              inArray(
                giftIdeas.personId,
                peopleRows.map((p) => p.id),
              ),
            )
        : [];

      const bucketListRows = await db
        .select()
        .from(bucketListItems)
        .where(eq(bucketListItems.userId, userId));

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

      // Join through tasks→goals to scope referents to this user's graph only.
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

      // Read each referenced file off disk and base64-encode. Skip missing files with a warn
      // rather than failing the whole export — files may have been pruned by hand and we'd
      // rather deliver a partial backup than nothing.
      const files: { filePath: string; data: string }[] = [];
      for (const f of weeklySyncItemFilesRows) {
        const abs = path.join(process.cwd(), "uploads", f.filePath);
        try {
          const buf = await readFile(abs);
          files.push({ filePath: f.filePath, data: buf.toString("base64") });
        } catch {
          console.warn(`[backup.export] missing file skipped: ${f.filePath}`);
        }
      }

      return {
        version: 1 as const,
        exportedAt: new Date(),
        user: { name: userRow.name, email: userRow.email },
        values: valuesRows.map(({ userId: _, ...rest }) => rest),
        goals: goalsRows.map(({ userId: _, ...rest }) => rest),
        tasks: tasksRows,
        connections: connectionsRows,
        goalValues: goalValuesRows,
        trackingItems: trackingItemsRows,
        weeklySync: weeklySyncRows.map(({ userId: _, ...rest }) => rest),
        weeklySyncItems: weeklySyncItemsRows,
        weeklySyncItemFiles: weeklySyncItemFilesRows,
        files,
        people: peopleRows.map(({ userId: _, ...rest }) => rest),
        userSelf: userSelfRow ? (({ userId: _, ...rest }) => rest)(userSelfRow) : null,
        taskReferents: taskReferentsRows,
        personGroups: personGroupRows.map(({ userId: _, ...rest }) => rest),
        peopleToGroups: peopleToGroupsRows,
        giftIdeas: giftIdeasRows,
        bucketListItems: bucketListRows.map(({ userId: _, ...rest }) => rest),
        bucketListItemPeople: bucketListItemPeopleRows,
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

        // Precompute path rewrite: backups store the original user-id as the first segment
        // of every filePath. Map old → current user so restored files land in the caller's
        // uploads/<userId>/… tree regardless of which account produced the backup.
        const rewritePath = (filePath: string): string => {
          const slash = filePath.indexOf("/");
          if (slash === -1) return `${userId}/${filePath}`;
          return `${userId}${filePath.slice(slash)}`;
        };

        // All DB changes happen in one transaction; files are written only after commit.
        await db.transaction(async (tx) => {
          // Nuke everything the user owns. Cascades take care of tasks, connections,
          // goalValues, trackingItems, weeklySyncItems, weeklySyncItemFiles.
          await tx.delete(goals).where(eq(goals.userId, userId));
          await tx.delete(values).where(eq(values.userId, userId));
          await tx.delete(weeklySync).where(eq(weeklySync.userId, userId));
          await tx.delete(people).where(eq(people.userId, userId));
          await tx.delete(userSelf).where(eq(userSelf.userId, userId));
          await tx.delete(personGroups).where(eq(personGroups.userId, userId));
          await tx.delete(bucketListItems).where(eq(bucketListItems.userId, userId));

          if (b.values.length) {
            await tx.insert(values).values(
              b.values.map((v) => ({
                id: v.id,
                name: v.name,
                color: v.color,
                userId,
                createdAt: v.createdAt,
                updatedAt: v.updatedAt,
              })),
            );
          }

          // Insert goals with parentId nulled first, then fix up parents in a second pass.
          // Avoids self-referencing FK ordering issues when the backup lists a child before
          // its parent.
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
          if (b.trackingItems.length) await tx.insert(trackingItems).values(b.trackingItems);

          if (b.weeklySync.length) {
            await tx.insert(weeklySync).values(
              b.weeklySync.map((ws) => ({
                id: ws.id,
                userId,
                weekDate: ws.weekDate,
                createdAt: ws.createdAt,
                updatedAt: ws.updatedAt,
              })),
            );
          }
          if (b.weeklySyncItems.length) await tx.insert(weeklySyncItems).values(b.weeklySyncItems);

          if (b.weeklySyncItemFiles.length) {
            await tx.insert(weeklySyncItemFiles).values(
              b.weeklySyncItemFiles.map((f) => ({
                id: f.id,
                weeklySyncItemId: f.weeklySyncItemId,
                filePath: rewritePath(f.filePath),
                fileType: f.fileType,
                createdAt: f.createdAt,
              })),
            );
          }

          if (b.people?.length) {
            await tx.insert(people).values(
              b.people.map((p) => ({
                ...p,
                userId,
              })),
            );
          }

          if (b.userSelf) {
            await tx.insert(userSelf).values({
              ...b.userSelf,
              userId,
            });
          }

          if (b.taskReferents?.length) {
            await tx.insert(taskReferents).values(b.taskReferents);
          }

          if (b.personGroups?.length) {
            await tx.insert(personGroups).values(
              b.personGroups.map((g) => ({
                ...g,
                userId,
              })),
            );
          }

          if (b.peopleToGroups?.length) {
            await tx.insert(peopleToGroups).values(b.peopleToGroups);
          }

          if (b.giftIdeas?.length) {
            await tx.insert(giftIdeas).values(b.giftIdeas);
          }

          if (b.bucketListItems?.length) {
            await tx.insert(bucketListItems).values(
              b.bucketListItems.map((it) => ({
                ...it,
                userId,
              })),
            );
          }

          if (b.bucketListItemPeople?.length) {
            await tx.insert(bucketListItemPeople).values(b.bucketListItemPeople);
          }
        });

        // Files land on disk after the DB commit. If any write fails we log and continue —
        // the DB row will point at a 404 until the file is restored by hand, matching the
        // existing "missing file" handling throughout the app.
        const fileFailures: string[] = [];
        for (const file of b.files) {
          const newPath = rewritePath(file.filePath);
          try {
            await saveWeeklySyncFile(file.data, newPath, false);
          } catch (err) {
            console.error(`[backup.import] failed to write ${newPath}:`, err);
            fileFailures.push(newPath);
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
            weeklySyncItemFiles: b.weeklySyncItemFiles.length,
            files: b.files.length,
            people: b.people?.length ?? 0,
            userSelf: b.userSelf ? 1 : 0,
            taskReferents: b.taskReferents?.length ?? 0,
            personGroups: b.personGroups?.length ?? 0,
            peopleToGroups: b.peopleToGroups?.length ?? 0,
          },
          fileFailures,
        };
      }),
  }),
});
