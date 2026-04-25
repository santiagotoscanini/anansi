import { z } from "zod";

// Shared types based on the database schema
export const valueSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
});

// Behaviors that confirm a value — short evidence sentences attached per value.
export const valueBehaviorSchema = z.object({
  id: z.string(),
  valueId: z.string(),
  content: z.string().min(1).max(500),
  orderIdx: z.number().int().default(0),
});

export const createValueBehaviorSchema = z.object({
  valueId: z.string(),
  content: z.string().min(1).max(500),
});

export const reorderValueBehaviorsSchema = z.object({
  valueId: z.string(),
  ordering: z.array(z.object({ id: z.string(), orderIdx: z.number().int() })),
});

export type ValueBehavior = z.infer<typeof valueBehaviorSchema>;
export type CreateValueBehavior = z.infer<typeof createValueBehaviorSchema>;
export type ReorderValueBehaviors = z.infer<typeof reorderValueBehaviorsSchema>;

export const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  completed: z.boolean(),
  referentIds: z.array(z.string()).default([]),
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

// Tracking items are user-owned. goalId is optional — null/undefined means
// "unscoped" (the item lives in the user's library without being linked to
// a particular goal). The deletedAt soft-delete column is preserved for
// historical syncs that referenced an item that's since been removed.
export const trackingItemSchema = z.object({
  id: z.string(),
  goalId: z.string().nullable().optional(),
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
  templateId: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const weeklySyncItemSchema = z.object({
  id: z.string(),
  weeklySyncId: z.string(),
  trackingItemId: z.string(),
  textContent: z.string().nullable().optional(),
  orderIdx: z.number().int().default(0),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const syncTemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  isDefault: z.boolean().default(false),
});

export const attachmentSchema = z.object({
  id: z.string(),
  parentType: z.string(),
  parentId: z.string(),
  fileName: z.string(),
  fileType: z.enum(["image", "document", "video", "audio", "other"]),
  storagePath: z.string(),
  sizeBytes: z.number().int().nullable().optional(),
  createdAt: z.date(),
});

// Personal CRM — People and Self
export const personCategoryValues = ["to_process", "exploring", "long_term", "context_bound"] as const;

export const personSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  emoji: z.string().nullable().optional(),
  category: z.enum(personCategoryValues),
  boardOrder: z.number().int().default(0),
  appreciation: z.string().nullable().optional(),
  myNeeds: z.string().nullable().optional(),
  legacyMessage: z.string().nullable().optional(),
  selfReflection: z.string().nullable().optional(),
  decideBy: z.coerce.date().nullable().optional(),
  archivedAt: z.coerce.date().nullable().optional(),
});

export const selfSchema = z.object({
  identityNotes: z.string().nullable().optional(),
  patterns: z.string().nullable().optional(),
  currentWork: z.string().nullable().optional(),
});

export const personGroupSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  color: z.string().min(1),
  orderIdx: z.number().int().default(0),
});

export const giftIdeaSchema = z.object({
  id: z.string(),
  personId: z.string(),
  content: z.string().min(1),
  createdAt: z.coerce.date(),
});

export const createGiftIdeaSchema = z.object({
  personId: z.string(),
  content: z.string().min(1).max(500),
});

// Bucket list — things the user wants to do before dying
export const bucketListItemSchema = z.object({
  id: z.string(),
  content: z.string().min(1),
  description: z.string().nullable(),
  completedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  personIds: z.array(z.string()).default([]),
});

export const createBucketListItemSchema = z.object({
  content: z.string().min(1).max(500),
  description: z.string().max(2000).nullable().optional(),
  personIds: z.array(z.string()).optional().default([]),
});

export const updateBucketListItemSchema = z.object({
  id: z.string(),
  content: z.string().min(1).max(500),
  description: z.string().max(2000).nullable().optional(),
  personIds: z.array(z.string()).optional(),
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

// Create payload: title required, goalId + description + order optional. userId
// comes from ctx so it's not part of the input.
export const createTrackingItemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  goalId: z.string().nullable().optional(),
  order: z.number().int().optional(),
});
export const updateTrackingItemSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  goalId: z.string().nullable().optional(),
  order: z.number().int().optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export const createWeeklySyncSchema = z.object({
  weekDate: z.date(),
  templateId: z.string().nullable().optional(),
});
export const updateWeeklySyncSchema = weeklySyncSchema.partial().required({ id: true });

// Sync template inputs.
export const createSyncTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  isDefault: z.boolean().optional(),
});
export const updateSyncTemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  isDefault: z.boolean().optional(),
});
export const setSyncTemplateItemsSchema = z.object({
  templateId: z.string(),
  items: z.array(
    z.object({
      trackingItemId: z.string(),
      orderIdx: z.number().int(),
    }),
  ),
});

