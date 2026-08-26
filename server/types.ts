export type UserRole = 'user' | 'super_admin' | 'finance_admin' | 'support_admin' | 'readonly_admin';

export type AccountStatus = 'active' | 'suspended' | 'pending_verification';

export interface User {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  country: string;
  passwordHash: string;
  passwordSalt: string;
  profilePictureUrl?: string;
  role: UserRole;
  status: AccountStatus;
  createdAt: string; // ISO string
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  lastLoginAt?: string;
  loginAttempts: number;
  lockUntil?: string;
  fundLockUntil?: string; // ISO string for active 30-day fund lock
  fundLockReason?: string;
  lastWithdrawalAt?: string;
}

export type DepositStatus = 'pending' | 'confirming' | 'confirmed' | 'rejected';

export interface Deposit {
  id: string;
  userId: string;
  amount: number;
  currency: 'USDT';
  network: 'BEP-20';
  txHash: string;
  fromAddress?: string;
  toAddress: string;
  status: DepositStatus;
  confirmations: number;
  requiredConfirmations: number;
  createdAt: string;
  confirmedAt?: string;
  eligibilityDate?: string; // Eligible for performance earnings (next server day)
  depositLockEndDate?: string; // 20 days lock period for withdrawal
  notes?: string;
}

export type WithdrawalStatus = 'pending' | 'under_review' | 'approved' | 'processing' | 'paid' | 'rejected' | 'cancelled';

export interface Withdrawal {
  id: string;
  reference: string;
  userId: string;
  requestedAmount: number;
  feePercentage: number; // Fixed 4%
  feeAmount: number;
  netAmount: number;
  destinationAddress: string;
  network: 'BEP-20';
  status: WithdrawalStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  paidAt?: string;
  txHash?: string;
  adminNotes?: string;
  userNotes?: string;
  idempotencyKey?: string;
}

export interface DailyPerformance {
  id: string;
  date: string; // YYYY-MM-DD
  overallFundAmount: number;
  actualFundPerformance: number; // percentage (e.g. 1.25, -0.5, 0)
  applicableRate: number; // e.g. 0.01 for 1%, -0.005 for -0.5%, 0 for 0%
  notes: string;
  createdBy: string;
  createdAt: string;
  appliedCount: number;
  totalDistributed: number;
  marketCondition?: 'profit' | 'loss' | 'neutral';
}

export interface EarningEntry {
  id: string;
  userId: string;
  depositId?: string;
  calculationId: string;
  baseEligibleAmount: number;
  applicableRate: number; // e.g. 0.005, -0.005, 0
  earningsAmount: number; // positive, negative, or 0
  performanceDate: string; // YYYY-MM-DD
  createdAt: string;
  status: 'credited' | 'reversed';
  marketCondition?: 'profit' | 'loss' | 'neutral';
  note?: string;
}

export type LedgerType = 
  | 'deposit' 
  | 'daily_earnings' 
  | 'daily_loss'
  | 'withdrawal_request' 
  | 'withdrawal_fee' 
  | 'withdrawal_paid' 
  | 'withdrawal_rejected' 
  | 'admin_adjustment' 
  | 'reversal';

export interface LedgerEntry {
  id: string;
  userId: string;
  type: LedgerType;
  amount: number; // Positive increases balance, negative decreases
  balanceAfter: number;
  referenceId?: string; // Deposit ID, Withdrawal ID, Earning ID
  description: string;
  createdAt: string;
  performedBy?: string;
}

export interface UserBalanceSummary {
  userId: string;
  totalDeposited: number;
  totalEarnings: number;
  totalWithdrawn: number;
  totalFeesPaid: number;
  totalPendingWithdrawals: number;
  availableBalance: number;
  lockedBalance: number;
  eligibleForWithdrawal: number;
  accountAgeDays: number;
  is30DaysOld: boolean;
  canWithdraw: boolean;
  withdrawalRestrictionReason?: string;
  withdrawalEligibleDate: string;
  isFundLocked: boolean;
  fundLockUntil?: string;
  fundLockRemainingDays: number;
  fundLockRemainingHours: number;
  fundLockReason?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  actorId: string;
  actorEmail: string;
  actorRole: string;
  targetUserId?: string;
  timestamp: string;
  ip?: string;
  beforeValue?: any;
  afterValue?: any;
  reason?: string;
  referenceId?: string;
}

export interface AppSettings {
  bep20DepositAddress: string;
  usdtContractAddress: string;
  requiredConfirmations: number;
  withdrawalFeePercentage: number; // 4
  accountAgeRequirementDays: number; // 30
  depositLockPeriodDays: number; // 20
  telegramSupportUrl: string;
  operationalWalletAddress: string;
  compoundingEnabled: boolean;
  maintenanceMode: boolean;
}

export interface MarketPrice {
  btcUsd: number;
  goldUsd: number;
  lastUpdated: string;
  isAvailable: boolean;
}
