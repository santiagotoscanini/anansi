"use client";

import { useRef, useState } from "react";
import NextImage from "next/image";
import { FileText, Image as ImageIcon, Trash2 } from "lucide-react";
import type { RouterOutputs } from "~/trpc/react";

type SyncItem = RouterOutputs["goals"]["weeklySync"]["getWeeklyRetrospectiveData"]["unscopedItems"][number];

interface Props {
  item: SyncItem;
  // The set of attachment ids currently being deleted, so the parent's modal
  // confirmation flow can drive the spinner overlay on individual thumbnails.
  deletingFileIds: ReadonlySet<string>;
  onSaveText: (content: string) => Promise<void>;
  onClearText: () => Promise<void>;
  onUploadFiles: (files: FileList) => Promise<void>;
  // Parent shows the actual confirmation modal — we just bubble up the click.
  onDeleteFileClick: (fileId: string, fileName: string) => void;
  onRemoveFromSync: () => Promise<void>;
}

// One item card on the weekly sync canvas. Owns its own draft/save-status
// state so the parent doesn't have to track per-item maps for everyone, and
// debounces auto-save locally with a single timeout ref.
//
// Extracted from WeeklyRetrospective as part of H2 — that component used to
// hold a Record<string, …> for every item's edit state, save status, and
// debounce timer. Pulling those into the row drops ~250 LOC and ~4 piece-of-
// state from the parent.
export default function WeeklySyncItemRow({
  item,
  deletingFileIds,
  onSaveText,
  onClearText,
  onUploadFiles,
  onDeleteFileClick,
  onRemoveFromSync,
}: Props) {
  const imageFiles = item.attachments.filter((a) => a.fileType === "image");
  const hasStoredText = !!item.textContent && item.textContent.trim().length > 0;
  const hasStoredImages = imageFiles.length > 0;

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(item.textContent ?? "");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Reset draft if the item's stored text changes from outside (e.g. the
  // parent refreshed and merged a different value). Comparison-by-identity.
  const [lastSyncedText, setLastSyncedText] = useState(item.textContent ?? "");
  if ((item.textContent ?? "") !== lastSyncedText) {
    setLastSyncedText(item.textContent ?? "");
    if (!isEditing) setDraft(item.textContent ?? "");
  }

  const handleTextChange = (content: string) => {
    setDraft(content);
    setSaveStatus("saving");
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const run = async () => {
        try {
          await onSaveText(content);
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        } catch {
          setSaveStatus("idle");
        }
      };
      void run();
    }, 1000);
  };

  const startEditing = (initial: string) => {
    setDraft(initial);
    setIsEditing(true);
  };

  const stopEditing = () => {
    setIsEditing(false);
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h4 className="font-medium">{item.title}</h4>
          {item.description && <p className="mt-1 text-sm opacity-60">{item.description}</p>}
        </div>

        {saveStatus !== "idle" && (
          <div className="flex items-center gap-1 text-xs">
            {saveStatus === "saving" && (
              <>
                <div className="h-2 w-2 animate-spin rounded-full border border-white/20 border-t-white" />
                <span className="opacity-60">Saving...</span>
              </>
            )}
            {saveStatus === "saved" && <span className="text-green-400">✓ Saved</span>}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {!hasStoredText && (
          <button
            onClick={() => startEditing("")}
            className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm transition-all hover:bg-white/20"
          >
            <FileText className="h-4 w-4" />
            Add Text
          </button>
        )}

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm transition-all hover:bg-white/20"
        >
          <ImageIcon className="h-4 w-4" />
          Add Images
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            if (e.target.files) void onUploadFiles(e.target.files);
            // Reset so re-selecting the same file fires onChange again.
            e.target.value = "";
          }}
          className="hidden"
        />

        <button
          onClick={() => void onRemoveFromSync()}
          className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/60 transition-all hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-200"
          title="Remove from this sync — keeps the item in your library"
        >
          <Trash2 className="h-4 w-4" />
          Remove from sync
        </button>
      </div>

      {/* Fresh-text editor (only when there is no stored text yet). */}
      {!hasStoredText && isEditing && (
        <div className="mt-3">
          <textarea
            value={draft}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="Add your notes for this tracking item..."
            rows={4}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-all focus:border-white/40"
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={stopEditing}
              className="rounded-lg border border-white/20 px-3 py-1 text-sm transition-all hover:bg-white/10"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {(hasStoredText || hasStoredImages) && (
        <div className="mt-3 space-y-3">
          <h5 className="text-sm font-medium opacity-70">Content</h5>

          {hasStoredText && (
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 opacity-60" />
                  <span className="text-sm opacity-70">Saved Notes</span>
                </div>
                <button
                  onClick={() => void onClearText()}
                  className="rounded p-1 text-red-400 opacity-60 transition-all hover:bg-red-500/20 hover:opacity-100"
                  title="Clear notes"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              {isEditing ? (
                <div>
                  <textarea
                    value={draft}
                    onChange={(e) => handleTextChange(e.target.value)}
                    placeholder="Add your notes for this tracking item..."
                    rows={4}
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-all focus:border-white/40"
                    autoFocus
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={stopEditing}
                      className="rounded-lg border border-white/20 px-3 py-1 text-sm transition-all hover:bg-white/10"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => startEditing(item.textContent ?? "")}
                  className="cursor-pointer rounded p-2 text-sm opacity-80 transition-all hover:bg-white/5 hover:opacity-100"
                  title="Click to edit"
                >
                  {item.textContent}
                </div>
              )}
            </div>
          )}

          {hasStoredImages && (
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="mb-2 flex items-center gap-2">
                <ImageIcon className="h-4 w-4 opacity-60" />
                <span className="text-sm opacity-70">Saved Images ({imageFiles.length})</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {imageFiles.slice(0, 4).map((file, index) => {
                  const isDeleting = deletingFileIds.has(file.id);
                  return (
                    <div key={file.id} className="group relative h-16 w-full">
                      <NextImage
                        src={file.url}
                        alt={`Saved ${index + 1}`}
                        fill
                        sizes="(max-width: 768px) 25vw, 128px"
                        unoptimized
                        className={`rounded object-cover transition-opacity ${isDeleting ? "opacity-50" : ""}`}
                      />

                      {!isDeleting && index < 3 && (
                        <button
                          onClick={() => onDeleteFileClick(file.id, file.fileName)}
                          className="absolute right-1 top-1 block rounded-full bg-red-500/80 p-1 text-white opacity-100 transition-all hover:bg-red-500 md:hidden md:opacity-0 md:group-hover:block md:group-hover:opacity-100"
                          title={`Delete ${file.fileName}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}

                      {isDeleting && (
                        <div className="absolute inset-0 flex items-center justify-center rounded bg-black/60">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        </div>
                      )}

                      {index === 3 && imageFiles.length > 4 && (
                        <div className="absolute inset-0 flex items-center justify-center rounded bg-black/60 text-xs text-white">
                          +{imageFiles.length - 3}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
