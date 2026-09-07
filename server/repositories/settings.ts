import { getServerSupabase, isServerSupabaseReady } from '../supabase';
import { AppSettings } from '../types';
import { config } from '../config';
import { logger } from '../logger';

export class ConfigurationError extends Error {
  public readonly isConfigurationError = true;
  public readonly safeUserMessage: string;

  constructor(
    message: string,
    safeUserMessage = 'Financial configuration is temporarily unavailable. Please try again later.'
  ) {
    super(message);
    this.name = 'ConfigurationError';
    this.safeUserMessage = safeUserMessage;
  }
}

/**
 * Development-only default settings for isolated local unit tests.
 * NEVER used as an authoritative production fallback.
 */
export const developmentDefaultSettings: Readonly<AppSettings> = Object.freeze({
  bep20DepositAddress: '0x71C5A8c0B26D19543e49e29547d6e492211C54a9',
  usdtContractAddress: '0x55d398326f99059fF775485246999027B3197955',
  requiredConfirmations: 12,
  minimumDepositAmount: 300,
  withdrawalFeePercentage: 9,
  companyReferralCode: 'FINEXJ',
  referralRewardL1Percentage: 5,
  referralRewardL2Percentage: 2,
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
});

// Deprecated export for backwards compatibility in non-production type contexts only
export const defaultSettings: AppSettings = { ...developmentDefaultSettings };

const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * Validates system settings against strict business & cryptographic rules.
 * Fails if any financial rule is violated.
 */
