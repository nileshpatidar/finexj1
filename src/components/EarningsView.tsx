import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { EarningItem } from '../types';
import { InvestmentPlanSection } from './InvestmentPlanSection';
import { InvestmentPlanModal } from './InvestmentPlanModal';
import {
  TrendingUp,
  ShieldCheck,
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
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
            Daily Fund Performance
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Detailed breakdown of your institutional daily earnings and verified yield allocations.
          </p>
        </div>
        <button
          onClick={() => setIsPlanModalOpen(true)}
          className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 text-xs font-bold transition cursor-pointer"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Earning Plan</span>
        </button>
      </div>

      {/* Hero Earnings Banner */}
      <div className="rounded-3xl bg-[#0F172A] border border-slate-800 p-6 sm:p-8 shadow-xl text-white space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            <span className="text-xs uppercase font-bold tracking-wider text-slate-300">
              Cumulative Yield Distributed
            </span>
          </div>
          <span className="px-2.5 py-0.5 text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full">
            Verified Allocations
          </span>
        </div>

        <div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
              +${totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-base font-bold text-slate-400">USDT</span>
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
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Earnings Ledger ({earnings.length} records)
          </h2>
        </div>

        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-16 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
            <div className="h-16 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
            <div className="h-16 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
          </div>
        ) : earnings.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs">
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
                  className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition shadow-xs ${
                    isProfit
                      ? 'bg-white dark:bg-[#0F172A] border-slate-200 dark:border-slate-800'
                      : isLoss
                      ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40'
                      : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-start sm:items-center space-x-3.5">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold flex-shrink-0 ${
                        isProfit
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : isLoss
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {isProfit && <TrendingUp className="w-5 h-5" />}
                      {isLoss && <TrendingUp className="w-5 h-5 rotate-180 text-rose-600" />}
                      {isNeutral && <ShieldCheck className="w-5 h-5 text-slate-500" />}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white text-sm">
                          {entry.performanceDate}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded text-[10px] font-bold border ${
                            isProfit
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                              : isLoss
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {isProfit
                            ? `+${(Number(entry.applicableRate || 0) * 100).toFixed(2)}% Profit`
                            : isLoss
                            ? `${(Number(entry.applicableRate || 0) * 100).toFixed(2)}% Loss`
                            : '0.00% Safe (No Trade)'}
                        </span>
                      </div>

                      {/* Note description */}
                      {entry.note ? (
                        <p
                          className={`text-[11px] mt-1 font-medium ${
                            isNeutral
                              ? 'text-slate-700 dark:text-slate-300 font-semibold'
                              : isLoss
                              ? 'text-rose-700 dark:text-rose-300/90'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {entry.note}
                        </p>
                      ) : isNeutral ? (
                        <p className="text-[11px] mt-1 text-slate-700 dark:text-slate-300 font-semibold">
                          We are safe today, no investment today (Capital Preserved).
                        </p>
                      ) : null}

                      <div className="flex items-center space-x-3 text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                        <span>Base Eligible: ${Number(entry.baseEligibleAmount || 0).toFixed(2)} USDT</span>
                        <span>•</span>
                        <span>Calc Ref: {String(entry.calculationId || '').substring(0, 14)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right sm:text-right pl-13 sm:pl-0">
                    <span
                      className={`font-extrabold text-base ${
                        isProfit
                          ? 'text-blue-600 dark:text-blue-400'
                          : isLoss
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {isProfit
                        ? `+$${Number(entry.earningsAmount || 0).toFixed(4)}`
                        : isLoss
                        ? `-$${Math.abs(Number(entry.earningsAmount || 0)).toFixed(4)}`
                        : '$0.0000'}
                    </span>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
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
