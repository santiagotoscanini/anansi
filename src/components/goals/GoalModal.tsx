"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { X, Trash2, Square, CheckSquare, Check, Edit2, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { useGoals, type Task, type TrackingItem } from "~/contexts/GoalsContext";
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
  const {
    goals,
    values,
    addGoal,
    updateGoal,
    deleteGoal,
    updateTask,
    getGoalCompletion,
    getTrackingItems,
    addTrackingItem,
    updateTrackingItem,
    deleteTrackingItem,
  } = useGoals();

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

  // Tracking items state
  const [trackingItems, setTrackingItems] = useState<TrackingItem[]>([]);
  const [newTrackingTitle, setNewTrackingTitle] = useState("");
  const [newTrackingDescription, setNewTrackingDescription] = useState("");
  const [editingTrackingId, setEditingTrackingId] = useState<string | null>(null);
  const [editTrackingTitle, setEditTrackingTitle] = useState("");
  const [editTrackingDescription, setEditTrackingDescription] = useState("");
  const [trackingCollapsed, setTrackingCollapsed] = useState(true);

  // Value selection modal state
  const [showValueModal, setShowValueModal] = useState(false);

  const completion = goalId ? getGoalCompletion(goalId) : 0;

  // Load tracking items for existing goal
  useEffect(() => {
    if (goalId) {
      void getTrackingItems(goalId).then(setTrackingItems);
    }
  }, [goalId, getTrackingItems]);

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
        return "text-green-500";
      case 2:
        return "text-yellow-500";
      case 3:
        return "text-red-500";
      default:
        return "text-yellow-500";
    }
  };

  // Tracking item handlers
  const handleAddTrackingItem = async () => {
    if (!newTrackingTitle.trim()) {
      toast.error("Tracking item title is required");
      return;
    }

    if (!goalId) {
      toast.error("Cannot add tracking items to unsaved goals");
      return;
    }

    try {
      await addTrackingItem({
        goalId,
        title: newTrackingTitle,
        description: newTrackingDescription || undefined,
        order: trackingItems.length,
      });

      // Refresh tracking items
      const updated = await getTrackingItems(goalId);
      setTrackingItems(updated);

      setNewTrackingTitle("");
      setNewTrackingDescription("");
      toast.success("Tracking item added");
    } catch {
      toast.error("Failed to add tracking item");
    }
  };

  const handleEditTrackingItem = (item: TrackingItem) => {
    setEditingTrackingId(item.id);
    setEditTrackingTitle(item.title);
    setEditTrackingDescription(item.description ?? "");
  };

  const handleUpdateTrackingItem = async () => {
    if (!editTrackingTitle.trim()) {
      toast.error("Tracking item title is required");
      return;
    }

    if (!goalId || !editingTrackingId) return;

    try {
      await updateTrackingItem(editingTrackingId, {
        title: editTrackingTitle,
        description: editTrackingDescription || undefined,
      });

      // Refresh tracking items
      const updated = await getTrackingItems(goalId);
      setTrackingItems(updated);

      setEditingTrackingId(null);
      toast.success("Tracking item updated");
    } catch {
      toast.error("Failed to update tracking item");
    }
  };

  const handleDeleteTrackingItem = async (itemId: string) => {
    if (!goalId) return;

    try {
      const result = await deleteTrackingItem(itemId);

      // Refresh tracking items
      const updated = await getTrackingItems(goalId);
      setTrackingItems(updated);

      // Show appropriate message based on delete type
      if (result.type === "soft_delete") {
        toast.success("Tracking item archived (linked to weekly sync)");
      } else {
        toast.success("Tracking item deleted");
      }
    } catch {
      toast.error("Failed to delete tracking item");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={showValueModal ? undefined : onClose} // Close when clicking the backdrop, unless value modal is open
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl backdrop-blur"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the modal
      >
        {/* Header — sticky so title + close stay reachable while scrolling */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-zinc-950/95 px-6 py-4 backdrop-blur">
          <h2 className="text-lg font-medium tracking-tight">{goalId ? "Edit Goal" : "Create Goal"}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/50 transition-all hover:bg-white/5 hover:text-white"
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
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/40">
                Title
              </label>
              <div className="relative flex gap-2">
                {/* Emoji Button */}
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/5 transition-all hover:border-white/40 hover:bg-white/10"
                  title="Click to choose emoji"
                >
                  {isEmojiUrl(emoji) ? (
                    <Image src={emoji} alt="emoji" width={24} height={24} className="h-6 w-6 object-contain" />
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
                  className="h-10 flex-1 rounded-lg border border-white/20 bg-white/5 px-4 text-white outline-none transition-all focus:border-white/40"
                  autoFocus
                />

                {/* Emoji Picker Dropdown */}
                {showEmojiPicker && (
                  <div className="absolute left-0 top-full z-50 mt-2 rounded-lg border border-white/20 bg-black p-2 shadow-xl">
                    <EmojiPicker
                      onEmojiClick={handleEmojiClick}
                      width={350}
                      height={400}
                      theme={Theme.DARK}
                      searchPlaceHolder="Search emoji..."
                    />

                    {/* Custom Emoji URL Section */}
                    <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                      <label className="text-xs text-white/60">Custom emoji URL:</label>
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
                          className="flex-1 rounded border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white outline-none transition-all placeholder:text-white/30 focus:border-white/40"
                        />
                        <button
                          type="button"
                          onClick={handleCustomEmojiUrl}
                          className="rounded border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white transition-all hover:bg-white/20"
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
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/40">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter goal description..."
                rows={3}
                className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white outline-none transition-all placeholder:text-white/30 focus:border-white/30 focus:bg-white/[0.05]"
              />
            </div>

            {/* Value Selection */}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/40">
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
                      className="inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-xs font-medium text-white"
                      style={{ backgroundColor: value.color }}
                    >
                      {value.name}
                      <button
                        onClick={() => setValueIds(valueIds.filter((id) => id !== valueId))}
                        className="flex items-center justify-center rounded-full p-0.5 text-white/70 transition-all hover:bg-black/30 hover:text-white"
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
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-white/15 px-2.5 py-0.5 text-xs text-white/50 transition-all hover:border-white/30 hover:text-white/80"
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </button>
                )}
              </div>

              {values.length === 0 && <p className="mt-1 text-xs text-white/30">No values created yet</p>}
            </div>

            {/* Tasks Section */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <label className="text-[11px] font-medium uppercase tracking-wider text-white/40">Tasks</label>
                {goalId && <span className="text-xs text-white/40">{Math.round(completion)}%</span>}
              </div>

              {/* Add task — opens the dedicated TaskModal in create mode.
                  Disabled before the goal is saved (no goalId to attach to);
                  same constraint as tracking items. */}
              <button
                type="button"
                onClick={() => goalId && setCreatingTask(true)}
                disabled={!goalId}
                title={goalId ? "Add a task" : "Save the goal first to add tasks"}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-transparent px-4 py-2 text-sm text-white/60 transition-all hover:border-white/30 hover:bg-white/[0.03] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-white/15 disabled:hover:bg-transparent disabled:hover:text-white/60"
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
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 transition-colors hover:border-white/10 hover:bg-white/[0.04]"
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
                          <CheckSquare className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Square className="h-4 w-4 text-white/30" />
                        )}
                      </button>
                      {task.emoji ? (
                        isEmojiUrl(task.emoji) ? (
                          <Image
                            src={task.emoji}
                            alt=""
                            width={16}
                            height={16}
                            className="h-4 w-4 shrink-0 object-contain"
                          />
                        ) : (
                          <span className="shrink-0 text-base leading-none">{task.emoji}</span>
                        )
                      ) : null}
                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${
                          task.completed ? "text-white/40 line-through" : "text-white/90"
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
                        <span className="shrink-0 text-[11px] text-white/40">
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
                                className="ring-2 ring-zinc-950"
                              />
                            </div>
                          ))}
                          {referents.length > 3 && (
                            <span className="-ml-1.5 rounded-full border border-white/10 bg-white/10 px-1 text-[9px] text-white/60">
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
                              className="h-2 w-2 rounded-full ring-1 ring-zinc-950"
                              style={{ backgroundColor: g.color }}
                            />
                          ))}
                          {taskGroups.length > 4 && (
                            <span className="ml-0.5 text-[9px] text-white/60">+{taskGroups.length - 4}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {displayTasks.length === 0 && (
                  <div className="rounded-lg border border-dashed border-white/10 bg-transparent p-4 text-center text-xs text-white/30">
                    {goalId ? "No tasks yet — click Add task." : "Save the goal first to add tasks."}
                  </div>
                )}
              </div>
            </div>

            {/* Tracking Section - Only show for existing goals.
                Collapsed by default — tracking items are also editable from
                the Tracking Items library (sidebar tab), so the modal hides
                them behind a click to keep the goal-editing form focused. */}
            {goalId && (
              <div>
                <button
                  type="button"
                  onClick={() => setTrackingCollapsed((c) => !c)}
                  className="group flex w-full items-center gap-2 rounded-md py-1 text-left transition-colors hover:bg-white/[0.02]"
                  aria-expanded={!trackingCollapsed}
                >
                  {trackingCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 text-white/40 transition-transform group-hover:text-white/60" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-white/40 transition-transform group-hover:text-white/60" />
                  )}
                  <span className="text-[11px] font-medium uppercase tracking-wider text-white/40 group-hover:text-white/60">
                    Tracking items
                  </span>
                  <span className="ml-1 rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] tabular-nums text-white/40">
                    {trackingItems.length}
                  </span>
                </button>

                {!trackingCollapsed && (
                  <>
                    <p className="mb-3 mt-1.5 text-xs text-white/40">
                      Metrics or outcomes you want to track weekly. Also editable from the Tracking Items tab.
                    </p>

                    {/* Add Tracking Item */}
                    <div className="mb-3 space-y-2">
                      <input
                        type="text"
                        value={newTrackingTitle}
                        onChange={(e) => setNewTrackingTitle(e.target.value)}
                        placeholder="Tracking item title…"
                        className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white outline-none transition-all placeholder:text-white/30 focus:border-white/30 focus:bg-white/[0.05]"
                      />
                      <textarea
                        value={newTrackingDescription}
                        onChange={(e) => setNewTrackingDescription(e.target.value)}
                        placeholder="Description (optional)…"
                        rows={2}
                        className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white outline-none transition-all placeholder:text-white/30 focus:border-white/30 focus:bg-white/[0.05]"
                      />
                      <button
                        onClick={handleAddTrackingItem}
                        className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/80 transition-all hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add tracking item
                      </button>
                    </div>

                    {/* Tracking Items List */}
                    <div className="space-y-1.5">
                      {trackingItems.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-white/5 bg-white/[0.02] p-3 transition-colors hover:border-white/10 hover:bg-white/[0.04]"
                        >
                          {editingTrackingId === item.id ? (
                            // Edit Mode
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={editTrackingTitle}
                                onChange={(e) => setEditTrackingTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    void handleUpdateTrackingItem();
                                  }
                                  if (e.key === "Escape") setEditingTrackingId(null);
                                }}
                                className="w-full bg-transparent text-sm text-white outline-none"
                                autoFocus
                              />
                              <textarea
                                value={editTrackingDescription}
                                onChange={(e) => setEditTrackingDescription(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && e.ctrlKey) {
                                    e.preventDefault();
                                    void handleUpdateTrackingItem();
                                  }
                                  if (e.key === "Escape") setEditingTrackingId(null);
                                }}
                                placeholder="Description…"
                                rows={2}
                                className="w-full resize-none bg-transparent text-xs text-white/70 outline-none placeholder:text-white/30"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={handleUpdateTrackingItem}
                                  className="rounded p-1 text-green-400 transition-all hover:bg-green-500/20"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => setEditingTrackingId(null)}
                                  className="rounded p-1 text-white/40 transition-all hover:bg-white/10"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            // View Mode
                            <div className="flex items-start justify-between gap-2">
                              <div
                                className="min-w-0 flex-1 cursor-pointer"
                                onClick={() => handleEditTrackingItem(item)}
                              >
                                <h4 className="text-sm font-medium text-white/90">{item.title}</h4>
                                {item.description && <p className="mt-0.5 text-xs text-white/50">{item.description}</p>}
                              </div>
                              <div className="flex shrink-0 gap-0.5">
                                <button
                                  onClick={() => handleEditTrackingItem(item)}
                                  className="rounded p-1 text-white/30 transition-all hover:bg-white/5 hover:text-white/80"
                                  aria-label="Edit tracking item"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteTrackingItem(item.id)}
                                  className="rounded p-1 text-white/30 transition-all hover:bg-red-500/10 hover:text-red-400"
                                  aria-label="Delete tracking item"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      {trackingItems.length === 0 && (
                        <div className="rounded-lg border border-dashed border-white/10 bg-transparent p-4 text-center text-xs text-white/30">
                          No tracking items yet
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="sticky bottom-0 -mx-6 mt-6 flex items-center justify-between gap-3 border-t border-white/5 bg-zinc-950/95 px-6 py-4 backdrop-blur">
            {goalId ? (
              <button
                onClick={handleDelete}
                className="rounded-lg px-3 py-2 text-sm text-white/40 transition-all hover:bg-red-500/10 hover:text-red-400"
              >
                Delete goal
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-white/70 transition-all hover:bg-white/5 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-all hover:bg-white/90"
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
