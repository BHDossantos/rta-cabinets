import type { ReactNode } from 'react';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state state-loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state state-empty">
      <p className="state-title">{title}</p>
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <p className="state-title">
        <span aria-hidden="true">⛔ </span>Error: {message}
      </p>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

type Tone = 'info' | 'warning' | 'success' | 'error';
const TONE_ICON: Record<Tone, string> = { info: 'ℹ', warning: '⚠', success: '✓', error: '⛔' };
const TONE_WORD: Record<Tone, string> = { info: 'Note', warning: 'Warning', success: 'Done', error: 'Error' };

/** Inline message; the icon and a text prefix make the tone clear without color. */
export function Notice({ tone = 'info', title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <span className="notice-icon" aria-hidden="true">{TONE_ICON[tone]}</span>
      <div>
        <strong>{title ?? TONE_WORD[tone]}</strong>
        {children && <div className="notice-body">{children}</div>}
      </div>
    </div>
  );
}
