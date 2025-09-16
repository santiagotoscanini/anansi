import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { db } from "../../data";
import {
  values,
  goals,
  tasks,
  connections,
  weeklyReviews,
  goalValues,
  weeklyReviewGoals
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
  createWeeklyReviewSchema,
  updateWeeklyReviewSchema,
  type Goal,
  type Value,
  type Task,
  type Connection,
  type WeeklyReview,
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

      return goalsData.map(goal => ({
        id: goal.id,
        title: goal.title,
        description: goal.description,
        parentId: goal.parentId || undefined,
        position: { x: goal.positionX, y: goal.positionY },
        importance: goal.importance,
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

  // Weekly Reviews operations
  weeklyReviews: createTRPCRouter({
    getAll: protectedProcedure.query(async ({ ctx }): Promise<WeeklyReview[]> => {
      const reviewsData = await db.select().from(weeklyReviews).where(eq(weeklyReviews.userId, ctx.user.userId));
      const reviewGoalsData = await db
        .select()
        .from(weeklyReviewGoals)
        .innerJoin(weeklyReviews, eq(weeklyReviewGoals.weeklyReviewId, weeklyReviews.id))
        .where(eq(weeklyReviews.userId, ctx.user.userId));

      return reviewsData.map(review => ({
        id: review.id,
        week: review.week,
        notes: review.notes,
        photos: review.photos as string[],
        categories: review.categories as string[],
        goalIds: reviewGoalsData
          .filter(item => item.weekly_review_goals.weeklyReviewId === review.id)
          .map(item => item.weekly_review_goals.goalId),
      }));
    }),

    create: protectedProcedure
      .input(createWeeklyReviewSchema)
      .mutation(async ({ input, ctx }) => {
        const { goalIds, ...reviewData } = input;

        const [newReview] = await db
          .insert(weeklyReviews)
          .values({ ...reviewData, userId: ctx.user.userId })
          .returning();

        if (!newReview) {
          throw new Error("Failed to create weekly review");
        }

        // Insert goal associations
        if (goalIds.length > 0) {
          await db.insert(weeklyReviewGoals).values(
            goalIds.map(goalId => ({
              weeklyReviewId: newReview.id,
              goalId,
            }))
          );
        }

        return newReview;
      }),

    update: protectedProcedure
      .input(updateWeeklyReviewSchema)
      .mutation(async ({ input, ctx }) => {
        const { id, goalIds, ...reviewData } = input;

        // Update review (ensure it belongs to the user)
        if (Object.keys(reviewData).length > 0) {
          await db
            .update(weeklyReviews)
            .set({ ...reviewData, updatedAt: new Date() })
            .where(and(eq(weeklyReviews.id, id), eq(weeklyReviews.userId, ctx.user.userId)));
        }

        // Update goal associations if provided
        if (goalIds !== undefined) {
          // First verify the weekly review belongs to the user
          const reviewExists = await db.select().from(weeklyReviews).where(and(eq(weeklyReviews.id, id), eq(weeklyReviews.userId, ctx.user.userId))).limit(1);
          if (reviewExists.length === 0) throw new Error("Weekly review not found or access denied");

          await db.delete(weeklyReviewGoals).where(eq(weeklyReviewGoals.weeklyReviewId, id));
          if (goalIds.length > 0) {
            // Verify all goals belong to the user
            for (const goalId of goalIds) {
              const goalExists = await db.select().from(goals).where(and(eq(goals.id, goalId), eq(goals.userId, ctx.user.userId))).limit(1);
              if (goalExists.length === 0) throw new Error(`Goal ${goalId} not found or access denied`);
            }

            await db.insert(weeklyReviewGoals).values(
              goalIds.map(goalId => ({
                weeklyReviewId: id,
                goalId,
              }))
            );
          }
        }

        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await db.delete(weeklyReviews).where(and(eq(weeklyReviews.id, input.id), eq(weeklyReviews.userId, ctx.user.userId)));
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

      const weeklyReviewsData = await db.select().from(weeklyReviews).where(eq(weeklyReviews.userId, ctx.user.userId));

      // Get goal-value relationships for user's goals only
      const goalValuesData = goalIds.length > 0 ? await db.select().from(goalValues).innerJoin(goals, eq(goalValues.goalId, goals.id)).where(eq(goals.userId, ctx.user.userId)) : [];

      // Get weekly review-goal relationships for user's reviews only
      const reviewIds = weeklyReviewsData.map(r => r.id);
      const weeklyReviewGoalsData = reviewIds.length > 0 ? await db.select().from(weeklyReviewGoals).innerJoin(weeklyReviews, eq(weeklyReviewGoals.weeklyReviewId, weeklyReviews.id)).where(eq(weeklyReviews.userId, ctx.user.userId)) : [];

      const mappedGoals: Goal[] = goalsData.map(goal => ({
        id: goal.id,
        title: goal.title,
        description: goal.description,
        parentId: goal.parentId || undefined,
        position: { x: goal.positionX, y: goal.positionY },
        importance: goal.importance,
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

      const mappedWeeklyReviews: WeeklyReview[] = weeklyReviewsData.map(review => ({
        id: review.id,
        week: review.week,
        notes: review.notes,
        photos: review.photos as string[],
        categories: review.categories as string[],
        goalIds: weeklyReviewGoalsData
          .filter(item => item.weekly_review_goals.weeklyReviewId === review.id)
          .map(item => item.weekly_review_goals.goalId),
      }));

      return {
        values: valuesData,
        goals: mappedGoals,
        connections: connectionsData.map(item => item.connections),
        weeklyReviews: mappedWeeklyReviews,
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