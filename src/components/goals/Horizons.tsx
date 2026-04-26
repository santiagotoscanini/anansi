"use client";

import { useMemo, useState } from "react";
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
} from "@dnd-kit/core";
import Image from "next/image";
import { Check, Clock, Inbox, Square } from "lucide-react";
import toast from "react-hot-toast";
import { useGoals } from "~/contexts/GoalsContext";
import { api } from "~/trpc/react";
import { isEmojiUrl } from "~/lib/emoji-utils";
import { bucketForDate, endOfCurrentBucket, formatScheduledShort, labelForBucket } from "~/lib/horizon-period";
import GoalModal from "./GoalModal";

// Time-bound objectives. Columns are COMPUTED from each task's scheduledAt
// and today's date — not from a stored enum. As the calendar advances, a
// Sept 15 task auto-promotes from Yearly → Quarterly (when Q3 starts) →
// Monthly (when September arrives). The user only ever picks one date;
// the buckets follow.
type ColumnId = "backlog" | "month" | "quarter" | "year" | "later" | "past";

type FlatTask = {
  id: string;
  title: string;
  difficulty: 1 | 2 | 3;
  completed: boolean;
  scheduledAt: Date | null;
  goalId: string;
  goalTitle: string;
  goalEmoji: string | undefined;
};

function difficultyDot(difficulty: 1 | 2 | 3) {
  if (difficulty === 1) return "bg-green-500";
  if (difficulty === 2) return "bg-yellow-500";
  return "bg-red-500";
}

function bucketColumnId(t: FlatTask, now: Date): ColumnId {
  if (!t.scheduledAt) return "backlog";
  const b = bucketForDate(t.scheduledAt, now);
  return b;
}

