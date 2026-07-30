// Seed a realistic dataset for the dev user so every tab renders populated UI
// rather than empty states. Written for the TanStack Start migration: the
// screenshots taken against this data are the visual regression oracle in
// .golden/screens/, so the seed must be deterministic — no randomness, no
// Date.now() drift beyond the horizon buckets it deliberately targets.
//
// Idempotent: wipes every user-scoped row for DEV_EMAIL, then re-inserts.
//
// Run with: env -u DATABASE_URL npx tsx scripts/seed-dev-data.ts
//
// (env -u because a stale DATABASE_URL in the ambient environment beats .env —
// dotenv does not override already-set vars. See .golden/README.md.)
import { eq, inArray } from 'drizzle-orm'
import { db } from '../src/lib/data'
import {
  bucketListItemPeople,
  bucketListItems,
  connections,
  goalValues,
  goals,
  importantDates,
  nextBids,
  people,
  peopleToGroups,
  personGroups,
  selfListItems,
  syncTemplateItems,
  syncTemplates,
  taskReferents,
  tasks,
  tasksToGroups,
  trackingItems,
  userSelf,
  users,
  valueBehaviors,
  values as valuesTable,
  weeklySync,
  weeklySyncItems,
} from '../src/lib/data/schema'

const DEV_EMAIL = 'santi@test.local'

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run with NODE_ENV=production.')
  process.exit(1)
}

// ── date helpers ────────────────────────────────────────────────────────────────
// Buckets are computed at render time by src/lib/horizon-period.ts from the
// current calendar, so these are expressed as offsets that land in a specific
// bucket today and degrade gracefully later.
//
// The anchor is rounded down to local midnight rather than taken from the
// wall clock. Two re-seeds on the same day then produce byte-identical rows,
// which is what keeps the .golden/screens diff meaningful — anchoring to
// Date.now() shifted every "in N days" label by an hour's worth of rounding
// and lit up the Pulse screenshots as false positives. Buckets still track
// real time across days, which is the property that matters.
const now = new Date()
now.setHours(0, 0, 0, 0)
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0, 0)
const daysFromNow = (n: number) => new Date(now.getTime() + n * 86_400_000)

/**
 * Name -> id lookup over just-inserted rows. Returns a getter that throws rather
 * than yielding `undefined`, which keeps every call site a plain `string` under
 * tsconfig's `noUncheckedIndexedAccess` and makes a typo in a seed name fail loudly
 * instead of inserting a null FK.
 */
function lookup<T extends { id: string }>(rows: T[], key: (row: T) => string) {
  const map = new Map(rows.map((r) => [key(r), r.id]))
  return (name: string): string => {
    const id = map.get(name)
    if (id === undefined) throw new Error(`seed: no row named ${JSON.stringify(name)}`)
    return id
  }
}

/** Monday of the current week — the shape weeklySync.weekDate expects. */
function mondayOfThisWeek(): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay() // 0 = Sunday
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  return d
}

/** Last day of the current month — guaranteed to be in the "month" bucket. */
function endOfThisMonth(): Date {
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 12, 0, 0, 0)
}
/** Mid-point of the next quarter's first month — the "quarter" bucket. */
function inThisQuarterAfterThisMonth(): Date {
  const q = Math.floor(now.getMonth() / 3)
  const lastMonthOfQuarter = q * 3 + 2
  // If we're already in the quarter's last month, fall back to end of month.
  if (now.getMonth() >= lastMonthOfQuarter) return endOfThisMonth()
  return new Date(now.getFullYear(), lastMonthOfQuarter, 15, 12, 0, 0, 0)
}
/** Late in the current year, past the current quarter — the "year" bucket. */
function laterThisYear(): Date {
  const q = Math.floor(now.getMonth() / 3)
  if (q === 3) return new Date(now.getFullYear(), 11, 28, 12, 0, 0, 0)
  return new Date(now.getFullYear(), 11, 15, 12, 0, 0, 0)
}

