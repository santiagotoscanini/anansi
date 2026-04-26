# Anansi

Personal operating system for goals, relationships, and values. Named after Anansi — the West African spider trickster — whose Adinkra symbol **Ananse Ntontan** (the spider's web) represents wisdom, creativity, and the complexity of life. The app's icon is that web.

Feature surface: visual goal hierarchies with weighted connections, weekly progress retrospectives, a structured Personal CRM for reflecting on relationships, user-defined values that tag goals, and custom groups that span both people and tasks (e.g. "Family" can hold both my partner and the "call mom" task).

## Local dev credentials

The local Postgres (`docker-compose.dev.yml`, port 15822) has a single seeded test user for
automated flows (Playwright, manual smoke testing):

- **Email:** `santi@test.local`
- **Password:** `devpassword`

These credentials are for the **local dev database only** — do not reuse them in production.
If the password ever drifts, reset it with:

```bash
HASH=$(node -e "console.log(require('bcryptjs').hashSync('devpassword', 10))")
docker exec goals-db psql -U user -d goals_db \
  -c "UPDATE users SET password = '$HASH', updated_at = now() WHERE email = 'santi@test.local';"
```

To log in: open `http://localhost:3000`, enter the email + password above, click "Sign In".

## Main Goal of the Application

- **Personal Goals Management**: Create, organize, and track hierarchical goals with visual positioning
- **Visual Goal Relationships**: Map weighted connections between goals to understand dependencies and importance
- **Weekly Progress Tracking**: Conduct weekly retrospectives with file attachments and progress documentation
- **Values-Based Goal Setting**: Align goals with personal values using color-coded value associations
- **Personal CRM (People)**: Structured reflection on relationships — categorized cards, per-person prompts (appreciation, unfinished business, next bid, self-reflection), and a separate Self space

## Technologies

### Frontend

- **Next.js 14**: React framework with app directory structure
- **React 18**: UI component library with modern hooks
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first CSS framework
- **React Flow (@xyflow/react)**: Interactive graph visualization for goal networks
- **Framer Motion**: Animations and transitions
- **Lucide React**: Icon library

### Backend

- **tRPC**: End-to-end typesafe APIs
- **Next.js API Routes**: Server-side API handling
- **Jose**: JWT token handling for authentication
- **Zod**: Runtime type validation and schema definition

### Database

- **PostgreSQL**: Primary database
- **Drizzle ORM**: Type-safe database operations
- **Drizzle Kit**: Database migrations and management

### State Management

- **React Context**: Global state management
- **TanStack React Query**: Server state management via tRPC
- **IDB Keyval**: Client-side storage

### Development Tools

- **ESLint**: Code linting
- **Prettier**: Code formatting
- **TypeScript**: Static type checking

## Project Structure

```
src/
     app/                          # Next.js app directory
         api/trpc/[trpc]/         # tRPC API endpoints
         uploads/[...path]/       # File serving route
         layout.tsx               # Root layout
         page.tsx                 # Main application page
     components/goals/             # Goal-related React components
         GoalsDashboard.tsx       # Main dashboard with tabs
         GoalsGraph.tsx           # Interactive goal network visualization
         GoalNode.tsx             # Individual goal node component
         GoalModal.tsx            # Goal creation/editing modal
         TaskModal.tsx            # Per-task editor (title, emoji, description, deadline, difficulty, referents, groups, completion)
         Tasks.tsx                # Cross-goal Tasks tab — search + tasks grouped by goal; row click opens TaskModal
         EditableEdge.tsx         # Connection weight editor
         ValuesManager.tsx        # Values management interface
         WeeklyRetrospective.tsx  # Weekly sync interface
         LifeProgress.tsx         # Progress tracking dashboard
         FileSelectionModal.tsx   # File upload interface
         PeopleManager.tsx        # Personal CRM list view with category sections
         PersonModal.tsx          # Create/edit modal for a person
         Self.tsx                 # Self tab — "living portrait" page: values strip, this-year description, my story, energizes/drains, just-for-me, what I'm proud of, patterns (5 categories), triggers, How I relate (6 framework cards), released, year-ahead, note to future self
     contexts/
        GoalsContext.tsx         # Global state management
     lib/
         api/                     # tRPC configuration and routers
         routers/
             auth.ts          # Authentication router
             goals.ts         # Goals management router
         root.ts              # Root tRPC router
         trpc.ts              # tRPC configuration
         types.ts             # Shared types and schemas
         data/
             schema.ts            # Drizzle database schema
             index.ts             # Database connection
         auth-client.ts           # Client-side auth utilities
         auth-server.ts           # Server-side auth utilities
         image-upload.ts          # File upload utilities
     trpc/
         react.tsx                # tRPC React configuration
     styles/                      # Global styles

uploads/                         # File storage directory (not in src/)
     {userId}/
         {goalId}/
             {upload_date}/
                 {trackingItemId}/
                     {timestamp}_{fileName}
```

## Features

### Core Goal Management

- **Hierarchical Goals**: Create parent-child goal relationships
- **Visual Positioning**: Drag-and-drop goal positioning on interactive canvas
- **Goal CRUD Operations**: Full create, read, update, delete functionality
- **Goal Descriptions**: Rich text descriptions for detailed goal documentation

### Values System

- **Personal Values**: Define core personal values with custom colors
- **Value-Goal Association**: Link goals to relevant personal values
- **Color Coding**: Visual representation through color-coded value systems

### Task Management

- **Cross-Goal Tasks Tab**: Sidebar entry under Goals. Searchable flat list of all tasks grouped by parent goal — click any task to open the **TaskModal** for full-fidelity editing (title with optional task-specific emoji, description, difficulty, deadline, referents, groups, completion). The graph + GoalModal still own quick row affordances (toggle complete, inline date picker, referent/group popovers); the Tasks tab is the place for description + emoji edits, since those don't fit on a row.
- **Difficulty-Based Tasks**: Assign difficulty levels (1-3) to goal-specific tasks
- **Task Completion Tracking**: Mark tasks as completed for progress monitoring
- **Task CRUD Operations**: Full task management within goals
- **Time-Bound Horizons**: Each task carries a single `scheduledAt` deadline date. The dedicated **Horizons** tab buckets tasks into `Backlog` + `This Month` + `This Quarter` + `This Year` (plus auto-flagged `Past due` / `Later` lanes) by computing the right bucket from the date and the current calendar — no enum stored, so a task auto-promotes to a tighter bucket as the deadline approaches. Tasks are also surfaced as count pills on each goal node and a per-task DatePicker in GoalModal. Pulse's "On the horizon" section uses the same auto-rollup; the year bucket is collapsed by default.

### Goal Connections

- **Weighted Relationships**: Create connections between goals with importance weights (0-100)
- **Importance Calculation**: Automatic goal importance based on outgoing connection weights
- **Visual Connection Editing**: Interactive edge editing for connection weights

### Visual Graph Interface

- **Interactive Network**: React Flow-based goal network visualization
- **Drag-and-Drop**: Repositionable goals and connections
- **Zoom and Pan**: Navigate large goal networks
- **Real-time Updates**: Live updates when goals or connections change

### Weekly Retrospectives

- **Progress Tracking Items**: Define items to track for weekly reviews
- **File Attachments**: Upload images, documents, and text files for each tracking item
- **Weekly Sync Sessions**: Create weekly retrospective sessions
- **Historical Tracking**: Maintain history of weekly progress

### Life Progress Dashboard

- **Progress Analytics**: Visual representation of goal and task completion
- **Trend Analysis**: Track progress over time
- **Achievement Metrics**: Statistics on completed goals and tasks

### Multi-User Support

- **User Selection**: Choose from available users at login
- **User Isolation**: Complete data separation between users
- **Custom Authentication**: Password-based user authentication

### File Management

- **Image Uploads**: Support for various image formats (PNG, JPG, JPEG, GIF, WebP)
- **Document Uploads**: Text files, PDFs, and other document types
- **Text Editor**: Built-in text editing for note-taking
- **File Organization**: Structured file storage by user, goal, and tracking item

## Database Structure and Relations

### Core Tables

#### users

- `id` (text, primary key): Unique user identifier
- `name` (text): User display name
- `email` (text, UNIQUE): Email used for sign-in
- `password` (text): bcrypt hash
- `avatarUrl` (text, nullable): Path under `/uploads/{userId}/avatar.{ext}`. Null = use deterministic-initial fallback in `Avatar.tsx`.
- `createdAt`, `updatedAt` (timestamp): Audit timestamps

#### values

- `id` (text, primary key): Unique value identifier
- `name` (text): Value name
- `color` (text): Color code for visual representation
- `userId` (text, foreign key): References users.id
- `createdAt`, `updatedAt` (timestamp): Audit timestamps

#### goals

- `id` (text, primary key): Unique goal identifier
- `title` (text): Goal title
- `description` (text): Detailed goal description
- `parentId` (text, nullable): References goals.id for hierarchy
- `positionX`, `positionY` (real): Canvas position coordinates
- `userId` (text, foreign key): References users.id
- `createdAt`, `updatedAt` (timestamp): Audit timestamps

#### tasks

- `id` (text, primary key): Unique task identifier
- `goalId` (text, foreign key): References goals.id
- `title` (text): Task title
- `description` (text, nullable): Longer-form context for the task. Surfaced in the Tasks tab list and the TaskModal editor; the GoalModal task row only shows the title.
- `emoji` (text, nullable): Native emoji or URL to custom emoji image. **Distinct from the parent goal's emoji** — a task can have its own visual marker independent of its goal. Rendered on the row in the GoalModal task list and the Tasks tab.
- `difficulty` (integer): Difficulty level (1, 2, or 3)
- `completed` (boolean): Completion status
- `scheduledAt` (timestamp, **nullable**): Single deadline date. Null = unscheduled (Backlog on the Horizons board). The board buckets tasks into `Backlog` / `This Month` / `This Quarter` / `This Year` (plus auto-flagged `Past due` and `Later` lanes) by COMPUTING which bucket the date falls into right now — no enum stored. Auto-rollup: a Sept 15 task lives in `This Year` until July starts, then `This Quarter` through August, then promotes to `This Month` when September arrives. Bucket computation in `src/lib/horizon-period.ts` (`bucketForDate`, `currentMonthRange`, `endOfCurrentBucket`, `formatScheduledShort`).
- `createdAt`, `updatedAt` (timestamp): Audit timestamps
- **Linked surfaces:** referent people via `task_referents`; group tags via `tasks_to_groups`. Both are cascade-deleted with the task.

#### connections

- `id` (text, primary key): Unique connection identifier
- `source` (text, foreign key): References goals.id (source goal)
- `target` (text, foreign key): References goals.id (target goal)
- `weight` (real): Connection importance weight (0-100)
- `createdAt`, `updatedAt` (timestamp): Audit timestamps

#### trackingItems

User-owned library of items the user wants to track on weekly syncs.
`goalId` is **optional** — items linked to a goal show up under that goal in
the retro UI; items with `goalId IS NULL` are surfaced as "Unscoped". Goal
deletion sets `goalId` to NULL (not cascade), so the item survives.

- `id` (text, primary key): Unique tracking item identifier
- `userId` (text, foreign key, **NOT NULL**): References users.id, cascade delete
- `goalId` (text, foreign key, **nullable**): References goals.id, ON DELETE SET NULL
- `title` (text): Tracking item title
- `description` (text, nullable): Optional description
- `order` (integer): Display order
- `status` (enum, NOT NULL, default `active`): `active` | `archived`
- `deletedAt` (timestamp, nullable): Soft delete timestamp (set when the item is referenced by an existing sync)
- `createdAt`, `updatedAt` (timestamp): Audit timestamps

#### syncTemplates

Named bundles of tracking items used to instantiate weekly syncs. The default
template auto-snapshots into each new weekly sync. A partial unique index
enforces "at most one default per user".

- `id` (text, primary key): Unique template identifier
- `userId` (text, foreign key): References users.id, cascade delete
- `name` (text): Display name
- `isDefault` (boolean, NOT NULL, default `false`): When true, weeklySync.create snapshots from this template if none is explicitly passed
- `createdAt`, `updatedAt` (timestamp): Audit timestamps

#### syncTemplateItems (junction)

- `id` (text, primary key): Unique junction identifier
- `templateId` (text, foreign key): References syncTemplates.id, cascade delete
- `trackingItemId` (text, foreign key): References trackingItems.id, cascade delete
- `orderIdx` (integer, default 0): Position within the template
- `createdAt` (timestamp): Creation timestamp
- UNIQUE(templateId, trackingItemId)

#### weeklySync

- `id` (text, primary key): Unique weekly sync identifier
- `userId` (text, foreign key): References users.id
- `weekDate` (timestamp, NOT NULL): Monday of the retrospective week
- `templateId` (text, foreign key, nullable): References syncTemplates.id, ON DELETE SET NULL — the template the sync was snapshotted from at create time
- `createdAt`, `updatedAt` (timestamp): Audit timestamps

#### weeklySyncItems

Per-sync rows. `textContent` holds the user's notes inline (no more
notes.txt files on disk). `orderIdx` is per-sync ordering, initialized
from the template's order at create time but mutable via reorderItems.

