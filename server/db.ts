import crypto from 'crypto';
import {
  User,
  Deposit,
  Withdrawal,
  DailyPerformance,
  EarningEntry,
  LedgerEntry,
  AuditLog,
  AppSettings,
} from './types';
import { getServerSupabase, isServerSupabaseReady } from './supabase';

interface DatabaseSchema {
  users: User[];
  deposits: Deposit[];
  withdrawals: Withdrawal[];
  dailyPerformances: DailyPerformance[];
  earnings: EarningEntry[];
  ledger: LedgerEntry[];
  auditLogs: AuditLog[];
  settings: AppSettings;
}

const DEFAULT_SETTINGS: AppSettings = {
  bep20DepositAddress: '0x71C5A8c0B26D19543e49e29547d6e492211C54a9',
  usdtContractAddress: '0x55d398326f99059fF775485246999027B3197955',
  requiredConfirmations: 12,
  minimumDepositAmount: 300, // Minimum 300 USDT deposit
  withdrawalFeePercentage: 9.0, // Standard 9%
  accountAgeRequirementDays: 30, // 30 full days
  depositLockPeriodDays: 30, // 30 days lock
  telegramSupportUrl: 'https://t.me/FINEXJ_OfficialSupport',
  operationalWalletAddress: '0x388C818CA8B9251b393131C08a73683246A73121',
  compoundingEnabled: false, // Principal-based by default
  maintenanceMode: false,
  registrationEnabled: true,
  loginEnabled: true,
  sessionVersion: 1,
  systemLogRetentionDays: 30,
  errorLogRetentionDays: 90,
  notificationRetentionDays: 90,
};

export function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

function initializeSeedData(): DatabaseSchema {
  // Real Super Admin: admin m (airdropjani@gmail.com)
  const adminMSalt = generateSalt();
  const adminMPasswordHash = hashPassword('@Admin123', adminMSalt);

  const now = new Date();

  const primaryAdminUser: User = {
    id: 'user_admin_airdropjani',
    fullName: 'admin m',
    email: 'airdropjani@gmail.com',
    phone: '9900990099',
    country: 'India',
    passwordHash: adminMPasswordHash,
    passwordSalt: adminMSalt,
    role: 'super_admin',
    status: 'active',
    createdAt: now.toISOString(),
    twoFactorEnabled: false,
    loginAttempts: 0,
    profilePictureUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  };

  const auditLogs: AuditLog[] = [
    {
      id: 'audit_init',
      action: 'SYSTEM_INITIALIZED',
      actorId: primaryAdminUser.id,
      actorEmail: primaryAdminUser.email,
      actorRole: primaryAdminUser.role,
      timestamp: now.toISOString(),
      reason: 'FINEXJ Platform connected directly to Supabase PostgreSQL',
    },
  ];

  return {
    users: [primaryAdminUser],
    deposits: [],
    withdrawals: [],
    dailyPerformances: [],
    earnings: [],
    ledger: [],
    auditLogs,
    settings: DEFAULT_SETTINGS,
  };
}

class Database {
  private data: DatabaseSchema;
  private isSupabaseSyncing = false;

  constructor() {
    this.data = initializeSeedData();
    // Non-blocking background sync from Supabase
    this.initSupabaseSync();
  }

