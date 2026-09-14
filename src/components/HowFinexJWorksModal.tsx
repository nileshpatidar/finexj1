import React, { useState, useEffect } from 'react';
import { useSettings } from '../context/SettingsContext';
import {
  X,
  HelpCircle,
  Info,
  TrendingUp,
  ArrowUpRight,
  Users,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';

export interface HowFinexJWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HowFinexJWorksModal: React.FC<HowFinexJWorksModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    minimumDepositAmount,
    withdrawalFeePercentage,
    depositLockPeriodDays,
    referralRewardL1Percentage,
    referralRewardL2Percentage,
  } = useSettings();

  // Accordion state: Q1 open by default
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({
    q1: true,
  });
  const [isRiskDisclosureOpen, setIsRiskDisclosureOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleFaq = (id: string) => {
    setExpandedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Dynamic fee calculation for 500 USDT sample
  const sampleAmount = 500;
  const feePct = withdrawalFeePercentage;
  const calculatedFeeNum = (sampleAmount * feePct) / 100;
  const calculatedNetNum = sampleAmount - calculatedFeeNum;
  const calculatedFee = Number.isInteger(calculatedFeeNum)
    ? calculatedFeeNum.toString()
    : calculatedFeeNum.toFixed(2);
  const calculatedNet = Number.isInteger(calculatedNetNum)
    ? calculatedNetNum.toString()
    : calculatedNetNum.toFixed(2);

  const sections = [
    {
      title: 'About FinexJ',
      icon: Info,
      items: [
        {
          id: 'q1',
          q: 'Who are we?',
          a: 'FinexJ is an investment and trading fund management platform focused on managing capital across digital-asset market opportunities using defined trading strategies and risk-management processes. Investment performance can vary and is not guaranteed.',
        },
        {
          id: 'q2',
          q: 'How does FinexJ work?',
          a: "Users deposit USDT through the supported network. Eligible capital participates in the fund's daily performance calculation. When positive performance is recorded, the applicable performance amount is credited according to the platform's rules.",
        },
        {
          id: 'q3',
          q: 'How does the fund generate performance?',
          a: 'The fund may use trading and market strategies designed to identify opportunities in digital-asset markets. Actual performance depends on market conditions and trading results.',
        },
      ],
    },
    {
      title: 'Deposits & Earnings',
      icon: TrendingUp,
      items: [
        {
          id: 'q4',
          q: 'What is the minimum deposit?',
          a: `The minimum deposit is ${minimumDepositAmount} USDT using the supported BEP-20 network.`,
        },
        {
          id: 'q5',
          q: 'What is the deposit lock period?',
          a: `Each confirmed deposit is subject to a ${depositLockPeriodDays}-day deposit lock. The lock period is applied according to the current platform setting. Each deposit has its own lock timeline.`,
        },
        {
          id: 'q6',
          q: 'When does my deposit mature?',
          a: 'Each deposit follows its applicable maturity timeline. Maturity is tracked separately from the deposit lock, and a later deposit does not reset the maturity timeline of an earlier deposit.',
        },
        {
          id: 'q7',
          q: 'How does daily compounding work?',
          a: 'Eligible credited investment earnings can become part of the active compounding base for future performance calculations. This means future performance can be calculated on the previous active base plus eligible credited earnings.',
        },
        {
          id: 'q8',
          q: 'What happens if I make another deposit?',
          a: 'Each deposit is tracked independently. A new deposit gets its own applicable lock and maturity timeline and does not reset the timeline of earlier deposits.',
        },
      ],
    },
    {
      title: 'Withdrawals',
      icon: ArrowUpRight,
      items: [
        {
          id: 'q9',
          q: 'When can I withdraw?',
          a: 'You can withdraw amounts that are eligible under the current deposit maturity, lock, available-balance and withdrawal rules.',
        },
        {
          id: 'q10',
          q: 'What is the withdrawal fee?',
          a: `The current standard withdrawal processing fee is ${withdrawalFeePercentage}%. For example, a 500 USDT withdrawal request at ${withdrawalFeePercentage}% would have a ${calculatedFee} USDT fee and ${calculatedNet} USDT net payout.`,
        },
        {
          id: 'q11',
          q: 'What happens when I withdraw?',
          a: 'Once a withdrawal is successfully processed, the withdrawn amount is removed from future compounding. Remaining eligible capital continues according to the applicable rules.',
        },
        {
          id: 'q12',
          q: 'What happens if I withdraw before earnings compound?',
          a: 'Any amount that has not yet been credited is not treated as already-earned balance. Once a withdrawal is processed, the withdrawn amount is removed from the future compounding base. Already credited earnings are not reversed solely because a withdrawal is made.',
        },
      ],
    },
    {
      title: 'Referral Rewards',
      icon: Users,
      items: [
        {
          id: 'q13',
          q: 'How do referral rewards work?',
          customContent: (
            <div className="space-y-2.5">
              <p>
                FinexJ currently supports a two-level referral structure. Level 1 refers to users you invite directly. Level 2 refers to users invited by your Level 1 referrals. Referral rewards are separate from investment earnings and do not compound.
              </p>
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300 font-semibold">
                    Level 1 — {referralRewardL1Percentage}%
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    Users you referred directly
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300 font-semibold">
                    Level 2 — {referralRewardL2Percentage}%
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    Users referred by your Level 1 referrals
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Eligible referral rewards are calculated according to the current referral program rules.
              </p>
            </div>
          ),
        },
        {
          id: 'q14',
          q: 'Can I withdraw referral rewards?',
          a: "Yes. Eligible referral rewards can be withdrawn according to the platform's current withdrawal and eligibility rules.",
        },
        {
          id: 'q15',
          q: 'Do referral rewards compound?',
          a: 'No. Referral rewards are separate from investment compounding and are not added to the investment compounding principal.',
        },
      ],
    },
    {
      title: 'Risk & Security',
      icon: ShieldAlert,
      items: [
        {
          id: 'q16',
          q: 'Are investment returns guaranteed?',
          a: 'No. Investment performance varies according to market conditions and trading results. Historical or illustrative performance does not guarantee future results.',
        },
        {
          id: 'q17',
          q: 'Which network does FinexJ use?',
          a: 'USDT deposits and withdrawals use the supported BEP-20 / BNB Smart Chain network. Always verify the network and destination address before sending funds.',
        },
        {
          id: 'q18',
          q: 'What happens if market performance is negative?',
          a: 'Investment performance depends on actual market and trading results. Positive performance is not guaranteed, and users should understand that investment activity involves risk.',
        },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="faq-modal-title"
    >
      <div
        className="relative w-full max-w-2xl rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-2xl text-slate-900 dark:text-white overflow-hidden my-auto max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="faq-modal-title"
                className="text-base sm:text-lg font-bold text-slate-900 dark:text-white"
              >
                How FinexJ Works
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Simple answers about deposits, earnings, withdrawals and rewards.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable FAQ Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-xs sm:text-sm">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <div key={section.title} className="space-y-2.5">
                {/* Section Title */}
                <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400 px-1">
                  <Icon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    {section.title}
                  </span>
                </div>

                {/* Section Accordion Items */}
                <div className="space-y-2">
                  {section.items.map((item) => {
                    const isExpanded = Boolean(expandedIds[item.id]);
                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 overflow-hidden transition"
                      >
                        <button
                          type="button"
                          onClick={() => toggleFaq(item.id)}
                          className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left font-semibold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer"
                          aria-expanded={isExpanded}
                        >
                          <span className="text-xs sm:text-[13px] pr-3 leading-snug">
                            {item.q}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="px-3.5 sm:px-4 pb-3.5 sm:pb-4 pt-0 text-xs text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800/50 leading-relaxed font-normal">
                            {item.customContent ? item.customContent : <p className="pt-2.5">{item.a}</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Section 13: Full Risk Disclosure Accordion */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setIsRiskDisclosureOpen((prev) => !prev)}
                className="w-full flex items-center justify-between p-3.5 text-left font-semibold text-amber-800 dark:text-amber-300 hover:opacity-90 transition cursor-pointer"
                aria-expanded={isRiskDisclosureOpen}
              >
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                  <span className="text-xs sm:text-[13px] font-bold">Full Risk Disclosure</span>
                </div>
                {isRiskDisclosureOpen ? (
                  <ChevronUp className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                )}
              </button>

              {isRiskDisclosureOpen && (
                <div className="px-3.5 pb-4 pt-1 text-xs text-amber-900/80 dark:text-amber-200/80 border-t border-amber-200/50 dark:border-amber-900/40 space-y-2 leading-relaxed">
                  <p>
                    Digital asset markets are subject to significant price volatility and market risk. Past performance or simulated results are not indicative of future returns.
                  </p>
                  <p>
                    Participating in capital allocation carries risk, including the possible loss of principal. FinexJ does not guarantee capital protection or fixed returns. Users should only allocate capital they can afford to risk and consult independent financial advisors where necessary.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
          <span>Supported Network: BNB Smart Chain (BEP-20)</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
