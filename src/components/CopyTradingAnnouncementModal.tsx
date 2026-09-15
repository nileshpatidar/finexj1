import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  X,
  TrendingUp,
  ShieldCheck,
  Sliders,
  AlertTriangle,
  ArrowRight,
  Clock,
} from 'lucide-react';

interface CopyTradingAnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDismissForever?: () => void;
}

export const CopyTradingAnnouncementModal: React.FC<CopyTradingAnnouncementModalProps> = ({
  isOpen,
  onClose,
  onDismissForever,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDismiss = () => {
    if (onDismissForever) {
      onDismissForever();
    }
    onClose();
  };

  return (
    <div
      id="copy-trading-announcement-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="copy-trading-title"
    >
      <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-7 max-h-[90vh] overflow-y-auto space-y-5 text-xs text-slate-700 dark:text-slate-300">
        {/* Close Button */}
        <button
          onClick={handleDismiss}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          aria-label="Close Announcement"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Top Header Badge */}
        <div className="space-y-2 pt-1">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60">
            <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Coming Soon • Planned Feature</span>
          </div>

          <h2
            id="copy-trading-title"
            className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight"
          >
            Institutional Copy Trading
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            We are preparing a planned institutional copy trading environment designed to allow eligible participants to systematically mirror vetted digital-asset trading strategies.
          </p>
        </div>

        {/* Planned Architecture Pillars */}
        <div className="grid grid-cols-1 gap-3">
          {/* Pillar 1 */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex items-start space-x-3">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 font-bold">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center space-x-2">
                <p className="font-bold text-slate-900 dark:text-white text-xs">
                  Strategy Mirroring (Planned)
                </p>
                <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400">Target</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Automated order routing targeting institutional trade execution models across supported digital asset markets.
              </p>
            </div>
          </div>

          {/* Pillar 2 */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex items-start space-x-3">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center flex-shrink-0 font-bold">
              <Sliders className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center space-x-2">
                <p className="font-bold text-slate-900 dark:text-white text-xs">
                  Participant Risk Controls (Planned)
                </p>
                <span className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400">Target</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Configurable allocation caps, drawdown threshold limits, and user-level risk containment settings.
              </p>
            </div>
          </div>

          {/* Pillar 3 */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex items-start space-x-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0 font-bold">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center space-x-2">
                <p className="font-bold text-slate-900 dark:text-white text-xs">
                  Audited Performance Tracking (Planned)
                </p>
                <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Target</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Transparent verification logs and execution statistics subject to availability upon official deployment.
              </p>
            </div>
          </div>
        </div>

        {/* Copy-Trading Risk Disclosure */}
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 space-y-1.5">
          <div className="flex items-center space-x-2 font-bold text-[11px] text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <span>Copy Trading Risk Disclosure</span>
          </div>
          <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
            Digital asset trading and copy-trading strategies carry significant financial risk. Historical returns do not guarantee future outcomes. Target performance may vary, and capital loss is possible. Features described are currently under planned development and remain subject to regulatory, technical, and platform availability.
          </p>
        </div>

        {/* Action Button */}
        <div className="pt-1 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 text-[11px]">
            <Clock className="w-3.5 h-3.5" />
            <span>Status: Planned / In Development</span>
          </div>

          <button
            id="dismiss-copy-trading-btn"
            onClick={handleDismiss}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition cursor-pointer"
          >
            Understood & Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
