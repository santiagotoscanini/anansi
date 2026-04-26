import { pgTable, text, integer, real, boolean, timestamp, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

// Enums
export const importanceEnum = pgEnum("importance", ["Low", "Medium", "High"]);
export const fileTypeEnum = pgEnum("file_type", ["image", "document", "video", "audio", "other"]);
export const goalStatusEnum = pgEnum("goal_status", ["active", "archived"]);
export const trackingItemStatusEnum = pgEnum("tracking_item_status", ["active", "archived"]);
export const personCategoryEnum = pgEnum("person_category", ["to_process", "exploring", "long_term", "context_bound"]);
// Living-portrait list buckets on the Self page. Most rows are short, list-shaped
// items (energizers, drainers, just-for-me, triggers, releases, year-ahead);
// patterns are also rows but additionally carry a `pattern_category` so they
// group on the page (relational / self / communication / body-state / choice).
export const selfListKindEnum = pgEnum("self_list_kind", [
  "energizer",
  "drainer",
  "just_for_me",
  "proud",
  "pattern",
  "trigger",
  "release",
  "year_ahead",
]);
export const selfPatternCategoryEnum = pgEnum("self_pattern_category", [
  "relational",
  "self_pattern",
  "communication",
  "body_state",
  "choice",
]);
// Users table
export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  avatarUrl: text("avatar_url"),
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

// Behaviors that confirm a value — concrete actions or habits the user uses
// as evidence they're living a value (e.g. Family → "Date night every
// Saturday"). Atomic rows so one can be added/removed without rewriting the
// rest. orderIdx is per-value position; created_at preserved for "captured at"
// nostalgia and as a tiebreaker if orderIdx ties.
export const valueBehaviors = pgTable("value_behaviors", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  valueId: text("value_id")
    .notNull()
    .references(() => values.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  orderIdx: integer("order_idx").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Goals table
export const goals = pgTable(
  "goals",
  {
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
  },
  // Every getAll filters by (userId, status='active'); we also list children
  // by parentId. These are the hot read paths on the canvas.
  (t) => [index("goals_user_status_idx").on(t.userId, t.status), index("goals_parent_idx").on(t.parentId)],
);

// Tasks table
export const tasks = pgTable(
  "tasks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    goalId: text("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    emoji: text("emoji"), // Native emoji or URL to custom emoji image — distinct from the parent goal's emoji
    difficulty: integer("difficulty").notNull(), // 1, 2, or 3
    completed: boolean("completed").notNull().default(false),
    // Single deadline date for the task. Null = unscheduled (sits in the
    // Horizons "Backlog" lane). The Horizons board buckets tasks into
    // monthly/quarterly/yearly columns by COMPUTING which bucket the date
    // falls into right now (auto-rollup): a task scheduled for September 15
    // sits in Yearly until July arrives, then in Quarterly through August,
    // then promotes to Monthly when September starts. This replaces the
    // earlier horizon enum + horizonAt anchor — same idea, simpler primitive.
    scheduledAt: timestamp("scheduled_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  // Every per-goal task fetch joins on goal_id; the Horizons board scans
  // by scheduled_at for non-null, non-completed tasks.
  (t) => [index("tasks_goal_idx").on(t.goalId), index("tasks_scheduled_idx").on(t.scheduledAt)],
);

// Connections table
export const connections = pgTable(
  "connections",
  {
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
  },
  // Importance/progress calculations scan outgoing edges by source; the
  // graph also queries incoming edges by target.
  (t) => [index("connections_source_idx").on(t.source), index("connections_target_idx").on(t.target)],
);

// Tracking Items table
//
// Items are user-owned. goalId is OPTIONAL — items live in the user's library
// regardless of any goal association, and unlinked items appear as "Unscoped"
// in the UI. Goal deletion sets goalId NULL (not cascade) so the item survives.
export const trackingItems = pgTable(
  "tracking_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: text("goal_id").references(() => goals.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    order: integer("order").notNull().default(0),
    status: trackingItemStatusEnum("status").notNull().default("active"),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("tracking_items_user_idx").on(t.userId)],
);

// Weekly Sync table
//
// One row per user per week. templateId is the snapshot source: when create
// runs against a template, every sync_template_items row is materialized into
// a weekly_sync_items row with the same orderIdx. Going forward the sync can
// be edited (add/remove items, reorder) without affecting the template.
export const weeklySync = pgTable(
  "weekly_sync",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekDate: timestamp("week_date").notNull(), // Monday of the retrospective week
    templateId: text("template_id").references(() => syncTemplates.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  // getByWeek and getWeeklyRetrospectiveData filter by (userId, weekDate);
  // unique because there's exactly one sync per user per week.
  (t) => [uniqueIndex("weekly_sync_user_week_unique").on(t.userId, t.weekDate)],
);

// Weekly Sync Items table
//
// textContent holds the user's notes inline (no more notes.txt on disk).
// orderIdx is per-sync ordering — initialized from the template's order at
// create time, but mutable per sync via reorderItems.
export const weeklySyncItems = pgTable(
  "weekly_sync_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    weeklySyncId: text("weekly_sync_id")
      .notNull()
      .references(() => weeklySync.id, { onDelete: "cascade" }),
    trackingItemId: text("tracking_item_id")
      .notNull()
      .references(() => trackingItems.id, { onDelete: "cascade" }),
    textContent: text("text_content"),
    orderIdx: integer("order_idx").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  // Every retrospective render reads (weekly_sync_id, order_idx) — give it
  // a covering index so the ORDER BY doesn't sort.
  (t) => [index("weekly_sync_items_sync_order_idx").on(t.weeklySyncId, t.orderIdx)],
);

// Sync templates — named bundles of tracking items. A template is the default
// recipe for what a sync covers; the partial unique index below enforces
// "at most one default per user" so a fresh weekly sync knows what to snapshot.
export const syncTemplates = pgTable(
  "sync_templates",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sync_templates_one_default_per_user")
      .on(t.userId)
      .where(sql`is_default = true`),
  ],
);

// Junction: which tracking items a template includes, and in what order.
// (template_id, tracking_item_id) is unique — an item can only appear once per template.
export const syncTemplateItems = pgTable(
  "sync_template_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    templateId: text("template_id")
      .notNull()
      .references(() => syncTemplates.id, { onDelete: "cascade" }),
    trackingItemId: text("tracking_item_id")
      .notNull()
      .references(() => trackingItems.id, { onDelete: "cascade" }),
    orderIdx: integer("order_idx").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sync_template_items_pair_unique").on(t.templateId, t.trackingItemId)],
);

// Generic polymorphic attachments table. parent_type discriminates
// ('weekly_sync_item' is the only producer today; designed to extend to other
// entities later). Storage path is uploads/{userId}/attachments/{id}.{ext},
// decoupled from goal/tracking-item ids so items without goals can still hold files.
export const attachments = pgTable(
  "attachments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentType: text("parent_type").notNull(),
    parentId: text("parent_id").notNull(),
    fileName: text("file_name").notNull(),
    fileType: fileTypeEnum("file_type").notNull(),
    storagePath: text("storage_path").notNull(),
    sizeBytes: integer("size_bytes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("attachments_parent_idx").on(t.parentType, t.parentId), index("attachments_user_idx").on(t.userId)],
);

// People table (Personal CRM)
export const people = pgTable(
  "people",
  {
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
  },
  (t) => [index("people_user_idx").on(t.userId)],
);

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

// Next bids — actionable things I can do to improve a relationship: a gift,
// a gesture, a check-in, an apology. Captured when noticed (not when needed)
// so the well doesn't run dry. Each row has an optional deadline (`dueAt`)
// and a completion marker (`completedAt`) — done bids stay visible (struck
// through) instead of being deleted, so the trail of fulfilled bids is preserved.
export const nextBids = pgTable(
  "next_bids",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    personId: text("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    dueAt: timestamp("due_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  // Pulse drives `listUpcoming` off open bids by person — partial index on
  // (person_id) WHERE completed_at IS NULL keeps it tiny and fast.
  (t) => [
    index("next_bids_person_idx").on(t.personId),
    index("next_bids_open_idx").on(t.personId).where(sql`completed_at IS NULL`),
  ],
);

// Important dates — yearly-recurring dates per person (birthday, anniversary,
// graduation, etc.). `month`/`day` define the recurrence; `year` is optional
// (the original year, used for "turning N this year" math). Surfaces in Pulse
// when the next occurrence is within the upcoming window. NOT the same as
// next_bids (`due_at`) — bids are one-shot deadlines, important dates repeat.
export const importantDates = pgTable(
  "important_dates",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    personId: text("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    month: integer("month").notNull(),
    day: integer("day").notNull(),
    year: integer("year"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("important_dates_person_idx").on(t.personId)],
);

// Task-Referent junction (many-to-many: a task can have multiple referent people,
// a person can be a referent on multiple tasks).
export const taskReferents = pgTable(
  "task_referents",
  {
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
  },
  // GoalNode reads referents per-task; PersonModal reads them per-person.
  (t) => [index("task_referents_task_idx").on(t.taskId), index("task_referents_person_idx").on(t.personId)],
);

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

// Tasks ↔ groups. Same `person_groups` rows the people side uses — the
// group concept is intentionally cross-entity ("Family" can hold both my
// partner and the "call mom" task). Cascade-deletes on both sides.
export const tasksToGroups = pgTable("tasks_to_groups", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  groupId: text("group_id")
    .notNull()
    .references(() => personGroups.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// User Self table — one row per user, the substrate of the living-portrait Self
// page. Prose-shaped fields (this-year description, story, attachment, love
// languages, apology language, conflict style, stress response, note to future
// self) live on this row; list-shaped buckets (energizers/drainers, just-for-me,
// patterns, triggers, releases, year-ahead) live in `self_list_items` instead so
// users can add/remove a single item without rewriting prose.
export const userSelf = pgTable("user_self", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  // Living-portrait prose fields. `descriptionYear` is the calendar year the
  // current `thisYearSelfDescription` was written for — when the user opens
  // a new year, the UI offers to archive the previous one.
  thisYearSelfDescription: text("this_year_self_description"),
  descriptionYear: integer("description_year"),
  myStory: text("my_story"),
  attachmentTendencies: text("attachment_tendencies"),
  loveLanguageGive: text("love_language_give"),
  loveLanguageReceive: text("love_language_receive"),
  apologyLanguage: text("apology_language"),
  conflictStyle: text("conflict_style"),
  stressResponse: text("stress_response"),
  noteToFutureSelf: text("note_to_future_self"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Self list items — atomic rows for every list-shaped section on the Self page.
// One table for all kinds keeps the surface small and lets the UI treat them
// uniformly (add a row, edit content, delete, reorder). `patternCategory` is
// only meaningful when `kind = 'pattern'` — null for every other kind.
export const selfListItems = pgTable(
  "self_list_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: selfListKindEnum("kind").notNull(),
    patternCategory: selfPatternCategoryEnum("pattern_category"),
    content: text("content").notNull(),
    orderIdx: integer("order_idx").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("self_list_items_user_kind_idx").on(t.userId, t.kind)],
);

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
  trackingItems: many(trackingItems),
  syncTemplates: many(syncTemplates),
  attachments: many(attachments),
  people: many(people),
  personGroups: many(personGroups),
  bucketListItems: many(bucketListItems),
  self: one(userSelf, {
    fields: [users.id],
    references: [userSelf.userId],
  }),
  selfListItems: many(selfListItems),
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
  nextBids: many(nextBids),
  importantDates: many(importantDates),
}));

export const nextBidsRelations = relations(nextBids, ({ one }) => ({
  person: one(people, {
    fields: [nextBids.personId],
    references: [people.id],
  }),
}));

export const importantDatesRelations = relations(importantDates, ({ one }) => ({
  person: one(people, {
    fields: [importantDates.personId],
    references: [people.id],
  }),
}));

export const personGroupsRelations = relations(personGroups, ({ one, many }) => ({
  user: one(users, {
    fields: [personGroups.userId],
    references: [users.id],
  }),
  memberships: many(peopleToGroups),
  taskMemberships: many(tasksToGroups),
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

export const selfListItemsRelations = relations(selfListItems, ({ one }) => ({
  user: one(users, {
    fields: [selfListItems.userId],
    references: [users.id],
  }),
}));

export const valuesRelations = relations(values, ({ one, many }) => ({
  user: one(users, {
    fields: [values.userId],
    references: [users.id],
  }),
  goalValues: many(goalValues),
  behaviors: many(valueBehaviors),
}));

export const valueBehaviorsRelations = relations(valueBehaviors, ({ one }) => ({
  value: one(values, {
    fields: [valueBehaviors.valueId],
    references: [values.id],
  }),
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
  groupMemberships: many(tasksToGroups),
}));

export const tasksToGroupsRelations = relations(tasksToGroups, ({ one }) => ({
  task: one(tasks, {
    fields: [tasksToGroups.taskId],
    references: [tasks.id],
  }),
  group: one(personGroups, {
    fields: [tasksToGroups.groupId],
    references: [personGroups.id],
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
  user: one(users, {
    fields: [trackingItems.userId],
    references: [users.id],
  }),
  goal: one(goals, {
    fields: [trackingItems.goalId],
    references: [goals.id],
  }),
  weeklySyncItems: many(weeklySyncItems),
  templateItems: many(syncTemplateItems),
}));

export const syncTemplatesRelations = relations(syncTemplates, ({ one, many }) => ({
  user: one(users, {
    fields: [syncTemplates.userId],
    references: [users.id],
  }),
  items: many(syncTemplateItems),
  syncs: many(weeklySync),
}));

export const syncTemplateItemsRelations = relations(syncTemplateItems, ({ one }) => ({
  template: one(syncTemplates, {
    fields: [syncTemplateItems.templateId],
    references: [syncTemplates.id],
  }),
  trackingItem: one(trackingItems, {
    fields: [syncTemplateItems.trackingItemId],
    references: [trackingItems.id],
  }),
}));

// Polymorphic — no declarative relation to parent. Resolve via app logic
// keyed on parentType ('weekly_sync_item' for now).
export const attachmentsRelations = relations(attachments, ({ one }) => ({
  user: one(users, {
    fields: [attachments.userId],
    references: [users.id],
  }),
}));

export const weeklySyncRelations = relations(weeklySync, ({ one, many }) => ({
  user: one(users, {
    fields: [weeklySync.userId],
    references: [users.id],
  }),
  template: one(syncTemplates, {
    fields: [weeklySync.templateId],
    references: [syncTemplates.id],
  }),
  weeklySyncItems: many(weeklySyncItems),
}));

export const weeklySyncItemsRelations = relations(weeklySyncItems, ({ one }) => ({
  weeklySync: one(weeklySync, {
    fields: [weeklySyncItems.weeklySyncId],
    references: [weeklySync.id],
  }),
  trackingItem: one(trackingItems, {
    fields: [weeklySyncItems.trackingItemId],
    references: [trackingItems.id],
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
