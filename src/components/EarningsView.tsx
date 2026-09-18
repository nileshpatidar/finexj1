import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { EarningItem } from '../types';
import { formatPerformanceDate, formatBaseAmount } from '../utils/performanceFormatters';
import { InvestmentPlanModal } from './InvestmentPlanModal';
import {
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  HelpCircle,
  Info,
  ChevronRight,
  Loader2,
} from 'lucide-react';

export const EarningsView: React.FC = () => {
  const { user, token, isLoading: isAuthLoading } = useAuth();
  const isAuthenticatedUser = Boolean(token && user && user.role === 'user');

  const [earnings, setEarnings] = useState<EarningItem[]>([]);
  const [totalEarnings, setTotalEarnings] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [page, setPage] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);

  // Sentinel reference for infinite scroll
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Refs to prevent duplicate fetches or stale state in IntersectionObserver
  const isLoadingRef = useRef(isLoading);
  const isLoadingMoreRef = useRef(isLoadingMore);
  const hasMoreRef = useRef(hasMore);
  const pageRef = useRef(page);

  isLoadingRef.current = isLoading;
  isLoadingMoreRef.current = isLoadingMore;
  hasMoreRef.current = hasMore;
  pageRef.current = page;

  // Initial load: 30 latest records
  useEffect(() => {
    if (!isAuthenticatedUser || isAuthLoading) {
      setEarnings([]);
      setTotalEarnings(0);
      setTotalCount(null);
      setIsLoading(false);
      return;
    }
    let isMounted = true;
    const loadInitial = async () => {
      try {
        setIsLoading(true);
        const res = await api.getEarnings({ page: 0, pageSize: 30 });
        if (isMounted) {
          setEarnings(res.earnings || []);
          setTotalEarnings(res.totalEarnings || 0);
          setTotalCount(res.totalCount ?? res.earnings?.length ?? 0);
          setPage(0);
          setHasMore(Boolean(res.hasMore));
        }
      } catch (err) {
        console.warn('Failed to load earnings:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    loadInitial();
    return () => {
      isMounted = false;
    };
  }, [isAuthenticatedUser, isAuthLoading]);

  // Progressive loading of older records (page + 1)
  const loadMore = useCallback(async () => {
    if (!isAuthenticatedUser || isLoadingRef.current || isLoadingMoreRef.current || !hasMoreRef.current) {
      return;
    }
    const nextPage = pageRef.current + 1;
    setIsLoadingMore(true);
    try {
      const res = await api.getEarnings({ page: nextPage, pageSize: 30 });
      const newItems = res.earnings || [];
      if (newItems.length > 0) {
        setEarnings(prev => {
          const seen = new Set(prev.map(e => e.id));
          const fresh = newItems.filter(e => !seen.has(e.id));
          return [...prev, ...fresh];
        });
        setPage(nextPage);
      }
      setHasMore(Boolean(res.hasMore));
      if (res.totalCount !== undefined) {
        setTotalCount(res.totalCount);
      }
    } catch (err) {
      console.warn('Failed to load older earnings:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isAuthenticatedUser]);

  // IntersectionObserver to auto-request older records when scrolling near the bottom
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      entries => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '250px' }
    );

    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [loadMore]);

  // Latest performance record for the summary card
  const latestEntry = useMemo(() => {
    return earnings.length > 0 ? earnings[0] : null;
  }, [earnings]);

  const latestRate = latestEntry ? Number(latestEntry.applicableRate || 0) : 0;
  const latestAmount = latestEntry ? Number(latestEntry.earningsAmount || 0) : 0;
  const isLatestProfit = latestAmount > 0;
  const isLatestLoss = latestAmount < 0;

  return (
    <div className="w-full max-w-6xl xl:max-w-7xl mx-auto space-y-6 pb-24 sm:pb-12 md:pb-8 text-slate-900 dark:text-white">
      {/* 1. Page Header */}
      <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Daily Performance
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1">
            Detailed performance history and earnings information.
          </p>
        </div>

        <button
          onClick={() => setIsPlanModalOpen(true)}
          className="inline-flex items-center space-x-1.5 self-start xs:self-center px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold transition cursor-pointer flex-shrink-0 min-h-[40px] touch-manipulation"
          aria-label="How Daily Performance Works"
        >
          <HelpCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <span className="hidden xs:inline">How It Works</span>
          <span className="xs:hidden">Help</span>
        </button>
      </div>

      {/* 2. Responsive Financial Summary */}
      <div className="rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-4 sm:p-6 lg:p-7 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800/80">
          {/* Total Earnings */}
          <div className="space-y-1.5 sm:space-y-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
              Total Earnings
            </span>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                +${totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs sm:text-sm font-bold text-slate-400">USDT</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Historical earnings credited to balance
            </p>
          </div>

          {/* Today's / Recent Performance */}
          <div className="pt-4 md:pt-0 md:pl-6 lg:pl-8 space-y-1.5 sm:space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {latestEntry ? "Today's Performance" : 'Recent Performance'}
              </span>
              {latestEntry?.performanceDate && (
                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                  {formatPerformanceDate(latestEntry.performanceDate)}
                </span>
              )}
            </div>

            {latestEntry ? (
              <div className="flex items-baseline space-x-3">
                <span
                  className={`text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight ${
                    isLatestProfit
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : isLatestLoss
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {isLatestProfit ? '+' : ''}{(latestRate * 100).toFixed(2)}%
                </span>
                <span
                  className={`text-lg sm:text-xl lg:text-2xl font-bold ${
                    isLatestProfit
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : isLatestLoss
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {isLatestProfit
                    ? `+$${latestAmount.toFixed(2)}`
                    : isLatestLoss
                    ? `-$${Math.abs(latestAmount).toFixed(2)}`
                    : '$0.00'}
                </span>
              </div>
            ) : (
              <div className="flex items-baseline space-x-2">
                <span className="text-xl sm:text-2xl font-bold text-slate-400 dark:text-slate-500">
                  --
                </span>
              </div>
            )}

            <p className="text-xs text-slate-500 dark:text-slate-400">
              {latestEntry
                ? `Calculated on ${formatBaseAmount(latestEntry.baseEligibleAmount)} USDT base`
                : 'Awaiting first daily performance cycle'}
            </p>
          </div>
        </div>
      </div>

      {/* 3. Compact How It Works Section */}
      {/* Mobile: Small compact row button */}
      <button
        onClick={() => setIsPlanModalOpen(true)}
        className="sm:hidden w-full flex items-center justify-between p-3.5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition cursor-pointer text-left min-h-[48px] touch-manipulation"
      >
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0">
            <Info className="w-4 h-4" />
          </div>
          <span className="text-xs font-semibold text-slate-900 dark:text-white">
            How FinexJ Works
          </span>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
      </button>

      {/* Tablet & Desktop: Compact horizontal informational banner */}
      <div className="hidden sm:flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
        <div className="flex items-center space-x-3.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0">
            <Info className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
              How Daily Performance Works
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate lg:whitespace-normal">
              Daily performance recorded by the fund is allocated to eligible balances according to deposit schedules.
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsPlanModalOpen(true)}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition cursor-pointer flex-shrink-0 ml-4 shadow-2xs"
        >
          <span>Learn More</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 4. Performance History Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            Performance History
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-2">
              ({earnings.length}{totalCount && totalCount > earnings.length ? ` of ${totalCount}` : ''})
            </span>
          </h2>
        </div>

        {isLoading ? (
          <div className="space-y-2.5">
            {/* Mobile Skeletons */}
            <div className="sm:hidden space-y-2.5">
              {[1, 2, 3].map(i => (
                <div key={i} className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800/60 animate-pulse h-24" />
              ))}
            </div>
            {/* Desktop Skeletons */}
            <div className="hidden sm:block rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/60">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="p-4 animate-pulse flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-800" />
                    <div className="space-y-1.5">
                      <div className="w-24 h-3 bg-slate-200 dark:bg-slate-800 rounded" />
                      <div className="w-16 h-2.5 bg-slate-200 dark:bg-slate-800 rounded" />
                    </div>
                  </div>
                  <div className="w-24 h-4 bg-slate-200 dark:bg-slate-800 rounded" />
                  <div className="w-20 h-4 bg-slate-200 dark:bg-slate-800 rounded" />
                </div>
              ))}
            </div>
          </div>
        ) : earnings.length === 0 ? (
          /* Empty State */
          <div className="p-8 sm:p-12 text-center rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400 mb-3">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
              No performance records yet.
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              Once eligible daily performance is recorded, your history will appear here.
            </p>
          </div>
        ) : (
          <div>
            {/* Mobile View: Transaction Cards (< 640px) */}
            <div className="sm:hidden space-y-2.5">
              {earnings.map(entry => {
                const isProfit = entry.earningsAmount > 0;
                const isLoss = entry.earningsAmount < 0;
                const isNeutral = entry.earningsAmount === 0;

                return (
                  <div
                    key={entry.id}
                    className="p-3.5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            isProfit
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : isLoss
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {isProfit && <TrendingUp className="w-4 h-4" />}
                          {isLoss && <TrendingDown className="w-4 h-4" />}
                          {isNeutral && <ShieldCheck className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-900 dark:text-white text-xs block truncate">
                            Daily Performance
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {formatPerformanceDate(entry.performanceDate)}
                          </span>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span
                          className={`font-bold text-sm block ${
                            isProfit
                              ? 'text-emerald-600 dark:text-emerald-400'
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
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 capitalize">
                          {entry.status || (isNeutral ? 'Capital Preserved' : 'Credited')}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        {(Number(entry.applicableRate || 0) * 100).toFixed(2)}% on {formatBaseAmount(entry.baseEligibleAmount)} USDT
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          isProfit
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : isLoss
                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {isProfit ? 'Profit' : isLoss ? 'Loss' : 'Neutral'}
                      </span>
                    </div>

                    {entry.note && (
                      <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                        {entry.note}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop & Tablet Table / Row View (>= 640px) */}
            <div className="hidden sm:block rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
              {/* Header Bar */}
              <div className="grid grid-cols-12 gap-4 px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                <div className="col-span-3">Date</div>
                <div className="col-span-3">Performance & Rate</div>
                <div className="col-span-2">Base Amount</div>
                <div className="col-span-2 text-right">Earnings</div>
                <div className="col-span-2 text-right">Status</div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {earnings.map(entry => {
                  const isProfit = entry.earningsAmount > 0;
                  const isLoss = entry.earningsAmount < 0;
                  const isNeutral = entry.earningsAmount === 0;

                  return (
                    <div
                      key={entry.id}
                      className="grid grid-cols-12 gap-4 px-5 py-3.5 items-center text-xs hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition"
                    >
                      {/* Date */}
                      <div className="col-span-3 flex items-center space-x-3 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            isProfit
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : isLoss
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {isProfit && <TrendingUp className="w-4 h-4" />}
                          {isLoss && <TrendingDown className="w-4 h-4" />}
                          {isNeutral && <ShieldCheck className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-900 dark:text-white block truncate">
                            {formatPerformanceDate(entry.performanceDate)}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Daily Allocation
                          </span>
                        </div>
                      </div>

                      {/* Performance & Rate */}
                      <div className="col-span-3 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`font-bold ${
                              isProfit
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : isLoss
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {isProfit ? '+' : ''}{(Number(entry.applicableRate || 0) * 100).toFixed(2)}%
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              isProfit
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : isLoss
                                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {isProfit ? 'Profit' : isLoss ? 'Loss' : 'Neutral'}
                          </span>
                        </div>
                        {entry.note && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {entry.note}
                          </p>
                        )}
                      </div>

                      {/* Base Amount */}
                      <div className="col-span-2 text-slate-700 dark:text-slate-300 font-medium">
                        {formatBaseAmount(entry.baseEligibleAmount)} USDT
                      </div>

                      {/* Earnings Amount */}
                      <div className="col-span-2 text-right">
                        <span
                          className={`font-bold text-sm ${
                            isProfit
                              ? 'text-emerald-600 dark:text-emerald-400'
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
                      </div>

                      {/* Status */}
                      <div className="col-span-2 text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 capitalize">
                          {entry.status || (isNeutral ? 'Preserved' : 'Credited')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Sentinel for infinite scroll */}
        <div ref={sentinelRef} className="h-1 w-full" />

        {/* Loading more indicator */}
        {isLoadingMore && (
          <div className="py-4 flex items-center justify-center space-x-2 text-xs text-slate-500 dark:text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <span>Loading older performance records...</span>
          </div>
        )}

        {/* Load More manual button */}
        {hasMore && !isLoadingMore && (
          <div className="text-center pt-2">
            <button
              onClick={loadMore}
              className="w-full sm:w-auto px-5 py-2.5 text-xs sm:text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-xl border border-blue-200 dark:border-blue-800/60 transition cursor-pointer min-h-[44px] touch-manipulation"
            >
              Load Older Records
            </button>
          </div>
        )}

        {/* End of ledger notice */}
        {!hasMore && !isLoading && earnings.length > 0 && (
          <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 py-3">
            All {earnings.length} performance records loaded.
          </p>
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