function TaskCard({
  task,
  onToggleComplete,
  onClick,
  isDragging = false,
}: {
  task: FlatTask;
  onToggleComplete?: (e: React.MouseEvent) => void;
  onClick?: () => void;
  isDragging?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={`group flex w-full items-start gap-2.5 rounded-lg border p-3 text-left transition-colors ${
        isDragging
          ? "border-white/40 bg-black shadow-2xl"
          : "cursor-grab border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10 active:cursor-grabbing"
      }`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleComplete?.(e);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="mt-0.5 shrink-0 text-white/60 hover:text-white"
        aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
      >
        {task.completed ? <Check className="h-4 w-4 text-emerald-400" /> : <Square className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`text-sm leading-snug ${task.completed ? "text-white/40 line-through" : "text-white/90"}`}>
          {task.title}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="flex min-w-0 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/60">
            {task.goalEmoji ? (
              isEmojiUrl(task.goalEmoji) ? (
                <Image src={task.goalEmoji} alt="" width={10} height={10} className="h-2.5 w-2.5 object-contain" />
              ) : (
                <span className="leading-none">{task.goalEmoji}</span>
              )
            ) : null}
            <span className="truncate">{task.goalTitle}</span>
          </span>
          {task.scheduledAt && (
            <span className="flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/55">
              <Clock className="h-2.5 w-2.5" />
              {formatScheduledShort(task.scheduledAt)}
            </span>
          )}
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${difficultyDot(task.difficulty)}`}
            title={`Difficulty ${task.difficulty}`}
          />
        </div>
      </div>
    </div>
  );
}

function DraggableCard({
  task,
  onToggleComplete,
  onClick,
}: {
  task: FlatTask;
  onToggleComplete: () => void;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={isDragging ? "opacity-30" : ""}
      onClick={(e) => {
        if (!isDragging) onClick();
        e.stopPropagation();
      }}
    >
      <TaskCard
        task={task}
        onToggleComplete={(e) => {
          e.stopPropagation();
          onToggleComplete();
        }}
      />
    </div>
  );
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
  columnId: ColumnId;
  title: string;
  hint: string;
  count: number;
  tasks: FlatTask[];
  onCardClick: (t: FlatTask) => void;
  onToggleComplete: (t: FlatTask) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });
  const Icon = columnId === "backlog" ? Inbox : Clock;
  return (
    <section
      ref={setNodeRef}
      className={`flex min-w-0 flex-col rounded-xl border bg-white/[0.02] transition-colors ${
        isOver ? "border-white/40 bg-white/[0.06]" : "border-white/10"
      }`}
    >
      <div className="flex h-20 flex-col justify-start border-b border-white/5 px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-medium text-white">
            <Icon className="h-3.5 w-3.5 text-white/50" />
            {title}
          </h3>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">{count}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-white/40">{hint}</p>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        {tasks.length === 0 ? (
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-white/10 text-xs text-white/30">
            Drop here
          </div>
        ) : (
          tasks.map((t) => (
            <DraggableCard
              key={t.id}
              task={t}
              onClick={() => onCardClick(t)}
              onToggleComplete={() => onToggleComplete(t)}
            />
          ))
        )}
      </div>
    </section>
  );
}

export default function Horizons() {
  const { goals, updateTask } = useGoals();
  const utils = api.useUtils();

  // Optimistic setScheduled. The cache to update is `goals.data.getAll`,
  // since GoalsContext hydrates `goals` from there.
  const setScheduledMutation = api.goals.tasks.setScheduled.useMutation({
    onMutate: async (vars) => {
      await utils.goals.data.getAll.cancel();
      const prev = utils.goals.data.getAll.getData();
      utils.goals.data.getAll.setData(undefined, (old) => {
        if (!old) return old;
        return {
          ...old,
          goals: old.goals.map((g) => ({
            ...g,
            tasks: g.tasks.map((t) => (t.id === vars.id ? { ...t, scheduledAt: vars.scheduledAt } : t)),
          })),
        };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.goals.data.getAll.setData(undefined, ctx.prev);
      toast.error("Failed to move task");
    },
    onSettled: () => {
      void utils.goals.data.getAll.invalidate();
    },
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  // `now` captured once per mount; the page is rebuilt naturally if the user
  // leaves and returns. We don't need second-by-second precision here.
  const now = useMemo(() => new Date(), []);

  const { byColumn, flatById } = useMemo(() => {
    const byColumn: Record<ColumnId, FlatTask[]> = {
      backlog: [],
      past: [],
      month: [],
      quarter: [],
      year: [],
      later: [],
    };
    const flatById: Record<string, FlatTask> = {};
    for (const g of goals) {
      for (const t of g.tasks) {
        const flat: FlatTask = {
          id: t.id,
          title: t.title,
          difficulty: t.difficulty,
          completed: t.completed,
          scheduledAt: t.scheduledAt ? new Date(t.scheduledAt) : null,
          goalId: g.id,
          goalTitle: g.title,
          goalEmoji: g.emoji,
        };
        flatById[t.id] = flat;
        byColumn[bucketColumnId(flat, now)].push(flat);
      }
    }
    for (const col of Object.keys(byColumn) as ColumnId[]) {
      byColumn[col].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        // Earliest deadline first; nulls last.
        const ta = a.scheduledAt?.getTime() ?? Number.POSITIVE_INFINITY;
        const tb = b.scheduledAt?.getTime() ?? Number.POSITIVE_INFINITY;
        return ta - tb || a.title.localeCompare(b.title);
      });
    }
    return { byColumn, flatById };
  }, [goals, now]);

  const activeTask = activeId ? flatById[activeId] : null;

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    const taskId = String(e.active.id);
    const target = e.over.id as ColumnId;
    const task = flatById[taskId];
    if (!task) return;

    // Backlog → null. Bucket targets → end of that bucket. Past/Later
    // are read-only computed lanes (no drop target rendered for them).
    let nextScheduled: Date | null = null;
    if (target === "backlog") {
      nextScheduled = null;
    } else if (target === "month" || target === "quarter" || target === "year") {
      nextScheduled = endOfCurrentBucket(target, now);
    } else {
      // Past / Later — ignore drops here; not rendered as droppable.
      return;
    }

    // Skip identical placement.
    const currentColumn = bucketColumnId(task, now);
    if (currentColumn === target && (task.scheduledAt?.getTime() ?? null) === (nextScheduled?.getTime() ?? null)) {
      return;
    }

    setScheduledMutation.mutate({ id: taskId, scheduledAt: nextScheduled });
  };

  const handleToggleComplete = (t: FlatTask) => {
    void updateTask(t.goalId, t.id, { completed: !t.completed });
  };

  // Header counts — total open + scheduled across all buckets.
  const openCount = goals.reduce((sum, g) => sum + g.tasks.filter((t) => !t.completed).length, 0);
  const scheduledCount = goals.reduce((sum, g) => sum + g.tasks.filter((t) => t.scheduledAt).length, 0);

  // Column rendering — we always show the four primary columns. "Past" and
  // "Later" appear only when populated, as small flagged sections at the top
  // and bottom respectively. Keeps the default layout four columns wide.
  const monthLabel = labelForBucket("month", now);
  const quarterLabel = labelForBucket("quarter", now);
  const yearLabel = labelForBucket("year", now);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-6 pb-4 pt-8 md:px-8">
        <h2 className="text-2xl font-light">Horizons</h2>
        <p className="mt-1 max-w-3xl text-sm text-white/60">
          One date per task. The board buckets by how close that date is — drag a card to commit it for end of month,
          quarter, or year. Cards auto-promote to a tighter bucket as the deadline approaches.
        </p>
        {goals.length > 0 && (
          <div className="mt-3 flex gap-4 text-xs text-white/50">
            <span>
              <span className="text-white/80">{openCount}</span> open
            </span>
            <span>·</span>
            <span>
              <span className="text-white/80">{scheduledCount}</span> scheduled
            </span>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {/* Past — overdue, only when populated. Read-only placement; the
              user must reschedule via the card or open the goal to fix it. */}
          {byColumn.past.length > 0 && (
            <div className="px-6 pb-4 md:px-8">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <h3 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-amber-300">
                  <Clock className="h-3 w-3" />
                  Past due ({byColumn.past.filter((t) => !t.completed).length})
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {byColumn.past.map((t) => (
                    <DraggableCard
                      key={t.id}
                      task={t}
                      onClick={() => setOpenGoalId(t.goalId)}
                      onToggleComplete={() => handleToggleComplete(t)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 px-6 pb-8 sm:grid-cols-2 md:px-8 xl:grid-cols-4">
            <DroppableColumn
              columnId="backlog"
              title="Backlog"
              hint="No date yet. Drag right to commit."
              count={byColumn.backlog.filter((t) => !t.completed).length}
              tasks={byColumn.backlog}
              onCardClick={(t) => setOpenGoalId(t.goalId)}
              onToggleComplete={handleToggleComplete}
            />
            <DroppableColumn
              columnId="month"
              title={monthLabel}
              hint="Doing this month."
              count={byColumn.month.filter((t) => !t.completed).length}
              tasks={byColumn.month}
              onCardClick={(t) => setOpenGoalId(t.goalId)}
              onToggleComplete={handleToggleComplete}
            />
            <DroppableColumn
              columnId="quarter"
              title={quarterLabel}
              hint="Lined up this quarter."
              count={byColumn.quarter.filter((t) => !t.completed).length}
              tasks={byColumn.quarter}
              onCardClick={(t) => setOpenGoalId(t.goalId)}
              onToggleComplete={handleToggleComplete}
            />
            <DroppableColumn
              columnId="year"
              title={yearLabel}
              hint="Sometime this year."
              count={byColumn.year.filter((t) => !t.completed).length}
              tasks={byColumn.year}
              onCardClick={(t) => setOpenGoalId(t.goalId)}
              onToggleComplete={handleToggleComplete}
            />
          </div>

          {/* Later — beyond this year. Read-only; drag is not enabled for
              this lane (user can shift via DatePicker on the card). */}
          {byColumn.later.length > 0 && (
            <div className="px-6 pb-8 md:px-8">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <h3 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/50">
                  <Clock className="h-3 w-3" />
                  Later ({byColumn.later.filter((t) => !t.completed).length})
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {byColumn.later.map((t) => (
                    <DraggableCard
                      key={t.id}
                      task={t}
                      onClick={() => setOpenGoalId(t.goalId)}
                      onToggleComplete={() => handleToggleComplete(t)}
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

      {openGoalId && <GoalModal goalId={openGoalId} onClose={() => setOpenGoalId(null)} />}
    </div>
  );
}
