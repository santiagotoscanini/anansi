"use client";

import { memo, useMemo } from "react";
import Image from "next/image";
import { Handle, Position } from "@xyflow/react";
import { Target, CheckCircle, Pencil } from "lucide-react";
import { useGoals } from "~/contexts/GoalsContext";
import type { Goal } from "~/lib/api/types";
import { isEmojiUrl } from "~/lib/emoji-utils";
import { bucketForDate } from "~/lib/horizon-period";
import { api } from "~/trpc/react";
import Avatar from "./Avatar";

interface GoalNodeProps {
  data: Goal & { onEdit?: () => void };
  selected?: boolean;
}

const GoalNode = memo(({ data, selected }: GoalNodeProps) => {
  const { values, getGoalProgress, connections } = useGoals();
  const associatedValues = values.filter((v) => data.valueIds?.includes(v.id));

  // Collect unique referent people across all tasks on this goal. Shown as a
  // stacked avatar cluster at the bottom of the node — mirrors the values
  // hover pattern at the top.
  const peopleQuery = api.goals.people.getAll.useQuery({ includeArchived: false });
  const referentPeople = useMemo(() => {
    const ids = new Set<string>();
    for (const t of data.tasks) for (const id of t.referentIds ?? []) ids.add(id);
    if (ids.size === 0) return [];
    const byId = new Map((peopleQuery.data ?? []).map((p) => [p.id, p]));
    return Array.from(ids)
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p);
  }, [data.tasks, peopleQuery.data]);

  // Get all progress data from single source
  const progress = getGoalProgress(data.id);
  const completion = progress.totalProgress;
  const ownCompletion = progress.ownProgress;
  const predecessorAverage = progress.dependenciesProgress;
  const hasPredecessors = connections.some((c) => c.target === data.id);

  // Calculate goal difficulty based on tasks
  const calculateDifficulty = () => {
    if (data.tasks.length === 0) return { level: "easy", average: 1 };

    const totalDifficulty = data.tasks.reduce((sum, task) => sum + task.difficulty, 0);
    const averageDifficulty = totalDifficulty / data.tasks.length;

    let level: "easy" | "medium" | "hard";
    if (averageDifficulty < 1.5) level = "easy";
    else if (averageDifficulty >= 1.5 && averageDifficulty < 2.5) level = "medium";
    else level = "hard";

    return { level, average: averageDifficulty };
  };

  const difficulty = calculateDifficulty();

  // Get importance from stored data
  const importance = data.importance || "Low";

  // Difficulty display component with colored bar
  const DifficultyInfo = () => {
    const getDifficultyColor = () => {
      switch (difficulty.level) {
        case "easy":
          return "bg-[var(--moss)]";
        case "medium":
          return "bg-[var(--amber)]";
        case "hard":
          return "bg-[var(--rust)]";
        default:
          return "bg-[var(--ink-3)]";
      }
    };

    // Calculate bar width based on difficulty average (1-3 scale, convert to percentage)
    const barWidth = Math.min(100, Math.max(0, (difficulty.average / 3) * 100));

    return (
      <div className="mt-1 flex items-center gap-2">
        <span className="w-8 text-[9px] text-[var(--ink-3)]">Diff</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--vellum)]">
          <div className={`h-full ${getDifficultyColor()} transition-all`} style={{ width: `${barWidth}%` }} />
        </div>
        <span className="w-8 text-right text-[9px] text-[var(--ink-2)]">{difficulty.average.toFixed(1)}</span>
      </div>
    );
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent node selection
    if (data.onEdit) {
      data.onEdit();
    }
  };

  // Importance now lives on a thin top-stripe color, not the whole
  // border. Matches the design's slim GoalNode chrome (top-pill + warm
  // canvas + hairline border) — keeps the canvas reading as paper, not
  // a heat-map.
  const importanceColor = (() => {
    switch (importance) {
      case "High":
        return "var(--rust)";
      case "Medium":
        return "var(--amber)";
      case "Low":
      default:
        return "var(--ink-4)";
    }
  })();

  const getProgressBarColor = (percent: number) => {
    if (percent < 33) return "bg-[var(--rust)]";
    if (percent < 67) return "bg-[var(--amber)]";
    return "bg-[var(--moss)]";
  };

  return (
    <div
      className="relative min-w-[220px] max-w-[300px] rounded-[14px] p-4 transition-all"
      style={{
        background: "var(--canvas)",
        border: "1px solid var(--hairline)",
        boxShadow: selected ? "var(--shadow-pop)" : "var(--shadow-md)",
        outline: selected ? "2px solid var(--clay)" : "none",
        outlineOffset: 2,
      }}
    >
      {/* Top stripe — the only importance signal on the card */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 14,
          right: 14,
          height: 3,
          background: importanceColor,
          borderRadius: "0 0 999px 999px",
        }}
      />
      <Handle type="target" position={Position.Left} id="left" className="!bg-[var(--vellum)]" style={{ top: "50%" }} />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!bg-[var(--vellum)]"
        style={{ top: "50%" }}
      />

      {/* Value Dots at the top - Expand on hover */}
      {associatedValues.length > 0 && (
        <div className="group absolute -top-3 left-4 right-4 flex justify-center">
          <div
            className="relative flex gap-1.5 rounded-full px-2 py-1"
            style={{
              background: "var(--canvas)",
              border: "1px solid var(--hairline)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            {/* Color dots */}
            {associatedValues.map((value) => (
              <div
                key={value.id}
                className="h-2 w-2 rounded-full ring-1 ring-white/20"
                style={{ backgroundColor: value.color }}
              />
            ))}

            {/* Expanded names tooltip on hover */}
            <div className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 opacity-100 transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100">
              <div
                className="flex flex-wrap gap-1 rounded-lg p-2"
                style={{
                  background: "var(--canvas)",
                  border: "1px solid var(--hairline)",
                  boxShadow: "var(--shadow-md)",
                }}
              >
                {associatedValues.map((value) => (
                  <span
                    key={value.id}
                    className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: value.color,
                      color: "var(--paper)",
                    }}
                  >
                    {value.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Goal Icon, Importance and Edit Button */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Emoji Display */}
          {data.emoji ? (
            isEmojiUrl(data.emoji) ? (
              <Image
                src={data.emoji}
                alt="emoji"
                width={20}
                height={20}
                unoptimized
                className="h-5 w-5 object-contain"
              />
            ) : (
              <span className="text-xl leading-none">{data.emoji}</span>
            )
          ) : completion === 100 ? (
            <CheckCircle className="h-5 w-5 text-[var(--moss)]" />
          ) : (
            <Target className="h-5 w-5 text-[var(--ink-2)]" />
          )}
          <span className="text-xs text-[var(--ink-2)]">Importance: {importance}</span>
        </div>
        <button
          onClick={handleEditClick}
          className="rounded p-1 opacity-60 transition-opacity hover:bg-[var(--vellum)] hover:opacity-100"
          title="Edit goal"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Title */}
      <h3 className="mb-2 font-semibold text-[var(--ink)]">{data.title}</h3>

      {/* Description */}
      {data.description && <p className="mb-3 line-clamp-2 text-xs text-[var(--ink-2)]">{data.description}</p>}

      {/* Tasks Summary — total count + per-bucket pills computed from
          each task's scheduledAt date. Pills hide when nothing is scheduled. */}
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-[var(--ink-2)]">
        <span>
          Tasks: {data.tasks.filter((t) => t.completed).length}/{data.tasks.length}
        </span>
        {(() => {
          const now = new Date();
          let m = 0;
          let q = 0;
          let y = 0;
          for (const t of data.tasks) {
            if (t.completed || !t.scheduledAt) continue;
            const b = bucketForDate(new Date(t.scheduledAt), now);
            if (b === "month") m += 1;
            else if (b === "quarter") q += 1;
            else if (b === "year") y += 1;
          }
          if (m + q + y === 0) return null;
          return (
            <span
              className="flex shrink-0 items-center gap-1"
              title={`Open by bucket — This month: ${m}, This quarter: ${q}, This year: ${y}`}
            >
              {m > 0 && (
                <span className="rounded-full border border-[var(--moss)] bg-[var(--moss-soft)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--moss)]">
                  {m}M
                </span>
              )}
              {q > 0 && (
                <span className="rounded-full border border-[var(--indigo)] bg-[var(--indigo-soft)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--indigo)]">
                  {q}Q
                </span>
              )}
              {y > 0 && (
                <span className="rounded-full border border-[var(--plum)] bg-[var(--plum-soft)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--plum)]">
                  {y}Y
                </span>
              )}
            </span>
          );
        })()}
      </div>

      {/* Progress Bar */}
      {hasPredecessors ? (
        <div className="space-y-1">
          {/* Dual progress bars */}
          <div className="space-y-1">
            {/* Own progress */}
            <div className="flex items-center gap-2">
              <span className="w-8 text-[9px] text-[var(--ink-3)]">Own</span>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--vellum)]">
                <div
                  className={`h-full transition-all ${getProgressBarColor(ownCompletion)}`}
                  style={{ width: `${ownCompletion}%` }}
                />
              </div>
              <span className="w-8 text-right text-[9px] text-[var(--ink-2)]">{Math.round(ownCompletion)}%</span>
            </div>
            {/* Dependencies progress */}
            <div className="flex items-center gap-2">
              <span className="w-8 text-[9px] text-[var(--ink-3)]">Deps</span>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--vellum)]">
                <div
                  className={`h-full opacity-70 transition-all ${getProgressBarColor(predecessorAverage)}`}
                  style={{ width: `${Math.min(100, Math.max(0, predecessorAverage))}%` }}
                />
              </div>
              <span className="w-8 text-right text-[9px] text-[var(--ink-2)]">{Math.round(predecessorAverage)}%</span>
            </div>
            <DifficultyInfo />
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {/* Simple progress bar for goals without predecessors */}
          <div className="relative h-2 overflow-hidden rounded-full bg-[var(--vellum)]">
            <div
              className={`h-full transition-all ${getProgressBarColor(completion)}`}
              style={{ width: `${completion}%` }}
            />
          </div>
          <DifficultyInfo />
        </div>
      )}

      {/* Referent people — inline row above the completion percentage. Circular
          avatars, deterministic colors, overlapping. Hover reveals names. */}
      {referentPeople.length > 0 && (
        <div className="group relative mt-2 flex items-center justify-center">
          <div className="flex items-center">
            {referentPeople.slice(0, 5).map((p, i) => (
              <div
                key={p.id}
                className="relative"
                style={{ marginLeft: i === 0 ? 0 : -6, zIndex: referentPeople.length - i }}
              >
                <Avatar
                  name={p.name}
                  emoji={p.emoji}
                  size="xs"
                  shape="circle"
                  className="ring-2 ring-[var(--canvas)]"
                />
              </div>
            ))}
            {referentPeople.length > 5 && (
              <span className="-ml-1.5 rounded-full border border-[var(--hairline)] bg-[var(--vellum)] px-1 text-[9px] text-[var(--ink-2)] ring-2 ring-[var(--canvas)]">
                +{referentPeople.length - 5}
              </span>
            )}
          </div>

          {/* Expanded names tooltip on hover */}
          <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 opacity-100 transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100">
            <div
              className="flex flex-wrap justify-center gap-1 rounded-lg p-2"
              style={{
                background: "var(--canvas)",
                border: "1px solid var(--hairline)",
                boxShadow: "var(--shadow-md)",
              }}
            >
              {referentPeople.map((p) => (
                <span
                  key={p.id}
                  className="flex items-center gap-1 whitespace-nowrap rounded-full border border-[var(--hairline)] bg-[var(--vellum)] px-2 py-0.5 text-[10px] text-[var(--ink)]"
                >
                  <Avatar name={p.name} emoji={p.emoji} size="xs" shape="circle" />
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Completion Percentage */}
      <div className="mt-2 text-center text-xs font-semibold text-[var(--ink)]">{Math.round(completion)}% Complete</div>
    </div>
  );
});

GoalNode.displayName = "GoalNode";

export default GoalNode;
