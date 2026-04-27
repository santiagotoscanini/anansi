"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
  // Used as the boundary's reset key — pass the activeTab so switching tabs
  // resets the boundary and a previously-broken tab gets another chance.
  resetKey?: string;
}

interface State {
  error: Error | null;
}

// Class boundary because React only supports componentDidCatch on classes.
// Scoped to the dashboard's renderActive() so a crash in any single tab
// (React Flow, Pulse, the weekly sync canvas, …) shows a recoverable card
// instead of a blank screen for the whole app. Sidebar nav stays usable so
// the user can switch tabs to escape a stuck render.
export class DashboardErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[DashboardErrorBoundary] caught:", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center p-8">
          <div className="max-w-md rounded-2xl border border-red-500/30 bg-red-950/30 p-6 text-center">
            <div className="mb-3 flex justify-center text-red-300">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-white">This view crashed</h2>
            <p className="mb-4 text-sm text-white/70">
              Something threw while rendering. Switch tabs in the sidebar to keep working — or reload to retry.
            </p>
            <p className="mb-4 break-words font-mono text-xs text-red-300/80">{this.state.error.message}</p>
            <button
              onClick={() => this.setState({ error: null })}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white transition hover:bg-white/15"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
