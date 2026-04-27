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
          return "bg-green-500";
        case "medium":
          return "bg-yellow-500";
        case "hard":
          return "bg-red-500";
        default:
          return "bg-gray-500";
      }
    };

    // Calculate bar width based on difficulty average (1-3 scale, convert to percentage)
    const barWidth = Math.min(100, Math.max(0, (difficulty.average / 3) * 100));

    return (
      <div className="mt-1 flex items-center gap-2">
        <span className="w-8 text-[9px] text-white/40">Diff</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className={`h-full ${getDifficultyColor()} transition-all`} style={{ width: `${barWidth}%` }} />
        </div>
        <span className="w-8 text-right text-[9px] text-white/60">{difficulty.average.toFixed(1)}</span>
      </div>
    );
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent node selection
    if (data.onEdit) {
      data.onEdit();
    }
  };

  // Get importance-based colors
  const getImportanceColor = () => {
    switch (importance) {
      case "High":
        return "border-red-500 bg-red-500/10";
      case "Medium":
        return "border-yellow-500 bg-yellow-500/10";
      case "Low":
        return "border-gray-500 bg-gray-500/10";
      default:
        return "border-gray-500 bg-gray-500/10";
    }
  };

  const getProgressBarColor = (percent: number) => {
    if (percent < 33) return "bg-red-500";
    if (percent < 67) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div
      className={`relative min-w-[200px] max-w-[300px] rounded-lg border-2 p-4 transition-all hover:shadow-lg ${getImportanceColor()} ${
        selected ? "ring-2 ring-white ring-offset-2 ring-offset-black" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} id="left" className="!bg-white/50" style={{ top: "50%" }} />
      <Handle type="source" position={Position.Right} id="right" className="!bg-white/50" style={{ top: "50%" }} />

      {/* Value Dots at the top - Expand on hover */}
      {associatedValues.length > 0 && (
        <div className="group absolute -top-3 left-4 right-4 flex justify-center">
          <div className="relative flex gap-1.5 rounded-full bg-black/80 px-2 py-1">
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
              <div className="flex flex-wrap gap-1 rounded-lg bg-black/90 p-2 shadow-lg">
                {associatedValues.map((value) => (
                  <span
                    key={value.id}
                    className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                    style={{ backgroundColor: value.color }}
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
            <CheckCircle className="h-5 w-5 text-green-500" />
          ) : (
            <Target className="h-5 w-5 text-white/60" />
          )}
          <span className="text-xs text-white/60">Importance: {importance}</span>
        </div>
        <button
          onClick={handleEditClick}
          className="rounded p-1 opacity-60 transition-opacity hover:bg-white/10 hover:opacity-100"
          title="Edit goal"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Title */}
      <h3 className="mb-2 font-semibold text-white">{data.title}</h3>

      {/* Description */}
      {data.description && <p className="mb-3 line-clamp-2 text-xs text-white/70">{data.description}</p>}

      {/* Tasks Summary — total count + per-bucket pills computed from
          each task's scheduledAt date. Pills hide when nothing is scheduled. */}
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-white/60">
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
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-emerald-300">
                  {m}M
                </span>
              )}
              {q > 0 && (
                <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-sky-300">
                  {q}Q
                </span>
              )}
              {y > 0 && (
                <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-violet-300">
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
              <span className="w-8 text-[9px] text-white/40">Own</span>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full transition-all ${getProgressBarColor(ownCompletion)}`}
                  style={{ width: `${ownCompletion}%` }}
                />
              </div>
              <span className="w-8 text-right text-[9px] text-white/60">{Math.round(ownCompletion)}%</span>
            </div>
            {/* Dependencies progress */}
            <div className="flex items-center gap-2">
              <span className="w-8 text-[9px] text-white/40">Deps</span>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full opacity-70 transition-all ${getProgressBarColor(predecessorAverage)}`}
                  style={{ width: `${Math.min(100, Math.max(0, predecessorAverage))}%` }}
                />
              </div>
              <span className="w-8 text-right text-[9px] text-white/60">{Math.round(predecessorAverage)}%</span>
            </div>
            <DifficultyInfo />
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {/* Simple progress bar for goals without predecessors */}
          <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
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
                <Avatar name={p.name} emoji={p.emoji} size="xs" shape="circle" className="ring-2 ring-black" />
              </div>
            ))}
            {referentPeople.length > 5 && (
              <span className="-ml-1.5 rounded-full border border-white/10 bg-white/10 px-1 text-[9px] text-white/70 ring-2 ring-black">
                +{referentPeople.length - 5}
              </span>
            )}
          </div>

          {/* Expanded names tooltip on hover */}
          <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 opacity-100 transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100">
            <div className="flex flex-wrap justify-center gap-1 rounded-lg bg-black/95 p-2 shadow-lg ring-1 ring-white/10">
              {referentPeople.map((p) => (
                <span
                  key={p.id}
                  className="flex items-center gap-1 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/90"
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
      <div className="mt-2 text-center text-xs font-semibold text-white">{Math.round(completion)}% Complete</div>
    </div>
  );
});

GoalNode.displayName = "GoalNode";

export default GoalNode;
