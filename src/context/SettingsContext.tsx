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

const SettingsContext = createContext<SettingsContextType>({
  settings: null,
  isLoading: true,
  error: null,
  refreshSettings: async () => {},
  withdrawalFeePercentage: 0,
  accountAgeRequirementDays: 30,
  depositLockPeriodDays: 30,
  minimumDepositAmount: 0,
  loginEnabled: true,
  registrationEnabled: true,
  maintenanceMode: false,
  telegramSupportUrl: 'https://t.me/FINEXJ_OfficialSupport',
  bep20DepositAddress: '',
  usdtContractAddress: '',
});

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSettings = useCallback(async () => {
    try {
      const data = await api.getSettings();
      if (data && typeof data.withdrawalFeePercentage === 'number' && !isNaN(data.withdrawalFeePercentage)) {
        setSettings(data);
        setError(null);
      } else if (data) {
        setSettings(data);
        setError(null);
      } else {
        setError('Financial configuration is temporarily unavailable.');
      }
    } catch (err: any) {
      console.warn('Failed to load authoritative system settings from backend:', err);
      setError(err?.message || 'Financial configuration is temporarily unavailable. Please try again later.');
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

  const withdrawalFeePercentage = settings?.withdrawalFeePercentage ?? 0;
  const accountAgeRequirementDays = settings?.accountAgeRequirementDays ?? 30;
  const depositLockPeriodDays = settings?.depositLockPeriodDays ?? 30;
  const minimumDepositAmount = settings?.minimumDepositAmount ?? 0;
  const loginEnabled = settings ? settings.loginEnabled !== false : true;
  const registrationEnabled = settings ? settings.registrationEnabled !== false : true;
  const maintenanceMode = Boolean(settings?.maintenanceMode);
  const telegramSupportUrl = settings?.telegramSupportUrl || 'https://t.me/FINEXJ_OfficialSupport';
  const bep20DepositAddress = settings?.bep20DepositAddress || '';
  const usdtContractAddress = settings?.usdtContractAddress || '';

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

