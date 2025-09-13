"use client";

import { useCallback, useMemo, useState } from "react";
import { Trophy, Target, TrendingUp } from "lucide-react";
import { useGoals } from "~/contexts/GoalsContext";
import GoalModal from "./GoalModal";

export default function LifeProgress() {
  const { goals, connections, values, getGoalProgress } = useGoals();
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Find terminal goals (goals with no outgoing connections)
  const terminalGoals = useMemo(() => {
    const goalsWithOutgoing = new Set(connections.map((c) => c.source));
    return goals.filter((goal) => !goalsWithOutgoing.has(goal.id));
  }, [goals, connections]);

  // Use the comprehensive progress for terminal goals
  const getFullPathCompletion = useCallback(
    (goalId: string): number => {
      // Simply use the total progress which already includes all predecessors
      return getGoalProgress(goalId).totalProgress;
    },
    [getGoalProgress],
  );

  // Sort terminal goals by progress (highest first)
  const sortedTerminalGoals = useMemo(() => {
    return [...terminalGoals].sort((a, b) => {
      const progressA = getFullPathCompletion(a.id);
      const progressB = getFullPathCompletion(b.id);
      return progressB - progressA;
    });
  }, [terminalGoals, getFullPathCompletion]);

  const getProgressColor = (percent: number) => {
    if (percent < 33) return "bg-red-500";
    if (percent < 67) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getProgressTextColor = (percent: number) => {
    if (percent < 33) return "text-red-400";
    if (percent < 67) return "text-yellow-400";
    return "text-green-400";
  };

  const handleGoalClick = (goalId: string) => {
    setSelectedGoalId(goalId);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedGoalId(null);
  };

  return (
    <div className="min-h-screen px-8 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <h2 className="flex items-center gap-2 text-2xl font-light">
            <Trophy className="h-6 w-6" />
            Life Progress
          </h2>
          <p className="mt-2 text-sm opacity-60">
            Your ultimate life goals and their cumulative progress from all connected objectives
          </p>
        </div>

        {terminalGoals.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/5 p-12 text-center">
            <Target className="mx-auto h-12 w-12 opacity-30" />
            <p className="mt-4 text-lg font-light">No terminal goals found</p>
            <p className="mt-2 text-sm opacity-60">Create goals and connect them to build your goal hierarchy</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Overall Progress */}
            <div className="rounded-lg border border-white/20 bg-white/5 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-lg font-light">
                  <TrendingUp className="h-5 w-5" />
                  Overall Life Progress
                </h3>
                <span className="text-2xl font-light">
                  {terminalGoals.length} Ultimate Goal{terminalGoals.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Calculate and show overall progress */}
              {(() => {
                const totalProgress =
                  terminalGoals.reduce((sum, goal) => sum + getFullPathCompletion(goal.id), 0) / terminalGoals.length;

                return (
                  <div>
                    <div className="mb-2 flex justify-between text-sm">
                      <span className="opacity-60">Combined Progress</span>
                      <span className={`font-semibold ${getProgressTextColor(totalProgress)}`}>
                        {Math.round(totalProgress)}%
                      </span>
                    </div>
                    <div className="relative h-4 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full transition-all duration-500 ${getProgressColor(totalProgress)}`}
                        style={{ width: `${totalProgress}%` }}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Terminal Goals Progress Bars */}
            <div className="space-y-4">
              <h3 className="text-lg font-light">Ultimate Life Goals</h3>

              <div className="space-y-3">
                {sortedTerminalGoals.map((goal) => {
                  const progressData = getGoalProgress(goal.id);
                  const progress = progressData.totalProgress;
                  const ownCompletion = progressData.ownProgress;
                  const predecessorProgress = progressData.dependenciesProgress;
                  const hasPredecessors = connections.some(c => c.target === goal.id);
                  const associatedValues = goal.valueIds ? values.filter((v) => goal.valueIds.includes(v.id)) : [];

                  return (
                    <div
                      key={goal.id}
                      className="cursor-pointer rounded-lg border border-white/10 bg-white/5 p-4 transition-all hover:border-white/20 hover:bg-white/10"
                      onClick={() => handleGoalClick(goal.id)}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-white">{goal.title}</h4>
                          {/* Value dots */}
                          {associatedValues.length > 0 && (
                            <div className="flex gap-1">
                              {associatedValues.map((value) => (
                                <div
                                  key={value.id}
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: value.color }}
                                  title={value.name}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        <div className={`text-2xl font-light ${getProgressTextColor(progress)}`}>
                          {Math.round(progress)}%
                        </div>
                      </div>

                      {/* Progress Bar */}
                      {hasPredecessors ? (
                        <div className="space-y-2">
                          {/* Stacked progress bar showing both components */}
                          <div className="relative h-4 overflow-hidden rounded-full bg-white/10">
                            <div className="absolute inset-0 flex">
                              {/* Own progress portion (40% weight) */}
                              <div 
                                className={`transition-all duration-500 ${getProgressColor(ownCompletion)} opacity-80`}
                                style={{ width: `${ownCompletion * 0.4}%` }}
                              />
                              {/* Predecessor progress portion (60% weight) */}
                              <div 
                                className={`transition-all duration-500 ${getProgressColor(predecessorProgress)} opacity-60`}
                                style={{ width: `${predecessorProgress * 0.6}%` }}
                              />
                            </div>
                          </div>
                          {/* Legend */}
                          <div className="flex justify-between text-[10px] text-white/50">
                            <span>Own: {Math.round(ownCompletion)}%</span>
                            <span>Dependencies: {Math.round(predecessorProgress)}%</span>
                          </div>
                        </div>
                      ) : (
                        /* Simple bar for goals without predecessors */
                        <div className="relative h-4 overflow-hidden rounded-full bg-white/10">
                          <div
                            className={`h-full transition-all duration-500 ${getProgressColor(progress)}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Goal Modal */}
      {isModalOpen && <GoalModal goalId={selectedGoalId} onClose={handleModalClose} />}
    </div>
  );
}
