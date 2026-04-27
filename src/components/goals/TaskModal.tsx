"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { CheckSquare, Square, Trash2, X } from "lucide-react";
import EmojiPicker, { type EmojiClickData, Theme } from "emoji-picker-react";
import toast from "react-hot-toast";
import { useGoals } from "~/contexts/GoalsContext";
import { isEmojiUrl } from "~/lib/emoji-utils";
import { api } from "~/trpc/react";
import DatePicker from "./DatePicker";
import Avatar from "./Avatar";

interface TaskModalProps {
  goalId: string;
  // Null/undefined = create mode. Otherwise the modal edits the task with this id.
  taskId?: string | null;
  onClose: () => void;
}

// Edit/create panel for a single task — mirrors GoalModal's layout so the user
// can jump from any surface into a familiar form. Title gets its own emoji
// (separate from the parent goal's), description, difficulty, deadline,
// referent people and group tags. Edits flow through updateTask; new tasks
// flow through addTask. The goal-modal task rows now route ALL editing here
// to avoid having two ways to do the same thing.
export default function TaskModal({ goalId, taskId, onClose }: TaskModalProps) {
  const { goals, addTask, updateTask, deleteTask } = useGoals();

  const isCreate = !taskId;
  const goal = goals.find((g) => g.id === goalId);
  const task = !isCreate ? (goal?.tasks.find((t) => t.id === taskId) ?? null) : null;

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [emoji, setEmoji] = useState<string>(task?.emoji ?? "");
  const [customEmojiUrl, setCustomEmojiUrl] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(task?.difficulty ?? 2);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(task?.scheduledAt ? new Date(task.scheduledAt) : null);
  const [referentIds, setReferentIds] = useState<string[]>(task?.referentIds ?? []);
  const [groupIds, setGroupIds] = useState<string[]>(task?.groupIds ?? []);
  const [completed, setCompleted] = useState<boolean>(task?.completed ?? false);
  // Note: callers must pass `key={taskId}` so this modal remounts when the
  // user navigates to a different task — that resets the useState initializers
  // above. We deliberately avoid useState+useEffect-sync to dodge stale flash.

  const peopleQuery = api.goals.people.getAll.useQuery({ includeArchived: false });
  const people = useMemo(() => peopleQuery.data ?? [], [peopleQuery.data]);
  const groupsQuery = api.goals.groups.getAll.useQuery();
  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);

  if (!goal || (!isCreate && !task)) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
        <div className="rounded-lg border border-white/10 bg-zinc-950 p-6 text-sm text-white/60">
          {!goal ? "Goal not found." : "Task not found."}
        </div>
      </div>
    );
  }

  const handleEmojiClick = (data: EmojiClickData) => {
    setEmoji(data.emoji);
    setShowEmojiPicker(false);
    setCustomEmojiUrl("");
  };

  const handleCustomEmojiUrl = () => {
    if (customEmojiUrl.trim()) {
      setEmoji(customEmojiUrl.trim());
      setCustomEmojiUrl("");
      setShowEmojiPicker(false);
      toast.success("Custom emoji set");
    }
  };

  const toggleReferent = (personId: string) => {
    setReferentIds((curr) => (curr.includes(personId) ? curr.filter((id) => id !== personId) : [...curr, personId]));
  };

  const toggleGroup = (gid: string) => {
    setGroupIds((curr) => (curr.includes(gid) ? curr.filter((id) => id !== gid) : [...curr, gid]));
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Task title is required");
      return;
    }
    if (isCreate) {
      await addTask(goalId, {
        title: title.trim(),
        description: description.trim() ? description.trim() : null,
        emoji: emoji || null,
        difficulty,
        completed,
        scheduledAt,
        referentIds,
        groupIds,
      });
      toast.success("Task created");
    } else if (taskId) {
      await updateTask(goalId, taskId, {
        title: title.trim(),
        description: description.trim() ? description.trim() : null,
        emoji: emoji || null,
        difficulty,
        completed,
        scheduledAt,
        referentIds,
        groupIds,
      });
      toast.success("Task updated");
    }
    onClose();
  };

  const handleDelete = () => {
    if (!taskId) return;
    if (!confirm("Delete this task?")) return;
    void deleteTask(goalId, taskId);
    toast.success("Task deleted");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-zinc-950/95 px-6 py-4 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-lg font-medium tracking-tight">{isCreate ? "New Task" : "Edit Task"}</h2>
            <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/60">
              {goal.emoji && !isEmojiUrl(goal.emoji) ? `${goal.emoji} ` : ""}
              {goal.title}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/50 transition-all hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 pb-6 pt-5">
          <div className="space-y-5">
            {/* Title + emoji */}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/40">
                Title
              </label>
              <div className="relative flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker((s) => !s)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/5 transition-all hover:border-white/40 hover:bg-white/10"
                  title="Click to choose emoji"
                >
                  {emoji ? (
                    isEmojiUrl(emoji) ? (
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
                    )
                  ) : (
                    <span className="text-xs text-white/40">+</span>
                  )}
                </button>

                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Task title…"
                  className="h-10 flex-1 rounded-lg border border-white/20 bg-white/5 px-4 text-white outline-none transition-all focus:border-white/40"
                  autoFocus
                />

                {showEmojiPicker && (
                  <div className="absolute left-0 top-full z-50 mt-2 rounded-lg border border-white/20 bg-black p-2 shadow-xl">
                    <EmojiPicker
                      onEmojiClick={handleEmojiClick}
                      width={350}
                      height={400}
                      theme={Theme.DARK}
                      searchPlaceHolder="Search emoji..."
                    />
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
                      {emoji && (
                        <button
                          type="button"
                          onClick={() => {
                            setEmoji("");
                            setShowEmojiPicker(false);
                          }}
                          className="text-xs text-white/40 underline transition-colors hover:text-white/70"
                        >
                          Clear emoji
                        </button>
                      )}
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
                placeholder="What does this task entail?"
                rows={4}
                className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white outline-none transition-all placeholder:text-white/30 focus:border-white/30 focus:bg-white/[0.05]"
              />
            </div>

            {/* Difficulty + Deadline + Completed */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/40">
                  Difficulty
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(parseInt(e.target.value) as 1 | 2 | 3)}
                  className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none transition-all focus:border-white/30"
                >
                  <option value={1}>Easy</option>
                  <option value={2}>Medium</option>
                  <option value={3}>Hard</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/40">
                  Deadline
                </label>
                <DatePicker value={scheduledAt} onChange={setScheduledAt} placeholder="No deadline" size="md" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/40">
                  Status
                </label>
                <button
                  type="button"
                  onClick={() => setCompleted((c) => !c)}
                  className="flex h-10 w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm transition-all hover:border-white/30"
                >
                  {completed ? (
                    <>
                      <CheckSquare className="h-4 w-4 text-emerald-500" />
                      <span className="text-white/80">Completed</span>
                    </>
                  ) : (
                    <>
                      <Square className="h-4 w-4 text-white/30" />
                      <span className="text-white/60">Open</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Referents */}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/40">
                Who I&apos;m relying on
              </label>
              {people.length === 0 ? (
                <p className="text-xs text-white/40">Add someone in the People tab first.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {people.map((p) => {
                    const selected = referentIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleReferent(p.id)}
                        className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-all ${
                          selected
                            ? "border-white/30 bg-white/15 text-white"
                            : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <Avatar name={p.name} emoji={p.emoji} size="xs" shape="circle" />
                        <span>{p.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Groups */}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/40">
                Groups
              </label>
              {groups.length === 0 ? (
                <p className="text-xs text-white/40">Create a group from the sidebar first.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {groups.map((g) => {
                    const selected = groupIds.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => toggleGroup(g.id)}
                        className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-all ${
                          selected
                            ? "border-white/30 bg-white/15 text-white"
                            : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: g.color }} />
                        <span>{g.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 -mx-6 mt-6 flex items-center justify-between gap-3 border-t border-white/5 bg-zinc-950/95 px-6 py-4 backdrop-blur">
            {isCreate ? (
              <span />
            ) : (
              <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-white/40 transition-all hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete task
              </button>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-white/70 transition-all hover:bg-white/5 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-all hover:bg-white/90"
              >
                {isCreate ? "Create task" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
