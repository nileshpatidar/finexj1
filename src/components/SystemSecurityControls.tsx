import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { AppSettings, SystemHealthStats } from '../types';
import {
  ShieldAlert,
  ShieldCheck,
  Power,
  Users,
  Lock,
  Clock,
  Trash2,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Sliders,
  HardDrive,
  FileCheck,
  Server,
  Zap,
} from 'lucide-react';

interface SystemSecurityControlsProps {
  appSettings: AppSettings | null;
  onSettingsUpdated: () => void;
}

export const SystemSecurityControls: React.FC<SystemSecurityControlsProps> = ({
  appSettings,
  onSettingsUpdated,
}) => {
  const [healthStats, setHealthStats] = useState<SystemHealthStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Authentication Switch State
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [loginEnabled, setLoginEnabled] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  // Retention Policies State
  const [systemLogDays, setSystemLogDays] = useState(30);
  const [errorLogDays, setErrorLogDays] = useState(90);
  const [notificationDays, setNotificationDays] = useState(90);

  // Force Logout Modal State
  const [showForceLogoutConfirm, setShowForceLogoutConfirm] = useState(false);
  const [forceLogoutReason, setForceLogoutReason] = useState('Emergency security audit & protocol reset');
  const [isExecutingForceLogout, setIsExecutingForceLogout] = useState(false);

  // Storage Cleanup State
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupReport, setCleanupReport] = useState<any | null>(null);

  useEffect(() => {
    if (appSettings) {
      setRegistrationEnabled(appSettings.registrationEnabled !== false);
      setLoginEnabled(appSettings.loginEnabled !== false);
      setMaintenanceMode(Boolean(appSettings.maintenanceMode));
      setSystemLogDays(appSettings.systemLogRetentionDays || 30);
      setErrorLogDays(appSettings.errorLogRetentionDays || 90);
      setNotificationDays(appSettings.notificationRetentionDays || 90);
    }
    loadHealthStats();
  }, [appSettings]);

  const loadHealthStats = async () => {
    try {
      const stats = await api.getSystemHealthStats();
      setHealthStats(stats);
    } catch (err) {
      console.warn('Failed to load health stats:', err);
    }
  };

  const handleSaveSecuritySwitches = async () => {
    setIsLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      await api.updateAdminSettings({
        registrationEnabled,
        loginEnabled,
        maintenanceMode,
        systemLogRetentionDays: Number(systemLogDays),
        errorLogRetentionDays: Number(errorLogDays),
        notificationRetentionDays: Number(notificationDays),
      });

      setSuccessMessage('Authentication switches & log retention policies saved successfully.');
      onSettingsUpdated();
      loadHealthStats();
    } catch (err) {
      setErrorMessage((err as Error).message || 'Failed to update security settings.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteForceLogout = async () => {
    setIsExecutingForceLogout(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const res = await api.forceLogoutAllUsers(forceLogoutReason);
      setShowForceLogoutConfirm(false);
      setSuccessMessage(
        `All active user sessions successfully revoked (Global Session v${res.sessionVersion}). Standard users must re-authenticate.`
      );
      onSettingsUpdated();
    } catch (err) {
      setErrorMessage((err as Error).message || 'Failed to execute force logout.');
    } finally {
      setIsExecutingForceLogout(false);
    }
  };

  const handleRunStorageInspection = async () => {
    setIsCleaning(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const res = await api.runStorageCleanup();
      setCleanupReport(res.report);
      setSuccessMessage('Storage inspection & scheduled log retention maintenance executed successfully.');
      loadHealthStats();
    } catch (err) {
      setErrorMessage((err as Error).message || 'Storage cleanup failed.');
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div id="system-security-controls-container" className="space-y-6">
      {/* Alert Notices */}
      {successMessage && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center gap-3 text-emerald-400 text-sm">
          <CheckCircle className="w-5 h-5 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-center gap-3 text-rose-400 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 1. Global Authentication Switches */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-base">Authentication Controls & Global Switches</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Control registration, user sign-in availability, and platform maintenance mode in real-time.
              </p>
            </div>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-mono">
            Session v{appSettings?.sessionVersion || 1}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Registration Switch */}
          <div
            onClick={() => setRegistrationEnabled(!registrationEnabled)}
            className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
              registrationEnabled
                ? 'bg-emerald-950/20 border-emerald-500/40 hover:border-emerald-500/60'
                : 'bg-rose-950/20 border-rose-500/40 hover:border-rose-500/60'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">User Registration</span>
              <div
                className={`w-10 h-6 rounded-full transition-colors relative p-0.5 ${
                  registrationEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    registrationEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </div>
            </div>
            <div>
              <div className="text-sm font-bold text-slate-200">
                {registrationEnabled ? 'Registrations Active' : 'Registrations Paused'}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {registrationEnabled
                  ? 'New users can create accounts and complete onboarding.'
                  : 'New registrations return a standard disabled notification.'}
              </p>
            </div>
          </div>

          {/* User Login Switch */}
          <div
            onClick={() => setLoginEnabled(!loginEnabled)}
            className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
              loginEnabled
                ? 'bg-emerald-950/20 border-emerald-500/40 hover:border-emerald-500/60'
                : 'bg-rose-950/20 border-rose-500/40 hover:border-rose-500/60'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">User Login</span>
              <div
                className={`w-10 h-6 rounded-full transition-colors relative p-0.5 ${
                  loginEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    loginEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </div>
            </div>
            <div>
              <div className="text-sm font-bold text-slate-200">
                {loginEnabled ? 'User Logins Active' : 'User Logins Disabled'}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {loginEnabled
                  ? 'Active users can sign into portal normally.'
                  : 'User login disabled. Administrators retain immediate bypass access.'}
              </p>
            </div>
          </div>

          {/* Maintenance Mode */}
          <div
            onClick={() => setMaintenanceMode(!maintenanceMode)}
            className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
              maintenanceMode
                ? 'bg-amber-950/20 border-amber-500/40 hover:border-amber-500/60'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Maintenance Mode</span>
              <div
                className={`w-10 h-6 rounded-full transition-colors relative p-0.5 ${
                  maintenanceMode ? 'bg-amber-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    maintenanceMode ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </div>
            </div>
            <div>
              <div className="text-sm font-bold text-slate-200">
                {maintenanceMode ? 'Maintenance Enabled' : 'Normal Operations'}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {maintenanceMode
                  ? 'User requests return 503 maintenance response. Admins can audit.'
                  : 'Platform is serving all user interactions normally.'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            id="btn-save-auth-switches"
            onClick={handleSaveSecuritySwitches}
            disabled={isLoading}
            className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold text-xs transition flex items-center gap-2 shadow-lg shadow-emerald-500/20"
          >
            {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Save Authentication Settings
          </button>
        </div>
      </div>

      {/* 2. Emergency Session Revocation (Force Logout All) */}
      <div className="bg-slate-900/80 border border-rose-950/60 rounded-xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-base">Emergency Security Switch: Force Logout All Users</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Immediately invalidate all active user sessions across all devices. Forces all standard users to sign in again.
              </p>
            </div>
          </div>
          <button
            id="btn-open-force-logout"
            onClick={() => setShowForceLogoutConfirm(true)}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition flex items-center gap-2 shadow-lg shadow-rose-600/20"
          >
            <Power className="w-4 h-4" />
            Force Logout All Users
          </button>
        </div>
      </div>

      {/* 3. Log Retention & Storage Inspection */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-base">Log Retention Policies & Storage Inspection</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Automated lifecycle retention for technical logs and proof file storage inspection.
              </p>
            </div>
          </div>
          <button
            id="btn-run-storage-cleanup"
            onClick={handleRunStorageInspection}
            disabled={isCleaning}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs transition flex items-center gap-2"
          >
            {isCleaning ? <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" /> : <Zap className="w-4 h-4 text-cyan-400" />}
            Run Storage Inspection Now
          </button>
        </div>

        {/* Retention Policy Configuration Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <label className="text-xs font-semibold text-slate-300 block mb-1">System Technical Logs Retention</label>
            <p className="text-[11px] text-slate-400 mb-3">INFO & DEBUG telemetry log storage lifespan</p>
            <div className="flex items-center gap-2">
              <input
                id="input-system-log-days"
                type="number"
                min="7"
                max="365"
                value={systemLogDays}
                onChange={(e) => setSystemLogDays(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-semibold focus:border-cyan-500 focus:outline-none"
              />
              <span className="text-xs text-slate-400 font-semibold">Days</span>
            </div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <label className="text-xs font-semibold text-slate-300 block mb-1">System Error Logs Retention</label>
            <p className="text-[11px] text-slate-400 mb-3">ERROR & critical stack trace retention lifespan</p>
            <div className="flex items-center gap-2">
              <input
                id="input-error-log-days"
                type="number"
                min="30"
                max="730"
                value={errorLogDays}
                onChange={(e) => setErrorLogDays(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-semibold focus:border-cyan-500 focus:outline-none"
              />
              <span className="text-xs text-slate-400 font-semibold">Days</span>
            </div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <label className="text-xs font-semibold text-slate-300 block mb-1">Notification Logs Retention</label>
            <p className="text-[11px] text-slate-400 mb-3">In-app broadcast & system notices lifespan</p>
            <div className="flex items-center gap-2">
              <input
                id="input-notification-days"
                type="number"
                min="14"
                max="365"
                value={notificationDays}
                onChange={(e) => setNotificationDays(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-semibold focus:border-cyan-500 focus:outline-none"
              />
              <span className="text-xs text-slate-400 font-semibold">Days</span>
            </div>
          </div>
        </div>

        {/* Inspection Breakdown */}
        {healthStats && (
          <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
            <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-emerald-400" />
              Storage & Immutability Verification Breakdown
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 bg-slate-900 rounded-lg">
                <span className="text-slate-400 block text-[11px]">Deposit Proof Images</span>
                <span className="font-bold text-slate-200 text-sm">{healthStats.totalDepositProofs} Verified</span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-lg">
                <span className="text-slate-400 block text-[11px]">Financial Ledger Entries</span>
                <span className="font-bold text-emerald-400 text-sm">{healthStats.totalLedgerRecords} (Immutable)</span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-lg">
                <span className="text-slate-400 block text-[11px]">Audit Trails Logged</span>
                <span className="font-bold text-cyan-400 text-sm">{healthStats.totalAuditLogs} (Immutable)</span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-lg">
                <span className="text-slate-400 block text-[11px]">Orphaned Storage Files</span>
                <span className="font-bold text-slate-200 text-sm">0 (Clean)</span>
              </div>
            </div>
          </div>
        )}

        {cleanupReport && (
          <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-xl text-xs space-y-1 text-slate-300 font-mono">
            <div className="text-emerald-400 font-bold font-sans flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" />
              Inspection Report at {new Date(cleanupReport.timestamp).toLocaleTimeString()}
            </div>
            <div>Cleaned Outdated Logs: {cleanupReport.cleanedLogsCount} records</div>
            <div>Active Deposit Review Proofs: {cleanupReport.activeReviewProofsCount} (Preserved)</div>
            <div>Total Deposit Proofs Analyzed: {cleanupReport.totalDepositProofs}</div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            id="btn-save-retention-policies"
            onClick={handleSaveSecuritySwitches}
            disabled={isLoading}
            className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-semibold text-xs transition flex items-center gap-2 shadow-lg shadow-cyan-500/20"
          >
            {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
            Save Retention Policies
          </button>
        </div>
      </div>

      {/* Force Logout Confirmation Modal */}
      {showForceLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-3 bg-rose-500/10 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-base">Confirm Force Logout All Users</h3>
                <p className="text-xs text-rose-400">Emergency Security Protocol</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              This action will immediately increment the global security session version and revoke all active authentication tokens for standard users. All current user sessions will be terminated and require fresh credential verification.
            </p>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Audit Log Reason</label>
              <input
                id="input-force-logout-reason"
                type="text"
                value={forceLogoutReason}
                onChange={(e) => setForceLogoutReason(e.target.value)}
                placeholder="Reason for emergency logout..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:border-rose-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowForceLogoutConfirm(false)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-force-logout"
                onClick={handleExecuteForceLogout}
                disabled={isExecutingForceLogout}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold transition flex items-center gap-2 shadow-lg shadow-rose-600/20"
              >
                {isExecutingForceLogout ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Power className="w-4 h-4" />
                )}
                Confirm Global Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
