import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { Check, Clock, Inbox, Square } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { isEmojiUrl } from '~/lib/emoji-utils'
import { bucketForDate, endOfCurrentBucket, formatScheduledShort, labelForBucket } from '~/lib/horizon-period'
import { useSetTaskScheduled, useUpdateTask } from '~/lib/mutations/goals-data'
import { useGoalsData } from '~/lib/queries/goals'
import { Route } from '~/routes/app.horizons'
import GoalModal from './GoalModal'
import MentionText from './MentionText'

// Time-bound objectives. Columns are COMPUTED from each task's scheduledAt
// and today's date — not from a stored enum. As the calendar advances, a
// Sept 15 task auto-promotes from Yearly → Quarterly (when Q3 starts) →
// Monthly (when September arrives). The user only ever picks one date;
// the buckets follow.
type ColumnId = 'backlog' | 'month' | 'quarter' | 'year' | 'later' | 'past'

type FlatTask = {
  id: string
  title: string
  difficulty: 1 | 2 | 3
  completed: boolean
  scheduledAt: Date | null
  goalId: string
  goalTitle: string
  goalEmoji: string | undefined
}

function difficultyDot(difficulty: 1 | 2 | 3) {
  if (difficulty === 1) return 'bg-[var(--moss)]'
  if (difficulty === 2) return 'bg-[var(--amber)]'
  return 'bg-[var(--rust)]'
}

function bucketColumnId(t: FlatTask, now: Date): ColumnId {
  if (!t.scheduledAt) return 'backlog'
  const b = bucketForDate(t.scheduledAt, now)
  return b
}

