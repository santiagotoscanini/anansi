import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Check, CheckSquare, Pencil, Plus, Search, Square, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import type { PersonCategory } from '~/lib/api/types'
import { useDeleteGroup, useUpdateGroup } from '~/lib/mutations/people'
import { qk } from '~/lib/queries/keys'
import { groupTasksQueryOptions, groupsQueryOptions, peopleQueryOptions } from '~/lib/queries/people'
import { Route } from '~/routes/app.people'
import PersonModal, { type PersonRow } from './PersonModal'
import Avatar from './Avatar'
import ColorPicker from './ColorPicker'
import GoalModal from './GoalModal'
import MentionText from './MentionText'
import { isEmojiUrl } from '~/lib/emoji-utils'
import { formatScheduledShort } from '~/lib/horizon-period'
import { Btn, Page, ScreenHeader, Section } from './ui'

type CategoryLabelKey =
  | 'peopleDirectory.categoryToProcess'
  | 'peopleDirectory.categoryExploring'
  | 'peopleDirectory.categoryLongTerm'
  | 'peopleDirectory.categoryContextBound'

const CATEGORY_LABEL_KEYS: Record<PersonCategory, CategoryLabelKey> = {
  to_process: 'peopleDirectory.categoryToProcess',
  exploring: 'peopleDirectory.categoryExploring',
  long_term: 'peopleDirectory.categoryLongTerm',
  context_bound: 'peopleDirectory.categoryContextBound',
}

