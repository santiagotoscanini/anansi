import { z } from 'zod'
import { isEmojiGlyph, isOurStorageImageUrl } from '../emoji-utils'
import { isCalendarDay } from '../journal'
import { overlaySchema } from '../overlay'

// `emoji` columns accept ONE of two shapes:
//   1. A short Unicode glyph (✨, 👨‍👩‍👧‍👦, …)
//   2. A Supabase Storage public URL we issued ourselves (people uploads)
// External URLs are rejected — pasting a third-party image lets an
// attacker exfiltrate the viewer's IP/Referer via a tracking pixel
// hidden in any directory the viewer renders. Public-URL trust is
// limited to our own bucket prefix; see isOurStorageImageUrl.
const emojiGlyphOnlySchema = z
  .string()
  .refine(isEmojiGlyph, 'Must be a short emoji glyph (no URLs, no slashes, no whitespace)')

const emojiOrOurImageSchema = z
  .string()
  .refine((v) => isEmojiGlyph(v) || isOurStorageImageUrl(v), 'Must be an emoji or an uploaded image URL')

// Shared types based on the database schema
export const valueSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
})

// Behaviors that confirm a value — short evidence sentences attached per value.
export const valueBehaviorSchema = z.object({
  id: z.string(),
  valueId: z.string(),
  content: z.string().min(1).max(500),
  orderIdx: z.number().int().default(0),
})

export const createValueBehaviorSchema = z.object({
  valueId: z.string(),
  content: z.string().min(1).max(500),
})

export const reorderValueBehaviorsSchema = z.object({
  valueId: z.string(),
  ordering: z.array(z.object({ id: z.string(), orderIdx: z.number().int() })),
})

export type ValueBehavior = z.infer<typeof valueBehaviorSchema>
export type CreateValueBehavior = z.infer<typeof createValueBehaviorSchema>
export type ReorderValueBehaviors = z.infer<typeof reorderValueBehaviorsSchema>

export const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  // Tasks accept emoji glyphs only — no upload affordance and no paste-URL UI.
  emoji: emojiGlyphOnlySchema.nullable().optional(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  completed: z.boolean(),
  // Single deadline date. Null = unscheduled (Backlog). The Horizons board
  // computes which monthly/quarterly/yearly bucket the task belongs to right
  // now from this date — see src/lib/horizon-period.ts.
  scheduledAt: z.coerce.date().nullable().optional(),
  referentIds: z.array(z.string()).default([]),
  groupIds: z.array(z.string()).default([]),
})

export const goalSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  // Goals accept emoji glyphs only — no upload affordance and no paste-URL UI.
  emoji: emojiGlyphOnlySchema.optional(),
  valueIds: z.array(z.string()),
  tasks: z.array(taskSchema),
  parentId: z.string().optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  importance: z.enum(['Low', 'Medium', 'High']).default('Low'),
  status: z.enum(['active', 'archived']).default('active'),
})

export const connectionSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  weight: z.number(),
})

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
  status: z.enum(['active', 'archived']).default('active'),
})

export const weeklySyncSchema = z.object({
  id: z.string(),
  userId: z.string(),
  weekDate: z.date(), // Monday of the retrospective week
  templateId: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const weeklySyncItemSchema = z.object({
  id: z.string(),
  weeklySyncId: z.string(),
  trackingItemId: z.string(),
  textContent: z.string().nullable().optional(),
  orderIdx: z.number().int().default(0),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const syncTemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  isDefault: z.boolean().default(false),
})

export const attachmentSchema = z.object({
  id: z.string(),
  parentType: z.string(),
  parentId: z.string(),
  fileName: z.string(),
  fileType: z.enum(['image', 'document', 'video', 'audio', 'other']),
  storagePath: z.string(),
  sizeBytes: z.number().int().nullable().optional(),
  createdAt: z.date(),
})

// Personal CRM — People and Self
export const personCategoryValues = ['to_process', 'exploring', 'long_term', 'context_bound'] as const

export const personSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  // People accept either an emoji glyph or a people-photos URL we issued
  // ourselves (via people.uploadImage). Pasted external URLs are rejected.
  emoji: emojiOrOurImageSchema.nullable().optional(),
  category: z.enum(personCategoryValues),
  boardOrder: z.number().int().default(0),
  appreciation: z.string().nullable().optional(),
  myNeeds: z.string().nullable().optional(),
  legacyMessage: z.string().nullable().optional(),
  selfReflection: z.string().nullable().optional(),
  decideBy: z.coerce.date().nullable().optional(),
  archivedAt: z.coerce.date().nullable().optional(),
})

