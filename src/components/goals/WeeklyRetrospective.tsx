"use client";

import { useState, useCallback } from "react";
import {
  Calendar,
  Plus,
  Target,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Trash2,
  Settings,
} from "lucide-react";
import { useGoals } from "~/contexts/GoalsContext";
import { api, type RouterOutputs } from "~/trpc/react";
import toast from "react-hot-toast";
import SyncDefaultEditor from "./SyncDefaultEditor";
import WeeklySyncItemRow from "./WeeklySyncItemRow";

type WeeklyRetrospectiveData = RouterOutputs["goals"]["weeklySync"]["getWeeklyRetrospectiveData"];
type SyncItem = WeeklyRetrospectiveData["unscopedItems"][number];
type GoalGroup = WeeklyRetrospectiveData["goals"][number];

// Each rendered group — either a real goal (from data.goals) or the synthesized
// "Unscoped" bucket for items whose underlying tracking item has goalId IS NULL.
type DisplayGroup = {
  id: string;
  title: string;
  description: string;
  importance: "Low" | "Medium" | "High";
  items: SyncItem[];
};

type CollapsedGoals = Record<string, boolean>;

interface DeleteConfirmation {
  isOpen: boolean;
  fileId: string;
  fileName: string;
}

const getFileType = (fileName: string): "image" | "document" | "video" | "audio" | "other" => {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(extension)) {
    return "image";
  } else if (["mp4", "avi", "mov", "wmv", "flv", "webm"].includes(extension)) {
    return "video";
  } else if (["mp3", "wav", "ogg", "aac", "flac"].includes(extension)) {
    return "audio";
  } else if (["pdf", "doc", "docx", "txt", "rtf", "xls", "xlsx", "ppt", "pptx"].includes(extension)) {
    return "document";
  } else {
    return "other";
  }
};

