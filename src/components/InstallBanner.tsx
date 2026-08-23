import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useUI } from '../store/ui';
import { DownloadIcon } from './Icons';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallBanner(): JSX.Element | null {
  const dismissed = useUI((s) => s.installBannerDismissed);
  const dismiss = useUI((s) => s.dismissInstall);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIos(ios);
    const standaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setStandalone(standaloneMode);

    const handler = (e: Event): void => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (standalone || dismissed) return null;
  if (!deferred && !isIos) return null;

  return (
    <div className="install-banner">
      <DownloadIcon size={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Install Vispr</div>
          <div style={{ fontSize: 13, color: 'var(--label-secondary)', lineHeight: 1.35 }}>
            {deferred
              ? 'Add to your home screen for a full-screen app experience.'
              : 'Tap Share in Safari, then choose “Add to Home Screen”.'}
        </div>
      </div>
      <button
        className="cta-btn"
        style={{ margin: 0, padding: '9px 18px', fontSize: 14 }}
        onClick={async () => {
          if (deferred) {
            await deferred.prompt();
            await deferred.userChoice;
            setDeferred(null);
          }
          dismiss();
        }}
      >
        Install
      </button>
      <button className="icon-btn" onClick={dismiss} aria-label="Dismiss" style={{ color: 'var(--label-secondary)' }}>
        ×
      </button>
    </div>
  );
}