// Living-portrait Self page. Prose fields are stored on user_self; list-shaped
// buckets live in self_list_items (see selfListKindValues below).
export const selfSchema = z.object({
  thisYearSelfDescription: z.string().nullable().optional(),
  descriptionYear: z.number().int().nullable().optional(),
  myStory: z.string().nullable().optional(),
  attachmentTendencies: z.string().nullable().optional(),
  loveLanguageGive: z.string().nullable().optional(),
  loveLanguageReceive: z.string().nullable().optional(),
  apologyLanguage: z.string().nullable().optional(),
  conflictStyle: z.string().nullable().optional(),
  stressResponse: z.string().nullable().optional(),
  noteToFutureSelf: z.string().nullable().optional(),
})

export const selfListKindValues = [
  'energizer',
  'drainer',
  'just_for_me',
  'proud',
  'pattern',
  'trigger',
  'release',
  'year_ahead',
] as const
export const selfPatternCategoryValues = [
  'relational',
  'self_pattern',
  'communication',
  'body_state',
  'choice',
] as const

export const selfListItemSchema = z.object({
  id: z.string(),
  kind: z.enum(selfListKindValues),
  patternCategory: z.enum(selfPatternCategoryValues).nullable().optional(),
  content: z.string().min(1).max(2000),
  orderIdx: z.number().int().default(0),
})

export const createSelfListItemSchema = z.object({
  kind: z.enum(selfListKindValues),
  patternCategory: z.enum(selfPatternCategoryValues).nullable().optional(),
  content: z.string().min(1).max(2000),
})

export const updateSelfListItemSchema = z.object({
  id: z.string(),
  content: z.string().min(1).max(2000).optional(),
  patternCategory: z.enum(selfPatternCategoryValues).nullable().optional(),
})

export const reorderSelfListItemsSchema = z.object({
  kind: z.enum(selfListKindValues),
  ordering: z.array(z.object({ id: z.string(), orderIdx: z.number().int() })),
})

export const personGroupSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  color: z.string().min(1),
  orderIdx: z.number().int().default(0),
})

export const nextBidSchema = z.object({
  id: z.string(),
  personId: z.string(),
  content: z.string().min(1),
  dueAt: z.coerce.date().nullable(),
  completedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
})

export const createNextBidSchema = z.object({
  personId: z.string(),
  content: z.string().min(1).max(500),
  dueAt: z.coerce.date().nullable().optional(),
})

export const updateNextBidSchema = z.object({
  id: z.string(),
  content: z.string().min(1).max(500).optional(),
  dueAt: z.coerce.date().nullable().optional(),
})

export const setNextBidCompletedSchema = z.object({
  id: z.string(),
  completed: z.boolean(),
})

export const importantDateSchema = z.object({
  id: z.string(),
  personId: z.string(),
  label: z.string().min(1),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  year: z.number().int().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const createImportantDateSchema = z.object({
  personId: z.string(),
  label: z.string().min(1).max(120),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  year: z.number().int().min(1).max(3000).nullable().optional(),
})

export const updateImportantDateSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(120).optional(),
  month: z.number().int().min(1).max(12).optional(),
  day: z.number().int().min(1).max(31).optional(),
  year: z.number().int().min(1).max(3000).nullable().optional(),
})

// Bucket list — things the user wants to do before dying
export const bucketListItemSchema = z.object({
  id: z.string(),
  content: z.string().min(1),
  description: z.string().nullable(),
  completedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  personIds: z.array(z.string()).default([]),
})

export const createBucketListItemSchema = z.object({
  content: z.string().min(1).max(500),
  description: z.string().max(2000).nullable().optional(),
  personIds: z.array(z.string()).optional().default([]),
})

