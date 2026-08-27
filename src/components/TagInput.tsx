import { useRef, useState, useEffect, useId } from 'react';
import type { JSX } from 'react';

interface TagInputProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
  label?: string;
}

export function TagInput({ value, onChange, options, placeholder, label }: TagInputProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ x: number; y: number; moved: boolean }>({ x: 0, y: 0, moved: false });
  const uid = useId();

  // Sync external value changes
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Refs so the delayed blur handler never reads stale render-time values
  const queryRef = useRef(query);
  queryRef.current = query;
  const valueRef = useRef(value);
  valueRef.current = value;

  const filtered = options.filter((opt) =>
    opt.toLowerCase().includes(query.trim().toLowerCase())
  );
  const exactMatch = options.some((o) => o.toLowerCase() === query.trim().toLowerCase());
  const showCustom = query.trim().length > 0 && !exactMatch && filtered.length < options.length;
  const displayOptions = [...filtered];
  if (showCustom) displayOptions.push(`Use "${query.trim()}"`);

  const select = (val: string): void => {
    onChange(val);
    setQuery(val);
    setOpen(false);
    setActiveIdx(-1);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % displayOptions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + displayOptions.length) % displayOptions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && activeIdx < displayOptions.length) {
        const opt = displayOptions[activeIdx];
        select(opt.startsWith('Use "') ? query.trim() : opt);
      } else if (query.trim()) {
        select(query.trim());
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIdx(-1);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const el = listRef.current.children[activeIdx] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIdx]);

  const listboxId = `taglist-${uid}`;

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      {label && (
        <label style={{ display: 'block', fontSize: 11, color: 'var(--label-secondary)', marginBottom: 3, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
          {label}
        </label>
      )}
      <input
        ref={inputRef}
        className="search-input"
        style={{ paddingLeft: 10, fontSize: 13, width: '100%', boxSizing: 'border-box' }}
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIdx(-1);
          if (!open) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Delay so clicks on dropdown items register first
          setTimeout(() => {
            setOpen(false);
            // If user typed something not in options, offer it as custom
            const q = queryRef.current.trim();
            if (q && q !== valueRef.current) {
              const match = options.find((o) => o.toLowerCase() === q.toLowerCase());
              onChange(match ?? q);
              setQuery(match ?? q);
            } else {
              setQuery(valueRef.current ?? '');
            }
          }, 120);
        }}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
      />
      {open && displayOptions.length > 0 && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 200,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--separator)',
            borderRadius: 8,
            marginTop: 4,
            maxHeight: 160,
            overflowY: 'auto',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            padding: 4
          }}
        >
          {displayOptions.map((opt, i) => {
            const isCustom = opt.startsWith('Use "');
            const isActive = i === activeIdx;
            return (
              <div
                key={opt}
                role="option"
                aria-selected={isActive}
                onPointerDown={(e) => {
                  dragState.current = { x: e.clientX, y: e.clientY, moved: false };
                  e.preventDefault();
                }}
                onPointerMove={(e) => {
                  const s = dragState.current;
                  if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) s.moved = true;
                }}
                onPointerUp={() => {
                  const s = dragState.current;
                  if (!s.moved) select(isCustom ? query.trim() : opt);
                  s.moved = true;
                }}
                onPointerCancel={() => {
                  dragState.current.moved = true;
                }}
                onMouseEnter={() => setActiveIdx(i)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: 'pointer',
                  touchAction: 'pan-y',
                  background: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--label)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontWeight: isCustom ? 500 : 400
                }}
              >
                {opt}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
