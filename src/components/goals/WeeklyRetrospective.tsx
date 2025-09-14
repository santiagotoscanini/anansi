"use client";

import { useState, useRef } from "react";
import { Calendar, Plus, Upload, Target, ChevronLeft, ChevronRight, Trash2, Edit2, X } from "lucide-react";
import { useGoals } from "~/contexts/GoalsContext";
import { api } from "~/trpc/react";
import toast from "react-hot-toast";

export default function WeeklyRetrospective() {
  const { weeklyReviews, goals, addWeeklyReview, updateWeeklyReview, deleteWeeklyReview } = useGoals();

  // Image upload mutation
  const imageUploadMutation = api.goals.images.uploadMultiple.useMutation();

  const [selectedWeek, setSelectedWeek] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const week = getWeekNumber(now);
    return `${year}-W${week.toString().padStart(2, "0")}`;
  });

  const [isEditing, setIsEditing] = useState(false);
  const [notes, setNotes] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentReview = weeklyReviews.find((r) => r.week === selectedWeek);

  function getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  const handleWeekChange = (direction: "prev" | "next") => {
    const parts = selectedWeek.split("-W");
    const year = parseInt(parts[0] ?? "2025");
    const week = parseInt(parts[1] ?? "1");
    let newWeek = week;
    let newYear = year;

    if (direction === "prev") {
      newWeek--;
      if (newWeek < 1) {
        newWeek = 52;
        newYear--;
      }
    } else {
      newWeek++;
      if (newWeek > 52) {
        newWeek = 1;
        newYear++;
      }
    }

    setSelectedWeek(`${newYear}-W${newWeek.toString().padStart(2, "0")}`);
  };

  const handleStartEdit = () => {
    if (currentReview) {
      setNotes(currentReview.notes);
      setCategories(currentReview.categories);
      setSelectedGoalIds(currentReview.goalIds);
      setPhotos(currentReview.photos);
    } else {
      setNotes("");
      setCategories([]);
      setSelectedGoalIds([]);
      setPhotos([]);
    }
    setIsEditing(true);
  };

  const handleSave = () => {
    const reviewData = {
      week: selectedWeek,
      notes,
      categories,
      goalIds: selectedGoalIds,
      photos,
    };

    if (currentReview) {
      updateWeeklyReview(currentReview.id, reviewData);
      toast.success("Weekly review updated");
    } else {
      addWeeklyReview(reviewData);
      toast.success("Weekly review created");
    }

    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setNotes("");
    setCategories([]);
    setSelectedGoalIds([]);
    setPhotos([]);
  };

  const handleDelete = () => {
    if (currentReview) {
      deleteWeeklyReview(currentReview.id);
      toast.success("Weekly review deleted");
    }
  };

  const handleAddCategory = () => {
    if (newCategory.trim() && !categories.includes(newCategory.trim())) {
      setCategories([...categories, newCategory.trim()]);
      setNewCategory("");
    }
  };

  const handleRemoveCategory = (category: string) => {
    setCategories(categories.filter((c) => c !== category));
  };

  const handleToggleGoal = (goalId: string) => {
    if (selectedGoalIds.includes(goalId)) {
      setSelectedGoalIds(selectedGoalIds.filter((id) => id !== goalId));
    } else {
      setSelectedGoalIds([...selectedGoalIds, goalId]);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      toast.loading("Uploading photos...", { id: "photo-upload" });

      // Convert files to base64
      const imagePromises = Array.from(files).map((file) => {
        return new Promise<{ base64Data: string; fileName: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (reader.result) {
              resolve({
                base64Data: reader.result as string,
                fileName: file.name,
              });
            } else {
              reject(new Error("Failed to read file"));
            }
          };
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(file);
        });
      });

      const imageData = await Promise.all(imagePromises);

      // Upload images to server
      const uploadResults = await imageUploadMutation.mutateAsync({
        images: imageData,
      });

      // Add the file URLs to photos array
      const newPhotoUrls = uploadResults.map(result => result.url);
      setPhotos([...photos, ...newPhotoUrls]);

      toast.success(`${files.length} photo(s) uploaded successfully`, { id: "photo-upload" });

      // Clear the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Photo upload failed:", error);
      toast.error("Failed to upload photos", { id: "photo-upload" });
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const getWeekDateRange = (weekString: string) => {
    const parts = weekString.split("-W");
    const year = parseInt(parts[0] ?? "2025");
    const week = parseInt(parts[1] ?? "1");
    const firstDayOfYear = new Date(year, 0, 1);
    const daysToAdd = (week - 1) * 7 - firstDayOfYear.getDay() + 1;
    const startDate = new Date(year, 0, 1 + daysToAdd);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    const formatDate = (date: Date) => `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

    return `${formatDate(startDate)} - ${formatDate(endDate)}, ${year}`;
  };

  return (
    <div className="min-h-screen px-8 py-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-2xl font-light">Weekly Goal Sync</h2>
          <p className="mt-2 text-sm opacity-60">Review your weekly progress and link goals to your activities</p>
        </div>

        {/* Week Selector */}
        <div className="mb-8 flex items-center justify-between rounded-lg border border-white/20 bg-white/5 p-4">
          <button onClick={() => handleWeekChange("prev")} className="rounded-lg p-2 transition-all hover:bg-white/10">
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="text-center">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              <span className="text-lg font-semibold">Week {selectedWeek.split("-W")[1]}</span>
            </div>
            <span className="text-sm opacity-60">{getWeekDateRange(selectedWeek)}</span>
          </div>

          <button onClick={() => handleWeekChange("next")} className="rounded-lg p-2 transition-all hover:bg-white/10">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {isEditing ? (
          /* Edit Mode */
          <div className="space-y-6">
            {/* Notes */}
            <div>
              <label className="mb-2 block text-sm font-semibold">Weekly Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reflect on your week..."
                rows={4}
                className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white outline-none transition-all focus:border-white/40"
              />
            </div>

            {/* Categories */}
            <div>
              <label className="mb-2 block text-sm font-semibold">Categories</label>
              <div className="mb-3 flex gap-2">
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Add category..."
                  className="flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-all focus:border-white/40"
                  onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                />
                <button
                  onClick={handleAddCategory}
                  className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 transition-all hover:bg-white/20"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <span
                    key={category}
                    className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-sm"
                  >
                    {category}
                    <button
                      onClick={() => handleRemoveCategory(category)}
                      className="ml-1 transition-all hover:text-red-400"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Goals Selection */}
            <div>
              <label className="mb-2 block text-sm font-semibold">Goals Worked On</label>
              <div className="max-h-60 overflow-y-auto rounded-lg border border-white/20 bg-white/5 p-3">
                {goals.length > 0 ? (
                  <div className="space-y-2">
                    {goals.map((goal) => (
                      <label
                        key={goal.id}
                        className="flex items-center gap-3 rounded p-2 transition-all hover:bg-white/10"
                      >
                        <input
                          type="checkbox"
                          checked={selectedGoalIds.includes(goal.id)}
                          onChange={() => handleToggleGoal(goal.id)}
                          className="h-4 w-4"
                        />
                        <Target className="h-4 w-4 opacity-60" />
                        <span>{goal.title}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-sm opacity-60">No goals available</p>
                )}
              </div>
            </div>

            {/* Photo Upload */}
            <div>
              <label className="mb-2 block text-sm font-semibold">Photos</label>
              <div className="space-y-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-white/20 py-8 transition-all hover:border-white/40 hover:bg-white/5"
                >
                  <Upload className="h-5 w-5" />
                  <span>Upload Photos</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  className="hidden"
                />

                {photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    {photos.map((photo, index) => (
                      <div key={index} className="group relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo} alt={`Photo ${index + 1}`} className="h-32 w-full rounded-lg object-cover" />
                        <button
                          onClick={() => handleRemovePhoto(index)}
                          className="absolute right-2 top-2 rounded bg-black/50 p-1 opacity-0 transition-all group-hover:opacity-100"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <button
                onClick={handleCancel}
                className="rounded-lg border border-white/20 px-4 py-2 transition-all hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="rounded-lg border border-white/20 bg-white px-4 py-2 text-black transition-all hover:bg-white/90"
              >
                Save Review
              </button>
            </div>
          </div>
        ) : currentReview ? (
          /* View Mode */
          <div className="space-y-6">
            {/* Actions */}
            <div className="flex justify-end gap-2">
              <button
                onClick={handleStartEdit}
                className="flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 transition-all hover:bg-white/10"
              >
                <Edit2 className="h-4 w-4" />
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-red-400 transition-all hover:bg-red-500/20"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>

            {/* Notes */}
            {currentReview.notes && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Notes</h3>
                <p className="whitespace-pre-wrap rounded-lg border border-white/10 bg-white/5 p-4">
                  {currentReview.notes}
                </p>
              </div>
            )}

            {/* Categories */}
            {currentReview.categories.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Categories</h3>
                <div className="flex flex-wrap gap-2">
                  {currentReview.categories.map((category) => (
                    <span key={category} className="rounded-full bg-white/10 px-3 py-1 text-sm">
                      {category}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Goals */}
            {currentReview.goalIds.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Goals Worked On</h3>
                <div className="space-y-2">
                  {currentReview.goalIds.map((goalId) => {
                    const goal = goals.find((g) => g.id === goalId);
                    if (!goal) return null;
                    return (
                      <div
                        key={goalId}
                        className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3"
                      >
                        <Target className="h-4 w-4 opacity-60" />
                        <span>{goal.title}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Photos */}
            {currentReview.photos.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Photos</h3>
                <div className="grid grid-cols-3 gap-3">
                  {currentReview.photos.map((photo, index) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={index}
                      src={photo}
                      alt={`Photo ${index + 1}`}
                      className="h-32 w-full rounded-lg object-cover"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Empty State */
          <div className="rounded-lg border border-white/10 bg-white/5 p-12 text-center">
            <Calendar className="mx-auto h-12 w-12 opacity-30" />
            <p className="mt-4 text-lg font-light">No review for this week</p>
            <p className="mt-2 text-sm opacity-60">Create a weekly review to track your progress</p>
            <button
              onClick={handleStartEdit}
              className="mt-6 rounded-lg border border-white/20 bg-white/10 px-4 py-2 transition-all hover:bg-white hover:text-black"
            >
              <Plus className="mr-2 inline h-4 w-4" />
              Create Review
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
