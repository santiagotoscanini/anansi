"use client";

import { useState } from "react";
import { LogOut, Target, Calendar, Palette, Trophy, RefreshCw } from "lucide-react";
import { useGoals } from "~/contexts/GoalsContext";
import ValuesManager from "./ValuesManager";
import GoalsGraph from "./GoalsGraph";
import WeeklyRetrospective from "./WeeklyRetrospective";
import LifeProgress from "./LifeProgress";
import toast, { Toaster } from "react-hot-toast";

type TabType = "graph" | "values" | "retrospective" | "progress";

const tabs = [
  { id: "graph" as TabType, name: "Goals Graph", icon: Target, component: <GoalsGraph /> },
  { id: "retrospective" as TabType, name: "Weekly Sync", icon: Calendar, component: <WeeklyRetrospective /> },
  { id: "values" as TabType, name: "Values", icon: Palette, component: <ValuesManager /> },
  { id: "progress" as TabType, name: "Life Progress", icon: Trophy, component: <LifeProgress /> },
];

export default function GoalsDashboard() {
  const { logout, refreshData, isDataLoading } = useGoals();
  const [activeTab, setActiveTab] = useState<TabType>("graph");

  const handleLogout = () => {
    logout();
    toast.success("Logged out successfully");
  };

  const handleRefresh = async () => {
    try {
      await refreshData();
      toast.success("Data refreshed successfully");
    } catch (error) {
      toast.error("Failed to refresh data");
    }
  };

  const activeTabComponent = tabs.find((tab) => tab.id === activeTab)?.component;

  return (
    <main className="min-h-screen bg-black text-white">
      <Toaster position="top-right" />

      {/* Header */}
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-md">
        <div className="flex items-center justify-between px-8 py-4">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-light">Goals Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm transition-all hover:bg-white hover:text-black"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex gap-1 border-t border-white/10 px-4 md:px-8 overflow-x-auto scrollbar-hide flex-nowrap">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 px-3 md:px-4 py-3 text-sm transition-all flex-shrink-0 whitespace-nowrap ${
                  activeTab === tab.id ? "border-white text-white" : "border-transparent text-white/60 hover:text-white"
                }`}
              >
                <Icon className="mr-2 h-4" />
                {tab.name}
              </button>
            );
          })}
        </div>
      </header>

      {/* Tab Content */}
      <div className="pt-28">
        {isDataLoading ? (
          <div className="flex h-64 items-center justify-center">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-400" />
            <span className="ml-3 text-slate-300">Loading data...</span>
          </div>
        ) : (
          activeTabComponent
        )}
      </div>
    </main>
  );
}
