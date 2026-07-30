'use client'

import React from 'react'
import { withTranslation, type WithTranslation } from 'react-i18next'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props extends WithTranslation {
  children: React.ReactNode
  // Used as the boundary's reset key — pass the activeTab so switching tabs
  // resets the boundary and a previously-broken tab gets another chance.
  resetKey?: string
}

interface State {
  error: Error | null
}

// Class boundary because React only supports componentDidCatch on classes.
// Scoped to the dashboard's renderActive() so a crash in any single tab
// (React Flow, Pulse, the weekly sync canvas, …) shows a recoverable card
// instead of a blank screen for the whole app. Sidebar nav stays usable so
// the user can switch tabs to escape a stuck render.
class DashboardErrorBoundaryClass extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[DashboardErrorBoundary] caught:', error, info.componentStack)
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      const { t } = this.props
      return (
        <div className="flex h-full items-center justify-center p-8">
          <div className="max-w-md rounded-2xl border border-[var(--rust)] bg-[var(--rust)] p-6 text-center">
            <div className="mb-3 flex justify-center text-[var(--rust)]">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-[var(--ink)]">{t('errorBoundary.title')}</h2>
            <p className="mb-4 text-sm text-[var(--ink-2)]">{t('errorBoundary.body')}</p>
            <p className="mb-4 break-words font-mono text-xs text-[var(--rust)]">{this.state.error.message}</p>
            <button
              onClick={() => this.setState({ error: null })}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--vellum)] px-3 py-2 text-sm text-[var(--ink)] transition hover:bg-[var(--vellum)]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('errorBoundary.tryAgain')}
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export const DashboardErrorBoundary = withTranslation()(DashboardErrorBoundaryClass)
