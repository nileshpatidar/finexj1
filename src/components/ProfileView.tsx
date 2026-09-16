import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { api } from '../services/api';
import { QRCodeSVG } from 'qrcode.react';
import { UserBalanceSummary } from '../types';
import { FundLockModal } from './FundLockModal';
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
  Unlock,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface ProfileViewProps {
  onNavigate?: (view: string) => void;
  balance?: UserBalanceSummary | null;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ onNavigate, balance }) => {
  const { user, token, isLoading: isAuthLoading, logout, logoutAll, refreshUser } = useAuth();
  const isAuthenticatedUser = Boolean(token && user && user.role === 'user');
  const { minimumDepositAmount, referralRewardL1Percentage, referralRewardL2Percentage } = useSettings();
  const minDeposit = minimumDepositAmount || 300;
  const [dashboardBalance, setDashboardBalance] = useState<UserBalanceSummary | null>(balance || null);
  const [isFundLockModalOpen, setIsFundLockModalOpen] = useState(false);
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

  const isFundLocked = Boolean(dashboardBalance?.isFundLocked);
  const isAccountMatured = Boolean(dashboardBalance?.is30DaysOld ?? (accountAgeDays >= 30));
  const isAccountLocked = isFundLocked || !isAccountMatured;
  const accountAgeRequirementDays = 30;

  let lockStatusLabel = 'UNLOCKED';
  let lockStatusBadgeClass = 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60';
  let unlockDateDisplay = 'Fully Matured (Eligible for Standard Withdrawals)';

  if (isFundLocked) {
    lockStatusLabel = 'LOCKED (Fund Lock Active)';
    lockStatusBadgeClass = 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700/60';
    unlockDateDisplay = dashboardBalance?.fundLockUntil
      ? `${new Date(dashboardBalance.fundLockUntil).toLocaleDateString()} (${dashboardBalance.fundLockRemainingDays}d ${dashboardBalance.fundLockRemainingHours}h remaining)`
      : 'Active Principal Lock Period';
  } else if (!isAccountMatured) {
    lockStatusLabel = `LOCKED (${accountAgeRequirementDays}d Age Requirement)`;
    lockStatusBadgeClass = 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60';
    unlockDateDisplay = dashboardBalance?.withdrawalEligibleDate
      ? `${new Date(dashboardBalance.withdrawalEligibleDate).toLocaleDateString()} (${dashboardBalance.accountAgeDays ?? accountAgeDays}d / ${accountAgeRequirementDays}d completed)`
      : `${accountAgeRequirementDays} Days from Registration`;
  }

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
            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">30-Day Age Policy</span>
            <p className={`font-bold text-sm mt-0.5 ${accountAgeDays >= 30 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {accountAgeDays >= 30 ? 'Eligible for Payout' : 'Maturity Pending'}
            </p>
          </div>
        </div>
      </div>

      {/* Liquidity & Maturity Governance Card (Moved from Home for Clean Accounting View) */}
      <div
        id="profile-lock-status-card"
        className={`rounded-3xl border p-6 sm:p-7 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-4 ${
          isAccountLocked
            ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700/60'
            : 'bg-white dark:bg-[#0F172A] border-slate-200 dark:border-slate-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start space-x-3">
            <div
              className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 font-bold ${
                isAccountLocked
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                  : 'bg-blue-500/20 text-blue-700 dark:text-blue-300'
              }`}
            >
              {isAccountLocked ? <Lock className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Liquidity & Maturity Governance</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${lockStatusBadgeClass}`}
                >
                  {isAccountLocked ? 'Locked' : 'Unlocked'}
                </span>
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                {isFundLocked
                  ? 'Deposit or voluntary fund lock is currently active on your principal to protect portfolio liquidity.'
                  : !isAccountMatured
                  ? `Your account is ${dashboardBalance?.accountAgeDays ?? accountAgeDays} days old. Institutional rules require ${accountAgeRequirementDays} full days before principal withdrawals unlock.`
                  : 'Account age requirement completed. Normal principal and yield withdrawal requests are fully unlocked.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsFundLockModalOpen(true)}
            className="px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition flex-shrink-0 cursor-pointer shadow-xs self-start sm:self-auto"
          >
            Policy Details
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Lock State</span>
            <p className={`font-bold mt-0.5 ${isAccountLocked ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`}>
              {lockStatusLabel}
            </p>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Unlock Schedule</span>
            <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
              {unlockDateDisplay}
            </p>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Governance Policy</span>
            <p className="font-bold text-blue-600 dark:text-blue-400 mt-0.5 flex items-center space-x-1">
              <Zap className="w-3 h-3" />
              <span>Standard BEP-20 Rules</span>
            </p>
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

        {!user?.referralCode ? (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-bold text-xs">
                <Lock className="w-3.5 h-3.5" />
                <span>Refer & Earn is Locked</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Maintain at least {minDeposit} USDT in eligible funds in your account to unlock your referral code.
              </p>
            </div>
            {onNavigate && (
              <button
                onClick={() => onNavigate('deposit')}
                className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition cursor-pointer self-start sm:self-auto"
              >
                <span>Deposit to Unlock</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase">My Referral Code</span>
              <p className="text-base font-mono font-black text-slate-900 dark:text-white tracking-wider mt-0.5">
                {user.referralCode}
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(user.referralCode!);
                  setCopiedProfileRef(true);
                  setTimeout(() => setCopiedProfileRef(false), 2000);
                }}
                className="inline-flex items-center space-x-1 px-3 py-2 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition cursor-pointer"
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
        )}
      </div>

      {/* 2-Factor Authentication (TOTP) */}
      <div className="rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              Two-Factor Authentication (2FA)
            </h2>
          </div>

          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
              user?.twoFactorEnabled
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
            }`}
          >
            {user?.twoFactorEnabled ? 'ENABLED' : 'DISABLED'}
          </span>
        </div>

        <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-xs">
          Protect your account and withdrawal operations using Google Authenticator, Authy, or standard RFC 6238 TOTP apps.
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
                className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold transition shadow-md shadow-blue-500/20 cursor-pointer"
              >
                Enable 2FA Authenticator
              </button>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
                <p className="font-semibold text-slate-900 dark:text-white">
                  Scan this QR code with Google Authenticator or copy the secret key:
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="p-2.5 bg-white rounded-xl shadow-md border border-slate-200">
                    <QRCodeSVG value={secretData?.otpAuthUrl || ''} size={120} />
                  </div>

                  <div className="space-y-2 flex-1 w-full">
                    <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Secret Key</span>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        readOnly
                        value={secretData?.secret || ''}
                        className="w-full py-2 px-3 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 font-mono text-xs font-bold text-blue-600 dark:text-blue-400"
                      />
                      <button
                        onClick={copySecret}
                        className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                      >
                        {copiedSecret ? <Check className="w-4 h-4 text-blue-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mt-2 mb-1">
                        Enter 6-digit Code to Confirm:
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={twoFactorInputCode}
                        onChange={e => setTwoFactorInputCode(e.target.value)}
                        placeholder="123456"
                        className="w-full py-2 px-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono tracking-widest text-center font-bold"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex space-x-2 pt-2">
                  <button
                    onClick={() => handleToggle2FA(true)}
                    disabled={twoFactorInputCode.length !== 6}
                    className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold cursor-pointer"
                  >
                    Verify & Activate 2FA
                  </button>
                  <button
                    onClick={() => setShow2FASetup(false)}
                    className="py-2.5 px-4 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            {!showDisable2FA ? (
              <button
                type="button"
                onClick={() => {
                  setShowDisable2FA(true);
                  setTwoFactorError(null);
                  setTwoFactorMessage(null);
                }}
                className="py-2 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 font-bold transition cursor-pointer"
              >
                Disable 2FA Authenticator
              </button>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 max-w-md">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Enter your 6-digit Authenticator code to confirm disabling 2FA:
                </p>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    maxLength={6}
                    value={disable2FACode}
                    onChange={e => setDisable2FACode(e.target.value)}
                    placeholder="123456"
                    className="flex-1 py-2 px-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono tracking-widest text-center font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => handleToggle2FA(false)}
                    disabled={disable2FACode.length !== 6}
                    className="py-2 px-4 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold transition cursor-pointer"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDisable2FA(false);
                      setDisable2FACode('');
                    }}
                    className="py-2 px-3 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
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

      {/* 30-Day Fund Lock & Yield Governance Policy Modal */}
      <FundLockModal
        isOpen={isFundLockModalOpen}
        onClose={() => setIsFundLockModalOpen(false)}
        balance={dashboardBalance}
      />
    </div>
  );
};
