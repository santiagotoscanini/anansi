"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { CheckSquare, Search, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGoals } from "~/contexts/GoalsContext";
import { isEmojiUrl } from "~/lib/emoji-utils";
import { formatScheduledShort } from "~/lib/horizon-period";
import { api } from "~/trpc/react";
import TaskModal from "./TaskModal";
import Avatar from "./Avatar";

type FilterMode = "open" | "all" | "completed";

type FilterLabelKey = "tasks.filterOpen" | "tasks.filterAll" | "tasks.filterCompleted";
const FILTER_LABEL_KEYS: Record<FilterMode, FilterLabelKey> = {
  open: "tasks.filterOpen",
  all: "tasks.filterAll",
  completed: "tasks.filterCompleted",
};

// Tasks tab — the cross-goal task editor. Tasks are normally created/edited
// inside their parent goal's modal, but the graph view makes that fiddly when
// a user just wants to scan and tweak tasks across many goals. This tab gives
// a flat searchable list, grouped by goal, that opens the same TaskModal on
// click for full-fidelity editing (description, emoji, deadline, referents,
// groups). Read-side data flows through the existing GoalsContext (no new
// router); the modal handles the mutation.
export default function Tasks() {
  const { t } = useTranslation();
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
      const filtered = g.tasks.filter((task) => {
        if (filter === "open" && task.completed) return false;
        if (filter === "completed" && !task.completed) return false;
        if (!q) return true;
        const hay = `${task.title} ${task.description ?? ""}`.toLowerCase();
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
    <div className="h-full overflow-y-auto" style={{ background: "var(--paper)" }}>
      {/* Warm screen header — eyebrow + display title with brand-em + italic sub */}
      <header
        className="px-6 pb-6 pt-10 md:px-12 md:pb-7 md:pt-12"
        style={{ borderBottom: "1px solid var(--hairline)" }}
      >
        <div className="mx-auto max-w-5xl">
          <div className="min-w-0">
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
              {t("tasks.eyebrowPrefix", { count: totalCount, filter: t(FILTER_LABEL_KEYS[filter]) })}
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
              {t("tasks.titlePre")}
              <span className="brand-em">{t("tasks.titleEm")}</span>
            </h1>
            <p
              className="mt-3 max-w-xl"
              style={{
                fontFamily: "var(--font-text)",
                fontStyle: "italic",
                fontSize: 17,
                color: "var(--ink-2)",
                lineHeight: 1.4,
              }}
            >
              {t("tasks.subtitle")}
            </p>
          </div>
          {/* Toolbar row — search expands on the left, filter pill anchors right. */}
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
            <div
              className="flex h-9 max-w-md flex-1 items-center gap-2 rounded-lg px-3"
              style={{
                background: "var(--canvas)",
                border: "1px solid var(--hairline-2)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--ink-3)" }} />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("tasks.searchPlaceholder")}
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: "var(--ink)" }}
              />
            </div>
            <div
              className="flex gap-1 rounded-full p-1 text-xs"
              style={{ background: "var(--paper-deep)", border: "1px solid var(--hairline)" }}
            >
              {(["open", "all", "completed"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFilter(mode)}
                  className="rounded-full px-3.5 py-1.5 capitalize transition-all"
                  style={{
                    background: filter === mode ? "var(--canvas)" : "transparent",
                    color: filter === mode ? "var(--ink)" : "var(--ink-2)",
                    fontWeight: filter === mode ? 500 : 400,
                    boxShadow: filter === mode ? "var(--shadow-sm)" : "none",
                  }}
                >
                  {t(FILTER_LABEL_KEYS[mode])}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-5 px-6 py-7 md:px-12">
        {/* Empty state */}
        {totalCount === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--hairline)] bg-[var(--vellum)] p-10 text-center">
            <p className="text-[var(--ink-3)]">
              {q
                ? t("tasks.emptyNoMatches")
                : filter === "completed"
                  ? t("tasks.emptyCompleted")
                  : filter === "open"
                    ? t("tasks.emptyOpen")
                    : t("tasks.emptyAll")}
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
                        unoptimized
                        className="h-4 w-4 shrink-0 object-contain"
                      />
                    ) : (
                      <span className="text-base leading-none">{goal.emoji}</span>
                    )
                  ) : null}
                  <h3 className="truncate text-sm font-medium text-[var(--ink)]">{goal.title}</h3>
                  <span className="text-xs text-[var(--ink-3)]">{tasks.length}</span>
                </div>
                <ul className="divide-y divide-[var(--hairline)] overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--vellum)]">
                  {tasks.map((task) => {
                    const referents = (task.referentIds ?? [])
                      .map((id) => peopleById.get(id))
                      .filter((p): p is NonNullable<typeof p> => !!p);
                    const taskGroups = (task.groupIds ?? [])
                      .map((id) => groupsById.get(id))
                      .filter((g): g is NonNullable<typeof g> => !!g);
                    return (
                      <li key={task.id}>
                        <button
                          onClick={() => setOpen({ goalId: goal.id, taskId: task.id })}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-all hover:bg-[var(--vellum)]"
                        >
                          {task.completed ? (
                            <CheckSquare className="h-4 w-4 shrink-0 text-[var(--moss)]" />
                          ) : (
                            <Square className="h-4 w-4 shrink-0 text-[var(--ink-4)]" />
                          )}

                          {/* Task emoji — distinct from the goal's */}
                          {task.emoji ? (
                            isEmojiUrl(task.emoji) ? (
                              <Image
                                src={task.emoji}
                                alt=""
                                width={16}
                                height={16}
                                unoptimized
                                className="h-4 w-4 shrink-0 object-contain"
                              />
                            ) : (
                              <span className="shrink-0 text-base leading-none">{task.emoji}</span>
                            )
                          ) : null}

                          <div className="min-w-0 flex-1">
                            <div
                              className={`truncate text-sm ${
                                task.completed ? "text-[var(--ink-3)] line-through" : "text-[var(--ink)]"
                              }`}
                            >
                              {task.title}
                            </div>
                            {task.description && (
                              <div className="mt-0.5 truncate text-xs text-[var(--ink-3)]">{task.description}</div>
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
                                <span className="ml-0.5 text-[9px] text-[var(--ink-2)]">+{taskGroups.length - 4}</span>
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
                                    className="ring-2 ring-[var(--ink-3)]"
                                  />
                                </div>
                              ))}
                              {referents.length > 3 && (
                                <span className="-ml-1.5 rounded-full border border-[var(--hairline)] bg-[var(--vellum)] px-1 text-[9px] text-[var(--ink-2)]">
                                  +{referents.length - 3}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Deadline */}
                          {task.scheduledAt ? (
                            <span className="shrink-0 text-[11px] text-[var(--ink-3)]">
                              {formatScheduledShort(new Date(task.scheduledAt))}
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