// Sync item operations within an active sync.
export const addSyncItemSchema = z.object({
  weeklySyncId: z.string(),
  trackingItemId: z.string(),
});
export const removeSyncItemSchema = z.object({
  weeklySyncItemId: z.string(),
});
export const setSyncItemTextSchema = z.object({
  weeklySyncItemId: z.string(),
  textContent: z.string(),
});
export const reorderSyncItemsSchema = z.object({
  weeklySyncId: z.string(),
  ordering: z.array(
    z.object({
      id: z.string(),
      orderIdx: z.number().int(),
    }),
  ),
});

// Generic attachments upload — base64 binary data into a polymorphic parent.
// Today only `parent_type = 'weekly_sync_item'` is supported, but the schema
// is permissive so we can extend later without another migration.
export const uploadAttachmentSchema = z.object({
  parentType: z.literal("weekly_sync_item"),
  parentId: z.string(),
  fileName: z.string().min(1).max(500),
  fileType: z.enum(["image", "document", "video", "audio", "other"]),
  data: z.string(), // base64
});

export const createPersonSchema = personSchema.omit({ id: true, archivedAt: true }).extend({
  groupIds: z.array(z.string()).optional().default([]),
});
export const updatePersonSchema = personSchema
  .partial()
  .required({ id: true })
  .extend({
    groupIds: z.array(z.string()).optional(),
  });

export const createPersonGroupSchema = personGroupSchema.omit({ id: true });
export const updatePersonGroupSchema = personGroupSchema.partial().required({ id: true });

export const updateSelfSchema = selfSchema;

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
export type CreateWeeklySync = z.infer<typeof createWeeklySyncSchema>;
export type UpdateWeeklySync = z.infer<typeof updateWeeklySyncSchema>;

export type SyncTemplate = z.infer<typeof syncTemplateSchema>;
export type CreateSyncTemplate = z.infer<typeof createSyncTemplateSchema>;
export type UpdateSyncTemplate = z.infer<typeof updateSyncTemplateSchema>;
export type SetSyncTemplateItems = z.infer<typeof setSyncTemplateItemsSchema>;

export type AddSyncItem = z.infer<typeof addSyncItemSchema>;
export type RemoveSyncItem = z.infer<typeof removeSyncItemSchema>;
export type SetSyncItemText = z.infer<typeof setSyncItemTextSchema>;
export type ReorderSyncItems = z.infer<typeof reorderSyncItemsSchema>;

export type Attachment = z.infer<typeof attachmentSchema>;
export type UploadAttachment = z.infer<typeof uploadAttachmentSchema>;

export type Person = z.infer<typeof personSchema>;
export type CreatePerson = z.infer<typeof createPersonSchema>;
export type UpdatePerson = z.infer<typeof updatePersonSchema>;
export type PersonCategory = (typeof personCategoryValues)[number];
export type Self = z.infer<typeof selfSchema>;
export type UpdateSelf = z.infer<typeof updateSelfSchema>;
export type PersonGroup = z.infer<typeof personGroupSchema>;
export type CreatePersonGroup = z.infer<typeof createPersonGroupSchema>;
export type UpdatePersonGroup = z.infer<typeof updatePersonGroupSchema>;
export type GiftIdea = z.infer<typeof giftIdeaSchema>;
export type CreateGiftIdea = z.infer<typeof createGiftIdeaSchema>;
export type BucketListItem = z.infer<typeof bucketListItemSchema>;
export type CreateBucketListItem = z.infer<typeof createBucketListItemSchema>;
export type UpdateBucketListItem = z.infer<typeof updateBucketListItemSchema>;

// Data format for file operations (for compatibility)
export const goalsDataSchema = z.object({
  version: z.string(),
  values: z.array(valueSchema),
  goals: z.array(goalSchema),
  connections: z.array(connectionSchema),
  lastModified: z.string(),
});

export type GoalsData = z.infer<typeof goalsDataSchema>;

