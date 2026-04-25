"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, GripVertical, X, Check } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api, type RouterOutputs } from "~/trpc/react";
import toast from "react-hot-toast";

type LibraryItem = RouterOutputs["goals"]["trackingItems"]["list"][number];

interface SyncDefaultEditorProps {
  onClose: () => void;
}

// "Default sync items" — the set of tracking items that auto-fill a new
// weekly sync. There's exactly one default per user. Multi-default support
// (per-cadence — daily/weekly/monthly each with its own list) is parked in
// todo.md; the underlying sync_templates table can carry it later without a
// schema migration. For now this UI manages a single row.
export default function SyncDefaultEditor({ onClose }: SyncDefaultEditorProps) {
  const utils = api.useUtils();
  const templatesQuery = api.goals.syncTemplates.list.useQuery();
  const itemsQuery = api.goals.trackingItems.list.useQuery({});

  const createMutation = api.goals.syncTemplates.create.useMutation({
    onSuccess: () => utils.goals.syncTemplates.list.invalidate(),
  });
  const setItemsMutation = api.goals.syncTemplates.setItems.useMutation({
    onSuccess: () => utils.goals.syncTemplates.list.invalidate(),
  });

  const allItems = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);

  // Resolve the user's single default. If the user has any rows, pick the one
  // marked is_default (or the first as a safety fallback). If none, autocreate.
  const defaultTemplate = useMemo(() => templates.find((t) => t.isDefault) ?? templates[0] ?? null, [templates]);

  // Auto-create the default row on first open. Guarded by a ref so we don't
  // fan out into a flood of inserts on retries — the flip from "no templates"
  // to "one template" happens on the network round-trip, not synchronously.
  const autoCreatedRef = useRef(false);
  useEffect(() => {
    if (!templatesQuery.isLoading && templates.length === 0 && !autoCreatedRef.current && !createMutation.isPending) {
      autoCreatedRef.current = true;
      createMutation.mutate({ name: "Default", isDefault: true });
    }
  }, [templatesQuery.isLoading, templates.length, createMutation]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex h-[80vh] max-h-[720px] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 text-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Default sync items</h2>
            <p className="text-xs text-white/50">
              These auto-fill every new weekly sync. Edit anytime — changes only affect future syncs.
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-white/70 hover:bg-white/10" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>

        {defaultTemplate ? (
          <DefaultEditor
            key={defaultTemplate.id}
            template={defaultTemplate}
            allItems={allItems}
            onSetItems={async (items) => {
              try {
                await setItemsMutation.mutateAsync({ templateId: defaultTemplate.id, items });
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to save");
              }
            }}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-white/50">
            {templatesQuery.isLoading || createMutation.isPending ? "Loading…" : "Setting up…"}
          </div>
        )}
      </div>
    </div>
  );
}

interface DefaultEditorProps {
  template: NonNullable<RouterOutputs["goals"]["syncTemplates"]["list"][number]>;
  allItems: LibraryItem[];
  onSetItems: (items: { trackingItemId: string; orderIdx: number }[]) => Promise<void>;
}

function DefaultEditor({ template, allItems, onSetItems }: DefaultEditorProps) {
  // Local working copy of the item order. Persists on every change via
  // onSetItems (replace-set). The parent passes key={template.id} so this
  // component remounts cleanly when the underlying default changes.
  const [orderedItemIds, setOrderedItemIds] = useState<string[]>(() =>
    [...template.items].sort((a, b) => a.orderIdx - b.orderIdx).map((i) => i.trackingItemId),
  );
  const [picking, setPicking] = useState(false);

  const itemById = useMemo(() => {
    const m = new Map<string, LibraryItem>();
    for (const i of allItems) m.set(i.id, i);
    return m;
  }, [allItems]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const persist = (next: string[]) => {
    setOrderedItemIds(next);
    void onSetItems(next.map((trackingItemId, orderIdx) => ({ trackingItemId, orderIdx })));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedItemIds.indexOf(active.id as string);
    const newIndex = orderedItemIds.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;
    persist(arrayMove(orderedItemIds, oldIndex, newIndex));
  };

  const remove = (trackingItemId: string) => {
    persist(orderedItemIds.filter((id) => id !== trackingItemId));
  };

  const add = (trackingItemId: string) => {
    if (orderedItemIds.includes(trackingItemId)) return;
    persist([...orderedItemIds, trackingItemId]);
  };

  const availableToAdd = allItems.filter((i) => !orderedItemIds.includes(i.id));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-6 pt-4">
        <p className="text-sm font-medium text-white/80">Items</p>
        <button
          onClick={() => setPicking((p) => !p)}
          className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/15"
        >
          <Plus className="h-3.5 w-3.5" />
          Add item
        </button>
      </div>

      {picking && (
        <div className="mx-6 mt-3 max-h-48 overflow-y-auto rounded-md border border-white/10 bg-white/5 p-2">
          {availableToAdd.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-white/50">
              All your tracking items are already in the default.
            </p>
          ) : (
            <ul className="space-y-1">
              {availableToAdd.map((it) => (
                <li key={it.id}>
                  <button
                    onClick={() => add(it.id)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm text-white/80 hover:bg-white/10"
                  >
                    <span className="truncate">{it.title}</span>
                    <Check className="h-3.5 w-3.5 text-emerald-300 opacity-0 group-hover:opacity-100" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {orderedItemIds.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-white/60">
            No items yet. Click <span className="font-medium text-white">Add item</span> to start — these will auto-fill
            every new weekly sync.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedItemIds} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1">
                {orderedItemIds.map((id) => {
                  const it = itemById.get(id);
                  if (!it) return null;
                  return <SortableRow key={id} id={id} title={it.title} onRemove={() => remove(id)} />;
                })}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

function SortableRow({ id, title, onRemove }: { id: string; title: string; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  } as const;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-2 rounded-md border border-white/10 bg-white/5 p-2"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/70 active:cursor-grabbing"
        aria-label="Drag handle"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
      <button
        onClick={onRemove}
        className="rounded p-1 text-white/40 opacity-100 hover:bg-rose-500/20 hover:text-rose-200 md:opacity-0 md:group-hover:opacity-100"
        aria-label="Remove from default"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
