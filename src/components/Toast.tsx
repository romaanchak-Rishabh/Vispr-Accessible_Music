import type { JSX } from 'react';
import { useUI } from '../store/ui';

export function Toast(): JSX.Element | null {
  const toast = useUI((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="toast" key={toast.nonce} role="status">
      {toast.msg}
    </div>
  );
}
