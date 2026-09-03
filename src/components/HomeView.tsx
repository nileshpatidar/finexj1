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
  Headphones,
  ChevronRight,
  HelpCircle,
  Zap,
  Users,
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
        <div className="h-44 bg-slate-200 dark:bg-slate-800 rounded-3xl"></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
          <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
          <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
          <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
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
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
            Welcome, {user?.fullName?.split(' ')[0] || 'Investor'}
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            FINEXJ Institutional Fund & Yield Management
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsFundLockModalOpen(true)}
            className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition cursor-pointer ${
              balance?.isFundLocked
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700/60'
                : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60 hover:bg-blue-100 dark:hover:bg-blue-900/40'
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
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-full transition shadow-xs cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Earning Plan</span>
          </button>

          {balance?.is30DaysOld ? (
            <span className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>30-Day Verified</span>
            </span>
          ) : (
            <span className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 rounded-full">
              <Clock className="w-3.5 h-3.5" />
              <span>{balance?.accountAgeDays || 0}d / 30d Age</span>
            </span>
          )}
        </div>
      </div>

      {/* 30-Day Post-Withdrawal Fund Lock Notice Card */}
      {balance?.isFundLocked && (
        <div className="p-5 rounded-3xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 shadow-md space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center flex-shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-amber-950 dark:text-amber-100">
                  30-Day Fund Re-Lock Active
                </h2>
                <p className="text-xs text-amber-900/90 dark:text-amber-200/90 mt-0.5 leading-relaxed font-medium">
                  Remaining capital is automatically locked for 30 days after withdrawal to maintain liquidity stability.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsFundLockModalOpen(true)}
              className="px-3.5 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl transition flex-shrink-0 cursor-pointer shadow-xs"
            >
              Details
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/60 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Lock Remaining</span>
              <p className="font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                {balance.fundLockRemainingDays} Days {balance.fundLockRemainingHours} Hours
              </p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Unlock Date</span>
              <p className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                {balance.fundLockUntil ? new Date(balance.fundLockUntil).toLocaleDateString() : 'N/A'}
              </p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Yield Accrual</span>
              <p className="font-bold text-blue-600 dark:text-blue-400 mt-0.5 flex items-center space-x-1">
                <Zap className="w-3 h-3" />
                <span>Active & Compounding</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 30-Day Warning Banner if under 30 days */}
      {balance && !balance.is30DaysOld && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-amber-950 dark:text-amber-100">Account Maturity Notice</p>
            <p className="text-amber-900/90 dark:text-amber-200/90 leading-relaxed font-medium">
              Your account is currently {balance.accountAgeDays} days old. Per fund governance rules, withdrawal requests unlock after completing 30 full days ({new Date(balance.withdrawalEligibleDate).toLocaleDateString()} at {new Date(balance.withdrawalEligibleDate).toLocaleTimeString()}).
            </p>
          </div>
        </div>
      )}

      {/* Main Balance Hero Card - Always High Contrast Deep Navy (#0F172A) */}
      <div className="relative overflow-hidden rounded-3xl bg-[#0F172A] border border-slate-800 p-6 sm:p-8 shadow-xl shadow-slate-900/20 text-white">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-blue-600/20 blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 rounded-full bg-indigo-600/20 blur-3xl pointer-events-none"></div>

        <div className="relative z-10 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse"></span>
              <span className="text-xs uppercase font-bold tracking-wider text-slate-300">
                Main Balance
              </span>
            </div>
            <span className="px-2.5 py-0.5 text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full">
              USDT (BEP-20)
            </span>
          </div>

          <div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
                ${(balance?.availableBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-base font-bold text-slate-400">USDT</span>
            </div>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              ≈ ${(balance?.availableBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD Equivalent
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => onNavigate('deposit')}
              className="flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition-all active:scale-[0.98] cursor-pointer"
            >
              <ArrowDownToLine className="w-4 h-4" />
              <span>Deposit USDT</span>
            </button>
            <button
              onClick={() => onNavigate('withdraw')}
              className="flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm border border-slate-700 transition-all active:scale-[0.98] cursor-pointer"
            >
              <ArrowUpFromLine className="w-4 h-4" />
              <span>Withdraw Funds</span>
            </button>
          </div>
        </div>
      </div>

      {/* 5 Financial Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Total Deposit */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-1.5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold">Total Deposit</span>
            <ArrowDownToLine className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
            ${(balance?.totalDeposited || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Confirmed Principal</p>
        </div>

        {/* Total Withdrawn */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-1.5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold">Total Withdrawn</span>
            <ArrowUpFromLine className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
            ${(balance?.totalWithdrawn || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {balance?.totalWithdrawn ? 'Paid BEP-20 Payouts' : 'No Withdrawals Yet'}
          </p>
        </div>

        {/* Today's Earnings */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-1.5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold">Today's Earnings</span>
            <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-400">
            +${(data?.todayEarnings || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Credited Fund Rate</p>
        </div>

        {/* Total Earnings */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-1.5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold">Total Earnings</span>
            <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="text-lg sm:text-xl font-bold text-indigo-600 dark:text-indigo-400">
            +${(balance?.totalEarnings || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Cumulative Yield</p>
        </div>

        {/* Available for Withdrawal */}
        <div className="col-span-2 lg:col-span-1 p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-1.5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold">Available Withdrawal</span>
            <Wallet className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-lg sm:text-xl font-bold text-amber-600 dark:text-amber-400">
            ${(balance?.eligibleForWithdrawal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {balance?.lockedBalance ? `$${balance.lockedBalance} locked (20d lock)` : 'Eligible for Payout'}
          </p>
        </div>
      </div>

      {/* Live Market Reference Cards */}
      {market && (
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-xs">
            <div>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Bitcoin Reference</p>
              <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-0.5">
                ${market.btcUsd ? market.btcUsd.toLocaleString() : 'Price unavailable'}
              </p>
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-50 dark:bg-slate-800 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-slate-700">
              BTC/USD
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-xs">
            <div>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Gold Reference</p>
              <p className="text-sm sm:text-base font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                ${market.goldUsd ? market.goldUsd.toLocaleString() : 'Price unavailable'}
              </p>
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-50 dark:bg-slate-800 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-slate-700">
              XAU/USD
            </span>
          </div>
        </div>
      )}

      {/* Managed Fund & Earning Plan Section */}
      <InvestmentPlanSection onOpenDetailedModal={() => setIsPlanModalOpen(true)} />

      {/* Referral Program Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Referral Network & Rewards</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                5% L1 / 2% L2
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Earn direct rewards upon qualifying confirmed deposits (≥ 300 USDT). Separate from compounding principal.
            </p>
          </div>
        </div>
        <button
          onClick={() => onNavigate('referrals')}
          className="inline-flex items-center justify-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition cursor-pointer self-start sm:self-auto flex-shrink-0"
        >
          <span>My Referral Dashboard</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Recent Activity List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Recent Activity
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
            No recent activity recorded yet.
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
      <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-900 to-indigo-900 border border-blue-700 text-white flex items-center justify-between shadow-md">
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
        onLockUpdated={() => {
          window.location.reload();
        }}
      />
    </div>
  );
};
