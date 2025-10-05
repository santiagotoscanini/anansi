"use client";

import { useState, useEffect } from "react";
import { X, Trash2, Square, CheckSquare, Check, Edit2, Plus } from "lucide-react";
import { useGoals, type Task, type TrackingItem } from "~/contexts/GoalsContext";
import toast from "react-hot-toast";
import ValueSelectionModal from "./ValueSelectionModal";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import { getRandomEmoji, isEmojiUrl } from "~/lib/emoji-utils";

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
    addTask,
    updateTask,
    deleteTask,
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
  const [tasks, setTasks] = useState<Task[]>(goalId ? [] : []);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [editTaskDifficulty, setEditTaskDifficulty] = useState<1 | 2 | 3>(2);

  // Tracking items state
  const [trackingItems, setTrackingItems] = useState<TrackingItem[]>([]);
  const [newTrackingTitle, setNewTrackingTitle] = useState("");
  const [newTrackingDescription, setNewTrackingDescription] = useState("");
  const [editingTrackingId, setEditingTrackingId] = useState<string | null>(null);
  const [editTrackingTitle, setEditTrackingTitle] = useState("");
  const [editTrackingDescription, setEditTrackingDescription] = useState("");

  // Value selection modal state
  const [showValueModal, setShowValueModal] = useState(false);

  const completion = goalId ? getGoalCompletion(goalId) : 0;

  // Load tracking items for existing goal
  useEffect(() => {
    if (goalId) {
      getTrackingItems(goalId).then(setTrackingItems);
    }
  }, [goalId, getTrackingItems]);

  const handleSave = () => {
    if (!title.trim()) {
      toast.error("Goal title is required");
      return;
    }

    if (goalId) {
      // For existing goals, don't update tasks here (they're managed separately)
      updateGoal(goalId, {
        title,
        description,
        emoji,
        valueIds,
      });
      toast.success("Goal updated successfully");
    } else {
      // For new goals, include the tasks
      addGoal({
        title,
        description,
        emoji,
        valueIds,
        tasks,
        position: { x: 250, y: 250 },
      });
      toast.success("Goal created successfully");
    }

    onClose();
  };

  const handleDelete = () => {
    if (goalId) {
      deleteGoal(goalId);
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

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) {
      toast.error("Task title is required");
      return;
    }

    const newTask: Task = {
      id: crypto.randomUUID(),
      title: newTaskTitle,
      difficulty: 2, // Default to medium
      completed: false,
    };

    if (goalId) {
      addTask(goalId, {
        title: newTaskTitle,
        difficulty: 2,
        completed: false,
      });
    } else {
      setTasks([...tasks, newTask]);
    }

    setNewTaskTitle("");
    toast.success("Task added");
  };

  const handleEditTask = (task: Task) => {
    setEditingTaskId(task.id);
    setEditTaskTitle(task.title);
    setEditTaskDifficulty(task.difficulty);
  };

  const handleUpdateTaskEdit = () => {
    if (!editTaskTitle.trim()) {
      toast.error("Task title is required");
      return;
    }

    if (goalId) {
      updateTask(goalId, editingTaskId!, {
        title: editTaskTitle,
        difficulty: editTaskDifficulty,
      });
    } else {
      setTasks(
        tasks.map((t) => (t.id === editingTaskId ? { ...t, title: editTaskTitle, difficulty: editTaskDifficulty } : t)),
      );
    }

    setEditingTaskId(null);
    toast.success("Task updated");
  };

  // For existing goals, get tasks from context dynamically; for new goals, use local state
  const displayTasks = goalId ? (goals.find((g) => g.id === goalId)?.tasks ?? []) : tasks;

  const handleToggleTask = (taskId: string) => {
    if (goalId) {
      const task = displayTasks.find((t) => t.id === taskId);
      if (task) {
        updateTask(goalId, taskId, { completed: !task.completed });
      }
    } else {
      setTasks(tasks.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t)));
    }
  };

  const handleDeleteTask = (taskId: string) => {
    if (goalId) {
      deleteTask(goalId, taskId);
    } else {
      setTasks(tasks.filter((t) => t.id !== taskId));
    }
    toast.success("Task deleted");
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
    } catch (error) {
      toast.error("Failed to add tracking item");
    }
  };

  const handleEditTrackingItem = (item: TrackingItem) => {
    setEditingTrackingId(item.id);
    setEditTrackingTitle(item.title);
    setEditTrackingDescription(item.description || "");
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
    } catch (error) {
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
    } catch (error) {
      toast.error("Failed to delete tracking item");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={showValueModal ? undefined : onClose} // Close when clicking the backdrop, unless value modal is open
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/20 bg-black p-6"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the modal
      >
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-light">{goalId ? "Edit Goal" : "Create Goal"}</h2>
          <button onClick={onClose} className="rounded-lg p-2 transition-all hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Goal Details */}
        <div className="space-y-4">
          {/* Title with Emoji */}
          <div>
            <label className="mb-2 block text-sm text-white/60">Title</label>
            <div className="relative flex gap-2">
              {/* Emoji Button */}
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/5 transition-all hover:border-white/40 hover:bg-white/10"
                title="Click to choose emoji"
              >
                {isEmojiUrl(emoji) ? (
                  <img src={emoji} alt="emoji" className="h-6 w-6 object-contain" />
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
                    theme="dark"
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
            <label className="mb-2 block text-sm text-white/60">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter goal description..."
              rows={3}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white outline-none transition-all focus:border-white/40"
            />
          </div>

          {/* Value Selection */}
          <div>
            <label className="mb-2 block text-sm text-white/60">Associated Values</label>

            {/* Selected Values Pills */}
            <div className="mb-3 flex flex-wrap gap-2">
              {valueIds.map((valueId) => {
                const value = values.find((v) => v.id === valueId);
                if (!value) return null;
                return (
                  <div
                    key={value.id}
                    className="group flex items-center gap-2 rounded px-3 py-1 text-sm font-semibold text-white"
                    style={{ backgroundColor: value.color }}
                  >
                    <span>{value.name}</span>
                    <button
                      onClick={() => setValueIds(valueIds.filter((id) => id !== valueId))}
                      className="flex h-full items-center rounded px-1 opacity-100 transition-all hover:bg-black/20 md:opacity-0 md:group-hover:opacity-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Add Values Button */}
            {valueIds.length < values.length && (
              <button
                onClick={() => setShowValueModal(true)}
                className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm text-white transition-all hover:bg-white/10"
              >
                <Plus className="h-4 w-4" />
                Add Values
              </button>
            )}

            {values.length === 0 && <p className="text-xs text-white/40">No values created yet</p>}
          </div>

          {/* Tasks Section */}
          <div>
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm text-white/60">Tasks</label>
                {goalId && <span className="text-sm text-white/60">Completion: {Math.round(completion)}%</span>}
              </div>

              {/* Add Task - Simple Input */}
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
                placeholder="Add a task and press Enter..."
                className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white outline-none transition-all placeholder:text-white/30 focus:border-white/40"
              />
              <p className="mt-1 text-xs text-white/40">
                Tasks are set to medium difficulty by default. Click to edit after adding.
              </p>
            </div>

            {/* Tasks List */}
            <div className="space-y-2">
              {displayTasks.map((task) => (
                <div key={task.id} className="group rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  {editingTaskId === task.id ? (
                    // Edit Mode
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editTaskTitle}
                        onChange={(e) => setEditTaskTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleUpdateTaskEdit();
                          if (e.key === "Escape") setEditingTaskId(null);
                        }}
                        className="flex-1 bg-transparent text-white outline-none"
                        autoFocus
                      />
                      <select
                        value={editTaskDifficulty}
                        onChange={(e) => setEditTaskDifficulty(parseInt(e.target.value) as 1 | 2 | 3)}
                        className="rounded border border-white/20 bg-white/10 px-2 py-1 text-xs text-white outline-none"
                      >
                        <option value={1}>Easy</option>
                        <option value={2}>Medium</option>
                        <option value={3}>Hard</option>
                      </select>
                      <button
                        onClick={handleUpdateTaskEdit}
                        className="rounded p-1 text-green-400 transition-all hover:bg-green-500/20"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setEditingTaskId(null)}
                        className="rounded p-1 text-white/40 transition-all hover:bg-white/10"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    // View Mode
                    <div className="flex items-center gap-3">
                      <button onClick={() => handleToggleTask(task.id)} className="transition-all hover:scale-110">
                        {task.completed ? (
                          <CheckSquare className="h-5 w-5 text-green-500" />
                        ) : (
                          <Square className="h-5 w-5 text-white/40" />
                        )}
                      </button>
                      <span
                        className={`flex-1 cursor-pointer ${
                          task.completed ? "text-white/40 line-through" : "text-white"
                        }`}
                        onClick={() => handleEditTask(task)}
                      >
                        {task.title}
                      </span>
                      <span className={`text-xs ${getDifficultyColor(task.difficulty)}`}>
                        {getDifficultyLabel(task.difficulty)}
                      </span>
                      <div className="flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                        <button
                          onClick={() => handleEditTask(task)}
                          className="rounded p-1 text-white/40 transition-all hover:bg-white/10"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          className="rounded p-1 text-red-400 transition-all hover:bg-red-500/20"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {displayTasks.length === 0 && (
                <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-center text-sm text-white/40">
                  No tasks added yet
                </div>
              )}
            </div>
          </div>

          {/* Tracking Section - Only show for existing goals */}
          {goalId && (
            <div>
              <div className="mb-4">
                <label className="mb-2 block text-sm text-white/60">Tracking Items</label>
                <p className="mb-4 text-xs text-white/40">
                  Define specific metrics or outcomes you want to track for this goal.
                </p>

                {/* Add Tracking Item */}
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newTrackingTitle}
                    onChange={(e) => setNewTrackingTitle(e.target.value)}
                    placeholder="Tracking item title..."
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white outline-none transition-all placeholder:text-white/30 focus:border-white/40"
                  />
                  <textarea
                    value={newTrackingDescription}
                    onChange={(e) => setNewTrackingDescription(e.target.value)}
                    placeholder="Description (optional)..."
                    rows={2}
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white outline-none transition-all placeholder:text-white/30 focus:border-white/40"
                  />
                  <button
                    onClick={handleAddTrackingItem}
                    className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm text-white transition-all hover:bg-white/10"
                  >
                    <Plus className="h-4 w-4" />
                    Add Tracking Item
                  </button>
                </div>
              </div>

              {/* Tracking Items List */}
              <div className="space-y-2">
                {trackingItems.map((item) => (
                  <div key={item.id} className="group rounded-lg border border-white/10 bg-white/5 p-3">
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
                              handleUpdateTrackingItem();
                            }
                            if (e.key === "Escape") setEditingTrackingId(null);
                          }}
                          className="w-full bg-transparent text-white outline-none"
                          autoFocus
                        />
                        <textarea
                          value={editTrackingDescription}
                          onChange={(e) => setEditTrackingDescription(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && e.ctrlKey) {
                              e.preventDefault();
                              handleUpdateTrackingItem();
                            }
                            if (e.key === "Escape") setEditingTrackingId(null);
                          }}
                          placeholder="Description..."
                          rows={2}
                          className="w-full bg-transparent text-sm text-white/80 outline-none placeholder:text-white/30"
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
                      <div className="flex items-start justify-between">
                        <div className="flex-1 cursor-pointer" onClick={() => handleEditTrackingItem(item)}>
                          <h4 className="font-medium text-white">{item.title}</h4>
                          {item.description && <p className="mt-1 text-sm text-white/60">{item.description}</p>}
                        </div>
                        <div className="flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                          <button
                            onClick={() => handleEditTrackingItem(item)}
                            className="rounded p-1 text-white/40 transition-all hover:bg-white/10"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteTrackingItem(item.id)}
                            className="rounded p-1 text-red-400 transition-all hover:bg-red-500/20"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {trackingItems.length === 0 && (
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-center text-sm text-white/40">
                    No tracking items added yet
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex flex-col gap-3 md:flex-row md:justify-between">
          <div className={`flex flex-col gap-2 md:flex-row md:gap-2 ${!goalId ? "md:ml-auto" : ""}`}>
            <button
              onClick={onClose}
              className="rounded-lg border border-white/20 px-4 py-2 transition-all hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rounded-lg border border-white/20 bg-white px-4 py-2 text-black transition-all hover:bg-white/90"
            >
              {goalId ? "Update" : "Create"} Goal
            </button>
          </div>
          {goalId && (
            <button
              onClick={handleDelete}
              className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-red-400 transition-all hover:bg-red-500/20 md:order-first"
            >
              Delete Goal
            </button>
          )}
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
    </div>
  );
}
