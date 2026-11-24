import { useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Archive, ArchiveRestore, CornerDownLeft, HelpCircle, Mic, RotateCw, Trash2, Type } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { captureDestination } from '~/lib/captures'
import { localToday, shiftDay } from '~/lib/journal'
import { useCreateCapture, useDeleteCapture, useRetryCapture, useUpdateCapture } from '~/lib/mutations/captures'
import { capturesQueryOptions, type CaptureRow } from '~/lib/queries/captures'
import { openQuestionsQueryOptions } from '~/lib/queries/self'
import { useLocalToday } from '~/lib/use-local-today'
import { Route } from '~/routes/app.inbox'
import { Btn, Page, ScreenHeader, Section } from './ui'

// The Inbox: everything the user captured, from the phone's Action Button, Siri,
// Claude or the box at the top, newest first and grouped by day, with where each
// one went (an open question, the TickTick Inbox) or why it is still here.
//
// Days and times are the browser's: the server renders the rows under one
// undated group and the client sorts them into days once it knows "today"
// (useLocalToday), so the server's UTC never names a day.

type Question = { id: string; question: string }

function timeOf(d: Date) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(d)
}

function duration(ms: number | null) {
  if (!ms) return null
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function QuestionPicker({
  questions,
  current,
  onPick,
  onClose,
}: {
  questions: Question[]
  current: string | null
  onPick: (id: string | null) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={onClose} />
      <div
        className="absolute top-full right-0 z-20 mt-1 max-h-72 w-72 overflow-y-auto rounded-lg border p-1 shadow-lg"
        style={{ background: 'var(--paper)', borderColor: 'var(--hairline-2)' }}
      >
        {questions.length === 0 ? (
          <p className="px-3 py-2 text-sm text-[var(--ink-3)]">{t('inbox.noQuestions')}</p>
        ) : (
          questions.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => onPick(q.id)}
              className="block w-full rounded-md px-3 py-2 text-left text-sm text-[var(--ink)] hover:bg-[var(--vellum)]"
              style={{ fontWeight: q.id === current ? 600 : 400 }}
            >
              {q.question}
            </button>
          ))
        )}
        {current && (
          <button
            type="button"
            onClick={() => onPick(null)}
            className="mt-1 block w-full rounded-md border-t px-3 py-2 text-left text-sm text-[var(--ink-3)] hover:bg-[var(--vellum)]"
            style={{ borderColor: 'var(--hairline)' }}
          >
            {t('inbox.outOfQuestion')}
          </button>
        )}
      </div>
    </>
  )
}

function CaptureItem({
  capture,
  questions,
  highlighted,
  showTime,
}: {
  capture: CaptureRow
  questions: Question[]
  highlighted: boolean
  showTime: boolean
}) {
  const { t } = useTranslation()
  const update = useUpdateCapture()
  const retry = useRetryCapture()
  const remove = useDeleteCapture()
  const [picking, setPicking] = useState(false)
  const destination = captureDestination(capture)
  const archived = capture.status === 'archived'
  const Icon = capture.kind === 'voice' ? Mic : Type

  const act = (p: Promise<unknown>, failed: string) => void p.catch(() => toast.error(failed))

  const where = (() => {
    switch (destination.kind) {
      case 'question':
        return <span>{t('inbox.toQuestion', { question: capture.question ?? '…' })}</span>
      case 'ticktick':
        return <span>{t('inbox.toTickTick')}</span>
      case 'error':
        return (
          <span className="inline-flex flex-wrap items-center gap-2" style={{ color: 'var(--rust)' }}>
            <span className="max-w-md truncate" title={destination.message}>
              {t('inbox.failed', { message: destination.message })}
            </span>
            <button
              type="button"
              onClick={() => act(retry.mutateAsync(capture.id), t('inbox.retryFailed'))}
              disabled={retry.isPending}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[var(--ink-2)] hover:bg-[var(--vellum)]"
            >
              <RotateCw className="h-3 w-3" />
              {t('inbox.retry')}
            </button>
          </span>
        )
      case 'transcribing':
        return <span>{t('inbox.waitingWords')}</span>
      case 'kept':
        return (
          <span>{capture.questionId ? t('inbox.forQuestion', { question: capture.question }) : t('inbox.kept')}</span>
        )
      case 'archived':
        return <span>{t('inbox.archived')}</span>
    }
  })()

  return (
    <li
      id={`capture-${capture.id}`}
      className="group -mx-2 flex items-start gap-3 rounded-md px-2 py-3 hover:bg-[var(--vellum)]/60"
      style={{
        opacity: archived ? 0.6 : 1,
        background: highlighted ? 'var(--vellum)' : undefined,
      }}
    >
      <Icon className="mt-1 h-4 w-4 shrink-0 text-[var(--ink-4)]" aria-label={t(`inbox.kind.${capture.kind}`)} />
      <div className="min-w-0 flex-1">
        {capture.text === null ? (
          <p className="text-[15px] text-[var(--ink-3)] italic">{t('inbox.transcribing')}</p>
        ) : capture.text === '' ? (
          <p className="text-[15px] text-[var(--ink-3)] italic">{t('inbox.noWords')}</p>
        ) : (
          <p className="text-[15px] break-words whitespace-pre-wrap text-[var(--ink)]">{capture.text}</p>
        )}
        {capture.audioUrl && (
          <div className="mt-2 flex items-center gap-2">
            <audio controls preload="none" src={capture.audioUrl} className="h-8 w-full max-w-sm" />
            {duration(capture.durationMs) && (
              <span className="text-xs text-[var(--ink-4)] tabular-nums">{duration(capture.durationMs)}</span>
            )}
          </div>
        )}
        <p className="mt-1 text-[13px] text-[var(--ink-3)]">
          {showTime && <span className="tabular-nums">{timeOf(new Date(capture.capturedAt))} · </span>}
          {where}
        </p>
      </div>
      <div className="relative flex shrink-0 items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          title={t('inbox.sendToQuestion')}
          aria-label={t('inbox.sendToQuestion')}
          className="rounded p-1.5 text-[var(--ink-3)] hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() =>
            act(update.mutateAsync({ id: capture.id, status: archived ? 'new' : 'archived' }), t('inbox.updateFailed'))
          }
          title={archived ? t('inbox.unarchive') : t('inbox.archive')}
          aria-label={archived ? t('inbox.unarchive') : t('inbox.archive')}
          className="rounded p-1.5 text-[var(--ink-3)] hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
        >
          {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(t('inbox.confirmDelete'))) act(remove.mutateAsync(capture.id), t('inbox.deleteFailed'))
          }}
          title={t('common.delete')}
          aria-label={t('common.delete')}
          className="rounded p-1.5 text-[var(--ink-3)] hover:bg-[var(--vellum)] hover:text-[var(--rust)]"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        {picking && (
          <QuestionPicker
            questions={questions}
            current={capture.questionId}
            onClose={() => setPicking(false)}
            onPick={(questionId) => {
              setPicking(false)
              act(update.mutateAsync({ id: capture.id, questionId }), t('inbox.updateFailed'))
            }}
          />
        )}
      </div>
    </li>
  )
}

