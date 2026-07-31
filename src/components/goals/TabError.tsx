import type { ErrorComponentProps } from '@tanstack/react-router'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { parseAppError } from '~/lib/queries/errors'

// Every tab route's `errorComponent`. A crash is scoped to the tab: the shell,
// the sidebar and the user menu all keep rendering, so the user can navigate
// out of a broken screen instead of staring at a blank page.
//
// This replaces DashboardErrorBoundary, a class component whose only reason to
// be a class was `componentDidCatch` — and whose `componentDidUpdate` existed
// solely to clear the error when the active tab changed. The router already
// resets an errorComponent on navigation, so that half disappears; what's left
// is a plain function component.
export function TabError({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation()
  // Strip the `CODE: ` prefix the auth middleware adds, so the card shows the
  // message a service actually wrote rather than a wire-format artifact.
  const { message } = parseAppError(error)

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md rounded-2xl border border-[var(--rust)] bg-[var(--rust)] p-6 text-center">
        <div className="mb-3 flex justify-center text-[var(--rust)]">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <h2 className="mb-2 text-lg font-semibold text-[var(--ink)]">{t('errorBoundary.title')}</h2>
        <p className="mb-4 text-sm text-[var(--ink-2)]">{t('errorBoundary.body')}</p>
        <p className="mb-4 break-words font-mono text-xs text-[var(--rust)]">{message}</p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--vellum)] px-3 py-2 text-sm text-[var(--ink)] transition hover:bg-[var(--vellum)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('errorBoundary.tryAgain')}
        </button>
      </div>
    </div>
  )
}
