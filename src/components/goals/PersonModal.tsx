"use client";

import { useRef, useState } from "react";
import { CalendarDays, CheckSquare, HelpCircle, Loader2, Mountain, Square, Target, Upload, X } from "lucide-react";
import EmojiPicker, { type EmojiClickData, Theme } from "emoji-picker-react";
import toast from "react-hot-toast";
import { api } from "~/trpc/react";
import type { PersonCategory } from "~/lib/api/types";
import Avatar from "./Avatar";
import ColorPicker from "./ColorPicker";
import DatePicker from "./DatePicker";

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

// Ordered to match the natural arc of a relationship — see RelationshipsBoard.tsx.
const CATEGORY_OPTIONS: { value: PersonCategory; label: string; hint: string }[] = [
  { value: "exploring", label: "Exploring", hint: 'New, undecided. Add a "decide by" date (default 6 months).' },
  {
    value: "context_bound",
    label: "Context-bound",
    hint: "Colleagues, neighbors — people to handle well but aren't deepening.",
  },
  { value: "long_term", label: "Long-term", hint: "Family, closest friends. Erode through neglect, not drama." },
  {
    value: "to_process",
    label: "To Process",
    hint: "Something to fix — repair, release, or end. Name what kind in 'If I died tomorrow'.",
  },
];

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
  const [decideBy, setDecideBy] = useState<Date | null>(
    person?.decideBy ?? (category === "exploring" && !isEdit ? sixMonthsFromNow() : null),
  );

  const createMutation = api.goals.people.create.useMutation();
  const updateMutation = api.goals.people.update.useMutation();
  const archiveMutation = api.goals.people.archive.useMutation();
  const unarchiveMutation = api.goals.people.unarchive.useMutation();
  const deleteMutation = api.goals.people.delete.useMutation();
  const uploadImageMutation = api.goals.people.uploadImage.useMutation();

  const referentTasksQuery = api.goals.people.getTasksAsReferent.useQuery(
    { personId: person?.id ?? "" },
    { enabled: !!person?.id },
  );

  const bucketListItemsQuery = api.goals.people.getBucketListItemsAsParticipant.useQuery(
    { personId: person?.id ?? "" },
    { enabled: !!person?.id },
  );

  // Bids — only loaded for an existing person (the row must exist before
  // children can be attached). On create, the section shows a "save first" hint.
  const nextBidsQuery = api.goals.nextBids.list.useQuery({ personId: person?.id ?? "" }, { enabled: !!person?.id });
  const invalidateBids = () => void utils.goals.nextBids.list.invalidate({ personId: person?.id ?? "" });
  const createNextBid = api.goals.nextBids.create.useMutation({ onSuccess: invalidateBids });
  const updateNextBid = api.goals.nextBids.update.useMutation({ onSuccess: invalidateBids });
  const setNextBidCompleted = api.goals.nextBids.setCompleted.useMutation({ onSuccess: invalidateBids });
  const deleteNextBid = api.goals.nextBids.delete.useMutation({ onSuccess: invalidateBids });
  const [newNextBid, setNewNextBid] = useState("");
  const [newNextBidDue, setNewNextBidDue] = useState<Date | null>(null);
  const handleAddNextBid = async () => {
    const content = newNextBid.trim();
    if (!content || !person?.id) return;
    try {
      await createNextBid.mutateAsync({
        personId: person.id,
        content,
        dueAt: newNextBidDue,
      });
      setNewNextBid("");
      setNewNextBidDue(null);
    } catch {
      toast.error("Couldn't add bid");
    }
  };
  const handleDeleteNextBid = async (id: string) => {
    try {
      await deleteNextBid.mutateAsync({ id });
    } catch {
      toast.error("Couldn't remove bid");
    }
  };
  const handleToggleNextBidDone = async (id: string, completed: boolean) => {
    try {
      await setNextBidCompleted.mutateAsync({ id, completed });
    } catch {
      toast.error("Couldn't update bid");
    }
  };
  const handleEditNextBidDue = async (id: string, dueAt: Date | null) => {
    try {
      await updateNextBid.mutateAsync({ id, dueAt });
    } catch {
      toast.error("Couldn't update deadline");
    }
  };
  const handleEditNextBidContent = async (id: string, content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    try {
      await updateNextBid.mutateAsync({ id, content: trimmed });
    } catch {
      toast.error("Couldn't update bid");
    }
  };

  // Important dates — yearly recurring per person. Same gating as bids.
  const importantDatesQuery = api.goals.importantDates.list.useQuery(
    { personId: person?.id ?? "" },
    { enabled: !!person?.id },
  );
  const invalidateDates = () => void utils.goals.importantDates.list.invalidate({ personId: person?.id ?? "" });
  const createImportantDate = api.goals.importantDates.create.useMutation({ onSuccess: invalidateDates });
  const updateImportantDate = api.goals.importantDates.update.useMutation({ onSuccess: invalidateDates });
  const deleteImportantDate = api.goals.importantDates.delete.useMutation({ onSuccess: invalidateDates });
  const [newDateLabel, setNewDateLabel] = useState("");
  const [newDateValue, setNewDateValue] = useState<Date | null>(null);
  const handleAddImportantDate = async () => {
    if (!person?.id) return;
    const label = newDateLabel.trim();
    if (!label || !newDateValue) return;
    try {
      await createImportantDate.mutateAsync({
        personId: person.id,
        label,
        month: newDateValue.getMonth() + 1,
        day: newDateValue.getDate(),
        year: newDateValue.getFullYear(),
      });
      setNewDateLabel("");
      setNewDateValue(null);
    } catch {
      toast.error("Couldn't add date");
    }
  };
  const handleEditImportantDateLabel = async (id: string, label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    try {
      await updateImportantDate.mutateAsync({ id, label: trimmed });
    } catch {
      toast.error("Couldn't update date");
    }
  };
  const handleEditImportantDateValue = async (id: string, date: Date | null) => {
    if (!date) return;
    try {
      await updateImportantDate.mutateAsync({
        id,
        month: date.getMonth() + 1,
        day: date.getDate(),
        year: date.getFullYear(),
      });
    } catch {
      toast.error("Couldn't update date");
    }
  };
  const handleDeleteImportantDate = async (id: string) => {
    try {
      await deleteImportantDate.mutateAsync({ id });
    } catch {
      toast.error("Couldn't remove date");
    }
  };

  const isSaving =
    createMutation.isPending || updateMutation.isPending || archiveMutation.isPending || deleteMutation.isPending;

  const handleCategoryChange = (value: string) => {
    const next = value as PersonCategory;
    setCategory(next);
    if (next === "exploring" && !decideBy) {
      setDecideBy(sixMonthsFromNow());
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
    decideBy: category === "exploring" ? decideBy : null,
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

  // Read a local file as base64, upload it, stash the returned URL in
  // `emoji`. Server doesn't need a personId — the file lives at a
  // content-addressed path so the same flow works for new + existing people.
  const handleFileUpload = async (file: File) => {
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { url } = await uploadImageMutation.mutateAsync({ fileName: file.name, data });
      setEmoji(url);
      setShowEmojiPicker(false);
      toast.success("Picture uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
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
                        Upload a picture
                      </label>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadImageMutation.isPending}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-3 py-2 text-xs text-white/70 transition-all hover:border-white/30 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {uploadImageMutation.isPending ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Uploading…
                          </>
                        ) : (
                          <>
                            <Upload className="h-3.5 w-3.5" />
                            Choose image
                          </>
                        )}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleFileUpload(file);
                          e.target.value = ""; // Allow re-selecting the same file
                        }}
                      />
                      <label className="block pt-1 text-[10px] uppercase tracking-wider text-white/40">
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
                    <ColorPicker value={newGroupColor} onChange={setNewGroupColor} size="sm" />
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
                <DatePicker value={decideBy} onChange={setDecideBy} placeholder="Pick a date" />
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

            {/* Bids — actionable improvements to the relationship. Anything I can do
                to deepen this — gifts, gestures, conversations, repairs — captured when
                noticed, with an optional deadline, completed bids stay visible. */}
            <div>
              <FieldLabel hint="Capture what you can do to strengthen this relationship — a gift, a gesture, a conversation, a repair. Add a deadline if it's time-sensitive. Mark done; the trail stays.">
                Next bids
              </FieldLabel>
              {!person?.id ? (
                <p className={fieldHelper}>Save the person first — bids attach to a saved row.</p>
              ) : (
                <>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={newNextBid}
                      onChange={(e) => setNewNextBid(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleAddNextBid();
                        }
                      }}
                      placeholder="A specific bid — book, gesture, conversation, repair…"
                      className={`${inputClass} flex-1`}
                    />
                    <DatePicker
                      value={newNextBidDue}
                      onChange={setNewNextBidDue}
                      placeholder="Deadline (optional)"
                      className="sm:w-48"
                    />
                    <button
                      type="button"
                      onClick={() => void handleAddNextBid()}
                      disabled={!newNextBid.trim() || createNextBid.isPending}
                      className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                  {nextBidsQuery.data && nextBidsQuery.data.length > 0 && (
                    <ul className="mt-3 divide-y divide-white/5">
                      {nextBidsQuery.data.map((g) => (
                        <BidRow
                          key={g.id}
                          bid={g}
                          onToggleDone={(done) => void handleToggleNextBidDone(g.id, done)}
                          onEditContent={(content) => void handleEditNextBidContent(g.id, content)}
                          onEditDue={(dueAt) => void handleEditNextBidDue(g.id, dueAt)}
                          onDelete={() => void handleDeleteNextBid(g.id)}
                          deleteDisabled={deleteNextBid.isPending}
                        />
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            {/* Important dates — yearly recurring (birthday, anniversary, …).
                Surfaces in Pulse when the next occurrence is upcoming. */}
            <div>
              <FieldLabel hint="Yearly recurring dates — birthdays, anniversaries, anything that comes around again. Pulse surfaces them when the next occurrence is within the next 30 days. Year is optional (used for 'turning N' math).">
                Important dates
              </FieldLabel>
              {!person?.id ? (
                <p className={fieldHelper}>Save the person first — dates attach to a saved row.</p>
              ) : (
                <>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={newDateLabel}
                      onChange={(e) => setNewDateLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleAddImportantDate();
                        }
                      }}
                      placeholder="Birthday, anniversary, …"
                      className={`${inputClass} flex-1`}
                    />
                    <DatePicker
                      value={newDateValue}
                      onChange={setNewDateValue}
                      placeholder="Pick a date"
                      className="sm:w-48"
                    />
                    <button
                      type="button"
                      onClick={() => void handleAddImportantDate()}
                      disabled={!newDateLabel.trim() || !newDateValue || createImportantDate.isPending}
                      className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                  {importantDatesQuery.data && importantDatesQuery.data.length > 0 && (
                    <ul className="mt-3 divide-y divide-white/5">
                      {importantDatesQuery.data.map((d) => (
                        <ImportantDateRow
                          key={d.id}
                          date={d}
                          onEditLabel={(label) => void handleEditImportantDateLabel(d.id, label)}
                          onEditDate={(date) => void handleEditImportantDateValue(d.id, date)}
                          onDelete={() => void handleDeleteImportantDate(d.id)}
                          deleteDisabled={deleteImportantDate.isPending}
                        />
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

// ---------------- BidRow ----------------
// Single-line row, Apple-Reminders style: checkbox · text · deadline pill · ×.
// Click the text to edit in place — the input is borderless and sits at the
// same width as the static text, so the layout doesn't reflow.
function BidRow({
  bid,
  onToggleDone,
  onEditContent,
  onEditDue,
  onDelete,
  deleteDisabled,
}: {
  bid: { id: string; content: string; dueAt: Date | null; completedAt: Date | null };
  onToggleDone: (done: boolean) => void;
  onEditContent: (content: string) => void;
  onEditDue: (dueAt: Date | null) => void;
  onDelete: () => void;
  deleteDisabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bid.content);
  const done = !!bid.completedAt;
  // eslint-disable-next-line react-hooks/purity -- comparison-only Date.now() for overdue marker.
  const overdue = !done && bid.dueAt && new Date(bid.dueAt).getTime() < Date.now();

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== bid.content) onEditContent(trimmed);
    else setDraft(bid.content);
    setEditing(false);
  };

  return (
    <li className="group flex h-10 items-center gap-3 px-3 transition-colors hover:bg-white/[0.02]">
      <button
        type="button"
        onClick={() => onToggleDone(!done)}
        className="shrink-0 text-white/40 transition-colors hover:text-white"
        aria-label={done ? "Mark as not done" : "Mark as done"}
      >
        {done ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                setDraft(bid.content);
                setEditing(false);
              }
            }}
            autoFocus
            className="w-full border-0 bg-transparent p-0 text-sm text-white outline-none placeholder:text-white/30"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(bid.content);
              setEditing(true);
            }}
            className={`block w-full truncate text-left text-sm transition-colors ${
              done ? "text-white/40 line-through" : "text-white/85 hover:text-white"
            }`}
            title="Click to edit"
          >
            {bid.content}
          </button>
        )}
      </div>
      <DatePicker
        value={bid.dueAt}
        onChange={onEditDue}
        placeholder="Add deadline"
        size="sm"
        align="right"
        className={overdue ? "[&_button]:!text-amber-300" : ""}
      />
      <button
        type="button"
        onClick={onDelete}
        disabled={deleteDisabled}
        className="shrink-0 rounded p-1 text-white/30 opacity-100 transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed md:opacity-0 md:group-hover:opacity-100"
        aria-label="Remove bid"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

// ---------------- ImportantDateRow ----------------
// Single-line row: icon · label · date pill · ×. Click the label to rename;
// click the date pill to repick.
function ImportantDateRow({
  date,
  onEditLabel,
  onEditDate,
  onDelete,
  deleteDisabled,
}: {
  date: { id: string; label: string; month: number; day: number; year: number | null };
  onEditLabel: (label: string) => void;
  onEditDate: (date: Date | null) => void;
  onDelete: () => void;
  deleteDisabled: boolean;
}) {
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(date.label);
  const dateAsObject = new Date(date.year ?? new Date().getFullYear(), date.month - 1, date.day);

  const commit = () => {
    const trimmed = labelDraft.trim();
    if (trimmed && trimmed !== date.label) onEditLabel(trimmed);
    else setLabelDraft(date.label);
    setEditingLabel(false);
  };

  return (
    <li className="group flex h-10 items-center gap-3 px-3 transition-colors hover:bg-white/[0.02]">
      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-white/40" />
      <div className="min-w-0 flex-1">
        {editingLabel ? (
          <input
            type="text"
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                setLabelDraft(date.label);
                setEditingLabel(false);
              }
            }}
            autoFocus
            className="w-full border-0 bg-transparent p-0 text-sm text-white outline-none placeholder:text-white/30"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setLabelDraft(date.label);
              setEditingLabel(true);
            }}
            className="block w-full truncate text-left text-sm text-white/85 transition-colors hover:text-white"
            title="Click to rename"
          >
            {date.label}
          </button>
        )}
      </div>
      <DatePicker value={dateAsObject} onChange={onEditDate} clearable={false} size="sm" align="right" />
      <button
        type="button"
        onClick={onDelete}
        disabled={deleteDisabled}
        className="shrink-0 rounded p-1 text-white/30 opacity-100 transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed md:opacity-0 md:group-hover:opacity-100"
        aria-label="Remove date"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
