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
import { AlertCircle, Check, Clock, Inbox, Square } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { isEmojiUrl } from '~/lib/emoji-utils'
import { bucketForDate, endOfCurrentBucket, formatScheduledShort, labelForBucket } from '~/lib/horizon-period'
import { useSetTaskScheduled, useUpdateTask } from '~/lib/mutations/goals-data'
import { useGoalsData } from '~/lib/queries/goals'
import { Route } from '~/routes/app.tasks'
import GoalModal from './GoalModal'
import { ScreenHeader } from './ui'
import MentionText from './MentionText'

// Time-bound objectives. Columns are COMPUTED from each task's scheduledAt
// and today's date — not from a stored enum. As the calendar advances, a
// Sept 15 task auto-promotes from Yearly → Quarterly (when Q3 starts) →
// Monthly (when September arrives). The user only ever picks one date;
// the buckets follow.
type ColumnId = 'backlog' | 'month' | 'quarter' | 'year' | 'later' | 'past'

// Written out so Tailwind sees each class.
const GRID_COLS: Record<number, string> = {
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
  6: 'xl:grid-cols-6',
}

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

// Past due and Later are where tasks land as dates pass or lie far off, not
// where a task can be put, so they take no drops (a card in them can still be
// dragged out to another column).
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
  const readOnly = columnId === 'past' || columnId === 'later'
  const { setNodeRef, isOver } = useDroppable({ id: columnId, disabled: readOnly })
  const Icon = columnId === 'backlog' ? Inbox : columnId === 'past' ? AlertCircle : Clock
  const past = columnId === 'past'
  return (
    <section
      ref={setNodeRef}
      className={`flex min-w-0 flex-col rounded-xl border transition-colors ${
        past ? 'border-[var(--amber)] bg-[var(--amber-soft)]' : 'bg-[var(--vellum)]'
      } ${past ? '' : isOver ? 'border-[var(--hairline-2)]' : 'border-[var(--hairline)]'}`}
    >
      <div className="flex h-20 flex-col justify-start border-b border-[var(--hairline)] px-4 py-3">
        <div className="flex items-center justify-between">
          <h3
            className={`flex items-center gap-2 text-sm font-medium ${past ? 'text-[var(--amber)]' : 'text-[var(--ink)]'}`}
          >
            <Icon className={`h-3.5 w-3.5 ${past ? 'text-[var(--amber)]' : 'text-[var(--ink-3)]'}`} />
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
        // The board is what is still to do; a finished task has left it.
        if (task.completed) continue
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

  // Header counts — open tasks, and the open ones that have a date.
  const openCount = goals.reduce((sum, g) => sum + g.tasks.filter((task) => !task.completed).length, 0)
  const scheduledCount = goals.reduce(
    (sum, g) => sum + g.tasks.filter((task) => !task.completed && task.scheduledAt).length,
    0,
  )

  // The columns, left to right from no date to furthest off: Backlog, Past due
  // (only when something is late), this month, quarter and year, then Later
  // (only when something is past this year). The TickTick list has the same
  // sections, names included (~/lib/ticktick SECTIONS, sectionName).
  const columns: { id: ColumnId; title: string; hint: string }[] = [
    { id: 'backlog', title: t('horizons.backlog'), hint: t('horizons.backlogHint') },
    ...(byColumn.past.length > 0
      ? [{ id: 'past' as const, title: t('horizons.pastDue'), hint: t('horizons.pastDueHint') }]
      : []),
    { id: 'month', title: labelForBucket('month', now), hint: t('horizons.monthHint') },
    { id: 'quarter', title: labelForBucket('quarter', now), hint: t('horizons.quarterHint') },
    { id: 'year', title: labelForBucket('year', now), hint: t('horizons.yearHint') },
    ...(byColumn.later.length > 0
      ? [{ id: 'later' as const, title: t('horizons.later'), hint: t('horizons.laterHint') }]
      : []),
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ background: 'var(--paper)' }}>
      <div className="shrink-0 px-5 md:px-10">
        <ScreenHeader
          title={
            <>
              {t('horizons.titlePre')}
              <span className="brand-em">{t('horizons.titleEm')}</span>
            </>
          }
          sub={
            goals.length > 0
              ? `${openCount} ${t('horizons.openCount')} · ${scheduledCount} ${t('horizons.scheduledCount')}`
              : undefined
          }
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Explicit `id` for SSR — see RelationshipsBoard for why. */}
        <DndContext id="horizons" sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className={`grid grid-cols-1 gap-4 px-5 pb-10 sm:grid-cols-2 md:px-10 ${GRID_COLS[columns.length]}`}>
            {columns.map((col) => (
              <DroppableColumn
                key={col.id}
                columnId={col.id}
                title={col.title}
                hint={col.hint}
                count={byColumn[col.id].length}
                tasks={byColumn[col.id]}
                onCardClick={(task) => setOpenGoalId(task.goalId)}
                onToggleComplete={handleToggleComplete}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeTask ? <TaskCard task={activeTask} isDragging /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      {openGoalId && <GoalModal goalId={openGoalId} onClose={() => setOpenGoalId(undefined)} />}
    </div>
  )
}
