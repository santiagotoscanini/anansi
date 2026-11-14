import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Image as ImageIcon, Plus, Search, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { shiftDay } from '~/lib/journal'
import { toEditable, toPlain } from '~/lib/mentions'
import {
  useDeleteJournalAttachment,
  useDeleteJournalEntry,
  useUploadJournalAttachment,
  useWriteJournalEntry,
} from '~/lib/mutations/journal'
import { journalEntryQueryOptions, journalRecentQueryOptions, type JournalEntryRow } from '~/lib/queries/journal'
import { useLocalToday } from '~/lib/use-local-today'
import { Route } from '~/routes/app.journal'
import Avatar from './Avatar'
import MentionField, { type MentionCandidate } from './MentionField'
import MentionText, { useMentionPeople } from './MentionText'
import { SecLabel } from './ui'

// The journal: one page per calendar day. Highlights first (the day in a few
// lines), then the diary text, then its pictures; the days before it are
// listed underneath. People are mentioned as `@Name`, typed or picked, and the
// server links them on save, so every field here edits plain text.

const proseStyle = {
  fontFamily: 'var(--font-text)',
  fontSize: 18,
  lineHeight: 1.65,
  color: 'var(--ink)',
} as const

/** A calendar day as a local Date, for formatting only. */
function dateOf(day: string): Date {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function Highlights({
  day,
  entry,
  people,
}: {
  day: string
  entry: JournalEntryRow | null
  people: readonly MentionCandidate[]
}) {
  const { t } = useTranslation()
  const write = useWriteJournalEntry()
  const stored = entry?.highlights ?? []
  const [adding, setAdding] = useState('')
  const [editing, setEditing] = useState<{ index: number; draft: string } | null>(null)

  const save = async (next: string[]) => {
    try {
      await write.mutateAsync({ day, highlights: next })
      return true
    } catch {
      toast.error(t('common.saveFailed'))
      return false
    }
  }

  const add = async () => {
    const text = adding.trim()
    if (!text) return
    if (await save([...stored, text])) setAdding('')
  }

  const commitEdit = async () => {
    if (!editing) return
    const text = editing.draft.trim()
    const next = stored.flatMap((h, i) => (i !== editing.index ? [h] : text ? [text] : []))
    setEditing(null)
    if (text !== toEditable(stored[editing.index] ?? '', people)) await save(next)
  }

  return (
    <section>
      <SecLabel style={{ marginBottom: 12 }}>{t('journal.highlights')}</SecLabel>
      <ul className="space-y-1">
        {stored.map((h, i) => (
          <li key={`${i}:${h}`} className="group flex items-start gap-3">
            <span
              aria-hidden
              className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: 'var(--clay)' }}
            />
            {editing?.index === i ? (
              <div className="min-w-0 flex-1">
                <MentionField
                  value={editing.draft}
                  onChange={(draft) => setEditing({ index: i, draft })}
                  people={people}
                  autoFocus
                  maxLength={500}
                  onEnter={() => void commitEdit()}
                  onEscape={() => setEditing(null)}
                  onBlur={() => void commitEdit()}
                  aria-label={t('journal.editHighlight')}
                  className="w-full rounded-md bg-[var(--vellum)] px-2 py-1 text-[15px] text-[var(--ink)] outline-hidden"
                />
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setEditing({ index: i, draft: toEditable(h, people) })}
                  title={t('journal.clickToEdit')}
                  className="min-w-0 flex-1 cursor-text rounded-md px-2 py-1 text-left text-[15px] leading-relaxed text-[var(--ink)] transition-colors hover:bg-[var(--vellum)]"
                >
                  <MentionText text={h} />
                </button>
                <button
                  type="button"
                  onClick={() => void save(stored.filter((_, j) => j !== i))}
                  disabled={write.isPending}
                  aria-label={t('journal.removeHighlight')}
                  className="mt-1 shrink-0 rounded p-1 text-[var(--ink-4)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)] md:opacity-0 md:group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </li>
        ))}
        <li className="flex items-start gap-3">
          <Plus aria-hidden className="mt-[9px] h-3 w-3 shrink-0 -translate-x-[3px] text-[var(--ink-4)]" />
          <div className="-ml-1.5 min-w-0 flex-1">
            <MentionField
              value={adding}
              onChange={setAdding}
              people={people}
              maxLength={500}
              onEnter={() => void add()}
              placeholder={
                stored.length === 0 ? t('journal.firstHighlightPlaceholder') : t('journal.highlightPlaceholder')
              }
              aria-label={t('journal.addHighlight')}
              className="w-full rounded-md bg-transparent px-2 py-1 text-[15px] text-[var(--ink)] outline-hidden transition-colors placeholder:text-[var(--ink-4)] focus:bg-[var(--vellum)]"
            />
          </div>
        </li>
      </ul>
    </section>
  )
}

