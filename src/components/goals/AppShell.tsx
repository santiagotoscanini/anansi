import { useEffect, useRef, useState } from 'react'
import {
  ChevronUp,
  LogOut,
  Target,
  Calendar,
  Palette,
  Trophy,
  Mountain,
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
import { getRouteApi, useNavigate, useRouterState } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { useSignOut } from '~/lib/mutations/auth'
import { useCreateGroup } from '~/lib/mutations/people'
import { useGoalsData } from '~/lib/queries/goals'
import { groupsQueryOptions, peopleQueryOptions } from '~/lib/queries/people'
import { meQueryOptions } from '~/lib/queries/session'
import {
  SIDEBAR_AUTOCOLLAPSE_PX,
  SIDEBAR_COLLAPSED_PX,
  SIDEBAR_COLLAPSE_THRESHOLD_PX,
  SIDEBAR_DEFAULT_GEOMETRY,
  SIDEBAR_DEFAULT_PX,
  clampSidebarWidth,
  writeSidebarCookie,
} from '~/lib/sidebar'
import BackupImportModal from './BackupImportModal'
import ColorPicker from './ColorPicker'
import ProfileModal from './ProfileModal'
import Avatar from './Avatar'
import { AnansiMark, BrandLockup } from './Brand'

// The authenticated chrome: sidebar, mobile drawer, user menu, and the two
// global modals. Everything below the top bar is the active tab's route,
// rendered as `children`.
//
// Was GoalsDashboard, which also owned a 12-way switch on the active tab and
// the tab's loading state. Both are gone: the route tree is the switch, and the
// loader prefetch removed the loading state entirely.

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

// `/app` itself renders the graph, so a bare /app is 'objectives' — the same
// mapping the Next version used, kept because it is the URL people bookmarked.
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

// The People tab's filter lives in its own search params, which the shell sits
// above and so cannot read through a typed hook. Reading it off the raw
// location keeps the sidebar highlight in sync with the URL without the layout
// having to redeclare the tab's schema.
type PeopleSearch = { filter?: string; groupId?: string }

// The sidebar geometry is resolved in the ROOT loader (it comes from a cookie
// the document shell also needs), so it is read through the root route's API
// rather than a typed `Route.useLoaderData()` — AppShell is a component under
// /app, not a route module of its own.
const rootRoute = getRouteApi('__root__')

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useRouterState({ select: (s) => s.location })
  const activeTab: TabType = tabFromPathname(location.pathname)
  const peopleSearch = (activeTab === 'people' ? location.search : {}) as PeopleSearch
  const peopleFilterKind = peopleSearch.filter ?? 'all'

  const signOut = useSignOut()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Desktop sidebar layout. Three knobs:
  //   - userPrefCollapsed: whether the user clicked the collapse button
  //   - viewportTooNarrow: forced-collapse below SIDEBAR_AUTOCOLLAPSE_PX so the
  //     main canvas doesn't get crushed on small screens
  //   - expandedWidth: user-chosen width when expanded (drag-to-resize handle on
  //     the right edge). Persisted across sessions.
  // Effective width = collapsed ? SIDEBAR_COLLAPSED_PX : expandedWidth.
  //
  // All three are seeded from the `anansi:sidebar` cookie, resolved server-side
  // in the root loader. They used to be read from localStorage and
  // window.innerWidth inside these useState initializers, which the server
  // cannot do — so SSR always emitted a 224px expanded sidebar and the client
  // corrected it on the first commit. That was a hydration mismatch and a
  // visible width jump for anyone who had collapsed or resized the sidebar.
  // Seeding from a value the server also saw makes both renders agree.
  const initial = rootRoute.useLoaderData().initialSidebar ?? SIDEBAR_DEFAULT_GEOMETRY
  const [userPrefCollapsed, setUserPrefCollapsed] = useState(initial.collapsed)
  const [expandedWidth, setExpandedWidth] = useState(initial.width)
  const [viewportTooNarrow, setViewportTooNarrow] = useState(false)
  const [isResizing, setIsResizing] = useState(false)

  // NOTE: the pre-cookie `sidebarCollapsed` / `sidebarExpandedWidth`
  // localStorage keys are deliberately NOT migrated. Every way to carry them
  // over either reads localStorage in the useState initializer — reintroducing
  // the exact hydration mismatch this change removes — or sets state from an
  // effect, which `react-hooks/set-state-in-effect` rejects for good reason.
  // The cost of not migrating is that the sidebar resets to 224px expanded once,
  // and one drag restores it permanently. That is a better trade than either
  // workaround, and the stale keys are harmless.
  useEffect(() => {
    // Runs on mount as well as on resize, which is what reconciles the cookie's
    // remembered state with the actual viewport — the one input the server
    // genuinely cannot know.
    const onResize = () => setViewportTooNarrow(window.innerWidth < SIDEBAR_AUTOCOLLAPSE_PX)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const collapsed = userPrefCollapsed || viewportTooNarrow
  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED_PX : expandedWidth

  // Persist the EFFECTIVE geometry, not the preference: `collapsed` folds in
  // viewportTooNarrow, and it is the rendered result the next SSR pass needs to
  // reproduce. Skipped mid-drag so a resize writes one cookie on mouse-up
  // instead of one per mousemove.
  useEffect(() => {
    if (isResizing) return
    writeSidebarCookie({ collapsed, width: expandedWidth })
  }, [collapsed, expandedWidth, isResizing])
  const setCollapsed = (next: boolean | ((prev: boolean) => boolean)) => {
    setUserPrefCollapsed((prev) => (typeof next === 'function' ? next(prev) : next))
  }

  // Drag-to-resize. The handle is a 4px hot-zone on the right edge of the
  // sidebar; while dragging we attach mousemove/mouseup to document so the
  // drag survives crossing into the main pane. Dragging below
  // SIDEBAR_COLLAPSE_THRESHOLD_PX snaps to collapsed; dragging back out auto-expands.
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    if (viewportTooNarrow) return // forced-collapse: don't allow drag
    e.preventDefault()
    setIsResizing(true)
    const onMove = (ev: MouseEvent) => {
      const x = ev.clientX
      if (x < SIDEBAR_COLLAPSE_THRESHOLD_PX) {
        setUserPrefCollapsed(true)
        return
      }
      setUserPrefCollapsed(false)
      setExpandedWidth(clampSidebarWidth(x))
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

  // All four are prefetched by the /app loader, so these resolve from cache.
  const { data: groups } = useSuspenseQuery(groupsQueryOptions())
  const { data: allPeople } = useSuspenseQuery(peopleQueryOptions(false))
  const { data: me } = useSuspenseQuery(meQueryOptions())
  const { goals: allGoals } = useGoalsData()
  const createGroup = useCreateGroup()

  const [showNewGroupForm, setShowNewGroupForm] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupColor, setNewGroupColor] = useState('#60a5fa')

  const setActiveTab = (tab: TabType) => {
    if (tab !== activeTab) void navigate({ to: `/app/${tab}` })
  }

  const openModal = (modal: 'profile' | 'import') => {
    void navigate({ to: '.', search: (prev) => ({ ...prev, modal }), replace: true })
  }
  const closeModal = () => {
    void navigate({ to: '.', search: ({ modal: _modal, ...rest }) => rest, replace: true })
  }
  const openModalName = (location.search as { modal?: 'profile' | 'import' }).modal

  const handleLogout = () => {
    void (async () => {
      await signOut()
      toast.success(t('dashboard.loggedOut'))
      void navigate({ to: '/login', search: { next: undefined } })
    })()
  }

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

  const goToPeople = (search: { filter: 'all' | 'uncategorized' | 'group'; groupId?: string }) => {
    void navigate({ to: '/app/people', search })
    setMobileNavOpen(false)
  }

  const submitNewGroup = async () => {
    if (!newGroupName.trim()) return
    try {
      await createGroup.mutateAsync({
        name: newGroupName.trim(),
        color: newGroupColor,
        orderIdx: groups.length,
      })
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
    const widthPx = opts?.widthPx ?? (isCollapsed ? SIDEBAR_COLLAPSED_PX : expandedWidth)
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
              className="mt-4 mb-1 px-2 text-[10px] font-medium tracking-[0.12em] uppercase"
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
              className="mt-4 mb-1 px-2 text-[10px] font-medium tracking-[0.12em] uppercase"
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
              className="mt-4 mb-1 px-2 text-[10px] font-medium tracking-[0.12em] uppercase"
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
              className="mt-4 mb-1 px-2 text-[10px] font-medium tracking-[0.12em] uppercase"
              style={{ color: 'var(--ink-3)' }}
            >
              {t('dashboard.sections.connections')}
            </div>
          ) : (
            <div className="my-2 h-px" style={{ background: 'var(--hairline)' }} />
          )}

          {/* People — only active when no group filter is on */}
          {(() => {
            const active = activeTab === 'people' && peopleFilterKind === 'all'
            const Icon = peopleNavItem.icon
            const peopleLabel = t(peopleNavItem.nameKey)
            return (
              <button
                onClick={() => goToPeople({ filter: 'all' })}
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
              <div className="mt-4 mb-1 flex items-center justify-between px-2">
                <span className="text-[10px] font-medium tracking-[0.12em] uppercase" style={{ color: 'var(--ink-3)' }}>
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
                const selected = activeTab === 'people' && peopleFilterKind === 'uncategorized'
                return (
                  <button
                    onClick={() => goToPeople({ filter: 'uncategorized' })}
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
                const selected = activeTab === 'people' && peopleFilterKind === 'group' && peopleSearch.groupId === g.id
                return (
                  <button
                    key={g.id}
                    onClick={() => goToPeople({ filter: 'group', groupId: g.id })}
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
                    className="flex-1 bg-transparent text-sm outline-hidden"
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
            user={me}
            onProfile={() => {
              openModal('profile')
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
            className="group absolute top-0 right-0 z-10 -mr-0.5 flex h-full w-1.5 cursor-col-resize items-center justify-center"
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
      if (peopleFilterKind === 'uncategorized') return t('dashboard.uncategorized')
      if (peopleFilterKind === 'group') {
        return groups.find((g) => g.id === peopleSearch.groupId)?.name ?? t('dashboard.nav.people')
      }
      return t('dashboard.nav.people')
    }
    return ''
  }

  return (
    <main className="flex h-screen" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      {openModalName === 'import' && <BackupImportModal onClose={closeModal} />}
      {openModalName === 'profile' && (
        <ProfileModal onClose={closeModal} onLogout={handleLogout} onImportBackup={() => openModal('import')} />
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

        {/* Each tab route carries its own errorComponent, so a crash is scoped
            here and the sidebar stays usable to navigate out of it. */}
        <div className="flex-1 overflow-auto">{children}</div>
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
            isCollapsed ? 'bottom-full left-full ml-2 w-44' : 'right-0 bottom-full left-0 mb-2'
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
