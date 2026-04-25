"use client";

import { useEffect, useState } from "react";
import {
  LogOut,
  Target,
  Calendar,
  Palette,
  Trophy,
  Mountain,
  RefreshCw,
  Download,
  Upload,
  Users,
  Network,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
  Plus,
  Pencil,
  Trash2,
  ListChecks,
} from "lucide-react";
import { useGoals } from "~/contexts/GoalsContext";
import { api } from "~/trpc/react";
import toast, { Toaster } from "react-hot-toast";
import ValuesManager from "./ValuesManager";
import GoalsGraph from "./GoalsGraph";
import WeeklyRetrospective from "./WeeklyRetrospective";
import LifeProgress from "./LifeProgress";
import PeopleDirectory, { type PeopleFilter } from "./PeopleDirectory";
import RelationshipsBoard from "./RelationshipsBoard";
import BucketList from "./BucketList";
import TrackingItemsLibrary from "./TrackingItemsLibrary";
import BackupImportModal from "./BackupImportModal";

// Ananse Ntontan — Adinkra symbol for Anansi (spider). Rendered inline so it
// inherits currentColor and stays crisp at any size.
function AnansiMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <g stroke="currentColor" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <line x1="50" y1="50" x2="50" y2="8" />
        <line x1="50" y1="50" x2="79.7" y2="20.3" />
        <line x1="50" y1="50" x2="92" y2="50" />
        <line x1="50" y1="50" x2="79.7" y2="79.7" />
        <line x1="50" y1="50" x2="50" y2="92" />
        <line x1="50" y1="50" x2="20.3" y2="79.7" />
        <line x1="50" y1="50" x2="8" y2="50" />
        <line x1="50" y1="50" x2="20.3" y2="20.3" />
        <polygon points="50,8 79.7,20.3 92,50 79.7,79.7 50,92 20.3,79.7 8,50 20.3,20.3" />
        <polygon points="50,22 69.8,30.2 78,50 69.8,69.8 50,78 30.2,69.8 22,50 30.2,30.2" />
        <polygon points="50,36 59.9,40.1 64,50 59.9,59.9 50,64 40.1,59.9 36,50 40.1,40.1" />
      </g>
    </svg>
  );
}

type TabType =
  | "objectives"
  | "sync"
  | "tracking-items"
  | "values"
  | "progress"
  | "bucket"
  | "people"
  | "relationships";

type NavItem = { id: TabType; name: string; icon: typeof Target };

const goalsSection: NavItem[] = [
  { id: "objectives", name: "Objectives", icon: Target },
  { id: "sync", name: "Sync", icon: Calendar },
  { id: "tracking-items", name: "Tracking Items", icon: ListChecks },
  { id: "values", name: "Values", icon: Palette },
  { id: "progress", name: "Progress", icon: Trophy },
  { id: "bucket", name: "Bucket List", icon: Mountain },
];

const peopleNavItem: NavItem = { id: "people", name: "People", icon: Users };
const relationshipsNavItem: NavItem = { id: "relationships", name: "Relationships", icon: Network };

