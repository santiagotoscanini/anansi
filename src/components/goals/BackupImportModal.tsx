import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useRef } from 'react'
import { X, AlertTriangle, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { Trans, useTranslation } from 'react-i18next'
import { backupSchema, type Backup } from '~/lib/api/types'
import { importBackup } from '~/server/fn/backup.fn'

interface BackupImportModalProps {
  onClose: () => void
}

interface ParsedBackup {
  backup: Backup
  fileName: string
}

export default function BackupImportModal({ onClose }: BackupImportModalProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const importMutation = useMutation({
    mutationFn: (backup: Backup) => importBackup({ data: { backup, confirmReplace: true } }),
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<ParsedBackup | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [confirmToken, setConfirmToken] = useState('')

  const canConfirm = parsed !== null && confirmToken === 'REPLACE' && !importMutation.isPending

  const handleFile = async (file: File) => {
    setParseError(null)
    setParsed(null)
    try {
      const text = await file.text()
      const json: unknown = JSON.parse(text)
      const result = backupSchema.safeParse(json)
      if (!result.success) {
        const first = result.error.issues[0]
        setParseError(
          first
            ? t('backupImport.notValidWithDetail', {
                path: first.path.join('.') || 'root',
                message: first.message,
              })
            : t('backupImport.notValid'),
        )
        return
      }
      setParsed({ backup: result.data, fileName: file.name })
    } catch (err) {
      setParseError(err instanceof Error ? err.message : t('backupImport.readFailed'))
    }
  }

  const handleConfirm = async () => {
    if (!parsed) return
    toast.loading(t('backupImport.restoringToast'), { id: 'backup-import' })
    try {
      const res = await importMutation.mutateAsync(parsed.backup)
      // An import replaces the account wholesale, so nothing in the cache
      // survives it — reset rather than invalidate, or every screen renders the
      // pre-import data until its own refetch lands.
      await queryClient.resetQueries()
      const msg = res.fileFailures.length
        ? t('backupImport.restoredWithFailures', { count: res.fileFailures.length })
        : t('backupImport.restoredOk')
      if (res.fileFailures.length) {
        toast.error(msg, { id: 'backup-import', duration: 6000 })
      } else {
        toast.success(msg, { id: 'backup-import' })
      }
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('backupImport.importFailed'), { id: 'backup-import' })
    }
  }

  const b = parsed?.backup

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/80 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-[var(--hairline-2)] bg-[var(--paper)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            <h3 className="text-lg font-light">{t('backupImport.title')}</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 transition-all hover:bg-[var(--vellum)]"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* File picker */}
        {!parsed && (
          <div className="mb-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleFile(file)
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-lg border border-dashed border-[var(--hairline-2)] px-4 py-8 text-sm text-[var(--ink-2)] transition-all hover:border-[var(--hairline-2)] hover:bg-[var(--vellum)]"
            >
              {t('backupImport.chooseFile')}
            </button>
            {parseError && (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-[var(--rust)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{parseError}</span>
              </p>
            )}
          </div>
        )}

        {/* Summary + confirmation */}
        {parsed && b && (
          <div className="space-y-4">
            <div className="rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] p-3 text-sm">
              <div className="mb-2 truncate text-[var(--ink-3)]">{parsed.fileName}</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div className="text-[var(--ink-2)]">{t('backupImport.summaryExported')}</div>
                <div className="text-right">{b.exportedAt.toISOString().slice(0, 10)}</div>
                <div className="text-[var(--ink-2)]">{t('backupImport.summaryAccount')}</div>
                <div className="truncate text-right" title={b.user.email}>
                  {b.user.email}
                </div>
                <div className="text-[var(--ink-2)]">{t('backupImport.summaryGoals')}</div>
                <div className="text-right">{b.goals.length}</div>
                <div className="text-[var(--ink-2)]">{t('backupImport.summaryValues')}</div>
                <div className="text-right">{b.values.length}</div>
                <div className="text-[var(--ink-2)]">{t('backupImport.summaryConnections')}</div>
                <div className="text-right">{b.connections.length}</div>
                <div className="text-[var(--ink-2)]">{t('backupImport.summaryTrackingItems')}</div>
                <div className="text-right">{b.trackingItems.length}</div>
                <div className="text-[var(--ink-2)]">{t('backupImport.summaryWeeklySyncs')}</div>
                <div className="text-right">{b.weeklySync.length}</div>
                <div className="text-[var(--ink-2)]">{t('backupImport.summaryFiles')}</div>
                <div className="text-right">{b.files.length}</div>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-[var(--rust)] bg-[var(--rust-soft)] p-3 text-sm text-[var(--rust)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--rust)]" />
              <span>
                <Trans
                  i18nKey="backupImport.warningBody"
                  components={{
                    strong: <strong />,
                    code: <code className="rounded bg-[var(--paper-deep)] px-1" />,
                  }}
                />
              </span>
            </div>

            <input
              type="text"
              value={confirmToken}
              onChange={(e) => setConfirmToken(e.target.value)}
              placeholder={t('backupImport.typeReplace')}
              className="w-full rounded-lg border border-[var(--hairline-2)] bg-transparent px-4 py-2 text-[var(--ink)] placeholder-[var(--ink-4)] outline-hidden transition-all focus:border-[var(--hairline-2)]"
              autoFocus
            />

            <div className="flex gap-2">
              <button
                onClick={onClose}
                disabled={importMutation.isPending}
                className="flex-1 rounded-lg border border-[var(--hairline-2)] px-4 py-2 transition-all hover:bg-[var(--vellum)] disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleConfirm}
                disabled={!canConfirm}
                className="flex-1 rounded-lg border border-[var(--rust)] bg-[var(--rust-soft)] px-4 py-2 text-[var(--rust)] transition-all hover:bg-[var(--rust-soft)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {importMutation.isPending ? t('backupImport.restoring') : t('backupImport.replaceEverything')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
