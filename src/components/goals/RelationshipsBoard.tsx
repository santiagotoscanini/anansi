"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import toast from "react-hot-toast";
import { api } from "~/trpc/react";
import type { PersonCategory } from "~/lib/api/types";
import PersonModal, { type PersonRow } from "./PersonModal";
import Avatar from "./Avatar";

type Column = {
  id: PersonCategory;
  label: string;
  hint: string;
};

// Ordered to match the natural arc of a relationship: new people enter via
// Exploring, settle into either Context-bound (handled well, not deepening)
// or Long-term (the deepest connections), and only fall into To Process
// when something specifically needs repair, release, or ending.
const COLUMNS: Column[] = [
  { id: "exploring", label: "Exploring", hint: "New, undecided. Each has a decide-by date." },
  { id: "context_bound", label: "Context-bound", hint: "Handle well, but not deepening." },
  { id: "long_term", label: "Long-term", hint: "Family, closest friends. Erode through neglect, not drama." },
  { id: "to_process", label: "To Process", hint: "Something to fix — repair, release, or end." },
];

function isOverdue(d: Date | null | undefined): boolean {
  if (!d) return false;
  return new Date(d).getTime() < Date.now();
}

function PersonCard({
  person,
  onClick,
  isDragging = false,
}: {
  person: PersonRow;
  onClick?: () => void;
  isDragging?: boolean;
}) {
  const overdue = person.category === "exploring" && isOverdue(person.decideBy);
  return (
    <div
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
        isDragging
          ? "border-[var(--hairline-2)] bg-[var(--paper)] shadow-2xl"
          : "cursor-grab border-[var(--hairline)] bg-[var(--vellum)] hover:border-[var(--hairline-2)] hover:bg-[var(--vellum)] active:cursor-grabbing"
      }`}
    >
      <Avatar name={person.name} emoji={person.emoji} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-[var(--ink)]">{person.name}</span>
          {overdue && (
            <span className="shrink-0 rounded-full border border-[var(--amber)] bg-[var(--amber-soft)] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--amber)]">
              overdue
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DraggableCard({ person, onClick }: { person: PersonRow; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: person.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={isDragging ? "opacity-30" : ""}
      onClick={(e) => {
        // Only fire click if we didn't drag (dnd-kit suppresses it naturally)
        if (!isDragging) onClick();
        e.stopPropagation();
      }}
    >
      <PersonCard person={person} />
    </div>
  );
}

function DroppableColumn({
  column,
  people,
  onCardClick,
}: {
  column: Column;
  people: PersonRow[];
  onCardClick: (p: PersonRow) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <section
      ref={setNodeRef}
      className={`flex min-w-0 flex-col rounded-xl border bg-[var(--vellum)] transition-colors ${
        isOver ? "border-[var(--hairline-2)] bg-[var(--vellum)]" : "border-[var(--hairline)]"
      }`}
    >
      <div className="flex h-20 flex-col justify-start border-b border-[var(--hairline)] px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-[var(--ink)]">{column.label}</h3>
          <span className="rounded-full bg-[var(--vellum)] px-2 py-0.5 text-xs text-[var(--ink-2)]">
            {people.length}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-[var(--ink-3)]">{column.hint}</p>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        {people.length === 0 ? (
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-[var(--hairline)] text-xs text-[var(--ink-4)]">
            Drop here
          </div>
        ) : (
          people.map((p) => <DraggableCard key={p.id} person={p} onClick={() => onCardClick(p)} />)
        )}
      </div>
    </section>
  );
}

export default function RelationshipsBoard() {
  const utils = api.useUtils();
  const getAllInput = { includeArchived: false };
  const peopleQuery = api.goals.people.getAll.useQuery(getAllInput);
  const setCategoryMutation = api.goals.people.setCategory.useMutation({
    // Optimistic update — avoids the post-drop flash where the card snaps back to
    // its source column while waiting for the mutation to resolve.
    onMutate: async (vars) => {
      await utils.goals.people.getAll.cancel(getAllInput);
      const prev = utils.goals.people.getAll.getData(getAllInput);
      utils.goals.people.getAll.setData(getAllInput, (old) => {
        if (!old) return old;
        return old.map((p) =>
          p.id === vars.id ? { ...p, category: vars.category, boardOrder: vars.boardOrder ?? 0 } : p,
        );
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.goals.people.getAll.setData(getAllInput, ctx.prev);
      toast.error("Failed to move");
    },
    onSettled: () => {
      void utils.goals.people.getAll.invalidate();
    },
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingPerson, setEditingPerson] = useState<PersonRow | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const { byColumn, flatById } = useMemo(() => {
    const rows = (peopleQuery.data ?? []) as PersonRow[];
    const byColumn: Record<Column["id"], PersonRow[]> = {
      to_process: [],
      exploring: [],
      long_term: [],
      context_bound: [],
    };
    const flatById: Record<string, PersonRow> = {};
    for (const p of rows) {
      flatById[p.id] = p;
      byColumn[p.category].push(p);
    }
    for (const col of Object.keys(byColumn) as Column["id"][]) {
      byColumn[col].sort((a, b) => a.boardOrder - b.boardOrder || a.name.localeCompare(b.name));
    }
    return { byColumn, flatById };
  }, [peopleQuery.data]);

  const activePerson = activeId ? flatById[activeId] : null;

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    const personId = String(e.active.id);
    const targetColumn = e.over.id as Column["id"];
    const person = flatById[personId];
    if (!person) return;
    if (person.category === targetColumn) return;

    setCategoryMutation.mutate({ id: personId, category: targetColumn, boardOrder: 0 });
  };

  const refetch = () => {
    void utils.goals.people.getAll.invalidate();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ background: "var(--paper)" }}>
      <header className="shrink-0 px-6 pb-7 pt-10 md:px-12" style={{ borderBottom: "1px solid var(--hairline)" }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.08em",
            color: "var(--ink-3)",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Connections · relationships
        </div>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 44,
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
            color: "var(--ink)",
          }}
        >
          Who&apos;s <span className="brand-em">close,</span> who&apos;s drifting.
        </h1>
        <p
          className="mt-3 max-w-2xl"
          style={{
            fontFamily: "var(--font-text)",
            fontStyle: "italic",
            fontSize: 17,
            color: "var(--ink-2)",
            lineHeight: 1.4,
          }}
        >
          Four columns. Move people between them as your reality shifts. Exploring people have a decide-by date — a
          quiet reminder, not a clock.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 gap-4 px-6 pb-8 sm:grid-cols-2 md:px-8 xl:grid-cols-4">
            {COLUMNS.map((col) => (
              <DroppableColumn key={col.id} column={col} people={byColumn[col.id]} onCardClick={setEditingPerson} />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {activePerson ? <PersonCard person={activePerson} isDragging /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      {editingPerson && <PersonModal person={editingPerson} onClose={() => setEditingPerson(null)} onSaved={refetch} />}
    </div>
  );
}
