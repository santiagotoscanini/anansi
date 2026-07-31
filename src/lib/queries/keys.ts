// Every TanStack Query key in the app, in one file.
//
// This replaces tRPC's `utils.<router>.<procedure>.invalidate()`, which derived
// keys from the procedure path so they could never be wrong. Hand-written keys
// can be, and the failure is quiet: a mutation invalidates a key nothing is
// subscribed to, the UI keeps rendering stale data, and nothing errors. Keeping
// them all here means an invalidation site is one grep from the query that
// produces it.
//
// `as const` throughout so a typo in a key is a type error at the call site
// rather than a cache miss at runtime.
//
// Shape convention: entries that take an argument are nested UNDER their
// collection root, so `invalidateQueries({ queryKey: qk.people })` reaches every
// person query — list, detail, referent tasks — while `qk.personDetail(id)`
// targets exactly one. Prefix matching is what makes that work, so never build a
// key that starts with something other than its own collection.
export const qk = {
  /** Signed in or not. Cookie-only, so it changes only on sign-in/out. */
  session: ['session'] as const,
  /** The live `users` row: name, email, avatar, locale. */
  me: ['me'] as const,
  /** SSO or password form. Fixed by server env, so nothing ever invalidates it. */
  authMode: ['auth-mode'] as const,

  /** values + goals + connections in one payload — what the graph boots from. */
  goalsData: ['goals-data'] as const,
  goals: ['goals'] as const,
  connections: ['connections'] as const,

  values: ['values'] as const,
  valueBehaviors: ['value-behaviors'] as const,
  valueBehaviorsAll: ['value-behaviors', 'all'] as const,
  valueBehaviorsFor: (valueId: string) => ['value-behaviors', 'for', valueId] as const,

  trackingItems: ['tracking-items'] as const,
  // `?? null` because the key hash is JSON.stringify, which turns an undefined
  // array element into null regardless. Writing it out means the key in the
  // devtools reads the same as the key in this file.
  trackingItemsFor: (goalId?: string) => ['tracking-items', goalId ?? null] as const,

  syncTemplates: ['sync-templates'] as const,

  weeklySync: ['weekly-sync'] as const,
  // Keyed on the ISO string, not the Date: two Date objects for the same instant
  // are different references, and a string is far easier to reproduce exactly at
  // an invalidation site.
  weeklySyncFor: (weekStart: Date) => ['weekly-sync', 'week', weekStart.toISOString()] as const,
  weeklyRetrospectiveFor: (weekStart: Date) => ['weekly-sync', 'retrospective', weekStart.toISOString()] as const,

  people: ['people'] as const,
  peopleList: (includeArchived: boolean) => ['people', 'list', includeArchived] as const,
  personDetail: (id: string) => ['people', 'detail', id] as const,
  personTasks: (personId: string) => ['people', 'tasks', personId] as const,
  personBucketList: (personId: string) => ['people', 'bucket-list', personId] as const,

  groups: ['groups'] as const,
  groupTasks: (groupId: string) => ['groups', 'tasks', groupId] as const,

  nextBids: ['next-bids'] as const,
  nextBidsFor: (personId: string) => ['next-bids', 'person', personId] as const,
  nextBidsUpcoming: (withinDays: number) => ['next-bids', 'upcoming', withinDays] as const,

  importantDates: ['important-dates'] as const,
  importantDatesFor: (personId?: string) => ['important-dates', personId ?? null] as const,

  bucketList: ['bucket-list'] as const,

  self: ['self'] as const,
  selfListItems: ['self-list-items'] as const,
} as const
