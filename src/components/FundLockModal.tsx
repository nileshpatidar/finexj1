import React, { useState } from 'react';
import { api } from '../services/api';
import { UserBalanceSummary } from '../types';
import {
  Lock,
  Clock,
  ShieldCheck,
  Zap,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  X,
  Loader2,
  Calendar,
  Sparkles,
} from 'lucide-react';

interface FundLockModalProps {
  isOpen: boolean;
  onClose: () => void;
  balance: UserBalanceSummary | null;
  onLockUpdated: () => void;
}

export const FundLockModal: React.FC<FundLockModalProps> = ({
  isOpen,
  onClose,
  balance,
  onLockUpdated,
}) => {
  const [selectedDays, setSelectedDays] = useState<number>(30);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const isCurrentlyLocked = balance?.isFundLocked || false;
  const remainingDays = balance?.fundLockRemainingDays || 0;
  const remainingHours = balance?.fundLockRemainingHours || 0;
  const lockExpiryDate = balance?.fundLockUntil ? new Date(balance.fundLockUntil) : null;

  const handleLockFunds = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await api.lockFunds(selectedDays, `User requested ${selectedDays}-day yield lock protection.`);
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: `Funds successfully locked for ${selectedDays} days! Unlock date: ${new Date(res.fundLockUntil).toLocaleDateString()}.`,
        });
        onLockUpdated();
        setTimeout(() => {
          onClose();
        }, 1800);
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: (err as Error).message || 'Failed to apply fund lock.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 sm:p-8 space-y-6 text-slate-100 overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-start justify-between relative z-10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">
                30-Day Fund Lock & Yield Rule
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Institutional Liquidity Governance & Capital Protection
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center space-x-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                : 'bg-red-500/10 text-red-300 border-red-500/20'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Live Lock Status Card */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 relative z-10">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
              Current Lock State
            </span>
            <span
              className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                isCurrentlyLocked
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              {isCurrentlyLocked ? 'Active 30-Day Lock' : 'Unlocked / Flexible'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80">
              <span className="text-[10px] uppercase font-semibold text-slate-500 block">Remaining Lock Time</span>
              <p className="text-base font-extrabold text-slate-200 mt-0.5">
                {isCurrentlyLocked ? `${remainingDays}d ${remainingHours}h` : '0 Days (Eligible)'}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80">
              <span className="text-[10px] uppercase font-semibold text-slate-500 block">Unlock Date</span>
              <p className="text-xs font-bold text-emerald-400 mt-1 truncate">
                {lockExpiryDate ? lockExpiryDate.toLocaleDateString() : 'Ready for Payout'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-[11px] text-slate-400 pt-1">
            <TrendingUp className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>
              Daily performance yield continues earning and compounding throughout all lock periods.
            </span>
          </div>
        </div>

        {/* Core Rules Explained */}
        <div className="space-y-2.5 text-xs text-slate-300 relative z-10">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Fund Lock Governance Rules
          </h3>
          <div className="space-y-2">
            <div className="flex items-start space-x-2.5 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
              <Clock className="w-4 h-4 text-teal-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-200">Automatic 30-Day Post-Withdrawal Re-Lock:</strong>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  Whenever you submit a withdrawal request, any remaining fund balance is automatically re-locked for <strong>30 days</strong> to preserve liquidity depth and stabilize pool yield.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2.5 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
              <Zap className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-200">Uninterrupted Daily Yield:</strong>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  Locked capital remains fully active in the trading strategies. Daily performance distributions are calculated at 00:00 UTC and credited to your ledger without interruption.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Voluntary Lock / Extension Controls */}
        <div className="space-y-3 pt-2 border-t border-slate-800 relative z-10">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Voluntarily Lock / Extend Fund Period</span>
            </label>
            <span className="text-[10px] text-slate-400">Yield Optimization</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[30, 60, 90].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setSelectedDays(days)}
                className={`py-2 px-3 rounded-xl font-bold text-xs border transition ${
                  selectedDays === days
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                    : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'
                }`}
              >
                {days} Days Lock
              </button>
            ))}
          </div>

          <button
            onClick={handleLockFunds}
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-2 transition disabled:opacity-50 shadow-lg shadow-emerald-500/20"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
            <span>Lock Funds for {selectedDays} Days</span>
          </button>
        </div>
      </div>
    </div>
  );
};