export const updateBucketListItemSchema = z.object({
  id: z.string(),
  content: z.string().min(1).max(500),
  description: z.string().max(2000).nullable().optional(),
  personIds: z.array(z.string()).optional(),
})

// Input schemas for creating/updating
export const createValueSchema = valueSchema.omit({ id: true })
export const updateValueSchema = valueSchema.partial().required({ id: true })

export const createTaskSchema = taskSchema.omit({ id: true })
export const updateTaskSchema = taskSchema.partial().required({ id: true })

// The browser's wire shape for task writes: the task fields plus the goal that
// owns the task. `goalId` is not part of the task patch itself — the server
// derives ownership from the task id — it is there because the optimistic cache
// update in lib/mutations/goals-data.ts has to know which goal's task array to
// patch without refetching.
//
// Declared here rather than inline in tasks.fn.ts because a `.fn.ts` module may
// export ONLY server functions (see AGENTS.md), so a schema written there can
// never be shared and is guaranteed to drift from whatever the client assumes.
export const createTaskInputSchema = createTaskSchema.extend({ goalId: z.string() })
export const updateTaskInputSchema = updateTaskSchema.extend({ goalId: z.string() })

export const createGoalSchema = goalSchema.omit({ id: true, importance: true, status: true })
// `tasks` deliberately excluded from goal updates — task CRUD has its own
// per-task endpoints (goals.tasks.{create,update,delete}). Sending tasks
// here used to wipe + re-insert every task for the goal, which dropped
// referent and group memberships and burned task ids on every goal edit.
export const updateGoalSchema = goalSchema.omit({ importance: true, tasks: true }).partial().required({ id: true })

export const createConnectionSchema = connectionSchema.omit({ id: true })
export const updateConnectionSchema = connectionSchema.partial().required({ id: true })

// Create payload: title required, goalId + description + order optional. userId
// comes from ctx so it's not part of the input.
export const createTrackingItemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  goalId: z.string().nullable().optional(),
  order: z.number().int().optional(),
})
export const updateTrackingItemSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  goalId: z.string().nullable().optional(),
  order: z.number().int().optional(),
  status: z.enum(['active', 'archived']).optional(),
})

export const createWeeklySyncSchema = z.object({
  weekDate: z.date(),
  templateId: z.string().nullable().optional(),
})
export const updateWeeklySyncSchema = weeklySyncSchema.partial().required({ id: true })

// Sync template inputs.
export const createSyncTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  isDefault: z.boolean().optional(),
})
export const updateSyncTemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  isDefault: z.boolean().optional(),
})
export const setSyncTemplateItemsSchema = z.object({
  templateId: z.string(),
  items: z.array(
    z.object({
      trackingItemId: z.string(),
      orderIdx: z.number().int(),
    }),
  ),
})

// Sync item operations within an active sync.
export const addSyncItemSchema = z.object({
  weeklySyncId: z.string(),
  trackingItemId: z.string(),
})
export const removeSyncItemSchema = z.object({
  weeklySyncItemId: z.string(),
})
export const setSyncItemTextSchema = z.object({
  weeklySyncItemId: z.string(),
  textContent: z.string(),
})
export const reorderSyncItemsSchema = z.object({
  weeklySyncId: z.string(),
  ordering: z.array(
    z.object({
      id: z.string(),
      orderIdx: z.number().int(),
    }),
  ),
})

// Generic attachments upload — base64 binary data into a polymorphic parent.
// The parents today are a weekly sync item and a journal entry; the schema
// is permissive so another can join without a migration.
export const uploadAttachmentSchema = z.object({
  parentType: z.enum(['weekly_sync_item', 'journal_entry']),
  parentId: z.string(),
  fileName: z.string().min(1).max(500),
  fileType: z.enum(['image', 'document', 'video', 'audio', 'other']),
  data: z.string(), // base64
})

export const createPersonSchema = personSchema.omit({ id: true, archivedAt: true }).extend({
  groupIds: z.array(z.string()).optional().default([]),
})
export const updatePersonSchema = personSchema
  .partial()
  .required({ id: true })
  .extend({
    groupIds: z.array(z.string()).optional(),
  })

