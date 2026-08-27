import React from 'react';
import {
  TrendingUp,
  Cpu,
  ArrowRight,
  Clock,
  Percent,
  Lock,
  Wallet,
  AlertCircle,
  Scale,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';

interface InvestmentPlanSectionProps {
  onOpenDetailedModal?: () => void;
  compact?: boolean;
}

export const InvestmentPlanSection: React.FC<InvestmentPlanSectionProps> = ({
  onOpenDetailedModal,
}) => {
  return (
    <div className="space-y-4">
      {/* Main Managed Fund Overview Card */}
      <div className="rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-xl shadow-slate-200/50 dark:shadow-none">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-extrabold shadow-md shadow-blue-500/25">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  How Your Fund & Earnings Work
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  Managed Portfolio
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Institutional fund management with daily performance-based profit sharing
              </p>
            </div>
          </div>

          {onOpenDetailedModal && (
            <button
              onClick={onOpenDetailedModal}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-blue-50 dark:bg-slate-800 hover:bg-blue-100 dark:hover:bg-slate-700 text-blue-600 dark:text-blue-400 text-xs font-bold border border-blue-200 dark:border-slate-700 transition cursor-pointer"
            >
              <span>Full Strategy Guide</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Narrative Explanation */}
        <div className="pt-5 space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
          <p>
            When you deposit USDT into the platform, your capital joins our <strong className="text-blue-600 dark:text-blue-400 font-bold">Institutional Liquidity & Trading Pool</strong>. Rather than keeping assets idle, our dedicated fund managers and automated quantitative algorithms actively deploy the pooled capital into diversified market opportunities designed for consistent yield generation and capital preservation.
          </p>
          <p>
            Every 24 hours, the fund desk calculates the <strong className="text-blue-600 dark:text-blue-400 font-bold">net trading return</strong> generated from market operations. When the fund achieves positive performance, that return rate is published and <strong className="text-slate-900 dark:text-white font-bold">credited proportionally to your active deposit balance</strong>.
          </p>
        </div>

        {/* 4 Interactive Process Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-5">
          {/* Step 1 */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 relative">
            <div className="flex items-center justify-between">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                1
              </span>
              <Wallet className="w-4 h-4 text-slate-400" />
            </div>
            <p className="font-bold text-slate-900 dark:text-white text-xs">
              Deposit & Capital Pool
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
              Deposit USDT (BEP-20). Once confirmed by the blockchain, your funds join the managed capital pool for allocation.
            </p>
          </div>

          {/* Step 2 */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 relative">
            <div className="flex items-center justify-between">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                2
              </span>
              <Cpu className="w-4 h-4 text-blue-500" />
            </div>
            <p className="font-bold text-slate-900 dark:text-white text-xs">
              Algorithmic Deployment
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
              Fund is deployed into cross-exchange arbitrage, automated market making, and hedged liquidity strategies.
            </p>
          </div>

          {/* Step 3 */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 relative">
            <div className="flex items-center justify-between">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                3
              </span>
              <Percent className="w-4 h-4 text-blue-500" />
            </div>
            <p className="font-bold text-slate-900 dark:text-white text-xs">
              Daily Yield Distribution
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
              Every day at 00:00 UTC, the net performance rate is posted and your earnings are credited straight to your balance.
            </p>
          </div>

          {/* Step 4 */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 relative">
            <div className="flex items-center justify-between">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                4
              </span>
              <CheckCircle2 className="w-4 h-4 text-blue-500" />
            </div>
            <p className="font-bold text-slate-900 dark:text-white text-xs">
              Compound or Withdraw
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
              Daily earnings accumulate with full transparency. Withdraw whenever eligible with the standard 4% network fee.
            </p>
          </div>
        </div>

        {/* Mathematical Yield Example Formula */}
        <div className="mt-5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                Formula Breakdown
              </span>
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Daily Payout = Active Principal × Daily Fund Performance Rate
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Example: On a <strong className="text-slate-900 dark:text-white">$1,000 USDT</strong> active deposit with a <strong className="text-blue-600 dark:text-blue-400 font-bold">+0.65%</strong> daily return, you receive <strong className="text-blue-600 dark:text-blue-400 font-bold">+$6.50 USDT</strong> credited for that day.
            </p>
          </div>

          <div className="flex-shrink-0 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center w-full md:w-auto shadow-xs">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Performance Timing</span>
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Calculated & Audited Daily</span>
          </div>
        </div>

        {/* Governance & Rules Badges */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span><strong className="text-slate-900 dark:text-white font-bold">Min Deposit:</strong> $300 USDT</span>
          </div>
          <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-300">
            <Lock className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span><strong className="text-slate-900 dark:text-white font-bold">30-Day Lock:</strong> Protects pool stability</span>
          </div>
          <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-300">
            <Clock className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <span><strong className="text-slate-900 dark:text-white font-bold">30-Day Maturity:</strong> Account age rule</span>
          </div>
          <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-300">
            <Scale className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            <span><strong className="text-slate-900 dark:text-white font-bold">4% Fixed Fee:</strong> Transparent fee</span>
          </div>
        </div>

        {/* Risk Disclaimer in Short Font */}
        <div className="mt-5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 space-y-1.5">
          <div className="flex items-center space-x-1.5 text-amber-600 dark:text-amber-400 font-semibold text-[11px]">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Risk Disclaimer & Performance Disclosure</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            <strong>IMPORTANT NOTICE:</strong> All fund deposits are actively allocated into digital asset markets and quantitative trading strategies. Cryptocurrency trading and managed digital funds entail substantial market volatility and risk of capital loss. Past fund performance, historical daily returns, or projections do not guarantee or predict future returns. Daily return rates are variable and strictly based on actual trading outcomes; returns are never guaranteed or fixed. Investors should exercise prudence and only allocate risk capital they can afford to risk. By participating, you acknowledge and agree to platform rules, including the 30-day deposit lock, 30-day account maturity requirement, and the 4% standard withdrawal processing fee.
          </p>
        </div>
      </div>
    </div>
  );
};
