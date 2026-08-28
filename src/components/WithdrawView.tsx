import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { WithdrawalItem, UserBalanceSummary } from '../types';
import {
  ArrowUpFromLine,
  AlertTriangle,
  Lock,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';

interface WithdrawViewProps {
  onWithdrawalSubmitted: () => void;
}

export const WithdrawView: React.FC<WithdrawViewProps> = ({ onWithdrawalSubmitted }) => {
  const { user } = useAuth();
  const { withdrawalFeePercentage, accountAgeRequirementDays, depositLockPeriodDays } = useSettings();
  const [balance, setBalance] = useState<UserBalanceSummary | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);
  const [amount, setAmount] = useState<string>('100');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastSubmitted, setLastSubmitted] = useState<WithdrawalItem | null>(null);

  const loadData = async () => {
    try {
      const res = await api.getWithdrawals();
      setWithdrawals(res.withdrawals || []);
      setBalance(res.balance);
    } catch (err) {
      console.warn('Failed to load withdrawal data:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const numAmount = parseFloat(amount) || 0;
  // Dynamic fee calculated from database settings
  const feeRate = (withdrawalFeePercentage || 4) / 100;
  const estimatedFee = Number((numAmount * feeRate).toFixed(2));
  const estimatedNet = Math.max(0, Number((numAmount - estimatedFee).toFixed(2)));

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destinationAddress) {
      setErrorMessage('Please enter your destination BEP-20 wallet address.');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your account password to confirm withdrawal.');
      return;
    }

    if (numAmount <= 0) {
      setErrorMessage('Withdrawal amount must be greater than 0.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const idempotencyKey = 'idemp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

    try {
      const res = await api.submitWithdrawal({
        requestedAmount: numAmount,
        destinationAddress: destinationAddress.trim(),
        password,
        twoFactorCode: twoFactorCode.trim() || undefined,
        idempotencyKey,
      });

      if (res.success && res.withdrawal) {
        setSuccessMessage(`Withdrawal request for $${res.withdrawal.requestedAmount.toFixed(2)} USDT submitted successfully! Net to receive: $${res.withdrawal.netAmount.toFixed(2)} USDT after ${res.withdrawal.feePercentage ?? withdrawalFeePercentage}% fee.`);
        setLastSubmitted(res.withdrawal);
        setPassword('');
        setTwoFactorCode('');
        await loadData();
        onWithdrawalSubmitted();
      }
    } catch (err) {
      setErrorMessage((err as Error).message || 'Withdrawal request failed. Please check eligibility conditions.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-24">
      {/* Title */}
      <div>
        <div className="flex items-center space-x-2">
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
            Withdraw USDT
          </h1>
          <span className="px-2.5 py-0.5 text-xs font-bold bg-blue-600 text-white rounded-md shadow-xs">
            BEP-20 (BSC)
          </span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
          Request payout of available funds to your personal BEP-20 wallet.
        </p>
      </div>

      {/* POST-WITHDRAWAL FUND RE-LOCK BANNER */}
      {balance?.isFundLocked && (
        <div className="rounded-3xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 p-6 shadow-md space-y-4">
          <div className="flex items-start space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center flex-shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-amber-950 dark:text-amber-100">
                {depositLockPeriodDays}-Day Fund Lock Active
              </h2>
              <p className="text-xs text-amber-900/90 dark:text-amber-200/90 mt-1 leading-relaxed font-medium">
                Per fund protocol, following a withdrawal request, remaining capital is automatically re-locked for <strong>{depositLockPeriodDays} days</strong>. Daily performance yield continues earning and accumulating uninterrupted.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/60 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Lock Expiration</span>
              <p className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                {balance.fundLockUntil ? new Date(balance.fundLockUntil).toLocaleDateString() : 'N/A'}
              </p>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Time Remaining</span>
              <p className="font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                {balance.fundLockRemainingDays}d {balance.fundLockRemainingHours}h
              </p>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Daily Yield</span>
              <p className="font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                Active & Compounding
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ACCOUNT AGE RESTRICTION BANNER */}
      {balance && !balance.is30DaysOld && (
        <div className="rounded-3xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 p-6 shadow-md space-y-4">
          <div className="flex items-start space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-amber-950 dark:text-amber-100">
                Withdrawal Unavailable — {accountAgeRequirementDays}-Day Account Rule
              </h2>
              <p className="text-xs text-amber-900/90 dark:text-amber-200/90 mt-1 leading-relaxed font-medium">
                Per fund security policy, your account must complete <strong>{accountAgeRequirementDays} full days</strong> before you can request a withdrawal. Backend server time is the authoritative source.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/60 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Account Created</span>
              <p className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
              </p>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Withdrawal Unlocks At</span>
              <p className="font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
                {balance.withdrawalEligibleDate ? new Date(balance.withdrawalEligibleDate).toLocaleString() : `${accountAgeRequirementDays} Days`}
              </p>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Account Age</span>
              <p className="font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                {balance.accountAgeDays} / {accountAgeRequirementDays} Days Completed
              </p>
            </div>
          </div>
        </div>
      )}

      {/* DEPOSIT LOCK BANNER */}
      {balance && balance.lockedBalance > 0 && (
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 space-y-2">
          <div className="flex items-center space-x-2 font-bold text-slate-900 dark:text-white">
            <Lock className="w-4 h-4 text-amber-500" />
            <span>{depositLockPeriodDays}-Day Deposit Lock Period</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Some of your funds (${balance.lockedBalance.toFixed(2)} USDT) are currently subject to the {depositLockPeriodDays}-day deposit lock rule. Only earnings and mature deposits (${balance.eligibleForWithdrawal.toFixed(2)} USDT) are eligible for immediate withdrawal.
          </p>
        </div>
      )}

      {/* Financial Availability Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Total Balance</span>
          <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
            ${(balance?.availableBalance || 0).toFixed(2)} USDT
          </p>
          <span className="text-[11px] text-slate-500">Unreserved Funds</span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Locked Principal</span>
          <p className="text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
            ${(balance?.lockedBalance || 0).toFixed(2)} USDT
          </p>
          <span className="text-[11px] text-slate-500">{depositLockPeriodDays}-Day Lock Period</span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Eligible Withdrawal</span>
          <p className="text-xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">
            ${(balance?.eligibleForWithdrawal || 0).toFixed(2)} USDT
          </p>
          <span className="text-[11px] text-slate-500">Ready for Immediate Payout</span>
        </div>
      </div>

      {/* Withdrawal Form */}
      <div className="rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center space-x-2">
          <ArrowUpFromLine className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span>Submit Payout Request</span>
        </h2>

        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 text-xs flex items-center space-x-2 font-medium">
            <XCircle className="w-4 h-4 flex-shrink-0 text-red-500" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 text-xs flex items-center space-x-2 font-medium">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-blue-500" />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleWithdraw} className="space-y-4 text-xs">
          {/* Amount input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Withdrawal Amount (USDT)
              </label>
              {balance && balance.eligibleForWithdrawal > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(balance.eligibleForWithdrawal.toString())}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-bold cursor-pointer"
                >
                  Max (${balance.eligibleForWithdrawal.toFixed(2)})
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="10"
                max={balance?.eligibleForWithdrawal || 0}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="100"
                className="w-full py-3 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-semibold text-sm focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 transition"
              />
              <span className="absolute right-3.5 top-3 font-bold text-slate-400">USDT</span>
            </div>
          </div>

          {/* Real-time Dynamic Fee Breakdown Card */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span className="font-medium">Withdrawal Amount:</span>
              <span className="font-bold text-slate-900 dark:text-white">
                ${numAmount.toFixed(2)} USDT
              </span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span className="font-medium">Withdrawal Fee ({withdrawalFeePercentage}% Dynamic):</span>
              <span className="font-bold text-amber-600 dark:text-amber-400">-${estimatedFee.toFixed(2)} USDT</span>
            </div>
            <div className="h-px bg-slate-200 dark:bg-slate-800"></div>
            <div className="flex justify-between font-bold text-sm">
              <span className="text-slate-900 dark:text-white">You Will Receive:</span>
              <span className="text-blue-600 dark:text-blue-400 font-extrabold">${estimatedNet.toFixed(2)} USDT</span>
            </div>
          </div>

          {/* BEP-20 Wallet Address */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Your BEP-20 (BNB Smart Chain) Wallet Address
            </label>
            <input
              type="text"
              value={destinationAddress}
              onChange={e => setDestinationAddress(e.target.value)}
              placeholder="0x..."
              className="w-full py-3 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 transition"
            />
          </div>

          {/* Security Confirmation: Password & 2FA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Account Password Confirmation
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter account password"
                className="w-full py-3 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 transition"
              />
            </div>

            {user?.twoFactorEnabled && (
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  6-Digit 2FA Authenticator Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={twoFactorCode}
                  onChange={e => setTwoFactorCode(e.target.value)}
                  placeholder="123456"
                  className="w-full py-3 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs tracking-widest text-center font-mono focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 transition"
                />
              </div>
            )}
          </div>

          {/* Automatic Re-Lock Rule Notice */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-start space-x-2.5 text-xs text-slate-600 dark:text-slate-400">
            <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-900 dark:text-slate-200 font-bold">Automatic {depositLockPeriodDays}-Day Fund Re-Lock Notice:</strong>
              <p className="mt-0.5 text-slate-600 dark:text-slate-400 leading-relaxed">
                Upon submitting this withdrawal, any remaining balance will be automatically re-locked for <strong>{depositLockPeriodDays} days</strong> to protect liquidity stability while continuing to earn daily yield.
              </p>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={
              isSubmitting ||
              balance?.isFundLocked ||
              !balance?.is30DaysOld ||
              (balance?.eligibleForWithdrawal || 0) <= 0 ||
              numAmount <= 0 ||
              numAmount > (balance?.eligibleForWithdrawal || 0) ||
              !destinationAddress ||
              !password
            }
            className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm shadow-lg shadow-blue-500/25 transition flex items-center justify-center space-x-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing Atomic Withdrawal Request...</span>
              </>
            ) : balance?.isFundLocked ? (
              <>
                <Lock className="w-4 h-4" />
                <span>Locked: {depositLockPeriodDays}-Day Post-Withdrawal Re-Lock Active ({balance.fundLockRemainingDays}d {balance.fundLockRemainingHours}h)</span>
              </>
            ) : !balance?.is30DaysOld ? (
              <>
                <Lock className="w-4 h-4" />
                <span>Locked: Account Age &lt; {accountAgeRequirementDays} Days</span>
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

      {/* Withdrawal History */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          Withdrawal Requests History
        </h2>

        {withdrawals.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs">
            No withdrawal requests submitted yet.
          </div>
        ) : (
          <div className="space-y-2">
            {withdrawals.map(wd => (
              <div
                key={wd.id}
                className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-2 text-xs shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-900 dark:text-white text-sm">
                      ${wd.requestedAmount.toFixed(2)} USDT
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        wd.status === 'paid'
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                          : wd.status === 'approved'
                          ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
                          : wd.status === 'rejected'
                          ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {wd.status.toUpperCase()}
                    </span>
                  </div>

                  <span className="font-bold text-blue-600 dark:text-blue-400 text-xs">
                    Net: ${wd.netAmount.toFixed(2)} ({wd.feePercentage ?? withdrawalFeePercentage}% Fee: ${wd.feeAmount.toFixed(2)})
                  </span>
                </div>

                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono break-all">
                  To: {wd.destinationAddress}
                </div>

                {wd.txHash && (
                  <div className="text-[11px] text-blue-600 dark:text-blue-400 font-mono break-all flex items-center space-x-1">
                    <span>Payout Tx: {wd.txHash}</span>
                  </div>
                )}

                <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                  <span>Ref: {wd.reference}</span>
                  <span>{new Date(wd.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Risk Disclaimer */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 space-y-1.5 text-xs">
        <div className="flex items-center space-x-1.5 text-amber-600 dark:text-amber-400 font-semibold text-[11px]">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Withdrawal & Fund Policy Notice</span>
        </div>
        <p className="text-[11px] leading-relaxed">
          <strong>DISCLAIMER:</strong> Withdrawals are processed after compliance checks and smart contract validation. All withdrawals are subject to a dynamic {withdrawalFeePercentage}% fee and require the account to meet the {accountAgeRequirementDays}-day maturity requirement. Return allocations from the managed fund are variable and non-guaranteed. Ensure that your provided destination BEP-20 address is valid and on Binance Smart Chain; transactions to wrong addresses or networks cannot be reversed.
        </p>
      </div>
    </div>
  );
};

