import React, { useState } from 'react';
import {
  TrendingUp,
  Shield,
  Layers,
  Cpu,
  ArrowRight,
  Clock,
  Percent,
  Lock,
  Wallet,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Scale,
  Sparkles,
  BarChart3,
  CheckCircle2,
} from 'lucide-react';

interface InvestmentPlanSectionProps {
  onOpenDetailedModal?: () => void;
  compact?: boolean;
}

export const InvestmentPlanSection: React.FC<InvestmentPlanSectionProps> = ({
  onOpenDetailedModal,
  compact = false,
}) => {
  const [activeTab, setActiveTab] = useState<'howItWorks' | 'strategies' | 'rules'>('howItWorks');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setExpandedFaq(expandedFaq === index ? null : index);
  };

  return (
    <div className="space-y-4">
      {/* Main Managed Fund Overview Card */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-[#0A101D] dark:from-slate-900 dark:via-slate-900 dark:to-[#0A101D] bg-white border border-slate-800 dark:border-slate-800 border-slate-200 p-5 sm:p-7 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-800 dark:border-slate-800 border-slate-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 flex items-center justify-center font-extrabold shadow-md shadow-emerald-500/20">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-100 dark:text-slate-100 text-slate-900">
                  How Your Fund & Earnings Work
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Managed Portfolio
                </span>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-400 text-slate-500">
                Institutional fund management with daily performance-based profit sharing
              </p>
            </div>
          </div>

          {onOpenDetailedModal && (
            <button
              onClick={onOpenDetailedModal}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-semibold border border-slate-700 transition"
            >
              <span>Full Strategy Guide</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Narrative Explanation */}
        <div className="pt-5 space-y-4 text-xs text-slate-300 dark:text-slate-300 text-slate-600 leading-relaxed">
          <p>
            When you deposit USDT into the platform, your capital joins our <strong className="text-emerald-400 font-semibold">Institutional Liquidity & Trading Pool</strong>. Rather than keeping assets idle, our dedicated fund managers and automated quantitative algorithms actively deploy the pooled capital into diversified market opportunities designed for consistent yield generation and capital preservation.
          </p>
          <p>
            Every 24 hours, the fund desk calculates the <strong className="text-teal-400 font-semibold">net trading return</strong> generated from market operations. When the fund achieves positive performance, that return rate is published and <strong className="text-slate-100 dark:text-slate-100 text-slate-900 font-semibold">credited proportionally to your active deposit balance</strong>.
          </p>
        </div>

        {/* 4 Interactive Process Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-5">
          {/* Step 1 */}
          <div className="p-4 rounded-2xl bg-slate-950/60 dark:bg-slate-950/60 bg-slate-50 border border-slate-800/80 dark:border-slate-800/80 border-slate-200 space-y-2 relative">
            <div className="flex items-center justify-between">
              <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center justify-center">
                1
              </span>
              <Wallet className="w-4 h-4 text-slate-400" />
            </div>
            <p className="font-bold text-slate-100 dark:text-slate-100 text-slate-900 text-xs">
              Deposit & Capital Pool
            </p>
            <p className="text-[11px] text-slate-400 leading-normal">
              Deposit USDT (BEP-20). Once confirmed by the blockchain, your funds join the managed capital pool for allocation.
            </p>
          </div>

          {/* Step 2 */}
          <div className="p-4 rounded-2xl bg-slate-950/60 dark:bg-slate-950/60 bg-slate-50 border border-slate-800/80 dark:border-slate-800/80 border-slate-200 space-y-2 relative">
            <div className="flex items-center justify-between">
              <span className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 font-bold text-xs flex items-center justify-center">
                2
              </span>
              <Cpu className="w-4 h-4 text-teal-400" />
            </div>
            <p className="font-bold text-slate-100 dark:text-slate-100 text-slate-900 text-xs">
              Algorithmic Deployment
            </p>
            <p className="text-[11px] text-slate-400 leading-normal">
              Fund is deployed into cross-exchange arbitrage, automated market making, and hedged liquidity strategies.
            </p>
          </div>

          {/* Step 3 */}
          <div className="p-4 rounded-2xl bg-slate-950/60 dark:bg-slate-950/60 bg-slate-50 border border-slate-800/80 dark:border-slate-800/80 border-slate-200 space-y-2 relative">
            <div className="flex items-center justify-between">
              <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 font-bold text-xs flex items-center justify-center">
                3
              </span>
              <Percent className="w-4 h-4 text-cyan-400" />
            </div>
            <p className="font-bold text-slate-100 dark:text-slate-100 text-slate-900 text-xs">
              Daily Yield Distribution
            </p>
            <p className="text-[11px] text-slate-400 leading-normal">
              Every day at 00:00 UTC, the net performance rate is posted and your earnings are credited straight to your balance.
            </p>
          </div>

          {/* Step 4 */}
          <div className="p-4 rounded-2xl bg-slate-950/60 dark:bg-slate-950/60 bg-slate-50 border border-slate-800/80 dark:border-slate-800/80 border-slate-200 space-y-2 relative">
            <div className="flex items-center justify-between">
              <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center">
                4
              </span>
              <CheckCircle2 className="w-4 h-4 text-amber-400" />
            </div>
            <p className="font-bold text-slate-100 dark:text-slate-100 text-slate-900 text-xs">
              Compound or Withdraw
            </p>
            <p className="text-[11px] text-slate-400 leading-normal">
              Daily earnings accumulate with full transparency. Withdraw whenever eligible with the standard 4% network fee.
            </p>
          </div>
        </div>

        {/* Mathematical Yield Example Formula */}
        <div className="mt-5 p-4 rounded-2xl bg-slate-950/80 dark:bg-slate-950/80 bg-slate-100 border border-slate-800 dark:border-slate-800 border-slate-300 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Formula Breakdown
              </span>
              <span className="text-xs font-bold text-slate-200 dark:text-slate-200 text-slate-800">
                Daily Payout = Active Principal × Daily Fund Performance Rate
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Example: On a <strong className="text-slate-200">$1,000 USDT</strong> active deposit with a <strong className="text-emerald-400">+0.65%</strong> daily return, you receive <strong className="text-emerald-400">+$6.50 USDT</strong> credited for that day.
            </p>
          </div>

          <div className="flex-shrink-0 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/60 text-center w-full md:w-auto">
            <span className="text-[10px] text-slate-400 block">Performance Timing</span>
            <span className="text-xs font-bold text-teal-400">Calculated & Audited Daily</span>
          </div>
        </div>

        {/* Governance & Rules Badges */}
        <div className="mt-4 pt-4 border-t border-slate-800 dark:border-slate-800 border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="flex items-center space-x-2 text-slate-300">
            <Lock className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span><strong className="text-slate-100 font-semibold">20-Day Lock:</strong> Protects pool stability</span>
          </div>
          <div className="flex items-center space-x-2 text-slate-300">
            <Clock className="w-4 h-4 text-teal-400 flex-shrink-0" />
            <span><strong className="text-slate-100 font-semibold">30-Day Maturity:</strong> Account age rule</span>
          </div>
          <div className="flex items-center space-x-2 text-slate-300">
            <Scale className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span><strong className="text-slate-100 font-semibold">4% Fixed Fee:</strong> Transparent withdrawal</span>
          </div>
        </div>

        {/* Risk Disclaimer in Short Font */}
        <div className="mt-5 p-3.5 rounded-2xl bg-red-950/20 dark:bg-red-950/20 bg-red-50/50 border border-red-500/20 text-slate-400 space-y-1.5">
          <div className="flex items-center space-x-1.5 text-red-400 font-semibold text-[11px]">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Risk Disclaimer & Performance Disclosure</span>
          </div>
          <p className="text-[10px] leading-relaxed text-slate-400 dark:text-slate-400 text-slate-600">
            <strong>IMPORTANT NOTICE:</strong> All fund deposits are actively allocated into digital asset markets and quantitative trading strategies. Cryptocurrency trading and managed digital funds entail substantial market volatility and risk of capital loss. Past fund performance, historical daily returns, or projections do not guarantee or predict future returns. Daily return rates are variable and strictly based on actual trading outcomes; returns are never guaranteed or fixed. Investors should exercise prudence and only allocate risk capital they can afford to risk. By participating, you acknowledge and agree to platform rules, including the 20-day deposit lock, 30-day account maturity requirement, and the 4% standard withdrawal processing fee.
          </p>
        </div>
      </div>
    </div>
  );
};