export const createPersonGroupSchema = personGroupSchema.omit({ id: true })
export const updatePersonGroupSchema = personGroupSchema.partial().required({ id: true })

export const updateSelfSchema = selfSchema

// Export types
export type Value = z.infer<typeof valueSchema>
export type Task = z.infer<typeof taskSchema>
export type Goal = z.infer<typeof goalSchema>
export type Connection = z.infer<typeof connectionSchema>
export type TrackingItem = z.infer<typeof trackingItemSchema>

export type CreateValue = z.infer<typeof createValueSchema>
export type UpdateValue = z.infer<typeof updateValueSchema>
export type CreateTask = z.infer<typeof createTaskSchema>
export type UpdateTask = z.infer<typeof updateTaskSchema>
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>
export type CreateGoal = z.infer<typeof createGoalSchema>
export type UpdateGoal = z.infer<typeof updateGoalSchema>
export type CreateConnection = z.infer<typeof createConnectionSchema>
export type UpdateConnection = z.infer<typeof updateConnectionSchema>
export type CreateTrackingItem = z.infer<typeof createTrackingItemSchema>
export type UpdateTrackingItem = z.infer<typeof updateTrackingItemSchema>

export type WeeklySync = z.infer<typeof weeklySyncSchema>
export type WeeklySyncItem = z.infer<typeof weeklySyncItemSchema>
export type CreateWeeklySync = z.infer<typeof createWeeklySyncSchema>
export type UpdateWeeklySync = z.infer<typeof updateWeeklySyncSchema>

export type SyncTemplate = z.infer<typeof syncTemplateSchema>
export type CreateSyncTemplate = z.infer<typeof createSyncTemplateSchema>
export type UpdateSyncTemplate = z.infer<typeof updateSyncTemplateSchema>
export type SetSyncTemplateItems = z.infer<typeof setSyncTemplateItemsSchema>

export type AddSyncItem = z.infer<typeof addSyncItemSchema>
export type RemoveSyncItem = z.infer<typeof removeSyncItemSchema>
export type SetSyncItemText = z.infer<typeof setSyncItemTextSchema>
export type ReorderSyncItems = z.infer<typeof reorderSyncItemsSchema>

export type Attachment = z.infer<typeof attachmentSchema>
export type UploadAttachment = z.infer<typeof uploadAttachmentSchema>

export type Person = z.infer<typeof personSchema>
export type CreatePerson = z.infer<typeof createPersonSchema>
export type UpdatePerson = z.infer<typeof updatePersonSchema>
export type PersonCategory = (typeof personCategoryValues)[number]
export type Self = z.infer<typeof selfSchema>
export type UpdateSelf = z.infer<typeof updateSelfSchema>
export type SelfListKind = (typeof selfListKindValues)[number]
export type SelfPatternCategory = (typeof selfPatternCategoryValues)[number]
export type SelfListItem = z.infer<typeof selfListItemSchema>
export type CreateSelfListItem = z.infer<typeof createSelfListItemSchema>
export type UpdateSelfListItem = z.infer<typeof updateSelfListItemSchema>
export type ReorderSelfListItems = z.infer<typeof reorderSelfListItemsSchema>
export type PersonGroup = z.infer<typeof personGroupSchema>
export type CreatePersonGroup = z.infer<typeof createPersonGroupSchema>
export type UpdatePersonGroup = z.infer<typeof updatePersonGroupSchema>
export type NextBid = z.infer<typeof nextBidSchema>
export type CreateNextBid = z.infer<typeof createNextBidSchema>
export type UpdateNextBid = z.infer<typeof updateNextBidSchema>
export type SetNextBidCompleted = z.infer<typeof setNextBidCompletedSchema>
export type ImportantDate = z.infer<typeof importantDateSchema>
export type CreateImportantDate = z.infer<typeof createImportantDateSchema>
export type UpdateImportantDate = z.infer<typeof updateImportantDateSchema>
export type BucketListItem = z.infer<typeof bucketListItemSchema>
export type CreateBucketListItem = z.infer<typeof createBucketListItemSchema>
export type UpdateBucketListItem = z.infer<typeof updateBucketListItemSchema>

