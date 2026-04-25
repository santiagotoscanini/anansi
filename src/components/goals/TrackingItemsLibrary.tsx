"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { api, type RouterOutputs } from "~/trpc/react";
import toast from "react-hot-toast";

type TrackingItemRow = RouterOutputs["goals"]["trackingItems"]["list"][number];
type GoalRow = RouterOutputs["goals"]["data"]["getAll"]["goals"][number];

// User's library of items they want to track on weekly syncs. Items are
// user-owned and may or may not be linked to a goal — `goalId IS NULL` items
// show an "Unscoped" pill. Editing/creation here is independent of any goal,
// which is the whole point: you can track things (sleep, journaling cadence,
// a relationship intention) that aren't anchored to an active objective.
export default function TrackingItemsLibrary() {
  const utils = api.useUtils();
  const itemsQuery = api.goals.trackingItems.list.useQuery({});
  const goalsQuery = api.goals.data.getAll.useQuery();
  const createMutation = api.goals.trackingItems.create.useMutation({
    onSuccess: () => utils.goals.trackingItems.list.invalidate(),
  });
  const updateMutation = api.goals.trackingItems.update.useMutation({
    onSuccess: () => utils.goals.trackingItems.list.invalidate(),
  });
  const deleteMutation = api.goals.trackingItems.delete.useMutation({
    onSuccess: () => utils.goals.trackingItems.list.invalidate(),
  });

  const [creatingOpen, setCreatingOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftGoalId, setDraftGoalId] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editGoalId, setEditGoalId] = useState<string>("");

  const goalsById = useMemo(() => {
    const map = new Map<string, GoalRow>();
    for (const g of goalsQuery.data?.goals ?? []) map.set(g.id, g);
    return map;
  }, [goalsQuery.data]);

  const items = itemsQuery.data ?? [];

  const beginEdit = (item: TrackingItemRow) => {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditDescription(item.description ?? "");
    setEditGoalId(item.goalId ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
    setEditDescription("");
    setEditGoalId("");
  };

  const cancelCreate = () => {
    setCreatingOpen(false);
    setDraftTitle("");
    setDraftDescription("");
    setDraftGoalId("");
  };

  const handleCreate = async () => {
    const title = draftTitle.trim();
    if (!title) {
      toast.error("Title is required");
      return;
    }
    try {
      await createMutation.mutateAsync({
        title,
        description: draftDescription.trim() || undefined,
        goalId: draftGoalId || undefined,
      });
      toast.success("Tracking item created");
      cancelCreate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const title = editTitle.trim();
    if (!title) {
      toast.error("Title is required");
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: editingId,
        title,
        description: editDescription.trim() || null,
        goalId: editGoalId === "" ? null : editGoalId,
      });
      toast.success("Saved");
      cancelEdit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  };

  const handleDelete = async (item: TrackingItemRow) => {
    if (!confirm(`Delete "${item.title}"?`)) return;
    try {
      const result = await deleteMutation.mutateAsync({ id: item.id });
      toast.success(result.type === "soft_delete" ? "Archived (referenced by past syncs)" : "Deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  return (
    <div className="flex h-full flex-col text-white">
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div>
          <h2 className="text-xl font-semibold">Tracking Items</h2>
          <p className="text-sm text-white/60">Things you track on weekly syncs. Goal optional.</p>
        </div>
        {!creatingOpen && (
          <button
            onClick={() => setCreatingOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
          >
            <Plus className="h-4 w-4" />
            New item
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {creatingOpen && (
          <div className="mb-6 rounded-xl border border-white/15 bg-white/5 p-4">
            <input
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Title (e.g., Sleep, Journaling, Time with mom)"
              className="w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/40"
            />
            <textarea
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
              className="mt-2 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/40"
            />
            <select
              value={draftGoalId}
              onChange={(e) => setDraftGoalId(e.target.value)}
              className="mt-2 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/40"
            >
              <option value="">— Unscoped (no goal) —</option>
              {[...goalsById.values()].map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={cancelCreate}
                className="rounded-md px-3 py-1.5 text-sm text-white/70 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-60"
              >
                {createMutation.isPending ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        )}

        {itemsQuery.isLoading ? (
          <div className="text-sm text-white/60">Loading…</div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-white/60">
            No tracking items yet. Click <span className="font-medium text-white">New item</span> to add one.
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const isEditing = editingId === item.id;
              const goal = item.goalId ? goalsById.get(item.goalId) : null;
              return (
                <li key={item.id} className="rounded-xl border border-white/10 bg-white/5">
                  {isEditing ? (
                    <div className="p-4">
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/40"
                      />
                      <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        rows={2}
                        className="mt-2 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/40"
                      />
                      <select
                        value={editGoalId}
                        onChange={(e) => setEditGoalId(e.target.value)}
                        className="mt-2 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/40"
                      >
                        <option value="">— Unscoped —</option>
                        {[...goalsById.values()].map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.title}
                          </option>
                        ))}
                      </select>
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          onClick={cancelEdit}
                          className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-white/70 hover:bg-white/10"
                        >
                          <X className="h-4 w-4" /> Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          disabled={updateMutation.isPending}
                          className="flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-60"
                        >
                          <Check className="h-4 w-4" /> Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="group flex items-start gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium">{item.title}</span>
                          {goal ? (
                            <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-200">
                              {goal.title}
                            </span>
                          ) : (
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
                              Unscoped
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="mt-1 text-sm text-white/60">{item.description}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                        <button
                          onClick={() => beginEdit(item)}
                          className="rounded-md p-1.5 text-white/70 hover:bg-white/10"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          className="rounded-md p-1.5 text-white/70 hover:bg-rose-500/20 hover:text-rose-200"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