async function main() {
  const [user] = await db.select().from(users).where(eq(users.email, DEV_EMAIL)).limit(1)
  if (!user) {
    console.error(`User ${DEV_EMAIL} not found. Register it at /register first.`)
    process.exit(1)
  }
  const userId = user.id
  console.log(`seeding for ${DEV_EMAIL} (${userId})`)

  // ── wipe ─────────────────────────────────────────────────────────────────────
  // Order matters only where there's no cascade from the row we delete.
  // Junctions hang off goals/tasks/people, so deleting the owners is enough,
  // but we delete explicitly for the ones keyed on ids we're about to reuse.
  const oldGoalIds = (await db.select({ id: goals.id }).from(goals).where(eq(goals.userId, userId))).map((r) => r.id)
  if (oldGoalIds.length) {
    const oldTaskIds = (await db.select({ id: tasks.id }).from(tasks).where(inArray(tasks.goalId, oldGoalIds))).map(
      (r) => r.id,
    )
    if (oldTaskIds.length) {
      await db.delete(taskReferents).where(inArray(taskReferents.taskId, oldTaskIds))
      await db.delete(tasksToGroups).where(inArray(tasksToGroups.taskId, oldTaskIds))
    }
    await db.delete(connections).where(inArray(connections.source, oldGoalIds))
    await db.delete(goalValues).where(inArray(goalValues.goalId, oldGoalIds))
  }
  await db.delete(weeklySync).where(eq(weeklySync.userId, userId)) // cascades items
  await db.delete(syncTemplates).where(eq(syncTemplates.userId, userId)) // cascades template items
  await db.delete(trackingItems).where(eq(trackingItems.userId, userId))
  await db.delete(bucketListItems).where(eq(bucketListItems.userId, userId)) // cascades link rows
  await db.delete(people).where(eq(people.userId, userId)) // cascades bids/dates/groups/referents
  await db.delete(personGroups).where(eq(personGroups.userId, userId))
  await db.delete(goals).where(eq(goals.userId, userId)) // cascades tasks
  await db.delete(valuesTable).where(eq(valuesTable.userId, userId)) // cascades behaviors
  await db.delete(selfListItems).where(eq(selfListItems.userId, userId))
  await db.delete(userSelf).where(eq(userSelf.userId, userId))

  // ── values (+ behaviors) ─────────────────────────────────────────────────────
  const vals = await db
    .insert(valuesTable)
    .values([
      { userId, name: 'Presence', color: '#7c6f5a' },
      { userId, name: 'Craft', color: '#3f5b7a' },
      { userId, name: 'Vitality', color: '#4a6b43' },
      { userId, name: 'Generosity', color: '#8a5a4a' },
      { userId, name: 'Curiosity', color: '#6b5a7a' },
    ])
    .returning()
  const val = lookup(vals, (v) => v.name)

  await db.insert(valueBehaviors).values([
    { valueId: val('Presence'), content: 'Phone in another room during dinner', orderIdx: 0 },
    { valueId: val('Presence'), content: 'One walk a day with no podcast', orderIdx: 1 },
    { valueId: val('Craft'), content: 'Read one paper a week, properly', orderIdx: 0 },
    { valueId: val('Craft'), content: 'Refactor before adding, not after', orderIdx: 1 },
    { valueId: val('Vitality'), content: 'Climb twice a week', orderIdx: 0 },
    { valueId: val('Vitality'), content: 'Asleep before midnight', orderIdx: 1 },
    { valueId: val('Generosity'), content: 'Reach out first when I think of someone', orderIdx: 0 },
    { valueId: val('Curiosity'), content: 'Follow the tangent for 20 minutes', orderIdx: 0 },
  ])

  // ── goals (hierarchy + canvas positions) ─────────────────────────────────────
  const [gLife] = await db
    .insert(goals)
    .values({
      userId,
      title: 'Live deliberately',
      description: 'The root. Everything below should ladder up to this or be cut.',
      emoji: '🕸️',
      positionX: 0,
      positionY: 0,
    })
    .returning()

  const mid = await db
    .insert(goals)
    .values([
      {
        userId,
        title: 'Ship Anansi v1',
        description: 'A tool I actually use daily, not a portfolio piece.',
        emoji: '🚀',
        parentId: gLife!.id,
        positionX: -320,
        positionY: 200,
      },
      {
        userId,
        title: 'Be someone people can reach',
        description: 'Relationships decay silently. Make the upkeep visible.',
        emoji: '🤝',
        parentId: gLife!.id,
        positionX: 40,
        positionY: 210,
      },
      {
        userId,
        title: 'Strong at 40',
        description: 'Not aesthetics — capacity. Carry things, climb things, sleep well.',
        emoji: '🧗',
        parentId: gLife!.id,
        positionX: 380,
        positionY: 190,
      },
    ])
    .returning()
  const [gShip, gReach, gStrong] = mid

  const leaves = await db
    .insert(goals)
    .values([
      {
        userId,
        title: 'Migrate to TanStack Start',
        description: 'Drop Next. Real routes, real SSR, no tRPC layer.',
        emoji: '⚡',
        parentId: gShip!.id,
        positionX: -480,
        positionY: 420,
      },
      {
        userId,
        title: 'MCP that survives a refactor',
        description: 'Talk to Anansi from Claude without a parallel API.',
        emoji: '🔌',
        parentId: gShip!.id,
        positionX: -180,
        positionY: 430,
      },
      {
        userId,
        title: 'Weekly retrospective habit',
        description: 'Twelve weeks in a row before judging whether it works.',
        emoji: '🪞',
        parentId: gReach!.id,
        positionX: 60,
        positionY: 430,
      },
      {
        userId,
        title: 'Climb 6c outdoors',
        description: "Indoor grades don't count. Real rock, real fear.",
        emoji: '🪨',
        parentId: gStrong!.id,
        positionX: 420,
        positionY: 420,
      },
    ])
    .returning()
  const [gMigrate, gMcp, gRetro, gClimb] = leaves

  // Weighted edges. Importance is derived from OUTGOING weights, so spread them
  // to exercise all three bands: Low <=33.3, Medium 33.3-66.6, High >=66.6.
  await db.insert(connections).values([
    { source: gShip!.id, target: gLife!.id, weight: 82 },
    { source: gReach!.id, target: gLife!.id, weight: 71 },
    { source: gStrong!.id, target: gLife!.id, weight: 48 },
    { source: gMigrate!.id, target: gShip!.id, weight: 90 },
    { source: gMcp!.id, target: gShip!.id, weight: 55 },
    { source: gRetro!.id, target: gReach!.id, weight: 64 },
    { source: gClimb!.id, target: gStrong!.id, weight: 28 },
    // A cross-link, so the graph isn't a pure tree and the DFS cycle guard is exercised.
    { source: gRetro!.id, target: gShip!.id, weight: 22 },
  ])

  await db.insert(goalValues).values([
    { goalId: gShip!.id, valueId: val('Craft') },
    { goalId: gShip!.id, valueId: val('Curiosity') },
    { goalId: gReach!.id, valueId: val('Generosity') },
    { goalId: gReach!.id, valueId: val('Presence') },
    { goalId: gStrong!.id, valueId: val('Vitality') },
    { goalId: gMigrate!.id, valueId: val('Craft') },
    { goalId: gRetro!.id, valueId: val('Presence') },
    { goalId: gClimb!.id, valueId: val('Vitality') },
  ])

  // ── people (all 4 categories + one archived) ─────────────────────────────────
  const ppl = await db
    .insert(people)
    .values([
      {
        userId,
        name: 'Lucía',
        emoji: '🌿',
        category: 'long_term',
        boardOrder: 0,
        appreciation: "Asks the question I'm avoiding, then waits.",
        myNeeds: "I need to say when I'm underwater instead of going quiet.",
        selfReflection: 'I default to competence with her when honesty would land better.',
      },
      {
        userId,
        name: 'Mamá',
        emoji: '💛',
        category: 'long_term',
        boardOrder: 1,
        appreciation: 'Still sends the article she thinks I should read.',
        legacyMessage: 'Tell her the Montevideo years were not wasted on me.',
      },
      {
        userId,
        name: 'Tomás',
        emoji: '🧗',
        category: 'context_bound',
        boardOrder: 0,
        appreciation: 'Belays without commentary. Rare.',
        selfReflection: "Climbing is the only context we have. That's fine, but name it.",
      },
      {
        userId,
        name: 'Dani',
        emoji: '🛠️',
        category: 'exploring',
        boardOrder: 0,
        decideBy: daysFromNow(45),
        myNeeds: 'Decide whether this is a friendship or a good working relationship.',
      },
      {
        userId,
        name: 'Someone from the conference',
        category: 'to_process',
        boardOrder: 0,
      },
      {
        userId,
        name: 'Old flatmate',
        emoji: '📦',
        category: 'context_bound',
        boardOrder: 1,
        archivedAt: daysFromNow(-120),
        legacyMessage: 'Released. No unfinished business here.',
      },
    ])
    .returning()
  const person = lookup(ppl, (p) => p.name)

  // ── groups (cross-entity: tag people AND tasks) ──────────────────────────────
  const groups = await db
    .insert(personGroups)
    .values([
      { userId, name: 'Family', color: '#8a5a4a', orderIdx: 0 },
      { userId, name: 'Climbing', color: '#4a6b43', orderIdx: 1 },
      { userId, name: 'Work', color: '#3f5b7a', orderIdx: 2 },
    ])
    .returning()
  const group = lookup(groups, (g) => g.name)

  await db.insert(peopleToGroups).values([
    { personId: person('Mamá'), groupId: group('Family') },
    { personId: person('Lucía'), groupId: group('Family') },
    { personId: person('Tomás'), groupId: group('Climbing') },
    { personId: person('Dani'), groupId: group('Work') },
  ])

  // ── tasks across every horizon bucket ────────────────────────────────────────
  const t = await db
    .insert(tasks)
    .values([
      // past due
      {
        goalId: gMigrate!.id,
        title: 'Capture the pre-migration baseline',
        description: 'Golden tools/list, procedure checklist, screenshots.',
        emoji: '📸',
        difficulty: 2,
        completed: true,
        scheduledAt: daysFromNow(-4),
      },
      {
        goalId: gRetro!.id,
        title: 'Book the standing Sunday hour',
        difficulty: 1,
        completed: false,
        scheduledAt: daysFromNow(-9),
      },
      // this month
      {
        goalId: gMigrate!.id,
        title: 'Extract the 84 procedures into services',
        description: 'Under tRPC first, so the existing call sites are the regression test.',
        emoji: '🧩',
        difficulty: 3,
        completed: false,
        scheduledAt: endOfThisMonth(),
      },
      {
        goalId: gReach!.id,
        title: 'Call Mamá properly, not while cooking',
        emoji: '📞',
        difficulty: 1,
        completed: false,
        scheduledAt: endOfThisMonth(),
      },
      // this quarter
      {
        goalId: gMcp!.id,
        title: 'Point the 51 MCP tools at the service layer',
        description: 'tools/list must diff to zero against the golden capture.',
        emoji: '🔧',
        difficulty: 3,
        completed: false,
        scheduledAt: inThisQuarterAfterThisMonth(),
      },
      {
        goalId: gClimb!.id,
        title: 'Two outdoor sessions on real rock',
        emoji: '🪨',
        difficulty: 2,
        completed: false,
        scheduledAt: inThisQuarterAfterThisMonth(),
      },
      // later this year
      {
        goalId: gShip!.id,
        title: 'Use Anansi daily for a full month without touching the code',
        description: "The only honest test of whether it's finished.",
        difficulty: 2,
        completed: false,
        scheduledAt: laterThisYear(),
      },
      // next year → "later"
      {
        goalId: gStrong!.id,
        title: 'Bodyweight bench, no shortcuts',
        emoji: '🏋️',
        difficulty: 3,
        completed: false,
        scheduledAt: at(now.getFullYear() + 1, 6, 1),
      },
      // backlog (scheduledAt null)
      { goalId: gMcp!.id, title: 'Consider re-adding weekly-sync MCP tools', difficulty: 1, completed: false },
      {
        goalId: gMigrate!.id,
        title: 'Lazy-load the i18n bundles',
        description: '~120KB of en/es JSON is statically imported today.',
        difficulty: 2,
        completed: false,
      },
      { goalId: gRetro!.id, title: 'Write the retro prompts I actually answer', difficulty: 1, completed: false },
      { goalId: gClimb!.id, title: 'Replace the rope', emoji: '🧵', difficulty: 1, completed: true },
    ])
    .returning()

  const task = lookup(t, (x) => x.title)

  // Referents — "people I'm relying on for this"
  await db.insert(taskReferents).values([
    { taskId: task('Two outdoor sessions on real rock'), personId: person('Tomás') },
    { taskId: task('Call Mamá properly, not while cooking'), personId: person('Mamá') },
    { taskId: task('Point the 51 MCP tools at the service layer'), personId: person('Dani') },
  ])

  // Same group rows tagging tasks, not just people — the cross-entity property.
  await db.insert(tasksToGroups).values([
    { taskId: task('Call Mamá properly, not while cooking'), groupId: group('Family') },
    { taskId: task('Two outdoor sessions on real rock'), groupId: group('Climbing') },
    { taskId: task('Replace the rope'), groupId: group('Climbing') },
    { taskId: task('Extract the 84 procedures into services'), groupId: group('Work') },
  ])

  // ── next bids (overdue / due soon / completed) ───────────────────────────────
  await db.insert(nextBids).values([
    { personId: person('Mamá'), content: 'Send the photos from the trip', dueAt: daysFromNow(-6) },
    { personId: person('Lucía'), content: 'Book the thing she mentioned twice', dueAt: daysFromNow(3) },
    { personId: person('Tomás'), content: 'Ask if he wants the spare harness', dueAt: daysFromNow(12) },
    { personId: person('Dani'), content: 'Follow up on the contract question', dueAt: daysFromNow(21) },
    { personId: person('Lucía'), content: 'Apologise for Tuesday properly', completedAt: daysFromNow(-2) },
    { personId: person('Someone from the conference'), content: 'Work out who this actually was' },
  ])

  // ── important dates (one inside Pulse's 30-day window) ───────────────────────
  const soon = daysFromNow(11)
  await db.insert(importantDates).values([
    { personId: person('Mamá'), label: 'Birthday', month: soon.getMonth() + 1, day: soon.getDate(), year: 1961 },
    { personId: person('Lucía'), label: 'Anniversary', month: 3, day: 14, year: 2019 },
    { personId: person('Tomás'), label: 'Birthday', month: 11, day: 2 },
  ])

  // ── bucket list (with people I want to do them with) ─────────────────────────
  const bl = await db
    .insert(bucketListItems)
    .values([
      { userId, content: 'Walk a stage of the Camino', description: 'Not the whole thing. One stage, done properly.' },
      { userId, content: "Learn to make my grandmother's ravioli", description: 'Write it down this time.' },
      { userId, content: 'See a total eclipse' },
      { userId, content: 'Sleep on a glacier', completedAt: daysFromNow(-200) },
    ])
    .returning()
  await db.insert(bucketListItemPeople).values([
    { bucketItemId: bl[0]!.id, personId: person('Lucía') },
    { bucketItemId: bl[1]!.id, personId: person('Mamá') },
    { bucketItemId: bl[2]!.id, personId: person('Lucía') },
    { bucketItemId: bl[2]!.id, personId: person('Tomás') },
  ])

  // ── tracking items (some goal-scoped, some unscoped) ─────────────────────────
  const ti = await db
    .insert(trackingItems)
    .values([
      {
        userId,
        goalId: gMigrate!.id,
        title: 'Migration progress',
        description: "Which phase, and what's blocked.",
        order: 0,
      },
      {
        userId,
        goalId: gClimb!.id,
        title: 'Sessions this week',
        description: 'Indoor and outdoor, counted separately.',
        order: 1,
      },
      { userId, goalId: gRetro!.id, title: 'Did I actually sit down for this?', order: 2 },
      {
        userId,
        goalId: null,
        title: 'Energy — honest 1 to 5',
        description: "Unscoped on purpose; it isn't about one goal.",
        order: 3,
      },
      { userId, goalId: null, title: 'What I avoided this week', order: 4 },
      { userId, goalId: gStrong!.id, title: 'Sleep midpoint', status: 'archived', order: 5 },
    ])
    .returning()

  // ── default sync template ────────────────────────────────────────────────────
  const [tpl] = await db.insert(syncTemplates).values({ userId, name: 'Standard weekly', isDefault: true }).returning()
  await db.insert(syncTemplateItems).values(
    ti
      .filter((x) => x.status === 'active')
      .slice(0, 5)
      .map((x, i) => ({ templateId: tpl!.id, trackingItemId: x.id, orderIdx: i })),
  )

  // ── this week's sync, snapshotted from the template, partially filled in ─────
  const [sync] = await db
    .insert(weeklySync)
    .values({ userId, weekDate: mondayOfThisWeek(), templateId: tpl!.id })
    .returning()
  await db.insert(weeklySyncItems).values([
    {
      weeklySyncId: sync!.id,
      trackingItemId: ti[0]!.id,
      orderIdx: 0,
      textContent:
        'Phase 0 done — baseline captured. The Supabase project was gone, so local dev is on a container now. Next: the 84-procedure extraction, which is the big one.',
    },
    {
      weeklySyncId: sync!.id,
      trackingItemId: ti[1]!.id,
      orderIdx: 1,
      textContent: 'Two indoor, zero outdoor. The outdoor one is the one that counts and I keep deferring it.',
    },
    { weeklySyncId: sync!.id, trackingItemId: ti[2]!.id, orderIdx: 2, textContent: 'Yes. Forty minutes, no phone.' },
    { weeklySyncId: sync!.id, trackingItemId: ti[3]!.id, orderIdx: 3, textContent: '3. Steady, not depleted.' },
    { weeklySyncId: sync!.id, trackingItemId: ti[4]!.id, orderIdx: 4 }, // deliberately blank
  ])

  // ── Self ("living portrait") ─────────────────────────────────────────────────
  await db.insert(userSelf).values({
    userId,
    thisYearSelfDescription: 'Someone who finishes the unglamorous middle of things. Less starting, more landing.',
    descriptionYear: now.getFullYear(),
    myStory:
      "Montevideo, then a decade of build-and-abandon. The pattern isn't laziness, it's that I like the part where it's still theoretical.",
    attachmentTendencies: 'Anxious under silence, avoidant under conflict. Both look like being very busy.',
    loveLanguageGive: 'Doing the thing you mentioned once and forgot about.',
    loveLanguageReceive: 'Being asked a second question.',
    apologyLanguage: 'Naming the specific thing, not the general regret.',
    conflictStyle: 'Go quiet, over-prepare, come back with a case. Not helpful.',
    stressResponse: "Ship something small to feel competent, avoid the thing that's actually blocked.",
    noteToFutureSelf: "If you're rewriting the stack again, ask what you're avoiding first.",
  })

  await db.insert(selfListItems).values([
    { userId, kind: 'energizer', content: 'A hard problem and a closed door', orderIdx: 0 },
    { userId, kind: 'energizer', content: 'Rock, outdoors, slightly too hard', orderIdx: 1 },
    { userId, kind: 'energizer', content: 'Explaining something until it clicks for someone', orderIdx: 2 },
    { userId, kind: 'drainer', content: 'Meetings that could have been a paragraph', orderIdx: 0 },
    { userId, kind: 'drainer', content: "Pretending a decision is still open when it isn't", orderIdx: 1 },
    { userId, kind: 'just_for_me', content: 'Reading papers I will never use', orderIdx: 0 },
    { userId, kind: 'just_for_me', content: 'Long walks with no destination', orderIdx: 1 },
    { userId, kind: 'proud', content: 'Said no to the contract without softening it', orderIdx: 0 },
    { userId, kind: 'proud', content: 'Twelve weeks of retrospectives, unbroken', orderIdx: 1 },
    {
      userId,
      kind: 'pattern',
      patternCategory: 'relational',
      content: 'I go competent when I should go honest',
      orderIdx: 0,
    },
    { userId, kind: 'pattern', patternCategory: 'communication', content: 'I rehearse instead of asking', orderIdx: 1 },
    {
      userId,
      kind: 'pattern',
      patternCategory: 'self_pattern',
      content: 'I rebuild the tool instead of using it',
      orderIdx: 2,
    },
    {
      userId,
      kind: 'pattern',
      patternCategory: 'body_state',
      content: "Jaw first, then I notice I'm stressed",
      orderIdx: 3,
    },
    {
      userId,
      kind: 'pattern',
      patternCategory: 'choice',
      content: "I pick the reversible option even when it's worse",
      orderIdx: 4,
    },
    { userId, kind: 'trigger', content: 'Being told to calm down', orderIdx: 0 },
    { userId, kind: 'trigger', content: "Someone else's plan presented as the only plan", orderIdx: 1 },
    { userId, kind: 'release', content: 'The idea that I owe everyone an explanation', orderIdx: 0 },
    { userId, kind: 'release', content: 'Being the person who knows the whole codebase', orderIdx: 1 },
    { userId, kind: 'year_ahead', content: 'Finish the middle of one large thing', orderIdx: 0 },
    { userId, kind: 'year_ahead', content: 'Outdoors more than indoors', orderIdx: 1 },
  ])

  console.log(
    [
      `  values          ${vals.length} (+8 behaviors)`,
      `  goals           ${1 + mid.length + leaves.length} (8 connections, 8 value tags)`,
      `  tasks           ${t.length} across past/month/quarter/year/later/backlog`,
      `  people          ${ppl.length} (all 4 categories, 1 archived)`,
      `  groups          ${groups.length} (tagging both people and tasks)`,
      `  next bids       6 (1 overdue, 1 completed)`,
      `  important dates 3 (1 inside Pulse's 30-day window)`,
      `  bucket list     ${bl.length} (1 completed, 4 people links)`,
      `  tracking items  ${ti.length} (2 unscoped, 1 archived)`,
      `  weekly sync     1 for week of ${mondayOfThisWeek().toDateString()}`,
      `  self            prose + ${20} list items across all 8 kinds`,
    ].join('\n'),
  )
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
