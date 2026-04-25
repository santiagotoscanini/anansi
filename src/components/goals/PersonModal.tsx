"use client";

import { useState } from "react";
import { CheckSquare, HelpCircle, Mountain, Square, Target, X } from "lucide-react";
import EmojiPicker, { type EmojiClickData, Theme } from "emoji-picker-react";
import toast from "react-hot-toast";
import { api } from "~/trpc/react";
import type { PersonCategory } from "~/lib/api/types";
import Avatar from "./Avatar";

export type PersonRow = {
  id: string;
  name: string;
  emoji: string | null;
  category: PersonCategory;
  boardOrder: number;
  appreciation: string | null;
  myNeeds: string | null;
  legacyMessage: string | null;
  selfReflection: string | null;
  decideBy: Date | null;
  archivedAt: Date | null;
  groupIds?: string[];
};

interface PersonModalProps {
  person: PersonRow | null;
  defaultCategory?: PersonCategory;
  onClose: () => void;
  onSaved: () => void;
}

const CATEGORY_OPTIONS: { value: PersonCategory; label: string; hint: string }[] = [
  {
    value: "to_process",
    label: "To Process",
    hint: "Unfinished — repair, release, or end. Name what kind in 'If I died tomorrow'.",
  },
  { value: "exploring", label: "Exploring", hint: 'New, undecided. Add a "decide by" date (default 6 months).' },
  { value: "long_term", label: "Long-term", hint: "Family, closest friends. Erode through neglect, not drama." },
  {
    value: "context_bound",
    label: "Context-bound",
    hint: "Colleagues, neighbors — people to handle well but aren't deepening",
  },
];

function toDateInputValue(d: Date | null): string {
  if (!d) return "";
  const date = new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromDateInputValue(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function sixMonthsFromNow(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d;
}

// Shared styling tokens — kept at the top so any adjustments cascade.
const fieldLabel = "mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/40";
const fieldHelper = "mt-1.5 text-xs text-white/40";
const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white outline-none transition-all placeholder:text-white/30 focus:border-white/30 focus:bg-white/[0.05]";
const textareaClass = `${inputClass} resize-none`;

// Field label with an optional hint surfaced via a hover tooltip on a small `?` icon —
// keeps the form vertically tight (philosophical helper text doesn't take a row each).
function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-white/40">{children}</span>
      {hint && (
        <span className="group relative inline-flex">
          <HelpCircle className="h-3 w-3 cursor-help text-white/25 transition-colors hover:text-white/60" />
          <span
            role="tooltip"
            className="pointer-events-none invisible absolute left-0 top-full z-30 mt-1.5 w-64 rounded-md border border-white/10 bg-zinc-950 p-2.5 text-xs leading-relaxed text-white/70 opacity-0 shadow-2xl transition-opacity group-hover:visible group-hover:opacity-100"
          >
            {hint}
          </span>
        </span>
      )}
    </div>
  );
}