- `id` (text, primary key): Unique weekly sync item identifier
- `weeklySyncId` (text, foreign key): References weeklySync.id, cascade delete
- `trackingItemId` (text, foreign key): References trackingItems.id, cascade delete
- `textContent` (text, nullable): Inline notes for this item this period
- `orderIdx` (integer, NOT NULL, default 0): Display order within the sync
- `createdAt`, `updatedAt` (timestamp): Audit timestamps

#### attachments

Polymorphic file metadata, keyed on `(parentType, parentId)`. Today's only
producer is `parentType = 'weekly_sync_item'`, but the schema is permissive
so other entities (people, goals, etc.) can opt in without another migration.
Storage path is `uploads/{userId}/attachments/{id}.{ext}` — decoupled from
goal/date/tracking-item ids so items without goals can still hold files.

- `id` (text, primary key): Unique attachment identifier
- `userId` (text, foreign key): References users.id, cascade delete
- `parentType` (text, NOT NULL): Discriminator. Currently always `'weekly_sync_item'`.
- `parentId` (text, NOT NULL): The owning row id (composite-keyed with parentType for app-level lookups)
- `fileName` (text): Original file name
- `fileType` (enum): File type (image, document, video, audio, other)
- `storagePath` (text): Relative path under `uploads/`
- `sizeBytes` (integer, nullable): File size in bytes
- `createdAt` (timestamp): Creation timestamp
- Indexed on `(parentType, parentId)` and `userId`.

