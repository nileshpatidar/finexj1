import React, { useState } from 'react';
import {
  X,
  TrendingUp,
  Shield,
  ShieldCheck,
  Layers,
  Cpu,
  Lock,
  Clock,
  Percent,
  Wallet,
  AlertTriangle,
  Scale,
  Sparkles,
  BarChart3,
  CheckCircle2,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Briefcase,
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
  const [activeTab, setActiveTab] = useState<'overview' | 'strategies' | 'faq'>('overview');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setExpandedFaq(expandedFaq === index ? null : index);
  };

  if (!isOpen) return null;

  const faqs = [
    {
      q: 'How does the fund generate daily returns?',
      a: 'The pooled USDT funds are managed by quantitative traders and automated algorithms executing delta-neutral strategies, cross-exchange arbitrage, high-frequency market making, and structured decentralized liquidity provisioning. When market operations generate net positive profit, that profit is distributed proportionally across all active investor deposits.',
    },
    {
      q: 'Are daily returns guaranteed?',
      a: 'No. In full alignment with professional asset management principles, returns are strictly performance-based and variable according to market opportunities and volatility. While our risk engine utilizes strict stop-loss protocols, returns are never fixed or guaranteed.',
    },
    {
      q: 'Why is there a 20-day deposit lock period?',
      a: 'To deploy capital effectively into market-making orders and liquidity positions without exposing the fund to sudden flash withdrawals or predatory arbitrage, newly deposited principal is committed for 20 days. Daily earnings earned on this principal, however, accumulate continuously.',
    },
    {
      q: 'What is the 30-day account maturity rule?',
      a: 'For platform security, anti-money laundering (AML) compliance, and long-term liquidity protection, an account must be at least 30 calendar days old from creation before submitting withdrawal requests.',
    },
    {
      q: 'How is the 4% withdrawal fee applied?',
      a: 'When you submit a withdrawal request, a transparent 4% fee is deducted from the requested amount to cover Binance Smart Chain gas fees, hot-wallet rebalancing, and operational custody costs. For example, a $500 withdrawal incurs a $20 fee, delivering $480 net USDT directly to your destination wallet.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-3xl bg-[#0F172A] border border-slate-800 shadow-2xl text-slate-100 overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">
                Institutional Fund & Earning Plan
              </h2>
              <p className="text-xs text-slate-400">
                Transparent Capital Management & Performance Distribution Framework
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 px-6 bg-slate-900/30 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-4 border-b-2 transition ${
              activeTab === 'overview'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Fund Overview & Earnings
          </button>
          <button
            onClick={() => setActiveTab('strategies')}
            className={`py-3 px-4 border-b-2 transition ${
              activeTab === 'strategies'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Trading Strategies & Risk
          </button>
          <button
            onClick={() => setActiveTab('faq')}
            className={`py-3 px-4 border-b-2 transition ${
              activeTab === 'faq'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Rules & Governance FAQ
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Introduction Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/30 via-slate-900 to-slate-900 border border-emerald-500/30 space-y-3">
                <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm">
                  <Sparkles className="w-4 h-4" />
                  <span>How Capital is Managed & Profits Are Distributed</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Our fund operates as an institutional multi-strategy investment vehicle for USDT (BEP-20) capital. All user deposits are aggregated into managed portfolios that trade active digital asset markets, capturing spreads, yield farming incentives, and quantitative market inefficiencies.
                </p>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Instead of paying arbitrary fixed rates, we distribute actual realized returns. When our trading desk generates daily profit, a uniform net performance percentage is calculated, verified on our double-entry ledger, and credited directly to every investor proportional to their active deposited principal.
                </p>
              </div>

              {/* Step-by-Step Lifecycle */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Investor Lifecycle & Earnings Timeline
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                    <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-xs">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center font-bold">1</span>
                      <span>Deposit & Blockchain Confirmation</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Transfer USDT (BEP-20) to the platform address. Once 15 BSC network confirmations are achieved, your deposit is officially registered.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                    <div className="flex items-center space-x-2 text-teal-400 font-semibold text-xs">
                      <span className="w-5 h-5 rounded-full bg-teal-500/20 flex items-center justify-center font-bold">2</span>
                      <span>Active Capital Deployment</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Your principal enters the trading pool with a 20-day liquidity stabilization lock. Funds actively generate performance allocations from day one.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                    <div className="flex items-center space-x-2 text-cyan-400 font-semibold text-xs">
                      <span className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center font-bold">3</span>
                      <span>Daily Yield Calculation & Payout</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Every 24 hours (00:00 UTC), the fund records net daily trading gains. Your exact share is instantly credited to your available balance.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                    <div className="flex items-center space-x-2 text-amber-400 font-semibold text-xs">
                      <span className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center font-bold">4</span>
                      <span>Maturity & Liquidity Access</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Once your account reaches the 30-day maturity threshold, you may withdraw your accumulated balance or principal at any time (4% standard fee).
                    </p>
                  </div>
                </div>
              </div>

              {/* Sample Calculation Table */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-slate-200">Illustrative Return Scenarios</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] text-left">
                    <thead className="text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="pb-2 font-medium">Principal Balance</th>
                        <th className="pb-2 font-medium">Daily Return Rate</th>
                        <th className="pb-2 font-medium">Daily Payout</th>
                        <th className="pb-2 font-medium">Est. 30-Day Yield</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      <tr>
                        <td className="py-2 font-semibold text-white">$500 USDT</td>
                        <td className="py-2 text-emerald-400">+0.50%</td>
                        <td className="py-2 text-teal-300">+$2.50 USDT</td>
                        <td className="py-2 text-emerald-400">~$75.00 USDT</td>
                      </tr>
                      <tr>
                        <td className="py-2 font-semibold text-white">$1,000 USDT</td>
                        <td className="py-2 text-emerald-400">+0.70%</td>
                        <td className="py-2 text-teal-300">+$7.00 USDT</td>
                        <td className="py-2 text-emerald-400">~$210.00 USDT</td>
                      </tr>
                      <tr>
                        <td className="py-2 font-semibold text-white">$5,000 USDT</td>
                        <td className="py-2 text-emerald-400">+0.65%</td>
                        <td className="py-2 text-teal-300">+$32.50 USDT</td>
                        <td className="py-2 text-emerald-400">~$975.00 USDT</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-slate-500 italic">
                  * Note: Return rates are indicative and reflect market performance. Rates fluctuate daily.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'strategies' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold text-xs text-slate-100">Cross-Market Arbitrage</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Capturing instantaneous price discrepancies across global spot and derivatives order books with zero directional exposure.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                    <Layers className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold text-xs text-slate-100">Liquidity Provisioning</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Providing market liquidity into high-volume stablecoin and major crypto pools to harvest institutional transaction fees.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center">
                    <Shield className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold text-xs text-slate-100">Delta-Neutral Hedging</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Executing automated spot-futures funding arbitrage where positions are 100% hedged against market downswings.
                  </p>
                </div>
              </div>

              {/* Risk Management Architecture */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Risk Preservation Protocols</span>
                </div>
                <ul className="space-y-2 text-[11px] text-slate-300">
                  <li className="flex items-start space-x-2">
                    <span className="text-emerald-400 font-bold mt-0.5">•</span>
                    <span><strong>Strict Drawdown Limits:</strong> Algorithmic positions automatically unwind if adverse volatility exceeds pre-defined 1.5% intraday limits.</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-emerald-400 font-bold mt-0.5">•</span>
                    <span><strong>Cold Storage Reserve:</strong> Over 70% of fund reserves are segregated into institutional multi-signature cold custody.</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-emerald-400 font-bold mt-0.5">•</span>
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
                  className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden"
                >
                  <button
                    onClick={() => toggleFaq(index)}
                    className="w-full p-4 text-left flex items-center justify-between text-xs font-bold text-slate-200 hover:text-white transition"
                  >
                    <span>{faq.q}</span>
                    {expandedFaq === index ? (
                      <ChevronUp className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                  {expandedFaq === index && (
                    <div className="px-4 pb-4 pt-1 text-[11px] text-slate-400 leading-relaxed border-t border-slate-800/50 bg-slate-950/40">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Legal Disclaimer in Short Font */}
          <div className="p-4 rounded-2xl bg-red-950/20 border border-red-500/20 space-y-1.5">
            <div className="flex items-center space-x-2 text-red-400 font-semibold text-xs">
              <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Comprehensive Risk Disclaimer & Disclosure</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              <strong>DISCLAIMER:</strong> Digital asset investments and crypto trading strategies carry significant market risks, including the potential loss of capital, market volatility, liquidity risk, and technical network factors. Historical returns and past daily yields are not indicative of future performance. Yield distributions are variable and depend entirely upon realized trading returns; returns are never guaranteed or fixed. Investors are responsible for assessing their own financial circumstances and should never allocate funds they cannot afford to lose. By depositing funds, you formally accept all platform terms, including the 20-day deposit lock period, the 30-day account age withdrawal eligibility requirement, and the 4% standard network processing fee.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">
            Institutional Fund Management • Binance Smart Chain (BEP-20)
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
};
