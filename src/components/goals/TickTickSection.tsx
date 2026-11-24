import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ListChecks, Loader2, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { qk } from '~/lib/queries/keys'
import {
  chooseTickTickList,
  disconnectTickTick,
  fetchTickTickStatus,
  listTickTickLists,
  syncTickTickNow,
} from '~/server/fn/ticktick.fn'

// Profile → TickTick: connect, pick the list, see how the sync is doing.
//
// Goals and their tasks sync both ways with one TickTick list: a goal is a
// task there and each of its tasks a subtask (server/ticktick/sync.ts has the
// rules). Connecting leaves for ticktick.com, so it is a full-page navigation
// to /api/integrations/ticktick/connect, which comes back to /app?modal=profile
// with `?ticktick=` saying how it went.

interface Props {
  fieldLabel: string
  inputClass: string
  sectionClass: string
}

const NEW_LIST = '__new__'

export default function TickTickSection({ fieldLabel, inputClass, sectionClass }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const outcome = useSearch({ strict: false }).ticktick
  const status = useQuery({ queryKey: qk.tickTick, queryFn: () => fetchTickTickStatus() })
  const [picking, setPicking] = useState(false)
  const [choice, setChoice] = useState('')
  const [newName, setNewName] = useState('Anansi')

  const s = status.data
  const showPicker = Boolean(s?.connected && !s.needsReauth && (!s.list || picking))
  const lists = useQuery({
    queryKey: qk.tickTickLists,
    queryFn: () => listTickTickLists(),
    enabled: showPicker,
  })

  // The callback's answer, said once and dropped from the URL.
  useEffect(() => {
    if (!outcome) return
    if (outcome === 'connected') toast.success(t('profile.ticktickConnected'))
    else if (outcome === 'denied') toast(t('profile.ticktickDenied'))
    else toast.error(t('profile.ticktickFailed'))
    void navigate({ to: '.', search: ({ ticktick: _t, ...rest }) => rest, replace: true })
  }, [outcome, navigate, t])

  // A sync can change goals and tasks anywhere in the app.
  const refreshAll = () => void queryClient.invalidateQueries()

  const fail = (fallback: string) => (e: unknown) => toast.error(e instanceof Error ? e.message : fallback)

  const choose = useMutation({
    mutationFn: (data: { listId: string } | { newListName: string }) => chooseTickTickList({ data }),
    onSuccess: ({ report }) => {
      setPicking(false)
      toast.success(t('profile.ticktickSynced', { out: report?.toTickTick ?? 0, in: report?.fromTickTick ?? 0 }))
      refreshAll()
    },
    onError: fail(t('profile.ticktickSyncFailed')),
  })

  const sync = useMutation({
    mutationFn: () => syncTickTickNow(),
    onSuccess: ({ report }) => {
      toast.success(t('profile.ticktickSynced', { out: report?.toTickTick ?? 0, in: report?.fromTickTick ?? 0 }))
      refreshAll()
    },
    onError: (e) => {
      fail(t('profile.ticktickSyncFailed'))(e)
      void queryClient.invalidateQueries({ queryKey: qk.tickTick })
    },
  })

  const disconnect = useMutation({
    mutationFn: () => disconnectTickTick(),
    onSuccess: () => {
      toast.success(t('profile.ticktickDisconnected'))
      void queryClient.invalidateQueries({ queryKey: qk.tickTick })
    },
    onError: fail(t('profile.ticktickDisconnectFailed')),
  })

  // Not configured on this server: nothing to offer.
  if (!s?.available) return null

  // The browser's zone goes along: it is the zone due days are read in.
  const connect = () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    window.location.href = `/api/integrations/ticktick/connect?tz=${encodeURIComponent(tz)}`
  }

  const button =
    'inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--hairline)] bg-[var(--vellum)] px-3 py-1.5 text-xs text-[var(--ink)] disabled:opacity-50'
  const primary =
    'inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--clay)] px-3 py-1.5 text-xs text-[var(--paper)] disabled:opacity-50'
  const selected =
    choice !== '' ? choice : (lists.data?.find((l) => l.name === 'Anansi')?.id ?? lists.data?.[0]?.id ?? NEW_LIST)

  return (
    <div className={sectionClass}>
      <label className={fieldLabel}>
        <span className="inline-flex items-center gap-1.5">
          <ListChecks className="h-3 w-3" />
          {t('profile.ticktick')}
        </span>
      </label>
      <p className="mb-4 text-xs leading-relaxed text-[var(--ink-3)]">{t('profile.ticktickHelp')}</p>

      {!s.connected ? (
        <button type="button" onClick={connect} className={primary}>
          {t('profile.ticktickConnect')}
        </button>
      ) : s.needsReauth ? (
        <div className="space-y-3">
          <p className="text-xs text-[var(--rust)]">{s.lastError ?? t('profile.ticktickReauth')}</p>
          <div className="flex gap-2">
            <button type="button" onClick={connect} className={primary}>
              {t('profile.ticktickReconnect')}
            </button>
            <DisconnectButton onConfirm={() => disconnect.mutate()} pending={disconnect.isPending} className={button} />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {s.list && !picking ? (
            <div className="rounded-lg border border-[var(--hairline)] px-3 py-2">
              <div className="text-sm text-[var(--ink)]">{t('profile.ticktickSyncingWith', { list: s.list.name })}</div>
              <div className="text-[11px] text-[var(--ink-3)]">
                {t('profile.ticktickLinked', { goals: s.linked.goals, tasks: s.linked.tasks })}
                {' · '}
                {s.lastSyncedAt
                  ? t('profile.ticktickLastSync', { date: new Date(s.lastSyncedAt).toLocaleString() })
                  : t('profile.ticktickNeverSynced')}
              </div>
              {s.lastError ? <p className="mt-1 text-[11px] text-[var(--rust)]">{s.lastError}</p> : null}
            </div>
          ) : null}

          {showPicker ? (
            <div className="space-y-2">
              <p className="text-xs text-[var(--ink-2)]">{t('profile.ticktickPickHelp')}</p>
              {lists.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-[var(--ink-3)]" />
              ) : lists.isError ? (
                <p className="text-xs text-[var(--rust)]">
                  {lists.error instanceof Error ? lists.error.message : t('profile.ticktickSyncFailed')}
                </p>
              ) : (
                <>
                  <select
                    value={selected}
                    onChange={(e) => setChoice(e.target.value)}
                    className={inputClass}
                    aria-label={t('profile.ticktickList')}
                  >
                    {lists.data?.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                    <option value={NEW_LIST}>{t('profile.ticktickNewList')}</option>
                  </select>
                  {selected === NEW_LIST ? (
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      maxLength={64}
                      className={inputClass}
                      aria-label={t('profile.ticktickNewListName')}
                      placeholder={t('profile.ticktickNewListName')}
                    />
                  ) : null}
                  <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">{t('profile.ticktickFirstSync')}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={choose.isPending || (selected === NEW_LIST && !newName.trim())}
                      onClick={() =>
                        choose.mutate(selected === NEW_LIST ? { newListName: newName.trim() } : { listId: selected })
                      }
                      className={primary}
                    >
                      {choose.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {t('profile.ticktickUseList')}
                    </button>
                    {picking ? (
                      <button type="button" onClick={() => setPicking(false)} className={button}>
                        {t('profile.ticktickCancel')}
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          ) : null}

          {s.list && !picking ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => sync.mutate()} disabled={sync.isPending} className={button}>
                {sync.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {t('profile.ticktickSyncNow')}
              </button>
              <button type="button" onClick={() => setPicking(true)} className={button}>
                {t('profile.ticktickChangeList')}
              </button>
              <DisconnectButton
                onConfirm={() => disconnect.mutate()}
                pending={disconnect.isPending}
                className={button}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

function DisconnectButton({
  onConfirm,
  pending,
  className,
}: {
  onConfirm: () => void
  pending: boolean
  className: string
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (window.confirm(t('profile.ticktickDisconnectConfirm'))) onConfirm()
      }}
      className={`${className} hover:text-[var(--rust)]`}
    >
      {t('profile.ticktickDisconnect')}
    </button>
  )
}
