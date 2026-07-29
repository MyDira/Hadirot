import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  MessageSquare,
  RotateCcw,
  Search,
  Send,
  Sparkles,
} from 'lucide-react';
import {
  smsInboxService,
  formatPhoneDisplay,
  type SmsThread,
  type SmsMessage,
  type ThreadContext,
} from '@/services/smsInbox';
import { Toast } from '@/components/shared/Toast';

/** Human labels for where an automated outbound text came from. */
const SOURCE_LABELS: Record<string, string> = {
  intake_outreach: 'Posting offer',
  outreach_response: 'Auto-reply',
  system_response: 'Auto-reply',
  renewal_reminder: 'Renewal reminder',
  report_rented: 'Rented report',
  admin_manual: 'You',
};

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function ThreadListItem({
  thread,
  active,
  onClick,
}: {
  thread: SmsThread;
  active: boolean;
  onClick: () => void;
}) {
  const unread = thread.unread_count > 0;
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${
        active ? 'bg-[#4E4B43]/5' : 'hover:bg-gray-50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={`text-sm truncate ${unread ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>
          {thread.contact_name || formatPhoneDisplay(thread.phone_number)}
        </p>
        <span className="text-[11px] text-gray-400 flex-shrink-0">
          {timeLabel(thread.last_message_at)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <p className={`text-xs truncate ${unread ? 'text-gray-700' : 'text-gray-500'}`}>
          {thread.last_direction === 'outbound' && <span className="text-gray-400">You: </span>}
          {thread.last_message_body}
        </p>
        {unread && (
          <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[11px] font-semibold flex items-center justify-center">
            {thread.unread_count}
          </span>
        )}
      </div>
      {thread.contact_name && (
        <p className="text-[11px] text-gray-400 mt-0.5">{formatPhoneDisplay(thread.phone_number)}</p>
      )}
    </button>
  );
}

function MessageBubble({ message }: { message: SmsMessage }) {
  const outbound = message.direction === 'outbound';
  const sourceLabel = outbound ? SOURCE_LABELS[message.message_source ?? ''] ?? 'Hadirot' : null;
  const failed = message.status === 'failed' || message.status === 'undelivered';
  return (
    <div className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] ${outbound ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`px-3.5 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
            outbound
              ? 'bg-[#4E4B43] text-white rounded-br-sm'
              : 'bg-gray-100 text-gray-900 rounded-bl-sm'
          }`}
        >
          {message.message_body}
        </div>
        <p className="text-[10px] text-gray-400 mt-1 px-1">
          {sourceLabel && <span>{sourceLabel} · </span>}
          {timeLabel(message.created_at)}
          {failed && <span className="text-red-500 font-medium"> · not delivered</span>}
        </p>
      </div>
    </div>
  );
}

export function MessagesSection() {
  const [threads, setThreads] = useState<SmsThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [context, setContext] = useState<ThreadContext>({ leads: [], listings: [] });
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadThreads = useCallback(async (q?: string) => {
    try {
      setThreads(await smsInboxService.listThreads(q));
    } catch {
      setToast('Failed to load conversations');
    } finally {
      setThreadsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadThreads();
    // Keep the list fresh while the admin sits on this screen.
    const interval = setInterval(() => loadThreads(search), 30000);
    return () => clearInterval(interval);
  }, [loadThreads, search]);

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => loadThreads(search), 300);
    return () => clearTimeout(t);
  }, [search, loadThreads]);

  const openThread = useCallback(
    async (phone: string) => {
      setActivePhone(phone);
      setMessagesLoading(true);
      try {
        const msgs = await smsInboxService.getThread(phone);
        setMessages(msgs);
        setContext(await smsInboxService.getThreadContext(msgs));
        await smsInboxService.markThreadRead(phone);
        // Reflect the read receipt in the list without a refetch round-trip.
        setThreads((prev) =>
          prev.map((t) => (t.phone_number === phone ? { ...t, unread_count: 0 } : t)),
        );
      } catch {
        setToast('Failed to load this conversation');
      } finally {
        setMessagesLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  const activeThread = useMemo(
    () => threads.find((t) => t.phone_number === activePhone) ?? null,
    [threads, activePhone],
  );

  const handleSend = async () => {
    const text = reply.trim();
    if (!text || !activePhone || sending) return;
    setSending(true);
    try {
      await smsInboxService.sendMessage(activePhone, text);
      setReply('');
      const msgs = await smsInboxService.getThread(activePhone);
      setMessages(msgs);
      loadThreads(search);
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const threadPane = (
    <div className="flex flex-col h-full min-h-0">
      {/* Thread header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3">
        <button
          onClick={() => setActivePhone(null)}
          className="md:hidden p-1 -ml-1 text-gray-500 hover:text-gray-800"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {activeThread?.contact_name || (activePhone ? formatPhoneDisplay(activePhone) : '')}
          </p>
          {activeThread?.contact_name && activePhone && (
            <a href={`tel:${activePhone}`} className="text-xs text-blue-600 hover:underline">
              {formatPhoneDisplay(activePhone)}
            </a>
          )}
        </div>
        <button
          onClick={() => activePhone && openThread(activePhone)}
          className="p-1.5 text-gray-400 hover:text-gray-700"
          title="Refresh conversation"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Context chips */}
      {(context.leads.length > 0 || context.listings.length > 0) && (
        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/60 flex flex-wrap gap-1.5">
          {context.leads.map((lead) => (
            <span
              key={lead.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-amber-50 text-amber-800 border border-amber-200"
            >
              <Sparkles className="w-3 h-3" />
              Intake lead: {lead.title || 'Untitled'}
              {lead.published_listing_id && (
                <a
                  href={`/listing/${lead.published_listing_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:text-blue-800"
                  title="View live listing"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </span>
          ))}
          {context.listings.map((listing) => (
            <a
              key={listing.id}
              href={`/listing/${listing.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100"
            >
              Listing: {listing.title}
              <ExternalLink className="w-3 h-3" />
            </a>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
        {messagesLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      <div className="border-t border-gray-200 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Text this landlord… (Enter to send)"
            rows={2}
            className="flex-1 resize-none px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={!reply.trim() || sending}
            className="p-2.5 bg-[#4E4B43] text-white rounded-lg hover:bg-[#3a3833] disabled:opacity-40 transition-colors"
            aria-label="Send message"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">
          Sends a real SMS from the Hadirot number. Replies land back in this inbox.
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Messages</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Every SMS conversation with landlords — posting offers, renewals, and your replies.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden flex h-[calc(100vh-16rem)] min-h-[480px]">
        {/* Thread list — hidden on mobile once a thread is open */}
        <div
          className={`w-full md:w-80 lg:w-96 md:border-r border-gray-200 flex-col min-h-0 ${
            activePhone ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="p-3 border-b border-gray-200">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or phone…"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {threadsLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            ) : threads.length === 0 ? (
              <div className="text-center py-12 px-6">
                <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">
                  No conversations yet. Send a posting offer from Listing Intake to start one.
                </p>
              </div>
            ) : (
              threads.map((t) => (
                <ThreadListItem
                  key={t.phone_number}
                  thread={t}
                  active={t.phone_number === activePhone}
                  onClick={() => openThread(t.phone_number)}
                />
              ))
            )}
          </div>
        </div>

        {/* Thread pane */}
        <div className={`flex-1 min-w-0 ${activePhone ? 'flex flex-col' : 'hidden md:flex'}`}>
          {activePhone ? (
            threadPane
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center px-6">
                <MessageSquare className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">Select a conversation to read and reply</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
