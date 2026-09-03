import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { WithdrawalItem, UserBalanceSummary, WithdrawalImpactResult } from '../types';
import {
  ArrowUpFromLine,
  AlertTriangle,
  Lock,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Mail,
  ShieldCheck,
  ShieldAlert,
  Wallet,
  ExternalLink,
  Info,
  RefreshCw,
} from 'lucide-react';

interface WithdrawViewProps {
  onWithdrawalSubmitted: () => void;
}

export const WithdrawView: React.FC<WithdrawViewProps> = ({ onWithdrawalSubmitted }) => {
  const { user } = useAuth();
  const { withdrawalFeePercentage, accountAgeRequirementDays, minimumDepositAmount } = useSettings();

  // Financial data state
  const [balance, setBalance] = useState<UserBalanceSummary | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Withdrawal form state
  const [amount, setAmount] = useState<string>('100');
  const [destinationAddress, setDestinationAddress] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [twoFactorCode, setTwoFactorCode] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [userNotes, setUserNotes] = useState<string>('');

  // Authoritative backend preview state
  const [previewImpact, setPreviewImpact] = useState<WithdrawalImpactResult | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Email OTP state
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpSentMessage, setOtpSentMessage] = useState<string | null>(null);
  const [otpExpiresInSeconds, setOtpExpiresInSeconds] = useState<number>(0);
  const [otpCooldown, setOtpCooldown] = useState<number>(0);
  const [testOtpCode, setTestOtpCode] = useState<string | null>(null);

  // Two-Stage Confirmation Modal State
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [userConfirmedLockBreak, setUserConfirmedLockBreak] = useState(false);
  const [userConfirmedMinimumBreak, setUserConfirmedMinimumBreak] = useState(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastSubmitted, setLastSubmitted] = useState<WithdrawalItem | null>(null);

  // Cooldown timer ref
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Pre-fill destination wallet from user profile
  useEffect(() => {
    if (user?.walletAddress && !destinationAddress) {
      setDestinationAddress(user.walletAddress);
    }
  }, [user?.walletAddress, destinationAddress]);

  // Load balance and withdrawal records
  const loadData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const res = await api.getWithdrawals();
      setWithdrawals(res.withdrawals || []);
      setBalance(res.balance || null);
    } catch (err) {
      console.warn('Failed to load withdrawal data:', err);
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Debounced Authoritative Backend Preview fetch
  const numAmount = parseFloat(amount) || 0;

  const fetchPreview = useCallback(async (reqAmount: number) => {
    if (reqAmount <= 0) {
      setPreviewImpact(null);
      setPreviewError(null);
      return;
    }

    setIsPreviewLoading(true);
    setPreviewError(null);

    try {
      const res = await api.previewWithdrawal(reqAmount);
      if (res.success && res.impact) {
        setPreviewImpact(res.impact);
      } else {
        setPreviewImpact(null);
      }
    } catch (err) {
      const msg = (err as Error).message || 'Failed to preview withdrawal.';
      setPreviewError(msg);
      setPreviewImpact(null);
    } finally {
      setIsPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (numAmount > 0) {
        fetchPreview(numAmount);
      } else {
        setPreviewImpact(null);
      }
    }, 400);

    return () => clearTimeout(handler);
  }, [numAmount, fetchPreview]);

  // OTP Cooldown Countdown
  useEffect(() => {
    if (otpCooldown > 0) {
      cooldownTimerRef.current = setTimeout(() => {
        setOtpCooldown(prev => prev - 1);
      }, 1000);
    }
    return () => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
    };
  }, [otpCooldown]);

  // Request Email OTP Handler
  const handleRequestOtp = async () => {
    if (otpCooldown > 0) return;

    setIsSendingOtp(true);
    setErrorMessage(null);

    try {
      const res = await api.requestWithdrawalOtp();
      if (res.success) {
        setOtpSentMessage(res.message);
        setOtpExpiresInSeconds(res.expiresInSeconds || 600);
        setOtpCooldown(60); // 60-second cooldown
        if (res.testOtpCode) {
          setTestOtpCode(res.testOtpCode);
          setOtpCode(res.testOtpCode);
        }
      }
    } catch (err) {
      setErrorMessage((err as Error).message || 'Failed to send verification code. Please try again.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Pre-validate & Check Confirmation Requirements before Submission
  const handleInitiateWithdrawal = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (numAmount <= 0) {
      setErrorMessage('Please enter a withdrawal amount greater than 0 USDT.');
      return;
    }

    if (!destinationAddress.trim()) {
      setErrorMessage('Please provide a destination BEP-20 BNB Smart Chain address.');
      return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(destinationAddress.trim())) {
      setErrorMessage('Invalid BEP-20 address format. Address must start with 0x and contain 40 hexadecimal characters.');
      return;
    }

    if (!password) {
      setErrorMessage('Account password confirmation is required.');
      return;
    }

    if (user?.twoFactorEnabled && !twoFactorCode.trim()) {
      setErrorMessage('Please enter your 6-digit 2FA authenticator code.');
      return;
    }

    if (!otpCode.trim()) {
      setErrorMessage('Email security verification code (OTP) is required. Click "Send Email Code" to receive it.');
      return;
    }

    // Check if Authoritative Backend warnings apply
    const needsLockConfirm = previewImpact?.requiresLockBreakConfirmation && !userConfirmedLockBreak;
    const needsMinConfirm = previewImpact?.requiresMinimumBreakConfirmation && !userConfirmedMinimumBreak;

    if (needsLockConfirm || needsMinConfirm) {
      setShowConfirmationModal(true);
      return;
    }

    // All clear, execute final submission
    executeWithdrawalSubmission();
  };

  // Stage 2: Final Backend Execution
  const executeWithdrawalSubmission = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const idempotencyKey = 'wd_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);

    try {
      const res = await api.submitWithdrawal({
        requestedAmount: numAmount,
        destinationAddress: destinationAddress.trim(),
        network: 'BEP-20',
        password,
        twoFactorCode: twoFactorCode.trim() || undefined,
        otpCode: otpCode.trim(),
        confirmLockBreak: userConfirmedLockBreak,
        confirmMinimumBreak: userConfirmedMinimumBreak,
        idempotencyKey,
        userNotes: userNotes.trim() || undefined,
      });

      if (res.success && res.withdrawal) {
        const reqAmt = Number(res.withdrawal.requestedAmount || 0);
        const netAmt = Number(res.withdrawal.netAmount || 0);
        const feeAmt = Number(res.withdrawal.feeAmount || 0);
        const feePct = res.withdrawal.feePercentage ?? previewImpact?.feePercentage ?? 9;

        setSuccessMessage(
          `Withdrawal request for $${reqAmt.toFixed(2)} USDT submitted successfully! Net payout to receive: $${netAmt.toFixed(2)} USDT (Fee: $${feeAmt.toFixed(2)} at ${feePct}%). Awaiting compliance review.`
        );
        setLastSubmitted(res.withdrawal);
        setPassword('');
        setTwoFactorCode('');
        setOtpCode('');
        setTestOtpCode(null);
        setOtpSentMessage(null);
        setShowConfirmationModal(false);
        setUserConfirmedLockBreak(false);
        setUserConfirmedMinimumBreak(false);

        await loadData();
        onWithdrawalSubmitted();
      } else {
        if (res.requiresConfirmation) {
          setShowConfirmationModal(true);
        }
        setErrorMessage(res.error || 'Failed to submit withdrawal request.');
      }
    } catch (err) {
      setErrorMessage((err as Error).message || 'Withdrawal request failed. Please check eligibility rules.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Authoritative or fallback calculation for UI display
  const authoritativeFeePct = previewImpact?.feePercentage ?? withdrawalFeePercentage ?? 9.0;
  const authoritativeFeeAmt = previewImpact?.feeAmount ?? Number((numAmount * (authoritativeFeePct / 100)).toFixed(4));
  const authoritativeNetAmt = previewImpact?.netAmount ?? Math.max(0, Number((numAmount - authoritativeFeeAmt).toFixed(4)));

  // Available balance helpers from backend
  const availableBal = Number(balance?.availableBalance || 0);
  const referralEarnings = Number(balance?.referralEarnings || 0);
  const compoundingPrincipal = Number(balance?.activeCompoundingPrincipal ?? Math.max(0, availableBal - referralEarnings));
  const lockedPrincipal = Number(balance?.depositLockedPrincipal ?? balance?.lockedBalance ?? 0);

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-24 text-slate-900 dark:text-slate-100">
      {/* Title & Network Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Withdraw USDT
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-bold bg-blue-600 text-white rounded-md shadow-xs">
              BEP-20 (BSC)
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Request official disbursement of available capital and referral earnings to your BEP-20 wallet.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={isLoadingData}
          className="self-start sm:self-auto inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition"
          title="Refresh Balance & History"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* 1. AVAILABLE USER BALANCE CARD & SOURCES BREAKDOWN */}
      <div className="rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Available Withdrawal Balance
          </span>
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center space-x-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Authoritative Live Balance</span>
          </span>
        </div>

        <div className="flex items-baseline space-x-2">
          <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            ${availableBal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-sm font-bold text-slate-500 dark:text-slate-400">USDT</span>
        </div>

        {/* Source Categories Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          {/* Active Compounding Principal */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80">
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">
              Compounding Principal
            </span>
            <p className="text-base font-extrabold text-blue-600 dark:text-blue-400 mt-0.5">
              ${compoundingPrincipal.toFixed(2)} USDT
            </p>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1 leading-tight">
              Subject to 30-day lock & ${minimumDepositAmount ?? 300} minimum
            </span>
          </div>

          {/* Referral Income */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80">
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">
              Referral Income
            </span>
            <p className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
              ${referralEarnings.toFixed(2)} USDT
            </p>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1 leading-tight">
              100% unlocked • Free to withdraw anytime
            </span>
          </div>

          {/* Deposit Lock Status */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80">
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">
              Locked Principal
            </span>
            <p className="text-base font-extrabold text-amber-600 dark:text-amber-400 mt-0.5">
              ${lockedPrincipal.toFixed(2)} USDT
            </p>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1 leading-tight">
              {balance?.isFundLocked
                ? `Lock active (${balance.fundLockRemainingDays}d ${balance.fundLockRemainingHours}h)`
                : 'Mature / Unlocked'}
            </span>
          </div>
        </div>

        {/* Source distinction note */}
        <div className="flex items-start space-x-2 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
          <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
          <span>
            Every withdrawal is subject to the standard {authoritativeFeePct}% fee. Referral income is not part of compounding principal and can be withdrawn freely without affecting your daily yield cycle.
          </span>
        </div>
      </div>

      {/* 2. WITHDRAWAL FORM */}
      <div className="rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center space-x-2">
          <ArrowUpFromLine className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span>Withdrawal Request Details</span>
        </h2>

        {errorMessage && (
          <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 text-xs flex items-start space-x-2.5 font-medium">
            <XCircle className="w-4 h-4 flex-shrink-0 text-red-500 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">Withdrawal Validation Notice:</span>
              <p>{errorMessage}</p>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-xs flex items-start space-x-2.5 font-medium">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-500 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">Withdrawal Successfully Submitted!</span>
              <p>{successMessage}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleInitiateWithdrawal} className="space-y-5 text-xs">
          {/* Section: Withdrawal Amount */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-700 dark:text-slate-300 text-xs">
                Withdrawal Amount (USDT)
              </label>
              {availableBal > 0 && (
                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={() => setAmount((availableBal * 0.25).toFixed(2))}
                    className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 transition cursor-pointer"
                  >
                    25%
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmount((availableBal * 0.5).toFixed(2))}
                    className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 transition cursor-pointer"
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmount((availableBal * 0.75).toFixed(2))}
                    className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 transition cursor-pointer"
                  >
                    75%
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmount(availableBal.toFixed(2))}
                    className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-[11px] font-bold transition cursor-pointer"
                  >
                    Max
                  </button>
                </div>
              )}
            </div>

            <div className="relative">
              <input
                type="number"
                step="any"
                min="1"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="1000"
                className="w-full py-3.5 pl-4 pr-16 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold text-base focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 transition"
              />
              <div className="absolute right-4 top-3.5 flex items-center space-x-1.5 font-bold text-slate-400">
                {isPreviewLoading && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
                <span>USDT</span>
              </div>
            </div>

            {previewError && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                {previewError}
              </p>
            )}
          </div>

          {/* 3. AUTHORITATIVE 9% WITHDRAWAL FEE DISPLAY */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600 dark:text-slate-400">Gross Withdrawal:</span>
              <span className="font-bold text-slate-900 dark:text-white text-sm">
                ${numAmount.toFixed(2)} USDT
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600 dark:text-slate-400 flex items-center space-x-1">
                <span>Withdrawal Fee ({authoritativeFeePct}%):</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-slate-200 dark:bg-slate-800 rounded font-bold text-slate-600 dark:text-slate-300">
                  Backend Authoritative
                </span>
              </span>
              <span className="font-bold text-amber-600 dark:text-amber-400 text-sm">
                -${authoritativeFeeAmt.toFixed(2)} USDT
              </span>
            </div>

            <div className="h-px bg-slate-200 dark:bg-slate-800"></div>

            <div className="flex items-center justify-between font-bold">
              <span className="text-sm text-slate-900 dark:text-white">Net Payout (You Receive):</span>
              <span className="text-base sm:text-lg font-black text-blue-600 dark:text-blue-400">
                ${authoritativeNetAmt.toFixed(2)} USDT
              </span>
            </div>

            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
              Note: 100% of the {authoritativeFeePct}% withdrawal fee belongs to FINEXJ operational reserves. No referral rewards are created from withdrawal fees.
            </p>
          </div>

          {/* Active Backend Warnings Preview Banner */}
          {previewImpact?.requiresLockBreakConfirmation && (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 text-amber-900 dark:text-amber-200 text-xs flex items-start space-x-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold block">30-Day Fund Lock Warning:</strong>
                <p className="mt-0.5 leading-relaxed">
                  {previewImpact.lockBreakWarning ||
                    'Your principal and earnings are currently locked for the 30-day period. If you continue with this withdrawal, your current compounding/earning cycle will be broken and daily earnings will stop according to the withdrawal rules.'}
                </p>
              </div>
            </div>
          )}

          {previewImpact?.requiresMinimumBreakConfirmation && (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 text-amber-900 dark:text-amber-200 text-xs flex items-start space-x-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold block">Minimum Principal Requirement Notice:</strong>
                <p className="mt-0.5 leading-relaxed">
                  {previewImpact.minimumBreakWarning ||
                    'Your withdrawal will reduce your eligible fund below the minimum required amount. If you continue, daily earnings/compounding will stop.'}
                </p>
              </div>
            </div>
          )}

          {/* Section: BEP-20 Wallet Address */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-700 dark:text-slate-300 text-xs flex items-center space-x-1.5">
                <Wallet className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Destination BEP-20 Wallet Address</span>
              </label>

              {user?.walletAddress && (
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                  Saved Account Address
                </span>
              )}
            </div>

            <input
              type="text"
              value={destinationAddress}
              onChange={e => setDestinationAddress(e.target.value)}
              placeholder="0x..."
              className="w-full py-3 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 transition"
            />
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              Only enter a Binance Smart Chain (BEP-20) wallet address. Funds sent to non-BEP-20 addresses cannot be recovered.
            </p>
          </div>

          {/* Section: Security Verification (Password, Email OTP, 2FA) */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Multi-Layer Security Authorization</span>
            </h3>

            {/* Account Password */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Account Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter current account password"
                className="w-full py-3 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 transition"
              />
            </div>

            {/* Email OTP Security Flow */}
            <div className="space-y-2 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 text-xs flex items-center space-x-1.5">
                    <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Email Verification Code (OTP)</span>
                  </label>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                    Dispatched to {user?.email ? user.email.replace(/(.{2})(.*)(?=@)/, '$1***') : 'your registered email'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleRequestOtp}
                  disabled={isSendingOtp || otpCooldown > 0}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs transition flex items-center justify-center space-x-1 cursor-pointer self-start sm:self-auto"
                >
                  {isSendingOtp ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending Code...</span>
                    </>
                  ) : otpCooldown > 0 ? (
                    <>
                      <Clock className="w-3.5 h-3.5" />
                      <span>Resend in {otpCooldown}s</span>
                    </>
                  ) : (
                    <>
                      <Mail className="w-3.5 h-3.5" />
                      <span>Send Email Code</span>
                    </>
                  )}
                </button>
              </div>

              {otpSentMessage && (
                <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-[11px] flex items-center justify-between">
                  <span>{otpSentMessage}</span>
                  {testOtpCode && (
                    <span className="font-mono font-bold bg-blue-600 text-white px-2 py-0.5 rounded text-[10px]">
                      Test Helper: {testOtpCode}
                    </span>
                  )}
                </div>
              )}

              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.trim())}
                placeholder="Enter 6-digit OTP code"
                className="w-full py-3 px-3.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-center tracking-widest text-sm font-bold focus:outline-none focus:border-blue-600 transition"
              />
            </div>

            {/* 2FA Authenticator Code (if user has 2FA enabled) */}
            {user?.twoFactorEnabled && (
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  6-Digit 2FA Authenticator Code (Google Authenticator)
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={twoFactorCode}
                  onChange={e => setTwoFactorCode(e.target.value.trim())}
                  placeholder="123456"
                  className="w-full py-3 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs tracking-widest text-center font-mono focus:outline-none focus:border-blue-600 transition"
                />
              </div>
            )}

            {/* User Notes (Optional) */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Withdrawal Memo / Notes (Optional)
              </label>
              <input
                type="text"
                value={userNotes}
                onChange={e => setUserNotes(e.target.value)}
                placeholder="Reference or notes for your records"
                className="w-full py-2.5 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600 transition"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={
              isSubmitting ||
              numAmount <= 0 ||
              !destinationAddress ||
              !password ||
              !otpCode
            }
            className="w-full py-4 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm shadow-lg shadow-blue-500/25 transition flex items-center justify-center space-x-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Submitting Authoritative Payout Request...</span>
              </>
            ) : (
              <>
                <ArrowUpFromLine className="w-4 h-4" />
                <span>Confirm & Submit Withdrawal Request</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* 4. TWO-STAGE CONFIRMATION MODAL (POPUP) */}
      {showConfirmationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 p-6 sm:p-7 shadow-2xl space-y-5">
            <div className="flex items-start space-x-3 text-amber-600 dark:text-amber-400">
              <div className="p-2.5 rounded-2xl bg-amber-500/15 flex-shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  Withdrawal Impact Confirmation Required
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Please review and acknowledge the terms before completing your withdrawal.
                </p>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              {/* Lock Break Warning */}
              {previewImpact?.requiresLockBreakConfirmation && (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 space-y-3">
                  <div className="flex items-start space-x-2 text-amber-950 dark:text-amber-100">
                    <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <span className="font-bold text-xs leading-relaxed">
                      {previewImpact.lockBreakWarning ||
                        'Your principal and earnings are currently locked for the 30-day period. If you continue with this withdrawal, your current compounding/earning cycle will be broken and daily earnings will stop according to the withdrawal rules.'}
                    </span>
                  </div>

                  <label className="flex items-start space-x-2.5 cursor-pointer pt-2 border-t border-amber-200 dark:border-amber-800">
                    <input
                      type="checkbox"
                      checked={userConfirmedLockBreak}
                      onChange={e => setUserConfirmedLockBreak(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-semibold text-amber-900 dark:text-amber-200 text-xs">
                      I understand and confirm breaking my 30-day lock cycle.
                    </span>
                  </label>
                </div>
              )}

              {/* Minimum Principal Break Warning */}
              {previewImpact?.requiresMinimumBreakConfirmation && (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 space-y-3">
                  <div className="flex items-start space-x-2 text-amber-950 dark:text-amber-100">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <span className="font-bold text-xs leading-relaxed">
                      {previewImpact.minimumBreakWarning ||
                        'Your withdrawal will reduce your eligible fund below the minimum required amount. If you continue, daily earnings/compounding will stop.'}
                    </span>
                  </div>

                  <label className="flex items-start space-x-2.5 cursor-pointer pt-2 border-t border-amber-200 dark:border-amber-800">
                    <input
                      type="checkbox"
                      checked={userConfirmedMinimumBreak}
                      onChange={e => setUserConfirmedMinimumBreak(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-semibold text-amber-900 dark:text-amber-200 text-xs">
                      I understand that reducing my balance below the required minimum (${minimumDepositAmount ?? 300}) will stop daily compounding.
                    </span>
                  </label>
                </div>
              )}

              {/* Summary of amounts */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Withdrawal Amount:</span>
                  <span className="font-bold text-slate-900 dark:text-white">${numAmount.toFixed(2)} USDT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Fee ({authoritativeFeePct}%):</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">-${authoritativeFeeAmt.toFixed(2)} USDT</span>
                </div>
                <div className="flex justify-between font-bold text-xs text-blue-600 dark:text-blue-400 pt-1 border-t border-slate-200 dark:border-slate-800">
                  <span>Net to Receive:</span>
                  <span>${authoritativeNetAmt.toFixed(2)} USDT</span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmationModal(false)}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={
                  (previewImpact?.requiresLockBreakConfirmation && !userConfirmedLockBreak) ||
                  (previewImpact?.requiresMinimumBreakConfirmation && !userConfirmedMinimumBreak) ||
                  isSubmitting
                }
                onClick={executeWithdrawalSubmission}
                className="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md shadow-blue-500/25 transition flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>Acknowledge & Confirm</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MANUAL PAYOUT MODEL NOTICE CARD */}
      <div className="p-4 rounded-3xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-2">
        <div className="flex items-center space-x-2 font-bold text-slate-900 dark:text-white text-xs">
          <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span>Institutional Manual Cold-Storage Payout Model</span>
        </div>
        <p className="text-[11px] leading-relaxed">
          FINEXJ strictly protects client reserves by enforcing a <strong>manual cold-storage payout workflow</strong>. When a withdrawal request is submitted, it is reviewed by finance officers for fraud prevention and double-entry reconciliation. Payouts are manually disbursed via Binance Smart Chain (USDT BEP-20) from offline hardware reserves, and the verified on-chain transaction hash is posted here. Private keys are never hosted on internet-facing servers.
        </p>
      </div>

      {/* 6. WITHDRAWAL REQUESTS HISTORY */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Withdrawal Requests History
          </h2>
          <span className="text-xs text-slate-500 font-semibold">
            {withdrawals.length} {withdrawals.length === 1 ? 'Record' : 'Records'}
          </span>
        </div>

        {withdrawals.length === 0 ? (
          <div className="p-8 text-center rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs">
            No withdrawal requests submitted yet.
          </div>
        ) : (
          <div className="space-y-3">
            {withdrawals.map(wd => {
              const statusColor =
                wd.status === 'paid'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : wd.status === 'approved' || wd.status === 'processing'
                  ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                  : wd.status === 'rejected'
                  ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';

              return (
                <div
                  key={wd.id}
                  className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-3 text-xs shadow-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center space-x-2.5">
                      <span className="font-extrabold text-slate-900 dark:text-white text-base">
                        ${Number(wd.requestedAmount || 0).toFixed(2)} USDT
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider ${statusColor}`}>
                        {wd.status === 'paid' ? 'PAID (ON-CHAIN)' : wd.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="font-extrabold text-blue-600 dark:text-blue-400 text-sm">
                        Net Payout: ${Number(wd.netAmount || 0).toFixed(2)} USDT
                      </span>
                      <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                        Fee: ${Number(wd.feeAmount || 0).toFixed(2)} ({wd.feePercentage ?? authoritativeFeePct}%)
                      </span>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-600 dark:text-slate-300 font-mono break-all bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/60">
                    <span className="text-slate-400 select-none mr-1.5 font-sans font-bold">To:</span>
                    {wd.destinationAddress}
                  </div>

                  {wd.txHash && (
                    <div className="flex items-center space-x-2 text-[11px] text-blue-600 dark:text-blue-400 font-mono break-all bg-blue-50/50 dark:bg-blue-950/30 p-2 rounded-lg border border-blue-200/50 dark:border-blue-900/40">
                      <span className="font-sans font-bold select-none text-slate-500">TxHash:</span>
                      <a
                        href={`https://bscscan.com/tx/${wd.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline flex items-center space-x-1"
                      >
                        <span>{wd.txHash}</span>
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      </a>
                    </div>
                  )}

                  <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                    <span>Ref: {wd.reference}</span>
                    <span>{new Date(wd.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
