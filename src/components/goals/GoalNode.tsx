"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Target, CheckCircle, Pencil } from "lucide-react";
import { useGoals, type Goal } from "~/contexts/GoalsContext";

interface GoalNodeProps {
  data: Goal & { onEdit?: () => void };
  selected?: boolean;
}

const GoalNode = memo(({ data, selected }: GoalNodeProps) => {
  const { values, getGoalProgress, connections } = useGoals();
  const associatedValues = values.filter((v) => data.valueIds?.includes(v.id));

  // Get all progress data from single source
  const progress = getGoalProgress(data.id);
  const completion = progress.totalProgress;
  const ownCompletion = progress.ownProgress;
  const predecessorAverage = progress.dependenciesProgress;
  const hasPredecessors = connections.some((c) => c.target === data.id);

  // Calculate goal difficulty based on tasks
  const calculateDifficulty = () => {
    if (data.tasks.length === 0) return "easy";

    const totalDifficulty = data.tasks.reduce((sum, task) => sum + task.difficulty, 0);
    const averageDifficulty = totalDifficulty / data.tasks.length;

    if (averageDifficulty < 1.5) return "easy";
    if (averageDifficulty >= 1.5 && averageDifficulty < 2.5) return "medium";
    return "hard";
  };

  const difficulty = calculateDifficulty();

  // Get importance from stored data
  const importance = data.importance || "Low";

  // Difficulty display component
  const DifficultyInfo = () => (
    <div className="mt-1 flex items-center gap-2">
      <span className="w-8 text-[9px] text-white/40">Diff</span>
      <span className="text-[9px] capitalize text-white/60">{difficulty}</span>
    </div>
  );

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent node selection
    if (data.onEdit) {
      data.onEdit();
    }
  };

  const getCompletionColor = (percent: number) => {
    if (percent < 33) return "border-red-500 bg-red-500/10";
    if (percent < 67) return "border-yellow-500 bg-yellow-500/10";
    return "border-green-500 bg-green-500/10";
  };

  const getProgressBarColor = (percent: number) => {
    if (percent < 33) return "bg-red-500";
    if (percent < 67) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div
      className={`relative min-w-[200px] max-w-[300px] rounded-lg border-2 p-4 transition-all hover:shadow-lg ${getCompletionColor(completion)} ${
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
            <div className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
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
          {completion === 100 ? (
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

      {/* Tasks Summary */}
      <div className="mb-2 text-xs text-white/60">
        Tasks: {data.tasks.filter((t) => t.completed).length}/{data.tasks.length}
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

      {/* Completion Percentage */}
      <div className="mt-2 text-center text-xs font-semibold text-white">{Math.round(completion)}% Complete</div>
    </div>
  );
});

GoalNode.displayName = "GoalNode";

export default GoalNode;