function Prose({
  day,
  entry,
  people,
}: {
  day: string
  entry: JournalEntryRow | null
  people: readonly MentionCandidate[]
}) {
  const { t } = useTranslation()
  const { mutate, mutateAsync } = useWriteJournalEntry()
  const stored = entry?.content ?? ''
  const [draft, setDraft] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  // The text typed but not yet sent, with the timer that will send it.
  const pending = useRef<{ text: string; timer: ReturnType<typeof setTimeout> } | null>(null)

  const send = async (text: string) => {
    pending.current = null
    try {
      await mutateAsync({ day, content: text })
      setStatus('saved')
    } catch {
      setStatus('idle')
      toast.error(t('common.saveFailed'))
    }
  }

  const onChange = (text: string) => {
    setDraft(text)
    setStatus('saving')
    if (pending.current) clearTimeout(pending.current.timer)
    pending.current = { text, timer: setTimeout(() => void send(text), 900) }
  }

  const finish = () => {
    const waiting = pending.current
    if (waiting) {
      clearTimeout(waiting.timer)
      void send(waiting.text)
    }
    setDraft(null)
  }

  // Leaving the page (another day, another tab) with text still waiting on its
  // timer: send it now. This component is keyed by day, so `day` is the one
  // the text was typed for.
  useEffect(
    () => () => {
      const waiting = pending.current
      if (!waiting) return
      clearTimeout(waiting.timer)
      mutate({ day, content: waiting.text })
    },
    [day, mutate],
  )

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <SecLabel>{t('journal.entry')}</SecLabel>
        <span className="text-xs" style={{ color: status === 'saved' ? 'var(--moss)' : 'var(--ink-3)' }}>
          {status === 'saving' && t('journal.saving')}
          {status === 'saved' && t('journal.saved')}
        </span>
      </div>
      {draft !== null ? (
        <div>
          <MentionField
            multiline
            autoFocus
            value={draft}
            onChange={onChange}
            people={people}
            maxLength={50_000}
            placeholder={t('journal.entryPlaceholder')}
            aria-label={t('journal.entry')}
            className="block min-h-[220px] w-full resize-y rounded-xl px-5 py-4 outline-hidden placeholder:text-[var(--ink-4)]"
            style={{
              ...proseStyle,
              // Grows with the text where the browser can; the min height and
              // the resize handle cover the ones that cannot.
              fieldSizing: 'content',
              background: 'var(--canvas)',
              border: '1px solid var(--hairline-2)',
              boxShadow: 'var(--shadow-sm)',
            }}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--ink-3)]">{t('journal.mentionHint')}</span>
            <button
              type="button"
              onClick={finish}
              className="rounded-lg border border-[var(--hairline-2)] px-3 py-1 text-sm text-[var(--ink)] transition-colors hover:bg-[var(--vellum)]"
            >
              {t('journal.done')}
            </button>
          </div>
        </div>
      ) : stored.trim() ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setDraft(toEditable(stored, people))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setDraft(toEditable(stored, people))
          }}
          title={t('journal.clickToEdit')}
          className="-mx-3 cursor-text rounded-xl px-3 py-2 whitespace-pre-wrap transition-colors hover:bg-[var(--vellum)]/50"
          style={proseStyle}
        >
          <MentionText text={stored} link />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setDraft('')}
          className="block w-full cursor-text rounded-xl px-5 py-6 text-left transition-colors hover:bg-[var(--vellum)]/50"
          style={{ ...proseStyle, color: 'var(--ink-4)', fontStyle: 'italic', border: '1px dashed var(--hairline-2)' }}
        >
          {t('journal.entryPlaceholder')}
        </button>
      )}
    </section>
  )
}

