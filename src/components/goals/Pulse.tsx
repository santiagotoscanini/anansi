"use client";

import { useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import {
  Calendar,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Gift,
  Hourglass,
  ImagePlus,
  Loader2,
  Trash2,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import { useGoals } from "~/contexts/GoalsContext";
import { api, type RouterOutputs } from "~/trpc/react";
import { bucketForDate, formatScheduledShort } from "~/lib/horizon-period";
import Avatar from "./Avatar";

type WeeklyRetroData = RouterOutputs["goals"]["weeklySync"]["getWeeklyRetrospectiveData"];

// "Pulse" — the weekly heartbeat surface. The simple landing for everyday use:
// the current week's items rendered as a flat to-fill list, no goal grouping,
// no default-items editor, no week navigation. Heavy management lives on the
// Sync tab. Pulse is what you open daily/weekly to actually do the work.
export default function Pulse() {
  const {
    goals,
    getWeekStartDate,
    getWeeklyRetrospectiveData,
    createWeeklySync,
    saveTextFile,
    uploadWeeklySyncFile,
    deleteWeeklySyncFile,
    refreshWeeklyRetrospectiveData,
  } = useGoals();

  // Side queries for the secondary Pulse sections.
  const peopleQuery = api.goals.people.getAll.useQuery();
  const importantDatesQuery = api.goals.importantDates.list.useQuery();
  const upcomingBidsQuery = api.goals.nextBids.listUpcoming.useQuery();
  const [showYearlySection, setShowYearlySection] = useState(false);

  // Pulse is always "this week" — no navigation. selectedWeek is computed
  // once on mount from today's date.
  const [weekStart] = useState<Date>(() => getWeekStartDate(new Date()));
  const query = getWeeklyRetrospectiveData(weekStart);
  const data: WeeklyRetroData | undefined = query.data;
  const weeklySync = data?.weeklySync;

  // Flatten goal-grouped + unscoped items into one list, sorted by orderIdx.
  const items = useMemo(() => {
    if (!data) return [];
    const flat = [
      ...data.goals.flatMap((g) => g.items.map((it) => ({ ...it, goalTitle: g.title }))),
      ...data.unscopedItems.map((it) => ({ ...it, goalTitle: null as string | null })),
    ];
    return flat.sort((a, b) => {
      const order = a.orderIdx - b.orderIdx;
      return order !== 0 ? order : a.createdAt.getTime() - b.createdAt.getTime();
    });
  }, [data]);

  // Progress: an item counts as "filled" if it has any text or attachments.
  const filled = items.filter((it) => (it.textContent ?? "").trim().length > 0 || it.attachments.length > 0);
  const progress = items.length === 0 ? 0 : Math.round((filled.length / items.length) * 100);

  // Time-bound tasks bucketed by computed proximity to today (see
  // src/lib/horizon-period.ts). Auto-rollup: a Sept 15 task lives in
  // "year" until July starts, then "quarter" through August, then promotes
  // to "month" when September arrives. Pulse renders THIS-month and
  // THIS-quarter as full lists; THIS-year stays collapsed by default
  // because it's typically large and rarely the daily focus.
  const horizonBuckets = useMemo(() => {
    type FlatTask = {
      id: string;
      title: string;
      goalId: string;
      goalTitle: string;
      goalEmoji: string | undefined;
      scheduledAt: Date;
    };
    const now = new Date();
    const month: FlatTask[] = [];
    const quarter: FlatTask[] = [];
    const year: FlatTask[] = [];
    for (const g of goals) {
      for (const t of g.tasks) {
        if (t.completed || !t.scheduledAt) continue;
        const at = new Date(t.scheduledAt);
        const b = bucketForDate(at, now);
        const flat: FlatTask = {
          id: t.id,
          title: t.title,
          goalId: g.id,
          goalTitle: g.title,
          goalEmoji: g.emoji,
          scheduledAt: at,
        };
        if (b === "month") month.push(flat);
        else if (b === "quarter") quarter.push(flat);
        else if (b === "year") year.push(flat);
      }
    }
    const byDate = (a: FlatTask, b: FlatTask) =>
      a.scheduledAt.getTime() - b.scheduledAt.getTime() || a.title.localeCompare(b.title);
    month.sort(byDate);
    quarter.sort(byDate);
    year.sort(byDate);
    return { month, quarter, year };
  }, [goals]);

  // People needing attention. Each row names the SPECIFIC reason — Pulse is
  // for action, not a count, so "Alice — decision due in 3 days" beats
  // "2 exploring …". Reasons surfaced today:
  //   - "to_process": person is sitting in the inbox waiting to be sorted
  //   - "exploring" past decideBy: decision is overdue
  //   - "exploring" with decideBy ≤ 14 days: decision due soon
  // Sorted by urgency (overdue first, then soonest decideBy, then inbox).
  // Computed inline rather than via useMemo because Date.now() is impure
  // (React compiler purity rule); the filter set is small.
  const peopleRows = peopleQuery.data ?? [];
  type AttentionReason =
    | { kind: "overdue"; daysOverdue: number; decideBy: Date }
    | { kind: "due-soon"; daysUntil: number; decideBy: Date }
    | { kind: "exploring-no-date" }
    | { kind: "inbox" };
  type AttentionRow = { person: (typeof peopleRows)[number]; reason: AttentionReason };
  const attentionRows: AttentionRow[] = [];
  // eslint-disable-next-line react-hooks/purity -- comparison only; intentional fresh `now`
  const nowMs = Date.now();
  const fortnightMs = 14 * 24 * 60 * 60 * 1000;
  for (const p of peopleRows) {
    if (p.archivedAt !== null) continue;
    if (p.category === "to_process") {
      attentionRows.push({ person: p, reason: { kind: "inbox" } });
      continue;
    }
    if (p.category === "exploring") {
      if (!p.decideBy) {
        attentionRows.push({ person: p, reason: { kind: "exploring-no-date" } });
        continue;
      }
      const decideBy = new Date(p.decideBy);
      const diff = decideBy.getTime() - nowMs;
      if (diff < 0) {
        attentionRows.push({
          person: p,
          reason: { kind: "overdue", daysOverdue: Math.ceil(-diff / (24 * 60 * 60 * 1000)), decideBy },
        });
      } else if (diff <= fortnightMs) {
        attentionRows.push({
          person: p,
          reason: { kind: "due-soon", daysUntil: Math.round(diff / (24 * 60 * 60 * 1000)), decideBy },
        });
      }
    }
  }
  const reasonRank = (r: AttentionReason): number => {
    if (r.kind === "overdue") return 0;
    if (r.kind === "due-soon") return 1;
    if (r.kind === "exploring-no-date") return 2;
    return 3; // inbox
  };
  attentionRows.sort((a, b) => {
    const r = reasonRank(a.reason) - reasonRank(b.reason);
    if (r !== 0) return r;
    // Within "due-soon"/"overdue", earlier dates first.
    const aDate = "decideBy" in a.reason ? a.reason.decideBy.getTime() : Number.POSITIVE_INFINITY;
    const bDate = "decideBy" in b.reason ? b.reason.decideBy.getTime() : Number.POSITIVE_INFINITY;
    return aDate - bDate || a.person.name.localeCompare(b.person.name);
  });

  // Important dates — yearly recurring (birthdays, anniversaries, …). Show
  // every date whose next occurrence is within the upcoming 30 days. Computed
  // inline for the same reason as peopleNudges (Date.now() is impure).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const personById = new Map(peopleRows.map((p) => [p.id, p]));
  const upcomingDates = (importantDatesQuery.data ?? [])
    .map((d) => {
      const thisYear = new Date(today.getFullYear(), d.month - 1, d.day);
      const next =
        thisYear.getTime() < today.getTime() ? new Date(today.getFullYear() + 1, d.month - 1, d.day) : thisYear;
      const daysUntil = Math.round((next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
      const turning = d.year ? next.getFullYear() - d.year : null;
      return { ...d, next, daysUntil, turning, person: personById.get(d.personId) };
    })
    .filter((d) => d.daysUntil >= 0 && d.daysUntil <= 30 && d.person?.archivedAt === null)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  // Unified upcoming feed — important dates (yearly recurring) + bids
  // (one-shot per-person actions with dueAt). Each row carries `kind` so
  // the renderer can pick the right icon and chrome.
  type UpcomingRow =
    | { kind: "date"; id: string; date: Date; daysUntil: number; person: string; label: string; turning: number | null }
    | {
        kind: "bid";
        id: string;
        date: Date;
        daysUntil: number;
        person: string;
        personEmoji: string | null;
        content: string;
      };
  const upcomingFeed: UpcomingRow[] = [];
  for (const d of upcomingDates) {
    if (!d.person) continue;
    upcomingFeed.push({
      kind: "date",
      id: `date:${d.id}`,
      date: d.next,
      daysUntil: d.daysUntil,
      person: d.person.name,
      label: d.label,
      turning: d.turning,
    });
  }
  for (const b of upcomingBidsQuery.data ?? []) {
    if (!b.dueAt) continue;
    const due = new Date(b.dueAt);
    const daysUntil = Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    upcomingFeed.push({
      kind: "bid",
      id: `bid:${b.id}`,
      date: due,
      daysUntil,
      person: b.personName,
      personEmoji: b.personEmoji,
      content: b.content,
    });
  }
  upcomingFeed.sort((a, b) => a.date.getTime() - b.date.getTime());

  const handleStart = async () => {
    try {
      await createWeeklySync(weekStart);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start this week");
    }
  };

  const formatRange = (start: Date) => {
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt(start)} – ${fmt(end)}, ${start.getFullYear()}`;
  };

  if (query.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-white/50">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-3xl">
        {/* Header — week range + compact progress */}
        <header className="mb-6">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-2xl font-light">Pulse</h1>
            <span className="flex items-center gap-1.5 text-xs text-white/50">
              <Calendar className="h-3.5 w-3.5" />
              {formatRange(weekStart)}
            </span>
          </div>
          <p className="mt-1 text-sm text-white/50">This week, in one place. Fill what&apos;s true.</p>

          {weeklySync && items.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-white/50">
                <span>
                  {filled.length} of {items.length} item{items.length === 1 ? "" : "s"} filled
                </span>
                <span className="tabular-nums">{progress}%</span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-emerald-400/80 transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </header>

        {/* Body */}
        {!weeklySync ? (
          <EmptyState
            title="No sync for this week yet"
            body="Start the week to load your default items, or set them up in the Sync tab first."
            cta={{ label: "Start this week", onClick: () => void handleStart() }}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="Sync started, no items yet"
            body="Add items via the Sync tab — set up your default items so future weeks auto-fill."
          />
        ) : (
          <ul className="space-y-3">
            {items.map((it) => (
              <PulseItemRow
                key={it.id}
                item={it}
                weeklySyncId={weeklySync.id}
                onSaveText={(content) =>
                  saveTextFile(content, weeklySync.id, it.trackingItemId).then(() => {
                    /* return signature ignored; refresh handled below by debounced caller */
                  })
                }
                onUploadImages={async (files) => {
                  for (const file of Array.from(files)) {
                    const reader = new FileReader();
                    const data = await new Promise<string>((resolve, reject) => {
                      reader.onload = () => resolve(reader.result as string);
                      reader.onerror = reject;
                      reader.readAsDataURL(file);
                    });
                    await uploadWeeklySyncFile(data, weeklySync.id, it.trackingItemId, file.name, "image", false);
                  }
                  await refreshWeeklyRetrospectiveData();
                }}
                onDeleteAttachment={async (id) => {
                  await deleteWeeklySyncFile(id);
                  await refreshWeeklyRetrospectiveData();
                }}
              />
            ))}
          </ul>
        )}

        {/* On the horizon — three sub-sections. This month + this quarter
            render inline; this year stays collapsed by default since it's
            usually a long tail. Tasks auto-roll up: as the calendar
            advances, items in "year" promote to "quarter" then to "month". */}
        {(horizonBuckets.month.length > 0 || horizonBuckets.quarter.length > 0 || horizonBuckets.year.length > 0) && (
          <section className="mt-8">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="flex items-center gap-2 text-sm font-medium text-white/80">
                <Hourglass className="h-3.5 w-3.5" />
                On the horizon
              </h2>
            </div>

            <BucketList
              label="This month"
              accent="emerald"
              tasks={horizonBuckets.month}
              empty="Nothing scheduled for this month yet."
            />

            {horizonBuckets.quarter.length > 0 && (
              <div className="mt-3">
                <BucketList label="This quarter" accent="sky" tasks={horizonBuckets.quarter} />
              </div>
            )}

            {horizonBuckets.year.length > 0 && (
              <div className="mt-3 rounded-md border border-white/10 bg-white/[0.02]">
                <button
                  onClick={() => setShowYearlySection((v) => !v)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-white/60 hover:text-white/80"
                >
                  <span className="flex items-center gap-2">
                    {showYearlySection ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    This year
                  </span>
                  <span className="text-violet-300">{horizonBuckets.year.length} scheduled</span>
                </button>
                {showYearlySection && (
                  <div className="border-t border-white/5 p-2">
                    <BucketList label="" accent="violet" tasks={horizonBuckets.year} hideHeader />
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* People needing attention — one row per person, with the
            specific reason. Pulse is for action, so "Alice — decision
            overdue 3 days" beats "2 exploring …". Sorted: overdue,
            due soon (earliest first), exploring-without-date, inbox. */}
        {attentionRows.length > 0 && (
          <section className="mt-8">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="flex items-center gap-2 text-sm font-medium text-white/80">
                <Users className="h-3.5 w-3.5" />
                People needing attention
              </h2>
            </div>
            <ul className="space-y-2">
              {attentionRows.map(({ person, reason }) => {
                const accent =
                  reason.kind === "overdue"
                    ? "border-rose-500/30 bg-rose-500/5"
                    : reason.kind === "due-soon"
                      ? "border-amber-500/30 bg-amber-500/5"
                      : "border-white/10 bg-white/[0.03]";
                const reasonLabel =
                  reason.kind === "overdue"
                    ? `Decision overdue · ${reason.daysOverdue}d`
                    : reason.kind === "due-soon"
                      ? `Decision due ${reason.daysUntil === 0 ? "today" : reason.daysUntil === 1 ? "tomorrow" : `in ${reason.daysUntil}d`}`
                      : reason.kind === "exploring-no-date"
                        ? "Exploring · no decide-by yet"
                        : "In your inbox to process";
                return (
                  <li
                    key={person.id}
                    className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${accent}`}
                  >
                    <Avatar name={person.name} emoji={person.emoji} size="sm" shape="circle" />
                    <span className="min-w-0 flex-1">
                      <span className="text-white/90">{person.name}</span>
                      <span className="mx-1.5 text-white/40">·</span>
                      <span
                        className={
                          reason.kind === "overdue"
                            ? "text-rose-300"
                            : reason.kind === "due-soon"
                              ? "text-amber-300"
                              : "text-white/65"
                        }
                      >
                        {reasonLabel}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Upcoming — unified feed of important dates (yearly recurring,
            birthdays/anniversaries) and bids (one-shot per-person actions
            with deadlines). Distinguished by leading icon: CalendarDays for
            dates, Gift for bids. Sorted by absolute date. */}
        {upcomingFeed.length > 0 && (
          <section className="mt-8">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="flex items-center gap-2 text-sm font-medium text-white/80">
                <CalendarDays className="h-3.5 w-3.5" />
                Upcoming
              </h2>
              <span className="text-xs text-white/40">Dates · Bids</span>
            </div>
            <ul className="space-y-2">
              {upcomingFeed.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center gap-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
                >
                  {row.kind === "date" ? (
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300"
                      title="Important date"
                    >
                      <CalendarDays className="h-3 w-3" />
                    </span>
                  ) : (
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-pink-500/30 bg-pink-500/10 text-pink-300"
                      title="Bid"
                    >
                      <Gift className="h-3 w-3" />
                    </span>
                  )}
                  <span className="shrink-0 text-xs tabular-nums text-white/50">
                    {row.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-white/85">{row.person}</span>
                    <span className="mx-1.5 text-white/40">·</span>
                    {row.kind === "date" ? (
                      <>
                        <span className="text-white/70">{row.label}</span>
                        {row.turning !== null && row.turning > 0 && (
                          <span className="ml-2 text-[11px] text-white/40">turning {row.turning}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-white/70">{row.content}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[11px] text-white/40">
                    {row.daysUntil <= 0
                      ? row.daysUntil === 0
                        ? "today"
                        : `${-row.daysUntil}d overdue`
                      : row.daysUntil === 1
                        ? "tomorrow"
                        : `in ${row.daysUntil} days`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

interface PulseItemProps {
  item: {
    id: string;
    trackingItemId: string;
    title: string;
    description: string | null;
    textContent: string | null;
    attachments: { id: string; fileName: string; url: string; createdAt: Date }[];
    goalTitle: string | null;
  };
  weeklySyncId: string;
  onSaveText: (content: string) => Promise<void> | void;
  onUploadImages: (files: FileList) => Promise<void>;
  onDeleteAttachment: (id: string) => Promise<void>;
}

function PulseItemRow({ item, onSaveText, onUploadImages, onDeleteAttachment }: PulseItemProps) {
  // Local working copy of the textarea, debounced into the server. The
  // initial server value is used as the seed; we don't try to reconcile late
  // server-side updates back into the textarea (would clobber active typing).
  const [text, setText] = useState(item.textContent ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Note: we don't reconcile late server-side updates back into the textarea
  // (would clobber active typing). The textarea is seeded once from
  // item.textContent and the row remounts when the underlying item.id changes
  // (key is set on the parent map), so cross-week navigation refreshes cleanly.

  const handleChange = (next: string) => {
    setText(next);
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void Promise.resolve(onSaveText(next))
        .then(() => setStatus("saved"))
        .catch((err: unknown) => {
          toast.error(err instanceof Error ? err.message : "Save failed");
          setStatus("idle");
        });
    }, 700);
  };

  return (
    <li className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="font-medium">{item.title}</h3>
            {item.goalTitle ? (
              <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-blue-200">
                {item.goalTitle}
              </span>
            ) : (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/50">
                Unscoped
              </span>
            )}
          </div>
          {item.description && <p className="mt-0.5 text-sm text-white/50">{item.description}</p>}
        </div>
        <div className="shrink-0 text-xs text-white/40">
          {status === "saving" && (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving
            </span>
          )}
          {status === "saved" && <span className="text-emerald-300/80">Saved</span>}
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        rows={3}
        placeholder="What happened with this, this week?"
        className="mt-3 w-full resize-y rounded-md border border-white/10 bg-black/30 p-2 text-sm outline-none placeholder:text-white/30 focus:border-white/30"
      />

      {/* Attachments strip */}
      {(item.attachments.length > 0 || true) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {item.attachments.map((a) => (
            <div key={a.id} className="group relative h-12 w-12 overflow-hidden rounded-md border border-white/10">
              <NextImage src={a.url} alt={a.fileName} fill sizes="48px" className="object-cover" unoptimized />
              <button
                onClick={() => void onDeleteAttachment(a.id)}
                className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 text-white/80 opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Remove attachment"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-white/20 text-white/50 hover:border-white/40 hover:text-white/80"
            aria-label="Add image"
            title="Add image"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                void onUploadImages(e.target.files);
                e.target.value = "";
              }
            }}
            className="hidden"
          />
        </div>
      )}
    </li>
  );
}

function BucketList({
  label,
  accent,
  tasks,
  empty,
  hideHeader = false,
}: {
  label: string;
  accent: "emerald" | "sky" | "violet";
  tasks: {
    id: string;
    title: string;
    goalId: string;
    goalTitle: string;
    goalEmoji: string | undefined;
    scheduledAt: Date;
  }[];
  empty?: string;
  hideHeader?: boolean;
}) {
  // Tailwind needs full class strings to compile, so map accent to fixed
  // classes rather than interpolating. Tiny-but-explicit beats clever-but-broken.
  const headerColor = accent === "emerald" ? "text-emerald-300" : accent === "sky" ? "text-sky-300" : "text-violet-300";
  return (
    <div>
      {!hideHeader && (
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className={`text-[11px] font-medium uppercase tracking-wider ${headerColor}`}>{label}</span>
          {tasks.length > 0 && <span className="text-[11px] text-white/40">{tasks.length}</span>}
        </div>
      )}
      {tasks.length === 0 ? (
        empty ? (
          <p className="text-xs text-white/40">{empty}</p>
        ) : null
      ) : (
        <ul className="space-y-1.5">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2.5 rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm"
            >
              <span className="shrink-0 text-xs tabular-nums text-white/50">{formatScheduledShort(t.scheduledAt)}</span>
              <span className="min-w-0 flex-1 truncate text-white/85">{t.title}</span>
              <span className="shrink-0 text-[11px] text-white/50">
                {t.goalEmoji && !t.goalEmoji.startsWith("http") ? (
                  <span className="mr-1 leading-none">{t.goalEmoji}</span>
                ) : null}
                {t.goalTitle}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 p-12 text-center">
      <p className="text-lg font-light">{title}</p>
      <p className="mt-2 text-sm text-white/50">{body}</p>
      {cta && (
        <button
          onClick={cta.onClick}
          className="mt-5 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm hover:bg-white hover:text-black"
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
