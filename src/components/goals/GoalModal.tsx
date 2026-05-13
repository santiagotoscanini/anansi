"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { X, Square, CheckSquare, Plus } from "lucide-react";
import { useGoals } from "~/contexts/GoalsContext";
import type { Task } from "~/lib/api/types";
import { formatScheduledShort } from "~/lib/horizon-period";
import toast from "react-hot-toast";
import ValueSelectionModal from "./ValueSelectionModal";
import EmojiPicker, { type EmojiClickData, Theme } from "emoji-picker-react";
import { getRandomEmoji, isEmojiUrl } from "~/lib/emoji-utils";
import { api } from "~/trpc/react";
import Avatar from "./Avatar";
import TaskModal from "./TaskModal";

interface GoalModalProps {
  goalId: string | null;
  onClose: () => void;
}

export default function GoalModal({ goalId, onClose }: GoalModalProps) {
  const { goals, values, addGoal, updateGoal, deleteGoal, updateTask, getGoalCompletion } = useGoals();

  // Read-only count for the tracking-items hint at the bottom of the modal.
  // The sidebar TrackingItemsLibrary is the canonical surface for CRUD; the
  // modal used to embed a duplicate add/edit list, which created two ways to
  // do the same thing and ~150 LOC of state. H2 dropped that — we just show
  // a count + a pointer.
  const trackingItemsCountQuery = api.goals.trackingItems.list.useQuery(
    { goalId: goalId ?? undefined },
    { enabled: !!goalId },
  );
  const trackingItemCount = trackingItemsCountQuery.data?.length ?? 0;

  const existingGoal = goalId ? goals.find((g) => g.id === goalId) : null;

  const [title, setTitle] = useState(existingGoal?.title ?? "");
  const [description, setDescription] = useState(existingGoal?.description ?? "");
  const [emoji, setEmoji] = useState(existingGoal?.emoji ?? getRandomEmoji());
  const [customEmojiUrl, setCustomEmojiUrl] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [valueIds, setValueIds] = useState<string[]>(existingGoal?.valueIds ?? []);
  // All task editing/creation routes through TaskModal. The row stays
  // interactive only for the complete checkbox; everything else opens the
  // modal so there's a single way to do each thing. New goals must save
  // first before tasks can be added (same constraint as tracking items).
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);

  // People + groups directories — used to render the read-only avatar/dot
  // summaries on task rows. The actual picker lives in TaskModal.
  const peopleData = api.goals.people.getAll.useQuery({ includeArchived: false }).data;
  const peopleById = useMemo(() => {
    const map = new Map<string, NonNullable<typeof peopleData>[number]>();
    for (const p of peopleData ?? []) map.set(p.id, p);
    return map;
  }, [peopleData]);

  const groupsData = api.goals.groups.getAll.useQuery().data;
  const groupsById = useMemo(() => {
    const map = new Map<string, NonNullable<typeof groupsData>[number]>();
    for (const g of groupsData ?? []) map.set(g.id, g);
    return map;
  }, [groupsData]);

  // Value selection modal state
  const [showValueModal, setShowValueModal] = useState(false);

  const completion = goalId ? getGoalCompletion(goalId) : 0;

  const handleSave = () => {
    if (!title.trim()) {
      toast.error("Goal title is required");
      return;
    }

    if (goalId) {
      // For existing goals, don't update tasks here (they're managed separately)
      void updateGoal(goalId, {
        title,
        description,
        emoji,
        valueIds,
      });
      toast.success("Goal updated successfully");
    } else {
      // New goals start with no tasks — they can be added once saved.
      void addGoal({
        title,
        description,
        emoji,
        valueIds,
        tasks: [],
        position: { x: 250, y: 250 },
      });
      toast.success("Goal created successfully");
    }

    onClose();
  };

  const handleDelete = () => {
    if (goalId) {
      void deleteGoal(goalId);
      toast.success("Goal deleted successfully");
      onClose();
    }
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setEmoji(emojiData.emoji);
    setShowEmojiPicker(false);
    setCustomEmojiUrl(""); // Clear custom URL when selecting native emoji
  };

  const handleCustomEmojiUrl = () => {
    if (customEmojiUrl.trim()) {
      setEmoji(customEmojiUrl.trim());
      setCustomEmojiUrl("");
      toast.success("Custom emoji set");
    }
  };

  // Routes to the dedicated TaskModal — only valid once the goal exists.
  const openTaskEditor = (task: Task) => {
    if (!goalId) return;
    setOpenTaskId(task.id);
  };

  // For existing goals, tasks come from the live cache. New goals start
  // empty — tasks can only be added after the goal is saved.
  const displayTasks: Task[] = goalId ? (goals.find((g) => g.id === goalId)?.tasks ?? []) : [];

  const handleToggleTask = (taskId: string) => {
    if (!goalId) return;
    const task = displayTasks.find((t) => t.id === taskId);
    if (task) {
      void updateTask(goalId, taskId, { completed: !task.completed });
    }
  };

  const getDifficultyLabel = (difficulty: number) => {
    switch (difficulty) {
      case 1:
        return "Easy";
      case 2:
        return "Medium";
      case 3:
        return "Hard";
      default:
        return "Medium";
    }
  };

  const getDifficultyColor = (difficulty: number) => {
    switch (difficulty) {
      case 1:
        return "text-[var(--moss)]";
      case 2:
        return "text-[var(--amber)]";
      case 3:
        return "text-[var(--rust)]";
      default:
        return "text-[var(--amber)]";
    }
  };

  return (
    <div
      className="bg-[var(--ink)]/80 fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={showValueModal ? undefined : onClose} // Close when clicking the backdrop, unless value modal is open
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] shadow-2xl backdrop-blur"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the modal
      >
        {/* Header — sticky so title + close stay reachable while scrolling */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--hairline)] bg-[var(--canvas)] px-6 py-4 backdrop-blur">
          <h2 className="text-lg font-medium tracking-tight">{goalId ? "Edit Goal" : "Create Goal"}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--ink-3)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 pb-6 pt-5">
          {/* Goal Details */}
          <div className="space-y-5">
            {/* Title with Emoji */}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]">
                Title
              </label>
              <div className="relative flex gap-2">
                {/* Emoji Button */}
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--hairline-2)] bg-[var(--vellum)] transition-all hover:border-[var(--hairline-2)] hover:bg-[var(--vellum)]"
                  title="Click to choose emoji"
                >
                  {isEmojiUrl(emoji) ? (
                    <Image
                      src={emoji}
                      alt="emoji"
                      width={24}
                      height={24}
                      unoptimized
                      className="h-6 w-6 object-contain"
                    />
                  ) : (
                    <span className="text-2xl leading-none">{emoji}</span>
                  )}
                </button>

                {/* Title Input */}
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter goal title..."
                  className="h-10 flex-1 rounded-lg border border-[var(--hairline-2)] bg-[var(--vellum)] px-4 text-[var(--ink)] outline-none transition-all focus:border-[var(--hairline-2)]"
                  autoFocus
                />

                {/* Emoji Picker Dropdown */}
                {showEmojiPicker && (
                  <div className="absolute left-0 top-full z-50 mt-2 rounded-lg border border-[var(--hairline-2)] bg-[var(--paper)] p-2 shadow-xl">
                    <EmojiPicker
                      onEmojiClick={handleEmojiClick}
                      width={350}
                      height={400}
                      theme={Theme.DARK}
                      searchPlaceHolder="Search emoji..."
                    />

                    {/* Custom Emoji URL Section */}
                    <div className="mt-3 space-y-2 border-t border-[var(--hairline)] pt-3">
                      <label className="text-xs text-[var(--ink-2)]">Custom emoji URL:</label>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={customEmojiUrl}
                          onChange={(e) => setCustomEmojiUrl(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") handleCustomEmojiUrl();
                          }}
                          placeholder="https://..."
                          className="flex-1 rounded border border-[var(--hairline-2)] bg-[var(--vellum)] px-3 py-1.5 text-sm text-[var(--ink)] outline-none transition-all placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)]"
                        />
                        <button
                          type="button"
                          onClick={handleCustomEmojiUrl}
                          className="rounded border border-[var(--hairline-2)] bg-[var(--vellum)] px-3 py-1.5 text-sm text-[var(--ink)] transition-all hover:bg-[var(--vellum)]"
                        >
                          Set
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter goal description..."
                rows={3}
                className="w-full resize-none rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-4 py-2.5 text-sm text-[var(--ink)] outline-none transition-all placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)] focus:bg-[var(--vellum)]"
              />
            </div>

            {/* Value Selection */}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]">
                Values
              </label>

              {/* Selected Values Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                {valueIds.map((valueId) => {
                  const value = values.find((v) => v.id === valueId);
                  if (!value) return null;
                  return (
                    <span
                      key={value.id}
                      className="inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-xs font-medium text-[var(--ink)]"
                      style={{ backgroundColor: value.color }}
                    >
                      {value.name}
                      <button
                        onClick={() => setValueIds(valueIds.filter((id) => id !== valueId))}
                        className="flex items-center justify-center rounded-full p-0.5 text-[var(--ink-2)] transition-all hover:bg-[var(--paper-deep)] hover:text-[var(--ink)]"
                        aria-label={`Remove ${value.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
                {valueIds.length < values.length && (
                  <button
                    onClick={() => setShowValueModal(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--hairline)] px-2.5 py-0.5 text-xs text-[var(--ink-3)] transition-all hover:border-[var(--hairline-2)] hover:text-[var(--ink)]"
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </button>
                )}
              </div>

              {values.length === 0 && <p className="mt-1 text-xs text-[var(--ink-4)]">No values created yet</p>}
            </div>

            {/* Tasks Section */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <label className="text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]">Tasks</label>
                {goalId && <span className="text-xs text-[var(--ink-3)]">{Math.round(completion)}%</span>}
              </div>

              {/* Add task — opens the dedicated TaskModal in create mode.
                  Disabled before the goal is saved (no goalId to attach to);
                  same constraint as tracking items. */}
              <button
                type="button"
                onClick={() => goalId && setCreatingTask(true)}
                disabled={!goalId}
                title={goalId ? "Add a task" : "Save the goal first to add tasks"}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--hairline)] bg-transparent px-4 py-2 text-sm text-[var(--ink-2)] transition-all hover:border-[var(--hairline-2)] hover:bg-[var(--vellum)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--hairline)] disabled:hover:bg-transparent disabled:hover:text-[var(--ink-2)]"
              >
                <Plus className="h-3.5 w-3.5" />
                Add task
              </button>

              {/* Tasks List — click any row to open the editor; only the
                  checkbox is interactive in place. Other badges are visual
                  summary only, deliberately not interactive — set them via
                  the modal so there's a single way to do each thing. */}
              <div className="space-y-1.5">
                {displayTasks.map((task) => {
                  const referents = (task.referentIds ?? [])
                    .map((id) => peopleById.get(id))
                    .filter((p): p is NonNullable<typeof p> => !!p);
                  const taskGroups = (task.groupIds ?? [])
                    .map((id) => groupsById.get(id))
                    .filter((g): g is NonNullable<typeof g> => !!g);
                  return (
                    <div
                      key={task.id}
                      onClick={() => openTaskEditor(task)}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-3 py-2 transition-colors hover:border-[var(--hairline)] hover:bg-[var(--vellum)]"
                    >
                      {/* Only interactive control on the row — toggles complete in place.
                          stopPropagation so it doesn't open the modal. */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleTask(task.id);
                        }}
                        className="transition-all hover:scale-110"
                        aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
                      >
                        {task.completed ? (
                          <CheckSquare className="h-4 w-4 text-[var(--moss)]" />
                        ) : (
                          <Square className="h-4 w-4 text-[var(--ink-4)]" />
                        )}
                      </button>
                      {task.emoji ? (
                        isEmojiUrl(task.emoji) ? (
                          <Image
                            src={task.emoji}
                            alt=""
                            width={16}
                            unoptimized
                            height={16}
                            className="h-4 w-4 shrink-0 object-contain"
                          />
                        ) : (
                          <span className="shrink-0 text-base leading-none">{task.emoji}</span>
                        )
                      ) : null}
                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${
                          task.completed ? "text-[var(--ink-3)] line-through" : "text-[var(--ink)]"
                        }`}
                      >
                        {task.title}
                      </span>

                      {/* Visual-only summary badges */}
                      <span
                        className={`shrink-0 text-[10px] font-medium uppercase tracking-wide ${getDifficultyColor(task.difficulty)}`}
                      >
                        {getDifficultyLabel(task.difficulty)}
                      </span>
                      {task.scheduledAt && (
                        <span className="shrink-0 text-[11px] text-[var(--ink-3)]">
                          {formatScheduledShort(new Date(task.scheduledAt))}
                        </span>
                      )}
                      {referents.length > 0 && (
                        <div className="hidden shrink-0 items-center sm:flex">
                          {referents.slice(0, 3).map((p, i) => (
                            <div
                              key={p.id}
                              style={{ marginLeft: i === 0 ? 0 : -6, zIndex: referents.length - i }}
                              className="relative"
                            >
                              <Avatar
                                name={p.name}
                                emoji={p.emoji}
                                size="xs"
                                shape="circle"
                                className="ring-2 ring-[var(--ink-3)]"
                              />
                            </div>
                          ))}
                          {referents.length > 3 && (
                            <span className="-ml-1.5 rounded-full border border-[var(--hairline)] bg-[var(--vellum)] px-1 text-[9px] text-[var(--ink-2)]">
                              +{referents.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                      {taskGroups.length > 0 && (
                        <div className="hidden shrink-0 items-center gap-0.5 sm:flex">
                          {taskGroups.slice(0, 4).map((g) => (
                            <span
                              key={g.id}
                              title={g.name}
                              className="h-2 w-2 rounded-full ring-1 ring-[var(--ink-3)]"
                              style={{ backgroundColor: g.color }}
                            />
                          ))}
                          {taskGroups.length > 4 && (
                            <span className="ml-0.5 text-[9px] text-[var(--ink-2)]">+{taskGroups.length - 4}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {displayTasks.length === 0 && (
                  <div className="rounded-lg border border-dashed border-[var(--hairline)] bg-transparent p-4 text-center text-xs text-[var(--ink-4)]">
                    {goalId ? "No tasks yet — click Add task." : "Save the goal first to add tasks."}
                  </div>
                )}
              </div>
            </div>

            {/* Tracking-items pointer. The full CRUD lives in the
                "Tracking Items" sidebar tab (TrackingItemsLibrary). The modal
                used to embed a duplicate list here, but two surfaces meant
                two sources of truth — H2 dropped the inline editor and kept
                a small count so the user knows tracking exists. */}
            {goalId && (
              <div className="rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]">
                      Tracking items
                    </p>
                    <p className="mt-1 text-xs text-[var(--ink-3)]">
                      {trackingItemCount === 0
                        ? "Nothing tracked yet — add metrics from the Tracking Items tab."
                        : `${trackingItemCount} tracked. Manage them in the Tracking Items tab.`}
                    </p>
                  </div>
                  <span className="rounded-full bg-[var(--vellum)] px-2 py-0.5 text-[11px] tabular-nums text-[var(--ink-2)]">
                    {trackingItemCount}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="sticky bottom-0 -mx-6 mt-6 flex items-center justify-between gap-3 border-t border-[var(--hairline)] bg-[var(--canvas)] px-6 py-4 backdrop-blur">
            {goalId ? (
              <button
                onClick={handleDelete}
                className="rounded-lg px-3 py-2 text-sm text-[var(--ink-3)] transition-all hover:bg-[var(--rust-soft)] hover:text-[var(--rust)]"
              >
                Delete goal
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-[var(--ink-2)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="rounded-lg bg-[var(--paper)] px-4 py-2 text-sm font-medium text-black transition-all hover:bg-[var(--paper)]"
              >
                {goalId ? "Save changes" : "Create goal"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Value Selection Modal */}
      {showValueModal && (
        <ValueSelectionModal
          availableValues={values}
          selectedValueIds={valueIds}
          onConfirm={(selectedIds) => setValueIds(selectedIds)}
          onClose={() => setShowValueModal(false)}
        />
      )}

      {/* Task editor — opened from the row title or the edit affordance.
          key={openTaskId} forces a remount when the user opens a different
          task while the modal is up, resetting useState initializers. */}
      {goalId && openTaskId && (
        <TaskModal key={openTaskId} goalId={goalId} taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
      )}

      {/* Task creator — opened from the "Add task" button. Same modal, no taskId. */}
      {goalId && creatingTask && <TaskModal goalId={goalId} taskId={null} onClose={() => setCreatingTask(false)} />}
    </div>
  );
}