export default function GoalsDashboard() {
  const { logout, isDataLoading } = useGoals();
  const [activeTab, setActiveTab] = useState<TabType>("objectives");
  const [peopleFilter, setPeopleFilter] = useState<PeopleFilter>({ kind: "all" });
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Desktop-only collapsed state, persisted across sessions.
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebarCollapsed") === "1";
  });
  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  const utils = api.useUtils();
  const groupsQuery = api.goals.groups.getAll.useQuery();
  const peopleQuery = api.goals.people.getAll.useQuery({ includeArchived: false });
  const createGroupMutation = api.goals.groups.create.useMutation();
  const updateGroupMutation = api.goals.groups.update.useMutation();
  const deleteGroupMutation = api.goals.groups.delete.useMutation();

  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState("#60a5fa");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupColor, setEditGroupColor] = useState("#60a5fa");

  const handleLogout = () => {
    logout();
    toast.success("Logged out successfully");
  };

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    toast.loading("Preparing backup…", { id: "backup-export" });
    try {
      const backup = await utils.goals.backup.export.fetch();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `goals-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Backup downloaded (${backup.files.length} files)`, { id: "backup-export" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed", { id: "backup-export" });
    } finally {
      setIsExporting(false);
    }
  };

  const groups = groupsQuery.data ?? [];
  const allPeople = peopleQuery.data ?? [];
  const peopleCount = allPeople.length;
  const uncategorizedCount = allPeople.filter((p) => !p.groupIds || p.groupIds.length === 0).length;
  const countForGroup = (groupId: string) => allPeople.filter((p) => p.groupIds?.includes(groupId)).length;

  const goToPeople = (filter: PeopleFilter) => {
    setActiveTab("people");
    setPeopleFilter(filter);
    setMobileNavOpen(false);
  };

  const submitNewGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await createGroupMutation.mutateAsync({
        name: newGroupName.trim(),
        color: newGroupColor,
        orderIdx: groups.length,
      });
      await utils.goals.groups.getAll.invalidate();
      setNewGroupName("");
      setNewGroupColor("#60a5fa");
      setShowNewGroupForm(false);
      toast.success("Group created");
    } catch {
      toast.error("Failed to create group");
    }
  };

  const submitGroupEdit = async () => {
    if (!editingGroupId || !editGroupName.trim()) return;
    try {
      await updateGroupMutation.mutateAsync({
        id: editingGroupId,
        name: editGroupName.trim(),
        color: editGroupColor,
      });
      await utils.goals.groups.getAll.invalidate();
      setEditingGroupId(null);
      toast.success("Group updated");
    } catch {
      toast.error("Failed to update group");
    }
  };

  const handleDeleteGroup = async (id: string, name: string) => {
    if (!confirm(`Delete group "${name}"? People stay, but their membership in this group is removed.`)) return;
    try {
      await deleteGroupMutation.mutateAsync({ id });
      await Promise.all([utils.goals.groups.getAll.invalidate(), utils.goals.people.getAll.invalidate()]);
      if (peopleFilter.kind === "group" && peopleFilter.groupId === id) {
        setPeopleFilter({ kind: "all" });
      }
      toast.success("Group deleted");
    } catch {
      toast.error("Failed to delete group");
    }
  };

  const renderNavItem = (item: NavItem, isCollapsed: boolean, active: boolean, onClick: () => void) => {
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        onClick={onClick}
        title={isCollapsed ? item.name : undefined}
        className={`flex items-center rounded-lg text-sm transition-all ${
          isCollapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2"
        } ${active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"}`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!isCollapsed && <span>{item.name}</span>}
      </button>
    );
  };

  const renderSidebar = (isCollapsed: boolean) => {
    return (
      <aside
        className={`flex h-full shrink-0 flex-col border-r border-white/10 bg-black transition-[width] duration-200 ${
          isCollapsed ? "w-14" : "w-56"
        }`}
      >
        {/* Brand + collapse toggle */}
        <div className={`flex items-center py-5 ${isCollapsed ? "justify-center px-2" : "justify-between px-5"}`}>
          {isCollapsed ? (
            <AnansiMark className="h-6 w-6 text-white/80" />
          ) : (
            <div className="flex items-center gap-2">
              <AnansiMark className="h-5 w-5 text-white/80" />
              <h1 className="text-lg font-light tracking-tight">Anansi</h1>
            </div>
          )}
          <button
            onClick={() => setMobileNavOpen(false)}
            className="rounded p-1 text-white/60 transition-all hover:bg-white/10 hover:text-white md:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden rounded p-1 text-white/50 transition-all hover:bg-white/10 hover:text-white md:inline-flex"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Nav — two sections */}
        <nav className={`flex flex-1 flex-col gap-1 overflow-y-auto ${isCollapsed ? "px-2" : "px-3"}`}>
          {/* Goals section */}
          {!isCollapsed && (
            <div className="mb-1 mt-1 px-2 text-[10px] uppercase tracking-wider text-white/30">Goals</div>
          )}
          {goalsSection.map((item) =>
            renderNavItem(item, isCollapsed, activeTab === item.id, () => {
              setActiveTab(item.id);
              setMobileNavOpen(false);
            }),
          )}

          {/* Connections section */}
          {!isCollapsed && (
            <div className="mb-1 mt-4 px-2 text-[10px] uppercase tracking-wider text-white/30">Connections</div>
          )}
          {isCollapsed && <div className="my-2 h-px bg-white/10" />}

          {/* People — only active when no group filter is on */}
          {(() => {
            const active = activeTab === "people" && peopleFilter.kind === "all";
            const Icon = peopleNavItem.icon;
            return (
              <button
                onClick={() => goToPeople({ kind: "all" })}
                title={isCollapsed ? peopleNavItem.name : undefined}
                className={`flex items-center rounded-lg text-sm transition-all ${
                  isCollapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2"
                } ${active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!isCollapsed && (
                  <span className="flex flex-1 items-center justify-between">
                    <span>{peopleNavItem.name}</span>
                    <span className="text-xs text-white/40">{peopleCount}</span>
                  </span>
                )}
              </button>
            );
          })()}

          {/* Relationships */}
          {renderNavItem(relationshipsNavItem, isCollapsed, activeTab === "relationships", () => {
            setActiveTab("relationships");
            setMobileNavOpen(false);
          })}

          {/* Groups section — flat list, no nesting */}
          {!isCollapsed && (
            <>
              <div className="mb-1 mt-4 flex items-center justify-between px-2">
                <span className="text-[10px] uppercase tracking-wider text-white/30">Groups</span>
                <button
                  onClick={() => setShowNewGroupForm(true)}
                  title="New group"
                  className="rounded p-0.5 text-white/40 transition-all hover:bg-white/10 hover:text-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Uncategorized — pseudo-group at the top, like Starred in Mesh */}
              <button
                onClick={() => goToPeople({ kind: "uncategorized" })}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-all ${
                  activeTab === "people" && peopleFilter.kind === "uncategorized"
                    ? "bg-white/10 text-white"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full border border-white/30" />
                  <span>Uncategorized</span>
                </span>
                <span className="text-xs text-white/40">{uncategorizedCount}</span>
              </button>

              {groups.map((g) => {
                const selected =
                  activeTab === "people" && peopleFilter.kind === "group" && peopleFilter.groupId === g.id;
                if (editingGroupId === g.id) {
                  return (
                    <div key={g.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
                      <input
                        type="color"
                        value={editGroupColor}
                        onChange={(e) => setEditGroupColor(e.target.value)}
                        className="h-4 w-4 cursor-pointer rounded border-0 bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={editGroupName}
                        onChange={(e) => setEditGroupName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void submitGroupEdit();
                          if (e.key === "Escape") setEditingGroupId(null);
                        }}
                        className="flex-1 bg-transparent text-sm text-white outline-none"
                        autoFocus
                      />
                    </div>
                  );
                }
                return (
                  <div
                    key={g.id}
                    className={`group flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-all ${
                      selected ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <button
                      onClick={() => goToPeople({ kind: "group", groupId: g.id })}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: g.color }} />
                      <span className="truncate">{g.name}</span>
                    </button>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-white/40">{countForGroup(g.id)}</span>
                      <button
                        onClick={() => {
                          setEditingGroupId(g.id);
                          setEditGroupName(g.name);
                          setEditGroupColor(g.color);
                        }}
                        className="rounded p-0.5 text-white/40 opacity-100 transition-all hover:bg-white/10 hover:text-white md:opacity-0 md:group-hover:opacity-100"
                        title="Edit"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => void handleDeleteGroup(g.id, g.name)}
                        className="rounded p-0.5 text-white/40 opacity-100 transition-all hover:bg-red-500/20 hover:text-red-400 md:opacity-0 md:group-hover:opacity-100"
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {showNewGroupForm && (
                <div className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
                  <input
                    type="color"
                    value={newGroupColor}
                    onChange={(e) => setNewGroupColor(e.target.value)}
                    className="h-4 w-4 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitNewGroup();
                      if (e.key === "Escape") {
                        setShowNewGroupForm(false);
                        setNewGroupName("");
                      }
                    }}
                    placeholder="Group name"
                    className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
                    autoFocus
                  />
                </div>
              )}
            </>
          )}
        </nav>

        {/* Utility actions */}
        <div className={`flex flex-col gap-1 border-t border-white/10 py-3 ${isCollapsed ? "px-2" : "px-3"}`}>
          <button
            onClick={handleExport}
            disabled={isExporting}
            title={isCollapsed ? "Export backup" : undefined}
            className={`flex items-center rounded-lg text-sm transition-all ${
              isCollapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2"
            } text-white/60 hover:bg-white/5 hover:text-white disabled:opacity-50`}
          >
            <Download className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span>Export backup</span>}
          </button>
          <button
            onClick={() => {
              setIsImportOpen(true);
              setMobileNavOpen(false);
            }}
            title={isCollapsed ? "Import backup" : undefined}
            className={`flex items-center rounded-lg text-sm transition-all ${
              isCollapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2"
            } text-white/60 hover:bg-white/5 hover:text-white`}
          >
            <Upload className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span>Import backup</span>}
          </button>
          <button
            onClick={handleLogout}
            title={isCollapsed ? "Log out" : undefined}
            className={`flex items-center rounded-lg text-sm transition-all ${
              isCollapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2"
            } text-white/60 hover:bg-white/5 hover:text-white`}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span>Log out</span>}
          </button>
        </div>
      </aside>
    );
  };

  const renderActive = () => {
    switch (activeTab) {
      case "objectives":
        return <GoalsGraph />;
      case "sync":
        return <WeeklyRetrospective />;
      case "tracking-items":
        return <TrackingItemsLibrary />;
      case "values":
        return <ValuesManager />;
      case "progress":
        return <LifeProgress />;
      case "bucket":
        return <BucketList />;
      case "people":
        return <PeopleDirectory filter={peopleFilter} onFilterChange={setPeopleFilter} />;
      case "relationships":
        return <RelationshipsBoard />;
    }
  };

  const activeTitle = () => {
    if (activeTab === "objectives") return "Objectives";
    if (activeTab === "sync") return "Sync";
    if (activeTab === "tracking-items") return "Tracking Items";
    if (activeTab === "values") return "Values";
    if (activeTab === "progress") return "Progress";
    if (activeTab === "bucket") return "Bucket List";
    if (activeTab === "relationships") return "Relationships";
    if (activeTab === "people") {
      if (peopleFilter.kind === "uncategorized") return "Uncategorized";
      if (peopleFilter.kind === "group") {
        return groups.find((g) => g.id === peopleFilter.groupId)?.name ?? "People";
      }
      return "People";
    }
    return "";
  };

  return (
    <main className="flex h-screen bg-black text-white">
      <Toaster position="top-right" />
      {isImportOpen && <BackupImportModal onClose={() => setIsImportOpen(false)} />}

      {/* Desktop sidebar */}
      <div className="hidden md:flex">{renderSidebar(collapsed)}</div>

      {/* Mobile drawer — always full width */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden" onClick={() => setMobileNavOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative z-50" onClick={(e) => e.stopPropagation()}>
            {renderSidebar(false)}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 md:hidden">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="rounded-lg p-2 text-white/60 transition-all hover:bg-white/10 hover:text-white"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm text-white/70">{activeTitle()}</span>
          <span className="w-9" />
        </div>

        <div className="flex-1 overflow-auto">
          {isDataLoading ? (
            <div className="flex h-64 items-center justify-center">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-400" />
              <span className="ml-3 text-slate-300">Loading data...</span>
            </div>
          ) : (
            renderActive()
          )}
        </div>
      </div>
    </main>
  );
}
