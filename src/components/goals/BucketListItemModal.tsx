"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "~/trpc/react";
import type { BucketListItem } from "~/lib/api/types";
import Avatar from "./Avatar";

const fieldLabel = "mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/40";
const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white outline-none transition-all placeholder:text-white/30 focus:border-white/30 focus:bg-white/[0.05]";
const textareaClass = `${inputClass} resize-none`;

type Mode = { kind: "create" } | { kind: "edit"; item: BucketListItem };

interface BucketListItemModalProps {
  mode: Mode;
  onClose: () => void;
  onSaved: () => void;
}

export default function BucketListItemModal({ mode, onClose, onSaved }: BucketListItemModalProps) {
  const isEdit = mode.kind === "edit";
  const item = isEdit ? mode.item : null;

  const [content, setContent] = useState(item?.content ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [personIds, setPersonIds] = useState<string[]>(item?.personIds ?? []);

  const peopleQuery = api.goals.people.getAll.useQuery({ includeArchived: false });
  const createMutation = api.goals.bucketList.create.useMutation();
  const updateMutation = api.goals.bucketList.update.useMutation();
  const deleteMutation = api.goals.bucketList.delete.useMutation();

  const isSaving = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  const togglePerson = (id: string) => {
    setPersonIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const handleSave = async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      toast.error("Add a name");
      return;
    }
    try {
      if (isEdit && item) {
        await updateMutation.mutateAsync({
          id: item.id,
          content: trimmed,
          description: description.trim() || null,
          personIds,
        });
        toast.success("Updated");
      } else {
        await createMutation.mutateAsync({
          content: trimmed,
          description: description.trim() || null,
          personIds,
        });
        toast.success("Added");
      }
      onSaved();
      onClose();
    } catch {
      toast.error("Couldn't save");
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    if (!confirm("Delete this item? Can't be undone.")) return;
    try {
      await deleteMutation.mutateAsync({ id: item.id });
      toast.success("Deleted");
      onSaved();
      onClose();
    } catch {
      toast.error("Couldn't delete");
    }
  };

  const people = peopleQuery.data ?? [];
  const sortedPeople = [...people].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-zinc-950/95 px-6 py-4 backdrop-blur">
          <h2 className="text-lg font-medium tracking-tight">{isEdit ? "Edit Bucket Item" : "Add Bucket Item"}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/50 transition-all hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-6 pb-6 pt-5">
          {/* Content */}
          <div>
            <label className={fieldLabel}>Thing to do</label>
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void handleSave();
                }
              }}
              placeholder="Something to do before you die…"
              maxLength={500}
              autoFocus
              className={inputClass}
            />
          </div>

          {/* Description */}
          <div>
            <label className={fieldLabel}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="The shape of it. Why it matters. Where, when, how."
              rows={4}
              maxLength={2000}
              className={textareaClass}
            />
          </div>

          {/* People to do it with */}
          <div>
            <label className={fieldLabel}>People I want to do this with</label>
            {sortedPeople.length === 0 ? (
              <p className="text-xs text-white/40">No people in your directory yet. Add some in the People tab.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                {sortedPeople.map((p) => {
                  const selected = personIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePerson(p.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all ${
                        selected
                          ? "border-white/30 bg-white/15 text-white"
                          : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white"
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
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-white/5 bg-zinc-950/95 px-6 py-3 backdrop-blur">
          {isEdit ? (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 transition-all hover:bg-rose-500/20 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/15 bg-transparent px-4 py-1.5 text-sm text-white/70 transition-all hover:bg-white/5 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving || !content.trim()}
              className="rounded-lg border border-white/20 bg-white px-4 py-1.5 text-sm text-black transition-all hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isEdit ? "Save" : "Add"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
