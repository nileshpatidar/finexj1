import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Headphones, Send, X, ExternalLink, ShieldCheck } from 'lucide-react';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose }) => {
  const [telegramUrl, setTelegramUrl] = useState('https://t.me/FINEXJ_OfficialSupport');

  useEffect(() => {
    api.getSettings().then(s => {
      if (s.telegramSupportUrl) setTelegramUrl(s.telegramSupportUrl);
    }).catch(() => {});
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-md p-6 sm:p-7 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5 text-xs text-slate-900 dark:text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/20">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">FINEXJ Support Desk</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Official Telegram Representative & Desk</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 rounded-2xl bg-blue-50 dark:bg-slate-900 border border-blue-200 dark:border-slate-800 space-y-2 text-slate-700 dark:text-slate-300">
          <div className="flex items-center space-x-2 text-blue-600 dark:text-blue-400 font-bold">
            <ShieldCheck className="w-4 h-4" />
            <span>FINEXJ Official Telegram Channel</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
            For real-time inquiries regarding FINEXJ BEP-20 deposits, blockchain confirmations, withdrawal reviews, or fund policies, connect directly with our 24/7 official Telegram support team.
          </p>
        </div>

        <div className="space-y-2 pt-1">
          <a
            href={telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs shadow-lg shadow-blue-500/25 transition flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>Open Telegram Live Support</span>
            <ExternalLink className="w-3.5 h-3.5 ml-1" />
          </a>

          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