function TaskCard({
  task,
  onToggleComplete,
  onClick,
  isDragging = false,
}: {
  task: FlatTask
  onToggleComplete?: (e: React.MouseEvent) => void
  onClick?: () => void
  isDragging?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div
      onClick={onClick}
      className={`group flex w-full items-start gap-2.5 rounded-lg border p-3 text-left transition-colors ${
        isDragging
          ? 'border-[var(--hairline-2)] bg-[var(--paper)] shadow-2xl'
          : 'cursor-grab border-[var(--hairline)] bg-[var(--vellum)] hover:border-[var(--hairline-2)] hover:bg-[var(--vellum)] active:cursor-grabbing'
      }`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleComplete?.(e)
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="mt-0.5 shrink-0 text-[var(--ink-2)] hover:text-[var(--ink)]"
        aria-label={task.completed ? t('horizons.markIncomplete') : t('horizons.markComplete')}
      >
        {task.completed ? <Check className="h-4 w-4 text-[var(--moss)]" /> : <Square className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div
          className={`text-sm leading-snug ${task.completed ? 'text-[var(--ink-3)] line-through' : 'text-[var(--ink)]'}`}
        >
          <MentionText text={task.title} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="flex min-w-0 items-center gap-1 rounded-full border border-[var(--hairline)] bg-[var(--vellum)] px-2 py-0.5 text-[10px] text-[var(--ink-2)]">
            {task.goalEmoji ? (
              isEmojiUrl(task.goalEmoji) ? (
                <img src={task.goalEmoji} alt="" width={10} height={10} className="h-2.5 w-2.5 object-contain" />
              ) : (
                <span className="leading-none">{task.goalEmoji}</span>
              )
            ) : null}
            <span className="truncate">{task.goalTitle}</span>
          </span>
          {task.scheduledAt && (
            <span className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--hairline)] bg-[var(--vellum)] px-1.5 py-0.5 text-[10px] text-[var(--ink-3)]">
              <Clock className="h-2.5 w-2.5" />
              {formatScheduledShort(task.scheduledAt)}
            </span>
          )}
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${difficultyDot(task.difficulty)}`}
            title={t('horizons.difficultyTooltip', { level: task.difficulty })}
          />
        </div>
      </div>
    </div>
  )
}

function DraggableCard({
  task,
  onToggleComplete,
  onClick,
}: {
  task: FlatTask
  onToggleComplete: () => void
  onClick: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={isDragging ? 'opacity-30' : ''}
      onClick={(e) => {
        if (!isDragging) onClick()
        e.stopPropagation()
      }}
    >
      <TaskCard
        task={task}
        onToggleComplete={(e) => {
          e.stopPropagation()
          onToggleComplete()
        }}
      />
    </div>
  )
}

function DroppableColumn({
  columnId,
  title,
  hint,
  count,
  tasks,
  onCardClick,
  onToggleComplete,
}: {
  columnId: ColumnId
  title: string
  hint: string
  count: number
  tasks: FlatTask[]
  onCardClick: (t: FlatTask) => void
  onToggleComplete: (t: FlatTask) => void
}) {
  const { t } = useTranslation()
  const { setNodeRef, isOver } = useDroppable({ id: columnId })
  const Icon = columnId === 'backlog' ? Inbox : Clock
  return (
    <section
      ref={setNodeRef}
      className={`flex min-w-0 flex-col rounded-xl border bg-[var(--vellum)] transition-colors ${
        isOver ? 'border-[var(--hairline-2)] bg-[var(--vellum)]' : 'border-[var(--hairline)]'
      }`}
    >
      <div className="flex h-20 flex-col justify-start border-b border-[var(--hairline)] px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-medium text-[var(--ink)]">
            <Icon className="h-3.5 w-3.5 text-[var(--ink-3)]" />
            {title}
          </h3>
          <span className="rounded-full bg-[var(--vellum)] px-2 py-0.5 text-xs text-[var(--ink-2)]">{count}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-[var(--ink-3)]">{hint}</p>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        {tasks.length === 0 ? (
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-[var(--hairline)] text-xs text-[var(--ink-4)]">
            {t('horizons.dropHere')}
          </div>
        ) : (
          tasks.map((task) => (
            <DraggableCard
              key={task.id}
              task={task}
              onClick={() => onCardClick(task)}
              onToggleComplete={() => onToggleComplete(task)}
            />
          ))
        )}
      </div>
    </section>
  )
}

export default function Horizons() {
  const { t } = useTranslation()
  const { goals } = useGoalsData()
  const updateTask = useUpdateTask()
  // The optimistic cache patch this used to declare inline now lives in
  // useSetTaskScheduled — it is the same shape the two other optimistic
  // mutations use, and it belongs next to them.
  const setScheduledMutation = useSetTaskScheduled({ onError: () => toast.error(t('horizons.moveFailed')) })

  const [activeId, setActiveId] = useState<string | null>(null)

  // The open goal is a search param, so a goal opened from a horizon card is
  // linkable and survives a reload.
  const { goal: openGoalId } = Route.useSearch()
  const navigate = Route.useNavigate()
  const setOpenGoalId = (goalId: string | undefined) => void navigate({ search: (prev) => ({ ...prev, goal: goalId }) })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  // `now` captured once per mount; the page is rebuilt naturally if the user
  // leaves and returns. We don't need second-by-second precision here.
  const now = useMemo(() => new Date(), [])

  const { byColumn, flatById } = useMemo(() => {
    const byColumn: Record<ColumnId, FlatTask[]> = {
      backlog: [],
      past: [],
      month: [],
      quarter: [],
      year: [],
      later: [],
    }
    const flatById: Record<string, FlatTask> = {}
    for (const g of goals) {
      for (const task of g.tasks) {
        const flat: FlatTask = {
          id: task.id,
          title: task.title,
          difficulty: task.difficulty,
          completed: task.completed,
          scheduledAt: task.scheduledAt ? new Date(task.scheduledAt) : null,
          goalId: g.id,
          goalTitle: g.title,
          goalEmoji: g.emoji,
        }
        flatById[task.id] = flat
        byColumn[bucketColumnId(flat, now)].push(flat)
      }
    }
    for (const col of Object.keys(byColumn) as ColumnId[]) {
      byColumn[col].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1
        // Earliest deadline first; nulls last.
        const ta = a.scheduledAt?.getTime() ?? Number.POSITIVE_INFINITY
        const tb = b.scheduledAt?.getTime() ?? Number.POSITIVE_INFINITY
        return ta - tb || a.title.localeCompare(b.title)
      })
    }
    return { byColumn, flatById }
  }, [goals, now])

  const activeTask = activeId ? flatById[activeId] : null

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id))
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    if (!e.over) return
    const taskId = String(e.active.id)
    const target = e.over.id as ColumnId
    const task = flatById[taskId]
    if (!task) return

    // Backlog → null. Bucket targets → end of that bucket. Past/Later
    // are read-only computed lanes (no drop target rendered for them).
    let nextScheduled: Date | null
    if (target === 'backlog') {
      nextScheduled = null
    } else if (target === 'month' || target === 'quarter' || target === 'year') {
      nextScheduled = endOfCurrentBucket(target, now)
    } else {
      // Past / Later — ignore drops here; not rendered as droppable.
      return
    }

    // Skip identical placement.
    const currentColumn = bucketColumnId(task, now)
    if (currentColumn === target && (task.scheduledAt?.getTime() ?? null) === (nextScheduled?.getTime() ?? null)) {
      return
    }

    setScheduledMutation.mutate({ id: taskId, scheduledAt: nextScheduled })
  }

  const handleToggleComplete = (task: FlatTask) => {
    updateTask.mutate({ id: task.id, goalId: task.goalId, completed: !task.completed })
  }

  // Header counts — total open + scheduled across all buckets.
  const openCount = goals.reduce((sum, g) => sum + g.tasks.filter((task) => !task.completed).length, 0)
  const scheduledCount = goals.reduce((sum, g) => sum + g.tasks.filter((task) => task.scheduledAt).length, 0)

  // Column rendering — we always show the four primary columns. "Past" and
  // "Later" appear only when populated, as small flagged sections at the top
  // and bottom respectively. Keeps the default layout four columns wide.
  const monthLabel = labelForBucket('month', now)
  const quarterLabel = labelForBucket('quarter', now)
  const yearLabel = labelForBucket('year', now)

  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ background: 'var(--paper)' }}>
      <header className="shrink-0 px-6 pt-10 pb-7 md:px-12" style={{ borderBottom: '1px solid var(--hairline)' }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.08em',
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          {t('horizons.eyebrow')}
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 44,
            lineHeight: 1.2,
            letterSpacing: '-0.02em',
            color: 'var(--ink)',
          }}
        >
          {t('horizons.titlePre')}
          <span className="brand-em">{t('horizons.titleEm')}</span>
        </h1>
        <p
          className="mt-3 max-w-2xl"
          style={{
            fontFamily: 'var(--font-text)',
            fontStyle: 'italic',
            fontSize: 17,
            color: 'var(--ink-2)',
            lineHeight: 1.4,
          }}
        >
          {t('horizons.subtitle')}
        </p>
        {goals.length > 0 && (
          <div
            className="mt-4 flex gap-4"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}
          >
            <span>
              <span style={{ color: 'var(--ink)' }}>{openCount}</span> {t('horizons.openCount')}
            </span>
            <span>·</span>
            <span>
              <span style={{ color: 'var(--ink)' }}>{scheduledCount}</span> {t('horizons.scheduledCount')}
            </span>
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Explicit `id` for SSR — see RelationshipsBoard for why. */}
        <DndContext id="horizons" sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {/* Past — overdue, only when populated. Read-only placement; the
              user must reschedule via the card or open the goal to fix it. */}
          {byColumn.past.length > 0 && (
            <div className="px-6 pt-6 pb-4 md:px-8">
              <div className="rounded-xl border border-[var(--amber)] bg-[var(--amber-soft)] p-3">
                <h3 className="mb-2 flex items-center gap-2 text-xs font-medium tracking-wide text-[var(--amber)] uppercase">
                  <Clock className="h-3 w-3" />
                  {t('horizons.pastDue', { count: byColumn.past.filter((task) => !task.completed).length })}
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {byColumn.past.map((task) => (
                    <DraggableCard
                      key={task.id}
                      task={task}
                      onClick={() => setOpenGoalId(task.goalId)}
                      onToggleComplete={() => handleToggleComplete(task)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 px-6 pt-6 pb-8 sm:grid-cols-2 md:px-8 xl:grid-cols-4">
            <DroppableColumn
              columnId="backlog"
              title={t('horizons.backlog')}
              hint={t('horizons.backlogHint')}
              count={byColumn.backlog.filter((task) => !task.completed).length}
              tasks={byColumn.backlog}
              onCardClick={(task) => setOpenGoalId(task.goalId)}
              onToggleComplete={handleToggleComplete}
            />
            <DroppableColumn
              columnId="month"
              title={monthLabel}
              hint={t('horizons.monthHint')}
              count={byColumn.month.filter((task) => !task.completed).length}
              tasks={byColumn.month}
              onCardClick={(task) => setOpenGoalId(task.goalId)}
              onToggleComplete={handleToggleComplete}
            />
            <DroppableColumn
              columnId="quarter"
              title={quarterLabel}
              hint={t('horizons.quarterHint')}
              count={byColumn.quarter.filter((task) => !task.completed).length}
              tasks={byColumn.quarter}
              onCardClick={(task) => setOpenGoalId(task.goalId)}
              onToggleComplete={handleToggleComplete}
            />
            <DroppableColumn
              columnId="year"
              title={yearLabel}
              hint={t('horizons.yearHint')}
              count={byColumn.year.filter((task) => !task.completed).length}
              tasks={byColumn.year}
              onCardClick={(task) => setOpenGoalId(task.goalId)}
              onToggleComplete={handleToggleComplete}
            />
          </div>

          {/* Later — beyond this year. Read-only; drag is not enabled for
              this lane (user can shift via DatePicker on the card). */}
          {byColumn.later.length > 0 && (
            <div className="px-6 pb-8 md:px-8">
              <div className="rounded-xl border border-[var(--hairline)] bg-[var(--vellum)] p-3">
                <h3 className="mb-2 flex items-center gap-2 text-xs font-medium tracking-wide text-[var(--ink-3)] uppercase">
                  <Clock className="h-3 w-3" />
                  {t('horizons.later', { count: byColumn.later.filter((task) => !task.completed).length })}
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {byColumn.later.map((task) => (
                    <DraggableCard
                      key={task.id}
                      task={task}
                      onClick={() => setOpenGoalId(task.goalId)}
                      onToggleComplete={() => handleToggleComplete(task)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <DragOverlay dropAnimation={null}>
            {activeTask ? <TaskCard task={activeTask} isDragging /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      {openGoalId && <GoalModal goalId={openGoalId} onClose={() => setOpenGoalId(undefined)} />}
    </div>
  )
}