#### goalValues (Junction Table)

- `id` (text, primary key): Unique junction identifier
- `goalId` (text, foreign key): References goals.id
- `valueId` (text, foreign key): References values.id
- `createdAt` (timestamp): Creation timestamp

#### people (Personal CRM)

Structured reflection surface — **not** a contact manager. Contact fields (phone, email,
birthday, last-contact, vCard import) were intentionally removed: the directory exists to
support relationship thinking, not address-book lookup.

- `id` (text, primary key): Unique person identifier
- `userId` (text, foreign key): References users.id, cascade delete
- `name` (text): Person's name
- `emoji` (text, nullable): Native emoji or URL to custom emoji image
- `category` (enum, **NOT NULL**): `to_process`, `exploring`, `long_term`, `context_bound`. Required on creation — every person must occupy a Relationships column.
- `boardOrder` (integer): Ordering within category column on Relationships board
- `appreciation` (text, nullable): What I appreciate about them — Gottman 5:1 ratio counter-weight
- `myNeeds` (text, nullable): What I need from them — naming unspoken needs before they become resentment
- `legacyMessage` (text, nullable): What I'd want them to know if I died tomorrow, or they did — also the catch-all for unfinished business (repair/release/end)
- `selfReflection` (text, nullable): What this relationship shows me about myself
- `decideBy` (timestamp, nullable): Exploring-category decision deadline (default +6 months)
- `archivedAt` (timestamp, nullable): Retirement marker — excluded from active list but preserved
- `createdAt`, `updatedAt` (timestamp): Audit timestamps

