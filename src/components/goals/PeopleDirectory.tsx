"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { api } from "~/trpc/react";
import type { PersonCategory } from "~/lib/api/types";
import PersonModal, { type PersonRow } from "./PersonModal";
import Avatar from "./Avatar";

export type PeopleFilter = { kind: "all" } | { kind: "uncategorized" } | { kind: "group"; groupId: string };

const CATEGORY_LABELS: Record<PersonCategory, string> = {
  to_process: "To Process",
  exploring: "Exploring",
  long_term: "Long-term",
  context_bound: "Context-bound",
};

function CategoryPill({ category }: { category: PersonCategory }) {
  return (
    <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/70">
      {CATEGORY_LABELS[category]}
    </span>
  );
}

interface PeopleDirectoryProps {
  filter?: PeopleFilter;
  onFilterChange?: (filter: PeopleFilter) => void;
}

export default function PeopleDirectory({ filter = { kind: "all" } }: PeopleDirectoryProps) {
  const peopleQuery = api.goals.people.getAll.useQuery({ includeArchived: false });
  const groupsQuery = api.goals.groups.getAll.useQuery();
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [editingPerson, setEditingPerson] = useState<PersonRow | null>(null);
  const [creating, setCreating] = useState(false);

  const refetchPeople = () => {
    void utils.goals.people.getAll.invalidate();
  };

  const groupsById = useMemo(() => {
    const groups = groupsQuery.data ?? [];
    const m = new Map<string, (typeof groups)[number]>();
    for (const g of groups) m.set(g.id, g);
    return m;
  }, [groupsQuery.data]);

  const filtered = useMemo(() => {
    const rows = (peopleQuery.data ?? []) as PersonRow[];
    const q = search.trim().toLowerCase();

    const afterFilter = rows.filter((p) => {
      if (filter.kind === "all") return true;
      if (filter.kind === "uncategorized") return !p.groupIds || p.groupIds.length === 0;
      return p.groupIds?.includes(filter.groupId) ?? false;
    });

    const list = q ? afterFilter.filter((p) => p.name.toLowerCase().includes(q)) : afterFilter;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [peopleQuery.data, search, filter]);

  const headerTitle =
    filter.kind === "all"
      ? "People"
      : filter.kind === "uncategorized"
        ? "Uncategorized"
        : (groupsById.get(filter.groupId)?.name ?? "People");

  const headerHint =
    filter.kind === "all"
      ? "Your directory. Add everyone you want to be intentional about. Tag them into groups for filtering."
      : filter.kind === "uncategorized"
        ? "People not yet tagged to any group."
        : "People in this group.";

  return (
    <div className="h-full overflow-y-auto px-6 py-8 md:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              {filter.kind === "group" && (
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: groupsById.get(filter.groupId)?.color }}
                />
              )}
              <h2 className="truncate text-2xl font-light">{headerTitle}</h2>
            </div>
            <p className="mt-1 text-sm text-white/60">{headerHint}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 rounded-lg border border-white/20 bg-white px-4 py-2 text-sm text-black transition-all hover:bg-white/90"
            >
              <Plus className="h-4 w-4" />
              Add Person
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="w-full rounded-lg border border-white/20 bg-white/5 py-2 pl-10 pr-4 text-white outline-none transition-all placeholder:text-white/30 focus:border-white/40"
          />
        </div>

        {/* List */}
        {peopleQuery.isLoading ? (
          <p className="text-sm text-white/40">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
            <p className="text-white/50">
              {search
                ? "No matches."
                : filter.kind === "all"
                  ? "No people yet. Add the first person to start your directory."
                  : "No people in this view yet."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setEditingPerson(p)}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left transition-all hover:bg-white/5"
                >
                  <Avatar name={p.name} emoji={p.emoji} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-white">{p.name}</span>
                      <CategoryPill category={p.category} />
                      {p.groupIds?.map((gid) => {
                        const g = groupsById.get(gid);
                        if (!g) return null;
                        return (
                          <span
                            key={gid}
                            className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60"
                          >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: g.color }} />
                            {g.name}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(editingPerson !== null || creating) && (
        <PersonModal
          person={editingPerson}
          onClose={() => {
            setEditingPerson(null);
            setCreating(false);
          }}
          onSaved={refetchPeople}
        />
      )}
    </div>
  );
}
