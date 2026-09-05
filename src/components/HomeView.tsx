import React, { useState, useEffect } from 'react';
import { DashboardResponse, UserReferralSummary, WithdrawalItem } from '../types';
import { InvestmentPlanSection } from './InvestmentPlanSection';
import { InvestmentPlanModal } from './InvestmentPlanModal';
import { FundLockModal } from './FundLockModal';
import { useMarketTicker } from '../context/MarketTickerContext';
import { api } from '../services/api';
import {
  TrendingUp,
  ArrowDownToLine,
  ArrowUpFromLine,
  Wallet,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Headphones,
  ChevronRight,
  HelpCircle,
  Zap,
  Users,
  RefreshCw,
  ShieldCheck,
  Layers,
  BadgeDollarSign,
  Info,
} from 'lucide-react';

interface HomeViewProps {
  data: DashboardResponse | null;
  onNavigate: (view: string) => void;
  onOpenSupport: () => void;
  isLoading: boolean;
  onRefresh?: () => Promise<void> | void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  data,
  onNavigate,
  onOpenSupport,
  isLoading,
  onRefresh,
}) => {
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isFundLockModalOpen, setIsFundLockModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const {
    ticker,
    isLoading: isTickerLoading,
    formatBtcPrice,
    formatGoldPrice,
    format24hChange,
  } = useMarketTicker();

  // Fallback state if referralSummary or activePendingWithdrawal not embedded in data
  const [localReferralSummary, setLocalReferralSummary] = useState<UserReferralSummary | null>(null);
  const [localPendingWithdrawal, setLocalPendingWithdrawal] = useState<WithdrawalItem | null>(null);

  // Revalidate secondary data if not provided directly in dashboard payload
  useEffect(() => {
    if (!data?.referralSummary) {
      api.getUserReferralSummary()
        .then(res => {
          if (res.success && res.summary) {
            setLocalReferralSummary(res.summary);
          }
        })
        .catch(() => {
          // Gracefully continue with balance summary
        });
    }

    if (data?.activePendingWithdrawal === undefined) {
      api.getWithdrawals()
        .then(res => {
          if (res.withdrawals) {
            const pending = res.withdrawals.find(w =>
              ['pending', 'under_review', 'approved', 'processing'].includes(w.status)
            );
            setLocalPendingWithdrawal(pending || null);
          }
        })
        .catch(() => {
          // Gracefully continue
        });
    }
  }, [data]);

  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      }
      const [refRes, withRes] = await Promise.allSettled([
        api.getUserReferralSummary(),
        api.getWithdrawals(),
      ]);
      if (refRes.status === 'fulfilled' && refRes.value.success) {
        setLocalReferralSummary(refRes.value.summary);
      }
      if (withRes.status === 'fulfilled' && withRes.value.withdrawals) {
        const pending = withRes.value.withdrawals.find(w =>
          ['pending', 'under_review', 'approved', 'processing'].includes(w.status)
        );
        setLocalPendingWithdrawal(pending || null);
      }
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  if (isLoading && !data) {
    return (
      <div id="dashboard-loading-skeleton" className="space-y-4 max-w-4xl mx-auto animate-pulse">
        <div className="h-48 bg-slate-200 dark:bg-slate-800 rounded-3xl"></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
          ))}
        </div>
      </div>
    );
  }

  const balance = data?.balance;
  const user = data?.user;
  const market = data?.marketPrices;
  const recent = data?.recentActivity || [];
  const settings = data?.settings;

  // Active Pending Withdrawal (authoritative backend data)
  const pendingWithdrawal = data?.activePendingWithdrawal ?? localPendingWithdrawal;

  // Referral summary (authoritative backend data)
  const referralSummary = data?.referralSummary ?? localReferralSummary;
  const l1Income = referralSummary?.level1Income ?? 0;
  const l2Income = referralSummary?.level2Income ?? 0;
  const totalReferralIncome = referralSummary?.totalReferralIncome ?? balance?.referralEarnings ?? 0;

  // Minimum Eligible Principal Threshold (configurable from backend settings, expected $300)
  const minimumEligibleThreshold = settings?.minimumDepositAmount ?? 300;
  const eligiblePrincipal = balance?.activeCompoundingPrincipal ?? 0;
  const maintainsMinimumPrincipal = eligiblePrincipal >= minimumEligibleThreshold;
  const compoundingActive = maintainsMinimumPrincipal && settings?.compoundingEnabled !== false;

  // 30-Day Lock and Maturity Status
  const isFundLocked = Boolean(balance?.isFundLocked);
  const isAccountMatured = Boolean(balance?.is30DaysOld);
  const isAccountLocked = isFundLocked || !isAccountMatured;

  let lockStatusLabel = 'UNLOCKED';
  let lockStatusBadgeClass = 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60';
  let unlockDateDisplay = 'Fully Matured (Eligible for Standard Withdrawals)';

  if (isFundLocked) {
    lockStatusLabel = 'LOCKED (30-Day Re-lock)';
    lockStatusBadgeClass = 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700/60';
    unlockDateDisplay = balance?.fundLockUntil
      ? `${new Date(balance.fundLockUntil).toLocaleDateString()} (${balance.fundLockRemainingDays}d ${balance.fundLockRemainingHours}h remaining)`
      : '30 Days from Last Withdrawal';
  } else if (!isAccountMatured) {
    lockStatusLabel = 'LOCKED (Initial 30d Age)';
    lockStatusBadgeClass = 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60';
    unlockDateDisplay = balance?.withdrawalEligibleDate
      ? `${new Date(balance.withdrawalEligibleDate).toLocaleDateString()} (${balance.accountAgeDays}d / 30d completed)`
      : '30 Days from Registration';
  }

  return (
    <div id="user-dashboard-accounting" className="space-y-6 max-w-4xl mx-auto pb-24">
      {/* Top Header & Fast Revalidation Controls */}
      <div id="dashboard-header-bar" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
            Welcome, {user?.fullName?.split(' ')[0] || 'Investor'}
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            FINEXJ Institutional Fund & Yield Accounting
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Refresh Revalidate Button */}
          <button
            id="dashboard-refresh-btn"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            title="Refresh authoritative balances from backend"
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-full transition shadow-xs cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-600 dark:text-blue-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Updating...' : 'Sync'}</span>
          </button>

          {/* 30-Day Lock Rule Details Modal Button */}
          <button
            id="fund-lock-rules-btn"
            onClick={() => setIsFundLockModalOpen(true)}
            className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition cursor-pointer ${lockStatusBadgeClass}`}
          >
            {isAccountLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            <span>{lockStatusLabel}</span>
          </button>

          {/* Earning Plan Explanatory Modal */}
          <button
            id="earning-plan-info-btn"
            onClick={() => setIsPlanModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-full transition shadow-xs cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Yield Rules</span>
          </button>
        </div>
      </div>

      {/* REQUIREMENT 8: PENDING WITHDRAWAL STATUS BANNER */}
      {pendingWithdrawal && (
        <div
          id="pending-withdrawal-card"
          className="p-4 sm:p-5 rounded-3xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 shadow-sm space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Pending Withdrawal Request</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60">
                    {pendingWithdrawal.status.replace('_', ' ')}
                  </span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Ref: <span className="font-mono">{pendingWithdrawal.reference || pendingWithdrawal.id.slice(0, 8)}</span> • Reserved from available balance
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('withdraw')}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline self-start sm:self-auto cursor-pointer"
            >
              View Withdrawal Queue →
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-2xl bg-white dark:bg-[#0F172A] border border-blue-100 dark:border-blue-900/50 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Requested Amount</span>
              <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                ${pendingWithdrawal.requestedAmount.toFixed(2)} USDT
              </p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                Fee ({pendingWithdrawal.feePercentage}%)
              </span>
              <p className="font-semibold text-slate-700 dark:text-slate-300 mt-0.5">
                ${pendingWithdrawal.feeAmount.toFixed(2)} USDT
              </p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Net Payout</span>
              <p className="font-extrabold text-blue-600 dark:text-blue-400 mt-0.5">
                ${pendingWithdrawal.netAmount.toFixed(2)} USDT
              </p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Backend Status</span>
              <p className="font-bold text-amber-600 dark:text-amber-400 mt-0.5 flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block"></span>
                <span>In Verification</span>
              </p>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
            * Note: System marks payout complete only after verified blockchain settlement.
          </p>
        </div>
      )}

      {/* REQUIREMENT 4: 30-DAY LOCK STATUS BANNER */}
      <div
        id="lock-status-card"
        className={`p-4 sm:p-5 rounded-3xl border shadow-sm space-y-3 ${
          isAccountLocked
            ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700/60'
            : 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/60'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start space-x-3">
            <div
              className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 font-bold ${
                isAccountLocked
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                  : 'bg-blue-500/20 text-blue-700 dark:text-blue-300'
              }`}
            >
              {isAccountLocked ? <Lock className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>30-Day Liquidity & Maturity Governance</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${lockStatusBadgeClass}`}
                >
                  {isAccountLocked ? 'Locked' : 'Unlocked'}
                </span>
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                {isFundLocked
                  ? 'Fund re-lock is currently active following your recent withdrawal to protect portfolio liquidity.'
                  : !isAccountMatured
                  ? `Your account is ${balance?.accountAgeDays || 0} days old. Institutional rules require 30 full days before principal withdrawals unlock.`
                  : 'Account age requirement completed. Normal principal and yield withdrawal requests are fully unlocked.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsFundLockModalOpen(true)}
            className="px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition flex-shrink-0 cursor-pointer shadow-xs self-start sm:self-auto"
          >
            Policy Details
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Lock State</span>
            <p className={`font-bold mt-0.5 ${isAccountLocked ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`}>
              {isAccountLocked ? 'Principal & Yields Locked' : 'Full Withdrawal Quota Unlocked'}
            </p>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Unlock Date</span>
            <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
              {unlockDateDisplay}
            </p>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Yield Accrual</span>
            <p className="font-bold text-blue-600 dark:text-blue-400 mt-0.5 flex items-center space-x-1">
              <Zap className="w-3 h-3" />
              <span>{compoundingActive ? 'Active & Compounding' : 'Yields Paused'}</span>
            </p>
          </div>
        </div>
      </div>

      {/* REQUIREMENT 1 & 7: MAIN HERO BALANCE & WITHDRAWABLE LIQUIDITY CARD */}
      <div
        id="main-balance-hero"
        className="relative overflow-hidden rounded-3xl bg-[#0F172A] border border-slate-800 p-6 sm:p-8 shadow-xl shadow-slate-900/20 text-white"
      >
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-blue-600/20 blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 rounded-full bg-indigo-600/20 blur-3xl pointer-events-none"></div>

        <div className="relative z-10 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse"></span>
              <span className="text-xs uppercase font-bold tracking-wider text-slate-300">
                Total Available Balance
              </span>
            </div>
            <span className="px-2.5 py-0.5 text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full">
              USDT (BEP-20)
            </span>
          </div>

          <div>
            <div className="flex items-baseline space-x-2">
              <span id="hero-available-balance" className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
                ${(balance?.availableBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-base font-bold text-slate-400">USDT</span>
            </div>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              Net balance across all confirmed deposits, credited yields, referral bonuses, and pending deductions.
            </p>
          </div>

          {/* REQUIREMENT 7: Clear Withdrawable Balance vs Locked Funds Distinction */}
          <div
            id="liquidity-pillars-card"
            className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm text-xs"
          >
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">Total Balance</span>
              <p id="liquidity-total-balance" className="text-base font-extrabold text-white mt-0.5">
                ${(balance?.availableBalance || 0).toFixed(2)}
              </p>
              <span className="text-[10px] text-slate-400">Gross Available</span>
            </div>

            <div className="border-t sm:border-t-0 sm:border-l border-white/10 pt-2 sm:pt-0 sm:pl-3">
              <span className="text-[10px] uppercase font-bold text-amber-300 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                <span>Locked Amount</span>
              </span>
              <p id="liquidity-locked-balance" className="text-base font-extrabold text-amber-300 mt-0.5">
                ${(balance?.lockedBalance || 0).toFixed(2)}
              </p>
              <span className="text-[10px] text-slate-400">30d Lock / Policy</span>
            </div>

            <div className="border-t sm:border-t-0 sm:border-l border-white/10 pt-2 sm:pt-0 sm:pl-3">
              <span className="text-[10px] uppercase font-bold text-blue-300 flex items-center gap-1">
                <Wallet className="w-3 h-3" />
                <span>Withdrawable Amount</span>
              </span>
              <p id="liquidity-withdrawable-balance" className="text-base font-extrabold text-blue-300 mt-0.5">
                ${(balance?.eligibleForWithdrawal || 0).toFixed(2)}
              </p>
              <span className="text-[10px] text-slate-400">Immediately Liquid</span>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              id="hero-deposit-btn"
              onClick={() => onNavigate('deposit')}
              className="flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition-all active:scale-[0.98] cursor-pointer"
            >
              <ArrowDownToLine className="w-4 h-4" />
              <span>Deposit USDT</span>
            </button>
            <button
              id="hero-withdraw-btn"
              onClick={() => onNavigate('withdraw')}
              className="flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm border border-slate-700 transition-all active:scale-[0.98] cursor-pointer"
            >
              <ArrowUpFromLine className="w-4 h-4" />
              <span>Withdraw Funds</span>
            </button>
          </div>
        </div>
      </div>

      {/* REQUIREMENT 1: 6 MANDATORY BALANCE SUMMARY METRICS */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Authoritative Balance Summary</span>
          </h2>
          <span className="text-[10px] text-slate-400">Backend Verified</span>
        </div>

        <div id="balance-summary-grid" className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {/* 1. Total Available Balance */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold">Total Balance</span>
              <Wallet className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <p id="metric-available-balance" className="text-lg font-extrabold text-slate-900 dark:text-white">
              ${(balance?.availableBalance || 0).toFixed(2)}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">Current available</p>
          </div>

          {/* 2. Eligible Principal */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold">Eligible Principal</span>
              <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <p id="metric-eligible-principal" className="text-lg font-extrabold text-slate-900 dark:text-white">
              ${(balance?.activeCompoundingPrincipal || 0).toFixed(2)}
            </p>
            <p className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">Compounding base</p>
          </div>

          {/* 3. Daily Earnings */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold">Daily Earnings</span>
              <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <p id="metric-daily-earnings" className="text-lg font-extrabold text-blue-600 dark:text-blue-400">
              +${(balance?.totalEarnings || 0).toFixed(2)}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">Cumulative yield</p>
          </div>

          {/* 4. Referral Income */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold">Referral Income</span>
              <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <p id="metric-referral-income" className="text-lg font-extrabold text-purple-600 dark:text-purple-400">
              +${totalReferralIncome.toFixed(2)}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">Non-compounding</p>
          </div>

          {/* 5. Locked Amount */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold">Locked Amount</span>
              <Lock className="w-4 h-4 text-amber-500" />
            </div>
            <p id="metric-locked-amount" className="text-lg font-extrabold text-amber-600 dark:text-amber-400">
              ${(balance?.lockedBalance || 0).toFixed(2)}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">30d locked funds</p>
          </div>

          {/* 6. Withdrawable Amount */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold">Withdrawable</span>
              <BadgeDollarSign className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <p id="metric-withdrawable-amount" className="text-lg font-extrabold text-blue-700 dark:text-blue-300">
              ${(balance?.eligibleForWithdrawal || 0).toFixed(2)}
            </p>
            <p className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">Liquid quota</p>
          </div>
        </div>
      </div>

      {/* REQUIREMENT 2 & 5: ELIGIBLE PRINCIPAL SEPARATION & MINIMUM THRESHOLD STATUS */}
      <div
        id="principal-accounting-section"
        className="p-5 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Eligible Principal & Compounding Integrity</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Strict accounting separation: Only genuine confirmed deposits minus completed withdrawals form compounding principal.
            </p>
          </div>
          {/* REQUIREMENT 5: Minimum Eligible Principal Indicator */}
          <div className="self-start sm:self-auto">
            {maintainsMinimumPrincipal ? (
              <span
                id="min-principal-status-active"
                className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Threshold Maintained (≥ ${minimumEligibleThreshold} USDT)</span>
              </span>
            ) : (
              <span
                id="min-principal-status-inactive"
                className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Below Minimum Threshold (&lt; ${minimumEligibleThreshold} USDT)</span>
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Total Confirmed Deposits</span>
            <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
              ${(balance?.totalDeposited || 0).toFixed(2)} USDT
            </p>
            <span className="text-[10px] text-slate-400">Gross inbound capital</span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Total Paid Withdrawals</span>
            <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
              ${(balance?.totalWithdrawn || 0).toFixed(2)} USDT
            </p>
            <span className="text-[10px] text-slate-400">Deducted from principal</span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Net Compounding Principal</span>
            <p id="separated-compounding-principal" className="text-sm font-extrabold text-blue-600 dark:text-blue-400 mt-0.5">
              ${eligiblePrincipal.toFixed(2)} USDT
            </p>
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">Yield Base</span>
          </div>
        </div>

        {/* Explicit Non-Compounding Notice */}
        <div className="flex items-start space-x-2.5 p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-200">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <span className="font-bold">FINEXJ Compounding Rule:</span> Daily yield rates apply exclusively to your active compounding principal (${eligiblePrincipal.toFixed(2)} USDT). Referral rewards (${totalReferralIncome.toFixed(2)} USDT) and administrative bonuses are never compounded or rolled into the principal fund.
          </p>
        </div>
      </div>

      {/* REQUIREMENT 3 & 6: SPLIT ROW: DAILY EARNINGS STATUS & REFERRAL REWARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* REQUIREMENT 3: DAILY EARNINGS SECTION */}
        <div
          id="daily-earnings-section"
          className="p-5 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3.5 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Daily Institutional Yields</span>
              </h3>
              <span
                id="daily-earning-status-badge"
                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                  compoundingActive
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
                }`}
              >
                {compoundingActive ? 'Earning Active' : 'Earning Paused'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {compoundingActive
                ? `Daily performance distributed automatically based on prevailing institutional market returns.`
                : `Account principal ($${eligiblePrincipal.toFixed(2)}) is below the $${minimumEligibleThreshold} minimum to accrue daily yield.`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Today's Earnings</span>
              <p id="today-earnings-amount" className="text-base font-extrabold text-blue-600 dark:text-blue-400 mt-0.5">
                +${(data?.todayEarnings || 0).toFixed(2)} USDT
              </p>
              <span className="text-[10px] text-slate-400">Credited today</span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Accumulated Daily Yield</span>
              <p id="accumulated-daily-earnings" className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                +${(balance?.totalEarnings || 0).toFixed(2)} USDT
              </p>
              <span className="text-[10px] text-slate-400">Lifetime credited</span>
            </div>
          </div>

          <button
            onClick={() => onNavigate('earnings')}
            className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition flex items-center justify-center space-x-1 cursor-pointer"
          >
            <span>View Full Yield Statement</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* REQUIREMENT 6: REFERRAL INCOME (L1, L2, TOTAL) */}
        <div
          id="referral-income-section"
          className="p-5 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3.5 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Referral Income Accounting</span>
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60">
                5% L1 / 2% L2
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Direct commission earned upon confirmed qualifying deposits (≥ $300). Separate from compounding funds.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Level 1 (5%)</span>
              <p id="referral-l1-income" className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                ${l1Income.toFixed(2)}
              </p>
              <span className="text-[10px] text-slate-400">Direct partners</span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Level 2 (2%)</span>
              <p id="referral-l2-income" className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                ${l2Income.toFixed(2)}
              </p>
              <span className="text-[10px] text-slate-400">Sub-network</span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400">Total Referral</span>
              <p id="referral-total-income" className="text-sm font-extrabold text-purple-600 dark:text-purple-400 mt-0.5">
                ${totalReferralIncome.toFixed(2)}
              </p>
              <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">Liquid & Free</span>
            </div>
          </div>

          <button
            onClick={() => onNavigate('referrals')}
            className="w-full py-2 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-bold text-xs border border-purple-200 dark:border-purple-800/60 transition flex items-center justify-center space-x-1 cursor-pointer"
          >
            <span>Open Referral Network Dashboard</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Dynamic Live Market Reference Cards (Informational Display Only) */}
      <div id="market-reference-cards" className="grid grid-cols-2 gap-3">
        {/* Bitcoin Reference */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-xs">
          <div>
            <div className="flex items-center space-x-1.5">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Bitcoin Reference</p>
              {ticker?.btc?.change24h !== null && ticker?.btc?.change24h !== undefined && (
                <span className={`text-[10px] ${format24hChange(ticker.btc.change24h).className}`}>
                  {format24hChange(ticker.btc.change24h).text}
                </span>
              )}
            </div>
            <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-0.5">
              {isTickerLoading && !ticker
                ? '——'
                : formatBtcPrice(ticker?.btc?.price ?? market?.btcUsd)}
            </p>
          </div>
          <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-50 dark:bg-slate-800 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-slate-700">
            BTC/USD
          </span>
        </div>

        {/* Gold Reference */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-xs">
          <div>
            <div className="flex items-center space-x-1.5">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Gold Reference</p>
              {ticker?.gold?.change24h !== null && ticker?.gold?.change24h !== undefined && (
                <span className={`text-[10px] ${format24hChange(ticker.gold.change24h).className}`}>
                  {format24hChange(ticker.gold.change24h).text}
                </span>
              )}
            </div>
            <p className="text-sm sm:text-base font-bold text-amber-600 dark:text-amber-400 mt-0.5">
              {isTickerLoading && !ticker
                ? '——'
                : formatGoldPrice(ticker?.gold?.price ?? market?.goldUsd)}
            </p>
          </div>
          <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-50 dark:bg-slate-800 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-slate-700">
            XAU/USD
          </span>
        </div>
      </div>

      {/* Managed Fund & Earning Plan Presentation */}
      <InvestmentPlanSection onOpenDetailedModal={() => setIsPlanModalOpen(true)} />

      {/* Recent Activity List */}
      <div id="recent-activity-section" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Recent Ledger Activity
          </h2>
          <button
            onClick={() => onNavigate('transactions')}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 flex items-center space-x-1 cursor-pointer"
          >
            <span>View All</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recent.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs">
            No recent transactions recorded yet.
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map(item => {
              const isEarning = item.type === 'daily_earnings';
              const isLoss = item.type === 'daily_loss';
              const isDeposit = item.type === 'deposit';
              const isPaidWithdrawal = item.type === 'withdrawal_paid';
              const isWithdrawal = item.type === 'withdrawal_request' || item.type === 'withdrawal_paid' || item.type === 'withdrawal_fee';

              let displayAmount = Math.abs(Number(item.amount || 0));
              if (isPaidWithdrawal && displayAmount === 0) {
                const match = item.description.match(/Net Paid:\s*([\d.]+)/i);
                if (match && match[1]) {
                  displayAmount = parseFloat(match[1]);
                }
              }

              return (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs shadow-xs"
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                        isDeposit
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : isEarning
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : isLoss
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          : isPaidWithdrawal
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : isWithdrawal
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                      }`}
                    >
                      {isDeposit && <ArrowDownToLine className="w-4 h-4" />}
                      {isEarning && <TrendingUp className="w-4 h-4" />}
                      {isLoss && <TrendingUp className="w-4 h-4 rotate-180 text-rose-500" />}
                      {isWithdrawal && <ArrowUpFromLine className="w-4 h-4" />}
                      {item.type === 'admin_adjustment' && <Wallet className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {item.description}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`font-bold text-sm ${
                        isEarning || isDeposit
                          ? 'text-blue-600 dark:text-blue-400'
                          : isPaidWithdrawal
                          ? 'text-blue-600 dark:text-blue-400'
                          : isLoss || item.type === 'withdrawal_request'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {isEarning || isDeposit ? '+' : isLoss || isWithdrawal ? '-' : ''}${displayAmount.toFixed(2)}
                    </span>
                    <p className="text-[10px] text-slate-400">
                      {isPaidWithdrawal ? 'PAID (USDT)' : 'USDT'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Live Telegram Support Quick Banner */}
      <div id="support-quick-banner" className="p-5 rounded-2xl bg-gradient-to-r from-blue-900 to-indigo-900 border border-blue-700 text-white flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center">
            <Headphones className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-white">Official Telegram Live Support</p>
            <p className="text-[11px] text-blue-200">Available 24/7 for deposit & withdrawal inquiries</p>
          </div>
        </div>
        <button
          onClick={onOpenSupport}
          className="px-4 py-2 rounded-xl bg-white hover:bg-blue-50 text-blue-900 font-bold text-xs transition cursor-pointer shadow-xs"
        >
          Contact Now
        </button>
      </div>

      {/* Detailed Investment & Earning Plan Modal */}
      <InvestmentPlanModal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
      />

      {/* 30-Day Fund Lock & Yield Governance Modal */}
      <FundLockModal
        isOpen={isFundLockModalOpen}
        onClose={() => setIsFundLockModalOpen(false)}
        balance={balance || null}
        onLockUpdated={handleManualRefresh}
      />
    </div>
  );
};
