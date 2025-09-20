"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Calendar,
  Plus,
  Upload,
  Target,
  ChevronLeft,
  ChevronRight,
  FileText,
  Image,
  Archive,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useGoals } from "~/contexts/GoalsContext";
import { api } from "~/trpc/react";
import toast from "react-hot-toast";
import type { WeeklySync, WeeklySyncItem, TrackingItem } from "~/contexts/GoalsContext";

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

interface TrackingItemFiles {
  [trackingItemId: string]: {
    images: string[];
    textContent?: string;
  };
}

export default function WeeklyRetrospective() {
  const {
    goals,
    getTrackingItems,
    createWeeklySync,
    getWeekStartDate,
    uploadWeeklySyncFile,
    saveTextFile,
    readTextFile,
    calculateImportance,
  } = useGoals();

  // State for tracking items per goal
  const [goalTrackingItems, setGoalTrackingItems] = useState<{ [goalId: string]: TrackingItem[] }>({});

  // State for tracking files and content
  const [trackingItemFiles, setTrackingItemFiles] = useState<TrackingItemFiles>({});

  // Week navigation state
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const now = new Date();
    return getWeekStartDate(now);
  });

  // TRPC hooks for queries
  const weeklySyncQuery = api.goals.weeklySync.getByWeek.useQuery(
    { weekStart: selectedWeek },
    { enabled: !!selectedWeek },
  );

  // UI state
  const [collapsedGoals, setCollapsedGoals] = useState<CollapsedGoals>({});
  const [textEditingState, setTextEditingState] = useState<TextEditingState>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({});

  // File upload refs
  const fileInputRefs = useRef<{ [trackingItemId: string]: HTMLInputElement | null }>({});

  // Debounced auto-save for text
  const saveTimeouts = useRef<{ [trackingItemId: string]: NodeJS.Timeout }>({});

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

  // Extract weekly sync data from query
  const weeklySync = weeklySyncQuery.data;
  const isLoading = weeklySyncQuery.isLoading;

  // Load tracking items for all goals when weekly sync is active
  useEffect(() => {
    const loadTrackingItems = async () => {
      if (!weeklySync || goals.length === 0) return;

      const trackingItemsMap: { [goalId: string]: TrackingItem[] } = {};

      for (const goal of goals) {
        try {
          const items = await getTrackingItems(goal.id);

          // Filter tracking items based on selected week and deletion date
          const filteredItems = items.filter((item) => {
            // If item is not deleted, always include it
            if (!item.deletedAt) return true;

            // If item is deleted, only include it if the selected week is before the deletion date
            const deletionDate = new Date(item.deletedAt);
            const weekEnd = new Date(selectedWeek);
            weekEnd.setDate(weekEnd.getDate() + 6);
            weekEnd.setHours(23, 59, 59, 999);

            return weekEnd < deletionDate;
          });

          trackingItemsMap[goal.id] = filteredItems;
        } catch (error) {
          console.error(`Failed to load tracking items for goal ${goal.id}:`, error);
          trackingItemsMap[goal.id] = [];
        }
      }

      setGoalTrackingItems(trackingItemsMap);
    };

    loadTrackingItems();
  }, [weeklySync, goals, getTrackingItems, selectedWeek]);

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

  // Handle creating weekly sync (only for current week)
  const handleStartWeeklySync = async () => {
    // Only allow creating weekly sync for current week
    if (!isCurrentWeek(selectedWeek)) {
      toast.error("You can only start weekly sync for the current week");
      return;
    }

    try {
      await createWeeklySync();
      // Refetch the query to update the UI
      await weeklySyncQuery.refetch();
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
    (trackingItemId: string, content: string) => {
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
          for (const [gId, trackingItems] of Object.entries(goalTrackingItems)) {
            if (trackingItems.some((item) => item.id === trackingItemId)) {
              goalId = gId;
              break;
            }
          }

          if (!goalId) {
            console.error("Could not find goal for tracking item:", trackingItemId);
            return;
          }

          await saveTextFile(content, goalId, trackingItemId, textEditingState[trackingItemId]?.fileName);

          // Update preview state with text content
          setTrackingItemFiles((prev) => ({
            ...prev,
            [trackingItemId]: {
              images: prev[trackingItemId]?.images || [],
              ...prev[trackingItemId],
              textContent: content,
            },
          }));

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
    [textEditingState, saveTextFile, goalTrackingItems],
  );

  // Handle image upload
  const handleImageUpload = async (trackingItemId: string, files: FileList) => {
    if (!files || files.length === 0) return;

    // Find the goal that contains this tracking item
    let goalId: string | undefined;
    for (const [gId, trackingItems] of Object.entries(goalTrackingItems)) {
      if (trackingItems.some((item) => item.id === trackingItemId)) {
        goalId = gId;
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
              if (reader.result) {
                await uploadWeeklySyncFile(reader.result as string, goalId, trackingItemId, file.name, false);
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

      const results = await Promise.all(uploadPromises);

      // Add uploaded images to preview state
      setTrackingItemFiles((prev) => ({
        ...prev,
        [trackingItemId]: {
          images: [
            ...(prev[trackingItemId]?.images || []),
            ...Array.from(files).map((file) => URL.createObjectURL(file)),
          ],
          ...prev[trackingItemId],
        },
      }));

      toast.success(`${files.length} image(s) uploaded successfully`, { id: "image-upload" });
    } catch (error) {
      console.error("Failed to upload images:", error);
      toast.error("Failed to upload images", { id: "image-upload" });
    }
  };

  // Get tracking item status for current week indicators
  const getTrackingItemStatus = (trackingItem: TrackingItem): "complete" | "partial" | "missing" => {
    // This is a placeholder - in real implementation, you'd check if the tracking item
    // has weekly sync items and files for the current week
    return "missing"; // Default for now
  };

  // Get goal status based on tracking items
  const getGoalStatus = (goalId: string): "complete" | "partial" | "missing" => {
    // This is a placeholder - in real implementation, you'd aggregate tracking item statuses
    return "missing"; // Default for now
  };

  return (
    <div className="min-h-screen px-8 py-8">
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
            <p className="mt-4 text-lg font-light">
              {isCurrentWeek(selectedWeek) ? "No sync for this week" : "No sync data available"}
            </p>
            <p className="mt-2 text-sm opacity-60">
              {isCurrentWeek(selectedWeek)
                ? "Start a weekly sync to track your goal progress"
                : "Weekly syncs can only be created for the current week"}
            </p>
            {isCurrentWeek(selectedWeek) && (
              <button
                onClick={handleStartWeeklySync}
                className="mt-6 rounded-lg border border-white/20 bg-white/10 px-4 py-2 transition-all hover:bg-white hover:text-black"
              >
                <Plus className="mr-2 inline h-4 w-4" />
                Start Weekly Sync
              </button>
            )}
          </div>
        ) : (
          /* Weekly Sync Active - Show Goals and Tracking Items */
          <div className="space-y-6">
            {goals
              .filter((goal) => (goalTrackingItems[goal.id] || []).length > 0)
              .map((goal) => {
                const importance = calculateImportance(goal.id);
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
                            importance === "High"
                              ? "bg-red-500/20 text-red-400"
                              : importance === "Medium"
                                ? "bg-yellow-500/20 text-yellow-400"
                                : "bg-gray-500/20 text-gray-400"
                          }`}
                        >
                          {importance}
                        </span>
                      </div>
                    </div>

                    {/* Tracking Items - Only show when not collapsed */}
                    {!isCollapsed && (
                      <div className="ml-8 mt-4 space-y-4">
                        {(goalTrackingItems[goal.id] || []).length > 0 ? (
                          (goalTrackingItems[goal.id] || []).map((trackingItem) => (
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
                              <div className="mt-3 flex gap-2">
                                {/* Add Text Button */}
                                <button
                                  onClick={() => {
                                    setTextEditingState((prev) => ({
                                      ...prev,
                                      [trackingItem.id]: {
                                        content: prev[trackingItem.id]?.content || "",
                                        isEditing: true,
                                        fileName: prev[trackingItem.id]?.fileName,
                                      },
                                    }));
                                  }}
                                  className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm transition-all hover:bg-white/20"
                                >
                                  <FileText className="h-4 w-4" />
                                  Add Text
                                </button>

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

                                {/* Hidden File Input */}
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
                              {textEditingState[trackingItem.id]?.isEditing && (
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
                                        setTextEditingState((prev) => ({
                                          ...prev,
                                          [trackingItem.id]: {
                                            content: prev[trackingItem.id]?.content || "",
                                            isEditing: false,
                                            fileName: prev[trackingItem.id]?.fileName,
                                          },
                                        }));
                                      }}
                                      className="rounded-lg border border-white/20 px-3 py-1 text-sm transition-all hover:bg-white/10"
                                    >
                                      Done
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Files Preview Area */}
                              {(() => {
                                const trackingFiles = trackingItemFiles[trackingItem.id];
                                return (trackingFiles?.images?.length || 0) > 0 || trackingFiles?.textContent ? (
                                  <div className="mt-3 space-y-3">
                                    <h5 className="text-sm font-medium opacity-70">Uploaded Content</h5>

                                    {/* Text Content Preview */}
                                    {trackingFiles?.textContent && (
                                      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                                        <div className="mb-2 flex items-center gap-2">
                                          <FileText className="h-4 w-4 opacity-60" />
                                          <span className="text-sm opacity-70">Text Notes</span>
                                        </div>
                                        <p className="line-clamp-3 text-sm opacity-80">{trackingFiles.textContent}</p>
                                      </div>
                                    )}

                                    {/* Images Preview */}
                                    {(trackingFiles?.images?.length || 0) > 0 && (
                                      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                                        <div className="mb-2 flex items-center gap-2">
                                          <Image className="h-4 w-4 opacity-60" />
                                          <span className="text-sm opacity-70">
                                            Images ({trackingFiles?.images?.length || 0})
                                          </span>
                                        </div>
                                        <div className="grid grid-cols-4 gap-2">
                                          {(trackingFiles?.images || []).slice(0, 4).map((imageSrc, index) => (
                                            <div key={index} className="group relative">
                                              <img
                                                src={imageSrc}
                                                alt={`Upload ${index + 1}`}
                                                className="h-16 w-full rounded object-cover"
                                              />
                                              {index === 3 && (trackingFiles?.images?.length || 0) > 4 && (
                                                <div className="absolute inset-0 flex items-center justify-center rounded bg-black/60 text-xs text-white">
                                                  +{(trackingFiles?.images?.length || 0) - 3}
                                                </div>
                                              )}
                                            </div>
                                          ))}
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
            {goals.filter((goal) => (goalTrackingItems[goal.id] || []).length > 0).length === 0 && (
              <div className="rounded-lg border border-white/10 bg-white/5 p-12 text-center">
                <Target className="mx-auto h-12 w-12 opacity-30" />
                <p className="mt-4 text-lg font-light">No goals with tracking items</p>
                <p className="mt-2 text-sm opacity-60">Add tracking items to your goals to start using weekly sync</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
