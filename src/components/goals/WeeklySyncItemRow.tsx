import { useRef, useState } from 'react'
import { Image as ImageIcon, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toEditable } from '~/lib/mentions'
import type { SyncItem } from '~/lib/queries/sync'
import MentionField from './MentionField'
import MentionText, { useMentionPeople } from './MentionText'

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
  onRemoveFromSync: () => Promise<void>
}

const notesStyle = {
  fontFamily: 'var(--font-text)',
  fontSize: 16,
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
    'rounded-lg p-2 text-[var(--ink-3)] transition-colors hover:bg-[var(--vellum)] hover:text-[var(--ink)]'

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'var(--canvas)', border: '1px solid var(--hairline)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="font-medium text-[var(--ink)]">{item.title}</h4>
          {item.description && <p className="mt-0.5 text-sm text-[var(--ink-3)]">{item.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <span
            className="mr-1.5 text-xs"
            style={{ color: saveStatus === 'saved' ? 'var(--moss)' : 'var(--ink-3)' }}
            aria-live="polite"
          >
            {saveStatus === 'saving' && t('weeklySyncRow.savingStatus')}
            {saveStatus === 'saved' && t('weeklySyncRow.savedStatus')}
          </span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={quietButton}
            title={t('weeklySyncRow.addImages')}
            aria-label={t('weeklySyncRow.addImages')}
          >
            <ImageIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void onRemoveFromSync()}
            className={`${quietButton} hover:!bg-[var(--rust-soft)] hover:!text-[var(--rust)]`}
            title={t('weeklySyncRow.removeFromSyncTitle')}
            aria-label={t('weeklySyncRow.removeFromSync')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3">
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
              className="block min-h-[120px] w-full resize-y rounded-lg px-4 py-3 outline-hidden placeholder:text-[var(--ink-4)]"
              style={{
                ...notesStyle,
                fieldSizing: 'content',
                background: 'var(--paper)',
                border: '1px solid var(--hairline-2)',
              }}
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-[var(--ink-3)]">{t('weeklySyncRow.mentionHint')}</span>
              <button
                type="button"
                onClick={finish}
                className="rounded-lg border border-[var(--hairline-2)] px-3 py-1 text-sm text-[var(--ink)] transition-colors hover:bg-[var(--vellum)]"
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
            className="-mx-2 cursor-text rounded-lg px-2 py-1 whitespace-pre-wrap transition-colors hover:bg-[var(--vellum)]/50"
            style={notesStyle}
          >
            <MentionText text={stored} link />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDraft('')}
            className="block w-full cursor-text rounded-lg px-4 py-3 text-left transition-colors hover:bg-[var(--vellum)]/50"
            style={{
              ...notesStyle,
              color: 'var(--ink-4)',
              fontStyle: 'italic',
              border: '1px dashed var(--hairline-2)',
            }}
          >
            {t('weeklySyncRow.notesPlaceholder')}
          </button>
        )}
      </div>

      {images.length > 0 && (
        <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {images.map((file, index) => {
            const isDeleting = deletingFileIds.has(file.id)
            return (
              <div key={file.id} className="group relative aspect-square overflow-hidden rounded-lg bg-[var(--vellum)]">
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
                    className="absolute top-1 right-1 rounded-full p-1 transition-opacity md:opacity-0 md:group-hover:opacity-100"
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
      )}

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
