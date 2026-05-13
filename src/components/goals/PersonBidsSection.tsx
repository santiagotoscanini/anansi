"use client";

import { useState } from "react";
import { CheckSquare, HelpCircle, Square, X } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "~/trpc/react";
import DatePicker from "./DatePicker";

// Shared with PersonModal — kept inline rather than imported to avoid coupling
// the section to PersonModal's internals. They're trivial Tailwind strings.
const fieldHelper = "mt-1.5 text-xs text-[var(--ink-3)]";
const inputClass =
  "w-full rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-4 py-2 text-sm text-[var(--ink)] outline-none transition-all placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)] focus:bg-[var(--vellum)]";

// "Next bids" — actionable improvements to the relationship. Capture when
// noticed; mark done when acted on; the trail stays visible.
//
// Extracted from PersonModal as part of H2. The section gates everything on
// `personId`: until the parent row is saved, children can't FK back to it.
export default function PersonBidsSection({ personId }: { personId: string | null | undefined }) {
  const enabled = !!personId;
  const utils = api.useUtils();
  const invalidate = () => void utils.goals.nextBids.list.invalidate({ personId: personId ?? "" });

  const query = api.goals.nextBids.list.useQuery({ personId: personId ?? "" }, { enabled });
  const create = api.goals.nextBids.create.useMutation({ onSuccess: invalidate });
  const update = api.goals.nextBids.update.useMutation({ onSuccess: invalidate });
  const setCompleted = api.goals.nextBids.setCompleted.useMutation({ onSuccess: invalidate });
  const remove = api.goals.nextBids.delete.useMutation({ onSuccess: invalidate });

  const [draft, setDraft] = useState("");
  const [draftDue, setDraftDue] = useState<Date | null>(null);

  const handleAdd = async () => {
    const content = draft.trim();
    if (!content || !personId) return;
    try {
      await create.mutateAsync({ personId, content, dueAt: draftDue });
      setDraft("");
      setDraftDue(null);
    } catch {
      toast.error("Couldn't add bid");
    }
  };

  return (
    <div>
      <SectionLabel hint="Capture what you can do to strengthen this relationship — a gift, a gesture, a conversation, a repair. Add a deadline if it's time-sensitive. Mark done; the trail stays.">
        Next bids
      </SectionLabel>

      {!enabled ? (
        <p className={fieldHelper}>Save the person first — bids attach to a saved row.</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleAdd();
                }
              }}
              placeholder="A specific bid — book, gesture, conversation, repair…"
              className={`${inputClass} flex-1`}
            />
            <DatePicker value={draftDue} onChange={setDraftDue} placeholder="Deadline (optional)" className="sm:w-48" />
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={!draft.trim() || create.isPending}
              className="shrink-0 rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-4 py-2 text-sm text-[var(--ink)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add
            </button>
          </div>

          {query.data && query.data.length > 0 && (
            <ul className="mt-3 divide-y divide-[var(--hairline)]">
              {query.data.map((bid) => (
                <BidRow
                  key={bid.id}
                  bid={bid}
                  onToggleDone={async (done) => {
                    try {
                      await setCompleted.mutateAsync({ id: bid.id, completed: done });
                    } catch {
                      toast.error("Couldn't update bid");
                    }
                  }}
                  onEditContent={async (content) => {
                    const trimmed = content.trim();
                    if (!trimmed) return;
                    try {
                      await update.mutateAsync({ id: bid.id, content: trimmed });
                    } catch {
                      toast.error("Couldn't update bid");
                    }
                  }}
                  onEditDue={async (dueAt) => {
                    try {
                      await update.mutateAsync({ id: bid.id, dueAt });
                    } catch {
                      toast.error("Couldn't update deadline");
                    }
                  }}
                  onDelete={async () => {
                    try {
                      await remove.mutateAsync({ id: bid.id });
                    } catch {
                      toast.error("Couldn't remove bid");
                    }
                  }}
                  deleteDisabled={remove.isPending}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// Section header with hover-tooltip — duplicated from PersonModal's FieldLabel
// to keep the section dependency-free.
function SectionLabel({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]">{children}</span>
      {hint && (
        <span className="group relative inline-flex">
          <HelpCircle className="h-3 w-3 cursor-help text-[var(--ink-4)] transition-colors hover:text-[var(--ink-2)]" />
          <span
            role="tooltip"
            className="pointer-events-none invisible absolute left-0 top-full z-30 mt-1.5 w-64 rounded-md border border-[var(--hairline)] bg-[var(--canvas)] p-2.5 text-xs leading-relaxed text-[var(--ink-2)] opacity-0 shadow-2xl transition-opacity group-hover:visible group-hover:opacity-100"
          >
            {hint}
          </span>
        </span>
      )}
    </div>
  );
}

// Single-line row: checkbox · text · deadline pill · ×. Click the text to edit
// in place; the input is borderless so the row doesn't reflow on toggle.
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
    <li className="group flex h-10 items-center gap-3 px-3 transition-colors hover:bg-[var(--vellum)]">
      <button
        type="button"
        onClick={() => onToggleDone(!done)}
        className="shrink-0 text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
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
            className="w-full border-0 bg-transparent p-0 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-4)]"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(bid.content);
              setEditing(true);
            }}
            className={`block w-full truncate text-left text-sm transition-colors ${
              done ? "text-[var(--ink-3)] line-through" : "text-[var(--ink)] hover:text-[var(--ink)]"
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
        className={overdue ? "[&_button]:!text-[var(--amber)]" : ""}
      />
      <button
        type="button"
        onClick={onDelete}
        disabled={deleteDisabled}
        className="shrink-0 rounded p-1 text-[var(--ink-4)] opacity-100 transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)] disabled:cursor-not-allowed md:opacity-0 md:group-hover:opacity-100"
        aria-label="Remove bid"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
