import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Headphones, Send, X, ExternalLink, ShieldCheck } from 'lucide-react';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose }) => {
  const [telegramUrl, setTelegramUrl] = useState('https://t.me/USDT_FundOfficialSupport');

  useEffect(() => {
    api.getSettings().then(s => {
      if (s.telegramSupportUrl) setTelegramUrl(s.telegramSupportUrl);
    }).catch(() => {});
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-md p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-5 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">Live Support Desk</h2>
              <p className="text-[11px] text-slate-400">Official Telegram Representative</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 rounded-2xl bg-sky-950/30 border border-sky-500/30 space-y-2 text-slate-300">
          <div className="flex items-center space-x-2 text-sky-400 font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Direct Telegram Channel</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400">
            For real-time inquiries regarding USDT BEP-20 deposits, blockchain confirmations, withdrawal reviews, or fund policies, connect directly with our 24/7 official Telegram support team.
          </p>
        </div>

        <div className="space-y-2">
          <a
            href={telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm shadow-lg shadow-sky-500/20 transition flex items-center justify-center space-x-2"
          >
            <Send className="w-4 h-4" />
            <span>Open Telegram Live Support</span>
            <ExternalLink className="w-3.5 h-3.5 ml-1" />
          </a>

          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
