import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { api } from '../services/api';
import { QRCodeSVG } from 'qrcode.react';
import { UserBalanceSummary, WithdrawalEligibilityStatus } from '../types';
import {
  Shield,
  KeyRound,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Check,
  Copy,
  Users,
  ChevronRight,
  Lock,
  Wallet,
} from 'lucide-react';

interface ProfileViewProps {
  onNavigate?: (view: string) => void;
  balance?: UserBalanceSummary | null;
}

export function getProfileWithdrawalEligibility(balance: UserBalanceSummary | null | undefined): {
  status: WithdrawalEligibilityStatus;
  label: string;
} {
  // If backend provided authoritative status and label, use them directly
  if (balance?.withdrawalEligibilityStatus && balance?.withdrawalEligibilityLabel) {
    return {
      status: balance.withdrawalEligibilityStatus,
      label: balance.withdrawalEligibilityLabel,
    };
  }

  // If no balance summary loaded yet
  if (!balance) {
    return {
      status: 'DEPOSIT_REQUIRED',
      label: 'Deposit Required',
    };
  }

  // 1. Server-authoritative withdrawal eligibility says eligible
  if (balance.canWithdraw && (balance.eligibleForWithdrawal ?? 0) > 0) {
    return {
      status: 'ELIGIBLE_FOR_WITHDRAWAL',
      label: 'Eligible for Withdrawal',
    };
  }

  // 2. User has no qualifying deposit
  const totalDeposited = balance.totalDeposited ?? 0;
  const activePrincipal = balance.activeCompoundingPrincipal ?? 0;
  if (totalDeposited <= 0 && activePrincipal <= 0) {
    return {
      status: 'DEPOSIT_REQUIRED',
      label: 'Deposit Required',
    };
  }

  // 3. User has a deposit but it is still locked
  const lockedPrincipal = balance.depositLockedPrincipal ?? 0;
  if (lockedPrincipal > 0 || balance.isFundLocked) {
    return {
      status: 'DEPOSIT_LOCKED',
      label: 'Deposit Locked',
    };
  }

  // 4. Deposit matured but no withdrawable amount
  return {
    status: 'NO_WITHDRAWABLE_FUNDS',
    label: 'No Withdrawable Funds',
  };
}

