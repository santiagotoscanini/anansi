import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { History, Image as ImageIcon, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toEditable } from '~/lib/mentions'
import type { SyncItem } from '~/lib/queries/sync'
import MentionField from './MentionField'
import MarkdownText from './MarkdownText'
import { useMentionPeople } from './MentionText'

interface Props {
  item: SyncItem
  // The set of attachment ids currently being deleted, so the parent's modal
  // confirmation flow can drive the spinner overlay on individual thumbnails.
  deletingFileIds: ReadonlySet<string>
  /** Saving empty notes clears them. */
  onSaveText: (content: string) => Promise<void>
  onUploadFiles: (files: FileList) => Promise<void>
  // Parent shows the actual confirmation modal — we just bubble up the click.
  onDeleteFileClick: (fileId: string, fileName: string) => void
  /** Absent where an item cannot be taken off the week (Pulse). */
  onRemoveFromSync?: () => Promise<void>
  /** A label beside the title: the goal, where items of several goals are listed together. */
  context?: string
}

const notesStyle = {
  fontFamily: 'var(--font-text)',
  fontSize: 15,
  lineHeight: 1.6,
  color: 'var(--ink)',
} as const

// One item of the weekly sync: its notes and its pictures. Reads like a page
// of the journal, on purpose: the notes are prose you click to edit, people
// are mentioned with `@`, and the pictures sit underneath.
//
// The row owns its draft and its debounce, so the parent keeps no per-item
// maps. Notes are edited as plain text with `@Name` in it; the server links
// them on save.
export default function WeeklySyncItemRow({
  item,
  deletingFileIds,
  onSaveText,
  onUploadFiles,
  onDeleteFileClick,
  onRemoveFromSync,
  context,
}: Props) {
  const { t } = useTranslation()
  const people = useMentionPeople()
  const images = item.attachments.filter((a) => a.fileType === 'image')
  const stored = item.textContent ?? ''

  const [draft, setDraft] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // The text typed but not yet sent, with the timer that will send it.
  const pending = useRef<{ text: string; timer: ReturnType<typeof setTimeout> } | null>(null)

  const send = async (text: string) => {
    pending.current = null
    try {
      await onSaveText(text)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      // The parent has already said what went wrong.
      setSaveStatus('idle')
    }
  }

  const handleChange = (text: string) => {
    setDraft(text)
    setSaveStatus('saving')
    if (pending.current) clearTimeout(pending.current.timer)
    pending.current = { text, timer: setTimeout(() => void send(text), 1000) }
  }

  const finish = () => {
    const waiting = pending.current
    if (waiting) {
      clearTimeout(waiting.timer)
      void send(waiting.text)
    }
    setDraft(null)
  }

  const quietButton =
    'rounded-md p-1.5 text-[var(--ink-4)] transition-colors hover:bg-[var(--vellum)] hover:text-[var(--ink)]'

  return (
    <div className="group flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h4 className="text-[15px] font-medium text-[var(--ink)]">
              {item.title}
              {context && <span className="ml-2 text-xs font-normal text-[var(--ink-4)]">{context}</span>}
            </h4>
            {item.description && <p className="mt-0.5 text-[13px] text-[var(--ink-3)]">{item.description}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <span
              className="mr-1 text-xs"
              style={{ color: saveStatus === 'saved' ? 'var(--moss)' : 'var(--ink-3)' }}
              aria-live="polite"
            >
              {saveStatus === 'saving' && t('weeklySyncRow.savingStatus')}
              {saveStatus === 'saved' && t('weeklySyncRow.savedStatus')}
            </span>
            <div className="flex items-center gap-0.5 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
              <Link
                to="/app/tracking-items"
                search={{ item: item.trackingItemId }}
                className={quietButton}
                title={t('overTime.openTitle')}
                aria-label={t('overTime.openTitle')}
              >
                <History className="h-4 w-4" />
              </Link>
              {onRemoveFromSync && (
                <button
                  type="button"
                  onClick={() => void onRemoveFromSync()}
                  className={`${quietButton} hover:!bg-[var(--rust-soft)] hover:!text-[var(--rust)]`}
                  title={t('weeklySyncRow.removeFromSyncTitle')}
                  aria-label={t('weeklySyncRow.removeFromSync')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-2">
          {draft !== null ? (
            <>
              <MentionField
                multiline
                autoFocus
                value={draft}
                onChange={handleChange}
                people={people}
                maxLength={100_000}
                placeholder={t('weeklySyncRow.notesPlaceholder')}
                aria-label={t('weeklySyncRow.notesPlaceholder')}
                className="block min-h-[72px] w-full resize-none rounded-lg px-3 py-2 outline-hidden placeholder:text-[var(--ink-4)]"
                style={{
                  ...notesStyle,
                  fieldSizing: 'content',
                  background: 'var(--canvas)',
                  border: '1px solid var(--hairline-2)',
                }}
              />
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <span className="text-xs text-[var(--ink-4)]">{t('weeklySyncRow.mentionHint')}</span>
                <button
                  type="button"
                  onClick={finish}
                  className="rounded-md px-2.5 py-1 text-xs text-[var(--ink-2)] transition-colors hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
                >
                  {t('weeklySyncRow.done')}
                </button>
              </div>
            </>
          ) : stored.trim() ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => setDraft(toEditable(stored, people))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setDraft(toEditable(stored, people))
              }}
              title={t('weeklySyncRow.clickToEdit')}
              className="-mx-2 cursor-text rounded-lg px-2 py-1 transition-colors hover:bg-[var(--vellum)]/60"
              style={notesStyle}
            >
              <MarkdownText text={stored} attachments={item.attachments} link />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDraft('')}
              className="-mx-2 block rounded-md px-2 py-1 text-left text-sm text-[var(--ink-4)] italic transition-colors hover:bg-[var(--vellum)]/60 hover:text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-text)' }}
            >
              {t('weeklySyncRow.addNote')}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 sm:max-w-[55%] sm:justify-end">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`order-last flex items-center justify-center rounded-lg text-[var(--ink-4)] transition-colors hover:bg-[var(--vellum)] hover:text-[var(--ink-2)] md:order-none ${
            images.length > 0
              ? 'h-20 w-20 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100'
              : 'h-9 gap-2 px-3 text-xs'
          }`}
          style={{ border: '1px dashed var(--hairline-2)' }}
          title={t('weeklySyncRow.addImages')}
          aria-label={t('weeklySyncRow.addImages')}
        >
          <ImageIcon className="h-4 w-4" />
          {images.length === 0 && <span>{t('weeklySyncRow.addImages')}</span>}
        </button>
        {images.map((file, index) => {
          const isDeleting = deletingFileIds.has(file.id)
          return (
            <div key={file.id} className="group/pic relative h-20 w-20 overflow-hidden rounded-lg bg-[var(--vellum)]">
              <a href={file.url} target="_blank" rel="noreferrer" title={file.fileName}>
                <img
                  src={file.url}
                  alt={t('weeklySyncRow.savedAlt', { index: index + 1 })}
                  loading="lazy"
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity ${isDeleting ? 'opacity-50' : ''}`}
                />
              </a>
              {isDeleting ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--hairline-2)] border-t-[var(--ink)]" />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onDeleteFileClick(file.id, file.fileName)}
                  className="absolute top-1 right-1 rounded-full p-1 transition-opacity md:opacity-0 md:group-hover/pic:opacity-100"
                  style={{ background: 'var(--surface-inverse)', color: 'var(--on-inverse)' }}
                  title={t('weeklySyncRow.deleteTitle', { name: file.fileName })}
                  aria-label={t('weeklySyncRow.deleteTitle', { name: file.fileName })}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          if (e.target.files) void onUploadFiles(e.target.files)
          // Reset so re-selecting the same file fires onChange again.
          e.target.value = ''
        }}
        className="hidden"
      />
    </div>
  )
}