// ── Journal ─────────────────────────────────────────────────────────────────
// One entry per calendar day. `day` is the user's own day, named by the caller
// (the server's clock is UTC and must never decide what "today" is).
export const journalDaySchema = z.string().refine(isCalendarDay, 'a calendar day, YYYY-MM-DD')

const journalContentSchema = z.string().max(50_000)
const journalHighlightsSchema = z.array(z.string().trim().min(1).max(500)).max(50)

/** Replace-set: a field that is passed replaces what the day holds; one that is not stays. */
export const writeJournalEntrySchema = z.object({
  day: journalDaySchema,
  content: journalContentSchema.optional(),
  highlights: journalHighlightsSchema.optional(),
})

/** Additive: `content` becomes a new paragraph at the end, `highlights` join the list. */
export const appendJournalEntrySchema = writeJournalEntrySchema

export const listJournalEntriesSchema = z.object({
  from: journalDaySchema.optional(),
  to: journalDaySchema.optional(),
  personId: z.string().optional(),
  query: z.string().trim().min(1).max(200).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

export const uploadJournalAttachmentSchema = z.object({
  day: journalDaySchema,
  fileName: z.string().min(1).max(500),
  fileType: z.enum(['image', 'document', 'video', 'audio', 'other']),
  data: z.string(), // base64
})

export type WriteJournalEntry = z.infer<typeof writeJournalEntrySchema>
export type ListJournalEntries = z.infer<typeof listJournalEntriesSchema>
export type UploadJournalAttachment = z.infer<typeof uploadJournalAttachmentSchema>

// Data format for file operations (for compatibility)
export const goalsDataSchema = z.object({
  version: z.string(),
  values: z.array(valueSchema),
  goals: z.array(goalSchema),
  connections: z.array(connectionSchema),
  lastModified: z.string(),
})

export type GoalsData = z.infer<typeof goalsDataSchema>

// Full backup export/import schema — userId-neutral. Strict: every current
// field is required, no back-compat fallbacks. Files referenced by attachments
// are base64-payloaded into `files[]`, keyed by attachment id so the import can
// write to a fresh storage path.
export const backupValueSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const backupGoalSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  emoji: z.string().nullable(),
  parentId: z.string().nullable(),
  positionX: z.number(),
  positionY: z.number(),
  status: z.enum(['active', 'archived']),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const backupTaskSchema = z.object({
  id: z.string(),
  goalId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  emoji: z.string().nullable(),
  difficulty: z.number().int(),
  completed: z.boolean(),
  scheduledAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const backupConnectionSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  weight: z.number(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const backupGoalValueSchema = z.object({
  id: z.string(),
  goalId: z.string(),
  valueId: z.string(),
  createdAt: z.coerce.date(),
})

export const backupTrackingItemSchema = z.object({
  id: z.string(),
  goalId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  order: z.number().int(),
  status: z.enum(['active', 'archived']),
  deletedAt: z.coerce.date().nullable(),
  // Optional so backups written before overlays existed still import.
  overlay: overlaySchema.nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const backupWeeklySyncSchema = z.object({
  id: z.string(),
  weekDate: z.coerce.date(),
  templateId: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const backupWeeklySyncItemSchema = z.object({
  id: z.string(),
  weeklySyncId: z.string(),
  trackingItemId: z.string(),
  textContent: z.string().nullable(),
  orderIdx: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const backupSyncTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const backupSyncTemplateItemSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  trackingItemId: z.string(),
  orderIdx: z.number().int(),
  createdAt: z.coerce.date(),
})

export const backupAttachmentSchema = z.object({
  id: z.string(),
  parentType: z.string(),
  parentId: z.string(),
  fileName: z.string(),
  fileType: z.enum(['image', 'document', 'video', 'audio', 'other']),
  // Where the bytes once lived on disk. Backups from that era carry it; an
  // export made since does not, and the import never read it.
  storagePath: z.string().optional(),
  sizeBytes: z.number().int().nullable(),
  createdAt: z.coerce.date(),
})

export const backupPersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string().nullable(),
  category: z.enum(personCategoryValues),
  boardOrder: z.number().int(),
  appreciation: z.string().nullable(),
  myNeeds: z.string().nullable(),
  legacyMessage: z.string().nullable(),
  selfReflection: z.string().nullable(),
  decideBy: z.coerce.date().nullable(),
  archivedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const backupTaskReferentSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  personId: z.string(),
  createdAt: z.coerce.date(),
})

export const backupPersonGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  orderIdx: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const backupPeopleToGroupSchema = z.object({
  id: z.string(),
  personId: z.string(),
  groupId: z.string(),
  createdAt: z.coerce.date(),
})

export const backupTasksToGroupSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  groupId: z.string(),
  createdAt: z.coerce.date(),
})

export const backupNextBidSchema = z.object({
  id: z.string(),
  personId: z.string(),
  content: z.string(),
  dueAt: z.coerce.date().nullable(),
  completedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
})

export const backupImportantDateSchema = z.object({
  id: z.string(),
  personId: z.string(),
  label: z.string(),
  month: z.number().int(),
  day: z.number().int(),
  year: z.number().int().nullable(),
  createdAt: z.coerce.date(),
})

export const backupBucketListItemSchema = z.object({
  id: z.string(),
  content: z.string(),
  description: z.string().nullable(),
  completedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const backupBucketListItemPeopleSchema = z.object({
  id: z.string(),
  bucketItemId: z.string(),
  personId: z.string(),
  createdAt: z.coerce.date(),
})

export const backupUserSelfSchema = z.object({
  id: z.string(),
  thisYearSelfDescription: z.string().nullable(),
  descriptionYear: z.number().int().nullable(),
  myStory: z.string().nullable(),
  attachmentTendencies: z.string().nullable(),
  loveLanguageGive: z.string().nullable(),
  loveLanguageReceive: z.string().nullable(),
  apologyLanguage: z.string().nullable(),
  conflictStyle: z.string().nullable(),
  stressResponse: z.string().nullable(),
  noteToFutureSelf: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const backupSelfListItemSchema = z.object({
  id: z.string(),
  kind: z.enum(selfListKindValues),
  patternCategory: z.enum(selfPatternCategoryValues).nullable(),
  content: z.string(),
  orderIdx: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const backupJournalEntrySchema = z.object({
  id: z.string(),
  day: journalDaySchema,
  content: z.string(),
  highlights: z.array(z.string()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

// Files in the backup are now keyed by attachment id (not file path).
export const backupFileSchema = z.object({
  attachmentId: z.string(),
  // Base64-encoded content. `data:<mime>;base64,...` prefix permitted but not required.
  data: z.string(),
})

export const backupSchema = z.object({
  version: z.literal(1),
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
  syncTemplates: z.array(backupSyncTemplateSchema),
  syncTemplateItems: z.array(backupSyncTemplateItemSchema),
  attachments: z.array(backupAttachmentSchema),
  files: z.array(backupFileSchema),
  people: z.array(backupPersonSchema),
  userSelf: backupUserSelfSchema.nullable(),
  taskReferents: z.array(backupTaskReferentSchema),
  personGroups: z.array(backupPersonGroupSchema),
  peopleToGroups: z.array(backupPeopleToGroupSchema),
  tasksToGroups: z.array(backupTasksToGroupSchema),
  nextBids: z.array(backupNextBidSchema),
  // Added after v1 shipped without it, which made export→import silently drop
  // every important date. `.default([])` keeps backup files written before the
  // fix importable — they simply restore no dates, which is what they hold.
  // Not a version bump: v1 files stay valid in both directions.
  importantDates: z.array(backupImportantDateSchema).default([]),
  bucketListItems: z.array(backupBucketListItemSchema),
  bucketListItemPeople: z.array(backupBucketListItemPeopleSchema),
  selfListItems: z.array(backupSelfListItemSchema),
  // The journal joined later; a backup written before it restores no entries.
  // Who each entry mentions is not stored: the import reads it from the text.
  journalEntries: z.array(backupJournalEntrySchema).default([]),
})

export type Backup = z.infer<typeof backupSchema>
