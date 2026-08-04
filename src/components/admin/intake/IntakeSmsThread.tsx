import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, Send } from 'lucide-react';
import { smsInboxService, type SmsMessage } from '@/services/smsInbox';

interface IntakeSmsThreadProps {
  /** E.164 phone for this lead; null hides the thread entirely. */
  phone: string | null;
  /** Changes to reload the thread after the lead's outreach state moves. */
  refreshKey?: string | number;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * The landlord's SMS conversation, inline in the lead drawer — so the admin can
 * read what they actually said and answer without leaving the lead they're
 * working. Same send path as the Messages inbox.
 */
export function IntakeSmsThread({ phone, refreshKey }: IntakeSmsThreadProps) {
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!phone) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    smsInboxService
      .getThread(phone)
      .then((rows) => {
        if (cancelled) return;
        setMessages(rows);
        // Opening a lead counts as reading its thread.
        smsInboxService.markThreadRead(phone).catch(() => {});
      })
      .catch(() => !cancelled && setError('Could not load the conversation'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [phone, refreshKey]);

  useEffect(() => {
    if (loading || messages.length === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [messages, loading]);

  const handleSend = async () => {
    const text = reply.trim();
    if (!text || !phone || sending) return;
    setSending(true);
    setError(null);
    try {
      await smsInboxService.sendMessage(phone, text);
      setReply('');
      setMessages(await smsInboxService.getThread(phone));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  if (!phone) return null;

  return (
    <div className="space-y-2">
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
        </div>
      ) : messages.length === 0 ? (
        <p className="text-xs text-gray-500">
          No texts with this number yet. Sending the offer starts the conversation.
        </p>
      ) : (
        <div
          ref={scrollRef}
          className="max-h-64 overflow-y-auto space-y-2 pr-1 rounded-md bg-gray-50 p-2.5"
        >
          {messages.map((m) => {
            const outbound = m.direction === 'outbound';
            return (
              <div key={m.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] flex flex-col ${outbound ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`px-2.5 py-1.5 rounded-xl text-xs whitespace-pre-wrap break-words ${
                      outbound
                        ? 'bg-[#4E4B43] text-white rounded-br-sm'
                        : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm'
                    }`}
                  >
                    {m.message_body}
                  </div>
                  <span className="text-[10px] text-gray-400 mt-0.5 px-0.5">
                    {timeLabel(m.created_at)}
                    {(m.status === 'failed' || m.status === 'undelivered') && (
                      <span className="text-red-500 font-medium"> · not delivered</span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-end gap-1.5">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Reply to this landlord…"
          rows={2}
          className="flex-1 resize-none px-2.5 py-1.5 text-xs border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          onClick={handleSend}
          disabled={!reply.trim() || sending}
          className="p-2 bg-[#4E4B43] text-white rounded-md hover:bg-[#3a3833] disabled:opacity-40 transition-colors"
          aria-label="Send text"
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <a
        href="/admin/messages"
        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
      >
        Open in Messages <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}
