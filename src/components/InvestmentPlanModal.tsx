import React, { useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import {
  X,
  Briefcase,
  Layers,
  Shield,
  ShieldCheck,
  Sparkles,
  BarChart3,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
} from 'lucide-react';

interface InvestmentPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InvestmentPlanModal: React.FC<InvestmentPlanModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { withdrawalFeePercentage, minimumDepositAmount, depositLockPeriodDays, accountAgeRequirementDays } = useSettings();
  const feePct = withdrawalFeePercentage ?? 4;
  const [activeTab, setActiveTab] = useState<'overview' | 'strategies' | 'faq'>('overview');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setExpandedFaq(expandedFaq === index ? null : index);
  };

  if (!isOpen) return null;

  const faqs = [
    {
      q: 'What is the minimum deposit amount?',
      a: `The minimum deposit requirement is $${minimumDepositAmount} USDT (BEP-20 on BNB Smart Chain). Deposits of $${minimumDepositAmount} or more immediately qualify for active pool allocation and daily return calculations starting on the next calendar day (00:00 UTC).`,
    },
    {
      q: 'How does the fund generate daily returns?',
      a: 'The pooled USDT funds are managed by quantitative traders and automated algorithms executing delta-neutral strategies, cross-exchange arbitrage, high-frequency market making, and structured decentralized liquidity provisioning. When market operations generate net positive profit, that profit is distributed proportionally across all active investor deposits.',
    },
    {
      q: 'Are daily returns guaranteed?',
      a: 'No. In full alignment with professional asset management principles, returns are strictly performance-based and variable according to market opportunities and volatility. While our risk engine utilizes strict stop-loss protocols, returns are never fixed or guaranteed.',
    },
    {
      q: `Why is there a ${depositLockPeriodDays}-day deposit lock period?`,
      a: `To deploy capital effectively into market-making orders and liquidity positions without exposing the fund to sudden flash withdrawals or predatory arbitrage, newly deposited principal is committed for ${depositLockPeriodDays} days. Daily earnings earned on this principal, however, accumulate continuously.`,
    },
    {
      q: `What is the ${accountAgeRequirementDays}-day account maturity rule?`,
      a: `For platform security, anti-money laundering (AML) compliance, and long-term liquidity protection, an account must be at least ${accountAgeRequirementDays} calendar days old from creation before submitting withdrawal requests.`,
    },
    {
      q: `How is the ${feePct}% withdrawal fee applied?`,
      a: `When you submit a withdrawal request, a transparent ${feePct}% fee is deducted from the requested amount to cover Binance Smart Chain gas fees, hot-wallet rebalancing, and operational custody costs. For example, a $500 withdrawal incurs a $${(500 * (feePct / 100)).toFixed(0)} fee, delivering $${(500 * (1 - feePct / 100)).toFixed(0)} net USDT directly to your destination wallet.`,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-2xl text-slate-900 dark:text-white overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/20">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Institutional Fund & Earning Plan
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Transparent Capital Management & Performance Distribution Framework
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 px-6 bg-slate-50/50 dark:bg-slate-900/30 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-4 border-b-2 transition cursor-pointer ${
              activeTab === 'overview'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Fund Overview & Earnings
          </button>
          <button
            onClick={() => setActiveTab('strategies')}
            className={`py-3 px-4 border-b-2 transition cursor-pointer ${
              activeTab === 'strategies'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Trading Strategies & Risk
          </button>
          <button
            onClick={() => setActiveTab('faq')}
            className={`py-3 px-4 border-b-2 transition cursor-pointer ${
              activeTab === 'faq'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Rules & Governance FAQ
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto text-xs">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Introduction Card */}
              <div className="p-5 rounded-2xl bg-blue-50 dark:bg-slate-900 border border-blue-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center space-x-2 text-blue-700 dark:text-blue-400 font-bold text-sm">
                  <Sparkles className="w-4 h-4" />
                  <span>How Capital is Managed & Profits Are Distributed</span>
                </div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-normal">
                  Our fund operates as an institutional multi-strategy investment vehicle for USDT (BEP-20) capital. All user deposits are aggregated into managed portfolios that trade active digital asset markets, capturing spreads, yield farming incentives, and quantitative market inefficiencies.
                </p>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-normal">
                  Instead of paying arbitrary fixed rates, we distribute actual realized returns. When our trading desk generates daily profit, a uniform net performance percentage is calculated, verified on our double-entry ledger, and credited directly to every investor proportional to their active deposited principal.
                </p>
              </div>

              {/* Step-by-Step Lifecycle */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Investor Lifecycle & Earnings Timeline
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center space-x-2 text-blue-600 dark:text-blue-400 font-bold text-xs">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px]">1</span>
                      <span>Deposit & Blockchain Confirmation</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      Transfer minimum $300 USDT (BEP-20) to the platform address. Once confirmed on Binance Smart Chain, your deposit is officially registered.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center space-x-2 text-blue-600 dark:text-blue-400 font-bold text-xs">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px]">2</span>
                      <span>Active Capital Deployment</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      Your principal enters the trading pool with a 30-day liquidity stabilization lock. Funds actively generate performance allocations from day one.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center space-x-2 text-blue-600 dark:text-blue-400 font-bold text-xs">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px]">3</span>
                      <span>Daily Yield Calculation & Payout</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      Every 24 hours (00:00 UTC), the fund records net daily trading gains. Your exact share is instantly credited to your available balance.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center space-x-2 text-blue-600 dark:text-blue-400 font-bold text-xs">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px]">4</span>
                      <span>Maturity & Liquidity Access</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      Once your account reaches the {accountAgeRequirementDays}-day maturity threshold, you may withdraw your accumulated balance or principal at any time ({feePct}% standard fee).
                    </p>
                  </div>
                </div>
              </div>

              {/* Sample Calculation Table */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">Illustrative Return Scenarios</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] text-left">
                    <thead className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="pb-2 font-medium">Principal Balance</th>
                        <th className="pb-2 font-medium">Daily Return Rate</th>
                        <th className="pb-2 font-medium">Daily Payout</th>
                        <th className="pb-2 font-medium">Est. 30-Day Yield</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                      <tr>
                        <td className="py-2.5 font-bold text-slate-900 dark:text-white">$500 USDT</td>
                        <td className="py-2.5 text-blue-600 dark:text-blue-400 font-semibold">+0.50%</td>
                        <td className="py-2.5 text-blue-600 dark:text-blue-400 font-semibold">+$2.50 USDT</td>
                        <td className="py-2.5 text-blue-600 dark:text-blue-400 font-bold">~$75.00 USDT</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 font-bold text-slate-900 dark:text-white">$1,000 USDT</td>
                        <td className="py-2.5 text-blue-600 dark:text-blue-400 font-semibold">+0.70%</td>
                        <td className="py-2.5 text-blue-600 dark:text-blue-400 font-semibold">+$7.00 USDT</td>
                        <td className="py-2.5 text-blue-600 dark:text-blue-400 font-bold">~$210.00 USDT</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 font-bold text-slate-900 dark:text-white">$5,000 USDT</td>
                        <td className="py-2.5 text-blue-600 dark:text-blue-400 font-semibold">+0.65%</td>
                        <td className="py-2.5 text-blue-600 dark:text-blue-400 font-semibold">+$32.50 USDT</td>
                        <td className="py-2.5 text-blue-600 dark:text-blue-400 font-bold">~$975.00 USDT</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                  * Note: Return rates are indicative and reflect market performance. Rates fluctuate daily.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'strategies' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white">Cross-Market Arbitrage</h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    Capturing instantaneous price discrepancies across global spot and derivatives order books with zero directional exposure.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                    <Layers className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white">Liquidity Provisioning</h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    Providing market liquidity into high-volume stablecoin and major crypto pools to harvest institutional transaction fees.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                    <Shield className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white">Delta-Neutral Hedging</h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    Executing automated spot-futures funding arbitrage where positions are 100% hedged against market downswings.
                  </p>
                </div>
              </div>

              {/* Risk Management Architecture */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center space-x-2 text-blue-600 dark:text-blue-400 font-bold text-xs">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Risk Preservation Protocols</span>
                </div>
                <ul className="space-y-2 text-[11px] text-slate-700 dark:text-slate-300">
                  <li className="flex items-start space-x-2">
                    <span className="text-blue-600 dark:text-blue-400 font-bold mt-0.5">•</span>
                    <span><strong>Strict Drawdown Limits:</strong> Algorithmic positions automatically unwind if adverse volatility exceeds pre-defined 1.5% intraday limits.</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-blue-600 dark:text-blue-400 font-bold mt-0.5">•</span>
                    <span><strong>Cold Storage Reserve:</strong> Over 70% of fund reserves are segregated into institutional multi-signature cold custody.</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-blue-600 dark:text-blue-400 font-bold mt-0.5">•</span>
                    <span><strong>Real-time Double-Entry Ledger:</strong> Every deposit, yield credit, and withdrawal is tracked with cryptographic balance verification.</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'faq' && (
            <div className="space-y-3">
              {faqs.map((faq, index) => (
                <div
                  key={index}
                  className="rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden"
                >
                  <button
                    onClick={() => toggleFaq(index)}
                    className="w-full p-4 text-left flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white transition cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    {expandedFaq === index ? (
                      <ChevronUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                  {expandedFaq === index && (
                    <div className="px-4 pb-4 pt-1 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed border-t border-slate-200 dark:border-slate-800">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Legal Disclaimer */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400 font-semibold text-xs">
              <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Comprehensive Risk Disclaimer & Disclosure</span>
            </div>
            <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed">
              <strong>DISCLAIMER:</strong> Digital asset investments and crypto trading strategies carry significant market risks, including the potential loss of capital, market volatility, liquidity risk, and technical network factors. Historical returns and past daily yields are not indicative of future performance. Yield distributions are variable and depend entirely upon realized trading returns; returns are never guaranteed or fixed. Investors are responsible for assessing their own financial circumstances and should never allocate funds they cannot afford to lose. By depositing funds, you formally accept all platform terms, including the {depositLockPeriodDays}-day deposit lock period, the {accountAgeRequirementDays}-day account age withdrawal eligibility requirement, and the {feePct}% standard network processing fee.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Institutional Fund Management • Binance Smart Chain (BEP-20)
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs transition cursor-pointer shadow-md shadow-blue-500/20"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
};