// Full backup export/import schema — userId-neutral.
// Bumped to version 2 with the sync redesign:
//   - tracking_items.goalId is now nullable (can be unscoped)
//   - weekly_sync_items carries text_content + order_idx inline
//   - weekly_sync_item_files is gone; attachments table replaces it
//   - sync_templates / sync_template_items added
// Files referenced by attachments are still base64-payloaded into `files[]`,
// keyed by attachment id so the import can write to a fresh storage path.
export const backupValueSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const backupGoalSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  emoji: z.string().nullable(),
  parentId: z.string().nullable(),
  positionX: z.number(),
  positionY: z.number(),
  status: z.enum(["active", "archived"]),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const backupTaskSchema = z.object({
  id: z.string(),
  goalId: z.string(),
  title: z.string(),
  difficulty: z.number().int(),
  completed: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const backupConnectionSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  weight: z.number(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const backupGoalValueSchema = z.object({
  id: z.string(),
  goalId: z.string(),
  valueId: z.string(),
  createdAt: z.coerce.date(),
});

export const backupTrackingItemSchema = z.object({
  id: z.string(),
  goalId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  order: z.number().int(),
  status: z.enum(["active", "archived"]),
  deletedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const backupWeeklySyncSchema = z.object({
  id: z.string(),
  weekDate: z.coerce.date(),
  templateId: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const backupWeeklySyncItemSchema = z.object({
  id: z.string(),
  weeklySyncId: z.string(),
  trackingItemId: z.string(),
  textContent: z.string().nullable(),
  orderIdx: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const backupSyncTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const backupSyncTemplateItemSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  trackingItemId: z.string(),
  orderIdx: z.number().int(),
  createdAt: z.coerce.date(),
});

export const backupAttachmentSchema = z.object({
  id: z.string(),
  parentType: z.string(),
  parentId: z.string(),
  fileName: z.string(),
  fileType: z.enum(["image", "document", "video", "audio", "other"]),
  storagePath: z.string(),
  sizeBytes: z.number().int().nullable(),
  createdAt: z.coerce.date(),
});

export const backupPersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string().nullable(),
  category: z.enum(personCategoryValues),
  boardOrder: z.number().int().optional().default(0),
  appreciation: z.string().nullable(),
  myNeeds: z.string().nullable().optional().default(null),
  legacyMessage: z.string().nullable().optional().default(null),
  selfReflection: z.string().nullable(),
  decideBy: z.coerce.date().nullable(),
  archivedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const backupTaskReferentSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  personId: z.string(),
  createdAt: z.coerce.date(),
});

export const backupPersonGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  orderIdx: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const backupPeopleToGroupSchema = z.object({
  id: z.string(),
  personId: z.string(),
  groupId: z.string(),
  createdAt: z.coerce.date(),
});

export const backupGiftIdeaSchema = z.object({
  id: z.string(),
  personId: z.string(),
  content: z.string(),
  createdAt: z.coerce.date(),
});

export const backupBucketListItemSchema = z.object({
  id: z.string(),
  content: z.string(),
  description: z.string().nullable().optional().default(null),
  completedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const backupBucketListItemPeopleSchema = z.object({
  id: z.string(),
  bucketItemId: z.string(),
  personId: z.string(),
  createdAt: z.coerce.date(),
});

export const backupUserSelfSchema = z.object({
  id: z.string(),
  identityNotes: z.string().nullable(),
  patterns: z.string().nullable(),
  currentWork: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// Files in the backup are now keyed by attachment id (not file path).
export const backupFileSchema = z.object({
  attachmentId: z.string(),
  // Base64-encoded content. `data:<mime>;base64,...` prefix permitted but not required.
  data: z.string(),
});

export const backupSchema = z.object({
  version: z.literal(2),
  exportedAt: z.coerce.date(),
  user: z.object({
    name: z.string(),
    email: z.string(),
  }),
  values: z.array(backupValueSchema),
  goals: z.array(backupGoalSchema),
  tasks: z.array(backupTaskSchema),
  connections: z.array(backupConnectionSchema),
  goalValues: z.array(backupGoalValueSchema),
  trackingItems: z.array(backupTrackingItemSchema),
  weeklySync: z.array(backupWeeklySyncSchema),
  weeklySyncItems: z.array(backupWeeklySyncItemSchema),
  syncTemplates: z.array(backupSyncTemplateSchema).default([]),
  syncTemplateItems: z.array(backupSyncTemplateItemSchema).default([]),
  attachments: z.array(backupAttachmentSchema).default([]),
  files: z.array(backupFileSchema),
  people: z.array(backupPersonSchema).optional().default([]),
  userSelf: backupUserSelfSchema.nullable().optional().default(null),
  taskReferents: z.array(backupTaskReferentSchema).optional().default([]),
  personGroups: z.array(backupPersonGroupSchema).optional().default([]),
  peopleToGroups: z.array(backupPeopleToGroupSchema).optional().default([]),
  giftIdeas: z.array(backupGiftIdeaSchema).optional().default([]),
  bucketListItems: z.array(backupBucketListItemSchema).optional().default([]),
  bucketListItemPeople: z.array(backupBucketListItemPeopleSchema).optional().default([]),
});

export type Backup = z.infer<typeof backupSchema>;