export function validateSystemSettings(
  raw: Record<string, any>,
  options: { allowPartial?: boolean } = {}
): { valid: boolean; errors: string[]; validatedSettings?: Partial<AppSettings> } {
  const errors: string[] = [];
  const validated: Partial<AppSettings> = {};

  // 1. withdrawalFeePercentage (0% to 99.99%)
  if (raw.withdrawalFeePercentage !== undefined && raw.withdrawalFeePercentage !== null && raw.withdrawalFeePercentage !== '') {
    const val = Number(raw.withdrawalFeePercentage);
    if (!Number.isFinite(val) || isNaN(val) || val < 0 || val >= 100) {
      errors.push(`withdrawalFeePercentage must be a finite number between 0 and 100 (exclusive). Received: ${raw.withdrawalFeePercentage}`);
    } else {
      validated.withdrawalFeePercentage = val;
    }
  } else if (!options.allowPartial) {
    errors.push('withdrawalFeePercentage is required in system_settings.');
  }

  // 2. minimumDepositAmount (> 0)
  if (raw.minimumDepositAmount !== undefined && raw.minimumDepositAmount !== null && raw.minimumDepositAmount !== '') {
    const val = Number(raw.minimumDepositAmount);
    if (!Number.isFinite(val) || isNaN(val) || val <= 0) {
      errors.push(`minimumDepositAmount must be a finite number greater than 0. Received: ${raw.minimumDepositAmount}`);
    } else {
      validated.minimumDepositAmount = val;
    }
  } else if (!options.allowPartial) {
    errors.push('minimumDepositAmount is required in system_settings.');
  }

  // 3. referralRewardL1Percentage (0% to 100%)
  if (raw.referralRewardL1Percentage !== undefined && raw.referralRewardL1Percentage !== null && raw.referralRewardL1Percentage !== '') {
    const val = Number(raw.referralRewardL1Percentage);
    if (!Number.isFinite(val) || isNaN(val) || val < 0 || val > 100) {
      errors.push(`referralRewardL1Percentage must be between 0 and 100. Received: ${raw.referralRewardL1Percentage}`);
    } else {
      validated.referralRewardL1Percentage = val;
    }
  } else if (!options.allowPartial) {
    errors.push('referralRewardL1Percentage is required in system_settings.');
  }

  // 4. referralRewardL2Percentage (0% to 100%)
  if (raw.referralRewardL2Percentage !== undefined && raw.referralRewardL2Percentage !== null && raw.referralRewardL2Percentage !== '') {
    const val = Number(raw.referralRewardL2Percentage);
    if (!Number.isFinite(val) || isNaN(val) || val < 0 || val > 100) {
      errors.push(`referralRewardL2Percentage must be between 0 and 100. Received: ${raw.referralRewardL2Percentage}`);
    } else {
      validated.referralRewardL2Percentage = val;
    }
  } else if (!options.allowPartial) {
    errors.push('referralRewardL2Percentage is required in system_settings.');
  }

  // 5. accountAgeRequirementDays (>= 0)
  if (raw.accountAgeRequirementDays !== undefined && raw.accountAgeRequirementDays !== null && raw.accountAgeRequirementDays !== '') {
    const val = Number(raw.accountAgeRequirementDays);
    if (!Number.isFinite(val) || isNaN(val) || val < 0) {
      errors.push(`accountAgeRequirementDays must be >= 0. Received: ${raw.accountAgeRequirementDays}`);
    } else {
      validated.accountAgeRequirementDays = Math.floor(val);
    }
  } else if (!options.allowPartial) {
    errors.push('accountAgeRequirementDays is required in system_settings.');
  }

  // 6. depositLockPeriodDays (>= 0)
  if (raw.depositLockPeriodDays !== undefined && raw.depositLockPeriodDays !== null && raw.depositLockPeriodDays !== '') {
    const val = Number(raw.depositLockPeriodDays);
    if (!Number.isFinite(val) || isNaN(val) || val < 0) {
      errors.push(`depositLockPeriodDays must be >= 0. Received: ${raw.depositLockPeriodDays}`);
    } else {
      validated.depositLockPeriodDays = Math.floor(val);
    }
  } else if (!options.allowPartial) {
    errors.push('depositLockPeriodDays is required in system_settings.');
  }

  // 7. requiredConfirmations (>= 1 integer)
  if (raw.requiredConfirmations !== undefined && raw.requiredConfirmations !== null && raw.requiredConfirmations !== '') {
    const val = Number(raw.requiredConfirmations);
    if (!Number.isFinite(val) || isNaN(val) || !Number.isInteger(val) || val < 1) {
      errors.push(`requiredConfirmations must be an integer >= 1. Received: ${raw.requiredConfirmations}`);
    } else {
      validated.requiredConfirmations = val;
    }
  } else if (!options.allowPartial) {
    errors.push('requiredConfirmations is required in system_settings.');
  }

  // 8. companyReferralCode (non-empty string)
  if (raw.companyReferralCode !== undefined && raw.companyReferralCode !== null) {
    const code = String(raw.companyReferralCode).trim().toUpperCase();
    if (code.length < 2 || code.length > 32 || !/^[A-Z0-9_-]+$/.test(code)) {
      errors.push(`companyReferralCode must be alphanumeric between 2 and 32 characters. Received: ${raw.companyReferralCode}`);
    } else {
      validated.companyReferralCode = code;
    }
  } else if (!options.allowPartial) {
    errors.push('companyReferralCode is required in system_settings.');
  }

  // 9. bep20DepositAddress (valid EVM/BEP-20 address)
  if (raw.bep20DepositAddress !== undefined && raw.bep20DepositAddress !== null) {
    const addr = String(raw.bep20DepositAddress).trim();
    if (!EVM_ADDRESS_REGEX.test(addr)) {
      errors.push(`bep20DepositAddress must be a valid 42-character hex address starting with 0x. Received: ${addr}`);
    } else {
      validated.bep20DepositAddress = addr;
    }
  } else if (!options.allowPartial) {
    errors.push('bep20DepositAddress is required in system_settings.');
  }

  // 10. usdtContractAddress (valid EVM/BEP-20 address)
  if (raw.usdtContractAddress !== undefined && raw.usdtContractAddress !== null) {
    const addr = String(raw.usdtContractAddress).trim();
    if (!EVM_ADDRESS_REGEX.test(addr)) {
      errors.push(`usdtContractAddress must be a valid 42-character hex address starting with 0x. Received: ${addr}`);
    } else {
      validated.usdtContractAddress = addr;
    }
  } else if (!options.allowPartial) {
    errors.push('usdtContractAddress is required in system_settings.');
  }

  // 11. operationalWalletAddress (valid EVM/BEP-20 address)
  if (raw.operationalWalletAddress !== undefined && raw.operationalWalletAddress !== null) {
    const addr = String(raw.operationalWalletAddress).trim();
    if (!EVM_ADDRESS_REGEX.test(addr)) {
      errors.push(`operationalWalletAddress must be a valid 42-character hex address starting with 0x. Received: ${addr}`);
    } else {
      validated.operationalWalletAddress = addr;
    }
  } else if (!options.allowPartial) {
    validated.operationalWalletAddress = validated.bep20DepositAddress;
  }

  // 12. telegramSupportUrl
  if (raw.telegramSupportUrl !== undefined && raw.telegramSupportUrl !== null) {
    validated.telegramSupportUrl = String(raw.telegramSupportUrl).trim();
  } else if (!options.allowPartial) {
    validated.telegramSupportUrl = 'https://t.me/FINEXJ_OfficialSupport';
  }

  // 13. System flags (booleans)
  validated.compoundingEnabled = Boolean(raw.compoundingEnabled === true || raw.compoundingEnabled === 'true');
  validated.maintenanceMode = Boolean(raw.maintenanceMode === true || raw.maintenanceMode === 'true');
  validated.registrationEnabled = Boolean(raw.registrationEnabled !== false && raw.registrationEnabled !== 'false');
  validated.loginEnabled = Boolean(raw.loginEnabled !== false && raw.loginEnabled !== 'false');
  validated.sessionVersion = Number(raw.sessionVersion) || 1;
  validated.systemLogRetentionDays = Number(raw.systemLogRetentionDays) || 30;
  validated.errorLogRetentionDays = Number(raw.errorLogRetentionDays) || 90;
  validated.notificationRetentionDays = Number(raw.notificationRetentionDays) || 90;

  return {
    valid: errors.length === 0,
    errors,
    validatedSettings: validated,
  };
}

// In-memory cache with short TTL (10s) to prevent hammering Supabase while keeping data fresh
let cachedSettings: AppSettings | null = null;
let cacheExpiryTimestamp = 0;
const CACHE_TTL_MS = 10_000;

