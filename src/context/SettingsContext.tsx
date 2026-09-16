import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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
  referralRewardL1Percentage: number;
  referralRewardL2Percentage: number;
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
  referralRewardL1Percentage: 5,
  referralRewardL2Percentage: 2,
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
  const lastReqIdRef = useRef(0);
  const lastFetchedTimeRef = useRef(0);

  const refreshSettings = useCallback(async () => {
    const reqId = ++lastReqIdRef.current;
    try {
      const data = await api.getSettings();
      // Guard against race conditions where an older response overwrites a newer response
      if (reqId === lastReqIdRef.current) {
        if (data && typeof data.withdrawalFeePercentage === 'number' && !isNaN(data.withdrawalFeePercentage)) {
          setSettings(data);
          setError(null);
        } else if (data) {
          setSettings(data);
          setError(null);
        } else {
          setError('Financial configuration is temporarily unavailable.');
        }
        lastFetchedTimeRef.current = Date.now();
      }
    } catch (err: any) {
      if (reqId === lastReqIdRef.current) {
        console.warn('Failed to load authoritative system settings from backend:', err);
        setError(err?.message || 'Financial configuration is temporarily unavailable. Please try again later.');
      }
    } finally {
      if (reqId === lastReqIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refreshSettings();

    // Revalidate on tab focus/visibility change if settings are older than 30 seconds
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetchedTimeRef.current > 30000) {
        refreshSettings();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Conservative background polling interval (60s instead of 15s, 75% traffic reduction)
    // Ensures admin adjustments reliably propagate to active user sessions
    const interval = setInterval(refreshSettings, 60000);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshSettings]);

  const withdrawalFeePercentage = settings?.withdrawalFeePercentage ?? 0;
  const accountAgeRequirementDays = settings?.accountAgeRequirementDays ?? 30;
  const depositLockPeriodDays = settings?.depositLockPeriodDays ?? 30;
  const minimumDepositAmount = settings?.minimumDepositAmount ?? 0;
  const referralRewardL1Percentage = settings?.referralRewardL1Percentage ?? 5;
  const referralRewardL2Percentage = settings?.referralRewardL2Percentage ?? 2;
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
        referralRewardL1Percentage,
        referralRewardL2Percentage,
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

