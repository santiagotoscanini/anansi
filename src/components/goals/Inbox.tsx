import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  BookA,
  CircleCheck,
  CornerDownLeft,
  HelpCircle,
  Mic,
  Monitor,
  Smartphone,
  Sparkles,
  RotateCw,
  Trash2,
  Type,
  Watch,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { captureDestination, transcriptView } from '~/lib/captures'
import { localToday, shiftDay } from '~/lib/journal'
import {
  useCreateCapture,
  useDeleteCapture,
  useDeleteCaptureTerm,
  useRetranscribeCapture,
  useRetryCapture,
  useSaveCaptureTerm,
  useUpdateCapture,
} from '~/lib/mutations/captures'
import { captureTermsQueryOptions, capturesQueryOptions, type CaptureRow } from '~/lib/queries/captures'
import { openQuestionsQueryOptions } from '~/lib/queries/self'
import { useLocalToday } from '~/lib/use-local-today'
import { Route } from '~/routes/app.inbox'
import { Btn, Page, ScreenHeader, Section } from './ui'

// The Inbox: everything the user captured, from the phone's Action Button, Siri,
// Claude or the box at the top, newest first and grouped by day. Each row is the
// words over a quiet line: the time, text or voice (with its length), the device.
// Where it went is said only when it is news (an open question, a failure, words
// on their way): a TickTick task is the usual case, so it says nothing while open,
// and is struck through with a green check when done there, faded with a red bin
// when deleted there (`tickTickState`, read by the poller). A voice
// note shows its tidied title and notes, with the transcript one click away;
// the Dictionary panel holds the words the transcriber keeps getting wrong.
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
  const retranscribe = useRetranscribeCapture()
  const [picking, setPicking] = useState(false)
  const [showWords, setShowWords] = useState(false)
  const destination = captureDestination(capture)
  const words = transcriptView(capture)
  const archived = capture.status === 'archived'
  // Dealt with in TickTick: the row steps back like an archived one, a done one struck through.
  const tickTick = destination.kind === 'ticktick' ? destination.state : null
  const settled = tickTick === 'done' || tickTick === 'deleted'
  const struck = tickTick === 'done' ? 'line-through' : undefined
  const Kind = capture.kind === 'voice' ? Mic : Type
  const origin =
    capture.source === 'web'
      ? { Icon: Monitor, label: t('inbox.fromWeb') }
      : capture.source === 'mcp'
        ? { Icon: Sparkles, label: t('inbox.fromClaude') }
        : capture.device === 'watch'
          ? { Icon: Watch, label: t('inbox.fromWatch') }
          : { Icon: Smartphone, label: t('inbox.fromIphone') }

  const act = (p: Promise<unknown>, failed: string) => void p.catch(() => toast.error(failed))

  const where = (() => {
    switch (destination.kind) {
      case 'question':
        return <span>{t('inbox.toQuestion', { question: capture.question ?? '…' })}</span>
      case 'ticktick':
        // Always the same place, so not said; what became of the task is the row's mark.
        return null
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
        // A note the transcriber refused says so above; "kept" would only repeat it.
        if (words.kind === 'failed') return null
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
        opacity: archived || settled ? 0.55 : 1,
        background: highlighted ? 'var(--vellum)' : undefined,
      }}
    >
      <div className="min-w-0 flex-1">
        {words.kind === 'text' && capture.title !== null ? (
          <>
            <p className="text-[15px] font-medium break-words text-[var(--ink)]" style={{ textDecoration: struck }}>
              {capture.title}
            </p>
            {capture.notes && (
              <p className="mt-0.5 text-sm break-words whitespace-pre-wrap text-[var(--ink-2)]">{capture.notes}</p>
            )}
            <button
              type="button"
              onClick={() => setShowWords((v) => !v)}
              className="mt-1 text-xs text-[var(--ink-4)] hover:text-[var(--ink-2)]"
            >
              {showWords ? t('inbox.hideTranscript') : t('inbox.showTranscript')}
            </button>
            {showWords && (
              <div className="mt-1 border-l-2 border-[var(--hairline-2)] pl-3 text-sm text-[var(--ink-3)]">
                <p className="break-words whitespace-pre-wrap">{words.text}</p>
                {capture.heard !== null && capture.heard !== words.text && (
                  <p className="mt-1 text-xs break-words">{t('inbox.heardAs', { text: capture.heard })}</p>
                )}
              </div>
            )}
          </>
        ) : words.kind === 'text' ? (
          <p
            className="text-[15px] break-words whitespace-pre-wrap text-[var(--ink)]"
            style={{ textDecoration: struck }}
          >
            {words.text}
          </p>
        ) : words.kind === 'empty' ? (
          <p className="text-[15px] text-[var(--ink-3)] italic">{t('inbox.noWords')}</p>
        ) : words.kind === 'transcribing' ? (
          <p className="text-[15px] text-[var(--ink-3)] italic" title={capture.transcribeError ?? undefined}>
            {words.retrying ? t('inbox.transcribingRetrying') : t('inbox.transcribing')}
          </p>
        ) : (
          <p className="inline-flex flex-wrap items-center gap-2 text-[15px]" style={{ color: 'var(--rust)' }}>
            <span className="max-w-md truncate" title={words.message}>
              {t('inbox.transcribeFailed', { message: words.message })}
            </span>
            <button
              type="button"
              onClick={() => act(retranscribe.mutateAsync(capture.id), t('inbox.retranscribeFailed'))}
              disabled={retranscribe.isPending}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[13px] text-[var(--ink-2)] hover:bg-[var(--vellum)]"
            >
              <RotateCw className="h-3 w-3" />
              {t('inbox.tryAgain')}
            </button>
          </p>
        )}
        {capture.audioUrl && (
          <audio controls preload="none" src={capture.audioUrl} className="mt-2 h-8 w-full max-w-sm" />
        )}
        <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-[var(--ink-4)]">
          {showTime && <span className="text-[var(--ink-3)] tabular-nums">{timeOf(new Date(capture.capturedAt))}</span>}
          <span className="inline-flex items-center gap-1" title={t(`inbox.kind.${capture.kind}`)}>
            <Kind className="h-3.5 w-3.5" aria-label={t(`inbox.kind.${capture.kind}`)} />
            {capture.kind === 'voice' && duration(capture.durationMs) && (
              <span className="tabular-nums">{duration(capture.durationMs)}</span>
            )}
          </span>
          <span title={origin.label}>
            <origin.Icon className="h-3.5 w-3.5" aria-label={origin.label} />
          </span>
          {where && <span className="text-[var(--ink-3)]">{where}</span>}
        </p>
      </div>
      {tickTick === 'done' && (
        <span className="mt-0.5 shrink-0" title={t('inbox.doneInTickTick')} style={{ color: 'var(--moss)' }}>
          <CircleCheck className="h-4 w-4" aria-label={t('inbox.doneInTickTick')} />
        </span>
      )}
      {tickTick === 'deleted' && (
        <span className="mt-0.5 shrink-0" title={t('inbox.deletedInTickTick')} style={{ color: 'var(--rust)' }}>
          <Trash2 className="h-4 w-4" aria-label={t('inbox.deletedInTickTick')} />
        </span>
      )}
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

/** The words the transcriber keeps getting wrong, and what was meant: applied to every new voice note. */
function Dictionary({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { data: terms } = useQuery(captureTermsQueryOptions())
  const save = useSaveCaptureTerm()
  const remove = useDeleteCaptureTerm()
  const [heard, setHeard] = useState('')
  const [meant, setMeant] = useState('')

  const add = async () => {
    if (!heard.trim() || !meant.trim()) return
    try {
      await save.mutateAsync({ heard: heard.trim(), meant: meant.trim() })
      setHeard('')
      setMeant('')
    } catch {
      toast.error(t('inbox.dictionarySaveFailed'))
    }
  }

  const field =
    'min-w-0 flex-1 rounded-md border border-[var(--hairline)] bg-transparent px-2.5 py-1.5 text-sm text-[var(--ink)] outline-hidden focus:border-[var(--hairline-2)] placeholder:text-[var(--ink-4)]'

  return (
    <Section
      label={t('inbox.dictionary')}
      count={terms?.length}
      action={
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      }
      className="mt-2"
    >
      <p className="mb-3 text-sm text-[var(--ink-3)]">{t('inbox.dictionaryHelp')}</p>
      {terms && terms.length > 0 && (
        <ul className="mb-3 divide-y divide-[var(--hairline)]">
          {terms.map((term) => (
            <li
              key={term.id}
              className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--vellum)]/60"
            >
              <span className="min-w-0 flex-1 truncate text-[var(--ink-3)]">{term.heard}</span>
              <span className="text-[var(--ink-4)]">→</span>
              <span className="min-w-0 flex-1 truncate text-[var(--ink)]">{term.meant}</span>
              <button
                type="button"
                onClick={() =>
                  void remove.mutateAsync(term.id).catch(() => toast.error(t('inbox.dictionaryDeleteFailed')))
                }
                aria-label={t('common.delete')}
                title={t('common.delete')}
                className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--vellum)] hover:text-[var(--rust)] md:opacity-0 md:group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap items-center gap-2 sm:flex-nowrap"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <input
          value={heard}
          onChange={(e) => setHeard(e.target.value)}
          placeholder={t('inbox.dictionaryHeard')}
          aria-label={t('inbox.dictionaryHeard')}
          maxLength={100}
          className={field}
        />
        <span className="text-[var(--ink-4)]">→</span>
        <input
          value={meant}
          onChange={(e) => setMeant(e.target.value)}
          placeholder={t('inbox.dictionaryMeant')}
          aria-label={t('inbox.dictionaryMeant')}
          maxLength={100}
          className={field}
        />
        <Btn kind="primary" size="sm" type="submit" disabled={!heard.trim() || !meant.trim() || save.isPending}>
          {t('inbox.dictionaryAdd')}
        </Btn>
      </form>
    </Section>
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
  const [dictionary, setDictionary] = useState(false)

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
          <>
            <Btn kind="ghost" size="sm" onClick={() => setDictionary((v) => !v)}>
              <BookA className="h-3.5 w-3.5" />
              {t('inbox.dictionary')}
            </Btn>
            <Btn
              kind="ghost"
              size="sm"
              onClick={() =>
                void navigate({ search: (prev) => ({ ...prev, archived: showArchived ? undefined : true }) })
              }
            >
              {showArchived ? t('inbox.hideArchived') : t('inbox.showArchived')}
            </Btn>
          </>
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

      {dictionary && <Dictionary onClose={() => setDictionary(false)} />}

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
