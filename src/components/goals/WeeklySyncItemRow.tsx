import { useRef, useState } from 'react'
import { FileText, Image as ImageIcon, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SyncItem } from '~/lib/queries/sync'

interface Props {
  item: SyncItem
  // The set of attachment ids currently being deleted, so the parent's modal
  // confirmation flow can drive the spinner overlay on individual thumbnails.
  deletingFileIds: ReadonlySet<string>
  onSaveText: (content: string) => Promise<void>
  onClearText: () => Promise<void>
  onUploadFiles: (files: FileList) => Promise<void>
  // Parent shows the actual confirmation modal — we just bubble up the click.
  onDeleteFileClick: (fileId: string, fileName: string) => void
  onRemoveFromSync: () => Promise<void>
}

// One item card on the weekly sync canvas. Owns its own draft/save-status
// state so the parent doesn't have to track per-item maps for everyone, and
// debounces auto-save locally with a single timeout ref.
//
// Extracted from WeeklyRetrospective as part of H2 — that component used to
// hold a Record<string, …> for every item's edit state, save status, and
// debounce timer. Pulling those into the row drops ~250 LOC and ~4 piece-of-
// state from the parent.
export default function WeeklySyncItemRow({
  item,
  deletingFileIds,
  onSaveText,
  onClearText,
  onUploadFiles,
  onDeleteFileClick,
  onRemoveFromSync,
}: Props) {
  const { t } = useTranslation()
  const imageFiles = item.attachments.filter((a) => a.fileType === 'image')
  const hasStoredText = !!item.textContent && item.textContent.trim().length > 0
  const hasStoredImages = imageFiles.length > 0

  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(item.textContent ?? '')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Reset draft if the item's stored text changes from outside (e.g. the
  // parent refreshed and merged a different value). Comparison-by-identity.
  const [lastSyncedText, setLastSyncedText] = useState(item.textContent ?? '')
  if ((item.textContent ?? '') !== lastSyncedText) {
    setLastSyncedText(item.textContent ?? '')
    if (!isEditing) setDraft(item.textContent ?? '')
  }

  const handleTextChange = (content: string) => {
    setDraft(content)
    setSaveStatus('saving')
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      const run = async () => {
        try {
          await onSaveText(content)
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus('idle'), 2000)
        } catch {
          setSaveStatus('idle')
        }
      }
      void run()
    }, 1000)
  }

  const startEditing = (initial: string) => {
    setDraft(initial)
    setIsEditing(true)
  }

  const stopEditing = () => {
    setIsEditing(false)
  }

  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h4 className="font-medium">{item.title}</h4>
          {item.description && <p className="mt-1 text-sm opacity-60">{item.description}</p>}
        </div>

        {saveStatus !== 'idle' && (
          <div className="flex items-center gap-1 text-xs">
            {saveStatus === 'saving' && (
              <>
                <div className="h-2 w-2 animate-spin rounded-full border border-[var(--hairline-2)] border-t-white" />
                <span className="opacity-60">{t('weeklySyncRow.savingStatus')}</span>
              </>
            )}
            {saveStatus === 'saved' && <span className="text-[var(--moss)]">{t('weeklySyncRow.savedStatus')}</span>}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {!hasStoredText && (
          <button
            onClick={() => startEditing('')}
            className="flex items-center gap-2 rounded-lg border border-[var(--hairline-2)] bg-[var(--vellum)] px-3 py-2 text-sm transition-all hover:bg-[var(--vellum)]"
          >
            <FileText className="h-4 w-4" />
            {t('weeklySyncRow.addText')}
          </button>
        )}

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 rounded-lg border border-[var(--hairline-2)] bg-[var(--vellum)] px-3 py-2 text-sm transition-all hover:bg-[var(--vellum)]"
        >
          <ImageIcon className="h-4 w-4" />
          {t('weeklySyncRow.addImages')}
        </button>

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

        <button
          onClick={() => void onRemoveFromSync()}
          className="flex items-center gap-2 rounded-lg border border-[var(--hairline)] px-3 py-2 text-sm text-[var(--ink-2)] transition-all hover:border-[var(--rust)] hover:bg-[var(--rust-soft)] hover:text-[var(--rust)]"
          title={t('weeklySyncRow.removeFromSyncTitle')}
        >
          <Trash2 className="h-4 w-4" />
          {t('weeklySyncRow.removeFromSync')}
        </button>
      </div>

      {/* Fresh-text editor (only when there is no stored text yet). */}
      {!hasStoredText && isEditing && (
        <div className="mt-3">
          <textarea
            value={draft}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder={t('weeklySyncRow.notesPlaceholder')}
            rows={4}
            className="w-full rounded-lg border border-[var(--hairline-2)] bg-[var(--vellum)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition-all focus:border-[var(--hairline-2)]"
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={stopEditing}
              className="rounded-lg border border-[var(--hairline-2)] px-3 py-1 text-sm transition-all hover:bg-[var(--vellum)]"
            >
              {t('weeklySyncRow.done')}
            </button>
          </div>
        </div>
      )}

      {(hasStoredText || hasStoredImages) && (
        <div className="mt-3 space-y-3">
          <h5 className="text-sm font-medium opacity-70">{t('weeklySyncRow.content')}</h5>

          {hasStoredText && (
            <div className="rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 opacity-60" />
                  <span className="text-sm opacity-70">{t('weeklySyncRow.savedNotes')}</span>
                </div>
                <button
                  onClick={() => void onClearText()}
                  className="rounded p-1 text-[var(--rust)] opacity-60 transition-all hover:bg-[var(--rust-soft)] hover:opacity-100"
                  title={t('weeklySyncRow.clearNotes')}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              {isEditing ? (
                <div>
                  <textarea
                    value={draft}
                    onChange={(e) => handleTextChange(e.target.value)}
                    placeholder={t('weeklySyncRow.notesPlaceholder')}
                    rows={4}
                    className="w-full rounded-lg border border-[var(--hairline-2)] bg-[var(--vellum)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition-all focus:border-[var(--hairline-2)]"
                    autoFocus
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={stopEditing}
                      className="rounded-lg border border-[var(--hairline-2)] px-3 py-1 text-sm transition-all hover:bg-[var(--vellum)]"
                    >
                      {t('weeklySyncRow.done')}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => startEditing(item.textContent ?? '')}
                  className="cursor-pointer rounded p-2 text-sm opacity-80 transition-all hover:bg-[var(--vellum)] hover:opacity-100"
                  title={t('weeklySyncRow.clickToEdit')}
                >
                  {item.textContent}
                </div>
              )}
            </div>
          )}

          {hasStoredImages && (
            <div className="rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] p-3">
              <div className="mb-2 flex items-center gap-2">
                <ImageIcon className="h-4 w-4 opacity-60" />
                <span className="text-sm opacity-70">
                  {t('weeklySyncRow.savedImages', { count: imageFiles.length })}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {imageFiles.slice(0, 4).map((file, index) => {
                  const isDeleting = deletingFileIds.has(file.id)
                  return (
                    <div key={file.id} className="group relative h-16 w-full">
                      {/* Was next/image with `fill`; on a plain <img> that is
                          absolute inset-0 against the sized parent. */}
                      <img
                        src={file.url}
                        alt={t('weeklySyncRow.savedAlt', { index: index + 1 })}
                        className={`absolute inset-0 h-full w-full rounded object-cover transition-opacity ${
                          isDeleting ? 'opacity-50' : ''
                        }`}
                      />

                      {!isDeleting && index < 3 && (
                        <button
                          onClick={() => onDeleteFileClick(file.id, file.fileName)}
                          className="absolute right-1 top-1 block rounded-full bg-[var(--rust)] p-1 text-[var(--ink)] opacity-100 transition-all hover:bg-[var(--rust)] md:hidden md:opacity-0 md:group-hover:block md:group-hover:opacity-100"
                          title={t('weeklySyncRow.deleteTitle', { name: file.fileName })}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}

                      {isDeleting && (
                        <div className="bg-[var(--ink)]/60 absolute inset-0 flex items-center justify-center rounded">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--hairline-2)] border-t-white" />
                        </div>
                      )}

                      {index === 3 && imageFiles.length > 4 && (
                        <div className="bg-[var(--ink)]/60 absolute inset-0 flex items-center justify-center rounded text-xs text-[var(--ink)]">
                          +{imageFiles.length - 3}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
