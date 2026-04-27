"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Edit2, Check, X, ChevronDown, ChevronRight } from "lucide-react";
import { useGoals } from "~/contexts/GoalsContext";
import type { Value } from "~/lib/api/types";
import { api, type RouterOutputs } from "~/trpc/react";
import toast from "react-hot-toast";
import { COLOR_PALETTE as DEFAULT_COLORS } from "~/lib/color-palette";

type Behavior = RouterOutputs["goals"]["valueBehaviors"]["listAll"][number];

// Compact, click-to-expand list of the user's values. Each row collapses to
// {color dot, name, behavior count}; expanding reveals an inline editor for
// the value (name + color) plus its list of confirming behaviors. Behaviors
// are stored in their own table (value_behaviors) — atomic add/delete/reorder.
export default function ValuesManager() {
  const { values, addValue, updateValue, deleteValue } = useGoals();

  const utils = api.useUtils();
  const behaviorsQuery = api.goals.valueBehaviors.listAll.useQuery();
  const createBehavior = api.goals.valueBehaviors.create.useMutation({
    onSuccess: () => utils.goals.valueBehaviors.listAll.invalidate(),
  });
  const deleteBehavior = api.goals.valueBehaviors.delete.useMutation({
    onSuccess: () => utils.goals.valueBehaviors.listAll.invalidate(),
  });

  const [newValueName, setNewValueName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState({ name: "", color: "" });
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [draftBehaviorContent, setDraftBehaviorContent] = useState("");

  const behaviorsByValueId = useMemo(() => {
    const m = new Map<string, Behavior[]>();
    for (const b of behaviorsQuery.data ?? []) {
      const arr = m.get(b.valueId) ?? [];
      arr.push(b);
      m.set(b.valueId, arr);
    }
    return m;
  }, [behaviorsQuery.data]);

  const getRandomColor = () => DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)]!;

  const handleAdd = () => {
    if (!newValueName.trim()) {
      toast.error("Value name is required");
      return;
    }
    void addValue({ name: newValueName.trim(), color: getRandomColor() });
    setNewValueName("");
  };

  const beginEdit = (value: Value) => {
    setEditingId(value.id);
    setEditValue({ name: value.name, color: value.color });
    setShowColorPicker(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setShowColorPicker(false);
  };

  const handleUpdate = () => {
    if (!editValue.name.trim()) {
      toast.error("Value name is required");
      return;
    }
    if (editingId) {
      void updateValue(editingId, { name: editValue.name.trim(), color: editValue.color });
      cancelEdit();
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Delete "${name}" and all its behaviors?`)) return;
    void deleteValue(id);
  };

  const toggleExpand = (id: string) => {
    setExpandedId((cur) => (cur === id ? null : id));
    setDraftBehaviorContent("");
  };

  const handleAddBehavior = async (valueId: string) => {
    const content = draftBehaviorContent.trim();
    if (!content) return;
    try {
      await createBehavior.mutateAsync({ valueId, content });
      setDraftBehaviorContent("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add behavior");
    }
  };

  const handleDeleteBehavior = async (id: string) => {
    try {
      await deleteBehavior.mutateAsync({ id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h2 className="text-2xl font-light">Your Values</h2>
          <p className="mt-1 text-sm opacity-60">
            Core values plus the concrete behaviors that confirm you&apos;re living them.
          </p>
        </div>

        {/* Add a new value — single row */}
        <div className="mb-6 flex gap-2">
          <input
            type="text"
            value={newValueName}
            onChange={(e) => setNewValueName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Add a value…"
            className="flex-1 rounded-md border border-white/15 bg-white/[0.03] px-3 py-2 text-sm outline-none transition-all placeholder:text-white/30 focus:border-white/30 focus:bg-white/[0.05]"
          />
          <button
            onClick={handleAdd}
            className="flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </div>

        {/* Values list — compact rows, click to expand */}
        <ul className="divide-y divide-white/5">
          {values.map((value) => {
            const expanded = expandedId === value.id;
            const editing = editingId === value.id;
            const behaviors = behaviorsByValueId.get(value.id) ?? [];

            return (
              <li key={value.id}>
                {/* Row header — collapsed view */}
                <div className="group flex items-center gap-3 py-2">
                  <button
                    onClick={() => toggleExpand(value.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1.5 pr-2 text-left hover:bg-white/[0.02]"
                    aria-expanded={expanded}
                  >
                    {expanded ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/40" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/40" />
                    )}
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: value.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{value.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-white/40">{behaviors.length}</span>
                  </button>
                  <div className="flex shrink-0 gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                    <button
                      onClick={() => beginEdit(value)}
                      className="rounded p-1.5 text-white/40 hover:bg-white/10 hover:text-white/80"
                      aria-label="Edit value"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(value.id, value.name)}
                      className="rounded p-1.5 text-white/40 hover:bg-rose-500/15 hover:text-rose-200"
                      aria-label="Delete value"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded view — edit value + behaviors list */}
                {expanded && (
                  <div className="mb-2 ml-7 space-y-3 rounded-md border border-white/5 bg-white/[0.02] p-3">
                    {editing ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowColorPicker((s) => !s)}
                            className="h-7 w-7 shrink-0 rounded-md border border-white/15"
                            style={{ backgroundColor: editValue.color }}
                            aria-label="Pick color"
                          />
                          <input
                            type="text"
                            value={editValue.name}
                            onChange={(e) => setEditValue({ ...editValue, name: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleUpdate();
                              if (e.key === "Escape") cancelEdit();
                            }}
                            className="flex-1 rounded-md border border-white/15 bg-black/30 px-2 py-1.5 text-sm outline-none focus:border-white/40"
                            autoFocus
                          />
                          <button
                            onClick={handleUpdate}
                            className="rounded p-1.5 text-emerald-300 hover:bg-emerald-500/15"
                            aria-label="Save"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="rounded p-1.5 text-white/50 hover:bg-white/10"
                            aria-label="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        {showColorPicker && (
                          <div className="grid grid-cols-10 gap-1.5 rounded-md border border-white/10 bg-black/40 p-2">
                            {DEFAULT_COLORS.map((color) => (
                              <button
                                key={color}
                                onClick={() => {
                                  setEditValue({ ...editValue, color });
                                  setShowColorPicker(false);
                                }}
                                className="h-5 w-5 rounded transition-transform hover:scale-110"
                                style={{ backgroundColor: color }}
                                aria-label={`Color ${color}`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {/* Behaviors */}
                    <div>
                      {behaviors.length > 0 ? (
                        <ul className="space-y-1">
                          {behaviors.map((b) => (
                            <li
                              key={b.id}
                              className="group/b flex items-start gap-2 rounded-md px-2 py-1 text-sm hover:bg-white/[0.03]"
                            >
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-white/30" />
                              <span className="min-w-0 flex-1 break-words text-white/85">{b.content}</span>
                              <button
                                onClick={() => void handleDeleteBehavior(b.id)}
                                className="shrink-0 rounded p-1 text-white/30 opacity-100 hover:bg-rose-500/15 hover:text-rose-200 md:opacity-0 md:group-hover/b:opacity-100"
                                aria-label="Remove behavior"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="px-2 py-1 text-xs italic text-white/40">
                          No behaviors yet — add concrete examples that confirm this value.
                        </p>
                      )}

                      {/* Add behavior */}
                      <div className="mt-2 flex gap-2">
                        <input
                          type="text"
                          value={expandedId === value.id ? draftBehaviorContent : ""}
                          onChange={(e) => setDraftBehaviorContent(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleAddBehavior(value.id);
                          }}
                          placeholder={`A behavior that confirms "${value.name}"…`}
                          className="flex-1 rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-sm outline-none placeholder:text-white/30 focus:border-white/30"
                        />
                        <button
                          onClick={() => void handleAddBehavior(value.id)}
                          disabled={!draftBehaviorContent.trim() || createBehavior.isPending}
                          className="flex items-center gap-1 rounded-md border border-white/15 px-2 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40"
                        >
                          <Plus className="h-3 w-3" />
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {values.length === 0 && (
          <div className="rounded-md border border-dashed border-white/10 px-4 py-12 text-center text-sm text-white/40">
            No values yet. Add your first one above.
          </div>
        )}
      </div>
    </div>
  );
}
