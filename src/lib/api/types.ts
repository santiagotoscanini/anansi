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
  emoji: z.string().optional(), // Native emoji or URL to custom emoji image
  valueIds: z.array(z.string()),
  tasks: z.array(taskSchema),
  parentId: z.string().optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  importance: z.enum(["Low", "Medium", "High"]).default("Low"),
  status: z.enum(["active", "archived"]).default("active"),
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
  deletedAt: z.date().optional(),
  status: z.enum(["active", "archived"]).default("active"),
});

export const weeklySyncSchema = z.object({
  id: z.string(),
  userId: z.string(),
  weekDate: z.date(), // Monday of the retrospective week
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const weeklySyncItemSchema = z.object({
  id: z.string(),
  weeklySyncId: z.string(),
  trackingItemId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const weeklySyncItemFileSchema = z.object({
  id: z.string(),
  weeklySyncItemId: z.string(),
  filePath: z.string(),
  fileType: z.enum(["image", "document", "video", "audio", "other"]),
  createdAt: z.date(),
});

// Input schemas for creating/updating
export const createValueSchema = valueSchema.omit({ id: true });
export const updateValueSchema = valueSchema.partial().required({ id: true });

export const createTaskSchema = taskSchema.omit({ id: true });
export const updateTaskSchema = taskSchema.partial().required({ id: true });

export const createGoalSchema = goalSchema.omit({ id: true, importance: true, status: true });
export const updateGoalSchema = goalSchema.omit({ importance: true }).partial().required({ id: true });

export const createConnectionSchema = connectionSchema.omit({ id: true });
export const updateConnectionSchema = connectionSchema.partial().required({ id: true });

export const createTrackingItemSchema = trackingItemSchema.omit({ id: true, deletedAt: true, status: true });
export const updateTrackingItemSchema = trackingItemSchema.omit({ deletedAt: true }).partial().required({ id: true });

export const createWeeklySyncSchema = weeklySyncSchema.omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});
export const updateWeeklySyncSchema = weeklySyncSchema.partial().required({ id: true });

export const createWeeklySyncItemSchema = weeklySyncItemSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const updateWeeklySyncItemSchema = weeklySyncItemSchema.partial().required({ id: true });

export const createWeeklySyncItemFileSchema = weeklySyncItemFileSchema.omit({ id: true, createdAt: true, filePath: true }).extend({
  fileName: z.string(),
  data: z.string(),
  isText: z.boolean().default(false),
});
export const updateWeeklySyncItemFileSchema = weeklySyncItemFileSchema.partial().required({ id: true });

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

export type WeeklySync = z.infer<typeof weeklySyncSchema>;
export type WeeklySyncItem = z.infer<typeof weeklySyncItemSchema>;
export type WeeklySyncItemFile = z.infer<typeof weeklySyncItemFileSchema>;
export type CreateWeeklySync = z.infer<typeof createWeeklySyncSchema>;
export type UpdateWeeklySync = z.infer<typeof updateWeeklySyncSchema>;
export type CreateWeeklySyncItem = z.infer<typeof createWeeklySyncItemSchema>;
export type UpdateWeeklySyncItem = z.infer<typeof updateWeeklySyncItemSchema>;
export type CreateWeeklySyncItemFile = z.infer<typeof createWeeklySyncItemFileSchema>;
export type UpdateWeeklySyncItemFile = z.infer<typeof updateWeeklySyncItemFileSchema>;

// Data format for file operations (for compatibility)
export const goalsDataSchema = z.object({
  version: z.string(),
  values: z.array(valueSchema),
  goals: z.array(goalSchema),
  connections: z.array(connectionSchema),
  lastModified: z.string(),
});

export type GoalsData = z.infer<typeof goalsDataSchema>;
