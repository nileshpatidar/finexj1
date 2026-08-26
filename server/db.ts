import fs from 'fs';
import path from 'path';
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

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

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
  withdrawalFeePercentage: 4.0, // Fixed 4%
  accountAgeRequirementDays: 30, // 30 full days
  depositLockPeriodDays: 20, // 20 days lock
  telegramSupportUrl: 'https://t.me/USDT_FundOfficialSupport',
  operationalWalletAddress: '0x388C818CA8B9251b393131C08a73683246A73121',
  compoundingEnabled: false, // Principal-based by default
  maintenanceMode: false,
};

export function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

function initializeSeedData(): DatabaseSchema {
  const adminSalt = generateSalt();
  const adminPasswordHash = hashPassword('AdminPass123!', adminSalt);

  const demoUserSalt = generateSalt();
  const demoUserPasswordHash = hashPassword('UserPass123!', demoUserSalt);

  const newUserSalt = generateSalt();
  const newUserPasswordHash = hashPassword('UserPass123!', newUserSalt);

  const now = new Date();
  
  // Demo user created 45 days ago (eligible for 30-day withdrawal)
  const demoCreated = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString();
  
  // New user created 5 days ago (subject to 30-day block)
  const newCreated = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();

  const adminUser: User = {
    id: 'user_admin_001',
    fullName: 'Master Administrator',
    email: 'admin@usdtfund.com',
    phone: '+1 (555) 019-2831',
    country: 'United States',
    passwordHash: adminPasswordHash,
    passwordSalt: adminSalt,
    role: 'super_admin',
    status: 'active',
    createdAt: new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString(),
    twoFactorEnabled: false,
    loginAttempts: 0,
  };

  const demoUser: User = {
    id: 'user_demo_001',
    fullName: 'David Sterling',
    email: 'demo@usdtfund.com',
    phone: '+1 (555) 342-8901',
    country: 'United Kingdom',
    passwordHash: demoUserPasswordHash,
    passwordSalt: demoUserSalt,
    role: 'user',
    status: 'active',
    createdAt: demoCreated,
    twoFactorEnabled: false,
    loginAttempts: 0,
    profilePictureUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  };

  const newUser: User = {
    id: 'user_demo_002',
    fullName: 'Elena Rostova',
    email: 'newuser@usdtfund.com',
    phone: '+44 7700 900077',
    country: 'Germany',
    passwordHash: newUserPasswordHash,
    passwordSalt: newUserSalt,
    role: 'user',
    status: 'active',
    createdAt: newCreated,
    twoFactorEnabled: false,
    loginAttempts: 0,
  };

  // Create initial confirmed deposits for demo user
  const deposit1Time = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();
  const deposit2Time = new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000).toISOString();

  const deposit1: Deposit = {
    id: 'dep_001_initial',
    userId: demoUser.id,
    amount: 1000,
    currency: 'USDT',
    network: 'BEP-20',
    txHash: '0x8f3c7e492211c54a9d76e492211c54a971c5a8c0b26d19543e49e29547d6e492',
    toAddress: DEFAULT_SETTINGS.bep20DepositAddress,
    status: 'confirmed',
    confirmations: 32,
    requiredConfirmations: 12,
    createdAt: deposit1Time,
    confirmedAt: deposit1Time,
    eligibilityDate: new Date(new Date(deposit1Time).getTime() + 24 * 60 * 60 * 1000).toISOString(),
    depositLockEndDate: new Date(new Date(deposit1Time).getTime() + 20 * 24 * 60 * 60 * 1000).toISOString(),
    notes: 'Initial primary deposit verified on BSC',
  };

  const deposit2: Deposit = {
    id: 'dep_002_secondary',
    userId: demoUser.id,
    amount: 250,
    currency: 'USDT',
    network: 'BEP-20',
    txHash: '0x1a4b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b',
    toAddress: DEFAULT_SETTINGS.bep20DepositAddress,
    status: 'confirmed',
    confirmations: 24,
    requiredConfirmations: 12,
    createdAt: deposit2Time,
    confirmedAt: deposit2Time,
    eligibilityDate: new Date(new Date(deposit2Time).getTime() + 24 * 60 * 60 * 1000).toISOString(),
    depositLockEndDate: new Date(new Date(deposit2Time).getTime() + 20 * 24 * 60 * 60 * 1000).toISOString(),
    notes: 'Secondary top-up deposit verified on BSC',
  };

  // Seed daily performance records and earnings
  const dailyPerformances: DailyPerformance[] = [];
  const earnings: EarningEntry[] = [];
  const ledger: LedgerEntry[] = [];

  // Initial ledger entries for deposits
  let currentBalance = 0;
  currentBalance += 1000;
  ledger.push({
    id: 'led_dep_001',
    userId: demoUser.id,
    type: 'deposit',
    amount: 1000,
    balanceAfter: currentBalance,
    referenceId: deposit1.id,
    description: 'Confirmed USDT BEP-20 Deposit (Tx: 0x8f3c...e492)',
    createdAt: deposit1Time,
  });

  currentBalance += 250;
  ledger.push({
    id: 'led_dep_002',
    userId: demoUser.id,
    type: 'deposit',
    amount: 250,
    balanceAfter: currentBalance,
    referenceId: deposit2.id,
    description: 'Confirmed USDT BEP-20 Deposit (Tx: 0x1a4b...1a0b)',
    createdAt: deposit2Time,
  });

  // Generate 5 past days of performance allocations
  const pastRates = [0.0048, 0.0052, 0.0050, 0.0045, 0.0055];
  for (let i = 4; i >= 0; i--) {
    const perfDate = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = perfDate.toISOString().split('T')[0];
    const rate = pastRates[4 - i];
    const perfId = `perf_${dateStr}`;
    
    // Eligible principal = 1250
    const earnedAmount = Number((1250 * rate).toFixed(4));
    
    dailyPerformances.push({
      id: perfId,
      date: dateStr,
      overallFundAmount: 2500000,
      actualFundPerformance: Number((rate * 100).toFixed(2)),
      applicableRate: rate,
      notes: `Verified algorithmic arbitrage & liquidity pool yield for ${dateStr}`,
      createdBy: adminUser.id,
      createdAt: perfDate.toISOString(),
      appliedCount: 1,
      totalDistributed: earnedAmount,
    });

    const earningId = `earn_${dateStr}_demo`;
    earnings.push({
      id: earningId,
      userId: demoUser.id,
      calculationId: perfId,
      baseEligibleAmount: 1250,
      applicableRate: rate,
      earningsAmount: earnedAmount,
      performanceDate: dateStr,
      createdAt: perfDate.toISOString(),
      status: 'credited',
    });

    currentBalance += earnedAmount;
    ledger.push({
      id: `led_earn_${dateStr}`,
      userId: demoUser.id,
      type: 'daily_earnings',
      amount: earnedAmount,
      balanceAfter: Number(currentBalance.toFixed(4)),
      referenceId: earningId,
      description: `Daily Performance Allocation (${(rate * 100).toFixed(2)}%) for ${dateStr}`,
      createdAt: perfDate.toISOString(),
    });
  }

  const auditLogs: AuditLog[] = [
    {
      id: 'audit_001',
      action: 'SYSTEM_INITIALIZED',
      actorId: adminUser.id,
      actorEmail: adminUser.email,
      actorRole: adminUser.role,
      timestamp: now.toISOString(),
      reason: 'USDT Fund Management production database initialized with ledger auditing',
    },
  ];

  return {
    users: [adminUser, demoUser, newUser],
    deposits: [deposit1, deposit2],
    withdrawals: [],
    dailyPerformances,
    earnings,
    ledger,
    auditLogs,
    settings: DEFAULT_SETTINGS,
  };
}

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.ensureDataDirectory();
    this.data = this.loadData();
  }

  private ensureDataDirectory() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadData(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(fileContent);
        // Ensure default properties exist if schema updated
        return {
          ...initializeSeedData(),
          ...parsed,
          settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
        };
      }
    } catch (err) {
      console.error('Error loading database, resetting to seed:', err);
    }
    const seed = initializeSeedData();
    this.saveDataDirect(seed);
    return seed;
  }

  private saveDataDirect(data: DatabaseSchema) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to write database to disk:', err);
    }
  }

  public save() {
    this.saveDataDirect(this.data);
  }

  // Users
  public getUsers(): User[] {
    return this.data.users;
  }

  public getUserById(id: string): User | undefined {
    return this.data.users.find(u => u.id === id);
  }

  public getUserByEmail(email: string): User | undefined {
    return this.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  public addUser(user: User): void {
    this.data.users.push(user);
    this.save();
  }

  public updateUser(id: string, updates: Partial<User>): User | undefined {
    const idx = this.data.users.findIndex(u => u.id === id);
    if (idx !== -1) {
      this.data.users[idx] = { ...this.data.users[idx], ...updates };
      this.save();
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
    this.save();
  }

  public updateDeposit(id: string, updates: Partial<Deposit>): Deposit | undefined {
    const idx = this.data.deposits.findIndex(d => d.id === id);
    if (idx !== -1) {
      this.data.deposits[idx] = { ...this.data.deposits[idx], ...updates };
      this.save();
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
    this.save();
  }

  public updateWithdrawal(id: string, updates: Partial<Withdrawal>): Withdrawal | undefined {
    const idx = this.data.withdrawals.findIndex(w => w.id === id);
    if (idx !== -1) {
      this.data.withdrawals[idx] = { ...this.data.withdrawals[idx], ...updates };
      this.save();
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
    this.save();
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
    this.save();
  }

  public addEarningsBatch(earnings: EarningEntry[]): void {
    this.data.earnings.push(...earnings);
    this.save();
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
    this.save();
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
    this.save();
  }

  // Settings
  public getSettings(): AppSettings {
    return this.data.settings;
  }

  public updateSettings(settings: Partial<AppSettings>): AppSettings {
    this.data.settings = { ...this.data.settings, ...settings };
    this.save();
    return this.data.settings;
  }

  // Reset database for testing
  public resetToSeed(): void {
    this.data = initializeSeedData();
    this.save();
  }
}

export const db = new Database();
