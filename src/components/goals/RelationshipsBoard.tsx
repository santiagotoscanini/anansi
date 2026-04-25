"use client";

import { useEffect, useMemo, useState } from "react";
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
import { UserCircle2 } from "lucide-react";
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

const COLUMNS: Column[] = [
  { id: "to_process", label: "To Process", hint: "Unfinished — repair, release, or end. Card details say which." },
  { id: "exploring", label: "Exploring", hint: "New, undecided. Each has a decide-by date." },
  { id: "long_term", label: "Long-term", hint: "Family, closest friends. Erode through neglect, not drama." },
  { id: "context_bound", label: "Context-bound", hint: "People to handle well but aren't deepening." },
];

function isOverdue(d: Date | null | undefined): boolean {
  if (!d) return false;
  return new Date(d).getTime() < Date.now();
}

function SelfCard() {
  const utils = api.useUtils();
  const query = api.goals.self.get.useQuery();
  const update = api.goals.self.update.useMutation({
    onSuccess: () => {
      void utils.goals.self.get.invalidate();
    },
  });

  const [identityNotes, setIdentityNotes] = useState("");
  const [patterns, setPatterns] = useState("");
  const [currentWork, setCurrentWork] = useState("");
  const [hydrated, setHydrated] = useState(false);

  if (!hydrated && query.data !== undefined) {
    setHydrated(true);
    if (query.data) {
      setIdentityNotes(query.data.identityNotes ?? "");
      setPatterns(query.data.patterns ?? "");
      setCurrentWork(query.data.currentWork ?? "");
    }
  }

  const updateMutateAsync = update.mutateAsync;
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      void updateMutateAsync({
        identityNotes: identityNotes || null,
        patterns: patterns || null,
        currentWork: currentWork || null,
      });
    }, 800);
    return () => clearTimeout(t);
  }, [identityNotes, patterns, currentWork, hydrated, updateMutateAsync]);

  const inputClass =
    "w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white outline-none transition-all placeholder:text-white/30 focus:border-white/40 resize-none";

  return (
    <div className="rounded-xl border border-white/20 bg-gradient-to-br from-white/10 to-white/[0.02] p-6">
      <div className="mb-4 flex items-center gap-3">
        <UserCircle2 className="h-6 w-6 text-white/70" />
        <div>
          <h3 className="text-lg font-light">Self</h3>
          <p className="text-xs text-white/40">
            The substrate. Not a card among others — a separate space with different structure.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm text-white/60">Who I am right now</label>
          <textarea
            value={identityNotes}
            onChange={(e) => setIdentityNotes(e.target.value)}
            rows={4}
            placeholder="Identity notes..."
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-white/60">Patterns I see in myself</label>
          <textarea
            value={patterns}
            onChange={(e) => setPatterns(e.target.value)}
            rows={4}
            placeholder="How I show up across relationships..."
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-white/60">Current work on myself</label>
          <textarea
            value={currentWork}
            onChange={(e) => setCurrentWork(e.target.value)}
            rows={4}
            placeholder="What I'm working on..."
            className={inputClass}
          />
        </div>
      </div>
    </div>
  );
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
          ? "border-white/40 bg-black shadow-2xl"
          : "cursor-grab border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10 active:cursor-grabbing"
      }`}
    >
      <Avatar name={person.name} emoji={person.emoji} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-white">{person.name}</span>
          {overdue && (
            <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber-300">
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
      className={`flex w-72 shrink-0 flex-col rounded-xl border bg-white/[0.02] transition-colors ${
        isOver ? "border-white/40 bg-white/[0.06]" : "border-white/10"
      }`}
    >
      <div className="border-b border-white/5 px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">{column.label}</h3>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">{people.length}</span>
        </div>
        <p className="mt-1 text-xs text-white/40">{column.hint}</p>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        {people.length === 0 ? (
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-white/10 text-xs text-white/30">
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
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-6 pb-4 pt-8 md:px-8">
        <h2 className="text-2xl font-light">Relationships</h2>
        <p className="mt-1 max-w-3xl text-sm text-white/60">
          Drag people between columns as your relationships change. Monthly pass: move cards, retire completed ones. The
          system is a map, not an archive.
        </p>
      </div>

      <div className="shrink-0 px-6 pb-4 md:px-8">
        <SelfCard />
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 px-6 pb-8 md:px-8">
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
