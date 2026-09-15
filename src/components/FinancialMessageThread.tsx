import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { FinancialMessage } from '../types';
import { Send, Lock, MessageSquare, ShieldCheck, User as UserIcon, Loader2, AlertCircle } from 'lucide-react';

interface FinancialMessageThreadProps {
  recordType: 'deposit' | 'withdrawal';
  recordId: string;
  isAdmin?: boolean;
}

export const FinancialMessageThread: React.FC<FinancialMessageThreadProps> = ({
  recordType,
  recordId,
  isAdmin = false,
}) => {
  const [messages, setMessages] = useState<FinancialMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      let res;
      if (isAdmin) {
        res = recordType === 'deposit'
          ? await api.getAdminDepositMessages(recordId)
          : await api.getAdminWithdrawalMessages(recordId);
      } else {
        res = recordType === 'deposit'
          ? await api.getUserDepositMessages(recordId)
          : await api.getUserWithdrawalMessages(recordId);
      }
      setMessages(res.messages || []);
    } catch (err: any) {
      console.warn('Failed to fetch messages:', err);
      setError(err.message || 'Unable to load message thread.');
    } finally {
      setLoading(false);
    }
  }, [recordType, recordId, isAdmin]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (!loading && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = text.trim();
    if (!cleanText || sending) return;

    setSending(true);
    setError(null);
    try {
      if (isAdmin) {
        if (recordType === 'deposit') {
          await api.sendAdminDepositMessage(recordId, { message: cleanText, isInternal });
        } else {
          await api.sendAdminWithdrawalMessage(recordId, { message: cleanText, isInternal });
        }
      } else {
        if (recordType === 'deposit') {
          await api.sendUserDepositMessage(recordId, cleanText);
        } else {
          await api.sendUserWithdrawalMessage(recordId, cleanText);
        }
      }
      setText('');
      setIsInternal(false);
      await fetchMessages();
    } catch (err: any) {
      setError(err.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
        <div className="flex items-center space-x-2 text-xs font-bold text-slate-700 dark:text-slate-300">
          <MessageSquare className="w-4 h-4 text-blue-500" />
          <span>{recordType === 'deposit' ? 'Deposit' : 'Withdrawal'} Communication & Notes</span>
        </div>
        <span className="text-[11px] text-slate-400 font-medium">
          {messages.length} {messages.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {error && (
        <div className="flex items-center space-x-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 p-2.5 rounded-lg border border-red-200 dark:border-red-900">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6 text-slate-400 text-xs">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          <span>Loading messages...</span>
        </div>
      ) : messages.length === 0 ? (
        <div className="py-5 text-center text-slate-400 text-xs italic">
          No communication records yet. Use the field below to leave a note or inquire.
        </div>
      ) : (
        <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
          {messages.map((m) => {
            const isUserSender = m.senderType === 'user';
            const isInternalNote = m.isInternal;

            return (
              <div
                key={m.id}
                className={`p-2.5 rounded-xl text-xs space-y-1 ${
                  isInternalNote
                    ? 'bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200'
                    : isUserSender
                    ? 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                    : 'bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 text-blue-950 dark:text-blue-200'
                }`}
              >
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center space-x-1.5 font-bold">
                    {isInternalNote ? (
                      <>
                        <Lock className="w-3 h-3 text-amber-500" />
                        <span className="text-amber-600 dark:text-amber-400 uppercase tracking-wider text-[10px]">
                          Internal Admin Note (Private)
                        </span>
                      </>
                    ) : isUserSender ? (
                      <>
                        <UserIcon className="w-3 h-3 text-slate-500" />
                        <span>{m.senderName || 'Investor'}</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-3 h-3 text-blue-500" />
                        <span className="text-blue-600 dark:text-blue-400">FINEXJ Administration</span>
                      </>
                    )}
                  </div>
                  <span className="text-slate-400 text-[10px]">
                    {new Date(m.createdAt).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="whitespace-pre-wrap leading-relaxed break-words">{m.message}</p>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={handleSend} className="space-y-2 pt-1 border-t border-slate-200 dark:border-slate-800">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            isAdmin
              ? isInternal
                ? 'Write an internal admin note (never visible to user)...'
                : 'Write a response visible to the user...'
              : 'Write a message or inquiry to FINEXJ administration...'
          }
          maxLength={2000}
          rows={2}
          className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
        />

        <div className="flex items-center justify-between">
          {isAdmin ? (
            <label className="flex items-center space-x-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isInternal}
                onChange={(e) => setIsInternal(e.target.checked)}
                className="rounded text-amber-600 focus:ring-amber-500 border-slate-300"
              />
              <span className="flex items-center space-x-1">
                <Lock className="w-3 h-3 text-amber-500" />
                <span className={isInternal ? 'font-bold text-amber-600 dark:text-amber-400' : ''}>
                  Internal Note Only
                </span>
              </span>
            </label>
          ) : (
            <span className="text-[11px] text-slate-400">
              Messages are securely delivered to institutional desk administrators.
            </span>
          )}

          <button
            type="submit"
            disabled={!text.trim() || sending}
            className={`flex items-center space-x-1.5 py-1.5 px-3 rounded-lg text-xs font-bold text-white transition disabled:opacity-50 cursor-pointer ${
              isInternal ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {sending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>{isAdmin ? (isInternal ? 'Save Internal Note' : 'Send to User') : 'Send Message'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
