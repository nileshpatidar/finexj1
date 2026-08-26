import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { EarningItem } from '../types';
import { InvestmentPlanSection } from './InvestmentPlanSection';
import { InvestmentPlanModal } from './InvestmentPlanModal';
import {
  TrendingUp,
  ShieldCheck,
  Calendar,
  Layers,
  Info,
  DollarSign,
  HelpCircle,
} from 'lucide-react';

export const EarningsView: React.FC = () => {
  const [earnings, setEarnings] = useState<EarningItem[]>([]);
  const [totalEarnings, setTotalEarnings] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);

  useEffect(() => {
    const loadEarnings = async () => {
      try {
        const res = await api.getEarnings();
        setEarnings(res.earnings || []);
        setTotalEarnings(res.totalEarnings || 0);
      } catch (err) {
        console.warn('Failed to load earnings:', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadEarnings();
  }, []);

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-24">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 dark:text-slate-100 text-slate-900">
            Daily Fund Performance
          </h1>
          <p className="text-xs text-slate-400 dark:text-slate-400 text-slate-500 mt-1">
            Detailed breakdown of your institutional daily earnings and verified yield allocations.
          </p>
        </div>
        <button
          onClick={() => setIsPlanModalOpen(true)}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/20 text-xs font-semibold transition"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Earning Plan</span>
        </button>
      </div>

      {/* Hero Earnings Banner */}
      <div className="rounded-3xl bg-gradient-to-br from-teal-950 via-slate-900 to-slate-950 border border-teal-500/30 p-6 sm:p-8 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-teal-400" />
            <span className="text-xs uppercase font-bold tracking-wider text-teal-300">
              Cumulative Yield Distributed
            </span>
          </div>
          <span className="px-2.5 py-0.5 text-xs font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded-full">
            Verified Allocations
          </span>
        </div>

        <div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl sm:text-5xl font-extrabold tracking-tight text-teal-400">
              +${totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-sm font-semibold text-slate-400">USDT</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Total historical daily earnings credited to your available balance.
          </p>
        </div>
      </div>

      {/* Embedded Comprehensive Investment Plan & Return Explanation */}
      <InvestmentPlanSection onOpenDetailedModal={() => setIsPlanModalOpen(true)} />

      {/* Earnings Ledger Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400 text-slate-500">
            Earnings Ledger ({earnings.length} records)
          </h2>
        </div>

        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-16 bg-slate-900/60 rounded-2xl"></div>
            <div className="h-16 bg-slate-900/60 rounded-2xl"></div>
            <div className="h-16 bg-slate-900/60 rounded-2xl"></div>
          </div>
        ) : earnings.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400 text-xs">
            No daily earnings records yet. Once your confirmed deposits reach the first eligibility date, daily earnings will appear here.
          </div>
        ) : (
          <div className="space-y-2">
            {earnings.map(entry => {
              const isProfit = entry.earningsAmount > 0;
              const isLoss = entry.earningsAmount < 0;
              const isNeutral = entry.earningsAmount === 0;

              return (
                <div
                  key={entry.id}
                  className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition ${
                    isProfit
                      ? 'bg-slate-900/60 border-slate-800/70'
                      : isLoss
                      ? 'bg-rose-950/20 border-rose-500/30'
                      : 'bg-slate-900/40 border-slate-800/50'
                  }`}
                >
                  <div className="flex items-start sm:items-center space-x-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold flex-shrink-0 ${
                        isProfit
                          ? 'bg-teal-500/10 text-teal-400'
                          : isLoss
                          ? 'bg-rose-500/10 text-rose-400'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {isProfit && <TrendingUp className="w-5 h-5" />}
                      {isLoss && <TrendingUp className="w-5 h-5 rotate-180 text-rose-400" />}
                      {isNeutral && <ShieldCheck className="w-5 h-5 text-slate-300" />}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-100 dark:text-slate-100 text-slate-900 text-sm">
                          {entry.performanceDate}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isProfit
                              ? 'bg-teal-500/20 text-teal-400 border-teal-500/30'
                              : isLoss
                              ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          {isProfit
                            ? `+${(entry.applicableRate * 100).toFixed(2)}% Profit`
                            : isLoss
                            ? `${(entry.applicableRate * 100).toFixed(2)}% Loss`
                            : '0.00% Safe (No Trade)'}
                        </span>
                      </div>

                      {/* Note description */}
                      {entry.note ? (
                        <p
                          className={`text-[11px] mt-1 font-medium ${
                            isNeutral
                              ? 'text-slate-300 font-semibold'
                              : isLoss
                              ? 'text-rose-300/80'
                              : 'text-slate-400'
                          }`}
                        >
                          {entry.note}
                        </p>
                      ) : isNeutral ? (
                        <p className="text-[11px] mt-1 text-slate-300 font-semibold">
                          We are safe today, no investment today (Capital Preserved).
                        </p>
                      ) : null}

                      <div className="flex items-center space-x-3 text-[10px] text-slate-500 mt-1">
                        <span>Base Eligible: ${entry.baseEligibleAmount.toFixed(2)} USDT</span>
                        <span>•</span>
                        <span>Calc Ref: {entry.calculationId.substring(0, 14)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right sm:text-right pl-13 sm:pl-0">
                    <span
                      className={`font-extrabold text-base ${
                        isProfit
                          ? 'text-teal-400'
                          : isLoss
                          ? 'text-rose-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {isProfit
                        ? `+$${entry.earningsAmount.toFixed(4)}`
                        : isLoss
                        ? `-$${Math.abs(entry.earningsAmount).toFixed(4)}`
                        : '$0.0000'}
                    </span>
                    <p className="text-[10px] text-slate-500">
                      {isProfit
                        ? 'Credited to Balance'
                        : isLoss
                        ? 'Adjusted from Balance'
                        : 'Capital Preserved'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      <InvestmentPlanModal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
      />
    </div>
  );
};
