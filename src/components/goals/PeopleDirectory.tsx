"use client";

import { useMemo, useState } from "react";
import { Check, CheckSquare, Pencil, Plus, Search, Square, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "~/trpc/react";
import type { PersonCategory } from "~/lib/api/types";
import PersonModal, { type PersonRow } from "./PersonModal";
import Avatar from "./Avatar";
import ColorPicker from "./ColorPicker";
import GoalModal from "./GoalModal";
import { isEmojiUrl } from "~/lib/emoji-utils";
import { formatScheduledShort } from "~/lib/horizon-period";

export type PeopleFilter = { kind: "all" } | { kind: "uncategorized" } | { kind: "group"; groupId: string };

const CATEGORY_LABELS: Record<PersonCategory, string> = {
  to_process: "To Process",
  exploring: "Exploring",
  long_term: "Long-term",
  context_bound: "Context-bound",
};

function CategoryPill({ category }: { category: PersonCategory }) {
  return (
    <span className="rounded-full border border-[var(--hairline)] bg-[var(--vellum)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--ink-2)]">
      {CATEGORY_LABELS[category]}
    </span>
  );
}

interface PeopleDirectoryProps {
  filter?: PeopleFilter;
  onFilterChange?: (filter: PeopleFilter) => void;
}

export default function PeopleDirectory({ filter = { kind: "all" }, onFilterChange }: PeopleDirectoryProps) {
  const peopleQuery = api.goals.people.getAll.useQuery({ includeArchived: false });
  const groupsQuery = api.goals.groups.getAll.useQuery();
  const groupTasksQuery = api.goals.groups.getTasks.useQuery(
    { groupId: filter.kind === "group" ? filter.groupId : "" },
    { enabled: filter.kind === "group" },
  );
  const updateGroupMutation = api.goals.groups.update.useMutation();
  const deleteGroupMutation = api.goals.groups.delete.useMutation();
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [editingPerson, setEditingPerson] = useState<PersonRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupColor, setEditGroupColor] = useState("#60a5fa");
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);

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

  const activeGroup = filter.kind === "group" ? groupsById.get(filter.groupId) : undefined;
  const editingGroup = activeGroup ? editingGroupId === activeGroup.id : false;

  const startEditGroup = () => {
    if (!activeGroup) return;
    setEditGroupName(activeGroup.name);
    setEditGroupColor(activeGroup.color);
    setEditingGroupId(activeGroup.id);
  };

  const cancelEditGroup = () => setEditingGroupId(null);

  const submitEditGroup = async () => {
    if (!activeGroup || !editGroupName.trim()) return;
    try {
      await updateGroupMutation.mutateAsync({
        id: activeGroup.id,
        name: editGroupName.trim(),
        color: editGroupColor,
      });
      await utils.goals.groups.getAll.invalidate();
      setEditingGroupId(null);
      toast.success("Group updated");
    } catch {
      toast.error("Failed to update group");
    }
  };

  const handleDeleteGroup = async () => {
    if (!activeGroup) return;
    if (!confirm(`Delete group "${activeGroup.name}"? People stay, but their membership in this group is removed.`))
      return;
    const id = activeGroup.id;
    try {
      await deleteGroupMutation.mutateAsync({ id });
      await Promise.all([utils.goals.groups.getAll.invalidate(), utils.goals.people.getAll.invalidate()]);
      onFilterChange?.({ kind: "all" });
      toast.success("Group deleted");
    } catch {
      toast.error("Failed to delete group");
    }
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-8 md:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              {activeGroup ? (
                editingGroup ? (
                  <ColorPicker value={editGroupColor} onChange={setEditGroupColor} size="md" />
                ) : (
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: activeGroup.color }} />
                )
              ) : null}
              {activeGroup && editingGroup ? (
                <input
                  type="text"
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitEditGroup();
                    if (e.key === "Escape") cancelEditGroup();
                  }}
                  className="min-w-0 max-w-xs border-b border-[var(--hairline-2)] bg-transparent pb-0.5 text-2xl font-light text-[var(--ink)] outline-none focus:border-[var(--hairline-2)]"
                  autoFocus
                />
              ) : (
                <h2
                  className="truncate"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 34,
                    lineHeight: 1.2,
                    letterSpacing: "-0.02em",
                    color: "var(--ink)",
                  }}
                >
                  {headerTitle}
                </h2>
              )}
              {activeGroup && (
                <div className="flex items-center gap-1">
                  {editingGroup ? (
                    <>
                      <button
                        onClick={() => void submitEditGroup()}
                        title="Save"
                        className="rounded p-1 text-[var(--moss)] transition-all hover:bg-[var(--moss-soft)]"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={cancelEditGroup}
                        title="Cancel"
                        className="rounded p-1 text-[var(--ink-3)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={startEditGroup}
                        title="Rename group"
                        className="rounded p-1 text-[var(--ink-3)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => void handleDeleteGroup()}
                        title="Delete group"
                        className="rounded p-1 text-[var(--ink-3)] transition-all hover:bg-[var(--rust-soft)] hover:text-[var(--rust)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <p className="mt-1 text-sm text-[var(--ink-2)]">{headerHint}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 rounded-lg border border-[var(--hairline-2)] bg-[var(--paper)] px-4 py-2 text-sm text-black transition-all hover:bg-[var(--paper)]"
            >
              <Plus className="h-4 w-4" />
              Add Person
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="w-full rounded-lg border border-[var(--hairline-2)] bg-[var(--vellum)] py-2 pl-10 pr-4 text-[var(--ink)] outline-none transition-all placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)]"
          />
        </div>

        {/* Card grid — 3 columns at desktop. Matches the design's
            reflection-surface treatment: avatar lockup at top, italic
            "what I'd write about them" note, and a per-row category pill
            + group tags at the bottom for filtering context. */}
        {peopleQuery.isLoading ? (
          <p className="text-sm text-[var(--ink-3)]">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--hairline)] bg-[var(--vellum)] p-10 text-center">
            <p className="text-[var(--ink-3)]">
              {search
                ? "No matches."
                : filter.kind === "all"
                  ? "No people yet. Add the first person to start your directory."
                  : "No people in this view yet."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => {
              const note = p.appreciation ?? p.myNeeds ?? p.legacyMessage ?? p.selfReflection ?? null;
              return (
                <button
                  key={p.id}
                  onClick={() => setEditingPerson(p)}
                  className="flex flex-col text-left transition-all"
                  style={{
                    background: "var(--canvas)",
                    border: "1px solid var(--hairline)",
                    borderRadius: 14,
                    padding: 20,
                    boxShadow: "var(--shadow-sm)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--hairline-2)";
                    e.currentTarget.style.boxShadow = "var(--shadow-md)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--hairline)";
                    e.currentTarget.style.boxShadow = "var(--shadow-sm)";
                  }}
                >
                  <div className="mb-4 flex items-center gap-3">
                    <Avatar name={p.name} emoji={p.emoji} size="md" shape="circle" />
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate"
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 18,
                          lineHeight: 1.2,
                          color: "var(--ink)",
                        }}
                      >
                        {p.name}
                      </div>
                      <CategoryPill category={p.category} />
                    </div>
                  </div>

                  <p
                    className="line-clamp-3"
                    style={{
                      fontFamily: "var(--font-text)",
                      fontStyle: "italic",
                      fontSize: 14,
                      color: note ? "var(--ink-2)" : "var(--ink-4)",
                      lineHeight: 1.5,
                      minHeight: 42,
                    }}
                  >
                    {note ?? "Add a note about who they are to you…"}
                  </p>

                  {(p.groupIds?.length ?? 0) > 0 && (
                    <div
                      className="mt-4 flex flex-wrap gap-1.5 pt-3"
                      style={{ borderTop: "1px solid var(--hairline)" }}
                    >
                      {p.groupIds?.map((gid) => {
                        const g = groupsById.get(gid);
                        if (!g) return null;
                        return (
                          <span
                            key={gid}
                            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px]"
                            style={{
                              background: "var(--vellum)",
                              color: "var(--ink-2)",
                              letterSpacing: "0.02em",
                            }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: g.color }} />
                            {g.name}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Tasks tagged with this group — only on the group filter view.
            Sits below the people list so the group page is "everything in
            this group, in one place." Click a task to open its parent goal. */}
        {filter.kind === "group" && (
          <div className="space-y-2 pt-2">
            <div className="flex items-baseline justify-between px-1">
              <h3 className="text-sm font-medium text-[var(--ink)]">Tasks</h3>
              <span className="text-xs text-[var(--ink-3)]">{groupTasksQuery.data?.length ?? 0}</span>
            </div>
            {groupTasksQuery.isLoading ? (
              <p className="px-1 text-sm text-[var(--ink-3)]">Loading…</p>
            ) : (groupTasksQuery.data?.length ?? 0) === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--hairline)] bg-[var(--vellum)] p-6 text-center">
                <p className="text-sm text-[var(--ink-3)]">No tasks tagged with this group yet.</p>
                <p className="mt-1 text-xs text-[var(--ink-4)]">
                  Tag a task: open a goal → click the tag icon on a task row.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--hairline)] overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--vellum)]">
                {groupTasksQuery.data?.map((t) => (
                  <li key={t.taskId}>
                    <button
                      onClick={() => setOpenGoalId(t.goalId)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-all hover:bg-[var(--vellum)]"
                    >
                      {t.completed ? (
                        <CheckSquare className="h-4 w-4 shrink-0 text-[var(--moss)]" />
                      ) : (
                        <Square className="h-4 w-4 shrink-0 text-[var(--ink-4)]" />
                      )}
                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${
                          t.completed ? "text-[var(--ink-3)] line-through" : "text-[var(--ink)]"
                        }`}
                      >
                        {t.taskTitle}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-[var(--vellum)] px-2 py-0.5 text-[11px] text-[var(--ink-2)]">
                        {t.goalEmoji ? (
                          isEmojiUrl(t.goalEmoji) ? null : (
                            <span className="leading-none">{t.goalEmoji}</span>
                          )
                        ) : null}
                        <span className="max-w-[10rem] truncate">{t.goalTitle}</span>
                      </span>
                      {t.scheduledAt ? (
                        <span className="shrink-0 text-[11px] text-[var(--ink-3)]">
                          {formatScheduledShort(new Date(t.scheduledAt))}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
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

      {openGoalId && <GoalModal goalId={openGoalId} onClose={() => setOpenGoalId(null)} />}
    </div>
  );
}
