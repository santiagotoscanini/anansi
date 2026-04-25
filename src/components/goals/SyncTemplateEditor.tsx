"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, GripVertical, Star, X, Check } from "lucide-react";
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

type TemplateRow = RouterOutputs["goals"]["syncTemplates"]["list"][number];
type LibraryItem = RouterOutputs["goals"]["trackingItems"]["list"][number];

interface SyncTemplateEditorProps {
  onClose: () => void;
}

// Sync template manager — modal entry point reachable from the Sync tab header.
// Each template is a named bundle of tracking items used to instantiate weekly
// syncs. Setting a template as default makes new syncs auto-snapshot from it.
export default function SyncTemplateEditor({ onClose }: SyncTemplateEditorProps) {
  const utils = api.useUtils();
  const templatesQuery = api.goals.syncTemplates.list.useQuery();
  const itemsQuery = api.goals.trackingItems.list.useQuery({});

  const createMutation = api.goals.syncTemplates.create.useMutation({
    onSuccess: () => utils.goals.syncTemplates.list.invalidate(),
  });
  const updateMutation = api.goals.syncTemplates.update.useMutation({
    onSuccess: () => utils.goals.syncTemplates.list.invalidate(),
  });
  const deleteMutation = api.goals.syncTemplates.delete.useMutation({
    onSuccess: () => utils.goals.syncTemplates.list.invalidate(),
  });
  const setItemsMutation = api.goals.syncTemplates.setItems.useMutation({
    onSuccess: () => utils.goals.syncTemplates.list.invalidate(),
  });

  // Stable references so they don't re-trigger memos on every render.
  const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);
  const allItems = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);

  // Selection: which template is being edited.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Derive the actual selection: explicit selectedId wins; fall back to the
  // first template if nothing is selected yet (avoids a cascading
  // setState-in-effect for the default-pick).
  const effectiveSelectedId = selectedId ?? templates[0]?.id ?? null;
  const selected = useMemo(
    () => templates.find((t) => t.id === effectiveSelectedId) ?? null,
    [templates, effectiveSelectedId],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex h-[80vh] max-h-[720px] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 text-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Sync templates</h2>
            <p className="text-xs text-white/50">
              The default template auto-fills new weekly syncs.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-white/70 hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <TemplatesList
            templates={templates}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCreate={async (name) => {
              try {
                const created = await createMutation.mutateAsync({ name });
                setSelectedId(created.id);
                toast.success("Template created");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to create");
              }
            }}
            isCreating={createMutation.isPending}
          />

          <div className="min-w-0 flex-1 border-l border-white/10">
            {selected ? (
              <TemplateDetail
                key={selected.id}
                template={selected}
                allItems={allItems}
                onRename={async (name) => {
                  try {
                    await updateMutation.mutateAsync({ id: selected.id, name });
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed to rename");
                  }
                }}
                onSetDefault={async (isDefault) => {
                  try {
                    await updateMutation.mutateAsync({ id: selected.id, isDefault });
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed");
                  }
                }}
                onDelete={async () => {
                  if (!confirm(`Delete template "${selected.name}"?`)) return;
                  try {
                    await deleteMutation.mutateAsync({ id: selected.id });
                    setSelectedId(null);
                    toast.success("Template deleted");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed to delete");
                  }
                }}
                onSetItems={async (items) => {
                  try {
                    await setItemsMutation.mutateAsync({ templateId: selected.id, items });
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed to save");
                  }
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-white/50">
                {templatesQuery.isLoading
                  ? "Loading…"
                  : "No template selected. Create one in the left panel."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface TemplatesListProps {
  templates: TemplateRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  isCreating: boolean;
}

function TemplatesList({ templates, selectedId, onSelect, onCreate, isCreating }: TemplatesListProps) {
  const [draftName, setDraftName] = useState("");

  const handleCreate = async () => {
    const name = draftName.trim();
    if (!name) return;
    await onCreate(name);
    setDraftName("");
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col border-white/10">
      <div className="border-b border-white/10 p-3">
        <div className="flex gap-2">
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
            }}
            placeholder="New template name"
            className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-sm outline-none focus:border-white/40"
          />
          <button
            onClick={handleCreate}
            disabled={!draftName.trim() || isCreating}
            className="rounded-md bg-emerald-600 px-2 py-1.5 text-sm hover:bg-emerald-500 disabled:opacity-60"
            aria-label="Create template"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {templates.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-white/50">
            No templates yet. Create one above.
          </p>
        ) : (
          <ul className="space-y-1">
            {templates.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => onSelect(t.id)}
                  className={`group flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${
                    selectedId === t.id ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  {t.isDefault && (
                    <Star className="h-3.5 w-3.5 shrink-0 fill-amber-300 text-amber-300" aria-label="Default" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

interface TemplateDetailProps {
  template: TemplateRow;
  allItems: LibraryItem[];
  onRename: (name: string) => Promise<void>;
  onSetDefault: (isDefault: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
  onSetItems: (items: { trackingItemId: string; orderIdx: number }[]) => Promise<void>;
}

function TemplateDetail({
  template,
  allItems,
  onRename,
  onSetDefault,
  onDelete,
  onSetItems,
}: TemplateDetailProps) {
  // Local working copy of the template's items — the order_idx is implicit in
  // array position. Persist on every change via onSetItems (replace-set).
  // The parent passes key={selected.id} so this component remounts when a
  // different template is picked — useState initializers run fresh, no
  // separate reset effect needed.
  const [name, setName] = useState(template.name);
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
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 p-4">
        <div className="flex items-start gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name.trim() && name !== template.name) void onRename(name.trim());
            }}
            className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-sm font-medium outline-none focus:border-white/40"
          />
          <button
            onClick={() => onSetDefault(!template.isDefault)}
            className={`flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs ${
              template.isDefault
                ? "border-amber-300/60 bg-amber-300/15 text-amber-100"
                : "border-white/15 text-white/70 hover:bg-white/10"
            }`}
            title={template.isDefault ? "Default — used for new syncs" : "Mark as default"}
          >
            <Star className={`h-3.5 w-3.5 ${template.isDefault ? "fill-amber-300" : ""}`} />
            Default
          </button>
          <button
            onClick={onDelete}
            className="rounded-md border border-white/15 px-2 py-1.5 text-xs text-rose-200 hover:bg-rose-500/10"
            title="Delete template"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4">
          <h3 className="text-sm font-medium text-white/80">Items in this template</h3>
          <button
            onClick={() => setPicking((p) => !p)}
            className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/15"
          >
            <Plus className="h-3.5 w-3.5" />
            Add item
          </button>
        </div>

        {picking && (
          <div className="mx-4 mt-3 max-h-48 overflow-y-auto rounded-md border border-white/10 bg-white/5 p-2">
            {availableToAdd.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-white/50">
                All your tracking items are already in this template.
              </p>
            ) : (
              <ul className="space-y-1">
                {availableToAdd.map((it) => (
                  <li key={it.id}>
                    <button
                      onClick={() => {
                        add(it.id);
                      }}
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

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {orderedItemIds.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-white/60">
              No items yet. Click <span className="font-medium text-white">Add item</span> to start.
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
        aria-label="Remove from template"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
