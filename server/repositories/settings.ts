import { getServerSupabase } from '../supabase';
import { AppSettings } from '../types';

export const defaultSettings: AppSettings = {
  bep20DepositAddress: '0x71C5A8c0B26D19543e49e29547d6e492211C54a9',
  usdtContractAddress: '0x55d398326f99059fF775485246999027B3197955',
  requiredConfirmations: 12,
  minimumDepositAmount: 300,
  withdrawalFeePercentage: 4,
  accountAgeRequirementDays: 30,
  depositLockPeriodDays: 30,
  telegramSupportUrl: 'https://t.me/USDTFundOfficialSupport',
  operationalWalletAddress: '0x71C5A8c0B26D19543e49e29547d6e492211C54a9',
  compoundingEnabled: true,
  maintenanceMode: false,
  registrationEnabled: true,
  loginEnabled: true,
  sessionVersion: 1,
  systemLogRetentionDays: 30,
  errorLogRetentionDays: 90,
  notificationRetentionDays: 90,
};

export async function getSettings(): Promise<AppSettings> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.from('system_settings').select('*');

  if (error || !data || data.length === 0) {
    return { ...defaultSettings };
  }

  const merged: any = { ...defaultSettings };
  for (const row of data) {
    try {
      merged[row.key] = JSON.parse(row.value);
    } catch {
      merged[row.key] = row.value;
    }
  }

  // Ensure number types are numbers
  merged.withdrawalFeePercentage = Number(merged.withdrawalFeePercentage) || 4;
  merged.accountAgeRequirementDays = Number(merged.accountAgeRequirementDays) || 30;
  merged.minimumDepositAmount = Number(merged.minimumDepositAmount) || 300;
  merged.depositLockPeriodDays = Number(merged.depositLockPeriodDays) || 30;
  merged.maintenanceMode = Boolean(merged.maintenanceMode === true || merged.maintenanceMode === 'true');
  merged.registrationEnabled = Boolean(merged.registrationEnabled !== false && merged.registrationEnabled !== 'false');
  merged.loginEnabled = Boolean(merged.loginEnabled !== false && merged.loginEnabled !== 'false');

  return merged as AppSettings;
}

export async function updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
  const supabase = getServerSupabase();

  const promises = Object.entries(updates).map(async ([key, val]) => {
    const valueStr = typeof val === 'object' || typeof val === 'boolean' || typeof val === 'number'
      ? JSON.stringify(val)
      : String(val);

    return supabase.from('system_settings').upsert({
      key,
      value: valueStr,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
  });

  await Promise.all(promises);
  return getSettings();
}
