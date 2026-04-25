"use client";

import { useMemo, useState } from "react";
import { Check, Mountain, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "~/trpc/react";
import type { BucketListItem } from "~/lib/api/types";
import Avatar from "./Avatar";
import BucketListItemModal from "./BucketListItemModal";

function formatCompletedDate(d: Date): string {
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(d);
}

type PersonLite = { id: string; name: string; emoji: string | null };

function ItemRow({
  item,
  peopleById,
  onToggle,
  onOpen,
  busy,
}: {
  item: BucketListItem;
  peopleById: Map<string, PersonLite>;
  onToggle: () => void;
  onOpen: () => void;
  busy: boolean;
}) {
  const completed = !!item.completedAt;
  const linkedPeople = item.personIds.map((id) => peopleById.get(id)).filter((p): p is PersonLite => !!p);

  return (
    <li className="group flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 transition-colors hover:border-white/10">
      {/* Checkbox — kept inline so toggling is one click without opening the modal */}
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-label={completed ? "Mark as not done" : "Mark as done"}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all disabled:cursor-not-allowed ${
          completed
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
            : "border-white/20 text-transparent hover:border-white/50 hover:text-white/40"
        }`}
      >
        <Check className="h-3 w-3" />
      </button>

      {/* Content area — clicking anywhere here opens the modal for full editing */}
      <button
        type="button"
        onClick={onOpen}
        disabled={busy}
        className="min-w-0 flex-1 cursor-pointer text-left disabled:cursor-not-allowed"
      >
        <p className={`break-words text-sm ${completed ? "text-white/40 line-through" : "text-white/85"}`}>
          {item.content}
        </p>
        {item.description && (
          <p className={`mt-0.5 line-clamp-1 text-xs ${completed ? "text-white/25" : "text-white/45"}`}>
            {item.description}
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {linkedPeople.length > 0 && (
            <div className="flex -space-x-1.5">
              {linkedPeople.slice(0, 5).map((p) => (
                <span key={p.id} className="rounded-full ring-2 ring-zinc-950" title={p.name}>
                  <Avatar name={p.name} emoji={p.emoji} size="xs" shape="circle" />
                </span>
              ))}
              {linkedPeople.length > 5 && (
                <span className="ml-1 text-[10px] text-white/40">+{linkedPeople.length - 5}</span>
              )}
            </div>
          )}
          {completed && item.completedAt && (
            <span className="text-[10px] uppercase tracking-wider text-emerald-300/50">
              Done {formatCompletedDate(new Date(item.completedAt))}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

export default function BucketList() {
  const utils = api.useUtils();
  const listQuery = api.goals.bucketList.list.useQuery();
  const peopleQuery = api.goals.people.getAll.useQuery({ includeArchived: false });

  const invalidate = () => {
    void utils.goals.bucketList.list.invalidate();
  };

  const createMutation = api.goals.bucketList.create.useMutation({ onSuccess: invalidate });
  const toggleMutation = api.goals.bucketList.toggleCompleted.useMutation({ onSuccess: invalidate });

  const [newContent, setNewContent] = useState("");
  // Modal state: null = closed; "create" = quick-add via modal; { item } = editing.
  const [modalState, setModalState] = useState<null | { kind: "create" } | { kind: "edit"; item: BucketListItem }>(
    null,
  );

  const handleQuickAdd = async () => {
    const content = newContent.trim();
    if (!content) return;
    try {
      await createMutation.mutateAsync({ content });
      setNewContent("");
    } catch {
      toast.error("Couldn't add");
    }
  };

  const handleToggle = async (item: BucketListItem) => {
    try {
      await toggleMutation.mutateAsync({ id: item.id, completed: !item.completedAt });
    } catch {
      toast.error("Couldn't update");
    }
  };

  const items = (listQuery.data ?? []) as BucketListItem[];
  const peopleById = useMemo(() => {
    const m = new Map<string, PersonLite>();
    for (const p of peopleQuery.data ?? []) m.set(p.id, { id: p.id, name: p.name, emoji: p.emoji });
    return m;
  }, [peopleQuery.data]);

  const pending = items.filter((i) => !i.completedAt).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const done = items
    .filter((i) => i.completedAt)
    .sort((a, b) => +new Date(b.completedAt!) - +new Date(a.completedAt!));

  const busy = createMutation.isPending || toggleMutation.isPending;

  return (
    <div className="h-full overflow-y-auto px-6 py-8 md:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <div className="flex items-center gap-3">
            <Mountain className="h-6 w-6 text-white/70" />
            <h2 className="text-2xl font-light">Bucket List</h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-white/60">
            Things to do before you die. Add when you think of them. Click to add who you want there or describe what
            it really means. Check them off when you do them.
          </p>
        </header>

        {/* Quick add — Enter creates with content only; click an item to add people/description */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleQuickAdd();
              }
            }}
            placeholder="Something to do before you die…"
            maxLength={500}
            className="flex-1 rounded-lg border border-white/15 bg-white/[0.03] px-4 py-2.5 text-sm text-white outline-none transition-all placeholder:text-white/30 focus:border-white/40 focus:bg-white/[0.05]"
          />
          <button
            type="button"
            onClick={() => void handleQuickAdd()}
            disabled={!newContent.trim() || createMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white px-4 text-sm text-black transition-all hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
          <button
            type="button"
            onClick={() => setModalState({ kind: "create" })}
            className="rounded-lg border border-white/15 bg-white/[0.03] px-3 text-sm text-white/70 transition-all hover:bg-white/[0.06] hover:text-white"
            title="Add with details"
          >
            …
          </button>
        </div>

        {/* To do */}
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-white/50">
              To do <span className="text-white/30">({pending.length})</span>
            </h3>
          </div>
          {listQuery.isLoading ? (
            <p className="text-xs text-white/40">Loading…</p>
          ) : pending.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.01] p-6 text-center text-sm text-white/40">
              Nothing here yet. Add the first thing.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {pending.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  peopleById={peopleById}
                  onToggle={() => void handleToggle(item)}
                  onOpen={() => setModalState({ kind: "edit", item })}
                  busy={busy}
                />
              ))}
            </ul>
          )}
        </section>

        {/* Done */}
        {done.length > 0 && (
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-[11px] font-medium uppercase tracking-wider text-emerald-300/60">
                Done <span className="text-emerald-300/30">({done.length})</span>
              </h3>
            </div>
            <ul className="space-y-1.5">
              {done.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  peopleById={peopleById}
                  onToggle={() => void handleToggle(item)}
                  onOpen={() => setModalState({ kind: "edit", item })}
                  busy={busy}
                />
              ))}
            </ul>
          </section>
        )}
      </div>

      {modalState && (
        <BucketListItemModal mode={modalState} onClose={() => setModalState(null)} onSaved={invalidate} />
      )}
    </div>
  );
}
