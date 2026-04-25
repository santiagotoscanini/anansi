"use client";

import { useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import { Calendar, ImagePlus, Loader2, Trash2, Trophy, Users } from "lucide-react";
import toast from "react-hot-toast";
import { useGoals } from "~/contexts/GoalsContext";
import { api, type RouterOutputs } from "~/trpc/react";

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

  // Goal progress — % of tasks completed per active goal. Show the top 5 by
  // total task count so the section doesn't sprawl. Goals with zero tasks are
  // dropped (no signal to display).
  const goalProgress = useMemo(() => {
    return goals
      .filter((g) => g.status === "active" && g.tasks.length > 0)
      .map((g) => {
        const done = g.tasks.filter((t) => t.completed).length;
        const total = g.tasks.length;
        return {
          id: g.id,
          title: g.title,
          emoji: g.emoji,
          importance: g.importance,
          done,
          total,
          pct: Math.round((done / total) * 100),
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [goals]);

  // People needing attention. Two surfaces:
  //   - "to_process" — implicitly an inbox (you put someone there to think
  //     about later)
  //   - "exploring" with decideBy ≤ 14 days — actionable nudge
  // Computed inline (not inside useMemo) — `Date` mutation makes the body
  // impure and the React-compiler purity rule rightly objects; the filter
  // is cheap enough to recompute on every render.
  const peopleRows = peopleQuery.data ?? [];
  const fortnightMs = 14 * 24 * 60 * 60 * 1000;
  // Date.now() is impure for the React compiler purity rule; intentional here —
  // we want a fresh "due in ≤ 14 days" cutoff each render. Comparison only,
  // no DOM/state mutation.
  // eslint-disable-next-line react-hooks/purity
  const cutoff = Date.now() + fortnightMs;
  const toProcess = peopleRows.filter((p) => p.archivedAt === null && p.category === "to_process");
  const exploringDueSoon = peopleRows.filter(
    (p) =>
      p.archivedAt === null && p.category === "exploring" && p.decideBy && new Date(p.decideBy).getTime() <= cutoff,
  );
  const peopleNudges = { toProcess, exploringDueSoon };

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

        {/* Goal progress — compact bars for active goals with tasks. */}
        {goalProgress.length > 0 && (
          <section className="mt-10">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="flex items-center gap-2 text-sm font-medium text-white/80">
                <Trophy className="h-3.5 w-3.5" />
                Goal progress
              </h2>
              <span className="text-xs text-white/40">Top {goalProgress.length} active</span>
            </div>
            <ul className="space-y-2">
              {goalProgress.map((g) => (
                <li key={g.id} className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0 flex-1 truncate text-sm">
                      {g.emoji && <span className="mr-1.5">{g.emoji}</span>}
                      {g.title}
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-white/50">
                      {g.done}/{g.total} · {g.pct}%
                    </span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full transition-all ${
                        g.importance === "High"
                          ? "bg-rose-400/80"
                          : g.importance === "Medium"
                            ? "bg-amber-300/80"
                            : "bg-sky-400/70"
                      }`}
                      style={{ width: `${g.pct}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* People needing attention */}
        {(peopleNudges.toProcess.length > 0 || peopleNudges.exploringDueSoon.length > 0) && (
          <section className="mt-8">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="flex items-center gap-2 text-sm font-medium text-white/80">
                <Users className="h-3.5 w-3.5" />
                People needing attention
              </h2>
            </div>
            <div className="space-y-2">
              {peopleNudges.toProcess.length > 0 && (
                <div className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm">
                  <span className="font-medium">{peopleNudges.toProcess.length}</span>{" "}
                  <span className="text-white/70">in the inbox</span>
                  <span className="text-white/40">
                    {" "}
                    —{" "}
                    {peopleNudges.toProcess
                      .slice(0, 3)
                      .map((p) => p.name)
                      .join(", ")}
                    {peopleNudges.toProcess.length > 3 && "…"}
                  </span>
                </div>
              )}
              {peopleNudges.exploringDueSoon.length > 0 && (
                <div className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm">
                  <span className="font-medium">{peopleNudges.exploringDueSoon.length}</span>{" "}
                  <span className="text-white/70">exploring with a decision due in ≤14 days</span>
                  <span className="text-white/40">
                    {" "}
                    —{" "}
                    {peopleNudges.exploringDueSoon
                      .slice(0, 3)
                      .map((p) => p.name)
                      .join(", ")}
                    {peopleNudges.exploringDueSoon.length > 3 && "…"}
                  </span>
                </div>
              )}
            </div>
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