// The filter arrives as search params rather than props: the sidebar, which
// sits above this route, is what sets it. `groupId` is only meaningful when
// `filter === 'group'`; the discriminated union that used to encode that could
// not survive a query string, so the two are validated independently.
export default function PeopleDirectory() {
  const { t } = useTranslation()
  const { filter, groupId, person: personParam } = Route.useSearch()
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()

  const { data: people } = useSuspenseQuery(peopleQueryOptions(false))
  const { data: groups } = useSuspenseQuery(groupsQueryOptions())
  const groupTasksQuery = useQuery({
    ...groupTasksQueryOptions(groupId ?? ''),
    enabled: filter === 'group' && !!groupId,
  })
  const updateGroupMutation = useUpdateGroup()
  const deleteGroupMutation = useDeleteGroup()
  const [search, setSearch] = useState('')
  // The open person lives in the URL (`?person=<id>`), so a mention in the
  // journal can link straight to them and the modal survives a reload. Derived
  // from the live list: an id that no longer resolves leaves the modal shut.
  const editingPerson = personParam ? (people.find((p) => p.id === personParam) ?? null) : null
  const setEditingPerson = (p: PersonRow | null) => void navigate({ search: (prev) => ({ ...prev, person: p?.id }) })
  const [creating, setCreating] = useState(false)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editGroupName, setEditGroupName] = useState('')
  const [editGroupColor, setEditGroupColor] = useState('#60a5fa')
  const [openGoalId, setOpenGoalId] = useState<string | null>(null)

  const refetchPeople = () => {
    void queryClient.invalidateQueries({ queryKey: qk.people })
  }

  const groupsById = useMemo(() => {
    const m = new Map<string, (typeof groups)[number]>()
    for (const g of groups) m.set(g.id, g)
    return m
  }, [groups])

  const filtered = useMemo(() => {
    const rows = people as PersonRow[]
    const q = search.trim().toLowerCase()

    const afterFilter = rows.filter((p) => {
      if (filter === 'all') return true
      if (filter === 'uncategorized') return !p.groupIds || p.groupIds.length === 0
      return groupId ? (p.groupIds?.includes(groupId) ?? false) : false
    })

    const list = q ? afterFilter.filter((p) => p.name.toLowerCase().includes(q)) : afterFilter
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [people, search, filter, groupId])

  const headerTitle =
    filter === 'all'
      ? t('peopleDirectory.headerAll')
      : filter === 'uncategorized'
        ? t('peopleDirectory.headerUncategorized')
        : (groupsById.get(groupId ?? '')?.name ?? t('peopleDirectory.headerAll'))

  const headerHint =
    filter === 'all'
      ? t('peopleDirectory.hintAll')
      : filter === 'uncategorized'
        ? t('peopleDirectory.hintUncategorized')
        : t('peopleDirectory.hintGroup')

  const activeGroup = filter === 'group' && groupId ? groupsById.get(groupId) : undefined
  const editingGroup = activeGroup ? editingGroupId === activeGroup.id : false

  const startEditGroup = () => {
    if (!activeGroup) return
    setEditGroupName(activeGroup.name)
    setEditGroupColor(activeGroup.color)
    setEditingGroupId(activeGroup.id)
  }

  const cancelEditGroup = () => setEditingGroupId(null)

  const submitEditGroup = async () => {
    if (!activeGroup || !editGroupName.trim()) return
    try {
      await updateGroupMutation.mutateAsync({
        id: activeGroup.id,
        name: editGroupName.trim(),
        color: editGroupColor,
      })
      setEditingGroupId(null)
      toast.success(t('peopleDirectory.groupUpdated'))
    } catch {
      toast.error(t('peopleDirectory.groupUpdateFailed'))
    }
  }

  const handleDeleteGroup = async () => {
    if (!activeGroup) return
    if (!confirm(t('peopleDirectory.confirmDeleteGroup', { name: activeGroup.name }))) return
    const id = activeGroup.id
    try {
      await deleteGroupMutation.mutateAsync(id)
      // The group this view was filtered to is gone, so the URL has to move
      // with it or the tab renders an empty list under a dead groupId.
      await navigate({ search: { filter: 'all', groupId: undefined } })
      toast.success(t('peopleDirectory.groupDeleted'))
    } catch {
      toast.error(t('peopleDirectory.groupDeleteFailed'))
    }
  }

  const iconButton =
    'rounded-md p-1 text-[var(--ink-4)] transition-colors hover:bg-[var(--vellum)] hover:text-[var(--ink)]'
  const title = (
    <span className="inline-flex max-w-full items-center gap-2.5">
      {activeGroup &&
        (editingGroup ? (
          <ColorPicker value={editGroupColor} onChange={setEditGroupColor} size="md" />
        ) : (
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: activeGroup.color }} />
        ))}
      {activeGroup && editingGroup ? (
        <input
          type="text"
          value={editGroupName}
          onChange={(e) => setEditGroupName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submitEditGroup()
            if (e.key === 'Escape') cancelEditGroup()
          }}
          className="max-w-xs min-w-0 border-b border-[var(--hairline-2)] bg-transparent text-[var(--ink)] outline-hidden"
          autoFocus
        />
      ) : (
        <span className="truncate">{headerTitle}</span>
      )}
      {activeGroup && (
        <span className="flex items-center gap-0.5 text-base">
          {editingGroup ? (
            <>
              <button onClick={() => void submitEditGroup()} title={t('common.save')} className={iconButton}>
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={cancelEditGroup} title={t('common.cancel')} className={iconButton}>
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              <button onClick={startEditGroup} title={t('peopleDirectory.renameGroup')} className={iconButton}>
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => void handleDeleteGroup()}
                title={t('peopleDirectory.deleteGroup')}
                className={`${iconButton} hover:!bg-[var(--rust-soft)] hover:!text-[var(--rust)]`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </span>
      )}
    </span>
  )

  return (
    <Page>
      <ScreenHeader
        title={title}
        sub={headerHint}
        actions={
          <Btn kind="primary" size="sm" icon={Plus} onClick={() => setCreating(true)}>
            {t('peopleDirectory.addPerson')}
          </Btn>
        }
        below={
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-4)]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('peopleDirectory.searchPlaceholder')}
              className="w-full rounded-lg border border-[var(--hairline)] bg-transparent py-2 pr-3 pl-9 text-sm text-[var(--ink)] outline-hidden transition-colors placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)]"
            />
          </div>
        }
      />

      {/* No loading branch: the /app layout prefetches the people list. */}
      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--ink-3)]">
          {search
            ? t('peopleDirectory.noMatches')
            : filter === 'all'
              ? t('peopleDirectory.noPeopleAll')
              : t('peopleDirectory.noPeopleFilter')}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          {filtered.map((p) => {
            const note = p.appreciation ?? p.myNeeds ?? p.legacyMessage ?? p.selfReflection ?? null
            return (
              <li key={p.id} style={{ borderBottom: '1px solid var(--hairline)' }}>
                <button
                  onClick={() => setEditingPerson(p)}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-[var(--vellum)]/60"
                >
                  <Avatar name={p.name} emoji={p.emoji} size="sm" shape="circle" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14px] text-[var(--ink)]">{p.name}</span>
                      {p.groupIds?.map((gid) => {
                        const g = groupsById.get(gid)
                        return g ? (
                          <span
                            key={gid}
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: g.color }}
                            title={g.name}
                          />
                        ) : null
                      })}
                    </span>
                    <span className="block truncate text-xs text-[var(--ink-3)]">
                      {note ? (
                        <span style={{ fontFamily: 'var(--font-text)', fontStyle: 'italic', fontSize: 13 }}>
                          {note}
                        </span>
                      ) : (
                        t(CATEGORY_LABEL_KEYS[p.category])
                      )}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Tasks tagged with this group: only on a group's page, under its people. */}
      {filter === 'group' && (
        <Section label={t('peopleDirectory.tasksTitle')} count={groupTasksQuery.data?.length ?? 0}>
          {groupTasksQuery.isLoading ? (
            <p className="text-sm text-[var(--ink-3)]">{t('peopleDirectory.loading')}</p>
          ) : (groupTasksQuery.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-[var(--ink-3)]">
              {t('peopleDirectory.noTasksForGroup')}{' '}
              <span className="text-[var(--ink-4)]">{t('peopleDirectory.noTasksHint')}</span>
            </p>
          ) : (
            <ul className="divide-y divide-[var(--hairline)]">
              {groupTasksQuery.data?.map((t) => (
                <li key={t.taskId}>
                  <button
                    onClick={() => setOpenGoalId(t.goalId)}
                    className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-[var(--vellum)]/60"
                  >
                    {t.completed ? (
                      <CheckSquare className="h-4 w-4 shrink-0 text-[var(--moss)]" />
                    ) : (
                      <Square className="h-4 w-4 shrink-0 text-[var(--ink-4)]" />
                    )}
                    <span
                      className={`min-w-0 flex-1 truncate text-sm ${
                        t.completed ? 'text-[var(--ink-3)] line-through' : 'text-[var(--ink)]'
                      }`}
                    >
                      <MentionText text={t.taskTitle} />
                    </span>
                    <span className="flex max-w-[12rem] shrink-0 items-center gap-1.5 truncate text-xs text-[var(--ink-3)]">
                      {t.goalEmoji && !isEmojiUrl(t.goalEmoji) && <span className="leading-none">{t.goalEmoji}</span>}
                      <span className="truncate">{t.goalTitle}</span>
                    </span>
                    {t.scheduledAt && (
                      <span className="shrink-0 text-[11px] text-[var(--ink-3)] tabular-nums">
                        {formatScheduledShort(new Date(t.scheduledAt))}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {(editingPerson !== null || creating) && (
        <PersonModal
          person={editingPerson}
          onClose={() => {
            setEditingPerson(null)
            setCreating(false)
          }}
          onSaved={refetchPeople}
        />
      )}

      {openGoalId && <GoalModal goalId={openGoalId} onClose={() => setOpenGoalId(null)} />}
    </Page>
  )
}
