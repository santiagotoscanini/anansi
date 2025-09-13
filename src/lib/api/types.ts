import { z } from "zod";

// Shared types based on the database schema
export const valueSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
});

export const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  completed: z.boolean(),
});

export const goalSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  valueIds: z.array(z.string()),
  importance: z.number(),
  tasks: z.array(taskSchema),
  parentId: z.string().optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
});

export const connectionSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  weight: z.number(),
});

export const weeklyReviewSchema = z.object({
  id: z.string(),
  week: z.string(),
  goalIds: z.array(z.string()),
  notes: z.string(),
  photos: z.array(z.string()),
  categories: z.array(z.string()),
});

// Input schemas for creating/updating
export const createValueSchema = valueSchema.omit({ id: true });
export const updateValueSchema = valueSchema.partial().required({ id: true });

export const createTaskSchema = taskSchema.omit({ id: true });
export const updateTaskSchema = taskSchema.partial().required({ id: true });

export const createGoalSchema = goalSchema.omit({ id: true });
export const updateGoalSchema = goalSchema.partial().required({ id: true });

export const createConnectionSchema = connectionSchema.omit({ id: true });
export const updateConnectionSchema = connectionSchema.partial().required({ id: true });

export const createWeeklyReviewSchema = weeklyReviewSchema.omit({ id: true });
export const updateWeeklyReviewSchema = weeklyReviewSchema.partial().required({ id: true });

// Export types
export type Value = z.infer<typeof valueSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type Connection = z.infer<typeof connectionSchema>;
export type WeeklyReview = z.infer<typeof weeklyReviewSchema>;

export type CreateValue = z.infer<typeof createValueSchema>;
export type UpdateValue = z.infer<typeof updateValueSchema>;
export type CreateTask = z.infer<typeof createTaskSchema>;
export type UpdateTask = z.infer<typeof updateTaskSchema>;
export type CreateGoal = z.infer<typeof createGoalSchema>;
export type UpdateGoal = z.infer<typeof updateGoalSchema>;
export type CreateConnection = z.infer<typeof createConnectionSchema>;
export type UpdateConnection = z.infer<typeof updateConnectionSchema>;
export type CreateWeeklyReview = z.infer<typeof createWeeklyReviewSchema>;
export type UpdateWeeklyReview = z.infer<typeof updateWeeklyReviewSchema>;

// Data format for file operations (for compatibility)
export const goalsDataSchema = z.object({
  version: z.string(),
  values: z.array(valueSchema),
  goals: z.array(goalSchema),
  connections: z.array(connectionSchema),
  weeklyReviews: z.array(weeklyReviewSchema),
  lastModified: z.string(),
});

export type GoalsData = z.infer<typeof goalsDataSchema>;
