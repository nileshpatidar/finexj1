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
import { getProfileById, getProfileByEmail, getAllProfiles, updateProfile, createProfile } from './repositories/profiles';
import { getDepositsByUserId, getDepositById, getDepositByTxHash, createDeposit, updateDeposit, getAllDeposits } from './repositories/deposits';
import { getWithdrawalsByUserId, getWithdrawalById, getWithdrawalByIdempotencyKey, createWithdrawal, updateWithdrawal, getAllWithdrawals } from './repositories/withdrawals';
import { getDailyPerformances, getDailyPerformanceByDate, createDailyPerformance } from './repositories/performances';
import { getEarningsByUserId, createEarning, createEarningsBatch } from './repositories/earnings';
import { getLedgerByUserId, createLedgerEntry } from './repositories/ledger';
import { getAuditLogs, createAuditLog } from './repositories/auditLogs';
import { getSettings, updateSettings, defaultSettings } from './repositories/settings';

export function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Direct Supabase PostgreSQL Database Interface
 * Supabase is the single authoritative source of all application and financial data.
 */
class Database {
  // Users
  public async getUsers(): Promise<User[]> {
    const { users } = await getAllProfiles({ limit: 1000 });
    return users;
  }

  public async getUserById(id: string): Promise<User | null> {
    return getProfileById(id);
  }

  public async getUserByIdAsync(id: string): Promise<User | null> {
    return getProfileById(id);
  }

  public async getUserByEmail(email: string): Promise<User | null> {
    return getProfileByEmail(email);
  }

  public async getUserByEmailAsync(email: string): Promise<User | null> {
    return getProfileByEmail(email);
  }

  public async addUser(user: User): Promise<User> {
    return createProfile(user);
  }

  public async updateUser(id: string, updates: Partial<User>): Promise<User> {
    return updateProfile(id, updates);
  }

  // Deposits
  public async getDeposits(userId?: string): Promise<Deposit[]> {
    if (userId) {
      return getDepositsByUserId(userId);
    }
    const { deposits } = await getAllDeposits({ limit: 1000 });
    return deposits;
  }

  public async getDepositById(id: string): Promise<Deposit | null> {
    return getDepositById(id);
  }

  public async getDepositByTxHash(txHash: string): Promise<Deposit | null> {
    return getDepositByTxHash(txHash);
  }

  public async addDeposit(deposit: Partial<Deposit>): Promise<Deposit> {
    return createDeposit(deposit);
  }

  public async updateDeposit(id: string, updates: Partial<Deposit>): Promise<Deposit> {
    return updateDeposit(id, updates);
  }

  // Withdrawals
  public async getWithdrawals(userId?: string): Promise<Withdrawal[]> {
    if (userId) {
      return getWithdrawalsByUserId(userId);
    }
    const { withdrawals } = await getAllWithdrawals({ limit: 1000 });
    return withdrawals;
  }

  public async getWithdrawalById(id: string): Promise<Withdrawal | null> {
    return getWithdrawalById(id);
  }

  public async getWithdrawalByIdempotencyKey(key: string): Promise<Withdrawal | null> {
    return getWithdrawalByIdempotencyKey(key);
  }

  public async addWithdrawal(withdrawal: Partial<Withdrawal>): Promise<Withdrawal> {
    return createWithdrawal(withdrawal);
  }

  public async updateWithdrawal(id: string, updates: Partial<Withdrawal>): Promise<Withdrawal> {
    return updateWithdrawal(id, updates);
  }

  // Daily Performance
  public async getDailyPerformances(): Promise<DailyPerformance[]> {
    return getDailyPerformances();
  }

  public async getDailyPerformanceByDate(date: string): Promise<DailyPerformance | null> {
    return getDailyPerformanceByDate(date);
  }

  public async addDailyPerformance(perf: Partial<DailyPerformance>): Promise<DailyPerformance> {
    return createDailyPerformance(perf);
  }

  // Earnings
  public async getEarnings(userId?: string): Promise<EarningEntry[]> {
    if (userId) {
      return getEarningsByUserId(userId);
    }
    return [];
  }

  public async addEarning(earning: Partial<EarningEntry>): Promise<EarningEntry> {
    return createEarning(earning);
  }

  public async addEarningsBatch(earnings: Partial<EarningEntry>[]): Promise<EarningEntry[]> {
    return createEarningsBatch(earnings);
  }

  // Ledger Entries
  public async getLedger(userId?: string): Promise<LedgerEntry[]> {
    if (userId) {
      return getLedgerByUserId(userId);
    }
    return [];
  }

  public async addLedgerEntry(entry: Partial<LedgerEntry>): Promise<LedgerEntry> {
    return createLedgerEntry(entry);
  }

  // Audit Logs
  public async getAuditLogs(): Promise<AuditLog[]> {
    return getAuditLogs({ limit: 100 });
  }

  public async addAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): Promise<void> {
    return createAuditLog(log);
  }

  // Settings
  public async getSettings(): Promise<AppSettings> {
    return getSettings();
  }

  public async getSettingsAsync(): Promise<AppSettings> {
    return getSettings();
  }

  public async updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    return updateSettings(settings);
  }

  public async updateSettingsAsync(settings: Partial<AppSettings>): Promise<AppSettings> {
    return updateSettings(settings);
  }
}

export const db = new Database();