export default function Inbox() {
  const { t } = useTranslation()
  const { data: all } = useSuspenseQuery(capturesQueryOptions())
  const { data: openQuestions } = useSuspenseQuery(openQuestionsQueryOptions())
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const today = useLocalToday()
  const create = useCreateCapture()
  const [draft, setDraft] = useState('')

  const questions = openQuestions.filter((q) => q.status === 'open').map((q) => ({ id: q.id, question: q.question }))
  const showArchived = search.archived === true
  const visible = all.filter((c) => showArchived || c.status !== 'archived')
  const newCount = all.filter((c) => c.status === 'new').length

  const submit = async () => {
    const text = draft.trim()
    if (!text) return
    try {
      await create.mutateAsync({ text })
      setDraft('')
    } catch {
      toast.error(t('inbox.captureFailed'))
    }
  }

  // Grouped by the browser's calendar day, once it is known.
  const groups: { key: string; label: string; items: CaptureRow[] }[] = []
  if (today) {
    const yesterday = shiftDay(today, -1)
    for (const c of visible) {
      const day = localToday(new Date(c.capturedAt))
      const last = groups[groups.length - 1]
      if (last?.key === day) {
        last.items.push(c)
        continue
      }
      const label =
        day === today
          ? t('inbox.today')
          : day === yesterday
            ? t('inbox.yesterday')
            : new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(
                new Date(c.capturedAt),
              )
      groups.push({ key: day, label, items: [c] })
    }
  } else if (visible.length) {
    groups.push({ key: 'all', label: t('inbox.recent'), items: visible })
  }

  return (
    <Page>
      <ScreenHeader
        title={
          <>
            {t('inbox.titlePre')}
            <span className="brand-em">{t('inbox.titleEm')}</span>
          </>
        }
        sub={newCount ? t('inbox.newCount', { count: newCount }) : t('inbox.subtitle')}
        actions={
          <Btn
            kind="ghost"
            size="sm"
            onClick={() =>
              void navigate({ search: (prev) => ({ ...prev, archived: showArchived ? undefined : true }) })
            }
          >
            {showArchived ? t('inbox.hideArchived') : t('inbox.showArchived')}
          </Btn>
        }
        below={
          <div className="flex items-start gap-2 rounded-lg border border-[var(--hairline)] py-1 pr-1.5 pl-3 transition-colors focus-within:border-[var(--hairline-2)]">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void submit()
                }
              }}
              rows={draft.includes('\n') ? 3 : 1}
              placeholder={t('inbox.placeholder')}
              maxLength={10_000}
              className="min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm text-[var(--ink)] outline-hidden placeholder:text-[var(--ink-4)]"
            />
            {draft.trim() && (
              <Btn kind="primary" size="sm" onClick={() => void submit()} disabled={create.isPending}>
                <CornerDownLeft className="h-3.5 w-3.5" />
                {t('inbox.capture')}
              </Btn>
            )}
          </div>
        }
      />

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--ink-3)]">{t('inbox.empty')}</p>
      ) : (
        groups.map((g) => (
          <Section key={g.key} label={g.label} count={g.items.length} className="first:mt-2">
            <ul className="divide-y divide-[var(--hairline)]">
              {g.items.map((c) => (
                <CaptureItem
                  key={c.id}
                  capture={c}
                  questions={questions}
                  highlighted={search.capture === c.id}
                  showTime={today !== null}
                />
              ))}
            </ul>
          </Section>
        ))
      )}
    </Page>
  )
}
