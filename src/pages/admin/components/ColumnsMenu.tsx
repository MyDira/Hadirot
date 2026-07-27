import React, { useEffect, useRef, useState } from 'react';
import { Columns3, Check } from 'lucide-react';

export interface ColumnOption {
  key: string;
  label: string;
}

export function loadVisibleColumns(storageKey: string, allKeys: string[]): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((k): k is string => typeof k === 'string'));
      }
    }
  } catch {
    // fall through to default
  }
  return new Set(allKeys);
}

export function ColumnsMenu({
  columns,
  visible,
  onToggle,
  storageKey,
}: {
  columns: ColumnOption[];
  visible: Set<string>;
  onToggle: (key: string) => void;
  storageKey: string;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(visible)));
    } catch {
      // localStorage unavailable — column prefs just won't persist
    }
  }, [visible, storageKey]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <Columns3 className="w-4 h-4" />
        Columns
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-30 py-1">
          {columns.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onToggle(key)}
              className="flex items-center justify-between w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span>{label}</span>
              {visible.has(key) && <Check className="w-4 h-4 text-[#4E4B43]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
