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
  tasks: z.array(taskSchema),
  parentId: z.string().optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  importance: z.enum(["Low", "Medium", "High"]).default("Low"),
});

export const connectionSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  weight: z.number(),
});

export const trackingItemSchema = z.object({
  id: z.string(),
  goalId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  order: z.number().default(0),
});

// Input schemas for creating/updating
export const createValueSchema = valueSchema.omit({ id: true });
export const updateValueSchema = valueSchema.partial().required({ id: true });

export const createTaskSchema = taskSchema.omit({ id: true });
export const updateTaskSchema = taskSchema.partial().required({ id: true });

export const createGoalSchema = goalSchema.omit({ id: true, importance: true });
export const updateGoalSchema = goalSchema.omit({ importance: true }).partial().required({ id: true });

export const createConnectionSchema = connectionSchema.omit({ id: true });
export const updateConnectionSchema = connectionSchema.partial().required({ id: true });

export const createTrackingItemSchema = trackingItemSchema.omit({ id: true });
export const updateTrackingItemSchema = trackingItemSchema.partial().required({ id: true });

// Export types
export type Value = z.infer<typeof valueSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type Connection = z.infer<typeof connectionSchema>;
export type TrackingItem = z.infer<typeof trackingItemSchema>;

export type CreateValue = z.infer<typeof createValueSchema>;
export type UpdateValue = z.infer<typeof updateValueSchema>;
export type CreateTask = z.infer<typeof createTaskSchema>;
export type UpdateTask = z.infer<typeof updateTaskSchema>;
export type CreateGoal = z.infer<typeof createGoalSchema>;
export type UpdateGoal = z.infer<typeof updateGoalSchema>;
export type CreateConnection = z.infer<typeof createConnectionSchema>;
export type UpdateConnection = z.infer<typeof updateConnectionSchema>;
export type CreateTrackingItem = z.infer<typeof createTrackingItemSchema>;
export type UpdateTrackingItem = z.infer<typeof updateTrackingItemSchema>;

// Data format for file operations (for compatibility)
export const goalsDataSchema = z.object({
  version: z.string(),
  values: z.array(valueSchema),
  goals: z.array(goalSchema),
  connections: z.array(connectionSchema),
  lastModified: z.string(),
});

export type GoalsData = z.infer<typeof goalsDataSchema>;
