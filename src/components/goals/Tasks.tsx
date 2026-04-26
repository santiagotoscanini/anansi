"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { CheckSquare, Search, Square } from "lucide-react";
import { useGoals } from "~/contexts/GoalsContext";
import { isEmojiUrl } from "~/lib/emoji-utils";
import { formatScheduledShort } from "~/lib/horizon-period";
import { api } from "~/trpc/react";
import TaskModal from "./TaskModal";
import Avatar from "./Avatar";

type FilterMode = "open" | "all" | "completed";

// Tasks tab — the cross-goal task editor. Tasks are normally created/edited
// inside their parent goal's modal, but the graph view makes that fiddly when
// a user just wants to scan and tweak tasks across many goals. This tab gives
// a flat searchable list, grouped by goal, that opens the same TaskModal on
// click for full-fidelity editing (description, emoji, deadline, referents,
// groups). Read-side data flows through the existing GoalsContext (no new
// router); the modal handles the mutation.
export default function Tasks() {
  const { goals } = useGoals();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("open");
  const [open, setOpen] = useState<{ goalId: string; taskId: string } | null>(null);

  const peopleData = api.goals.people.getAll.useQuery({ includeArchived: false }).data;
  const peopleById = useMemo(() => {
    const m = new Map<string, NonNullable<typeof peopleData>[number]>();
    for (const p of peopleData ?? []) m.set(p.id, p);
    return m;
  }, [peopleData]);

  const groupsData = api.goals.groups.getAll.useQuery().data;
  const groupsById = useMemo(() => {
    const m = new Map<string, NonNullable<typeof groupsData>[number]>();
    for (const g of groupsData ?? []) m.set(g.id, g);
    return m;
  }, [groupsData]);

  const q = search.trim().toLowerCase();
  const grouped = useMemo(() => {
    const out: { goal: (typeof goals)[number]; tasks: (typeof goals)[number]["tasks"] }[] = [];
    for (const g of goals) {
      const filtered = g.tasks.filter((t) => {
        if (filter === "open" && t.completed) return false;
        if (filter === "completed" && !t.completed) return false;
        if (!q) return true;
        const hay = `${t.title} ${t.description ?? ""}`.toLowerCase();
        return hay.includes(q);
      });
      if (filtered.length > 0) out.push({ goal: g, tasks: filtered });
    }
    // Goals with the most pending work first — useful when the list is long.
    out.sort((a, b) => b.tasks.length - a.tasks.length);
    return out;
  }, [goals, q, filter]);

  const totalCount = grouped.reduce((sum, g) => sum + g.tasks.length, 0);

  return (
    <div className="h-full overflow-y-auto px-6 py-8 md:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-light tracking-tight">Tasks</h2>
            <p className="mt-1 text-sm text-white/60">
              Every task across your goals. Click any one to edit details — description, emoji, deadline, referents,
              groups.
            </p>
          </div>
          <div className="flex shrink-0 gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5 text-xs">
            {(["open", "all", "completed"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilter(mode)}
                className={`rounded-md px-3 py-1.5 capitalize transition-all ${
                  filter === mode ? "bg-white/10 text-white" : "text-white/50 hover:text-white"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="w-full rounded-lg border border-white/20 bg-white/5 py-2 pl-10 pr-4 text-white outline-none transition-all placeholder:text-white/30 focus:border-white/40"
          />
        </div>

        {/* Empty state */}
        {totalCount === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
            <p className="text-white/50">
              {q
                ? "No tasks match your search."
                : filter === "completed"
                  ? "No completed tasks yet."
                  : filter === "open"
                    ? "No open tasks. Add one inside any goal."
                    : "No tasks yet."}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(({ goal, tasks }) => (
              <section key={goal.id}>
                <div className="mb-2 flex items-baseline gap-2 px-1">
                  {goal.emoji ? (
                    isEmojiUrl(goal.emoji) ? (
                      <Image
                        src={goal.emoji}
                        alt=""
                        width={16}
                        height={16}
                        className="h-4 w-4 shrink-0 object-contain"
                      />
                    ) : (
                      <span className="text-base leading-none">{goal.emoji}</span>
                    )
                  ) : null}
                  <h3 className="truncate text-sm font-medium text-white/80">{goal.title}</h3>
                  <span className="text-xs text-white/40">{tasks.length}</span>
                </div>
                <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
                  {tasks.map((t) => {
                    const referents = (t.referentIds ?? [])
                      .map((id) => peopleById.get(id))
                      .filter((p): p is NonNullable<typeof p> => !!p);
                    const taskGroups = (t.groupIds ?? [])
                      .map((id) => groupsById.get(id))
                      .filter((g): g is NonNullable<typeof g> => !!g);
                    return (
                      <li key={t.id}>
                        <button
                          onClick={() => setOpen({ goalId: goal.id, taskId: t.id })}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-all hover:bg-white/5"
                        >
                          {t.completed ? (
                            <CheckSquare className="h-4 w-4 shrink-0 text-emerald-500" />
                          ) : (
                            <Square className="h-4 w-4 shrink-0 text-white/30" />
                          )}

                          {/* Task emoji — distinct from the goal's */}
                          {t.emoji ? (
                            isEmojiUrl(t.emoji) ? (
                              <Image
                                src={t.emoji}
                                alt=""
                                width={16}
                                height={16}
                                className="h-4 w-4 shrink-0 object-contain"
                              />
                            ) : (
                              <span className="shrink-0 text-base leading-none">{t.emoji}</span>
                            )
                          ) : null}

                          <div className="min-w-0 flex-1">
                            <div
                              className={`truncate text-sm ${
                                t.completed ? "text-white/40 line-through" : "text-white/90"
                              }`}
                            >
                              {t.title}
                            </div>
                            {t.description && (
                              <div className="mt-0.5 truncate text-xs text-white/40">{t.description}</div>
                            )}
                          </div>

                          {/* Group dots */}
                          {taskGroups.length > 0 && (
                            <div className="hidden items-center gap-0.5 sm:flex">
                              {taskGroups.slice(0, 4).map((g) => (
                                <span
                                  key={g.id}
                                  title={g.name}
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: g.color }}
                                />
                              ))}
                              {taskGroups.length > 4 && (
                                <span className="ml-0.5 text-[9px] text-white/60">+{taskGroups.length - 4}</span>
                              )}
                            </div>
                          )}

                          {/* Referent avatars */}
                          {referents.length > 0 && (
                            <div className="hidden items-center sm:flex">
                              {referents.slice(0, 3).map((p, i) => (
                                <div
                                  key={p.id}
                                  style={{ marginLeft: i === 0 ? 0 : -6, zIndex: referents.length - i }}
                                  className="relative"
                                >
                                  <Avatar
                                    name={p.name}
                                    emoji={p.emoji}
                                    size="xs"
                                    shape="circle"
                                    className="ring-2 ring-zinc-950"
                                  />
                                </div>
                              ))}
                              {referents.length > 3 && (
                                <span className="-ml-1.5 rounded-full border border-white/10 bg-white/10 px-1 text-[9px] text-white/60">
                                  +{referents.length - 3}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Deadline */}
                          {t.scheduledAt ? (
                            <span className="shrink-0 text-[11px] text-white/40">
                              {formatScheduledShort(new Date(t.scheduledAt))}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {open && <TaskModal key={open.taskId} goalId={open.goalId} taskId={open.taskId} onClose={() => setOpen(null)} />}
    </div>
  );
}
