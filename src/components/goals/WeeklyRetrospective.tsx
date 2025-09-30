"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Calendar,
  Plus,
  Target,
  ChevronLeft,
  ChevronRight,
  FileText,
  Image,
  Archive,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react";
import { useGoals } from "~/contexts/GoalsContext";
import toast from "react-hot-toast";

interface CollapsedGoals {
  [goalId: string]: boolean;
}

interface TextEditingState {
  [trackingItemId: string]: {
    content: string;
    isEditing: boolean;
    fileName?: string;
  };
}

interface SaveStatus {
  [trackingItemId: string]: "saving" | "saved" | "idle";
}

interface DeleteConfirmation {
  isOpen: boolean;
  fileId: string;
  fileName: string;
  trackingItemId: string;
}

// Helper function to determine file type based on file extension
const getFileType = (fileName: string): "image" | "document" | "video" | "audio" | "other" => {
  const extension = fileName.split(".").pop()?.toLowerCase() || "";

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
    saveTextFile,
    createWeeklySyncItem,
    deleteWeeklySyncFile,
    getWeeklyRetrospectiveData,
    refreshWeeklyRetrospectiveData,
  } = useGoals();

  // Week navigation state, start in the current week
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const now = new Date();
    return getWeekStartDate(now);
  });

  // Single comprehensive query for all weekly retrospective data
  const weeklyRetrospectiveQuery = getWeeklyRetrospectiveData(selectedWeek);

  // Extract data from the comprehensive query
  const retrospectiveData = weeklyRetrospectiveQuery.data;
  const weeklySync = retrospectiveData?.weeklySync;
  const isLoading = weeklyRetrospectiveQuery.isLoading;
  const hasError = weeklyRetrospectiveQuery.error;

  // Filter tracking items based on selected week and deletion date (frontend filtering)
  const goalsWithTrackingItems = (retrospectiveData?.goals || []).map((goal: any) => ({
    ...goal,
    trackingItems: goal.trackingItems.filter((trackingItem: any) => {
      // If item is not deleted, always include it
      if (!trackingItem.deletedAt) return true;

      // If item is deleted, only include it if the selected week is before the deletion date
      const deletionDate = new Date(trackingItem.deletedAt);
      const weekEnd = new Date(selectedWeek);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      return weekEnd < deletionDate;
    }),
  }));

  // UI state
  const [collapsedGoals, setCollapsedGoals] = useState<CollapsedGoals>({});
  const [textEditingState, setTextEditingState] = useState<TextEditingState>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({});
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation>({
    isOpen: false,
    fileId: "",
    fileName: "",
    trackingItemId: "",
  });
  const [deletingFiles, setDeletingFiles] = useState<Set<string>>(new Set());

  // File upload refs
  const fileInputRefs = useRef<{ [trackingItemId: string]: HTMLInputElement | null }>({});

  // Debounced auto-save for text
  const saveTimeouts = useRef<{ [trackingItemId: string]: NodeJS.Timeout }>({});

  // Clear text editing state when week changes to prevent cross-week content bleeding
  useEffect(() => {
    setTextEditingState({});
  }, [selectedWeek]);

  // Get week date range display
  const getWeekDateRange = useCallback((weekStart: Date) => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const formatDate = (date: Date) => date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    return `${formatDate(weekStart)} - ${formatDate(weekEnd)}, ${weekStart.getFullYear()}`;
  }, []);

  // Check if it's current week
  const isCurrentWeek = useCallback(
    (weekStart: Date) => {
      const now = new Date();
      const currentWeekStart = getWeekStartDate(now);
      return weekStart.getTime() === currentWeekStart.getTime();
    },
    [getWeekStartDate],
  );

  // Helper function to ensure tracking item is added to weekly sync
  const ensureTrackingItemInWeeklySync = useCallback(
    async (trackingItemId: string) => {
      // Only add to sync if we have a weekly sync
      if (!weeklySync) {
        return false;
      }

      // Check if already in weekly sync
      const goal = goalsWithTrackingItems.find((g: any) =>
        g.trackingItems.some((item: any) => item.id === trackingItemId),
      );
      const trackingItem = goal?.trackingItems.find((item: any) => item.id === trackingItemId);

      if (trackingItem?.weeklySyncItem) {
        return true; // Already in sync
      }

      try {
        await createWeeklySyncItem(weeklySync.id, trackingItemId);

        toast.success("Added to weekly sync");

        // Refetch data to update UI
        await refreshWeeklyRetrospectiveData();
        return true;
      } catch (error) {
        console.error("Failed to add tracking item to weekly sync:", error);
        toast.error("Failed to add item to weekly sync");
        return false;
      }
    },
    [weeklySync, goalsWithTrackingItems, createWeeklySyncItem, weeklyRetrospectiveQuery],
  );

  // Handle week navigation
  const handleWeekChange = (direction: "prev" | "next") => {
    const newWeek = new Date(selectedWeek);
    if (direction === "prev") {
      newWeek.setDate(newWeek.getDate() - 7);
    } else {
      newWeek.setDate(newWeek.getDate() + 7);
    }
    setSelectedWeek(newWeek);
  };

  // Handle creating weekly sync (can now create for any week)
  const handleStartWeeklySync = async () => {
    // Prevent weekly sync creation when there are backend errors
    if (hasError) {
      toast.error("Cannot create weekly sync while there are backend errors");
      return;
    }

    try {
      await createWeeklySync(selectedWeek);
      // Refetch the query to update the UI
      await refreshWeeklyRetrospectiveData();
      toast.success("Weekly sync started!");
    } catch (error) {
      toast.error("Failed to start weekly sync");
      console.error("Failed to create weekly sync:", error);
    }
  };

  // Handle goal collapse/expand
  const toggleGoalCollapse = (goalId: string) => {
    setCollapsedGoals((prev) => ({
      ...prev,
      [goalId]: !prev[goalId],
    }));
  };

  // Auto-save text with debouncing
  const handleTextChange = useCallback(
    async (trackingItemId: string, content: string) => {
      // Ensure tracking item is added to weekly sync when user starts editing
      await ensureTrackingItemInWeeklySync(trackingItemId);

      setTextEditingState((prev) => ({
        ...prev,
        [trackingItemId]: {
          ...prev[trackingItemId],
          content,
          isEditing: true,
        },
      }));

      // Clear existing timeout
      if (saveTimeouts.current[trackingItemId]) {
        clearTimeout(saveTimeouts.current[trackingItemId]);
      }

      // Set save status to saving
      setSaveStatus((prev) => ({ ...prev, [trackingItemId]: "saving" }));

      // Set new timeout for auto-save (1 second)
      saveTimeouts.current[trackingItemId] = setTimeout(async () => {
        try {
          // Find the goal that contains this tracking item
          let goalId: string | undefined;
          let trackingItem: any = undefined;
          for (const goal of goalsWithTrackingItems) {
            const item = goal.trackingItems.find((item: any) => item.id === trackingItemId);
            if (item) {
              goalId = goal.id;
              trackingItem = item;
              break;
            }
          }

          if (!goalId || !trackingItem) {
            console.error("Could not find goal or tracking item for:", trackingItemId);
            return;
          }

          // Find existing text file name from the files array, or use the one from editing state
          const existingTextFile = trackingItem.files?.find(
            (file: any) => file.fileType === "document" && file.fileName.endsWith(".txt"),
          );
          const existingFileName = existingTextFile?.fileName || textEditingState[trackingItemId]?.fileName;

          if (!weeklySync?.id) {
            throw new Error("No weekly sync available");
          }
          await saveTextFile(content, weeklySync.id, trackingItemId, existingFileName);

          // Refresh data to show the saved content immediately
          await refreshWeeklyRetrospectiveData();

          setSaveStatus((prev) => ({ ...prev, [trackingItemId]: "saved" }));

          // Clear saved status after 2 seconds
          setTimeout(() => {
            setSaveStatus((prev) => ({ ...prev, [trackingItemId]: "idle" }));
          }, 2000);
        } catch (error) {
          console.error("Failed to auto-save text:", error);
          setSaveStatus((prev) => ({ ...prev, [trackingItemId]: "idle" }));
          toast.error("Failed to save text");
        }
      }, 1000);
    },
    [textEditingState, saveTextFile, goalsWithTrackingItems, ensureTrackingItemInWeeklySync],
  );

  // Handle image upload
  const handleImageUpload = async (trackingItemId: string, files: FileList) => {
    if (!files || files.length === 0) return;

    // Ensure tracking item is added to weekly sync when user uploads files
    await ensureTrackingItemInWeeklySync(trackingItemId);

    // Find the goal that contains this tracking item
    let goalId: string | undefined;
    for (const goal of goalsWithTrackingItems) {
      if (goal.trackingItems.some((item: any) => item.id === trackingItemId)) {
        goalId = goal.id;
        break;
      }
    }

    if (!goalId) {
      console.error("Could not find goal for tracking item:", trackingItemId);
      toast.error("Could not find goal for tracking item");
      return;
    }

    try {
      toast.loading("Uploading images...", { id: "image-upload" });

      const uploadPromises = Array.from(files).map(async (file) => {
        return new Promise<void>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = async () => {
            try {
              if (reader.result && weeklySync?.id) {
                const fileType = getFileType(file.name);
                await uploadWeeklySyncFile(
                  reader.result as string,
                  weeklySync.id,
                  trackingItemId,
                  file.name,
                  fileType,
                  false,
                );
              } else {
                throw new Error("No weekly sync available or no file data");
              }
              resolve();
            } catch (error) {
              reject(error);
            }
          };
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(file);
        });
      });

      await Promise.all(uploadPromises);

      // Refresh data to show the saved images immediately
      await refreshWeeklyRetrospectiveData();

      toast.success(`${files.length} image(s) uploaded successfully`, { id: "image-upload" });
    } catch (error) {
      console.error("Failed to upload images:", error);
      toast.error("Failed to upload images", { id: "image-upload" });
    }
  };

  // Handle opening delete confirmation dialog
  const handleDeleteFileClick = (fileId: string, fileName: string, trackingItemId: string) => {
    setDeleteConfirmation({
      isOpen: true,
      fileId,
      fileName,
      trackingItemId,
    });
  };

  // Handle canceling delete
  const handleDeleteCancel = () => {
    setDeleteConfirmation({
      isOpen: false,
      fileId: "",
      fileName: "",
      trackingItemId: "",
    });
  };

  // Handle confirmed file deletion
  const handleDeleteConfirm = async () => {
    const { fileId, fileName } = deleteConfirmation;

    if (!fileId) return;

    // Add to deleting set using fileId
    setDeletingFiles((prev) => new Set(prev).add(fileId));

    try {
      await deleteWeeklySyncFile(fileId);
      toast.success(`${fileName} deleted successfully`);

      // Refresh the weekly retrospective data to update file lists
      await refreshWeeklyRetrospectiveData();
    } catch (error) {
      console.error("Failed to delete file:", error);
      toast.error(`Failed to delete ${fileName}`);
    } finally {
      // Remove from deleting set
      setDeletingFiles((prev) => {
        const newSet = new Set(prev);
        newSet.delete(fileId);
        return newSet;
      });

      // Close confirmation dialog
      handleDeleteCancel();
    }
  };

  // Get tracking item status for current week indicators
  const getTrackingItemStatus = (trackingItem: any): "complete" | "partial" | "missing" => {
    // Check if tracking item is part of weekly sync and has content
    if (!trackingItem.weeklySyncItem) return "missing";

    const hasFiles = trackingItem.files && trackingItem.files.length > 0;
    const hasText = trackingItem.textContent && trackingItem.textContent.trim().length > 0;

    if (hasFiles && hasText) return "complete";
    if (hasFiles || hasText) return "partial";
    return "missing";
  };

  // Get goal status based on tracking items
  const getGoalStatus = (goalId: string): "complete" | "partial" | "missing" => {
    const goal = goalsWithTrackingItems.find((g: any) => g.id === goalId);
    if (!goal || goal.trackingItems.length === 0) return "missing";

    const statuses = goal.trackingItems.map(getTrackingItemStatus);
    const completeCount = statuses.filter((s: string) => s === "complete").length;
    const partialCount = statuses.filter((s: string) => s === "partial").length;

    if (completeCount === statuses.length) return "complete";
    if (completeCount > 0 || partialCount > 0) return "partial";
    return "missing";
  };

  return (
    <div className="h-full px-8 py-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-2xl font-light">Weekly Goal Sync</h2>
          <p className="mt-2 text-sm opacity-60">Track your weekly progress and sync goals with your activities</p>
        </div>

        {/* Week Selector */}
        <div className="mb-8 flex items-center justify-between rounded-lg border border-white/20 bg-white/5 p-4">
          <button onClick={() => handleWeekChange("prev")} className="rounded-lg p-2 transition-all hover:bg-white/10">
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="text-center">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              <span className="text-lg font-semibold">
                Week of {selectedWeek.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
              {isCurrentWeek(selectedWeek) && (
                <span className="rounded-full bg-green-500/20 px-2 py-1 text-xs text-green-400">Current</span>
              )}
            </div>
            <span className="text-sm opacity-60">{getWeekDateRange(selectedWeek)}</span>
          </div>

          <button onClick={() => handleWeekChange("next")} className="rounded-lg p-2 transition-all hover:bg-white/10">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Error Display */}
        {hasError && (
          <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 p-4">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded-full bg-red-500"></div>
              <span className="font-medium text-red-400">Backend Error</span>
            </div>
            <p className="mt-2 text-sm text-red-300">
              {hasError.message || "An error occurred while loading weekly retrospective data"}
            </p>
            <p className="mt-1 text-xs opacity-60">Weekly sync creation is disabled until this error is resolved</p>
          </div>
        )}

        {/* Main Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white"></div>
              <p className="mt-2 text-sm opacity-60">Loading...</p>
            </div>
          </div>
        ) : !weeklySync ? (
          /* No Weekly Sync - Show Start Button only for current week */
          <div className="rounded-lg border border-white/10 bg-white/5 p-12 text-center">
            <Calendar className="mx-auto h-12 w-12 opacity-30" />
            <p className="mt-4 text-lg font-light">No sync for this week</p>
            <p className="mt-2 text-sm opacity-60">Start a weekly sync to track your goal progress for this week</p>
            <button
              onClick={handleStartWeeklySync}
              disabled={!!hasError}
              className={`mt-6 rounded-lg border px-4 py-2 transition-all ${
                hasError
                  ? "cursor-not-allowed border-red-500/20 bg-red-500/10 text-red-400 opacity-50"
                  : "border-white/20 bg-white/10 hover:bg-white hover:text-black"
              }`}
            >
              <Plus className="mr-2 inline h-4 w-4" />
              Start Weekly Sync
            </button>
          </div>
        ) : (
          /* Weekly Sync Active - Show Goals and Tracking Items */
          <div className="space-y-6">
            {goalsWithTrackingItems.map((goal: any) => {
              const isCollapsed = collapsedGoals[goal.id];
              const goalStatus = getGoalStatus(goal.id);

              return (
                <div key={goal.id} className="rounded-lg border border-white/10 bg-white/5 p-6">
                  {/* Goal Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleGoalCollapse(goal.id)}
                        className="rounded p-1 transition-all hover:bg-white/10"
                      >
                        {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                      </button>

                      <Target className="h-5 w-5 opacity-60" />

                      <div>
                        <h3 className="font-semibold">{goal.title}</h3>
                        <p className="text-sm opacity-60">{goal.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Current Week Status Indicator */}
                      {isCurrentWeek(selectedWeek) && (
                        <div
                          className={`h-3 w-3 rounded-full ${
                            goalStatus === "complete"
                              ? "bg-green-500"
                              : goalStatus === "partial"
                                ? "bg-yellow-500"
                                : "bg-red-500"
                          }`}
                          title={`Goal status: ${goalStatus}`}
                        />
                      )}

                      {/* Importance Badge */}
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          goal.importance === "High"
                            ? "bg-red-500/20 text-red-400"
                            : goal.importance === "Medium"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-gray-500/20 text-gray-400"
                        }`}
                      >
                        {goal.importance}
                      </span>
                    </div>
                  </div>

                  {/* Tracking Items - Only show when not collapsed */}
                  {!isCollapsed && (
                    <div className="mt-4 space-y-4">
                      {goal.trackingItems.length > 0 ? (
                        goal.trackingItems.map((trackingItem: any) => (
                          <div key={trackingItem.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                            {/* Tracking Item Header */}
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium">{trackingItem.title}</h4>
                                  {trackingItem.deletedAt && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/20 px-2 py-1 text-xs text-orange-400">
                                      <Archive className="h-3 w-3" />
                                      Archived
                                    </span>
                                  )}
                                </div>
                                {trackingItem.description && (
                                  <p className="mt-1 text-sm opacity-60">{trackingItem.description}</p>
                                )}
                              </div>

                              {/* Save Status Indicator */}
                              {saveStatus[trackingItem.id] && (
                                <div className="flex items-center gap-1 text-xs">
                                  {saveStatus[trackingItem.id] === "saving" && (
                                    <>
                                      <div className="h-2 w-2 animate-spin rounded-full border border-white/20 border-t-white"></div>
                                      <span className="opacity-60">Saving...</span>
                                    </>
                                  )}
                                  {saveStatus[trackingItem.id] === "saved" && (
                                    <span className="text-green-400">✓ Saved</span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Action Buttons */}
                            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                              {/* Add Text Button - Only show if no text content exists */}
                              {!trackingItem.textContent && (
                                <button
                                  onClick={() => {
                                    const existingTextFile = trackingItem.files?.find(
                                      (file: any) => file.fileType === "document" && file.fileName.endsWith(".txt"),
                                    );
                                    setTextEditingState((prev) => ({
                                      ...prev,
                                      [trackingItem.id]: {
                                        content: "", // Always start fresh for new text
                                        isEditing: true,
                                        fileName: existingTextFile?.fileName,
                                      },
                                    }));
                                  }}
                                  className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm transition-all hover:bg-white/20"
                                >
                                  <FileText className="h-4 w-4" />
                                  Add Text
                                </button>
                              )}

                              {/* Add Images Button */}
                              <button
                                onClick={() => {
                                  const input = fileInputRefs.current[trackingItem.id];
                                  if (input) input.click();
                                }}
                                className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm transition-all hover:bg-white/20"
                              >
                                <Image className="h-4 w-4" />
                                Add Images
                              </button>

                              {/* Hidden File Input, triggered by the "Add Image" button */}
                              <input
                                ref={(el) => {
                                  fileInputRefs.current[trackingItem.id] = el;
                                }}
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={(e) => {
                                  if (e.target.files) {
                                    handleImageUpload(trackingItem.id, e.target.files);
                                  }
                                }}
                                className="hidden"
                              />
                            </div>

                            {/* Text Editor */}
                            {!trackingItem.textContent && textEditingState[trackingItem.id]?.isEditing && (
                              <div className="mt-3">
                                <textarea
                                  value={textEditingState[trackingItem.id]?.content || ""}
                                  onChange={(e) => handleTextChange(trackingItem.id, e.target.value)}
                                  placeholder="Add your notes for this tracking item..."
                                  rows={4}
                                  className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-all focus:border-white/40"
                                />
                                <div className="mt-2 flex justify-end">
                                  <button
                                    onClick={() => {
                                      // Clear the editing state completely when done
                                      setTextEditingState((prev) => {
                                        const newState = { ...prev };
                                        delete newState[trackingItem.id];
                                        return newState;
                                      });
                                    }}
                                    className="rounded-lg border border-white/20 px-3 py-1 text-sm transition-all hover:bg-white/10"
                                  >
                                    Done
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Files Preview Area - Show stored files */}
                            {(() => {
                              // Show content if we have actual stored files
                              const hasStoredText = trackingItem.textContent;
                              const imageFiles = trackingItem.files.filter((file: any) => file.fileType === "image");
                              const hasStoredImages = imageFiles.length > 0;

                              return hasStoredText || hasStoredImages ? (
                                <div className="mt-3 space-y-3">
                                  <h5 className="text-sm font-medium opacity-70">Content</h5>

                                  {/* Stored Text Content Preview */}
                                  {hasStoredText && (
                                    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                                      <div className="mb-2 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <FileText className="h-4 w-4 opacity-60" />
                                          <span className="text-sm opacity-70">Saved Notes</span>
                                        </div>
                                        <button
                                          onClick={() => {
                                            // Find the text file URL to delete
                                            const textFile = trackingItem.files?.find(
                                              (file: any) =>
                                                file.fileType === "document" && file.fileName.endsWith(".txt"),
                                            );
                                            if (textFile) {
                                              handleDeleteFileClick(textFile.id, textFile.fileName, trackingItem.id);
                                            }
                                          }}
                                          className="rounded p-1 text-red-400 opacity-60 transition-all hover:bg-red-500/20 hover:opacity-100"
                                          title="Delete notes"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </button>
                                      </div>
                                      {textEditingState[trackingItem.id]?.isEditing ? (
                                        <div>
                                          <textarea
                                            value={
                                              textEditingState[trackingItem.id]?.content ||
                                              trackingItem.textContent ||
                                              ""
                                            }
                                            onChange={(e) => handleTextChange(trackingItem.id, e.target.value)}
                                            placeholder="Add your notes for this tracking item..."
                                            rows={4}
                                            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-all focus:border-white/40"
                                            autoFocus
                                          />
                                          <div className="mt-2 flex justify-end">
                                            <button
                                              onClick={() => {
                                                // Clear the editing state completely when done
                                                setTextEditingState((prev) => {
                                                  const newState = { ...prev };
                                                  delete newState[trackingItem.id];
                                                  return newState;
                                                });
                                              }}
                                              className="rounded-lg border border-white/20 px-3 py-1 text-sm transition-all hover:bg-white/10"
                                            >
                                              Done
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div
                                          onClick={() => {
                                            // Pre-populate text editor with stored content and existing filename
                                            const existingTextFile = trackingItem.files?.find(
                                              (file: any) =>
                                                file.fileType === "document" && file.fileName.endsWith(".txt"),
                                            );
                                            setTextEditingState((prev) => ({
                                              ...prev,
                                              [trackingItem.id]: {
                                                content: trackingItem.textContent || "",
                                                isEditing: true,
                                                fileName: existingTextFile?.fileName,
                                              },
                                            }));
                                          }}
                                          className="cursor-pointer rounded p-2 text-sm opacity-80 transition-all hover:bg-white/5 hover:opacity-100"
                                          title="Click to edit"
                                        >
                                          {trackingItem.textContent}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Stored Images Preview */}
                                  {hasStoredImages && (
                                    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                                      <div className="mb-2 flex items-center gap-2">
                                        <Image className="h-4 w-4 opacity-60" />
                                        <span className="text-sm opacity-70">Saved Images ({imageFiles.length})</span>
                                      </div>
                                      <div className="grid grid-cols-4 gap-2">
                                        {imageFiles.slice(0, 4).map((file: any, index: number) => {
                                          const isDeleting = deletingFiles.has(file.id);
                                          return (
                                            <div key={file.id} className="group relative">
                                              <img
                                                src={file.url}
                                                alt={`Saved ${index + 1}`}
                                                className={`h-16 w-full rounded object-cover transition-opacity ${
                                                  isDeleting ? "opacity-50" : ""
                                                }`}
                                              />

                                              {/* Delete button overlay */}
                                              {!isDeleting && index < 3 && (
                                                <button
                                                  onClick={() =>
                                                    handleDeleteFileClick(file.id, file.fileName, trackingItem.id)
                                                  }
                                                  className="absolute right-1 top-1 block rounded-full bg-red-500/80 p-1 text-white opacity-100 transition-all hover:bg-red-500 md:hidden md:opacity-0 md:group-hover:block md:group-hover:opacity-100"
                                                  title={`Delete ${file.fileName}`}
                                                >
                                                  <Trash2 className="h-3 w-3" />
                                                </button>
                                              )}

                                              {/* Loading indicator for deleting files */}
                                              {isDeleting && (
                                                <div className="absolute inset-0 flex items-center justify-center rounded bg-black/60">
                                                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
                                                </div>
                                              )}

                                              {/* "+X more" overlay for the 4th image */}
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
                              ) : null;
                            })()}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-center">
                          <p className="text-sm opacity-60">No tracking items for this goal</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Show message if no goals have tracking items */}
            {goalsWithTrackingItems.length === 0 && (
              <div className="rounded-lg border border-white/10 bg-white/5 p-12 text-center">
                <Target className="mx-auto h-12 w-12 opacity-30" />
                <p className="mt-4 text-lg font-light">No goals with tracking items</p>
                <p className="mt-2 text-sm opacity-60">Add tracking items to your goals to start using weekly sync</p>
              </div>
            )}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {deleteConfirmation.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="mx-4 w-full max-w-md rounded-lg border border-white/20 bg-gray-900 p-6">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex-shrink-0 rounded-full bg-red-500/20 p-2">
                  <Trash2 className="h-5 w-5 text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white">Delete File</h3>
                  <p className="mt-1 text-sm text-gray-300">
                    Are you sure you want to delete "{deleteConfirmation.fileName}"? This action cannot be undone.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleDeleteCancel}
                  className="flex-1 rounded-lg border border-white/20 px-4 py-2 text-sm transition-all hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="flex-1 rounded-lg bg-red-500 px-4 py-2 text-sm text-white transition-all hover:bg-red-600"
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
