import type { ReactNode } from 'react';

interface AlertProps {
  kind: 'error' | 'success' | 'info';
  children: ReactNode;
  onDismiss?: () => void;
}

export default function Alert({ kind, children, onDismiss }: AlertProps) {
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {onDismiss && (
        <button type="button" className="alert-close" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
