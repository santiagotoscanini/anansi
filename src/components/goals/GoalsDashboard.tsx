'use client'

import { useEffect, useRef, useState } from 'react'
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
} from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useGoals } from '~/contexts/GoalsContext'
import { api } from '~/trpc/react'
import toast, { Toaster } from 'react-hot-toast'
import ValuesManager from './ValuesManager'
import GoalsGraph from './GoalsGraph'
import WeeklyRetrospective from './WeeklyRetrospective'
import LifeProgress from './LifeProgress'
import PeopleDirectory, { type PeopleFilter } from './PeopleDirectory'
import RelationshipsBoard from './RelationshipsBoard'
import Self from './Self'
import BucketList from './BucketList'
import TrackingItemsLibrary from './TrackingItemsLibrary'
import Pulse from './Pulse'
import Horizons from './Horizons'
import Tasks from './Tasks'
import BackupImportModal from './BackupImportModal'
import ColorPicker from './ColorPicker'
import ProfileModal from './ProfileModal'
import Avatar from './Avatar'
import { DashboardErrorBoundary } from './DashboardErrorBoundary'
import { AnansiMark, BrandLockup } from './Brand'

type TabType =
  | 'objectives'
  | 'horizons'
  | 'tasks'
  | 'pulse'
  | 'sync'
  | 'tracking-items'
  | 'self'
  | 'values'
  | 'progress'
  | 'bucket'
  | 'people'
  | 'relationships'

const TAB_SLUGS: ReadonlySet<TabType> = new Set([
  'objectives',
  'horizons',
  'tasks',
  'pulse',
  'sync',
  'tracking-items',
  'self',
  'values',
  'progress',
  'bucket',
  'people',
  'relationships',
])
const DEFAULT_TAB: TabType = 'objectives'

const APP_PATH_RE = /^\/app(?:\/([^/]+))?/
function tabFromPathname(pathname: string): TabType {
  const m = APP_PATH_RE.exec(pathname)
  const slug = m?.[1]
  return slug && TAB_SLUGS.has(slug as TabType) ? (slug as TabType) : DEFAULT_TAB
}

// NavItem.nameKey points to a `dashboard.nav.*` key in en.json/es.json so the
// label translates at render time. The id is the URL slug and stays English —
// part of the public route contract. Keys are typed as the union of all
// possible nav-label keys to keep t() happy under the type-augmented module.
type NavNameKey =
  | 'dashboard.nav.pulse'
  | 'dashboard.nav.self'
  | 'dashboard.nav.values'
  | 'dashboard.nav.bucket'
  | 'dashboard.nav.objectives'
  | 'dashboard.nav.horizons'
  | 'dashboard.nav.tasks'
  | 'dashboard.nav.progress'
  | 'dashboard.nav.sync'
  | 'dashboard.nav.trackingItems'
  | 'dashboard.nav.people'
  | 'dashboard.nav.relationships'
type NavItem = { id: TabType; nameKey: NavNameKey; icon: typeof Target }

// Pulse — the at-a-glance summary of Anansi. Lives at the top of the
// sidebar, above all other sections, no header. The other sections are:
//   Compass — the "why" / aspirational surfaces (Values, Bucket List)
//   Goals   — the "what" / active objective work (Objectives, Progress)
//   Sync    — the "when/how" weekly cadence (Sync, Tracking Items)
const pulseNavItem: NavItem = { id: 'pulse', nameKey: 'dashboard.nav.pulse', icon: Activity }

const compassSection: NavItem[] = [
  { id: 'self', nameKey: 'dashboard.nav.self', icon: UserCircle2 },
  { id: 'values', nameKey: 'dashboard.nav.values', icon: Palette },
  { id: 'bucket', nameKey: 'dashboard.nav.bucket', icon: Mountain },
]

const goalsSection: NavItem[] = [
  { id: 'objectives', nameKey: 'dashboard.nav.objectives', icon: Target },
  { id: 'horizons', nameKey: 'dashboard.nav.horizons', icon: Hourglass },
  { id: 'tasks', nameKey: 'dashboard.nav.tasks', icon: ListTodo },
  { id: 'progress', nameKey: 'dashboard.nav.progress', icon: Trophy },
]

const syncSection: NavItem[] = [
  { id: 'sync', nameKey: 'dashboard.nav.sync', icon: Calendar },
  { id: 'tracking-items', nameKey: 'dashboard.nav.trackingItems', icon: ListChecks },
]