#### next_bids (per-person bids)

**Anything actionable I can do to improve this relationship** — a gift, a gesture,
a check-in, an apology. Captured when noticed, not when needed. Completed bids stay
visible (struck through) — the trail of fulfilled bids is preserved instead of
being deleted.

- `id` (text, primary key): Unique bid identifier
- `personId` (text, foreign key): References people.id, cascade delete
- `content` (text): The bid (free text)
- `dueAt` (timestamp, nullable): Optional one-shot deadline. Overdue badge shown until completion. NOT a recurring date — that's `important_dates`.
- `completedAt` (timestamp, nullable): Null = pending; non-null = done. Bid stays visible after completion.
- `createdAt` (timestamp): Creation timestamp

#### important_dates (yearly recurring per person)

Yearly-recurring dates tied to a person — birthday, anniversary, graduation, etc.
`month`/`day` define the recurrence; `year` is optional (the original year, used
for "turning N this year" math). Surfaces in Pulse when the next occurrence is
within the upcoming 30 days. Distinct from `next_bids.dueAt` — bids are one-shot
deadlines, important dates repeat yearly.

- `id` (text, primary key): Unique date identifier
- `personId` (text, foreign key): References people.id, cascade delete
- `label` (text): Human label ("Birthday", "Wedding anniversary", …)
- `month` (integer, NOT NULL, 1-12): Recurrence month
- `day` (integer, NOT NULL, 1-31): Recurrence day
- `year` (integer, nullable): Original year (optional). Used to compute "turning N" in Pulse.
- `createdAt`, `updatedAt` (timestamp): Audit timestamps

#### bucket_list_items (life list)

Things the user wants to do before dying. Flat per-user list rendered in the
"Bucket List" tab. Items are pending until checked off — `completedAt` records when.
Editing happens in `BucketListItemModal`; the list view also exposes a one-click
checkbox toggle so marking done doesn't require the modal.

- `id` (text, primary key): Unique item identifier
- `userId` (text, foreign key): References users.id, cascade delete
- `content` (text): The aspiration/thing-to-do (short headline)
- `description` (text, nullable): Longer-form context — why it matters, where, when, how
- `completedAt` (timestamp, nullable): Null = pending; non-null = done with timestamp
- `createdAt`, `updatedAt` (timestamp): Audit timestamps

#### bucket_list_item_people (junction: bucket_list_items ↔ people)

"People I want to do this with." A bucket item can name multiple people; the same
person can appear on multiple items. Cascade-deletes from either side.

- `id` (text, primary key): Unique junction identifier
- `bucketItemId` (text, foreign key): References bucket_list_items.id, cascade delete
- `personId` (text, foreign key): References people.id, cascade delete
- `createdAt` (timestamp): Creation timestamp

#### person_groups (user-defined tags)

Custom tags for categorizing people across contexts (Family, Work, University, etc.).
A person can belong to multiple groups. Rendered as the left rail on the People tab
and as chip toggles in PersonModal.

