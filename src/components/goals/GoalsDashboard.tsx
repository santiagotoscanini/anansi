"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, LogOut, Target, Calendar, Palette, Trophy, RefreshCw } from "lucide-react";
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-800/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link
                href="/"
                className="flex items-center text-slate-300 hover:text-white transition-colors mr-8"
              >
                <ArrowLeft className="h-5 w-5 mr-2" />
                Back to Home
              </Link>
              <h1 className="text-xl font-bold text-white">Goals Dashboard</h1>
            </div>

            <div className="flex items-center space-x-4">
              <button
                onClick={handleRefresh}
                disabled={isDataLoading}
                className="flex items-center px-3 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isDataLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>

              <button
                onClick={handleLogout}
                className="flex items-center px-3 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-slate-800/50 p-1 rounded-lg mb-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center px-4 py-2 text-sm font-medium rounded-md transition-all ${
                  activeTab === tab.id
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-300 hover:text-white hover:bg-slate-700"
                }`}
              >
                <Icon className="h-4 w-4 mr-2" />
                {tab.name}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="bg-slate-800/30 rounded-lg border border-slate-700 overflow-hidden">
          {isDataLoading ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-400" />
              <span className="ml-3 text-slate-300">Loading data...</span>
            </div>
          ) : (
            activeTabComponent
          )}
        </div>
      </div>
    </div>
  );
}