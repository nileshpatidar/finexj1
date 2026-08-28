import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { AppSettings } from '../types';
import {
  Wallet,
  Coins,
  ShieldCheck,
  Percent,
  Calendar,
  Lock,
  Send,
  Save,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Database,
  Copy,
  Check,
} from 'lucide-react';

interface SystemWalletSettingsProps {
  appSettings: AppSettings | null;
  onSettingsUpdated: () => void;
}

export const SystemWalletSettings: React.FC<SystemWalletSettingsProps> = ({
  appSettings,
  onSettingsUpdated,
}) => {
  const [bep20DepositAddress, setBep20DepositAddress] = useState('');
  const [usdtContractAddress, setUsdtContractAddress] = useState('');
  const [minimumDepositAmount, setMinimumDepositAmount] = useState('300');
  const [withdrawalFeePercentage, setWithdrawalFeePercentage] = useState('9');
  const [accountAgeRequirementDays, setAccountAgeRequirementDays] = useState('30');
  const [depositLockPeriodDays, setDepositLockPeriodDays] = useState('30');
  const [telegramSupportUrl, setTelegramSupportUrl] = useState('');
  const [operationalWalletAddress, setOperationalWalletAddress] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (appSettings) {
      setBep20DepositAddress(appSettings.bep20DepositAddress || '');
      setUsdtContractAddress(appSettings.usdtContractAddress || '');
      setMinimumDepositAmount(String(appSettings.minimumDepositAmount ?? 300));
      setWithdrawalFeePercentage(String(appSettings.withdrawalFeePercentage ?? 9));
      setAccountAgeRequirementDays(String(appSettings.accountAgeRequirementDays ?? 30));
      setDepositLockPeriodDays(String(appSettings.depositLockPeriodDays ?? 30));
      setTelegramSupportUrl(appSettings.telegramSupportUrl || '');
      setOperationalWalletAddress(appSettings.operationalWalletAddress || '');
    }
  }, [appSettings]);

  const handleCopy = (text: string, fieldName: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSyncFromDatabase = async () => {
    setIsSyncing(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const freshSettings = await api.getSettings();
      setBep20DepositAddress(freshSettings.bep20DepositAddress || '');
      setUsdtContractAddress(freshSettings.usdtContractAddress || '');
      setMinimumDepositAmount(String(freshSettings.minimumDepositAmount ?? 300));
      setWithdrawalFeePercentage(String(freshSettings.withdrawalFeePercentage ?? 9));
      setAccountAgeRequirementDays(String(freshSettings.accountAgeRequirementDays ?? 30));
      setDepositLockPeriodDays(String(freshSettings.depositLockPeriodDays ?? 30));
      setTelegramSupportUrl(freshSettings.telegramSupportUrl || '');
      setOperationalWalletAddress(freshSettings.operationalWalletAddress || '');
      setSuccessMessage('Successfully refreshed latest settings from Supabase database.');
      onSettingsUpdated();
    } catch (err) {
      setErrorMessage((err as Error).message || 'Failed to fetch settings from database.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    // Validation
    const minDep = parseFloat(minimumDepositAmount);
    if (isNaN(minDep) || minDep <= 0) {
      setErrorMessage('Minimum deposit amount must be a positive number.');
      setIsLoading(false);
      return;
    }

    const feePct = parseFloat(withdrawalFeePercentage);
    if (isNaN(feePct) || feePct < 0 || feePct > 50) {
      setErrorMessage('Withdrawal fee percentage must be between 0% and 50%.');
      setIsLoading(false);
      return;
    }

    try {
      const result = await api.updateAdminSettings({
        bep20DepositAddress: bep20DepositAddress.trim(),
        usdtContractAddress: usdtContractAddress.trim(),
        minimumDepositAmount: minDep,
        withdrawalFeePercentage: feePct,
        accountAgeRequirementDays: parseInt(accountAgeRequirementDays, 10) || 30,
        depositLockPeriodDays: parseInt(depositLockPeriodDays, 10) || 30,
        telegramSupportUrl: telegramSupportUrl.trim(),
        operationalWalletAddress: operationalWalletAddress.trim(),
        reason: 'Super Admin updated System & Wallet database configurations',
      });

      if (result.success) {
        setSuccessMessage('System & Wallet configuration successfully committed to database!');
        onSettingsUpdated();
      } else {
        setErrorMessage('Failed to save settings.');
      }
    } catch (err) {
      setErrorMessage((err as Error).message || 'An error occurred while saving settings to database.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800/80">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Wallet className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                System & Wallet Database Configuration
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Configure fund deposit receiving addresses, smart contract contracts, lock periods, and platform parameters.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
              <Database className="w-3.5 h-3.5" />
              <span>DB Synced</span>
            </div>
            <button
              id="btn-sync-settings-db"
              type="button"
              onClick={handleSyncFromDatabase}
              disabled={isSyncing || isLoading}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-500' : ''}`} />
              Fetch from DB
            </button>
          </div>
        </div>

        {successMessage && (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-3 text-emerald-800 dark:text-emerald-300 text-xs animate-fade-in">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50 flex items-center gap-3 text-rose-800 dark:text-rose-300 text-xs animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* BEP-20 Deposit Address */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-blue-500" />
                  BEP-20 Deposit Receiving Address (BSC)
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(bep20DepositAddress, 'deposit')}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  {copiedField === 'deposit' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  {copiedField === 'deposit' ? 'Copied' : 'Copy'}
                </button>
              </label>
              <input
                id="input-bep20-deposit-address"
                type="text"
                value={bep20DepositAddress}
                onChange={(e) => setBep20DepositAddress(e.target.value)}
                placeholder="0x..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                required
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Official smart vault or deposit address shown to users during manual/on-chain USDT deposits.
              </p>
            </div>

            {/* USDT Contract Address */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  USDT Contract Address (BEP-20 Binance-Peg)
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(usdtContractAddress, 'contract')}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  {copiedField === 'contract' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  {copiedField === 'contract' ? 'Copied' : 'Copy'}
                </button>
              </label>
              <input
                id="input-usdt-contract-address"
                type="text"
                value={usdtContractAddress}
                onChange={(e) => setUsdtContractAddress(e.target.value)}
                placeholder="0x55d398326f99059fF775485246999027B3197955"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                required
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Default BEP-20 USDT token contract on BNB Smart Chain (0x55d398326f99059fF775485246999027B3197955).
              </p>
            </div>

            {/* Operational Wallet Address */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-purple-500" />
                  Operational Vault / Cold Reserve Address
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(operationalWalletAddress, 'operational')}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  {copiedField === 'operational' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  {copiedField === 'operational' ? 'Copied' : 'Copy'}
                </button>
              </label>
              <input
                id="input-operational-wallet-address"
                type="text"
                value={operationalWalletAddress}
                onChange={(e) => setOperationalWalletAddress(e.target.value)}
                placeholder="0x..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Institutional multisig custody or cold storage reserve address for surplus fund liquidity.
              </p>
            </div>

            {/* Telegram Support URL */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-sky-500" />
                Telegram Support URL
              </label>
              <input
                id="input-telegram-support-url"
                type="url"
                value={telegramSupportUrl}
                onChange={(e) => setTelegramSupportUrl(e.target.value)}
                placeholder="https://t.me/FINEXJ_OfficialSupport"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Official Telegram channel or concierge bot link displayed in user support modals.
              </p>
            </div>
          </div>

          {/* Financial & Lock Parameters */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4">
              Financial Policy & Maturity Lock Rules
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Min Deposit */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-amber-500" />
                  Minimum Deposit
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400">$</span>
                  <input
                    id="input-minimum-deposit-amount"
                    type="number"
                    min="1"
                    step="1"
                    value={minimumDepositAmount}
                    onChange={(e) => setMinimumDepositAmount(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                    required
                  />
                  <span className="text-[10px] font-bold text-slate-500">USDT</span>
                </div>
              </div>

              {/* Withdrawal Fee */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <Percent className="w-3.5 h-3.5 text-emerald-500" />
                  Withdrawal Fee
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="input-withdrawal-fee-percentage"
                    type="number"
                    min="0"
                    max="50"
                    step="0.1"
                    value={withdrawalFeePercentage}
                    onChange={(e) => setWithdrawalFeePercentage(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                    required
                  />
                  <span className="text-[10px] font-bold text-slate-500">%</span>
                </div>
              </div>

              {/* Account Age Requirement */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-500" />
                  Account Age Policy
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="input-account-age-days"
                    type="number"
                    min="0"
                    max="365"
                    value={accountAgeRequirementDays}
                    onChange={(e) => setAccountAgeRequirementDays(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                    required
                  />
                  <span className="text-[10px] font-bold text-slate-500">Days</span>
                </div>
              </div>

              {/* Deposit Lock Period */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-rose-500" />
                  Deposit Lock Period
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="input-deposit-lock-days"
                    type="number"
                    min="0"
                    max="365"
                    value={depositLockPeriodDays}
                    onChange={(e) => setDepositLockPeriodDays(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                    required
                  />
                  <span className="text-[10px] font-bold text-slate-500">Days</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/80">
            <button
              id="btn-save-system-settings"
              type="submit"
              disabled={isLoading || isSyncing}
              className="px-6 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition flex items-center gap-2 shadow-lg shadow-blue-600/25 disabled:opacity-50"
            >
              {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save System & Wallet Settings to Database</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