- `id` (text, primary key): Unique group identifier
- `userId` (text, foreign key): References users.id, cascade delete
- `name` (text): Display name
- `color` (text): Hex color for the group's dot (user-picked from a palette or color input)
- `orderIdx` (integer): Display order in the rail
- `createdAt`, `updatedAt` (timestamp): Audit timestamps

#### people_to_groups (junction: people ↔ person_groups)

- `id` (text, primary key): Unique junction identifier
- `personId` (text, foreign key): References people.id, cascade delete
- `groupId` (text, foreign key): References person_groups.id, cascade delete
- `createdAt` (timestamp): Creation timestamp

#### tasks_to_groups (junction: tasks ↔ person_groups)

Same `person_groups` rows the People side uses — groups are intentionally
cross-entity. A "Family" group can tag both my partner (via people_to_groups)
and the "call mom this weekend" task (via tasks_to_groups). Cascade-deletes
on both sides. The DB table name keeps `person_groups` for backwards compat
even though the concept is broader; the user-facing concept is just "Groups."

- `id` (text, primary key): Unique junction identifier
- `taskId` (text, foreign key): References tasks.id, cascade delete
- `groupId` (text, foreign key): References person_groups.id, cascade delete
- `createdAt` (timestamp): Creation timestamp

#### task_referents (junction: tasks ↔ people)

Many-to-many link: a task can have multiple referent people (people I'm relying on to make
it happen); a person can be a referent on multiple tasks. Rendered in GoalModal's task list
as chip toggles and in PersonModal's "Tasks I'm relying on them for" section. This is the
first relational tie between the Goals graph and People — deliberate, because tasks are
where reflection becomes action.

- `id` (text, primary key): Unique junction identifier
- `taskId` (text, foreign key): References tasks.id, cascade delete
- `personId` (text, foreign key): References people.id, cascade delete
- `createdAt` (timestamp): Creation timestamp

#### user_self

One row per user — the Self space is structurally distinct from a Person.
The Self page is a "living portrait," not a tracker: prose lives on this row,
list-shaped buckets (energizers, drainers, patterns, etc.) live in
`self_list_items`. Empty fields are intentional — the user only writes when
they have something new to add, so untouched sections must read as clean
pages, not unfinished forms.

- `id` (text, primary key): Unique row identifier
- `userId` (text, foreign key, UNIQUE): References users.id, cascade delete
- **Living-portrait prose fields:**
  - `thisYearSelfDescription` (text, nullable): "How I'd describe myself to someone new this year"
  - `descriptionYear` (int, nullable): Calendar year the description was written for; auto-bumps to current year on edit; null prompts the UI to claim a year on first edit
  - `myStory` (text, nullable): Long-form narrative — childhood, formative events, turning points
  - `attachmentTendencies` (text, nullable): What I want and fear when close
  - `loveLanguageGive` (text, nullable): How I show care
  - `loveLanguageReceive` (text, nullable): How I best receive care
  - `apologyLanguage` (text, nullable): What I need to hear after harm
  - `conflictStyle` (text, nullable): The mode I drop into when things go sideways
  - `stressResponse` (text, nullable): What my body does when overloaded
  - `noteToFutureSelf` (text, nullable): What I'd want them to know
- `createdAt`, `updatedAt` (timestamp): Audit timestamps

#### self_list_items

Atomic rows for every list-shaped section on the Self page. One table for all
kinds keeps the UI surface small — the page treats them uniformly (add a row,
edit content, delete, reorder). `patternCategory` is only meaningful when
`kind = 'pattern'` — null for every other kind.

- `id` (text, primary key): Unique row identifier
- `userId` (text, foreign key, NOT NULL): References users.id, cascade delete
- `kind` (enum, NOT NULL): One of `energizer | drainer | just_for_me | proud | pattern | trigger | release | year_ahead`
- `patternCategory` (enum, nullable): When `kind = 'pattern'` — `relational | self_pattern | communication | body_state | choice`. Always null for other kinds (server enforces).
- `content` (text, NOT NULL): The list item text (max 2000 chars)
- `orderIdx` (integer, NOT NULL, default 0): Per-(user, kind) ordering. New items append; reorder via `goals.selfListItems.reorder`.
- `createdAt`, `updatedAt` (timestamp): Audit timestamps
- Indexed on `(userId, kind)` for fast per-bucket reads.

### Key Relationships

- **Users** have many **Goals**, **Values**, **WeeklySync** sessions, and **People**; one optional **UserSelf** row
- **Goals** can have many child **Goals** (self-referencing hierarchy)
- **Goals** have many **Tasks** and **TrackingItems**
- **Goals** connect to other **Goals** through **Connections**
- **Goals** associate with **Values** through **GoalValues** junction table
- **TrackingItems** can be included in multiple **WeeklySyncItems**
- **WeeklySyncItems** can have multiple **Attachments** (polymorphic, `parentType = 'weekly_sync_item'`)
- **People** belong to a **User**; categorized for reflection workflow, not relational to Goals

