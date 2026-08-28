import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppSettings } from '../types';
import { api } from '../services/api';

interface SettingsContextType {
  settings: AppSettings | null;
  isLoading: boolean;
  error: string | null;
  refreshSettings: () => Promise<void>;
  withdrawalFeePercentage: number;
  accountAgeRequirementDays: number;
  depositLockPeriodDays: number;
  minimumDepositAmount: number;
  loginEnabled: boolean;
  registrationEnabled: boolean;
  maintenanceMode: boolean;
  telegramSupportUrl: string;
  bep20DepositAddress: string;
  usdtContractAddress: string;
}

const defaultSettings: AppSettings = {
  bep20DepositAddress: '0x71C5A8c0B26D19543e49e29547d6e492211C54a9',
  usdtContractAddress: '0x55d398326f99059fF775485246999027B3197955',
  requiredConfirmations: 12,
  minimumDepositAmount: 300,
  withdrawalFeePercentage: 9,
  accountAgeRequirementDays: 30,
  depositLockPeriodDays: 30,
  telegramSupportUrl: 'https://t.me/FINEXJ_OfficialSupport',
  loginEnabled: true,
  registrationEnabled: true,
  maintenanceMode: false,
};

const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings,
  isLoading: false,
  error: null,
  refreshSettings: async () => {},
  withdrawalFeePercentage: 9,
  accountAgeRequirementDays: 30,
  depositLockPeriodDays: 30,
  minimumDepositAmount: 300,
  loginEnabled: true,
  registrationEnabled: true,
  maintenanceMode: false,
  telegramSupportUrl: 'https://t.me/FINEXJ_OfficialSupport',
  bep20DepositAddress: '0x71C5A8c0B26D19543e49e29547d6e492211C54a9',
  usdtContractAddress: '0x55d398326f99059fF775485246999027B3197955',
});

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings | null>(defaultSettings);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSettings = useCallback(async () => {
    try {
      const data = await api.getSettings();
      if (data) {
        setSettings(prev => ({
          ...defaultSettings,
          ...prev,
          ...data,
          withdrawalFeePercentage: Number(data.withdrawalFeePercentage) || 9,
          accountAgeRequirementDays: Number(data.accountAgeRequirementDays) || 30,
          depositLockPeriodDays: Number(data.depositLockPeriodDays) || 30,
          minimumDepositAmount: Number(data.minimumDepositAmount) || 300,
          loginEnabled: data.loginEnabled !== false,
          registrationEnabled: data.registrationEnabled !== false,
          maintenanceMode: Boolean(data.maintenanceMode),
        }));
      }
      setError(null);
    } catch (err: any) {
      console.warn('Failed to load dynamic system settings:', err);
      setError(err?.message || 'Could not fetch settings');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSettings();
    // Poll settings every 15 seconds so admin updates reflect in real-time on user UI
    const interval = setInterval(refreshSettings, 15000);
    return () => clearInterval(interval);
  }, [refreshSettings]);

  const withdrawalFeePercentage = settings?.withdrawalFeePercentage ?? 9;
  const accountAgeRequirementDays = settings?.accountAgeRequirementDays ?? 30;
  const depositLockPeriodDays = settings?.depositLockPeriodDays ?? 30;
  const minimumDepositAmount = settings?.minimumDepositAmount ?? 300;
  const loginEnabled = settings?.loginEnabled !== false;
  const registrationEnabled = settings?.registrationEnabled !== false;
  const maintenanceMode = Boolean(settings?.maintenanceMode);
  const telegramSupportUrl = settings?.telegramSupportUrl || 'https://t.me/FINEXJ_OfficialSupport';
  const bep20DepositAddress = settings?.bep20DepositAddress || '0x71C5A8c0B26D19543e49e29547d6e492211C54a9';
  const usdtContractAddress = settings?.usdtContractAddress || '0x55d398326f99059fF775485246999027B3197955';

  return (
    <SettingsContext.Provider
      value={{
        settings,
        isLoading,
        error,
        refreshSettings,
        withdrawalFeePercentage,
        accountAgeRequirementDays,
        depositLockPeriodDays,
        minimumDepositAmount,
        loginEnabled,
        registrationEnabled,
        maintenanceMode,
        telegramSupportUrl,
        bep20DepositAddress,
        usdtContractAddress,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
