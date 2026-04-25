import { pgTable, text, integer, real, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

// Enums
export const importanceEnum = pgEnum("importance", ["Low", "Medium", "High"]);
export const fileTypeEnum = pgEnum("file_type", ["image", "document", "video", "audio", "other"]);
export const goalStatusEnum = pgEnum("goal_status", ["active", "archived"]);
export const trackingItemStatusEnum = pgEnum("tracking_item_status", ["active", "archived"]);
export const personCategoryEnum = pgEnum("person_category", ["to_process", "exploring", "long_term", "context_bound"]);
// Users table
export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
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
  emoji: text("emoji"), // Stores either native emoji or URL to custom emoji image
  parentId: text("parent_id"),
  positionX: real("position_x").notNull(),
  positionY: real("position_y").notNull(),
  status: goalStatusEnum("status").notNull().default("active"),
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
  status: trackingItemStatusEnum("status").notNull().default("active"),
  deletedAt: timestamp("deleted_at"),
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
  weekDate: timestamp("week_date").notNull(), // Monday of the retrospective week
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
  filePath: text("file_path").notNull(),
  fileType: fileTypeEnum("file_type").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// People table (Personal CRM)
export const people = pgTable("people", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  emoji: text("emoji"),
  category: personCategoryEnum("category").notNull(),
  boardOrder: integer("board_order").notNull().default(0),
  appreciation: text("appreciation"),
  myNeeds: text("my_needs"),
  legacyMessage: text("legacy_message"),
  selfReflection: text("self_reflection"),
  decideBy: timestamp("decide_by"),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Bucket list — things the user wants to do before dying. Flat list, scoped to user.
// completedAt nullable: null = pending, non-null = completed (timestamp records when).
// description holds longer-form context; people-to-do-with attached via junction.
export const bucketListItems = pgTable("bucket_list_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  description: text("description"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Junction: bucket list items ↔ people. "People I want to do this with."
// Cascade-deletes from either side.
export const bucketListItemPeople = pgTable("bucket_list_item_people", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  bucketItemId: text("bucket_item_id")
    .notNull()
    .references(() => bucketListItems.id, { onDelete: "cascade" }),
  personId: text("person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Gift ideas — a list of gestures/gifts captured per person. Captured when noticed
// (not when needed) so the well doesn't run dry. Separate table so each idea has
// its own timestamp and can be deleted atomically once given.
export const giftIdeas = pgTable("gift_ideas", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  personId: text("person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Task-Referent junction (many-to-many: a task can have multiple referent people,
// a person can be a referent on multiple tasks).
export const taskReferents = pgTable("task_referents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  personId: text("person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Person groups — user-defined tags (Family, Work, University, etc.). A person
// can belong to multiple groups; a group can contain multiple people.
export const personGroups = pgTable("person_groups", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull(),
  orderIdx: integer("order_idx").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const peopleToGroups = pgTable("people_to_groups", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  personId: text("person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  groupId: text("group_id")
    .notNull()
    .references(() => personGroups.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// User Self table (one row per user — the Self space is structurally distinct from a Person)
export const userSelf = pgTable("user_self", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  identityNotes: text("identity_notes"),
  patterns: text("patterns"),
  currentWork: text("current_work"),
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

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  values: many(values),
  goals: many(goals),
  weeklySync: many(weeklySync),
  people: many(people),
  personGroups: many(personGroups),
  bucketListItems: many(bucketListItems),
  self: one(userSelf, {
    fields: [users.id],
    references: [userSelf.userId],
  }),
}));

export const bucketListItemsRelations = relations(bucketListItems, ({ one, many }) => ({
  user: one(users, {
    fields: [bucketListItems.userId],
    references: [users.id],
  }),
  peopleLinks: many(bucketListItemPeople),
}));

export const bucketListItemPeopleRelations = relations(bucketListItemPeople, ({ one }) => ({
  bucketItem: one(bucketListItems, {
    fields: [bucketListItemPeople.bucketItemId],
    references: [bucketListItems.id],
  }),
  person: one(people, {
    fields: [bucketListItemPeople.personId],
    references: [people.id],
  }),
}));

export const peopleRelations = relations(people, ({ one, many }) => ({
  user: one(users, {
    fields: [people.userId],
    references: [users.id],
  }),
  taskReferents: many(taskReferents),
  groupMemberships: many(peopleToGroups),
  giftIdeas: many(giftIdeas),
}));

export const giftIdeasRelations = relations(giftIdeas, ({ one }) => ({
  person: one(people, {
    fields: [giftIdeas.personId],
    references: [people.id],
  }),
}));

export const personGroupsRelations = relations(personGroups, ({ one, many }) => ({
  user: one(users, {
    fields: [personGroups.userId],
    references: [users.id],
  }),
  memberships: many(peopleToGroups),
}));

export const peopleToGroupsRelations = relations(peopleToGroups, ({ one }) => ({
  person: one(people, {
    fields: [peopleToGroups.personId],
    references: [people.id],
  }),
  group: one(personGroups, {
    fields: [peopleToGroups.groupId],
    references: [personGroups.id],
  }),
}));

export const taskReferentsRelations = relations(taskReferents, ({ one }) => ({
  task: one(tasks, {
    fields: [taskReferents.taskId],
    references: [tasks.id],
  }),
  person: one(people, {
    fields: [taskReferents.personId],
    references: [people.id],
  }),
}));

export const userSelfRelations = relations(userSelf, ({ one }) => ({
  user: one(users, {
    fields: [userSelf.userId],
    references: [users.id],
  }),
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

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  goal: one(goals, {
    fields: [tasks.goalId],
    references: [goals.id],
  }),
  referents: many(taskReferents),
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