## Information Calculated (Not Stored in Database)

### Goal Importance

Automatically calculated based on outgoing connection weights:

- **Low**: No outgoing connections or average weight d 33.3
- **Medium**: Average weight between 33.3 and 66.6
- **High**: Average weight e 66.6

### Progress Metrics

- **Task Completion Rate**: Percentage of completed tasks per goal
- **Goal Progress**: Derived from task completion and tracking item updates
- **Weekly Sync Statistics**: Aggregated data from weekly retrospectives

### Weekly Sync Data

- **Current Week Status**: Whether weekly sync exists for current week
- **Tracking Item Files**: Aggregated file counts and types per tracking item
- **Historical Progress**: Trends based on weekly sync participation

## Main Backend Endpoints and Features

### Authentication & Profile Endpoints

- `auth.authenticate`: Password-based user authentication
- `auth.register`: Create a new account (name, email, password)
- `auth.getUsers`: Retrieve available users for selection
- `auth.verify`: Verify JWT token validity
- `auth.me`: Read the current user's profile (id, name, email, avatarUrl)
- `auth.updateProfile`: Update name and/or email; rejects email collisions with another account
- `auth.changePassword`: Verify current password, then set a new hashed one
- `auth.uploadAvatar`: Base64 image upload → `uploads/{userId}/avatar.{ext}`; updates `users.avatarUrl`. Cleans up stale extensions on overwrite.
- `auth.removeAvatar`: Unlink any avatar files and null out `users.avatarUrl`

### Goals Management

- `goals.goals.getAll`: Retrieve all goals with tasks and relationships
- `goals.goals.create`: Create new goal with tasks and value associations
- `goals.goals.update`: Update goal properties, tasks, and relationships
- `goals.goals.delete`: Delete goal and cascade related data

### Values Management

- `goals.values.getAll`: Retrieve user's personal values
- `goals.values.create`: Create new personal value
- `goals.values.update`: Update value properties
- `goals.values.delete`: Delete value and remove goal associations

### Tasks Management

- `goals.tasks.create`: Create new task for specific goal. Accepts `referentIds[]` and `groupIds[]` for the people/group memberships at create time.
- `goals.tasks.update`: Update task properties and completion status (including `scheduledAt`). `referentIds[]` and `groupIds[]` are replace-set semantics — pass the desired final set, omit to leave unchanged.
- `goals.tasks.delete`: Delete task from goal
- `goals.tasks.setScheduled({ id, scheduledAt })`: Lightweight drag-drop endpoint for the Horizons board. Sets (or clears) the scheduled date. The bucket the task lands in is computed client-side from the date and current time; the server only persists the date. Ownership enforced via the task's parent goal.
- `goals.nextBids.listUpcoming({ withinDays })`: All open bids across the user's people whose `dueAt` falls within the window (default 60 days). Joined with person name + emoji. Drives the unified Pulse "Upcoming" feed alongside `goals.importantDates.list`.

### Connections Management

- `goals.connections.getAll`: Retrieve all goal connections
- `goals.connections.create`: Create weighted connection between goals
- `goals.connections.update`: Update connection weight
- `goals.connections.delete`: Remove connection between goals

### Tracking Items (user-owned, goal optional)

- `goals.trackingItems.list({ goalId? })`: All of the user's items, optionally filtered by goal. Replaces the old `getAll`.
- `goals.trackingItems.create({ title, description?, goalId?, order? })`: Create a tracking item. `goalId` is optional — omit to create an "Unscoped" item.
- `goals.trackingItems.update`: Update title/description/order/status; can also re-link or unlink the goal via `goalId`.
- `goals.trackingItems.delete`: Soft-deletes when any sync still references the item; hard-deletes otherwise.

### Sync Templates

- `goals.syncTemplates.list`: List the user's templates with their items.
- `goals.syncTemplates.create({ name, isDefault? })`: Create a template. Setting `isDefault: true` clears any existing default in the same tx.
- `goals.syncTemplates.update`: Rename or change `isDefault`.
- `goals.syncTemplates.delete`: Cascade-deletes the template's items.
- `goals.syncTemplates.setItems({ templateId, items })`: Replace-set semantics on the template's tracking items + their `orderIdx`.

### Weekly Sync

