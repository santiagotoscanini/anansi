import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { db } from "../../data";
import {
  values,
  goals,
  tasks,
  connections,
  goalValues,
  trackingItems
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
  type Goal,
  type Value,
  type Task,
  type Connection,
  type TrackingItem,
} from "../types";
import { saveImageToFile, deleteImageFile, isValidBase64Image } from "../../image-upload";

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

        return await db
          .select()
          .from(trackingItems)
          .where(eq(trackingItems.goalId, input.goalId))
          .orderBy(asc(trackingItems.order), asc(trackingItems.createdAt));
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

        await db.delete(trackingItems).where(eq(trackingItems.id, input.id));
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

        const success = await deleteImageFile(input.filePath);

        if (!success) {
          throw new Error("Failed to delete image file");
        }

        return { success: true };
      }),
  }),
});