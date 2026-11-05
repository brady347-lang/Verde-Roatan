import React from 'react';

interface State {
  error: Error | null;
}

/**
 * Last line of defence: if any component throws while rendering or inside an effect,
 * show a recoverable screen instead of a blank white page.
 */
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center bg-[var(--bg,#fff)] text-[var(--ink,#111)]">
        <h1 className="text-xl font-extrabold">Something went wrong</h1>
        <p className="text-sm opacity-70 max-w-sm">
          Verde Roatán hit an unexpected problem. Your saved plants and photos are safe. Tap reload to continue.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-5 py-3 rounded-2xl bg-[var(--palm,#166534)] text-white font-bold"
        >
          Reload app
        </button>
      </div>
    );
  }
}
