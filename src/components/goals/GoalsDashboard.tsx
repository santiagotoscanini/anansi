"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, LogOut, Target, Calendar, Palette, FileText, Trophy, Component } from "lucide-react";
import { useGoals } from "~/contexts/GoalsContext";
import ValuesManager from "./ValuesManager";
import GoalsGraph from "./GoalsGraph";
import WeeklyRetrospective from "./WeeklyRetrospective";
import LifeProgress from "./LifeProgress";
import FileSelectionModal from "./FileSelectionModal";
import toast, { Toaster } from "react-hot-toast";
import { FileSystemManager } from "~/lib/file-system";

type TabType = "graph" | "values" | "retrospective" | "progress";

const tabs = [
  { id: "graph" as TabType, name: "Goals Graph", icon: Target, component: <GoalsGraph /> },
  { id: "retrospective" as TabType, name: "Weekly Sync", icon: Calendar, component: <WeeklyRetrospective /> },
  { id: "values" as TabType, name: "Values", icon: Palette, component: <ValuesManager /> },
  { id: "progress" as TabType, name: "Life Progress", icon: Trophy, component: <LifeProgress /> },
];

export default function GoalsDashboard() {
  const { logout, openFile, saveFile, saveAsNewFile, currentFileName, hasUnsavedChanges } = useGoals();
  const [activeTab, setActiveTab] = useState<TabType>("graph");
  const [lastFileName, setLastFileName] = useState<string | null>(null);

  // Check for last opened file name
  useEffect(() => {
    const loadLastFileName = async () => {
      try {
        const lastName = await FileSystemManager.getLastFileName();
        setLastFileName(lastName);
      } catch (error) {
        // No previous file found
        setLastFileName(null);
      }
    };
    void loadLastFileName();
  }, []);

  const handleLogout = () => {
    logout();
    toast.success("Logged out successfully");
  };

  const handleOpenFile = useCallback(async () => {
    try {
      await openFile();
    } catch (error) {
      // Error is already handled in the modal
      throw error;
    }
  }, [openFile]);

  const handleNewFile = useCallback(async () => {
    try {
      await saveAsNewFile();
    } catch (error) {
      throw error;
    }
  }, [saveAsNewFile]);

  // Auto-save functionality (silent)
  useEffect(() => {
    if (!currentFileName || !hasUnsavedChanges) return;

    const autoSaveTimer = setTimeout(() => {
      // Auto-save silently without toast notification
      // Pass false for isUserActivated since this is automatic
      void saveFile(false);
    }, 20 * 1000); // Auto-save after 20 seconds of changes

    return () => clearTimeout(autoSaveTimer);
  }, [currentFileName, hasUnsavedChanges, saveFile]);

  // Keyboard shortcuts (only Ctrl+S for save when file is open)
  useEffect(() => {
    if (!currentFileName) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S or Cmd+S for save
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();

        // Pass true for isUserActivated since this is a user-triggered save
        const savePromise = saveFile(true);

        void toast.promise(savePromise, {
          loading: "Saving file...",
          success: "File saved successfully!",
          error: "Failed to save file",
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentFileName, saveFile]);

  // Show file selection modal if no file is open
  if (!currentFileName) {
    return (
      <>
        <Toaster position="top-right" />
        <FileSelectionModal onOpenFile={handleOpenFile} onNewFile={handleNewFile} lastFileName={lastFileName} />
      </>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <Toaster position="top-right" />

      {/* Header */}
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-md">
        <div className="flex items-center justify-between px-8 py-4">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 text-sm opacity-60 transition-opacity hover:opacity-100">
              <ArrowLeft className="h-4 w-4" />
              Home
            </Link>

            <h1 className="text-xl font-light">Goals Dashboard</h1>

            {/* File info */}
            <div className="flex items-center gap-2 text-sm opacity-60">
              <FileText className="h-4 w-4" />
              <span>{currentFileName}</span>
              {hasUnsavedChanges && (
                <span className="flex items-center gap-1">
                  <span className="animate-pulse text-yellow-400">●</span>
                  <span className="text-xs text-yellow-400">Unsaved changes</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Save button - important for mobile/tablet users */}
            {hasUnsavedChanges && (
              <button
                onClick={() => {
                  const savePromise = saveFile(true);
                  void toast.promise(savePromise, {
                    loading: "Saving file...",
                    success: "File saved successfully!",
                    error: "Failed to save file",
                  });
                }}
                className="flex items-center gap-2 rounded-lg border border-yellow-400/50 bg-yellow-400/10 px-4 py-2 text-sm text-yellow-400 transition-all hover:bg-yellow-400 hover:text-black"
                title="Save (Ctrl+S)"
              >
                <FileText className="h-4 w-4" />
                Save
              </button>
            )}

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm transition-all hover:bg-white hover:text-black"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 border-t border-white/10 px-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition-all ${
                  activeTab === tab.id ? "border-white text-white" : "border-transparent text-white/60 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.name}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content */}
      <div className="pt-28">{tabs.find((tab) => tab.id === activeTab)?.component}</div>
    </main>
  );
}
