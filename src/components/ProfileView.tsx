import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { QRCodeSVG } from 'qrcode.react';
import {
  User,
  Shield,
  KeyRound,
  QrCode,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2,
  Check,
  Copy,
} from 'lucide-react';

export const ProfileView: React.FC = () => {
  const { user, logout, logoutAll, refreshUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passMessage, setPassMessage] = useState<string | null>(null);
  const [passError, setPassError] = useState<string | null>(null);
  const [isChangingPass, setIsChangingPass] = useState(false);

  // 2FA Setup
  const [show2FASetup, setShow2FASetup] = useState(false);
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
    } catch (err) {
      setTwoFactorError('Could not generate 2FA secret.');
    }
  };

  const handleToggle2FA = async (enable: boolean) => {
    try {
      setTwoFactorError(null);
      setTwoFactorMessage(null);
      const res = await api.toggle2FA({
        enable,
        secret: secretData?.secret,
        code: twoFactorInputCode,
      });
      if (res.success) {
        setTwoFactorMessage(enable ? '2FA Authenticator enabled successfully!' : '2FA Authenticator disabled.');
        setShow2FASetup(false);
        setTwoFactorInputCode('');
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

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-24 text-xs">
      {/* Title */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-100 dark:text-slate-100 text-slate-900">
          User Profile & Security
        </h1>
        <p className="text-xs text-slate-400 dark:text-slate-400 text-slate-500 mt-1">
          Manage your account credentials, 2-factor authentication, and active sessions.
        </p>
      </div>

      {/* Profile Overview Card */}
      <div className="rounded-3xl bg-slate-900/80 dark:bg-slate-900/80 bg-white border border-slate-800 dark:border-slate-800 border-slate-200 p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
          <img
            src={user?.profilePictureUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.fullName || 'User'}`}
            alt="Profile Avatar"
            className="w-20 h-20 rounded-2xl object-cover border-2 border-blue-500/40 shadow-lg shadow-blue-500/10"
          />

          <div className="flex-1 text-center sm:text-left space-y-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="text-lg font-bold text-slate-100 dark:text-slate-100 text-slate-900">
                {user?.fullName}
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                {user?.status.toUpperCase()}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                {user?.role.toUpperCase()}
              </span>
            </div>

            <p className="text-slate-400">{user?.email}</p>
            <p className="text-[11px] text-slate-500">
              {user?.phone || 'No phone'} • {user?.country || 'International'}
            </p>
          </div>
        </div>

        {/* Account Metadata Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-800 dark:border-slate-800 border-slate-200">
          <div className="p-3 rounded-xl bg-slate-950/60 dark:bg-slate-950/60 bg-slate-100 border border-slate-800 dark:border-slate-800 border-slate-200">
            <span className="text-[10px] text-slate-400 uppercase font-bold">Registration Date</span>
            <p className="font-semibold text-slate-200 dark:text-slate-200 text-slate-800 mt-0.5">
              {accountCreated.toLocaleDateString()}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 dark:bg-slate-950/60 bg-slate-100 border border-slate-800 dark:border-slate-800 border-slate-200">
            <span className="text-[10px] text-slate-400 uppercase font-bold">Account Age</span>
            <p className="font-semibold text-emerald-400 mt-0.5">
              {accountAgeDays} Completed Days
            </p>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 dark:bg-slate-950/60 bg-slate-100 border border-slate-800 dark:border-slate-800 border-slate-200">
            <span className="text-[10px] text-slate-400 uppercase font-bold">30-Day Age Policy</span>
            <p className={`font-semibold mt-0.5 ${accountAgeDays >= 30 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {accountAgeDays >= 30 ? 'Eligible for Payout' : 'Maturity Pending'}
            </p>
          </div>
        </div>
      </div>

      {/* 2-Factor Authentication (TOTP) */}
      <div className="rounded-3xl bg-slate-900/80 dark:bg-slate-900/80 bg-white border border-slate-800 dark:border-slate-800 border-slate-200 p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 dark:text-slate-200 text-slate-800">
              Two-Factor Authentication (2FA)
            </h2>
          </div>

          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
              user?.twoFactorEnabled
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {user?.twoFactorEnabled ? 'ENABLED' : 'DISABLED'}
          </span>
        </div>

        <p className="text-slate-400 leading-relaxed text-[11px]">
          Protect your account and withdrawal operations using Google Authenticator, Authy, or standard RFC 6238 TOTP apps.
        </p>

        {twoFactorMessage && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
            <span>{twoFactorMessage}</span>
          </div>
        )}

        {twoFactorError && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
            <span>{twoFactorError}</span>
          </div>
        )}

        {!user?.twoFactorEnabled ? (
          <div>
            {!show2FASetup ? (
              <button
                type="button"
                onClick={handleStart2FA}
                className="py-2 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition"
              >
                Enable 2FA Authenticator
              </button>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
                <p className="font-semibold text-slate-200">
                  Scan this QR code with Google Authenticator or copy the secret key:
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="p-2 bg-white rounded-xl shadow">
                    <QRCodeSVG value={secretData?.otpAuthUrl || ''} size={120} />
                  </div>

                  <div className="space-y-2 flex-1 w-full">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Secret Key</span>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        readOnly
                        value={secretData?.secret || ''}
                        className="w-full py-1.5 px-3 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs text-amber-400"
                      />
                      <button
                        onClick={copySecret}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        {copiedSecret ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mt-2 mb-1">
                        Enter 6-digit Code to Confirm:
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={twoFactorInputCode}
                        onChange={e => setTwoFactorInputCode(e.target.value)}
                        placeholder="123456"
                        className="w-full py-2 px-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 font-mono tracking-widest text-center"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex space-x-2 pt-2">
                  <button
                    onClick={() => handleToggle2FA(true)}
                    disabled={twoFactorInputCode.length !== 6}
                    className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold"
                  >
                    Verify & Activate 2FA
                  </button>
                  <button
                    onClick={() => setShow2FASetup(false)}
                    className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => handleToggle2FA(false)}
            className="py-2 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-bold transition"
          >
            Disable 2FA Authenticator
          </button>
        )}
      </div>

      {/* Change Password */}
      <div className="rounded-3xl bg-slate-900/80 dark:bg-slate-900/80 bg-white border border-slate-800 dark:border-slate-800 border-slate-200 p-6 shadow-xl space-y-4">
        <div className="flex items-center space-x-2">
          <KeyRound className="w-5 h-5 text-emerald-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 dark:text-slate-200 text-slate-800">
            Change Password
          </h2>
        </div>

        {passMessage && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
            <span>{passMessage}</span>
          </div>
        )}

        {passError && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
            <span>{passError}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="block font-semibold text-slate-300 dark:text-slate-300 text-slate-700 mb-1">
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="w-full py-2 px-3 rounded-xl bg-slate-950 dark:bg-slate-950 bg-slate-100 border border-slate-800 dark:border-slate-800 border-slate-300 text-slate-100 dark:text-slate-100 text-slate-900 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-300 dark:text-slate-300 text-slate-700 mb-1">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full py-2 px-3 rounded-xl bg-slate-950 dark:bg-slate-950 bg-slate-100 border border-slate-800 dark:border-slate-800 border-slate-300 text-slate-100 dark:text-slate-100 text-slate-900 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 dark:text-slate-300 text-slate-700 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmNewPassword}
                onChange={e => setConfirmNewPassword(e.target.value)}
                placeholder="Repeat new password"
                className="w-full py-2 px-3 rounded-xl bg-slate-950 dark:bg-slate-950 bg-slate-100 border border-slate-800 dark:border-slate-800 border-slate-300 text-slate-100 dark:text-slate-100 text-slate-900 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isChangingPass || !currentPassword || !newPassword}
            className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 font-bold transition flex items-center space-x-2"
          >
            {isChangingPass ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            <span>Update Password</span>
          </button>
        </form>
      </div>

      {/* Session Management & Logout */}
      <div className="rounded-3xl bg-slate-900/80 dark:bg-slate-900/80 bg-white border border-slate-800 dark:border-slate-800 border-slate-200 p-6 shadow-xl space-y-3">
        <div className="flex items-center space-x-2">
          <LogOut className="w-5 h-5 text-red-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 dark:text-slate-200 text-slate-800">
            Session & Logout
          </h2>
        </div>

        <div className="flex flex-wrap gap-3 pt-1">
          <button
            onClick={logout}
            className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition flex items-center space-x-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout Current Session</span>
          </button>

          <button
            onClick={logoutAll}
            className="py-2 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-bold transition flex items-center space-x-2"
          >
            <Shield className="w-4 h-4" />
            <span>Logout From All Devices</span>
          </button>
        </div>
      </div>
    </div>
  );
};
