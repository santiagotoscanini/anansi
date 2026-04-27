"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronUp,
  LogOut,
  Target,
  Calendar,
  Palette,
  Trophy,
  Mountain,
  RefreshCw,
  Settings,
  Users,
  Network,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
  Plus,
  ListChecks,
  ListTodo,
  Activity,
  Hourglass,
  UserCircle2,
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
import Self from "./Self";
import BucketList from "./BucketList";
import TrackingItemsLibrary from "./TrackingItemsLibrary";
import Pulse from "./Pulse";
import Horizons from "./Horizons";
import Tasks from "./Tasks";
import BackupImportModal from "./BackupImportModal";
import ColorPicker from "./ColorPicker";
import ProfileModal from "./ProfileModal";
import Avatar from "./Avatar";
import { DashboardErrorBoundary } from "./DashboardErrorBoundary";

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
  | "horizons"
  | "tasks"
  | "pulse"
  | "sync"
  | "tracking-items"
  | "self"
  | "values"
  | "progress"
  | "bucket"
  | "people"
  | "relationships";

type NavItem = { id: TabType; name: string; icon: typeof Target };

// Pulse — the at-a-glance summary of Anansi. Lives at the top of the
// sidebar, above all other sections, no header. The other sections are:
//   Compass — the "why" / aspirational surfaces (Values, Bucket List)
//   Goals   — the "what" / active objective work (Objectives, Progress)
//   Sync    — the "when/how" weekly cadence (Sync, Tracking Items)
const pulseNavItem: NavItem = { id: "pulse", name: "Pulse", icon: Activity };

const compassSection: NavItem[] = [
  { id: "self", name: "Self", icon: UserCircle2 },
  { id: "values", name: "Values", icon: Palette },
  { id: "bucket", name: "Bucket List", icon: Mountain },
];

const goalsSection: NavItem[] = [
  { id: "objectives", name: "Objectives", icon: Target },
  { id: "horizons", name: "Horizons", icon: Hourglass },
  { id: "tasks", name: "Tasks", icon: ListTodo },
  { id: "progress", name: "Progress", icon: Trophy },
];

const syncSection: NavItem[] = [
  { id: "sync", name: "Sync", icon: Calendar },
  { id: "tracking-items", name: "Tracking Items", icon: ListChecks },
];

const peopleNavItem: NavItem = { id: "people", name: "People", icon: Users };
const relationshipsNavItem: NavItem = { id: "relationships", name: "Relationships", icon: Network };