export const ProfileView: React.FC<ProfileViewProps> = ({ onNavigate, balance }) => {
  const { user, token, isLoading: isAuthLoading, logout, logoutAll, refreshUser } = useAuth();
  const isAuthenticatedUser = Boolean(token && user && user.role === 'user');
  const { minimumDepositAmount, referralRewardL1Percentage, referralRewardL2Percentage } = useSettings();
  const minDeposit = minimumDepositAmount || 300;
  const [dashboardBalance, setDashboardBalance] = useState<UserBalanceSummary | null>(balance || null);
  const [copiedProfileRef, setCopiedProfileRef] = useState(false);

  useEffect(() => {
    if (balance) {
      setDashboardBalance(balance);
    } else if (isAuthenticatedUser && !isAuthLoading) {
      let isMounted = true;
      api.getDashboard()
        .then(res => {
          if (isMounted && res?.balance) {
            setDashboardBalance(res.balance);
          }
        })
        .catch(() => {});
      return () => {
        isMounted = false;
      };
    } else {
      setDashboardBalance(null);
    }
  }, [balance, isAuthenticatedUser, isAuthLoading]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passMessage, setPassMessage] = useState<string | null>(null);
  const [passError, setPassError] = useState<string | null>(null);
  const [isChangingPass, setIsChangingPass] = useState(false);

  // 2FA Setup
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [disable2FACode, setDisable2FACode] = useState('');
  const [secretData, setSecretData] = useState<{ secret: string; otpAuthUrl: string } | null>(null);
  const [twoFactorInputCode, setTwoFactorInputCode] = useState('');
  const [twoFactorMessage, setTwoFactorMessage] = useState<string | null>(null);
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Withdrawal Wallet Address Management
  const [walletAddressInput, setWalletAddressInput] = useState(user?.walletAddress || '');
  const [walletSecurityCode, setWalletSecurityCode] = useState('');
  const [isEditingWallet, setIsEditingWallet] = useState(false);
  const [isUpdatingWallet, setIsUpdatingWallet] = useState(false);
  const [walletMessage, setWalletMessage] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [copiedWallet, setCopiedWallet] = useState(false);

  useEffect(() => {
    if (user?.walletAddress) {
      setWalletAddressInput(user.walletAddress);
    }
  }, [user?.walletAddress]);

  const handleSaveWalletAddress = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setWalletError(null);
    setWalletMessage(null);

    const clean = walletAddressInput.trim();
    if (!clean) {
      setWalletError('Please enter a valid BEP-20 wallet address.');
      return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(clean)) {
      setWalletError('Invalid BEP-20 address format. Must be a 0x-prefixed 40-hex-character BNB Smart Chain address.');
      return;
    }

    if (user?.twoFactorEnabled) {
      if (!walletSecurityCode.trim()) {
        setWalletError('Please enter your 6-digit Authenticator 2FA code to authorize this change.');
        return;
      }
    } else {
      if (!walletSecurityCode) {
        setWalletError('Please enter your account password to authorize this change.');
        return;
      }
    }

    setIsUpdatingWallet(true);
    try {
      const res = await api.updateWalletAddress({
        walletAddress: clean,
        twoFactorCode: user?.twoFactorEnabled ? walletSecurityCode.trim() : undefined,
        password: !user?.twoFactorEnabled ? walletSecurityCode : undefined,
      });

      setWalletMessage(res.message || 'Withdrawal wallet address successfully updated.');
      setWalletSecurityCode('');
      setIsEditingWallet(false);
      await refreshUser();
    } catch (err: any) {
      setWalletError(err?.message || 'Failed to update withdrawal wallet address.');
    } finally {
      setIsUpdatingWallet(false);
    }
  };

  const handleStart2FA = async () => {
    try {
      const res = await api.generate2FA();
      setSecretData(res);
      setShow2FASetup(true);
      setTwoFactorError(null);
      setTwoFactorMessage(null);
    } catch {
      setTwoFactorError('Could not generate 2FA secret.');
    }
  };

  const handleToggle2FA = async (enable: boolean) => {
    try {
      setTwoFactorError(null);
      setTwoFactorMessage(null);
      const codeToSend = enable ? twoFactorInputCode : disable2FACode;
      const res = await api.toggle2FA({
        enable,
        secret: secretData?.secret,
        code: codeToSend,
      });
      if (res.success) {
        setTwoFactorMessage(enable ? '2FA Authenticator enabled successfully!' : '2FA Authenticator disabled.');
        setShow2FASetup(false);
        setShowDisable2FA(false);
        setTwoFactorInputCode('');
        setDisable2FACode('');
        await refreshUser();
      }
    } catch (err) {
      setTwoFactorError((err as Error).message || 'Invalid 2FA code.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      setPassError('New passwords do not match.');
      return;
    }
    setIsChangingPass(true);
    setPassError(null);
    setPassMessage(null);
    try {
      const res = await api.changePassword({
        currentPassword,
        newPassword,
        confirmNewPassword,
      });
      if (res.success) {
        setPassMessage('Password changed successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
      }
    } catch (err) {
      setPassError((err as Error).message || 'Failed to update password.');
    } finally {
      setIsChangingPass(false);
    }
  };

  const copySecret = () => {
    if (secretData?.secret) {
      navigator.clipboard.writeText(secretData.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  const accountCreated = user?.createdAt ? new Date(user.createdAt) : new Date();
  const accountAgeDays = Math.floor((Date.now() - accountCreated.getTime()) / (24 * 60 * 60 * 1000));
  const withdrawalEligibility = getProfileWithdrawalEligibility(dashboardBalance);

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-24 text-xs">
      {/* Title */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
          User Profile & Security
        </h1>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
          Manage your account credentials, 2-factor authentication, and active sessions.
        </p>
      </div>

      {/* Profile Overview Card */}
      <div className="rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <img
            src={user?.profilePictureUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.fullName || 'User'}`}
            alt="Profile Avatar"
            className="w-20 h-20 rounded-2xl object-cover border-2 border-blue-500/40 shadow-lg shadow-blue-500/15"
          />

          <div className="flex-1 text-center sm:text-left space-y-1.5">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {user?.fullName}
              </h2>
              <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {user?.status.toUpperCase()}
              </span>
              <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                {user?.role.toUpperCase()}
              </span>
            </div>

            <p className="text-slate-600 dark:text-slate-400 font-medium">{user?.email}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {user?.phone || 'No phone'} • {user?.country || 'International'}
            </p>
          </div>
        </div>

        {/* Account Metadata Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">Registration Date</span>
            <p className="font-bold text-slate-900 dark:text-white text-sm mt-0.5">
              {accountCreated.toLocaleDateString()}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">Account Age</span>
            <p className="font-bold text-blue-600 dark:text-blue-400 text-sm mt-0.5">
              {accountAgeDays} Completed Days
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">Withdrawal Eligibility</span>
            <p className={`font-bold text-sm mt-0.5 ${
              withdrawalEligibility.status === 'ELIGIBLE_FOR_WITHDRAWAL'
                ? 'text-emerald-600 dark:text-emerald-400'
                : withdrawalEligibility.status === 'DEPOSIT_LOCKED'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-600 dark:text-slate-400'
            }`}>
              {withdrawalEligibility.label}
            </p>
            {withdrawalEligibility.status === 'DEPOSIT_LOCKED' && dashboardBalance?.depositMaturityDate && (
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                Matures {new Date(dashboardBalance.depositMaturityDate).toLocaleDateString()}
                {dashboardBalance.depositLockRemainingDays !== undefined ? ` (${dashboardBalance.depositLockRemainingDays}d)` : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Referral Credentials & Network Shortcut */}
      <div className="rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              Investor Referral Program
            </h2>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            2-TIER REWARDS
          </span>
        </div>

        <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-xs">
          Receive {referralRewardL1Percentage}% Level 1 direct rewards and {referralRewardL2Percentage}% Level 2 indirect rewards when your referred investors make qualifying deposits (≥ {minDeposit} USDT). Referral rewards are non-compounding cash.
        </p>

        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase">My Referral Code</span>
            <p className="text-base font-mono font-black text-slate-900 dark:text-white tracking-wider mt-0.5">
              {user?.referralCode || (user ? 'Referral code pending' : 'Loading...')}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                if (user?.referralCode) {
                  navigator.clipboard.writeText(user.referralCode);
                  setCopiedProfileRef(true);
                  setTimeout(() => setCopiedProfileRef(false), 2000);
                }
              }}
              disabled={!user?.referralCode}
              className={`inline-flex items-center space-x-1 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                !user?.referralCode
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                  : 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
              }`}
            >
              {copiedProfileRef ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedProfileRef ? 'Copied' : 'Copy Code'}</span>
            </button>

            {onNavigate && (
              <button
                onClick={() => onNavigate('referrals')}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition cursor-pointer"
              >
                <span>Referral Dashboard</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Share your referral code with friends. Referral rewards are credited when a referred user makes a qualifying deposit and your account meets the active deposit requirement.
        </p>
      </div>

      {/* Withdrawal Wallet Management (BEP-20) */}
      <div id="profile-withdrawal-wallet" className="rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <Wallet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              Withdrawal Wallet
            </h2>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            BEP-20 (BNB Smart Chain)
          </span>
        </div>

        <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-xs">
          Your registered BEP-20 wallet address for receiving withdrawals, daily yield allocations, and referral rewards. Payouts are dispatched in USDT on BNB Smart Chain.
        </p>

        {/* Success / Error Messages */}
        {walletMessage && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-start space-x-2 text-xs">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="leading-snug">{walletMessage}</span>
          </div>
        )}

        {walletError && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-start space-x-2 text-xs">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="leading-snug">{walletError}</span>
          </div>
        )}

        {/* Current Address Display or Update Form */}
        {!isEditingWallet && user?.walletAddress ? (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">
                Active Destination Address
              </span>
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <Check className="w-3 h-3" />
                <span>Verified BEP-20</span>
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs sm:text-sm font-semibold text-slate-900 dark:text-white break-all select-all">
                  {user.walletAddress}
                </p>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(user.walletAddress || '');
                    setCopiedWallet(true);
                    setTimeout(() => setCopiedWallet(false), 2000);
                  }}
                  className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition cursor-pointer"
                  title="Copy wallet address"
                >
                  {copiedWallet ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedWallet ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setWalletAddressInput(user.walletAddress || '');
                    setWalletSecurityCode('');
                    setWalletError(null);
                    setWalletMessage(null);
                    setIsEditingWallet(true);
                  }}
                  className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition cursor-pointer"
                >
                  <span>Update Address</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSaveWalletAddress} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1.5">
                BEP-20 Wallet Address
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={walletAddressInput}
                  onChange={(e) => setWalletAddressInput(e.target.value)}
                  placeholder="0x..."
                  disabled={isUpdatingWallet}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500"
                />
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                Must be a valid 0x-prefixed 40-hex-character BNB Smart Chain (BSC) address.
              </p>
            </div>

            {/* Security Challenge (2FA or Password) */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase">
                {user?.twoFactorEnabled ? 'Authenticator App Code (2FA)' : 'Current Account Password'}
              </label>
              <input
                type={user?.twoFactorEnabled ? 'text' : 'password'}
                value={walletSecurityCode}
                onChange={(e) => setWalletSecurityCode(e.target.value)}
                placeholder={user?.twoFactorEnabled ? 'Enter 6-digit TOTP code' : 'Enter account password'}
                maxLength={user?.twoFactorEnabled ? 6 : undefined}
                disabled={isUpdatingWallet}
                className={`w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                  user?.twoFactorEnabled ? 'font-mono tracking-widest text-center text-sm' : ''
                }`}
              />
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {user?.twoFactorEnabled
                  ? 'Verification required: Open your Google Authenticator app and enter the current 6-digit code.'
                  : 'Verification required: Enter your current login password to authorize updating your withdrawal address.'}
              </p>
            </div>

            {/* Security Immutability Notice */}
            <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 text-[11px] text-slate-600 dark:text-slate-400 flex items-start space-x-2">
              <Shield className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <span>
                <strong>Immutable Audit Trail:</strong> Updating this address will be applied to future withdrawal requests. Previously submitted, pending, or completed withdrawals remain securely locked to their original destination.
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end space-x-2 pt-1">
              {user?.walletAddress && (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingWallet(false);
                    setWalletAddressInput(user.walletAddress || '');
                    setWalletSecurityCode('');
                    setWalletError(null);
                  }}
                  disabled={isUpdatingWallet}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancel
                </button>
              )}

              <button
                type="submit"
                disabled={isUpdatingWallet}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUpdatingWallet ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Wallet Address</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Authenticator App Security (TOTP) */}
      <div className="rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              Authenticator App
            </h2>
          </div>

          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
              user?.twoFactorEnabled
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
            }`}
          >
            {user?.twoFactorEnabled ? 'Authenticator enabled' : 'Not configured'}
          </span>
        </div>

        <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-xs">
          Protect withdrawals with a 6-digit code from your Authenticator App.
        </p>

        {twoFactorMessage && (
          <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 flex items-center space-x-2 font-medium">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-blue-500" />
            <span>{twoFactorMessage}</span>
          </div>
        )}

        {twoFactorError && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 flex items-center space-x-2 font-medium">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-500" />
            <span>{twoFactorError}</span>
          </div>
        )}

        {!user?.twoFactorEnabled ? (
          <div>
            {!show2FASetup ? (
              <button
                type="button"
                onClick={handleStart2FA}
                className="py-2.5 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold transition shadow-md shadow-blue-500/20 cursor-pointer text-xs"
              >
                Set up Authenticator
              </button>
            ) : (
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
                  <h3 className="font-bold text-slate-900 dark:text-white text-xs">
                    Setup Instructions:
                  </h3>
                  <ol className="list-decimal list-inside text-xs text-slate-600 dark:text-slate-400 mt-1.5 space-y-1">
                    <li>Open Google Authenticator, Microsoft Authenticator, or Authy</li>
                    <li>Scan the QR code below (or enter manual setup key)</li>
                    <li>Enter the 6-digit code below</li>
                    <li>Confirm setup</li>
                  </ol>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-5">
                  <div className="p-3 bg-white rounded-xl shadow-md border border-slate-200">
                    <QRCodeSVG value={secretData?.otpAuthUrl || ''} size={128} />
                  </div>

                  <div className="space-y-3 flex-1 w-full">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Manual Setup Key</span>
                      <div className="flex items-center space-x-2 mt-1">
                        <input
                          type="text"
                          readOnly
                          value={secretData?.secret || ''}
                          className="w-full py-2 px-3 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 font-mono text-xs font-bold text-blue-600 dark:text-blue-400"
                        />
                        <button
                          type="button"
                          onClick={copySecret}
                          className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                          title="Copy setup key"
                        >
                          {copiedSecret ? <Check className="w-4 h-4 text-blue-600" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        6-digit authenticator code:
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={twoFactorInputCode}
                        onChange={e => setTwoFactorInputCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="123456"
                        className="w-full py-2.5 px-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono tracking-widest text-center font-bold text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => handleToggle2FA(true)}
                    disabled={twoFactorInputCode.length !== 6}
                    className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold cursor-pointer text-xs"
                  >
                    Verify & Enable
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShow2FASetup(false);
                      setTwoFactorInputCode('');
                    }}
                    className="py-2.5 px-4 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium cursor-pointer text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 flex items-center space-x-2.5 text-xs text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Authenticator enabled. Withdrawals are protected with mandatory 6-digit TOTP verification.</span>
            </div>

            {!showDisable2FA ? (
              <button
                type="button"
                onClick={() => {
                  setShowDisable2FA(true);
                  setTwoFactorError(null);
                  setTwoFactorMessage(null);
                }}
                className="py-2 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 font-bold transition cursor-pointer text-xs"
              >
                Disable Authenticator
              </button>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 max-w-md">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Enter your current 6-digit Authenticator code to confirm disabling:
                </p>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    maxLength={6}
                    value={disable2FACode}
                    onChange={e => setDisable2FACode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="flex-1 py-2 px-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono tracking-widest text-center font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => handleToggle2FA(false)}
                    disabled={disable2FACode.length !== 6}
                    className="py-2 px-4 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold transition cursor-pointer text-xs"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDisable2FA(false);
                      setDisable2FACode('');
                    }}
                    className="py-2 px-3 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium cursor-pointer text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Change Password */}
      <div className="rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-4">
        <div className="flex items-center space-x-2">
          <KeyRound className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
            Change Password
          </h2>
        </div>

        {passMessage && (
          <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 flex items-center space-x-2 font-medium">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-blue-500" />
            <span>{passMessage}</span>
          </div>
        )}

        {passError && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 flex items-center space-x-2 font-medium">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-500" />
            <span>{passError}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-3.5">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="w-full py-2.5 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 transition"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full py-2.5 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 transition"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmNewPassword}
                onChange={e => setConfirmNewPassword(e.target.value)}
                placeholder="Repeat new password"
                className="w-full py-2.5 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isChangingPass || !currentPassword || !newPassword}
            className="py-3 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white font-bold transition flex items-center space-x-2 cursor-pointer shadow-md shadow-blue-500/20"
          >
            {isChangingPass ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            <span>Update Password</span>
          </button>
        </form>
      </div>

      {/* Session Management & Logout */}
      <div className="rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-3">
        <div className="flex items-center space-x-2">
          <LogOut className="w-5 h-5 text-red-500" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
            Session & Logout
          </h2>
        </div>

        <div className="flex flex-wrap gap-3 pt-1">
          <button
            onClick={logout}
            className="py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold transition flex items-center space-x-2 border border-slate-200 dark:border-slate-700 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout Current Session</span>
          </button>

          <button
            onClick={logoutAll}
            className="py-2.5 px-4 rounded-xl bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/60 font-bold transition flex items-center space-x-2 cursor-pointer"
          >
            <Shield className="w-4 h-4" />
            <span>Logout From All Devices</span>
          </button>
        </div>
      </div>
    </div>
  );
};