- `goals.weeklySync.getByWeek({ weekStart })`: Lookup the sync row for the week.
- `goals.weeklySync.getWeeklyRetrospectiveData({ weekStart })`: Hydrates everything the retro needs — the weeklySync row (or null), the user's full tracking-items library (for the "+ add" picker), goal-grouped sync items with inline `textContent` and `attachments[]`, plus a top-level `unscopedItems[]` for items with `goal_id IS NULL`.
- `goals.weeklySync.create({ weekDate, templateId? })`: Create a sync. Snapshots items from the explicit template OR the user's default template (if any); empty otherwise.
- `goals.weeklySync.addItem({ weeklySyncId, trackingItemId })`: Idempotent. Returns the existing row if the (sync, item) pair is already present; new rows go to the end of the orderIdx range.
- `goals.weeklySync.removeItem({ weeklySyncItemId })`: Drop the item from this sync only — the underlying tracking item stays in the user's library. Hand-deletes attachments so the files get unlinked from disk.
- `goals.weeklySync.setItemText({ weeklySyncItemId, textContent })`: Direct DB update on the inline text column. No filesystem.
- `goals.weeklySync.reorderItems({ weeklySyncId, ordering })`: Persist a new `orderIdx` for each item.

### Attachments

- `goals.attachments.upload({ parentType: 'weekly_sync_item', parentId, fileName, fileType, data })`: Base64 → disk under `uploads/{userId}/attachments/{id}.{ext}`. DB row created first; FS write inside the same tx so a failed write rolls back.
- `goals.attachments.delete({ id })`: DB row delete then unlink.

### Other File Operations

- `goals.images.upload`: Upload single image file (used outside the weekly sync flow).
- `goals.images.uploadMultiple`: Upload multiple image files.

### People Management (Personal CRM)

- `goals.people.getAll`: List user's people; `includeArchived` flag controls whether archived rows are returned
- `goals.people.getById`: Fetch a single person by id (user-scoped)
- `goals.people.create`: Create a new person
- `goals.people.update`: Partial update (any field except id)
- `goals.people.archive` / `goals.people.unarchive`: Toggle `archivedAt` — preferred over delete for retention
- `goals.people.delete`: Hard delete (only for truly wrong entries)
- `goals.people.setCategory`: Lightweight drag-drop endpoint — updates only category + boardOrder
- `goals.people.getTasksAsReferent`: Lists tasks (with goal context) where a given person is a referent
- `goals.people.getBucketListItemsAsParticipant`: Lists bucket list items the person is named on (read-only counterpart shown inside PersonModal)
- `goals.groups.getAll` / `create` / `update` / `delete`: CRUD for user-defined groups (tags). The same group can hold both people (via `people_to_groups`) and tasks (via `tasks_to_groups`).
- `goals.groups.getTasks({ groupId })`: List tasks tagged with a group, joined with goal context (id/title/emoji + scheduled date + completion). Drives the Tasks section on the group filter view.

### Bids (per-person)

- `goals.nextBids.list({ personId })`: All bids for a person, oldest first
- `goals.nextBids.create({ personId, content, dueAt? })`: Create a bid, optionally with a deadline
- `goals.nextBids.update({ id, content?, dueAt? })`: Edit content and/or deadline (`dueAt: null` clears it)
- `goals.nextBids.setCompleted({ id, completed })`: Toggle done state. Sets/clears `completedAt`. Bid stays visible.
- `goals.nextBids.delete({ id })`: Hard delete (used only for truly wrong entries — completed bids should be left in place)

### Important Dates

- `goals.importantDates.list({ personId? })`: List dates. Optional `personId` filter; otherwise returns every date across all the user's people, sorted by month/day.
- `goals.importantDates.create({ personId, label, month, day, year? })`: Create a yearly recurring date
- `goals.importantDates.update({ id, label?, month?, day?, year? })`: Partial update
- `goals.importantDates.delete({ id })`: Hard delete

### Self Space

The Self page is a "living portrait" — prose lives on `user_self`, list-shaped
buckets live in `self_list_items`. Both are user-scoped; ownership enforced
on every read/write.

- `goals.self.get`: Fetch the caller's Self row (or null if not yet created)
- `goals.self.update`: Partial update of any prose field on `user_self`. Same endpoint upserts on first write — accepts `thisYearSelfDescription`, `descriptionYear`, `myStory`, `attachmentTendencies`, `loveLanguageGive`, `loveLanguageReceive`, `apologyLanguage`, `conflictStyle`, `stressResponse`, `noteToFutureSelf`. Only the fields you pass get written.
- `goals.selfListItems.list`: All list items for the user, ordered by kind then orderIdx. Client groups by kind on render.
- `goals.selfListItems.create({ kind, content, patternCategory? })`: Append a row at the end of its kind's list. Server zeroes `patternCategory` for every kind except `pattern`.
- `goals.selfListItems.update({ id, content?, patternCategory? })`: Partial update. Server enforces `patternCategory` only stays set on rows where `kind = 'pattern'`.
- `goals.selfListItems.delete({ id })`: Hard delete (these are intentionally low-friction).
- `goals.selfListItems.reorder({ kind, ordering })`: Atomic re-numbering, gated on userId + kind so a forged id from another kind/user is a no-op.

### Bucket List

