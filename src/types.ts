export type UserRole = 'user' | 'super_admin' | 'finance_admin' | 'support_admin' | 'readonly_admin';
export type AccountStatus = 'active' | 'suspended' | 'pending_verification';

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  country: string;
  role: UserRole;
  status: AccountStatus;
  createdAt: string;
  twoFactorEnabled: boolean;
  profilePictureUrl?: string;
  fundLockUntil?: string;
  fundLockReason?: string;
  lastWithdrawalAt?: string;
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

export interface DepositItem {
  id: string;
  userId: string;
  amount: number;
  currency: 'USDT';
  network: 'BEP-20';
  txHash: string;
  fromAddress?: string;
  toAddress: string;
  status: 'pending' | 'confirming' | 'confirmed' | 'rejected';
  confirmations: number;
  requiredConfirmations: number;
  createdAt: string;
  confirmedAt?: string;
  eligibilityDate?: string;
  depositLockEndDate?: string;
  proofPhotoUrl?: string;
  userNotes?: string;
  adminNotes?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  notes?: string;
}

export interface WithdrawalItem {
  id: string;
  reference: string;
  userId: string;
  requestedAmount: number;
  feePercentage: number;
  feeAmount: number;
  netAmount: number;
  destinationAddress: string;
  network: 'BEP-20';
  status: 'pending' | 'under_review' | 'approved' | 'processing' | 'paid' | 'rejected' | 'cancelled';
  createdAt: string;
  reviewedAt?: string;
  paidAt?: string;
  txHash?: string;
  adminNotes?: string;
  userNotes?: string;
}

export interface DailyPerformance {
  id: string;
  date: string;
  overallFundAmount: number;
  actualFundPerformance: number;
  applicableRate: number;
  notes: string;
  createdBy: string;
  createdAt: string;
  appliedCount: number;
  totalDistributed: number;
  marketCondition?: 'profit' | 'loss' | 'neutral';
}

export interface EarningItem {
  id: string;
  userId: string;
  calculationId: string;
  baseEligibleAmount: number;
  applicableRate: number;
  earningsAmount: number;
  performanceDate: string;
  createdAt: string;
  status: 'credited' | 'reversed';
  marketCondition?: 'profit' | 'loss' | 'neutral';
  note?: string;
}

export interface LedgerItem {
  id: string;
  userId: string;
  type: 'deposit' | 'daily_earnings' | 'daily_loss' | 'withdrawal_request' | 'withdrawal_fee' | 'withdrawal_paid' | 'withdrawal_rejected' | 'admin_adjustment' | 'reversal';
  amount: number;
  balanceAfter: number;
  referenceId?: string;
  description: string;
  createdAt: string;
  performedBy?: string;
}

export interface MarketPrice {
  btcUsd: number;
  goldUsd: number;
  lastUpdated: string;
  isAvailable: boolean;
}

export interface AppSettings {
  bep20DepositAddress: string;
  usdtContractAddress: string;
  requiredConfirmations: number;
  withdrawalFeePercentage: number;
  accountAgeRequirementDays: number;
  depositLockPeriodDays: number;
  telegramSupportUrl: string;
  operationalWalletAddress?: string;
  compoundingEnabled?: boolean;
}

export interface DashboardResponse {
  user: UserProfile;
  balance: UserBalanceSummary;
  todayEarnings: number;
  recentActivity: LedgerItem[];
  marketPrices: MarketPrice;
  serverTime: string;
}

export interface TestResultItem {
  name: string;
  category: string;
  passed: boolean;
  message: string;
  durationMs: number;
  details?: any;
}

export interface TestSuiteResponse {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  durationMs: number;
  results: TestResultItem[];
}
