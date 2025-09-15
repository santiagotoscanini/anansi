import { pgTable, text, integer, real, boolean, timestamp, json } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

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
  importance: integer("importance").notNull(),
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

// WeeklyReviews table
export const weeklyReviews = pgTable("weekly_reviews", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  week: text("week").notNull(),
  notes: text("notes").notNull(),
  photos: json("photos").$type<string[]>().notNull().default([]),
  categories: json("categories").$type<string[]>().notNull().default([]),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
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

// Weekly Review-Goal junction table (many-to-many relationship)
export const weeklyReviewGoals = pgTable("weekly_review_goals", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  weeklyReviewId: text("weekly_review_id")
    .notNull()
    .references(() => weeklyReviews.id, { onDelete: "cascade" }),
  goalId: text("goal_id")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  values: many(values),
  goals: many(goals),
  weeklyReviews: many(weeklyReviews),
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
  goalValues: many(goalValues),
  weeklyReviewGoals: many(weeklyReviewGoals),
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

export const weeklyReviewsRelations = relations(weeklyReviews, ({ one, many }) => ({
  user: one(users, {
    fields: [weeklyReviews.userId],
    references: [users.id],
  }),
  weeklyReviewGoals: many(weeklyReviewGoals),
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

export const weeklyReviewGoalsRelations = relations(weeklyReviewGoals, ({ one }) => ({
  weeklyReview: one(weeklyReviews, {
    fields: [weeklyReviewGoals.weeklyReviewId],
    references: [weeklyReviews.id],
  }),
  goal: one(goals, {
    fields: [weeklyReviewGoals.goalId],
    references: [goals.id],
  }),
}));