- `goals.bucketList.list`: All items for the current user (oldest first); each row hydrates `personIds[]` for linked people
- `goals.bucketList.create`: Create a pending item (`{ content, description?, personIds? }`)
- `goals.bucketList.update`: Edit (`{ id, content, description?, personIds? }`); pass `personIds` to replace the link set, omit to leave unchanged
- `goals.bucketList.toggleCompleted`: Mark done/undone (`{ id, completed }`); sets/clears `completedAt`
- `goals.bucketList.delete`: Hard delete (no archive — bucket items are intentionally low-friction)

### Data Export

- `goals.data.getAll`: Export all user data (values, goals, connections)
- `goals.backup.export` / `goals.backup.import`: Full user backup (includes people + userSelf)

### File Serving

- `/uploads/[...path]`: Static file serving for uploaded content

## File Storage

Files are stored under `uploads/` in the project root. Text notes for sync
items are inline in the DB (`weekly_sync_items.text_content`); only binary
attachments touch disk.

### Path Structure

```
uploads/
     {userId}/
         attachments/
             {attachmentId}.{ext}
```

The path is keyed only on user — attachments live under their owner
regardless of which sync item they're attached to. The DB row in
`attachments` resolves the relationship via `(parentType, parentId)`.

### File Types Supported

- **Images**: PNG, JPG, JPEG, GIF, WebP
- **Documents**: Text files, PDFs, etc. (note that user-typed sync notes are
  stored inline in `weekly_sync_items.text_content`, not as files)
- **Other**: Video, audio, and other file types with appropriate extensions

### Security Features

- **Ownership Enforcement**: Every attachment row carries `userId`; uploads
  validate the parent row's owner; deletes match by `id` AND `userId`.
- **Directory Traversal Prevention**: Paths are constructed server-side from
  validated ids — no user-supplied path segments.
- **Base64 Validation**: Validate the payload envelope before touching disk.
- **Atomic Writes**: DB row first, FS write inside the same tx — a failed
  write rolls back the row, no orphans.

### File Operations Available

- **Upload Attachments**: `goals.attachments.upload` for binary files on a sync item.
- **Inline Text Notes**: `goals.weeklySync.setItemText` — DB-only, no filesystem.
- **Delete Attachments**: `goals.attachments.delete` — DB row delete + unlink.
- **Serve Files**: Via protected `/uploads/[...path]` route.

## Important Maintenance Note

**CRITICAL**: This CLAUDE.md file must be updated every time changes are made to the project. It should never contain different information than what is actually implemented in the codebase.

### Changes Requiring Documentation Updates:

- Database schema modifications
- New or modified API endpoints
- Changes to file structure or organization
- Addition or removal of features
- Technology stack updates
- Authentication system changes
- File storage system modifications
- UI/UX component restructuring

**Responsibility**: Any developer making changes to the codebase must immediately update this documentation to maintain accuracy and usefulness for future development work.

## Post-change verification (required for every non-trivial change)

After any meaningful change — schema, router, component, refactor — you MUST
run the full trio and **fix every warning and error before declaring the work
done**. Skipping this turns the next session's first 30 minutes into cleanup.

```bash
npm run format    # Prettier — formats in place
npm run lint      # ESLint — must end with zero warnings AND zero errors
npm run build     # Next build — must finish cleanly (treat warnings as errors)
```

Rules:
- Zero is the only acceptable count. Don't ship "just one warning" — they
  compound and get ignored.
- If a warning seems wrong, fix the root cause (rename a variable, restructure
  a hook, narrow a type) rather than disabling the rule. `eslint-disable`
  comments need a one-line justification and should be rare.
- The pre-existing `_global-error` prerender warning during `npm run build`
  is the documented exception — see the memory note about it. Anything else
  new is on you to fix.
- Format failures are usually just whitespace; rerun `npm run format` and
  recommit.

## Database migrations

Drizzle migrations live in `src/lib/data/db/migrations/`. Two rules to follow:

1. **One migration per PR.** Schema changes should land as a single consolidated migration
   file, not a chain of incremental fixups. Reviewers shouldn't have to replay your
   iteration history, and squashing after-the-fact is a merge-conflict magnet.
2. **If you change schema during a PR and the previous migration isn't committed yet,
   roll it back before regenerating.** Workflow:
   - Manually reverse the applied migration in Postgres (`DROP TABLE`, `ALTER TABLE DROP COLUMN`, etc.) and delete its row from `drizzle.__drizzle_migrations` (match on `hash`, not `id`).
   - Delete the uncommitted `.sql` + `meta/NNNN_snapshot.json` and remove the matching `entries[]` item from `meta/_journal.json`.
   - Edit schema.ts, then `npm run db:generate` to produce a single fresh migration.
   - `npm run db:migrate` to apply.
   - **Do not** use `npm run db:push` during this workflow — it's interactive and touches unrelated foreign keys.

---

_This documentation serves as the single source of truth for understanding Anansi's architecture, features, and implementation details._