export default function GoalsDashboard() {
  const { logout, isDataLoading, goals: allGoals } = useGoals();
  const [activeTab, setActiveTab] = useState<TabType>("objectives");
  const [peopleFilter, setPeopleFilter] = useState<PeopleFilter>({ kind: "all" });
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Desktop sidebar layout. Three knobs:
  //   - userPrefCollapsed: whether the user clicked the collapse button
  //   - viewportTooNarrow: forced-collapse below SIDEBAR_AUTOCOLLAPSE_PX so the
  //     main canvas doesn't get crushed on small screens
  //   - expandedWidth: user-chosen width when expanded (drag-to-resize handle on
  //     the right edge). Persisted across sessions.
  // Effective width = collapsed ? COLLAPSED_PX : expandedWidth.
  const SIDEBAR_AUTOCOLLAPSE_PX = 1100;
  const COLLAPSED_PX = 56;
  const SIDEBAR_MIN_PX = 180;
  const SIDEBAR_MAX_PX = 400;
  const SIDEBAR_DEFAULT_PX = 224;
  const COLLAPSE_THRESHOLD_PX = 110; // dragging below this snaps to collapsed
  const [userPrefCollapsed, setUserPrefCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebarCollapsed") === "1";
  });
  const [expandedWidth, setExpandedWidth] = useState(() => {
    if (typeof window === "undefined") return SIDEBAR_DEFAULT_PX;
    const raw = localStorage.getItem("sidebarExpandedWidth");
    const parsed = raw ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed)) {
      return Math.min(SIDEBAR_MAX_PX, Math.max(SIDEBAR_MIN_PX, parsed));
    }
    return SIDEBAR_DEFAULT_PX;
  });
  const [viewportTooNarrow, setViewportTooNarrow] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < SIDEBAR_AUTOCOLLAPSE_PX;
  });
  const [isResizing, setIsResizing] = useState(false);
  useEffect(() => {
    const onResize = () => setViewportTooNarrow(window.innerWidth < SIDEBAR_AUTOCOLLAPSE_PX);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", userPrefCollapsed ? "1" : "0");
  }, [userPrefCollapsed]);
  useEffect(() => {
    localStorage.setItem("sidebarExpandedWidth", String(expandedWidth));
  }, [expandedWidth]);
  const collapsed = userPrefCollapsed || viewportTooNarrow;
  const sidebarWidth = collapsed ? COLLAPSED_PX : expandedWidth;
  const setCollapsed = (next: boolean | ((prev: boolean) => boolean)) => {
    setUserPrefCollapsed((prev) => (typeof next === "function" ? next(prev) : next));
  };

  // Drag-to-resize. The handle is a 4px hot-zone on the right edge of the
  // sidebar; while dragging we attach mousemove/mouseup to document so the
  // drag survives crossing into the main pane. Dragging below
  // COLLAPSE_THRESHOLD_PX snaps to collapsed; dragging back out auto-expands.
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    if (viewportTooNarrow) return; // forced-collapse: don't allow drag
    e.preventDefault();
    setIsResizing(true);
    const onMove = (ev: MouseEvent) => {
      const x = ev.clientX;
      if (x < COLLAPSE_THRESHOLD_PX) {
        setUserPrefCollapsed(true);
        return;
      }
      setUserPrefCollapsed(false);
      setExpandedWidth(Math.min(SIDEBAR_MAX_PX, Math.max(SIDEBAR_MIN_PX, x)));
    };
    const onUp = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const utils = api.useUtils();
  const groupsQuery = api.goals.groups.getAll.useQuery();
  const peopleQuery = api.goals.people.getAll.useQuery({ includeArchived: false });
  const meQuery = api.auth.me.useQuery();
  const createGroupMutation = api.goals.groups.create.useMutation();

  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState("#60a5fa");

  const handleLogout = () => {
    logout();
    toast.success("Logged out successfully");
  };

  const groups = groupsQuery.data ?? [];
  const allPeople = peopleQuery.data ?? [];
  const peopleCount = allPeople.length;
  const uncategorizedCount = allPeople.filter((p) => !p.groupIds || p.groupIds.length === 0).length;
  // Group counts span both people and tasks — same `person_groups` rows on
  // both sides ("Family" can hold both my partner and a "call mom" task).
  const countForGroup = (groupId: string) => {
    const p = allPeople.filter((person) => person.groupIds?.includes(groupId)).length;
    const t = allGoals.reduce(
      (sum, goal) =>
        sum + goal.tasks.filter((task) => (task.groupIds ?? []).includes(groupId) && !task.completed).length,
      0,
    );
    return p + t;
  };

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

  const renderSidebar = (isCollapsed: boolean, opts?: { resizable?: boolean; widthPx?: number }) => {
    const resizable = opts?.resizable ?? false;
    const widthPx = opts?.widthPx ?? (isCollapsed ? COLLAPSED_PX : expandedWidth);
    return (
      <aside
        style={{ width: `${widthPx}px` }}
        className={`relative flex h-full shrink-0 flex-col border-r border-white/10 bg-black ${
          isResizing ? "" : "transition-[width] duration-200"
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

        {/* Nav — Pulse / Compass / Goals / Sync / Connections */}
        <nav className={`flex flex-1 flex-col gap-1 overflow-y-auto ${isCollapsed ? "px-2" : "px-3"}`}>
          {/* Pulse — top-level summary, no section header */}
          {renderNavItem(pulseNavItem, isCollapsed, activeTab === "pulse", () => {
            setActiveTab("pulse");
            setMobileNavOpen(false);
          })}

          {/* Compass section */}
          {!isCollapsed ? (
            <div className="mb-1 mt-4 px-2 text-[10px] uppercase tracking-wider text-white/30">Compass</div>
          ) : (
            <div className="my-2 h-px bg-white/10" />
          )}
          {compassSection.map((item) =>
            renderNavItem(item, isCollapsed, activeTab === item.id, () => {
              setActiveTab(item.id);
              setMobileNavOpen(false);
            }),
          )}

          {/* Goals section */}
          {!isCollapsed ? (
            <div className="mb-1 mt-4 px-2 text-[10px] uppercase tracking-wider text-white/30">Goals</div>
          ) : (
            <div className="my-2 h-px bg-white/10" />
          )}
          {goalsSection.map((item) =>
            renderNavItem(item, isCollapsed, activeTab === item.id, () => {
              setActiveTab(item.id);
              setMobileNavOpen(false);
            }),
          )}

          {/* Sync section */}
          {!isCollapsed ? (
            <div className="mb-1 mt-4 px-2 text-[10px] uppercase tracking-wider text-white/30">Sync</div>
          ) : (
            <div className="my-2 h-px bg-white/10" />
          )}
          {syncSection.map((item) =>
            renderNavItem(item, isCollapsed, activeTab === item.id, () => {
              setActiveTab(item.id);
              setMobileNavOpen(false);
            }),
          )}

          {/* Connections section */}
          {!isCollapsed ? (
            <div className="mb-1 mt-4 px-2 text-[10px] uppercase tracking-wider text-white/30">Connections</div>
          ) : (
            <div className="my-2 h-px bg-white/10" />
          )}

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
                return (
                  <button
                    key={g.id}
                    onClick={() => goToPeople({ kind: "group", groupId: g.id })}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-all ${
                      selected ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: g.color }} />
                      <span className="truncate">{g.name}</span>
                    </span>
                    <span className="text-xs text-white/40">{countForGroup(g.id)}</span>
                  </button>
                );
              })}

              {showNewGroupForm && (
                <div className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
                  <ColorPicker value={newGroupColor} onChange={setNewGroupColor} size="sm" />
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

        {/* User pill — opens menu with Profile and Log out. Backups live inside Profile. */}
        <div className={`border-t border-white/10 py-3 ${isCollapsed ? "px-2" : "px-3"}`}>
          <UserMenu
            isCollapsed={isCollapsed}
            user={meQuery.data ?? null}
            onProfile={() => {
              setIsProfileOpen(true);
              setMobileNavOpen(false);
            }}
            onLogout={handleLogout}
          />
        </div>

        {/* Drag handle — sits on the right edge, hot-zone is wider than the
            visible 1px line so it's easy to grab. Hidden on mobile drawer. */}
        {resizable && !viewportTooNarrow && (
          <div
            onMouseDown={handleResizeMouseDown}
            className="group absolute right-0 top-0 z-10 -mr-0.5 flex h-full w-1.5 cursor-col-resize items-center justify-center"
            aria-label="Resize sidebar"
            role="separator"
          >
            <span
              className={`h-full w-px transition-colors ${
                isResizing ? "bg-blue-400" : "bg-transparent group-hover:bg-white/20"
              }`}
            />
          </div>
        )}
      </aside>
    );
  };

  const renderActive = () => {
    switch (activeTab) {
      case "objectives":
        return <GoalsGraph />;
      case "horizons":
        return <Horizons />;
      case "tasks":
        return <Tasks />;
      case "pulse":
        return <Pulse />;
      case "sync":
        return <WeeklyRetrospective />;
      case "tracking-items":
        return <TrackingItemsLibrary />;
      case "self":
        return <Self />;
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
    if (activeTab === "horizons") return "Horizons";
    if (activeTab === "tasks") return "Tasks";
    if (activeTab === "pulse") return "Pulse";
    if (activeTab === "sync") return "Sync";
    if (activeTab === "tracking-items") return "Tracking Items";
    if (activeTab === "self") return "Self";
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
      {isProfileOpen && (
        <ProfileModal
          onClose={() => setIsProfileOpen(false)}
          onLogout={handleLogout}
          onImportBackup={() => setIsImportOpen(true)}
        />
      )}

      {/* Desktop sidebar */}
      <div className="hidden md:flex">{renderSidebar(collapsed, { resizable: true, widthPx: sidebarWidth })}</div>

      {/* Mobile drawer — fixed default width, no drag handle */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden" onClick={() => setMobileNavOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative z-50" onClick={(e) => e.stopPropagation()}>
            {renderSidebar(false, { widthPx: SIDEBAR_DEFAULT_PX })}
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
            // resetKey scoped to activeTab so a crashed tab can be escaped by
            // switching tabs (the boundary clears its error state on key
            // change and gives the new tab a fresh render).
            <DashboardErrorBoundary resetKey={activeTab}>{renderActive()}</DashboardErrorBoundary>
          )}
        </div>
      </div>
    </main>
  );
}

// ---------------- UserMenu ----------------
// Bottom-of-sidebar pill that shows the current user. Click to pop a small
// menu with Profile and Log out. Backups live inside the Profile modal.
function UserMenu({
  isCollapsed,
  user,
  onProfile,
  onLogout,
}: {
  isCollapsed: boolean;
  user: { name: string; email: string; avatarUrl: string | null } | null;
  onProfile: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const displayName = user?.name ?? "Account";
  const displayEmail = user?.email ?? "";

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={isCollapsed ? displayName : undefined}
        className={`flex w-full items-center rounded-lg text-sm transition-all ${
          isCollapsed ? "justify-center px-0 py-1.5" : "gap-3 px-2 py-2"
        } text-white/70 hover:bg-white/5 hover:text-white`}
      >
        <Avatar name={displayName} emoji={user?.avatarUrl ?? null} size="sm" shape="circle" />
        {!isCollapsed && (
          <>
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate text-sm">{displayName}</div>
              {displayEmail && <div className="truncate text-[11px] text-white/40">{displayEmail}</div>}
            </div>
            <ChevronUp className="h-4 w-4 shrink-0 text-white/40" />
          </>
        )}
      </button>
      {open && (
        <div
          className={`absolute z-30 rounded-lg border border-white/10 bg-zinc-950 p-1 shadow-2xl ${
            isCollapsed ? "bottom-full left-full ml-2 w-44" : "bottom-full left-0 right-0 mb-2"
          }`}
        >
          <button
            onClick={() => {
              setOpen(false);
              onProfile();
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-white/80 transition-all hover:bg-white/10 hover:text-white"
          >
            <Settings className="h-4 w-4 text-white/50" /> Profile
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-white/80 transition-all hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4 text-white/50" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
