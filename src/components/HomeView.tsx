import React, { useState, useEffect, useRef } from 'react';
import { DashboardResponse, UserReferralSummary, WithdrawalItem } from '../types';
import { InvestmentPlanSection } from './InvestmentPlanSection';
import { InvestmentPlanModal } from './InvestmentPlanModal';
import { CopyTradingAnnouncementModal } from './CopyTradingAnnouncementModal';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  TrendingUp,
  ArrowDownToLine,
  ArrowUpFromLine,
  Wallet,
  Lock,
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
  Sparkles,
  X,
  ArrowRight,
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
  const { user: authUser, token, isLoading: isAuthLoading } = useAuth();
  const isAuthenticatedUser = Boolean(token && authUser && authUser.role === 'user');

  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isCopyTradingModalOpen, setIsCopyTradingModalOpen] = useState(false);
  const [showCopyTradingBanner, setShowCopyTradingBanner] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fallback state if referralSummary or activePendingWithdrawal not embedded in data
  const [localReferralSummary, setLocalReferralSummary] = useState<UserReferralSummary | null>(null);
  const [localPendingWithdrawal, setLocalPendingWithdrawal] = useState<WithdrawalItem | null>(null);
  const activeReqIdRef = useRef(0);

  const balance = data?.balance;
  const user = data?.user;
  const recent = data?.recentActivity || [];
  const settings = data?.settings;

  // First-time login detection for Institutional Copy Trading announcement
  useEffect(() => {
    if (user?.id) {
      const storageKey = `finexj_copy_trading_dismissed_${user.id}`;
      try {
        const dismissed = localStorage.getItem(storageKey);
        if (!dismissed) {
          // First-time login: show the announcement
          setShowCopyTradingBanner(true);
          setIsCopyTradingModalOpen(true);
        }
      } catch {
        // Fallback if localStorage unavailable
      }
    }
  }, [user?.id]);

  const handleDismissCopyTrading = () => {
    if (user?.id) {
      try {
        localStorage.setItem(`finexj_copy_trading_dismissed_${user.id}`, 'true');
      } catch {
        // Ignore
      }
    }
    setShowCopyTradingBanner(false);
    setIsCopyTradingModalOpen(false);
  };

  // Sync secondary data directly from dashboard payload, only falling back if omitted and authenticated
  useEffect(() => {
    // If not authenticated as standard user, clear local state and NEVER fire authenticated fallback APIs
    if (!isAuthenticatedUser || isAuthLoading) {
      setLocalReferralSummary(null);
      setLocalPendingWithdrawal(null);
      return;
    }

    const currentReqId = ++activeReqIdRef.current;

    if (data?.referralSummary) {
      setLocalReferralSummary(data.referralSummary);
    } else if (data && !data.referralSummary) {
      api.getUserReferralSummary()
        .then(res => {
          if (currentReqId === activeReqIdRef.current && res.success && res.summary) {
            setLocalReferralSummary(res.summary);
          }
        })
        .catch(() => {
          // Gracefully continue with balance summary
        });
    }

    if (data?.activePendingWithdrawal !== undefined) {
      setLocalPendingWithdrawal(data.activePendingWithdrawal);
    } else if (data && data.activePendingWithdrawal === undefined) {
      api.getWithdrawals()
        .then(res => {
          if (currentReqId === activeReqIdRef.current && res.withdrawals) {
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
  }, [data, isAuthenticatedUser, isAuthLoading]);

  const handleManualRefresh = async () => {
    if (isRefreshing || !isAuthenticatedUser || isAuthLoading) return;
    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      }
      // Only execute secondary fallback if strictly authenticated as a standard user
      if (isAuthenticatedUser && data && (!data.referralSummary || data.activePendingWithdrawal === undefined)) {
        const [refRes, withRes] = await Promise.allSettled([
          !data.referralSummary ? api.getUserReferralSummary() : Promise.resolve(null),
          data.activePendingWithdrawal === undefined ? api.getWithdrawals() : Promise.resolve(null),
        ]);
        if (refRes.status === 'fulfilled' && refRes.value && 'summary' in refRes.value && refRes.value.summary) {
          setLocalReferralSummary(refRes.value.summary);
        }
        if (withRes.status === 'fulfilled' && withRes.value && 'withdrawals' in withRes.value && withRes.value.withdrawals) {
          const pending = withRes.value.withdrawals.find(w =>
            ['pending', 'under_review', 'approved', 'processing'].includes(w.status)
          );
          setLocalPendingWithdrawal(pending || null);
        }
      }
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  if (isLoading && !data) {
    return (
      <div id="dashboard-loading-skeleton" className="space-y-4 max-w-4xl mx-auto animate-pulse">
        <div className="h-44 bg-slate-200 dark:bg-slate-800 rounded-3xl"></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
          ))}
        </div>
      </div>
    );
  }

  // Active Pending Withdrawal (authoritative backend data)
  const pendingWithdrawal = data?.activePendingWithdrawal ?? localPendingWithdrawal;

  // Referral summary (authoritative backend data)
  const referralSummary = data?.referralSummary ?? localReferralSummary;
  const l1Income = referralSummary?.level1Income ?? 0;
  const l2Income = referralSummary?.level2Income ?? 0;
  const totalReferralIncome = referralSummary?.totalReferralIncome ?? balance?.referralEarnings ?? 0;

  // Minimum Eligible Principal Threshold
  const minimumEligibleThreshold = settings?.minimumDepositAmount ?? 300;
  const eligiblePrincipal = balance?.activeCompoundingPrincipal ?? 0;
  const maintainsMinimumPrincipal = eligiblePrincipal >= minimumEligibleThreshold;
  const compoundingActive = maintainsMinimumPrincipal && settings?.compoundingEnabled !== false;

  return (
    <div id="user-dashboard-accounting" className="space-y-4 sm:space-y-5 max-w-4xl mx-auto pb-24 text-xs">
      {/* 1. Header Bar: Compact greeting + Quick actions */}
      <div id="dashboard-header-bar" className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Welcome, {user?.fullName?.split(' ')[0] || 'Investor'}
          </h1>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Institutional Fund & Yield Accounting
          </p>
        </div>

        <div className="flex items-center space-x-1.5 sm:space-x-2">
          {/* Institutional Copy Trading Pill */}
          <button
            id="copy-trading-pill-btn"
            onClick={() => setIsCopyTradingModalOpen(true)}
            title="Institutional Copy Trading (Planned Feature)"
            className="inline-flex items-center space-x-1 px-2.5 py-1.5 text-[11px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 rounded-full transition shadow-xs hover:bg-blue-100 dark:hover:bg-blue-900/50 cursor-pointer"
          >
            <Sparkles className="w-3 h-3 text-blue-600 dark:text-blue-400" />
            <span className="hidden sm:inline">Copy Trading</span>
            <span className="text-[10px] uppercase text-blue-500 font-extrabold">(Planned)</span>
          </button>

          {/* Sync / Refresh Button */}
          <button
            id="dashboard-refresh-btn"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            title="Refresh authoritative balances"
            className="inline-flex items-center space-x-1 px-2.5 py-1.5 text-[11px] font-semibold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-full transition shadow-xs cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3 h-3 text-blue-600 dark:text-blue-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Syncing' : 'Sync'}</span>
          </button>

          {/* How It Works Modal Button */}
          <button
            id="earning-plan-info-btn"
            onClick={() => setIsPlanModalOpen(true)}
            className="inline-flex items-center space-x-1 px-2.5 py-1.5 text-[11px] font-semibold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-full transition shadow-xs cursor-pointer"
          >
            <HelpCircle className="w-3 h-3 text-blue-600 dark:text-blue-400" />
            <span>FAQ</span>
          </button>
        </div>
      </div>

      {/* Active Pending Withdrawal Status Card (If pending) */}
      {pendingWithdrawal && (
        <div
          id="pending-withdrawal-card"
          className="p-3.5 sm:p-4 rounded-2xl bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 shadow-xs space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                <Clock className="w-3.5 h-3.5 animate-pulse" />
              </div>
              <div>
                <span className="font-bold text-slate-900 dark:text-white text-xs">
                  Pending Withdrawal: ${pendingWithdrawal.requestedAmount.toFixed(2)} USDT
                </span>
                <span className="ml-2 px-2 py-0.2 rounded-full text-[10px] font-extrabold uppercase bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60">
                  {pendingWithdrawal.status.replace('_', ' ')}
                </span>
              </div>
            </div>
            <button
              onClick={() => onNavigate('withdraw')}
              className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              Queue →
            </button>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Net payout of <span className="font-bold text-blue-600 dark:text-blue-400">${pendingWithdrawal.netAmount.toFixed(2)} USDT</span> reserved from your liquid balance pending final blockchain settlement.
          </p>
        </div>
      )}

      {/* 2. TOP ACCOUNT HERO CARD — MOBILE-FIRST FIRST VIEWPORT */}
      <div
        id="main-balance-hero"
        className="relative overflow-hidden rounded-3xl bg-[#0F172A] border border-slate-800 p-5 sm:p-6 shadow-xl shadow-slate-900/25 text-white"
      >
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-56 h-56 rounded-full bg-blue-600/20 blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-56 h-56 rounded-full bg-indigo-600/20 blur-3xl pointer-events-none"></div>

        <div className="relative z-10 space-y-4 sm:space-y-5">
          {/* Top Label */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
              <span className="text-[11px] uppercase font-bold tracking-wider text-slate-300">
                Total Available Balance
              </span>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full">
              USDT (BEP-20)
            </span>
          </div>

          {/* Primary Balance Figure */}
          <div>
            <div className="flex items-baseline space-x-2">
              <span id="hero-available-balance" className="text-3xl sm:text-4xl font-black tracking-tight text-white">
                ${(balance?.availableBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-sm font-bold text-slate-400">USDT</span>
            </div>
          </div>

          {/* Core Liquidity Pillar Cards: Total Deposits & Withdrawable Amount */}
          <div
            id="liquidity-pillars-card"
            className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm"
          >
            {/* 1. Total Deposits */}
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">Total Deposits</span>
              <p id="liquidity-total-deposits" className="text-sm sm:text-base font-extrabold text-white mt-0.5">
                ${(balance?.totalDeposited || 0).toFixed(2)}
              </p>
              <span className="text-[10px] text-slate-400">Confirmed inbound</span>
            </div>

            {/* 2. Withdrawable Amount */}
            <div className="border-l border-white/10 pl-2.5 sm:pl-3">
              <span className="text-[10px] uppercase font-bold text-blue-300 flex items-center gap-1">
                <Wallet className="w-3 h-3" />
                <span>Withdrawable</span>
              </span>
              <p id="liquidity-withdrawable-balance" className="text-sm sm:text-base font-extrabold text-blue-300 mt-0.5">
                ${(balance?.eligibleForWithdrawal || 0).toFixed(2)}
              </p>
              <span className="text-[10px] text-slate-400">Available now</span>
            </div>

            {/* 3. Locked Amount (if any) or Net Principal */}
            <div className="col-span-2 sm:col-span-1 border-t sm:border-t-0 sm:border-l border-white/10 pt-2 sm:pt-0 sm:pl-3">
              {balance?.lockedBalance && balance.lockedBalance > 0 ? (
                <div>
                  <span className="text-[10px] uppercase font-bold text-amber-300 flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    <span>Locked Balance</span>
                  </span>
                  <p id="liquidity-locked-balance" className="text-sm sm:text-base font-extrabold text-amber-300 mt-0.5">
                    ${balance.lockedBalance.toFixed(2)}
                  </p>
                  <span className="text-[10px] text-slate-400">Under 30d lock</span>
                </div>
              ) : (
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-300 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Compounding Base</span>
                  </span>
                  <p className="text-sm sm:text-base font-extrabold text-emerald-300 mt-0.5">
                    ${(balance?.activeCompoundingPrincipal || 0).toFixed(2)}
                  </p>
                  <span className="text-[10px] text-slate-400">Active earning fund</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons: Clear Deposit & Withdraw */}
          <div className="grid grid-cols-2 gap-2.5 pt-0.5">
            <button
              id="hero-deposit-btn"
              onClick={() => onNavigate('deposit')}
              className="flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs sm:text-sm shadow-md shadow-blue-600/30 transition-all active:scale-[0.98] cursor-pointer"
            >
              <ArrowDownToLine className="w-4 h-4" />
              <span>Deposit</span>
            </button>
            <button
              id="hero-withdraw-btn"
              onClick={() => onNavigate('withdraw')}
              className="flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/25 text-white font-bold text-xs sm:text-sm border border-white/15 transition-all active:scale-[0.98] cursor-pointer"
            >
              <ArrowUpFromLine className="w-4 h-4" />
              <span>Withdraw</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Institutional Copy Trading Announcement Banner (Dismissible, compliant wording) */}
      {showCopyTradingBanner && (
        <div
          id="copy-trading-teaser-card"
          className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-r from-blue-900/60 via-indigo-900/50 to-slate-900 border border-blue-500/30 text-white shadow-sm space-y-2.5"
        >
          <button
            onClick={handleDismissCopyTrading}
            className="absolute top-3 right-3 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Dismiss announcement"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center space-x-2 pr-6">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-blue-500/20 text-blue-300 border border-blue-400/30 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-blue-300" />
              <span>Coming Soon • Planned Feature</span>
            </span>
          </div>

          <div>
            <h3 className="text-sm font-bold text-white">
              Institutional Copy Trading
            </h3>
            <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
              FinexJ is planning an institutional copy trading environment targeting automated strategy mirroring with custom risk controls. Feature is under planned development and subject to platform availability.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/10">
            <span className="text-[10px] text-slate-400 italic">
              * Risk Disclosure: Digital asset trading carries significant capital risk. Past performance does not guarantee future results.
            </span>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsCopyTradingModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] transition flex items-center space-x-1 cursor-pointer"
              >
                <span>Read Full Disclosure</span>
                <ArrowRight className="w-3 h-3" />
              </button>
              <button
                onClick={handleDismissCopyTrading}
                className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 text-[11px] font-medium transition cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Financial Breakdown & Summaries (Compact 2-column or stacked grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-4">
        {/* Daily Institutional Yields Card */}
        <div
          id="daily-earnings-section"
          className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3 flex flex-col justify-between"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Daily Yield Accrual
                </h2>
              </div>
              <span
                id="daily-earning-status-badge"
                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                  compoundingActive
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
                }`}
              >
                {compoundingActive ? 'Earning Active' : 'Below $300 Min'}
              </span>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              {compoundingActive
                ? `Daily yields accrue exclusively on active compounding principal ($${eligiblePrincipal.toFixed(2)} USDT).`
                : `Active compounding principal ($${eligiblePrincipal.toFixed(2)} USDT) requires at least $${minimumEligibleThreshold} USDT to accrue daily performance.`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Today's Yield</span>
              <p id="today-earnings-amount" className="text-sm sm:text-base font-extrabold text-blue-600 dark:text-blue-400 mt-0.5">
                +${(data?.todayEarnings || 0).toFixed(2)} USDT
              </p>
              <span className="text-[10px] text-slate-400">Credited today</span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Accumulated Total</span>
              <p id="accumulated-daily-earnings" className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                +${(balance?.totalEarnings || 0).toFixed(2)} USDT
              </p>
              <span className="text-[10px] text-slate-400">Lifetime yields</span>
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

        {/* Referral Program Summary Card */}
        <div
          id="referral-income-section"
          className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3 flex flex-col justify-between"
        >
          {referralSummary && !referralSummary.isEligible ? (
            /* Compact Locked Referral State */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                    <Lock className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Refer & Earn (Locked)
                  </h2>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 uppercase">
                  Locked
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                Maintain at least {referralSummary.minimumRequiredPrincipal || 300} USDT in eligible funds to activate your referral code and earn 5% Level 1 & 2% Level 2 direct commissions.
              </p>
              <div className="pt-1 flex items-center justify-between gap-2">
                <button
                  onClick={() => onNavigate('deposit')}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span>Deposit to Unlock</span>
                </button>
                <button
                  onClick={() => onNavigate('referrals')}
                  className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition flex items-center gap-1 cursor-pointer"
                >
                  <span>Details</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-7 h-7 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                      <Users className="w-4 h-4" />
                    </div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Referral Rewards
                    </h2>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60">
                    5% L1 / 2% L2
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Earn direct rewards from qualifying deposits (≥ $300). Separated from compounding principal.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Level 1 (5%)</span>
                  <p id="referral-l1-income" className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                    ${l1Income.toFixed(2)}
                  </p>
                  <span className="text-[10px] text-slate-400">Direct</span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Level 2 (2%)</span>
                  <p id="referral-l2-income" className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                    ${l2Income.toFixed(2)}
                  </p>
                  <span className="text-[10px] text-slate-400">Sub-team</span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400">Total</span>
                  <p id="referral-total-income" className="text-xs sm:text-sm font-extrabold text-purple-600 dark:text-purple-400 mt-0.5">
                    ${totalReferralIncome.toFixed(2)}
                  </p>
                  <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">Liquid</span>
                </div>
              </div>

              <button
                onClick={() => onNavigate('referrals')}
                className="w-full py-2 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-bold text-xs border border-purple-200 dark:border-purple-800/60 transition flex items-center justify-center space-x-1 cursor-pointer"
              >
                <span>Referral Network Dashboard</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* 5. Managed Fund Plan Presentation */}
      <InvestmentPlanSection onOpenDetailedModal={() => setIsPlanModalOpen(true)} />

      {/* 6. Recent Ledger Activity List */}
      <div id="recent-activity-section" className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
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
          <div className="p-6 text-center rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs">
            No recent transactions recorded yet.
          </div>
        ) : (
          <div className="space-y-2">
            {recent.slice(0, 4).map(item => {
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
                  className="p-3.5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs shadow-xs"
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
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
                      {isDeposit && <ArrowDownToLine className="w-3.5 h-3.5" />}
                      {isEarning && <TrendingUp className="w-3.5 h-3.5" />}
                      {isLoss && <TrendingUp className="w-3.5 h-3.5 rotate-180 text-rose-500" />}
                      {isWithdrawal && <ArrowUpFromLine className="w-3.5 h-3.5" />}
                      {item.type === 'admin_adjustment' && <Wallet className="w-3.5 h-3.5" />}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {item.description}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`font-bold text-xs sm:text-sm ${
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
                      {isPaidWithdrawal ? 'PAID' : 'USDT'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 7. Official Telegram Support Quick Banner */}
      <div id="support-quick-banner" className="p-4 rounded-2xl bg-gradient-to-r from-blue-900 to-indigo-900 border border-blue-700 text-white flex items-center justify-between shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 text-white flex items-center justify-center">
            <Headphones className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-bold text-white">Official Live Telegram Support</p>
            <p className="text-[11px] text-blue-200">24/7 assistance for deposits & withdrawals</p>
          </div>
        </div>
        <button
          onClick={onOpenSupport}
          className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-blue-50 text-blue-900 font-bold text-xs transition cursor-pointer shadow-xs"
        >
          Contact
        </button>
      </div>

      {/* Detailed Investment Plan Modal */}
      <InvestmentPlanModal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
      />

      {/* Institutional Copy Trading Announcement Modal */}
      <CopyTradingAnnouncementModal
        isOpen={isCopyTradingModalOpen}
        onClose={() => setIsCopyTradingModalOpen(false)}
        onDismissForever={handleDismissCopyTrading}
      />
    </div>
  );
};