const peopleNavItem: NavItem = { id: 'people', nameKey: 'dashboard.nav.people', icon: Users }
const relationshipsNavItem: NavItem = {
  id: 'relationships',
  nameKey: 'dashboard.nav.relationships',
  icon: Network,
}

export default function GoalsDashboard() {
  const { t } = useTranslation()
  const { logout, isDataLoading, goals: allGoals } = useGoals()
  const router = useRouter()
  const pathname = usePathname()
  const activeTab: TabType = tabFromPathname(pathname)
  const setActiveTab = (tab: TabType) => {
    if (tab !== activeTab) router.push(`/app/${tab}`)
  }
  const [peopleFilter, setPeopleFilter] = useState<PeopleFilter>({ kind: 'all' })
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Desktop sidebar layout. Three knobs:
  //   - userPrefCollapsed: whether the user clicked the collapse button
  //   - viewportTooNarrow: forced-collapse below SIDEBAR_AUTOCOLLAPSE_PX so the
  //     main canvas doesn't get crushed on small screens
  //   - expandedWidth: user-chosen width when expanded (drag-to-resize handle on
  //     the right edge). Persisted across sessions.
  // Effective width = collapsed ? COLLAPSED_PX : expandedWidth.
  const SIDEBAR_AUTOCOLLAPSE_PX = 1100
  const COLLAPSED_PX = 56
  const SIDEBAR_MIN_PX = 180
  const SIDEBAR_MAX_PX = 400
  const SIDEBAR_DEFAULT_PX = 224
  const COLLAPSE_THRESHOLD_PX = 110 // dragging below this snaps to collapsed
  const [userPrefCollapsed, setUserPrefCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sidebarCollapsed') === '1'
  })
  const [expandedWidth, setExpandedWidth] = useState(() => {
    if (typeof window === 'undefined') return SIDEBAR_DEFAULT_PX
    const raw = localStorage.getItem('sidebarExpandedWidth')
    const parsed = raw ? parseInt(raw, 10) : NaN
    if (Number.isFinite(parsed)) {
      return Math.min(SIDEBAR_MAX_PX, Math.max(SIDEBAR_MIN_PX, parsed))
    }
    return SIDEBAR_DEFAULT_PX
  })
  const [viewportTooNarrow, setViewportTooNarrow] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < SIDEBAR_AUTOCOLLAPSE_PX
  })
  const [isResizing, setIsResizing] = useState(false)
  useEffect(() => {
    const onResize = () => setViewportTooNarrow(window.innerWidth < SIDEBAR_AUTOCOLLAPSE_PX)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', userPrefCollapsed ? '1' : '0')
  }, [userPrefCollapsed])
  useEffect(() => {
    localStorage.setItem('sidebarExpandedWidth', String(expandedWidth))
  }, [expandedWidth])
  const collapsed = userPrefCollapsed || viewportTooNarrow
  const sidebarWidth = collapsed ? COLLAPSED_PX : expandedWidth
  const setCollapsed = (next: boolean | ((prev: boolean) => boolean)) => {
    setUserPrefCollapsed((prev) => (typeof next === 'function' ? next(prev) : next))
  }

  // Drag-to-resize. The handle is a 4px hot-zone on the right edge of the
  // sidebar; while dragging we attach mousemove/mouseup to document so the
  // drag survives crossing into the main pane. Dragging below
  // COLLAPSE_THRESHOLD_PX snaps to collapsed; dragging back out auto-expands.
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    if (viewportTooNarrow) return // forced-collapse: don't allow drag
    e.preventDefault()
    setIsResizing(true)
    const onMove = (ev: MouseEvent) => {
      const x = ev.clientX
      if (x < COLLAPSE_THRESHOLD_PX) {
        setUserPrefCollapsed(true)
        return
      }
      setUserPrefCollapsed(false)
      setExpandedWidth(Math.min(SIDEBAR_MAX_PX, Math.max(SIDEBAR_MIN_PX, x)))
    }
    const onUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const utils = api.useUtils()
  const groupsQuery = api.goals.groups.getAll.useQuery()
  const peopleQuery = api.goals.people.getAll.useQuery({ includeArchived: false })
  const meQuery = api.auth.me.useQuery()
  const createGroupMutation = api.goals.groups.create.useMutation()

  const [showNewGroupForm, setShowNewGroupForm] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupColor, setNewGroupColor] = useState('#60a5fa')

  const handleLogout = () => {
    logout()
    toast.success(t('dashboard.loggedOut'))
    // Route-based app now — push to /login so the auth screen is the
    // explicit landing surface for a returning user. (The /app route
    // also auto-redirects on isAuthenticated=false, but a `router.push`
    // here gives an instant nav instead of waiting for that effect.)
    router.push('/login')
  }

  const groups = groupsQuery.data ?? []
  const allPeople = peopleQuery.data ?? []
  const peopleCount = allPeople.length
  const uncategorizedCount = allPeople.filter((p) => !p.groupIds || p.groupIds.length === 0).length
  // Group counts span both people and tasks — same `person_groups` rows on
  // both sides ("Family" can hold both my partner and a "call mom" task).
  const countForGroup = (groupId: string) => {
    const p = allPeople.filter((person) => person.groupIds?.includes(groupId)).length
    const t = allGoals.reduce(
      (sum, goal) =>
        sum + goal.tasks.filter((task) => (task.groupIds ?? []).includes(groupId) && !task.completed).length,
      0,
    )
    return p + t
  }

  const goToPeople = (filter: PeopleFilter) => {
    setActiveTab('people')
    setPeopleFilter(filter)
    setMobileNavOpen(false)
  }

  const submitNewGroup = async () => {
    if (!newGroupName.trim()) return
    try {
      await createGroupMutation.mutateAsync({
        name: newGroupName.trim(),
        color: newGroupColor,
        orderIdx: groups.length,
      })
      await utils.goals.groups.getAll.invalidate()
      setNewGroupName('')
      setNewGroupColor('#60a5fa')
      setShowNewGroupForm(false)
      toast.success(t('dashboard.groupCreated'))
    } catch {
      toast.error(t('dashboard.groupCreateFailed'))
    }
  }

  const renderNavItem = (item: NavItem, isCollapsed: boolean, active: boolean, onClick: () => void) => {
    const Icon = item.icon
    const label = t(item.nameKey)
    return (
      <button
        key={item.id}
        onClick={onClick}
        title={isCollapsed ? label : undefined}
        className={`group flex items-center rounded-lg text-[13px] transition-all ${
          isCollapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2'
        }`}
        style={{
          color: active ? 'var(--clay-deep)' : 'var(--ink-2)',
          background: active ? 'var(--clay-soft)' : 'transparent',
          fontWeight: active ? 500 : 400,
        }}
        onMouseEnter={(e) => {
          if (!active) e.currentTarget.style.background = 'var(--vellum)'
        }}
        onMouseLeave={(e) => {
          if (!active) e.currentTarget.style.background = 'transparent'
        }}
      >
        <Icon className="h-[15px] w-[15px] shrink-0" />
        {!isCollapsed && <span>{label}</span>}
      </button>
    )
  }

  const renderSidebar = (isCollapsed: boolean, opts?: { resizable?: boolean; widthPx?: number }) => {
    const resizable = opts?.resizable ?? false
    const widthPx = opts?.widthPx ?? (isCollapsed ? COLLAPSED_PX : expandedWidth)
    return (
      <aside
        style={{
          width: `${widthPx}px`,
          background: 'var(--paper-deep)',
          borderRight: '1px solid var(--hairline)',
          color: 'var(--ink)',
        }}
        className={`relative flex h-full shrink-0 flex-col ${isResizing ? '' : 'transition-[width] duration-200'}`}
      >
        {/* Brand lockup + chrome controls — italic Cormorant wordmark with
            the clay drop on the 'i', or the mark alone when collapsed. */}
        <div className={`flex items-center py-5 ${isCollapsed ? 'justify-center px-2' : 'justify-between px-5'}`}>
          {isCollapsed ? <AnansiMark size={22} /> : <BrandLockup size={20} />}
          <button
            onClick={() => setMobileNavOpen(false)}
            className="rounded p-1 transition-all md:hidden"
            style={{ color: 'var(--ink-3)' }}
            aria-label={t('dashboard.closeNavigation')}
          >
            <X className="h-5 w-5" />
          </button>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden rounded p-1 transition-all md:inline-flex"
            style={{ color: 'var(--ink-3)' }}
            aria-label={isCollapsed ? t('dashboard.expandSidebar') : t('dashboard.collapseSidebar')}
            title={isCollapsed ? t('dashboard.expandSidebar') : t('dashboard.collapseSidebar')}
          >
            {isCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Nav — Pulse / Compass / Goals / Sync / Connections */}
        <nav className={`flex flex-1 flex-col gap-1 overflow-y-auto ${isCollapsed ? 'px-2' : 'px-3'}`}>
          {/* Pulse — top-level summary, no section header */}
          {renderNavItem(pulseNavItem, isCollapsed, activeTab === 'pulse', () => {
            setActiveTab('pulse')
            setMobileNavOpen(false)
          })}

          {/* Compass section */}
          {!isCollapsed ? (
            <div
              className="mb-1 mt-4 px-2 text-[10px] font-medium uppercase tracking-[0.12em]"
              style={{ color: 'var(--ink-3)' }}
            >
              {t('dashboard.sections.compass')}
            </div>
          ) : (
            <div className="my-2 h-px" style={{ background: 'var(--hairline)' }} />
          )}
          {compassSection.map((item) =>
            renderNavItem(item, isCollapsed, activeTab === item.id, () => {
              setActiveTab(item.id)
              setMobileNavOpen(false)
            }),
          )}

          {/* Goals section */}
          {!isCollapsed ? (
            <div
              className="mb-1 mt-4 px-2 text-[10px] font-medium uppercase tracking-[0.12em]"
              style={{ color: 'var(--ink-3)' }}
            >
              {t('dashboard.sections.goals')}
            </div>
          ) : (
            <div className="my-2 h-px" style={{ background: 'var(--hairline)' }} />
          )}
          {goalsSection.map((item) =>
            renderNavItem(item, isCollapsed, activeTab === item.id, () => {
              setActiveTab(item.id)
              setMobileNavOpen(false)
            }),
          )}

          {/* Sync section */}
          {!isCollapsed ? (
            <div
              className="mb-1 mt-4 px-2 text-[10px] font-medium uppercase tracking-[0.12em]"
              style={{ color: 'var(--ink-3)' }}
            >
              {t('dashboard.sections.sync')}
            </div>
          ) : (
            <div className="my-2 h-px" style={{ background: 'var(--hairline)' }} />
          )}
          {syncSection.map((item) =>
            renderNavItem(item, isCollapsed, activeTab === item.id, () => {
              setActiveTab(item.id)
              setMobileNavOpen(false)
            }),
          )}

          {/* Connections section */}
          {!isCollapsed ? (
            <div
              className="mb-1 mt-4 px-2 text-[10px] font-medium uppercase tracking-[0.12em]"
              style={{ color: 'var(--ink-3)' }}
            >
              {t('dashboard.sections.connections')}
            </div>
          ) : (
            <div className="my-2 h-px" style={{ background: 'var(--hairline)' }} />
          )}

          {/* People — only active when no group filter is on */}
          {(() => {
            const active = activeTab === 'people' && peopleFilter.kind === 'all'
            const Icon = peopleNavItem.icon
            const peopleLabel = t(peopleNavItem.nameKey)
            return (
              <button
                onClick={() => goToPeople({ kind: 'all' })}
                title={isCollapsed ? peopleLabel : undefined}
                className={`flex items-center rounded-lg text-[13px] transition-all ${
                  isCollapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2'
                }`}
                style={{
                  color: active ? 'var(--clay-deep)' : 'var(--ink-2)',
                  background: active ? 'var(--clay-soft)' : 'transparent',
                  fontWeight: active ? 500 : 400,
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = 'var(--vellum)'
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = 'transparent'
                }}
              >
                <Icon className="h-[15px] w-[15px] shrink-0" />
                {!isCollapsed && (
                  <span className="flex flex-1 items-center justify-between">
                    <span>{peopleLabel}</span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        color: active ? 'var(--clay-deep)' : 'var(--ink-3)',
                      }}
                    >
                      {peopleCount}
                    </span>
                  </span>
                )}
              </button>
            )
          })()}

          {/* Relationships */}
          {renderNavItem(relationshipsNavItem, isCollapsed, activeTab === 'relationships', () => {
            setActiveTab('relationships')
            setMobileNavOpen(false)
          })}

          {/* Groups section — flat list, no nesting */}
          {!isCollapsed && (
            <>
              <div className="mb-1 mt-4 flex items-center justify-between px-2">
                <span className="text-[10px] font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--ink-3)' }}>
                  {t('dashboard.sections.groups')}
                </span>
                <button
                  onClick={() => setShowNewGroupForm(true)}
                  title={t('dashboard.newGroup')}
                  className="rounded p-0.5 transition-all"
                  style={{ color: 'var(--ink-3)' }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Uncategorized — pseudo-group at the top */}
              {(() => {
                const selected = activeTab === 'people' && peopleFilter.kind === 'uncategorized'
                return (
                  <button
                    onClick={() => goToPeople({ kind: 'uncategorized' })}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-[13px] transition-all"
                    style={{
                      color: selected ? 'var(--clay-deep)' : 'var(--ink-2)',
                      background: selected ? 'var(--clay-soft)' : 'transparent',
                      fontWeight: selected ? 500 : 400,
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) e.currentTarget.style.background = 'var(--vellum)'
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <span className="flex items-center gap-3">
                      <span className="h-2 w-2 rounded-full" style={{ border: '1px solid var(--ink-4)' }} />
                      <span>{t('dashboard.uncategorized')}</span>
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)' }}>
                      {uncategorizedCount}
                    </span>
                  </button>
                )
              })()}

              {groups.map((g) => {
                const selected =
                  activeTab === 'people' && peopleFilter.kind === 'group' && peopleFilter.groupId === g.id
                return (
                  <button
                    key={g.id}
                    onClick={() => goToPeople({ kind: 'group', groupId: g.id })}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-[13px] transition-all"
                    style={{
                      color: selected ? 'var(--clay-deep)' : 'var(--ink-2)',
                      background: selected ? 'var(--clay-soft)' : 'transparent',
                      fontWeight: selected ? 500 : 400,
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) e.currentTarget.style.background = 'var(--vellum)'
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: g.color }} />
                      <span className="truncate">{g.name}</span>
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)' }}>
                      {countForGroup(g.id)}
                    </span>
                  </button>
                )
              })}

              {showNewGroupForm && (
                <div className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: 'var(--vellum)' }}>
                  <ColorPicker value={newGroupColor} onChange={setNewGroupColor} size="sm" />
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void submitNewGroup()
                      if (e.key === 'Escape') {
                        setShowNewGroupForm(false)
                        setNewGroupName('')
                      }
                    }}
                    placeholder={t('dashboard.groupNamePlaceholder')}
                    className="flex-1 bg-transparent text-sm outline-none"
                    style={{ color: 'var(--ink)' }}
                    autoFocus
                  />
                </div>
              )}
            </>
          )}
        </nav>

        {/* User pill — opens menu with Profile and Log out. Backups live inside Profile. */}
        <div className={`py-3 ${isCollapsed ? 'px-2' : 'px-3'}`} style={{ borderTop: '1px solid var(--hairline)' }}>
          <UserMenu
            isCollapsed={isCollapsed}
            user={meQuery.data ?? null}
            onProfile={() => {
              setIsProfileOpen(true)
              setMobileNavOpen(false)
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
            aria-label={t('dashboard.resizeSidebar')}
            role="separator"
          >
            <span
              className="h-full w-px transition-colors"
              style={{
                background: isResizing ? 'var(--clay)' : 'transparent',
              }}
            />
          </div>
        )}
      </aside>
    )
  }

  const renderActive = () => {
    switch (activeTab) {
      case 'objectives':
        return <GoalsGraph />
      case 'horizons':
        return <Horizons />
      case 'tasks':
        return <Tasks />
      case 'pulse':
        return <Pulse />
      case 'sync':
        return <WeeklyRetrospective />
      case 'tracking-items':
        return <TrackingItemsLibrary />
      case 'self':
        return <Self />
      case 'values':
        return <ValuesManager />
      case 'progress':
        return <LifeProgress />
      case 'bucket':
        return <BucketList />
      case 'people':
        return <PeopleDirectory filter={peopleFilter} onFilterChange={setPeopleFilter} />
      case 'relationships':
        return <RelationshipsBoard />
    }
  }

  // The mobile top-bar title — derived from the active tab. For grouped
  // people views, the user-supplied group name takes precedence; only the
  // "all people" / "uncategorized" labels are translated.
  const activeTitle = (): string => {
    if (activeTab === 'objectives') return t('dashboard.nav.objectives')
    if (activeTab === 'horizons') return t('dashboard.nav.horizons')
    if (activeTab === 'tasks') return t('dashboard.nav.tasks')
    if (activeTab === 'pulse') return t('dashboard.nav.pulse')
    if (activeTab === 'sync') return t('dashboard.nav.sync')
    if (activeTab === 'tracking-items') return t('dashboard.nav.trackingItems')
    if (activeTab === 'self') return t('dashboard.nav.self')
    if (activeTab === 'values') return t('dashboard.nav.values')
    if (activeTab === 'progress') return t('dashboard.nav.progress')
    if (activeTab === 'bucket') return t('dashboard.nav.bucket')
    if (activeTab === 'relationships') return t('dashboard.nav.relationships')
    if (activeTab === 'people') {
      if (peopleFilter.kind === 'uncategorized') return t('dashboard.uncategorized')
      if (peopleFilter.kind === 'group') {
        return groups.find((g) => g.id === peopleFilter.groupId)?.name ?? t('dashboard.nav.people')
      }
      return t('dashboard.nav.people')
    }
    return ''
  }

  return (
    <main className="flex h-screen" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
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
          <div className="absolute inset-0" style={{ background: 'rgba(28, 20, 8, 0.45)' }} />
          <div className="relative z-50" onClick={(e) => e.stopPropagation()}>
            {renderSidebar(false, { widthPx: SIDEBAR_DEFAULT_PX })}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div
          className="flex items-center justify-between px-4 py-3 md:hidden"
          style={{ borderBottom: '1px solid var(--hairline)', background: 'var(--paper)' }}
        >
          <button
            onClick={() => setMobileNavOpen(true)}
            className="rounded-lg p-2 transition-all"
            style={{ color: 'var(--ink-2)' }}
            aria-label={t('dashboard.openNavigation')}
          >
            <Menu className="h-5 w-5" />
          </button>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--ink)' }}>{activeTitle()}</span>
          <span className="w-9" />
        </div>

        <div className="flex-1 overflow-auto">
          {isDataLoading ? (
            <div className="flex h-64 items-center justify-center" style={{ color: 'var(--ink-3)' }}>
              <RefreshCw className="h-5 w-5 animate-spin" style={{ color: 'var(--clay)' }} />
              <span className="ml-3 text-sm italic" style={{ fontFamily: 'var(--font-text)' }}>
                {t('dashboard.lookingForThreads')}
              </span>
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
  )
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
  isCollapsed: boolean
  user: { name: string; email: string; avatarUrl: string | null } | null
  onProfile: () => void
  onLogout: () => void
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const { t } = useTranslation()
  const displayName = user?.name ?? t('dashboard.account')
  const displayEmail = user?.email ?? ''

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={isCollapsed ? displayName : undefined}
        className={`flex w-full items-center rounded-lg transition-all ${
          isCollapsed ? 'justify-center px-0 py-1.5' : 'gap-3 px-2 py-2'
        }`}
        style={{ color: 'var(--ink-2)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--vellum)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <Avatar name={displayName} emoji={user?.avatarUrl ?? null} size="sm" shape="circle" />
        {!isCollapsed && (
          <>
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate text-[13px]" style={{ color: 'var(--ink)' }}>
                {displayName}
              </div>
              {displayEmail && (
                <div className="truncate text-[10px]" style={{ color: 'var(--ink-3)' }}>
                  {displayEmail}
                </div>
              )}
            </div>
            <ChevronUp className="h-4 w-4 shrink-0" style={{ color: 'var(--ink-3)' }} />
          </>
        )}
      </button>
      {open && (
        <div
          className={`absolute z-30 rounded-lg p-1 ${
            isCollapsed ? 'bottom-full left-full ml-2 w-44' : 'bottom-full left-0 right-0 mb-2'
          }`}
          style={{
            background: 'var(--canvas)',
            border: '1px solid var(--hairline-2)',
            boxShadow: 'var(--shadow-pop)',
          }}
        >
          <button
            onClick={() => {
              setOpen(false)
              onProfile()
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] transition-all"
            style={{ color: 'var(--ink)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--vellum)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Settings className="h-4 w-4" style={{ color: 'var(--ink-3)' }} /> {t('dashboard.profileMenuItem')}
          </button>
          <button
            onClick={() => {
              setOpen(false)
              onLogout()
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] transition-all"
            style={{ color: 'var(--ink)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--vellum)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <LogOut className="h-4 w-4" style={{ color: 'var(--ink-3)' }} /> {t('dashboard.logOutMenuItem')}
          </button>
        </div>
      )}
    </div>
  )
}
