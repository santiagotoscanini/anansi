import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "../trpc";
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

export const goalsRouter = createTRPCRouter({
  // Values operations
  values: createTRPCRouter({
    getAll: publicProcedure.query(async () => {
      return await db.select().from(values);
    }),

    create: publicProcedure
      .input(createValueSchema)
      .mutation(async ({ input }) => {
        const [newValue] = await db.insert(values).values(input).returning();
        if (!newValue) {
          throw new Error("Failed to create value");
        }
        return newValue;
      }),

    update: publicProcedure
      .input(updateValueSchema)
      .mutation(async ({ input }) => {
        const { id, ...updateData } = input;
        const [updatedValue] = await db
          .update(values)
          .set({ ...updateData, updatedAt: new Date() })
          .where(eq(values.id, id))
          .returning();
        return updatedValue;
      }),

    delete: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await db.delete(goalValues).where(eq(goalValues.valueId, input.id));
        await db.delete(values).where(eq(values.id, input.id));
        return { success: true };
      }),
  }),

  // Goals operations
  goals: createTRPCRouter({
    getAll: publicProcedure.query(async (): Promise<Goal[]> => {
      const goalsData = await db.select().from(goals);
      const tasksData = await db.select().from(tasks);
      const goalValuesData = await db.select().from(goalValues);

      return goalsData.map(goal => ({
        id: goal.id,
        title: goal.title,
        description: goal.description,
        importance: goal.importance,
        parentId: goal.parentId || undefined,
        position: { x: goal.positionX, y: goal.positionY },
        valueIds: goalValuesData
          .filter(gv => gv.goalId === goal.id)
          .map(gv => gv.valueId),
        tasks: tasksData
          .filter(task => task.goalId === goal.id)
          .map(task => ({
            id: task.id,
            title: task.title,
            difficulty: task.difficulty as 1 | 2 | 3,
            completed: task.completed,
          })),
      }));
    }),

    create: publicProcedure
      .input(createGoalSchema)
      .mutation(async ({ input }) => {
        const { valueIds, tasks: inputTasks, position, ...goalData } = input;

        const [newGoal] = await db
          .insert(goals)
          .values({
            ...goalData,
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

    update: publicProcedure
      .input(updateGoalSchema)
      .mutation(async ({ input }) => {
        const { id, valueIds, tasks: inputTasks, position, ...goalData } = input;

        // Update goal
        if (Object.keys(goalData).length > 0 || position) {
          const updateData = { ...goalData, updatedAt: new Date() } as any;
          if (position) {
            updateData.positionX = position.x;
            updateData.positionY = position.y;
          }
          await db.update(goals).set(updateData).where(eq(goals.id, id));
        }

        // Update value associations if provided
        if (valueIds !== undefined) {
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

    delete: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await db.delete(goals).where(eq(goals.id, input.id));
        return { success: true };
      }),
  }),

  // Tasks operations
  tasks: createTRPCRouter({
    create: publicProcedure
      .input(createTaskSchema.extend({ goalId: z.string() }))
      .mutation(async ({ input }) => {
        const [newTask] = await db.insert(tasks).values(input).returning();
        if (!newTask) {
          throw new Error("Failed to create task");
        }
        return newTask;
      }),

    update: publicProcedure
      .input(updateTaskSchema.extend({ goalId: z.string() }))
      .mutation(async ({ input }) => {
        const { id, goalId, ...updateData } = input;
        const [updatedTask] = await db
          .update(tasks)
          .set({ ...updateData, updatedAt: new Date() })
          .where(and(eq(tasks.id, id), eq(tasks.goalId, goalId)))
          .returning();
        return updatedTask;
      }),

    delete: publicProcedure
      .input(z.object({ id: z.string(), goalId: z.string() }))
      .mutation(async ({ input }) => {
        await db.delete(tasks).where(
          and(eq(tasks.id, input.id), eq(tasks.goalId, input.goalId))
        );
        return { success: true };
      }),
  }),

  // Connections operations
  connections: createTRPCRouter({
    getAll: publicProcedure.query(async () => {
      return await db.select().from(connections);
    }),

    create: publicProcedure
      .input(createConnectionSchema)
      .mutation(async ({ input }) => {
        const [newConnection] = await db.insert(connections).values(input).returning();
        if (!newConnection) {
          throw new Error("Failed to create connection");
        }
        return newConnection;
      }),

    update: publicProcedure
      .input(updateConnectionSchema)
      .mutation(async ({ input }) => {
        const { id, ...updateData } = input;
        const [updatedConnection] = await db
          .update(connections)
          .set({ ...updateData, updatedAt: new Date() })
          .where(eq(connections.id, id))
          .returning();
        return updatedConnection;
      }),

    delete: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await db.delete(connections).where(eq(connections.id, input.id));
        return { success: true };
      }),
  }),

  // Weekly Reviews operations
  weeklyReviews: createTRPCRouter({
    getAll: publicProcedure.query(async (): Promise<WeeklyReview[]> => {
      const reviewsData = await db.select().from(weeklyReviews);
      const reviewGoalsData = await db.select().from(weeklyReviewGoals);

      return reviewsData.map(review => ({
        id: review.id,
        week: review.week,
        notes: review.notes,
        photos: review.photos as string[],
        categories: review.categories as string[],
        goalIds: reviewGoalsData
          .filter(rg => rg.weeklyReviewId === review.id)
          .map(rg => rg.goalId),
      }));
    }),

    create: publicProcedure
      .input(createWeeklyReviewSchema)
      .mutation(async ({ input }) => {
        const { goalIds, ...reviewData } = input;

        const [newReview] = await db
          .insert(weeklyReviews)
          .values(reviewData)
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

    update: publicProcedure
      .input(updateWeeklyReviewSchema)
      .mutation(async ({ input }) => {
        const { id, goalIds, ...reviewData } = input;

        // Update review
        if (Object.keys(reviewData).length > 0) {
          await db
            .update(weeklyReviews)
            .set({ ...reviewData, updatedAt: new Date() })
            .where(eq(weeklyReviews.id, id));
        }

        // Update goal associations if provided
        if (goalIds !== undefined) {
          await db.delete(weeklyReviewGoals).where(eq(weeklyReviewGoals.weeklyReviewId, id));
          if (goalIds.length > 0) {
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

    delete: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await db.delete(weeklyReviews).where(eq(weeklyReviews.id, input.id));
        return { success: true };
      }),
  }),

  // Data operations (for importing/exporting)
  data: createTRPCRouter({
    getAll: publicProcedure.query(async () => {
      const valuesData = await db.select().from(values);
      const goalsData = await db.select().from(goals);
      const tasksData = await db.select().from(tasks);
      const connectionsData = await db.select().from(connections);
      const weeklyReviewsData = await db.select().from(weeklyReviews);
      const goalValuesData = await db.select().from(goalValues);
      const weeklyReviewGoalsData = await db.select().from(weeklyReviewGoals);

      const mappedGoals: Goal[] = goalsData.map(goal => ({
        id: goal.id,
        title: goal.title,
        description: goal.description,
        importance: goal.importance,
        parentId: goal.parentId || undefined,
        position: { x: goal.positionX, y: goal.positionY },
        valueIds: goalValuesData
          .filter(gv => gv.goalId === goal.id)
          .map(gv => gv.valueId),
        tasks: tasksData
          .filter(task => task.goalId === goal.id)
          .map(task => ({
            id: task.id,
            title: task.title,
            difficulty: task.difficulty as 1 | 2 | 3,
            completed: task.completed,
          })),
      }));

      const mappedWeeklyReviews: WeeklyReview[] = weeklyReviewsData.map(review => ({
        id: review.id,
        week: review.week,
        notes: review.notes,
        photos: review.photos as string[],
        categories: review.categories as string[],
        goalIds: weeklyReviewGoalsData
          .filter(rg => rg.weeklyReviewId === review.id)
          .map(rg => rg.goalId),
      }));

      return {
        values: valuesData,
        goals: mappedGoals,
        connections: connectionsData,
        weeklyReviews: mappedWeeklyReviews,
      };
    }),
  }),
});