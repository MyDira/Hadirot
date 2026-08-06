import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Check, ExternalLink, History, Loader2, User, UserPlus } from 'lucide-react';
import type { Profile } from '@/config/supabase';
import { aiIntakeService, type ContactHistory } from '@/services/aiIntake';

interface ContactHistoryChipProps {
  /** Phone as shown on the lead — any format; it gets normalized. */
  phone: string | null | undefined;
  /** The lead being viewed, so it doesn't count itself as prior history. */
  excludeScrapedId?: string;
  /** Account currently set to publish under, so an already-assigned one isn't re-offered. */
  assignedUserId?: string | null;
  /** Assign the matched account in one click, instead of retyping it into the search box. */
  onAssign?: (profile: Profile) => void;
}

/** "3d ago" / "5mo ago" — a call-prep detail, so recency matters more than a date. */
function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/**
 * One compact line under the phone field: has this number posted before, under
 * what account, how recently. Everything else lives behind a click.
 *
 * The drawer is already dense, so this deliberately stays a single row until
 * opened, and renders nothing at all for a number we've never seen — a
 * first-time landlord adds no visual weight.
 */
export function ContactHistoryChip({
  phone,
  excludeScrapedId,
  assignedUserId,
  onAssign,
}: ContactHistoryChipProps) {
  const [history, setHistory] = useState<ContactHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setOpen(false);
    setHistory(null);
    if (!phone?.trim()) return;
    setLoading(true);
    aiIntakeService
      .getContactHistory(phone, excludeScrapedId)
      .then((h) => {
        if (!cancelled) setHistory(h);
      })
      .catch(() => {
        /* history is a nicety — never block the drawer on it */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [phone, excludeScrapedId]);

  // Click-away + Escape, so the popover never traps the admin mid-review.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  if (loading) {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-gray-400">
        <Loader2 className="w-3 h-3 animate-spin" /> Checking contact history…
      </p>
    );
  }

  if (!history) return null;

  const total = history.leadCount + history.listingCount;
  if (total === 0 && !history.account) {
    return <p className="mt-1.5 text-[11px] text-gray-400">First time we've seen this number.</p>;
  }

  const summary = [
    total > 0 ? `Seen ${total}×` : null,
    history.account
      ? history.isAgent
        ? `Agent${history.account.agency ? ` · ${history.account.agency}` : ''}`
        : 'Has an account'
      : null,
    history.lastSeen ? `last ${timeAgo(history.lastSeen)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const account = history.account;
  const alreadyAssigned = !!account && account.id === assignedUserId;

  return (
    <div ref={wrapRef} className="relative mt-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors ${
            history.isAgent
              ? 'bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100'
              : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
          }`}
          aria-expanded={open}
        >
          {history.isAgent ? <BadgeCheck className="w-3 h-3" /> : <History className="w-3 h-3" />}
          {summary}
        </button>

        {/* One click to publish under the account this number already belongs
            to — the whole point of surfacing it. Hidden once it's assigned, so
            the row collapses back to a single chip. */}
        {account && onAssign && !alreadyAssigned && (
          <button
            type="button"
            onClick={() => {
              onAssign(account);
              setOpen(false);
            }}
            title={`Publish under ${account.full_name || 'this account'}`}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-blue-200 bg-blue-50 text-[11px] font-medium text-blue-700 hover:bg-blue-100 transition-colors"
          >
            <UserPlus className="w-3 h-3" />
            Use {account.full_name?.split(' ')[0] || 'this account'}
          </button>
        )}
        {alreadyAssigned && (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-green-700">
            <Check className="w-3 h-3" />
            Publishing under this account
          </span>
        )}
      </div>

      {open && (
        <div className="absolute z-30 mt-1.5 w-80 max-w-[calc(100vw-3rem)] bg-white border border-gray-200 rounded-lg shadow-lg p-3">
          {account && (
            <div className="flex items-start gap-2 pb-2.5 mb-2.5 border-b border-gray-100">
              <User className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-900 truncate">
                  {account.full_name || 'Unnamed account'}
                </p>
                <p className="text-[11px] text-gray-500 capitalize">
                  {account.role}
                  {account.agency ? ` · ${account.agency}` : ''}
                </p>
                {onAssign &&
                  (alreadyAssigned ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-green-700">
                      <Check className="w-3 h-3" /> Publishing under this account
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onAssign(account);
                        setOpen(false);
                      }}
                      className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800"
                    >
                      <UserPlus className="w-3 h-3" /> Publish under this account
                    </button>
                  ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-gray-500 mb-2">
            {history.leadCount} other lead{history.leadCount === 1 ? '' : 's'} ·{' '}
            {history.listingCount} listing{history.listingCount === 1 ? '' : 's'} on the site
          </p>

          {history.items.length === 0 ? (
            <p className="text-[11px] text-gray-400">No prior posts on this number.</p>
          ) : (
            <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {history.items.map((item) => (
                <li key={`${item.kind}-${item.id}`} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] text-gray-800 truncate">{item.title}</p>
                    <p className="text-[10px] text-gray-400">
                      {item.detail} · {timeAgo(item.date)}
                    </p>
                  </div>
                  {item.href && (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-shrink-0 text-blue-600 hover:text-blue-800"
                      title="Open"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