  private async initSupabaseSync() {
    try {
      if (isServerSupabaseReady()) {
        const supabase = getServerSupabase();
        
        // Fetch users from Supabase if any
        const { data: dbUsers } = await supabase.from('users').select('*');
        if (dbUsers && dbUsers.length > 0) {
          for (const u of dbUsers) {
            const existingIdx = this.data.users.findIndex(x => x.email.toLowerCase() === u.email.toLowerCase());
            const mappedUser: User = {
              id: String(u.id),
              fullName: u.full_name || u.fullName || 'User',
              email: u.email,
              phone: u.phone || '',
              country: u.country || 'India',
              passwordHash: u.password_hash || u.passwordHash,
              passwordSalt: u.salt || u.passwordSalt,
              role: u.role || 'user',
              status: u.is_locked ? 'suspended' : 'active',
              createdAt: u.created_at || new Date().toISOString(),
              twoFactorEnabled: Boolean(u.two_factor_enabled),
              loginAttempts: 0,
            };
            if (existingIdx >= 0) {
              this.data.users[existingIdx] = mappedUser;
            } else {
              this.data.users.push(mappedUser);
            }
          }
        }

        // Fetch deposits from Supabase if any
        const { data: dbDeposits } = await supabase.from('deposits').select('*');
        if (dbDeposits && dbDeposits.length > 0) {
          for (const d of dbDeposits) {
            const existingIdx = this.data.deposits.findIndex(x => x.txHash.toLowerCase() === (d.tx_hash || '').toLowerCase());
            const mappedDep: Deposit = {
              id: String(d.id),
              userId: String(d.user_id),
              amount: Number(d.amount),
              currency: 'USDT',
              network: 'BEP-20',
              txHash: d.tx_hash,
              toAddress: DEFAULT_SETTINGS.bep20DepositAddress,
              status: d.status || 'confirmed',
              confirmations: d.confirmations || 15,
              requiredConfirmations: 12,
              createdAt: d.created_at || new Date().toISOString(),
              confirmedAt: d.created_at || new Date().toISOString(),
              eligibilityDate: new Date(new Date(d.created_at || Date.now()).getTime() + 24 * 60 * 60 * 1000).toISOString(),
              depositLockEndDate: d.lock_expires_at || new Date(new Date(d.created_at || Date.now()).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            };
            if (existingIdx >= 0) {
              this.data.deposits[existingIdx] = mappedDep;
            } else {
              this.data.deposits.push(mappedDep);
            }
          }
        }

        // Fetch withdrawals from Supabase if any
        const { data: dbWithdrawals } = await supabase.from('withdrawals').select('*');
        if (dbWithdrawals && dbWithdrawals.length > 0) {
          for (const w of dbWithdrawals) {
            const existingIdx = this.data.withdrawals.findIndex(x => x.id === String(w.id) || x.reference === String(w.reference || w.id));
            const netAmount = Number(w.net_amount || 0);
            const feeAmount = Number(w.fee_amount || 0);
            let requestedAmount = Number(w.requested_amount || w.amount || 0);

            if (requestedAmount <= 0 && (netAmount > 0 || feeAmount > 0)) {
              requestedAmount = Number((netAmount + feeAmount).toFixed(4));
            } else if (requestedAmount > 0 && netAmount <= 0 && feeAmount <= 0) {
              const defaultPct = DEFAULT_SETTINGS.withdrawalFeePercentage || 9;
              const calcFee = Number((requestedAmount * (defaultPct / 100)).toFixed(4));
              const calcNet = Number((requestedAmount - calcFee).toFixed(4));
              // Assign derived
              w.fee_amount = calcFee;
              w.net_amount = calcNet;
            }

            let feePercentage = DEFAULT_SETTINGS.withdrawalFeePercentage || 9;
            if (w.fee_percentage !== undefined && w.fee_percentage !== null && Number(w.fee_percentage) > 0) {
              feePercentage = Number(w.fee_percentage);
            } else if (requestedAmount > 0 && feeAmount > 0) {
              feePercentage = Math.round(((feeAmount / requestedAmount) * 100) * 100) / 100;
            }

            const mappedW: Withdrawal = {
              id: String(w.id),
              reference: w.reference || (String(w.id).startsWith('WD') ? String(w.id) : `WD-${w.id}`),
              userId: String(w.user_id),
              requestedAmount,
              feePercentage,
              feeAmount: Number(w.fee_amount || (requestedAmount - (w.net_amount || netAmount))),
              netAmount: Number(w.net_amount || (requestedAmount - (w.fee_amount || feeAmount))),
              destinationAddress: w.destination_address || '',
              network: 'BEP-20',
              status: w.status || 'pending',
              createdAt: w.created_at || new Date().toISOString(),
              txHash: w.tx_hash,
              adminNotes: w.rejection_reason || w.admin_notes,
            };
            if (existingIdx >= 0) {
              this.data.withdrawals[existingIdx] = mappedW;
            } else {
              this.data.withdrawals.push(mappedW);
            }
          }
        }
        // Fetch system_settings from Supabase
        await this.syncSettingsFromDatabase();
      }
    } catch (err) {
      console.log('Supabase sync notice:', (err as Error).message);
    }
  }

  /**
   * Directly fetch and sync latest settings from Supabase / PostgreSQL
   */
  public async syncSettingsFromDatabase(): Promise<AppSettings> {
    try {
      if (isServerSupabaseReady()) {
        const supabase = getServerSupabase();
        const { data: dbSettings, error } = await supabase.from('system_settings').select('*');
        
        if (!error && dbSettings && dbSettings.length > 0) {
          const updatedSettings: Partial<AppSettings> = {};

          for (const item of dbSettings) {
            // Case 1: Key-Value pair row (e.g. { key: 'bep20DepositAddress', value: '0x...' })
            if (item.key !== undefined && item.value !== undefined) {
              const k = String(item.key).trim();
              const v = item.value;

              const normalizeKey = k.toLowerCase().replace(/_/g, '');

              if (normalizeKey === 'bep20depositaddress' || normalizeKey === 'depositaddress') {
                updatedSettings.bep20DepositAddress = String(v).trim();
              } else if (normalizeKey === 'usdtcontractaddress' || normalizeKey === 'contractaddress') {
                updatedSettings.usdtContractAddress = String(v).trim();
              } else if (normalizeKey === 'requiredconfirmations' || normalizeKey === 'confirmations') {
                const n = Number(v);
                if (!isNaN(n)) updatedSettings.requiredConfirmations = n;
              } else if (normalizeKey === 'minimumdepositamount' || normalizeKey === 'mindepositamount' || normalizeKey === 'mindeposit') {
                const n = Number(v);
                if (!isNaN(n)) updatedSettings.minimumDepositAmount = n;
              } else if (normalizeKey === 'withdrawalfeepercentage' || normalizeKey === 'withdrawalfee') {
                const n = Number(v);
                if (!isNaN(n)) {
                  updatedSettings.withdrawalFeePercentage = n <= 1 && n > 0 ? n * 100 : n;
                }
              } else if (normalizeKey === 'accountagerequirementdays' || normalizeKey === 'accountagedays') {
                const n = Number(v);
                if (!isNaN(n)) updatedSettings.accountAgeRequirementDays = n;
              } else if (normalizeKey === 'depositlockperioddays' || normalizeKey === 'depositlockdays' || normalizeKey === 'lockperioddays') {
                const n = Number(v);
                if (!isNaN(n)) updatedSettings.depositLockPeriodDays = n;
              } else if (normalizeKey === 'telegramsupporturl' || normalizeKey === 'telegramurl' || normalizeKey === 'supporturl') {
                updatedSettings.telegramSupportUrl = String(v).trim();
              } else if (normalizeKey === 'operationalwalletaddress' || normalizeKey === 'operationalwallet') {
                updatedSettings.operationalWalletAddress = String(v).trim();
              } else if (normalizeKey === 'compoundingenabled') {
                updatedSettings.compoundingEnabled = v === true || v === 'true' || v === '1';
              } else if (normalizeKey === 'maintenancemode') {
                updatedSettings.maintenanceMode = v === true || v === 'true' || v === '1';
              } else if (normalizeKey === 'registrationenabled') {
                updatedSettings.registrationEnabled = v === true || v === 'true' || v === '1';
              } else if (normalizeKey === 'loginenabled') {
                updatedSettings.loginEnabled = v === true || v === 'true' || v === '1';
              } else if (normalizeKey === 'sessionversion') {
                const n = Number(v);
                if (!isNaN(n)) updatedSettings.sessionVersion = n;
              } else if (normalizeKey === 'systemlogretentiondays') {
                const n = Number(v);
                if (!isNaN(n)) updatedSettings.systemLogRetentionDays = n;
              } else if (normalizeKey === 'errorlogretentiondays') {
                const n = Number(v);
                if (!isNaN(n)) updatedSettings.errorLogRetentionDays = n;
              } else if (normalizeKey === 'notificationretentiondays') {
                const n = Number(v);
                if (!isNaN(n)) updatedSettings.notificationRetentionDays = n;
              }
            }
            
            // Case 2: Column-based single row (e.g. { bep20_deposit_address: '0x...', ... })
            if (item.bep20_deposit_address || item.bep20DepositAddress) {
              updatedSettings.bep20DepositAddress = (item.bep20_deposit_address || item.bep20DepositAddress);
            }
            if (item.usdt_contract_address || item.usdtContractAddress) {
              updatedSettings.usdtContractAddress = (item.usdt_contract_address || item.usdtContractAddress);
            }
            if (item.required_confirmations || item.requiredConfirmations) {
              const n = Number(item.required_confirmations || item.requiredConfirmations);
              if (!isNaN(n)) updatedSettings.requiredConfirmations = n;
            }
            if (item.minimum_deposit_amount || item.minimumDepositAmount) {
              const n = Number(item.minimum_deposit_amount || item.minimumDepositAmount);
              if (!isNaN(n)) updatedSettings.minimumDepositAmount = n;
            }
            if (item.withdrawal_fee_percentage || item.withdrawalFeePercentage) {
              const n = Number(item.withdrawal_fee_percentage || item.withdrawalFeePercentage);
              if (!isNaN(n)) {
                updatedSettings.withdrawalFeePercentage = n <= 1 && n > 0 ? n * 100 : n;
              }
            }
            if (item.account_age_requirement_days || item.accountAgeRequirementDays) {
              const n = Number(item.account_age_requirement_days || item.accountAgeRequirementDays);
              if (!isNaN(n)) updatedSettings.accountAgeRequirementDays = n;
            }
            if (item.deposit_lock_period_days || item.depositLockPeriodDays) {
              const n = Number(item.deposit_lock_period_days || item.depositLockPeriodDays);
              if (!isNaN(n)) updatedSettings.depositLockPeriodDays = n;
            }
            if (item.telegram_support_url || item.telegramSupportUrl) {
              updatedSettings.telegramSupportUrl = (item.telegram_support_url || item.telegramSupportUrl);
            }
          }

          this.data.settings = { ...this.data.settings, ...updatedSettings };
        }
      }
    } catch (err) {
      console.warn('Failed to sync settings from database:', (err as Error).message);
    }

    return this.data.settings;
  }

  // Users
  public getUsers(): User[] {
    return this.data.users;
  }

  public getUserById(id: string): User | undefined {
    return this.data.users.find(u => u.id === id);
  }

  public async getUserByIdAsync(id: string): Promise<User | undefined> {
    const local = this.getUserById(id);
    if (local) return local;

    if (isServerSupabaseReady()) {
      try {
        const supabase = getServerSupabase();
        const { data: u } = await supabase.from('users').select('*').eq('id', id).single();
        if (u) {
          const mappedUser: User = {
            id: String(u.id),
            fullName: u.full_name || u.fullName || 'User',
            email: u.email,
            phone: u.phone || '',
            country: u.country || 'India',
            passwordHash: u.password_hash || u.passwordHash,
            passwordSalt: u.salt || u.passwordSalt,
            role: u.role || 'user',
            status: u.is_locked ? 'suspended' : 'active',
            createdAt: u.created_at || new Date().toISOString(),
            twoFactorEnabled: Boolean(u.two_factor_enabled),
            loginAttempts: 0,
          };
          this.data.users.push(mappedUser);
          return mappedUser;
        }
      } catch {
        // Fallback
      }
    }
    return undefined;
  }

  public getUserByEmail(email: string): User | undefined {
    const target = email.toLowerCase().trim();
    const alias = target.endsWith('@finexj.com')
      ? target.replace('@finexj.com', '@usdtfund.com')
      : target.endsWith('@usdtfund.com')
        ? target.replace('@usdtfund.com', '@finexj.com')
        : target;

    return this.data.users.find(u => {
      const uEmail = u.email.toLowerCase();
      return uEmail === target || uEmail === alias;
    });
  }

  public async getUserByEmailAsync(email: string): Promise<User | undefined> {
    const local = this.getUserByEmail(email);
    if (local) return local;

    if (isServerSupabaseReady()) {
      try {
        const supabase = getServerSupabase();
        const target = email.toLowerCase().trim();
        const { data: u } = await supabase.from('users').select('*').ilike('email', target).single();
        if (u) {
          const mappedUser: User = {
            id: String(u.id),
            fullName: u.full_name || u.fullName || 'User',
            email: u.email,
            phone: u.phone || '',
            country: u.country || 'India',
            passwordHash: u.password_hash || u.passwordHash,
            passwordSalt: u.salt || u.passwordSalt,
            role: u.role || 'user',
            status: u.is_locked ? 'suspended' : 'active',
            createdAt: u.created_at || new Date().toISOString(),
            twoFactorEnabled: Boolean(u.two_factor_enabled),
            loginAttempts: 0,
          };
          this.data.users.push(mappedUser);
          return mappedUser;
        }
      } catch {
        // Fallback
      }
    }
    return undefined;
  }

  public async addUser(user: User): Promise<void> {
    await this.asyncSupabaseInsert('users', {
      email: user.email,
      password_hash: user.passwordHash,
      salt: user.passwordSalt,
      role: user.role,
      phone:user.phone,
      full_name: user.fullName,
      two_factor_enabled: user.twoFactorEnabled,
      is_locked: user.status === 'suspended',
      created_at: user.createdAt,
    });
    this.data.users.push(user);
  }

  public updateUser(id: string, updates: Partial<User>): User | undefined {
    const idx = this.data.users.findIndex(u => u.id === id);
    if (idx !== -1) {
      this.data.users[idx] = { ...this.data.users[idx], ...updates };
      return this.data.users[idx];
    }
    return undefined;
  }

  // Deposits
  public getDeposits(userId?: string): Deposit[] {
    if (userId) {
      return this.data.deposits.filter(d => d.userId === userId);
    }
    return this.data.deposits;
  }

  public getDepositById(id: string): Deposit | undefined {
    return this.data.deposits.find(d => d.id === id);
  }

  public getDepositByTxHash(txHash: string): Deposit | undefined {
    return this.data.deposits.find(d => d.txHash.toLowerCase() === txHash.toLowerCase());
  }

  public addDeposit(deposit: Deposit): void {
    this.data.deposits.push(deposit);
  }

  public updateDeposit(id: string, updates: Partial<Deposit>): Deposit | undefined {
    const idx = this.data.deposits.findIndex(d => d.id === id);
    if (idx !== -1) {
      this.data.deposits[idx] = { ...this.data.deposits[idx], ...updates };
      return this.data.deposits[idx];
    }
    return undefined;
  }

  // Withdrawals
  public getWithdrawals(userId?: string): Withdrawal[] {
    if (userId) {
      return this.data.withdrawals.filter(w => w.userId === userId);
    }
    return this.data.withdrawals;
  }

  public getWithdrawalById(id: string): Withdrawal | undefined {
    return this.data.withdrawals.find(w => w.id === id);
  }

  public getWithdrawalByIdempotencyKey(key: string): Withdrawal | undefined {
    return this.data.withdrawals.find(w => w.idempotencyKey === key);
  }

  public addWithdrawal(withdrawal: Withdrawal): void {
    this.data.withdrawals.push(withdrawal);
  }

  public updateWithdrawal(id: string, updates: Partial<Withdrawal>): Withdrawal | undefined {
    const idx = this.data.withdrawals.findIndex(w => w.id === id);
    if (idx !== -1) {
      this.data.withdrawals[idx] = { ...this.data.withdrawals[idx], ...updates };
      return this.data.withdrawals[idx];
    }
    return undefined;
  }

  // Daily Performance
  public getDailyPerformances(): DailyPerformance[] {
    return this.data.dailyPerformances.sort((a, b) => b.date.localeCompare(a.date));
  }

  public getDailyPerformanceByDate(date: string): DailyPerformance | undefined {
    return this.data.dailyPerformances.find(p => p.date === date);
  }

  public addDailyPerformance(perf: DailyPerformance): void {
    this.data.dailyPerformances.push(perf);
  }

  // Earnings
  public getEarnings(userId?: string): EarningEntry[] {
    if (userId) {
      return this.data.earnings
        .filter(e => e.userId === userId)
        .sort((a, b) => b.performanceDate.localeCompare(a.performanceDate));
    }
    return this.data.earnings.sort((a, b) => b.performanceDate.localeCompare(a.performanceDate));
  }

  public addEarning(earning: EarningEntry): void {
    this.data.earnings.push(earning);
  }

  public addEarningsBatch(earnings: EarningEntry[]): void {
    this.data.earnings.push(...earnings);
  }

  // Ledger Entries
  public getLedger(userId?: string): LedgerEntry[] {
    if (userId) {
      return this.data.ledger
        .filter(l => l.userId === userId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return this.data.ledger.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public addLedgerEntry(entry: LedgerEntry): void {
    this.data.ledger.push(entry);
  }

  // Audit Logs
  public getAuditLogs(): AuditLog[] {
    return this.data.auditLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public addAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'>): void {
    const fullLog: AuditLog = {
      ...log,
      id: 'audit_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toISOString(),
    };
    this.data.auditLogs.push(fullLog);
  }

  // Settings
  public getSettings(): AppSettings {
    return this.data.settings;
  }

  public async getSettingsAsync(): Promise<AppSettings> {
    return await this.syncSettingsFromDatabase();
  }

  public updateSettings(settings: Partial<AppSettings>): AppSettings {
    this.data.settings = { ...this.data.settings, ...settings };
    
    // Async persist changed settings to Supabase system_settings
    this.persistSettingsToDatabase(settings).catch(err => {
      console.warn('Background settings save notice:', err?.message);
    });
    
    return this.data.settings;
  }

  public async updateSettingsAsync(settings: Partial<AppSettings>): Promise<AppSettings> {
    this.data.settings = { ...this.data.settings, ...settings };
    await this.persistSettingsToDatabase(settings);
    return this.data.settings;
  }

  private async persistSettingsToDatabase(settings: Partial<AppSettings>): Promise<void> {
    try {
      if (isServerSupabaseReady()) {
        const supabase = getServerSupabase();
        const upsertPromises = Object.entries(settings).map(async ([k, v]) => {
          if (v !== undefined) {
            await supabase
              .from('system_settings')
              .upsert({ key: k, value: String(v), updated_at: new Date().toISOString() }, { onConflict: 'key' });
          }
        });
        await Promise.allSettled(upsertPromises);
      }
    } catch (err) {
      console.warn('Supabase settings persist error:', (err as Error).message);
    }
  }

  // Reset database for testing
  public resetToSeed(): void {
    this.data = initializeSeedData();
  }

  private async asyncSupabaseInsert(table: string, payload: any) {
   
    if (!isServerSupabaseReady()) {
      throw new Error('Supabase server credentials are not configured.');
    }

    const supabase = getServerSupabase();
    const { error } = await supabase.from(table).insert(payload);
    if (error) {
      throw new Error(`Supabase insert into ${table} failed: ${error.message}`);
    }
  }
}

export const db = new Database();
