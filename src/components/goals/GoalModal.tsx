"use client";

import { useState } from "react";
import { X, Trash2, Square, CheckSquare, Check, Edit2 } from "lucide-react";
import { useGoals, type Task } from "~/contexts/GoalsContext";
import toast from "react-hot-toast";

interface GoalModalProps {
  goalId: string | null;
  onClose: () => void;
}

export default function GoalModal({ goalId, onClose }: GoalModalProps) {
  const { goals, values, addGoal, updateGoal, deleteGoal, addTask, updateTask, deleteTask, getGoalCompletion } =
    useGoals();

  const existingGoal = goalId ? goals.find((g) => g.id === goalId) : null;

  const [title, setTitle] = useState(existingGoal?.title ?? "");
  const [description, setDescription] = useState(existingGoal?.description ?? "");
  const [valueIds, setValueIds] = useState<string[]>(existingGoal?.valueIds ?? []);
  const [tasks, setTasks] = useState<Task[]>(goalId ? [] : []);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [editTaskDifficulty, setEditTaskDifficulty] = useState<1 | 2 | 3>(2);

  const completion = goalId ? getGoalCompletion(goalId) : 0;

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
        valueIds,
      });
      toast.success("Goal updated successfully");
    } else {
      // For new goals, include the tasks
      addGoal({
        title,
        description,
        valueIds,
        tasks,
        position: { x: 250, y: 250 },
        importance: "Low" as const, // Default importance for new goals
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

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose} // Close when clicking the backdrop
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
          {/* Title */}
          <div>
            <label className="mb-2 block text-sm text-white/60">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter goal title..."
              className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white outline-none transition-all focus:border-white/40"
              autoFocus
            />
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
            <div className="space-y-2">
              {values.map((value) => (
                <label key={value.id} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={valueIds.includes(value.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setValueIds([...valueIds, value.id]);
                      } else {
                        setValueIds(valueIds.filter((id) => id !== value.id));
                      }
                    }}
                    className="rounded border-white/20"
                  />
                  <span
                    className="rounded px-2 py-1 text-xs font-semibold text-white"
                    style={{ backgroundColor: value.color }}
                  >
                    {value.name}
                  </span>
                </label>
              ))}
              {values.length === 0 && <p className="text-xs text-white/40">No values created yet</p>}
            </div>
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
                      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex justify-between">
          {goalId && (
            <button
              onClick={handleDelete}
              className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-red-400 transition-all hover:bg-red-500/20"
            >
              Delete Goal
            </button>
          )}
          <div className={`flex gap-2 ${!goalId ? "ml-auto" : ""}`}>
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
        </div>
      </div>
    </div>
  );
}
