import React, { useState } from 'react';
import { DashboardResponse } from '../types';
import { InvestmentPlanSection } from './InvestmentPlanSection';
import { InvestmentPlanModal } from './InvestmentPlanModal';
import { FundLockModal } from './FundLockModal';
import {
  TrendingUp,
  ArrowDownToLine,
  ArrowUpFromLine,
  Wallet,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  Headphones,
  ChevronRight,
  ShieldAlert,
  HelpCircle,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface HomeViewProps {
  data: DashboardResponse | null;
  onNavigate: (view: string) => void;
  onOpenSupport: () => void;
  isLoading: boolean;
}

export const HomeView: React.FC<HomeViewProps> = ({
  data,
  onNavigate,
  onOpenSupport,
  isLoading,
}) => {
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isFundLockModalOpen, setIsFundLockModalOpen] = useState(false);

  if (isLoading && !data) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto animate-pulse">
        <div className="h-44 bg-slate-900/60 rounded-3xl border border-slate-800"></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="h-24 bg-slate-900/60 rounded-2xl border border-slate-800"></div>
          <div className="h-24 bg-slate-900/60 rounded-2xl border border-slate-800"></div>
          <div className="h-24 bg-slate-900/60 rounded-2xl border border-slate-800"></div>
          <div className="h-24 bg-slate-900/60 rounded-2xl border border-slate-800"></div>
        </div>
      </div>
    );
  }

  const balance = data?.balance;
  const user = data?.user;
  const market = data?.marketPrices;
  const recent = data?.recentActivity || [];

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-24">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 dark:text-slate-100 text-slate-900">
            Welcome, {user?.fullName?.split(' ')[0] || 'Investor'}
          </h1>
          <p className="text-xs text-slate-400 dark:text-slate-400 text-slate-500">
            FINEXJ Institutional Fund & Yield Management
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsFundLockModalOpen(true)}
            className={`inline-flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold rounded-full border transition ${
              balance?.isFundLocked
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>
              {balance?.isFundLocked
                ? `Fund Locked (${balance.fundLockRemainingDays}d ${balance.fundLockRemainingHours}h)`
                : 'Fund Lock Rules'}
            </span>
          </button>

          <button
            onClick={() => setIsPlanModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-full transition"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Earning Plan</span>
          </button>

          {balance?.is30DaysOld ? (
            <span className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>30-Day Verified</span>
            </span>
          ) : (
            <span className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full">
              <Clock className="w-3.5 h-3.5" />
              <span>{balance?.accountAgeDays || 0}d / 30d Age</span>
            </span>
          )}
        </div>
      </div>

      {/* 30-Day Post-Withdrawal Fund Lock Notice Card */}
      {balance?.isFundLocked && (
        <div className="p-4 rounded-3xl bg-gradient-to-r from-amber-950/40 to-slate-900/60 border border-amber-500/40 shadow-lg space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-amber-200">
                  30-Day Fund Re-Lock Active
                </h2>
                <p className="text-xs text-amber-300/80 mt-0.5 leading-relaxed">
                  Remaining capital is automatically locked for 30 days after withdrawal to maintain liquidity stability.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsFundLockModalOpen(true)}
              className="px-3 py-1 text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-xl transition flex-shrink-0"
            >
              Details
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-2xl bg-slate-950/60 border border-amber-500/20 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">Lock Remaining</span>
              <p className="font-bold text-amber-300 mt-0.5">
                {balance.fundLockRemainingDays} Days {balance.fundLockRemainingHours} Hours
              </p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">Unlock Date</span>
              <p className="font-semibold text-slate-200 mt-0.5">
                {balance.fundLockUntil ? new Date(balance.fundLockUntil).toLocaleDateString() : 'N/A'}
              </p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">Yield Accrual</span>
              <p className="font-bold text-emerald-400 mt-0.5 flex items-center space-x-1">
                <Zap className="w-3 h-3" />
                <span>Active & Compounding</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 30-Day Warning Banner if under 30 days */}
      {balance && !balance.is30DaysOld && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-200">Account Maturity Notice</p>
            <p className="text-amber-300/90 leading-relaxed">
              Your account is currently {balance.accountAgeDays} days old. Per fund governance rules, withdrawal requests unlock after completing 30 full days ({new Date(balance.withdrawalEligibleDate).toLocaleDateString()} at {new Date(balance.withdrawalEligibleDate).toLocaleTimeString()}).
            </p>
          </div>
        </div>
      )}

      {/* Main Balance Hero Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 bg-white border border-slate-800 dark:border-slate-800 border-slate-200 p-6 sm:p-8 shadow-xl shadow-slate-950/40">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-blue-600/15 blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 rounded-full bg-purple-600/15 blur-3xl pointer-events-none"></div>

        <div className="relative z-10 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
              <span className="text-xs uppercase font-bold tracking-wider text-slate-400 dark:text-slate-400 text-slate-500">
                Main Balance
              </span>
            </div>
            <span className="px-2.5 py-0.5 text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full">
              USDT (BEP-20)
            </span>
          </div>

          <div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white dark:text-white text-slate-900">
                ${(balance?.availableBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-sm font-semibold text-slate-400">USDT</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              ≈ ${(balance?.availableBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD Equivalent
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => onNavigate('deposit')}
              className="flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] cursor-pointer"
            >
              <ArrowDownToLine className="w-4 h-4" />
              <span>Deposit USDT</span>
            </button>
            <button
              onClick={() => onNavigate('withdraw')}
              className="flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-slate-800 dark:bg-slate-800 bg-slate-100 hover:bg-slate-700 dark:hover:bg-slate-700 hover:bg-slate-200 text-slate-100 dark:text-slate-100 text-slate-900 font-semibold text-sm border border-slate-700 dark:border-slate-700 border-slate-300 transition-all active:scale-[0.98] cursor-pointer"
            >
              <ArrowUpFromLine className="w-4 h-4" />
              <span>Withdraw Funds</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Financial Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Deposit */}
        <div className="p-4 rounded-2xl bg-slate-900/80 dark:bg-slate-900/80 bg-white border border-slate-800/80 dark:border-slate-800/80 border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Total Deposit</span>
            <ArrowDownToLine className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-lg sm:text-xl font-bold text-slate-100 dark:text-slate-100 text-slate-900">
            ${(balance?.totalDeposited || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-slate-500">Confirmed Principal</p>
        </div>

        {/* Today's Earnings */}
        <div className="p-4 rounded-2xl bg-slate-900/80 dark:bg-slate-900/80 bg-white border border-slate-800/80 dark:border-slate-800/80 border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Today's Earnings</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-lg sm:text-xl font-bold text-emerald-400">
            +${(data?.todayEarnings || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-slate-500">Credited Fund Rate</p>
        </div>

        {/* Total Earnings */}
        <div className="p-4 rounded-2xl bg-slate-900/80 dark:bg-slate-900/80 bg-white border border-slate-800/80 dark:border-slate-800/80 border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Total Earnings</span>
            <TrendingUp className="w-4 h-4 text-teal-400" />
          </div>
          <p className="text-lg sm:text-xl font-bold text-teal-400">
            +${(balance?.totalEarnings || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-slate-500">Cumulative Yield</p>
        </div>

        {/* Available for Withdrawal */}
        <div className="p-4 rounded-2xl bg-slate-900/80 dark:bg-slate-900/80 bg-white border border-slate-800/80 dark:border-slate-800/80 border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Available Withdrawal</span>
            <Wallet className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-lg sm:text-xl font-bold text-amber-400">
            ${(balance?.eligibleForWithdrawal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-slate-500">
            {balance?.lockedBalance ? `$${balance.lockedBalance} locked (20d lock)` : 'Eligible for Payout'}
          </p>
        </div>
      </div>

      {/* Live Market Reference Cards */}
      {market && (
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-900/40 dark:bg-slate-900/40 bg-slate-100 border border-slate-800 dark:border-slate-800 border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-400">Bitcoin Reference</p>
              <p className="text-sm sm:text-base font-bold text-slate-100 dark:text-slate-100 text-slate-900">
                ${market.btcUsd ? market.btcUsd.toLocaleString() : 'Price unavailable'}
              </p>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
              BTC/USD
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-900/40 dark:bg-slate-900/40 bg-slate-100 border border-slate-800 dark:border-slate-800 border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-400">Gold Reference</p>
              <p className="text-sm sm:text-base font-bold text-amber-400">
                ${market.goldUsd ? market.goldUsd.toLocaleString() : 'Price unavailable'}
              </p>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
              XAU/USD
            </span>
          </div>
        </div>
      )}

      {/* Managed Fund & Earning Plan Section */}
      <InvestmentPlanSection onOpenDetailedModal={() => setIsPlanModalOpen(true)} />

      {/* Recent Activity List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400 text-slate-500">
            Recent Activity
          </h2>
          <button
            onClick={() => onNavigate('transactions')}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-500 flex items-center space-x-1 cursor-pointer"
          >
            <span>View All</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recent.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400 text-xs">
            No recent activity recorded yet.
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map(item => {
              const isEarning = item.type === 'daily_earnings';
              const isLoss = item.type === 'daily_loss';
              const isDeposit = item.type === 'deposit';
              const isWithdrawal = item.type === 'withdrawal_request' || item.type === 'withdrawal_paid' || item.type === 'withdrawal_fee';

              return (
                <div
                  key={item.id}
                  className="p-3.5 rounded-2xl bg-slate-900/60 dark:bg-slate-900/60 bg-white border border-slate-800/70 dark:border-slate-800/70 border-slate-200 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                        isDeposit
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : isEarning
                          ? 'bg-teal-500/20 text-teal-400'
                          : isLoss
                          ? 'bg-rose-500/20 text-rose-400'
                          : isWithdrawal
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-purple-500/20 text-purple-400'
                      }`}
                    >
                      {isDeposit && <ArrowDownToLine className="w-4 h-4" />}
                      {isEarning && <TrendingUp className="w-4 h-4" />}
                      {isLoss && <TrendingUp className="w-4 h-4 rotate-180 text-rose-400" />}
                      {isWithdrawal && <ArrowUpFromLine className="w-4 h-4" />}
                      {item.type === 'admin_adjustment' && <Wallet className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-200 dark:text-slate-200 text-slate-800">
                        {item.description}
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-400 text-slate-500">
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`font-bold text-sm ${
                        isEarning || isDeposit
                          ? 'text-emerald-400'
                          : isLoss
                          ? 'text-rose-400'
                          : 'text-slate-300 dark:text-slate-300 text-slate-700'
                      }`}
                    >
                      {isEarning || isDeposit ? '+' : isLoss ? '-' : ''}${Math.abs(item.amount).toFixed(2)}
                    </span>
                    <p className="text-[10px] text-slate-500">USDT</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Live Telegram Support Quick Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-sky-950/50 to-slate-900 border border-sky-500/20 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
            <Headphones className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-sky-200">Official Telegram Live Support</p>
            <p className="text-[11px] text-slate-400">Available 24/7 for deposit & withdrawal inquiries</p>
          </div>
        </div>
        <button
          onClick={onOpenSupport}
          className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition"
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
        onLockUpdated={() => {
          // Trigger view update if needed
          window.location.reload();
        }}
      />
    </div>
  );
};