export function invalidateSettingsCache(): void {
  cachedSettings = null;
  cacheExpiryTimestamp = 0;
}

/**
 * Retrieves authoritative system settings from Supabase system_settings table.
 * Strictly verifies and validates all database values.
 * Fails closed if database values are missing or invalid.
 */
export async function getSettings(): Promise<AppSettings> {
  const now = Date.now();
  if (cachedSettings && now < cacheExpiryTimestamp) {
    return cachedSettings;
  }

  const isDevFallbackAllowed =
    !config.isProduction &&
    (process.env.NODE_ENV === 'test' || process.env.ALLOW_DEV_CONFIG_FALLBACK === 'true');

  if (!isServerSupabaseReady()) {
    if (isDevFallbackAllowed) {
      logger.warn('DEV_CONFIG_FALLBACK', 'Supabase not ready in test/dev environment, using development default settings.');
      return { ...developmentDefaultSettings };
    }
    logger.error('CONFIG_AUTHORITY_ERROR', 'Supabase database is unavailable. Cannot load authoritative system settings.');
    throw new ConfigurationError('Supabase database is unavailable. System configuration cannot be loaded.');
  }

  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase.from('system_settings').select('*');

    if (error) {
      logger.error('CONFIG_AUTHORITY_QUERY_ERROR', `Failed to query system_settings: ${error.message}`);
      if (isDevFallbackAllowed) {
        return { ...developmentDefaultSettings };
      }
      throw new ConfigurationError(`Database error loading system settings: ${error.message}`);
    }

    if (!data || data.length === 0) {
      logger.error('CONFIG_AUTHORITY_EMPTY', 'system_settings table is empty in Supabase.');
      if (isDevFallbackAllowed) {
        return { ...developmentDefaultSettings };
      }
      throw new ConfigurationError('System settings table is empty. Authoritative configuration is missing.');
    }

    const rawMap: Record<string, any> = {};
    for (const row of data) {
      try {
        rawMap[row.key] = JSON.parse(row.value);
      } catch {
        rawMap[row.key] = row.value;
      }
    }

    const validation = validateSystemSettings(rawMap);
    if (!validation.valid || !validation.validatedSettings) {
      const errorSummary = validation.errors.join('; ');
      logger.error('CONFIG_AUTHORITY_VALIDATION_FAILURE', `System settings failed validation: ${errorSummary}`, {
        metadata: { errors: validation.errors },
      });

      if (isDevFallbackAllowed) {
        logger.warn('DEV_CONFIG_FALLBACK', `Validation failed (${errorSummary}), using development defaults in test mode.`);
        return { ...developmentDefaultSettings };
      }

      throw new ConfigurationError(`System configuration validation failed: ${errorSummary}`);
    }

    const authoritative = validation.validatedSettings as AppSettings;
    cachedSettings = authoritative;
    cacheExpiryTimestamp = now + CACHE_TTL_MS;

    return authoritative;
  } catch (err: any) {
    if (err instanceof ConfigurationError) {
      throw err;
    }

    logger.error('CONFIG_AUTHORITY_EXCEPTION', `Unexpected error in getSettings: ${err?.message || err}`);
    if (isDevFallbackAllowed) {
      return { ...developmentDefaultSettings };
    }
    throw new ConfigurationError('Financial configuration is temporarily unavailable. Please try again later.');
  }
}

/**
 * Strictly authoritative getter that NEVER allows fallbacks even in test environments.
 * Used for critical financial settlement and withdrawal/deposit processing.
 */
export async function getAuthoritativeSettings(): Promise<AppSettings> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.from('system_settings').select('*');

  if (error || !data || data.length === 0) {
    throw new ConfigurationError(
      `Database error loading authoritative system settings: ${error?.message || 'Empty settings table'}`
    );
  }

  const rawMap: Record<string, any> = {};
  for (const row of data) {
    try {
      rawMap[row.key] = JSON.parse(row.value);
    } catch {
      rawMap[row.key] = row.value;
    }
  }

  const validation = validateSystemSettings(rawMap);
  if (!validation.valid || !validation.validatedSettings) {
    throw new ConfigurationError(
      `Authoritative settings validation failed: ${validation.errors.join('; ')}`
    );
  }

  return validation.validatedSettings as AppSettings;
}

/**
 * Updates system settings in database after strictly validating updates.
 * Invalidates cache immediately to ensure next read gets fresh database values.
 */
export async function updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
  const validation = validateSystemSettings(updates, { allowPartial: true });
  if (!validation.valid) {
    throw new ConfigurationError(`Invalid settings update: ${validation.errors.join('; ')}`);
  }

  const supabase = getServerSupabase();

  const promises = Object.entries(updates).map(async ([key, val]) => {
    const valueStr =
      typeof val === 'object' || typeof val === 'boolean' || typeof val === 'number'
        ? JSON.stringify(val)
        : String(val);

    return supabase.from('system_settings').upsert(
      {
        key,
        value: valueStr,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );
  });

  await Promise.all(promises);

  // Invalidate cache immediately so new values take effect
  invalidateSettingsCache();

  return getSettings();
}