export default function WeeklyRetrospective() {
  const {
    createWeeklySync,
    getWeekStartDate,
    uploadWeeklySyncFile,
    createWeeklySyncItem,
    deleteWeeklySyncFile,
    getWeeklyRetrospectiveData,
    refreshWeeklyRetrospectiveData,
  } = useGoals();

  const removeSyncItemMutation = api.goals.weeklySync.removeItem.useMutation();
  const setItemTextMutation = api.goals.weeklySync.setItemText.useMutation();

  const [selectedWeek, setSelectedWeek] = useState(() => {
    const now = new Date();
    return getWeekStartDate(now);
  });

  const weeklyRetrospectiveQuery = getWeeklyRetrospectiveData(selectedWeek);
  const retrospectiveData: WeeklyRetrospectiveData | undefined = weeklyRetrospectiveQuery.data;
  const weeklySync = retrospectiveData?.weeklySync;
  const isLoading = weeklyRetrospectiveQuery.isLoading;
  const hasError = weeklyRetrospectiveQuery.error;

  // Synthesize an "Unscoped" group for sync items whose tracking item has
  // goalId IS NULL. The id "__unscoped__" is read by the per-item collapse/
  // status code below. React Compiler memoizes — no manual useMemo.
  const goalGroups: DisplayGroup[] = (retrospectiveData?.goals ?? []).map((g: GoalGroup) => ({
    id: g.id,
    title: g.title,
    description: g.description,
    importance: g.importance,
    items: g.items,
  }));
  const unscopedItems = retrospectiveData?.unscopedItems ?? [];
  const allGroups: DisplayGroup[] =
    unscopedItems.length === 0
      ? goalGroups
      : [
          ...goalGroups,
          {
            id: "__unscoped__",
            title: "Unscoped",
            description: "Items not linked to any goal",
            importance: "Low",
            items: unscopedItems,
          },
        ];

  const [collapsedGoals, setCollapsedGoals] = useState<CollapsedGoals>({});
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation>({
    isOpen: false,
    fileId: "",
    fileName: "",
  });
  const [deletingFiles, setDeletingFiles] = useState<Set<string>>(new Set());

  const getWeekDateRange = useCallback((weekStart: Date) => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const formatDate = (date: Date) => date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${formatDate(weekStart)} - ${formatDate(weekEnd)}, ${weekStart.getFullYear()}`;
  }, []);

  const isCurrentWeek = useCallback(
    (weekStart: Date) => {
      const now = new Date();
      const currentWeekStart = getWeekStartDate(now);
      return weekStart.getTime() === currentWeekStart.getTime();
    },
    [getWeekStartDate],
  );

  const handleWeekChange = (direction: "prev" | "next") => {
    const newWeek = new Date(selectedWeek);
    if (direction === "prev") {
      newWeek.setDate(newWeek.getDate() - 7);
    } else {
      newWeek.setDate(newWeek.getDate() + 7);
    }
    setSelectedWeek(newWeek);
  };

  const handleStartWeeklySync = async () => {
    if (hasError) {
      toast.error("Cannot create weekly sync while there are backend errors");
      return;
    }

    try {
      await createWeeklySync(selectedWeek);
      await refreshWeeklyRetrospectiveData();
      toast.success("Weekly sync started!");
    } catch (error) {
      toast.error("Failed to start weekly sync");
      console.error("Failed to create weekly sync:", error);
    }
  };

  const toggleGoalCollapse = (goalId: string) => {
    setCollapsedGoals((prev) => ({
      ...prev,
      [goalId]: !prev[goalId],
    }));
  };

  // Per-item handlers — invoked from WeeklySyncItemRow which owns the local
  // draft + debounce. The row hands us the resolved content to persist.
  const saveItemText = useCallback(
    async (item: SyncItem, content: string) => {
      try {
        await setItemTextMutation.mutateAsync({ weeklySyncItemId: item.id, textContent: content });
        await refreshWeeklyRetrospectiveData();
      } catch (error) {
        console.error("Failed to auto-save text:", error);
        toast.error("Failed to save text");
        throw error;
      }
    },
    [setItemTextMutation, refreshWeeklyRetrospectiveData],
  );

  const clearItemText = useCallback(
    async (item: SyncItem) => {
      try {
        await setItemTextMutation.mutateAsync({ weeklySyncItemId: item.id, textContent: "" });
        await refreshWeeklyRetrospectiveData();
        toast.success("Notes cleared");
      } catch (error) {
        console.error("Failed to clear text:", error);
        toast.error("Failed to clear notes");
      }
    },
    [setItemTextMutation, refreshWeeklyRetrospectiveData],
  );

  const uploadItemFiles = async (item: SyncItem, files: FileList) => {
    if (files.length === 0) return;
    if (!weeklySync?.id) {
      toast.error("No weekly sync available");
      return;
    }
    try {
      toast.loading("Uploading images...", { id: "image-upload" });
      const uploads = Array.from(files).map(
        (file) =>
          new Promise<void>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              void (async () => {
                try {
                  if (!reader.result) throw new Error("No file data");
                  await uploadWeeklySyncFile(
                    reader.result as string,
                    weeklySync.id,
                    item.trackingItemId,
                    file.name,
                    getFileType(file.name),
                    false,
                  );
                  resolve();
                } catch (err) {
                  reject(err instanceof Error ? err : new Error(String(err)));
                }
              })();
            };
            reader.onerror = () => reject(new Error("Failed to read file"));
            reader.readAsDataURL(file);
          }),
      );
      await Promise.all(uploads);
      await refreshWeeklyRetrospectiveData();
      toast.success(`${files.length} image(s) uploaded successfully`, { id: "image-upload" });
    } catch (error) {
      console.error("Failed to upload images:", error);
      toast.error("Failed to upload images", { id: "image-upload" });
    }
  };

  const handleDeleteFileClick = (fileId: string, fileName: string) => {
    setDeleteConfirmation({ isOpen: true, fileId, fileName });
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmation({ isOpen: false, fileId: "", fileName: "" });
  };

  const handleDeleteConfirm = async () => {
    const { fileId, fileName } = deleteConfirmation;
    if (!fileId) return;

    setDeletingFiles((prev) => new Set(prev).add(fileId));

    try {
      await deleteWeeklySyncFile(fileId);
      toast.success(`${fileName} deleted successfully`);
      await refreshWeeklyRetrospectiveData();
    } catch (error) {
      console.error("Failed to delete file:", error);
      toast.error(`Failed to delete ${fileName}`);
    } finally {
      setDeletingFiles((prev) => {
        const newSet = new Set(prev);
        newSet.delete(fileId);
        return newSet;
      });
      handleDeleteCancel();
    }
  };

  const getItemStatus = (item: SyncItem): "complete" | "partial" | "missing" => {
    const hasFiles = item.attachments.length > 0;
    const hasText = !!item.textContent && item.textContent.trim().length > 0;
    if (hasFiles && hasText) return "complete";
    if (hasFiles || hasText) return "partial";
    return "missing";
  };

  const getGoalStatus = (group: DisplayGroup): "complete" | "partial" | "missing" => {
    if (group.items.length === 0) return "missing";
    const statuses = group.items.map(getItemStatus);
    const completeCount = statuses.filter((s) => s === "complete").length;
    const partialCount = statuses.filter((s) => s === "partial").length;
    if (completeCount === statuses.length) return "complete";
    if (completeCount > 0 || partialCount > 0) return "partial";
    return "missing";
  };

  const [defaultEditorOpen, setDefaultEditorOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleAddItemToSync = async (trackingItemId: string) => {
    if (!weeklySync) return;
    try {
      await createWeeklySyncItem(weeklySync.id, trackingItemId);
      await refreshWeeklyRetrospectiveData();
      toast.success("Added to this sync");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add");
    }
  };

  const handleRemoveFromSync = async (weeklySyncItemId: string, title: string) => {
    if (!confirm(`Remove "${title}" from this sync? It stays in your library.`)) return;
    try {
      await removeSyncItemMutation.mutateAsync({ weeklySyncItemId });
      await refreshWeeklyRetrospectiveData();
      toast.success("Removed from sync");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    }
  };

  const itemsOnSync = new Set<string>();
  for (const g of allGroups) {
    for (const it of g.items) itemsOnSync.add(it.trackingItemId);
  }
  const addableItems = (retrospectiveData?.allTrackingItems ?? []).filter((i) => !itemsOnSync.has(i.id));

  return (
    <div className="h-full overflow-y-auto" style={{ background: "var(--paper)" }}>
      {defaultEditorOpen && <SyncDefaultEditor onClose={() => setDefaultEditorOpen(false)} />}
      <header className="px-6 pb-7 pt-10 md:px-12" style={{ borderBottom: "1px solid var(--hairline)" }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
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
              Sync · weekly retrospective
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
              The weekly <span className="brand-em">sync.</span>
            </h1>
            <p
              className="mt-3 max-w-2xl"
              style={{
                fontFamily: "var(--font-text)",
                fontStyle: "italic",
                fontSize: 17,
                color: "var(--ink-2)",
                lineHeight: 1.4,
              }}
            >
              Your weekly sync, grouped by goal. Use it on Friday afternoon or Sunday morning. There&apos;s no right
              answer.
            </p>
          </div>
          <button
            onClick={() => setDefaultEditorOpen(true)}
            className="flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm transition-all"
            style={{
              border: "1px solid var(--hairline-2)",
              background: "var(--canvas)",
              color: "var(--ink)",
              boxShadow: "var(--shadow-sm)",
            }}
            title="Edit the default items every new sync starts with"
          >
            <Settings className="h-4 w-4" />
            Default items
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-7 md:px-12">
        {/* Week Selector */}
        <div className="mb-8 flex items-center justify-between rounded-lg border border-[var(--hairline-2)] bg-[var(--vellum)] p-4">
          <button
            onClick={() => handleWeekChange("prev")}
            className="rounded-lg p-2 transition-all hover:bg-[var(--vellum)]"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="text-center">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              <span className="text-lg font-semibold">
                Week of {selectedWeek.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
              {isCurrentWeek(selectedWeek) && (
                <span className="rounded-full bg-[var(--moss-soft)] px-2 py-1 text-xs text-[var(--moss)]">Current</span>
              )}
            </div>
            <span className="text-sm opacity-60">{getWeekDateRange(selectedWeek)}</span>
          </div>

          <button
            onClick={() => handleWeekChange("next")}
            className="rounded-lg p-2 transition-all hover:bg-[var(--vellum)]"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Error Display */}
        {hasError && (
          <div className="mb-6 rounded-lg border border-[var(--rust)] bg-[var(--rust-soft)] p-4">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded-full bg-[var(--rust)]"></div>
              <span className="font-medium text-[var(--rust)]">Backend Error</span>
            </div>
            <p className="mt-2 text-sm text-[var(--rust)]">
              {hasError.message || "An error occurred while loading weekly retrospective data"}
            </p>
            <p className="mt-1 text-xs opacity-60">Weekly sync creation is disabled until this error is resolved</p>
          </div>
        )}

        {/* Main Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[var(--hairline-2)] border-t-white"></div>
              <p className="mt-2 text-sm opacity-60">Loading...</p>
            </div>
          </div>
        ) : !weeklySync ? (
          <div className="rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] p-12 text-center">
            <Calendar className="mx-auto h-12 w-12 opacity-30" />
            <p className="mt-4 text-lg font-light">No sync for this week</p>
            <p className="mt-2 text-sm opacity-60">Start a weekly sync to track your goal progress for this week</p>
            <button
              onClick={handleStartWeeklySync}
              disabled={!!hasError}
              className={`mt-6 rounded-lg border px-4 py-2 transition-all ${
                hasError
                  ? "cursor-not-allowed border-[var(--rust)] bg-[var(--rust-soft)] text-[var(--rust)] opacity-50"
                  : "border-[var(--hairline-2)] bg-[var(--vellum)] hover:bg-[var(--paper)] hover:text-black"
              }`}
            >
              <Plus className="mr-2 inline h-4 w-4" />
              Start Weekly Sync
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Inline "+ Add item to sync" picker — pulls from the user's
                library, filtering out items already on this sync. */}
            <div className="rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Add item to this sync</p>
                  <p className="mt-1 text-xs opacity-60">
                    Pulls from your tracking-items library. Items added here only affect this week.
                  </p>
                </div>
                <button
                  onClick={() => setPickerOpen((p) => !p)}
                  disabled={addableItems.length === 0}
                  className="flex items-center gap-2 rounded-md border border-[var(--hairline-2)] px-3 py-1.5 text-sm hover:bg-[var(--vellum)] disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {pickerOpen ? "Close picker" : addableItems.length === 0 ? "Nothing to add" : "Pick item"}
                </button>
              </div>
              {pickerOpen && addableItems.length > 0 && (
                <ul className="mt-3 max-h-56 overflow-y-auto rounded-md border border-[var(--hairline)] bg-[var(--paper-deep)] p-2">
                  {addableItems.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => void handleAddItemToSync(item.id)}
                        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--vellum)]"
                      >
                        <span className="truncate">{item.title}</span>
                        <span className="ml-2 shrink-0 rounded-full bg-[var(--vellum)] px-2 py-0.5 text-[10px] uppercase tracking-wide opacity-70">
                          {item.goalTitle ?? "Unscoped"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {allGroups.map((group) => {
              const isCollapsed = collapsedGoals[group.id];
              const groupStatus = getGoalStatus(group);

              return (
                <div key={group.id} className="rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] p-6">
                  {/* Group Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleGoalCollapse(group.id)}
                        className="rounded p-1 transition-all hover:bg-[var(--vellum)]"
                      >
                        {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                      </button>

                      <Target className="h-5 w-5 opacity-60" />

                      <div>
                        <h3 className="font-semibold">{group.title}</h3>
                        <p className="text-sm opacity-60">{group.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isCurrentWeek(selectedWeek) && (
                        <div
                          className={`h-3 w-3 rounded-full ${
                            groupStatus === "complete"
                              ? "bg-[var(--moss)]"
                              : groupStatus === "partial"
                                ? "bg-[var(--amber)]"
                                : "bg-[var(--rust)]"
                          }`}
                          title={`Goal status: ${groupStatus}`}
                        />
                      )}

                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          group.importance === "High"
                            ? "bg-[var(--rust-soft)] text-[var(--rust)]"
                            : group.importance === "Medium"
                              ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                              : "bg-[var(--ink-3-soft)] text-[var(--ink-3)]"
                        }`}
                      >
                        {group.importance}
                      </span>
                    </div>
                  </div>

                  {/* Items */}
                  {!isCollapsed && (
                    <div className="mt-4 space-y-4">
                      {group.items.length > 0 ? (
                        group.items.map((item) => (
                          <WeeklySyncItemRow
                            key={item.id}
                            item={item}
                            deletingFileIds={deletingFiles}
                            onSaveText={(content) => saveItemText(item, content)}
                            onClearText={() => clearItemText(item)}
                            onUploadFiles={(files) => uploadItemFiles(item, files)}
                            onDeleteFileClick={handleDeleteFileClick}
                            onRemoveFromSync={() => handleRemoveFromSync(item.id, item.title)}
                          />
                        ))
                      ) : (
                        <div className="rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] p-4 text-center">
                          <p className="text-sm opacity-60">No tracking items for this goal</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {allGroups.length === 0 && (
              <div className="rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] p-12 text-center">
                <Target className="mx-auto h-12 w-12 opacity-30" />
                <p className="mt-4 text-lg font-light">No items on this sync yet</p>
                <p className="mt-2 text-sm opacity-60">
                  Add tracking items via the picker below, or set a default template under Manage templates.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {deleteConfirmation.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--paper-deep)]">
            <div className="mx-4 w-full max-w-md rounded-lg border border-[var(--hairline-2)] bg-[var(--ink-3)] p-6">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex-shrink-0 rounded-full bg-[var(--rust-soft)] p-2">
                  <Trash2 className="h-5 w-5 text-[var(--rust)]" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-[var(--ink)]">Delete File</h3>
                  <p className="mt-1 text-sm text-[var(--ink-3)]">
                    Are you sure you want to delete &quot;{deleteConfirmation.fileName}&quot;? This action cannot be
                    undone.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleDeleteCancel}
                  className="flex-1 rounded-lg border border-[var(--hairline-2)] px-4 py-2 text-sm transition-all hover:bg-[var(--vellum)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="flex-1 rounded-lg bg-[var(--rust)] px-4 py-2 text-sm text-[var(--ink)] transition-all hover:bg-[var(--rust)]"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
