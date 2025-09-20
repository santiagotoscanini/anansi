import { pgTable, text, integer, real, boolean, timestamp, json, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

// Enums
export const importanceEnum = pgEnum("importance", ["Low", "Medium", "High"]);
export const fileTypeEnum = pgEnum("file_type", ["image", "document", "video", "audio", "other"]);

// Users table
export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Values table
export const values = pgTable("values", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  color: text("color").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Goals table
export const goals = pgTable("goals", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  title: text("title").notNull(),
  description: text("description").notNull(),
  parentId: text("parent_id"),
  positionX: real("position_x").notNull(),
  positionY: real("position_y").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Tasks table
export const tasks = pgTable("tasks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  goalId: text("goal_id")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  difficulty: integer("difficulty").notNull(), // 1, 2, or 3
  completed: boolean("completed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Connections table
export const connections = pgTable("connections", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  source: text("source")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  target: text("target")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  weight: real("weight").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Tracking Items table
export const trackingItems = pgTable("tracking_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  goalId: text("goal_id")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Weekly Sync table
export const weeklySync = pgTable("weekly_sync", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  weekDate: timestamp("week_date").notNull(), // Date of the week (e.g., Monday of that week)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Weekly Sync Items table
export const weeklySyncItems = pgTable("weekly_sync_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  weeklySyncId: text("weekly_sync_id")
    .notNull()
    .references(() => weeklySync.id, { onDelete: "cascade" }),
  trackingItemId: text("tracking_item_id")
    .notNull()
    .references(() => trackingItems.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Weekly Sync Item Files table
export const weeklySyncItemFiles = pgTable("weekly_sync_item_files", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  weeklySyncItemId: text("weekly_sync_item_id")
    .notNull()
    .references(() => weeklySyncItems.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileType: fileTypeEnum("file_type").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});


// Goal-Value junction table (many-to-many relationship)
export const goalValues = pgTable("goal_values", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  goalId: text("goal_id")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  valueId: text("value_id")
    .notNull()
    .references(() => values.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  values: many(values),
  goals: many(goals),
  weeklySync: many(weeklySync),
}));

export const valuesRelations = relations(values, ({ one, many }) => ({
  user: one(users, {
    fields: [values.userId],
    references: [users.id],
  }),
  goalValues: many(goalValues),
}));

export const goalsRelations = relations(goals, ({ one, many }) => ({
  user: one(users, {
    fields: [goals.userId],
    references: [users.id],
  }),
  parent: one(goals, {
    fields: [goals.parentId],
    references: [goals.id],
  }),
  children: many(goals),
  tasks: many(tasks),
  trackingItems: many(trackingItems),
  goalValues: many(goalValues),
  sourceConnections: many(connections, {
    relationName: "source",
  }),
  targetConnections: many(connections, {
    relationName: "target",
  }),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  goal: one(goals, {
    fields: [tasks.goalId],
    references: [goals.id],
  }),
}));

export const connectionsRelations = relations(connections, ({ one }) => ({
  sourceGoal: one(goals, {
    fields: [connections.source],
    references: [goals.id],
    relationName: "source",
  }),
  targetGoal: one(goals, {
    fields: [connections.target],
    references: [goals.id],
    relationName: "target",
  }),
}));

export const trackingItemsRelations = relations(trackingItems, ({ one, many }) => ({
  goal: one(goals, {
    fields: [trackingItems.goalId],
    references: [goals.id],
  }),
  weeklySyncItems: many(weeklySyncItems),
}));

export const weeklySyncRelations = relations(weeklySync, ({ one, many }) => ({
  user: one(users, {
    fields: [weeklySync.userId],
    references: [users.id],
  }),
  weeklySyncItems: many(weeklySyncItems),
}));

export const weeklySyncItemsRelations = relations(weeklySyncItems, ({ one, many }) => ({
  weeklySync: one(weeklySync, {
    fields: [weeklySyncItems.weeklySyncId],
    references: [weeklySync.id],
  }),
  trackingItem: one(trackingItems, {
    fields: [weeklySyncItems.trackingItemId],
    references: [trackingItems.id],
  }),
  files: many(weeklySyncItemFiles),
}));

export const weeklySyncItemFilesRelations = relations(weeklySyncItemFiles, ({ one }) => ({
  weeklySyncItem: one(weeklySyncItems, {
    fields: [weeklySyncItemFiles.weeklySyncItemId],
    references: [weeklySyncItems.id],
  }),
}));

export const goalValuesRelations = relations(goalValues, ({ one }) => ({
  goal: one(goals, {
    fields: [goalValues.goalId],
    references: [goals.id],
  }),
  value: one(values, {
    fields: [goalValues.valueId],
    references: [values.id],
  }),
}));