function fileTypeOf(file: File): 'image' | 'document' | 'video' | 'audio' | 'other' {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type === 'application/pdf' || file.type.startsWith('text/')) return 'document'
  return 'other'
}

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () =>
      typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('empty file'))
    reader.onerror = () => reject(new Error('unreadable file'))
    reader.readAsDataURL(file)
  })

function Pictures({ day, entry }: { day: string; entry: JournalEntryRow | null }) {
  const { t } = useTranslation()
  const upload = useUploadJournalAttachment()
  const remove = useDeleteJournalAttachment()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const files = entry?.attachments ?? []
  const images = files.filter((a) => a.fileType === 'image')
  const media = files.filter((a) => a.fileType === 'video' || a.fileType === 'audio')
  const others = files.filter((a) => a.fileType !== 'image' && a.fileType !== 'video' && a.fileType !== 'audio')

  const add = async (picked: FileList) => {
    try {
      // One at a time: each is up to 10 MB of base64 in a request body.
      for (const file of Array.from(picked)) {
        await upload.mutateAsync({
          day,
          fileName: file.name,
          fileType: fileTypeOf(file),
          data: await readAsDataUrl(file),
        })
      }
    } catch {
      toast.error(t('journal.uploadFailed'))
    }
  }

  const del = async (id: string, name: string) => {
    if (!confirm(t('journal.confirmDeleteFile', { name }))) return
    try {
      await remove.mutateAsync(id)
    } catch {
      toast.error(t('common.deleteFailed'))
    }
  }

  return (
    <section>
      <SecLabel style={{ marginBottom: 12 }}>{t('journal.pictures')}</SecLabel>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images.map((a) => (
          <div key={a.id} className="group relative aspect-square overflow-hidden rounded-xl bg-[var(--vellum)]">
            <a href={a.url} target="_blank" rel="noreferrer" title={a.fileName}>
              <img
                src={a.url}
                alt={a.fileName}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </a>
            <button
              type="button"
              onClick={() => void del(a.id, a.fileName)}
              disabled={remove.isPending}
              aria-label={t('journal.deleteFile', { name: a.fileName })}
              className="absolute top-1.5 right-1.5 rounded-full p-1.5 transition-opacity md:opacity-0 md:group-hover:opacity-100"
              style={{ background: 'var(--surface-inverse)', color: 'var(--on-inverse)' }}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl text-xs text-[var(--ink-3)] transition-colors hover:bg-[var(--vellum)]/60 hover:text-[var(--ink)] disabled:cursor-wait disabled:opacity-60"
          style={{ border: '1px dashed var(--hairline-2)' }}
        >
          <ImageIcon className="h-4 w-4" />
          {upload.isPending ? t('journal.uploading') : t('journal.addPictures')}
        </button>
      </div>
      {media.length > 0 && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {media.map((a) => (
            <li key={a.id} className="group">
              {a.fileType === 'video' ? (
                // The original file as it was recorded. A browser that cannot decode it shows its own message.
                <video
                  src={a.url}
                  controls
                  preload="metadata"
                  className="w-full rounded-xl"
                  style={{ background: '#14100d', maxHeight: 420 }}
                />
              ) : (
                <audio src={a.url} controls preload="metadata" className="w-full" />
              )}
              <div className="mt-1 flex items-center gap-2 text-xs text-[var(--ink-3)]">
                <a href={a.url} target="_blank" rel="noreferrer" className="truncate underline">
                  {a.fileName}
                </a>
                <button
                  type="button"
                  onClick={() => void del(a.id, a.fileName)}
                  aria-label={t('journal.deleteFile', { name: a.fileName })}
                  className="rounded p-1 text-[var(--ink-4)] hover:text-[var(--ink)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <ul className="mt-3 space-y-1">
          {others.map((a) => (
            <li key={a.id} className="group flex items-center gap-2 text-sm">
              <a href={a.url} target="_blank" rel="noreferrer" className="truncate text-[var(--ink-2)] underline">
                {a.fileName}
              </a>
              <button
                type="button"
                onClick={() => void del(a.id, a.fileName)}
                aria-label={t('journal.deleteFile', { name: a.fileName })}
                className="rounded p-1 text-[var(--ink-4)] hover:text-[var(--ink)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void add(e.target.files)
          // Reset so picking the same file again fires onChange.
          e.target.value = ''
        }}
      />
    </section>
  )
}

function Earlier({
  selected,
  people,
  onOpen,
}: {
  selected: string
  people: readonly MentionCandidate[]
  onOpen: (day: string) => void
}) {
  const { t, i18n } = useTranslation()
  const [typed, setTyped] = useState('')
  const [query, setQuery] = useState('')
  const { data: entries = [], isPending } = useQuery({
    ...journalRecentQueryOptions(query),
    placeholderData: keepPreviousData,
  })
  const fmt = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const shown = entries.filter((e) => query || e.day !== selected)

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-4">
        <SecLabel>{query ? t('journal.searchResults') : t('journal.earlier')}</SecLabel>
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault()
            setQuery(typed.trim())
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-4)]" />
          <input
            type="search"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value)
              if (e.target.value === '') setQuery('')
            }}
            placeholder={t('journal.searchPlaceholder')}
            aria-label={t('journal.searchPlaceholder')}
            maxLength={200}
            className="w-44 rounded-lg border border-[var(--hairline)] bg-transparent py-1.5 pr-2 pl-8 text-sm text-[var(--ink)] outline-hidden transition-all placeholder:text-[var(--ink-4)] focus:w-56 focus:border-[var(--hairline-2)]"
          />
        </form>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-[var(--ink-3)]">
          {isPending ? t('common.loading') : query ? t('journal.noResults') : t('journal.noEarlier')}
        </p>
      ) : (
        <ul>
          {shown.map((e) => {
            const lead = e.highlights[0] ?? e.content
            const pictures = e.attachments.filter((a) => a.fileType === 'image').length
            return (
              <li key={e.id} style={{ borderTop: '1px solid var(--hairline)' }}>
                <button
                  type="button"
                  onClick={() => onOpen(e.day)}
                  className="-mx-3 flex w-[calc(100%+1.5rem)] items-baseline gap-4 rounded-lg px-3 py-3 text-left transition-colors hover:bg-[var(--vellum)]/60"
                >
                  <span
                    className="w-32 shrink-0"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      letterSpacing: '0.04em',
                      color: 'var(--ink-3)',
                    }}
                  >
                    {fmt.format(dateOf(e.day))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[15px] text-[var(--ink)]">
                      {lead ? toPlain(lead, people) : t('journal.picturesOnly')}
                    </span>
                    {e.highlights.length > 1 && (
                      <span className="mt-0.5 block truncate text-sm text-[var(--ink-3)]">
                        {e.highlights
                          .slice(1)
                          .map((h) => toPlain(h, people))
                          .join(' · ')}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 self-center">
                    {pictures > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--ink-3)]">
                        <ImageIcon className="h-3 w-3" />
                        {pictures}
                      </span>
                    )}
                    <span className="flex -space-x-1.5">
                      {e.mentions.slice(0, 4).map((m) => (
                        <span key={m.personId} className="rounded-full ring-2 ring-[var(--paper)]" title={m.name}>
                          <Avatar name={m.name} emoji={m.emoji} size="xs" shape="circle" />
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Day({ day, today, people }: { day: string; today: string; people: readonly MentionCandidate[] }) {
  const { t } = useTranslation()
  const { data: entry = null, isPending } = useQuery(journalEntryQueryOptions(day))
  const removeEntry = useDeleteJournalEntry()

  const deleteDay = async () => {
    if (!confirm(t('journal.confirmDeleteDay'))) return
    try {
      await removeEntry.mutateAsync({ day })
    } catch {
      toast.error(t('common.deleteFailed'))
    }
  }

  if (isPending) return <p className="text-sm text-[var(--ink-3)]">{t('common.loading')}</p>

  return (
    <div className="space-y-10">
      <Highlights day={day} entry={entry} people={people} />
      <Prose day={day} entry={entry} people={people} />
      <Pictures day={day} entry={entry} />
      {entry && entry.mentions.length > 0 && (
        <section>
          <SecLabel style={{ marginBottom: 12 }}>{t('journal.people')}</SecLabel>
          <div className="flex flex-wrap gap-2">
            {entry.mentions.map((m) => (
              <Link
                key={m.personId}
                to="/app/people"
                search={{ filter: 'all', person: m.personId }}
                className="inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm text-[var(--ink)] transition-colors hover:bg-[var(--vellum)]"
                style={{ border: '1px solid var(--hairline)' }}
              >
                <Avatar name={m.name} emoji={m.emoji} size="xs" shape="circle" />
                {m.name}
              </Link>
            ))}
          </div>
        </section>
      )}
      {entry && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void deleteDay()}
            disabled={removeEntry.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-[var(--ink-3)] transition-colors hover:bg-[var(--rust-soft)] hover:text-[var(--rust)]"
          >
            <Trash2 className="h-3 w-3" />
            {day === today ? t('journal.deleteToday') : t('journal.deleteDay')}
          </button>
        </div>
      )}
    </div>
  )
}

export default function Journal() {
  const { t, i18n } = useTranslation()
  const people = useMentionPeople()

  const { day: dayParam } = Route.useSearch()
  const navigate = Route.useNavigate()
  const today = useLocalToday()
  // A day in the URL is shown as asked. Without one the page is today's, which
  // only the browser knows: until it has rendered there is no day to show.
  const day = dayParam ?? today
  const open = (next: string) =>
    void navigate({ search: (prev) => ({ ...prev, day: next === today ? undefined : next }) })

  const date = day ? dateOf(day) : null
  const weekday = date ? new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(date) : ''
  const rest = date
    ? new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
    : ''
  const when =
    !day || !today
      ? ''
      : day === today
        ? t('journal.today')
        : day === shiftDay(today, -1)
          ? t('journal.yesterday')
          : day > today
            ? t('journal.ahead')
            : t('journal.past')

  const navButton =
    'flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--hairline-2)] text-[var(--ink-2)] transition-colors hover:bg-[var(--vellum)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--paper)' }}>
      <header className="px-6 pt-10 pb-7 md:px-12" style={{ borderBottom: '1px solid var(--hairline)' }}>
        <div className="mx-auto flex max-w-3xl items-end justify-between gap-6">
          <div className="min-w-0">
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '0.08em',
                color: 'var(--ink-3)',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              {when ? t('journal.eyebrow', { when }) : t('journal.eyebrowBare')}
            </div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                // A long date at full size takes three lines on a phone.
                fontSize: 'clamp(30px, 7.5vw, 44px)',
                lineHeight: 1.2,
                letterSpacing: '-0.02em',
                color: 'var(--ink)',
                minHeight: '1.2em',
              }}
            >
              {date && (
                <>
                  <span className="capitalize">{weekday}</span>, <span className="brand-em">{rest}</span>
                </>
              )}
            </h1>
          </div>
          {day && today && (
            <div className="flex shrink-0 items-center gap-1.5 pb-1.5">
              {day !== today && (
                <button
                  type="button"
                  onClick={() => open(today)}
                  className="mr-1 h-9 rounded-lg border border-[var(--hairline-2)] px-3 text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
                >
                  {t('journal.goToday')}
                </button>
              )}
              <button
                type="button"
                onClick={() => open(shiftDay(day, -1))}
                aria-label={t('journal.previousDay')}
                title={t('journal.previousDay')}
                className={navButton}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => open(shiftDay(day, 1))}
                disabled={day >= today}
                aria-label={t('journal.nextDay')}
                title={t('journal.nextDay')}
                className={navButton}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </header>
      {day && today && (
        <div className="mx-auto max-w-3xl space-y-14 px-6 py-9 md:px-12">
          {/* Keyed by day: every draft and timer inside belongs to one day. */}
          <Day key={day} day={day} today={today} people={people} />
          <Earlier selected={day} people={people} onOpen={open} />
        </div>
      )}
    </div>
  )
}
