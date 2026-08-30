import { useState } from 'react';
import type { JSX } from 'react';
import { tryParseShareText, type SharePayload } from '../lib/share';

interface PasteShareSheetProps {
  onParse: (payload: SharePayload) => void;
  onClose: () => void;
}

export function PasteShareSheet({ onParse, onClose }: PasteShareSheetProps): JSX.Element {
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const handleImport = () => {
    const payload = tryParseShareText(text);
    if (payload) {
      onParse(payload);
    } else {
      setError('Not a valid Vispr share. Make sure you copied the full text.');
    }
  };

  const handlePaste = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      setText(clipText);
      setError('');
    } catch {
      setError('Could not access clipboard. Paste manually.');
    }
  };

  return (
    <div className="sheet-overlay" style={{ alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="action-sheet" style={{ width: 'min(420px, 95%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="action-sheet-head">
          <div style={{ fontSize: 17, fontWeight: 600 }}>Paste Share</div>
        </div>
        <div style={{ padding: '0 16px 8px', fontSize: 13, color: 'var(--label-secondary)' }}>
          Paste the Vispr share text you received.
        </div>
        <div style={{ padding: '0 16px' }}>
          <textarea
            className="search-input"
            style={{ width: '100%', minHeight: 120, padding: 12, fontSize: 13, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }}
            placeholder="Paste share text here..."
            value={text}
            onChange={(e) => { setText(e.target.value); setError(''); }}
          />
          {error && <div style={{ marginTop: 6, fontSize: 13, color: '#ff3b30' }}>{error}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px 16px' }}>
          <button className="pill-btn" style={{ flex: 1 }} onClick={() => void handlePaste()}>Paste from Clipboard</button>
          <button className="pill-btn primary" style={{ flex: 1 }} onClick={handleImport} disabled={!text.trim()}>Import</button>
          <button className="pill-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