export default function PersonModal({ person, defaultCategory, onClose, onSaved }: PersonModalProps) {
  const isEdit = !!person;

  const [name, setName] = useState(person?.name ?? "");
  const [emoji, setEmoji] = useState<string | null>(person?.emoji ?? null);
  const [customUrl, setCustomUrl] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [category, setCategory] = useState<PersonCategory>(person?.category ?? defaultCategory ?? "exploring");
  const [appreciation, setAppreciation] = useState(person?.appreciation ?? "");
  const [myNeeds, setMyNeeds] = useState(person?.myNeeds ?? "");
  const [legacyMessage, setLegacyMessage] = useState(person?.legacyMessage ?? "");
  const [groupIds, setGroupIds] = useState<string[]>(person?.groupIds ?? []);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState("#60a5fa");

  const groupsQuery = api.goals.groups.getAll.useQuery();
  const createGroupMutation = api.goals.groups.create.useMutation();
  const utils = api.useUtils();
  const [selfReflection, setSelfReflection] = useState(person?.selfReflection ?? "");
  const [decideBy, setDecideBy] = useState<string>(
    toDateInputValue(person?.decideBy ?? (category === "exploring" && !isEdit ? sixMonthsFromNow() : null)),
  );

  const createMutation = api.goals.people.create.useMutation();
  const updateMutation = api.goals.people.update.useMutation();
  const archiveMutation = api.goals.people.archive.useMutation();
  const unarchiveMutation = api.goals.people.unarchive.useMutation();
  const deleteMutation = api.goals.people.delete.useMutation();

  const referentTasksQuery = api.goals.people.getTasksAsReferent.useQuery(
    { personId: person?.id ?? "" },
    { enabled: !!person?.id },
  );

  const bucketListItemsQuery = api.goals.people.getBucketListItemsAsParticipant.useQuery(
    { personId: person?.id ?? "" },
    { enabled: !!person?.id },
  );

  // Gift ideas — only loaded for an existing person (the row must exist before
  // children can be attached). On create, the section shows a "save first" hint.
  const giftIdeasQuery = api.goals.giftIdeas.list.useQuery({ personId: person?.id ?? "" }, { enabled: !!person?.id });
  const createGiftIdea = api.goals.giftIdeas.create.useMutation({
    onSuccess: () => {
      void utils.goals.giftIdeas.list.invalidate({ personId: person?.id ?? "" });
    },
  });
  const deleteGiftIdea = api.goals.giftIdeas.delete.useMutation({
    onSuccess: () => {
      void utils.goals.giftIdeas.list.invalidate({ personId: person?.id ?? "" });
    },
  });
  const [newGiftIdea, setNewGiftIdea] = useState("");
  const handleAddGiftIdea = async () => {
    const content = newGiftIdea.trim();
    if (!content || !person?.id) return;
    try {
      await createGiftIdea.mutateAsync({ personId: person.id, content });
      setNewGiftIdea("");
    } catch {
      toast.error("Couldn't add gift idea");
    }
  };
  const handleDeleteGiftIdea = async (id: string) => {
    try {
      await deleteGiftIdea.mutateAsync({ id });
    } catch {
      toast.error("Couldn't remove gift idea");
    }
  };

  const isSaving =
    createMutation.isPending || updateMutation.isPending || archiveMutation.isPending || deleteMutation.isPending;

  const handleCategoryChange = (value: string) => {
    const next = value as PersonCategory;
    setCategory(next);
    if (next === "exploring" && !decideBy) {
      setDecideBy(toDateInputValue(sixMonthsFromNow()));
    }
  };

  const buildPayload = () => ({
    name: name.trim(),
    emoji,
    category,
    appreciation: appreciation.trim() || null,
    myNeeds: myNeeds.trim() || null,
    legacyMessage: legacyMessage.trim() || null,
    groupIds,
    selfReflection: selfReflection.trim() || null,
    decideBy: category === "exploring" ? fromDateInputValue(decideBy) : null,
  });

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    const payload = buildPayload();
    try {
      if (isEdit && person) {
        await updateMutation.mutateAsync({ id: person.id, ...payload });
        toast.success("Updated");
      } else {
        await createMutation.mutateAsync(payload);
        toast.success("Added");
      }
      onSaved();
      onClose();
    } catch {
      toast.error("Failed to save");
    }
  };

  const handleArchiveToggle = async () => {
    if (!person) return;
    try {
      if (person.archivedAt) {
        await unarchiveMutation.mutateAsync({ id: person.id });
        toast.success("Unarchived");
      } else {
        await archiveMutation.mutateAsync({ id: person.id });
        toast.success("Archived");
      }
      onSaved();
      onClose();
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleDelete = async () => {
    if (!person) return;
    if (!confirm(`Permanently delete ${person.name}? This cannot be undone.`)) return;
    try {
      await deleteMutation.mutateAsync({ id: person.id });
      toast.success("Deleted");
      onSaved();
      onClose();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleEmojiClick = (data: EmojiClickData) => {
    setEmoji(data.emoji);
    setShowEmojiPicker(false);
  };

  const referentTasks = referentTasksQuery.data ?? [];
  const bucketListItems = bucketListItemsQuery.data ?? [];
  const groups = groupsQuery.data ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-zinc-950/95 px-6 py-4 backdrop-blur">
          <h2 className="text-lg font-medium tracking-tight">{isEdit ? "Edit Person" : "Add Person"}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/50 transition-all hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 pb-6 pt-5">
          <div className="space-y-5">
            {/* Name + Avatar */}
            <div>
              <label className={fieldLabel}>Name</label>
              <div className="relative flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="rounded-lg ring-white/20 transition-all hover:ring-1"
                  title="Click to set an emoji or image"
                >
                  <Avatar name={name || "?"} emoji={emoji} size="md" />
                </button>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name…"
                  className={`h-10 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-4 text-sm text-white outline-none transition-all placeholder:text-white/30 focus:border-white/30 focus:bg-white/[0.05]`}
                  autoFocus
                />
                {showEmojiPicker && (
                  <div className="absolute left-0 top-full z-50 mt-2 rounded-xl border border-white/10 bg-zinc-950 p-2 shadow-2xl">
                    <EmojiPicker
                      onEmojiClick={handleEmojiClick}
                      width={350}
                      height={400}
                      theme={Theme.DARK}
                      searchPlaceHolder="Search emoji…"
                    />
                    <div className="mt-2 space-y-2 border-t border-white/5 pt-2">
                      <label className="block text-[10px] uppercase tracking-wider text-white/40">
                        Or paste an image URL
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={customUrl}
                          onChange={(e) => setCustomUrl(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter" && customUrl.trim()) {
                              setEmoji(customUrl.trim());
                              setCustomUrl("");
                              setShowEmojiPicker(false);
                            }
                          }}
                          placeholder="https://…"
                          className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/30"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (customUrl.trim()) {
                              setEmoji(customUrl.trim());
                              setCustomUrl("");
                              setShowEmojiPicker(false);
                            }
                          }}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 transition-all hover:bg-white/10 hover:text-white"
                        >
                          Set
                        </button>
                      </div>
                      {emoji && (
                        <button
                          type="button"
                          onClick={() => {
                            setEmoji(null);
                            setShowEmojiPicker(false);
                          }}
                          className="text-xs text-white/50 underline-offset-2 hover:text-white hover:underline"
                        >
                          Use initial instead
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Category */}
            <div>
              <FieldLabel hint={CATEGORY_OPTIONS.find((c) => c.value === category)?.hint}>Category</FieldLabel>
              <select value={category} onChange={(e) => handleCategoryChange(e.target.value)} className={inputClass}>
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-zinc-950">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Groups — inline tag picker */}
            <div>
              <FieldLabel hint="Tags across contexts. A person can be in multiple.">Groups</FieldLabel>
              <div className="flex flex-wrap items-center gap-1.5">
                {groups.map((g) => {
                  const selected = groupIds.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() =>
                        setGroupIds((prev) => (prev.includes(g.id) ? prev.filter((x) => x !== g.id) : [...prev, g.id]))
                      }
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-all ${
                        selected
                          ? "border-white/30 bg-white/15 text-white"
                          : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: g.color }} />
                      <span>{g.name}</span>
                    </button>
                  );
                })}
                {creatingGroup ? (
                  <div className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/[0.06] px-2 py-0.5">
                    <input
                      type="color"
                      value={newGroupColor}
                      onChange={(e) => setNewGroupColor(e.target.value)}
                      className="h-3.5 w-3.5 cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter" && newGroupName.trim()) {
                          const g = await createGroupMutation.mutateAsync({
                            name: newGroupName.trim(),
                            color: newGroupColor,
                            orderIdx: 0,
                          });
                          await utils.goals.groups.getAll.invalidate();
                          if (g) setGroupIds((prev) => [...prev, g.id]);
                          setNewGroupName("");
                          setCreatingGroup(false);
                        }
                        if (e.key === "Escape") {
                          setNewGroupName("");
                          setCreatingGroup(false);
                        }
                      }}
                      placeholder="Group name"
                      className="w-28 bg-transparent text-xs text-white outline-none placeholder:text-white/40"
                      autoFocus
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCreatingGroup(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-white/15 px-2.5 py-0.5 text-xs text-white/50 transition-all hover:border-white/30 hover:text-white/80"
                  >
                    + New group
                  </button>
                )}
              </div>
            </div>

            {/* Exploring-only: decide by */}
            {category === "exploring" && (
              <div>
                <FieldLabel
                  hint={`Defaults to six months out. Force a decision so "exploring" doesn't become permanent.`}
                >
                  Decide by
                </FieldLabel>
                <input
                  type="date"
                  value={decideBy}
                  onChange={(e) => setDecideBy(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}

            {/* Reflection — quiet section divider */}
            <div className="pt-2">
              <div className="mb-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/5" />
                <span className="text-[10px] uppercase tracking-widest text-white/30">Reflection</span>
                <div className="h-px flex-1 bg-white/5" />
              </div>
            </div>

            {/* What I appreciate */}
            <div>
              <FieldLabel hint="Most people underweight this. Gottman's 5:1 ratio — five positives to every negative — keeps relationships healthy.">
                What I appreciate about them
              </FieldLabel>
              <textarea
                value={appreciation}
                onChange={(e) => setAppreciation(e.target.value)}
                placeholder="Specific things. Qualities, moments, what they bring."
                rows={3}
                className={textareaClass}
              />
            </div>

            {/* What I need from them */}
            <div>
              <FieldLabel hint="Naming a need is the first step toward asking for it. Unspoken needs turn into resentment.">
                What I need from them
              </FieldLabel>
              <textarea
                value={myNeeds}
                onChange={(e) => setMyNeeds(e.target.value)}
                placeholder="What I actually need — not what I expect or feel entitled to."
                rows={3}
                className={textareaClass}
              />
            </div>

            {/* Legacy message — also the place for unfinished business */}
            <div>
              <FieldLabel hint="A forcing function against avoidance. The place for anything unfinished — repair, release, end. Revisit it — what shows up here tends to change.">
                If I died tomorrow — or they did
              </FieldLabel>
              <textarea
                value={legacyMessage}
                onChange={(e) => setLegacyMessage(e.target.value)}
                placeholder="The thing you'd regret leaving unsaid. Specific, not performative."
                rows={3}
                className={textareaClass}
              />
            </div>

            {/* Self reflection */}
            <div>
              <FieldLabel hint="Aggregated across relationships, this is the substrate of knowing yourself.">
                What this relationship shows me about myself
              </FieldLabel>
              <textarea
                value={selfReflection}
                onChange={(e) => setSelfReflection(e.target.value)}
                placeholder="Patterns. How I show up. What I want."
                rows={3}
                className={textareaClass}
              />
            </div>

            {/* Gift ideas */}
            <div>
              <FieldLabel hint="Write ideas when you have them, not when you need them. Gifts stop feeling contrived when they come from a running list.">
                Gifts and gestures I want to give
              </FieldLabel>
              {!person?.id ? (
                <p className={fieldHelper}>Save the person first — gift ideas attach to a saved row.</p>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newGiftIdea}
                      onChange={(e) => setNewGiftIdea(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleAddGiftIdea();
                        }
                      }}
                      placeholder="A specific idea — book, gesture, thing they mentioned…"
                      className={`${inputClass} flex-1`}
                    />
                    <button
                      type="button"
                      onClick={() => void handleAddGiftIdea()}
                      disabled={!newGiftIdea.trim() || createGiftIdea.isPending}
                      className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-4 text-sm text-white/80 transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                  {giftIdeasQuery.data && giftIdeasQuery.data.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {giftIdeasQuery.data.map((g) => (
                        <li
                          key={g.id}
                          className="group flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
                        >
                          <span className="flex-1 whitespace-pre-wrap break-words text-sm text-white/85">
                            {g.content}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleDeleteGiftIdea(g.id)}
                            disabled={deleteGiftIdea.isPending}
                            className="shrink-0 rounded p-1 text-white/30 opacity-100 transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed md:opacity-0 md:group-hover:opacity-100"
                            aria-label="Remove gift idea"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            {/* Tasks where this person is a referent */}
            {isEdit && (
              <div className="pt-2">
                <div className="mb-3 flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/5" />
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-white/30">
                    <Target className="h-3 w-3" />
                    Tasks I&apos;m relying on them for
                  </span>
                  <div className="h-px flex-1 bg-white/5" />
                </div>
                {referentTasksQuery.isLoading ? (
                  <p className="text-xs text-white/40">Loading…</p>
                ) : referentTasks.length === 0 ? (
                  <p className="text-xs text-white/30">
                    None yet. Assign them as a referent from a goal&apos;s tasks list.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {referentTasks.map((t) => (
                      <li
                        key={t.taskId}
                        className="flex items-start gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-sm transition-colors hover:border-white/10 hover:bg-white/[0.04]"
                      >
                        {t.completed ? (
                          <CheckSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        ) : (
                          <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/30" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className={`truncate ${t.completed ? "text-white/40 line-through" : "text-white/90"}`}>
                            {t.taskTitle}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-white/40">
                            {t.goalEmoji && <span>{t.goalEmoji}</span>}
                            <span className="truncate">{t.goalTitle}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Bucket list items where this person is named — read-only counterpart
                to the people-picker on each bucket item. */}
            {isEdit && (
              <div className="pt-2">
                <div className="mb-3 flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/5" />
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-white/30">
                    <Mountain className="h-3 w-3" />
                    Bucket list — together
                  </span>
                  <div className="h-px flex-1 bg-white/5" />
                </div>
                {bucketListItemsQuery.isLoading ? (
                  <p className="text-xs text-white/40">Loading…</p>
                ) : bucketListItems.length === 0 ? (
                  <p className="text-xs text-white/30">
                    Not on any bucket list items yet. Add them from the Bucket List tab.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {bucketListItems.map((b) => (
                      <li
                        key={b.id}
                        className="flex items-start gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-sm transition-colors hover:border-white/10 hover:bg-white/[0.04]"
                      >
                        {b.completedAt ? (
                          <CheckSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        ) : (
                          <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/30" />
                        )}
                        <div
                          className={`min-w-0 flex-1 truncate ${
                            b.completedAt ? "text-white/40 line-through" : "text-white/90"
                          }`}
                        >
                          {b.content}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sticky footer */}
        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-white/5 bg-zinc-950/95 px-6 py-4 backdrop-blur">
          <div className="flex items-center gap-1">
            {isEdit && (
              <>
                <button
                  onClick={handleArchiveToggle}
                  disabled={isSaving}
                  className="rounded-lg px-3 py-2 text-sm text-white/50 transition-all hover:bg-white/5 hover:text-white disabled:opacity-50"
                >
                  {person?.archivedAt ? "Unarchive" : "Archive"}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isSaving}
                  className="rounded-lg px-3 py-2 text-sm text-white/40 transition-all hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                >
                  Delete
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg px-4 py-2 text-sm text-white/70 transition-all hover:bg-white/5 hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-all hover:bg-white/90 disabled:opacity-50"
            >
              {isEdit ? "Save changes" : "Add person"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
