'use client'

import { FolderOpen, FilePlus, FileText } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface FileSelectionModalProps {
  onOpenFile: () => Promise<void>
  onNewFile: () => Promise<void>
  lastFileName: string | null
}

export default function FileSelectionModal({ onOpenFile, onNewFile, lastFileName }: FileSelectionModalProps) {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpenFile = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      await onOpenFile()
    } catch {
      setError(t('fileSelection.openFailed'))
      setIsLoading(false)
    }
  }, [onOpenFile, t])

  const handleNewFile = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      await onNewFile()
    } catch {
      setError(t('fileSelection.createFailed'))
      setIsLoading(false)
    }
  }, [onNewFile, t])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'o' || e.key === 'O') {
        e.preventDefault()
        void handleOpenFile()
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        void handleNewFile()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleOpenFile, handleNewFile])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--paper)]">
      <div className="w-full max-w-md space-y-8 px-8">
        <div className="text-center">
          <FileText className="mx-auto h-16 w-16 opacity-50" />
          <h1 className="mt-6 text-3xl font-light">{t('fileSelection.welcome')}</h1>
          <p className="mt-2 text-sm opacity-60">
            {lastFileName ? t('fileSelection.selectOrCreate') : t('fileSelection.createFirst')}
          </p>
          {lastFileName && (
            <p className="mt-2 text-xs opacity-40">{t('fileSelection.lastOpened', { name: lastFileName })}</p>
          )}
        </div>

        <div className="space-y-4">
          <button
            onClick={handleOpenFile}
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-[var(--hairline-2)] bg-[var(--vellum)] py-4 font-light transition-all hover:bg-[var(--surface-inverse)] hover:text-[var(--on-inverse)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FolderOpen className="h-5 w-5" />
            <div className="text-left">
              <div>{t('fileSelection.openExisting')}</div>
              <div className="text-xs opacity-60">{t('fileSelection.pressO')}</div>
            </div>
          </button>

          <button
            onClick={handleNewFile}
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-[var(--hairline-2)] bg-[var(--vellum)] py-4 font-light transition-all hover:bg-[var(--surface-inverse)] hover:text-[var(--on-inverse)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FilePlus className="h-5 w-5" />
            <div className="text-left">
              <div>{t('fileSelection.createNew')}</div>
              <div className="text-xs opacity-60">{t('fileSelection.pressN')}</div>
            </div>
          </button>
        </div>

        {error && <p className="text-center text-sm text-[var(--rust)]">{error}</p>}

        {isLoading && <p className="text-center text-sm opacity-60">{t('common.loading')}</p>}
      </div>
    </div>
  )
}
