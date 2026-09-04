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
  referralCode?: string;
  referrerId?: string;
  walletAddress?: string;
  isTestUser?: boolean;
}

export interface AdminUserListItem {
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
  walletAddress?: string;
  referralCode?: string;
  referrerId?: string;
  referrer?: {
    id: string;
    fullName: string;
    email: string;
    referralCode?: string;
  } | null;
  isTestUser?: boolean;
  isFlaggedForReview?: boolean;
  riskScore?: number;
  fraudFlags?: string[];
  fundLockUntil?: string;
  fundLockReason?: string;
  balance: UserBalanceSummary & {
    eligiblePrincipal?: number;
  };
}

export interface AdminUserDetailResponse {
  success: boolean;
  user: UserProfile & {
    isFlaggedForReview?: boolean;
    riskScore?: number;
    fraudFlags?: string[];
    lockUntil?: string;
    loginAttempts?: number;
    lastLoginAt?: string;
  };
  referrer?: {
    id: string;
    fullName: string;
    email: string;
    referralCode?: string;
  } | null;
  balance: UserBalanceSummary;
  referralDetails: {
    referralCode: string;
    referrer?: {
      id: string;
      fullName: string;
      email: string;
      referralCode?: string;
    } | null;
    level1Count: number;
    level2Count: number;
    totalReferredCount: number;
    level1RewardsEarned: number;
    level2RewardsEarned: number;
    totalRewardsEarned: number;
    level1Referrals: Array<{
      id: string;
      email: string;
      status: string;
      level: number;
      createdAt: string;
      isQualified: boolean;
    }>;
    level2Referrals: Array<{
      id: string;
      email: string;
      status: string;
      level: number;
      createdAt: string;
      isQualified: boolean;
    }>;
  };
  history: {
    deposits: DepositItem[];
    withdrawals: WithdrawalItem[];
    earnings: any[];
    referralRewards: any[];
    ledger: any[];
    auditLogs: any[];
  };
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
  referralEarnings?: number;
  activeCompoundingPrincipal?: number;
  depositLockedPrincipal?: number;
  withdrawalFeePercentage?: number;
}

export interface WithdrawalImpactResult {
  canWithdraw: boolean;
  error?: string;
  availableBalance: number;
  referralEarnings: number;
  activeCompoundingPrincipal: number;
  depositLockedPrincipal: number;
  isFundLocked: boolean;
  is30DaysOld: boolean;
  requestedAmount: number;
  feePercentage: number;
  feeAmount: number;
  netAmount: number;
  isReferralOnly: boolean;
  touchesProtectedFund: boolean;
  requiresLockBreakConfirmation: boolean;
  lockBreakWarning?: string;
  requiresMinimumBreakConfirmation: boolean;
  minimumBreakWarning?: string;
  projectedRemainingPrincipal: number;
  minimumDepositAmount?: number;
}

export interface DepositItem {
  id: string;
  userId: string;
  amount: number;
  actualAmount?: number;
  currency: 'USDT';
  network: 'BEP-20';
  txHash: string;
  fromAddress?: string;
  toAddress: string;
  tokenContract?: string;
  blockNumber?: number;
  status: 'pending' | 'confirming' | 'confirmed' | 'rejected' | 'failed';
  confirmations: number;
  requiredConfirmations: number;
  createdAt: string;
  confirmedAt?: string;
  verifiedAt?: string;
  eligibilityDate?: string;
  depositLockEndDate?: string;
  proofPhotoUrl?: string;
  userNotes?: string;
  adminNotes?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  notes?: string;
  userName?: string;
  userEmail?: string;
  isTestUser?: boolean;
  userStatus?: string;
  isQualifying?: boolean;
}

export interface AdminDepositListItem extends DepositItem {}

export interface AdminDepositDetailResponse {
  success: boolean;
  deposit: AdminDepositListItem;
  user?: {
    id: string;
    fullName: string;
    email: string;
    role: string;
    status: string;
    isTestUser: boolean;
    createdAt: string;
    referralCode?: string;
    referredBy?: string;
  };
  isQualifying: boolean;
  minimumDepositAmount: number;
  proofUrl?: string;
  history: {
    ledger: any[];
    referralRewards: any[];
    auditLogs: any[];
  };
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

export type UserTransactionType =
  | 'deposit'
  | 'withdrawal'
  | 'daily_earnings'
  | 'daily_loss'
  | 'referral_reward_l1'
  | 'referral_reward_l2'
  | 'admin_adjustment'
  | 'reversal';

export interface UserTransaction {
  id: string;
  userId: string;
  type: UserTransactionType;
  amount: number;
  grossAmount?: number;
  feePercentage?: number;
  feeAmount?: number;
  netAmount?: number;
  currency: 'USDT';
  network?: 'BEP-20';
  status:
    | 'confirmed'
    | 'pending'
    | 'confirming'
    | 'paid'
    | 'under_review'
    | 'approved'
    | 'processing'
    | 'rejected'
    | 'cancelled'
    | 'credited'
    | 'completed';
  createdAt: string;
  confirmedAt?: string;
  paidAt?: string;
  referenceId?: string;
  reference?: string;
  description: string;
  txHash?: string;
  destinationAddress?: string;
  fromAddress?: string;
  toAddress?: string;
  rewardLevel?: 1 | 2;
  percentage?: number;
  ratePercentage?: number;
  baseEligibleAmount?: number;
  performanceDate?: string;
  eligibilityDate?: string;
  depositLockEndDate?: string;
  balanceAfter?: number;
  confirmations?: number;
  requiredConfirmations?: number;
}

export interface TransactionsPagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
}

export interface TransactionsSummary {
  totalCount: number;
  totalDeposited: number;
  totalWithdrawn: number;
  totalEarnings: number;
  totalReferrals: number;
  totalPendingWithdrawals: number;
}

export interface TransactionsResponse {
  transactions: UserTransaction[];
  pagination?: TransactionsPagination;
  balance?: UserBalanceSummary;
  summary?: TransactionsSummary;
}

export interface LedgerItem extends Omit<Partial<UserTransaction>, 'type'> {
  id: string;
  userId: string;
  type:
    | 'deposit'
    | 'withdrawal'
    | 'daily_earnings'
    | 'daily_loss'
    | 'referral_reward_l1'
    | 'referral_reward_l2'
    | 'withdrawal_request'
    | 'withdrawal_fee'
    | 'withdrawal_paid'
    | 'withdrawal_rejected'
    | 'admin_adjustment'
    | 'reversal';
  amount: number;
  balanceAfter?: number;
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
  minimumDepositAmount: number;
  withdrawalFeePercentage: number;
  accountAgeRequirementDays: number;
  depositLockPeriodDays: number;
  telegramSupportUrl: string;
  operationalWalletAddress?: string;
  compoundingEnabled?: boolean;
  maintenanceMode?: boolean;
  registrationEnabled?: boolean;
  loginEnabled?: boolean;
  sessionVersion?: number;
  systemLogRetentionDays?: number;
  errorLogRetentionDays?: number;
  notificationRetentionDays?: number;
}

export interface SystemLogItem {
  id: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  event: string;
  errorCode?: string;
  message: string;
  requestId?: string;
  userId?: string;
  adminId?: string;
  route?: string;
  method?: string;
  durationMs?: number;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface SystemHealthStats {
  totalUsers: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalLedgerRecords: number;
  totalAuditLogs: number;
  totalSystemLogs: number;
  totalDepositProofs: number;
  errorsToday: number;
  warningsToday: number;
  infoToday: number;
  dbLoggingEnabled?: boolean;
  retentionSettings: {
    systemLogRetentionDays: number;
    errorLogRetentionDays: number;
    notificationRetentionDays: number;
  };
}

export interface DashboardResponse {
  user: UserProfile;
  balance: UserBalanceSummary;
  todayEarnings: number;
  recentActivity: LedgerItem[];
  marketPrices: MarketPrice;
  settings?: AppSettings;
  referralSummary?: UserReferralSummary;
  activePendingWithdrawal?: WithdrawalItem | null;
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

export interface AccountingTodayBreakdown {
  deposits: number;
  dailyEarnings: number;
  referralRewardsL1: number;
  referralRewardsL2: number;
  totalReferralRewards: number;
  withdrawals: number;
  withdrawalFees: number;
  finexjRetainedFees: number;
  operationalAdjustments: number;
}

export interface AdminAccountingSummary {
  // Top summary cards
  totalDeposited: number; // A. TOTAL CONFIRMED DEPOSITS
  activeCompoundingPrincipal: number; // B. TOTAL ELIGIBLE USER PRINCIPAL
  totalDailyEarningsDistributed: number; // C. DAILY EARNINGS CREDITED
  totalReferralRewardsPaid: number; // D. REFERRAL REWARDS DISTRIBUTED
  totalReferralRewardsL1: number;
  totalReferralRewardsL2: number;
  qualifyingReferralsCount: number;
  totalWithdrawn: number; // E. TOTAL USER WITHDRAWALS (gross requested)
  totalNetPayout: number; // Net paid out
  totalFeesCollected: number; // F. TOTAL WITHDRAWAL FEES
  finexjRetainedFees: number; // G. FINEXJ RETAINED FEE INCOME
  withdrawalFeePercentage: number; // Configured fee % (e.g. 9.0)
  operationalFundBalance: number; // H. FINEXJ OPERATIONAL FUND
  operationalFundInflow: number;
  operationalFundOutflow: number;
  totalUserAvailableBalances: number;
  expectedAccountingPosition: number;
  reconciliationDifference: number; // I. RECONCILIATION DIFFERENCE
  reconciliationStatus: 'BALANCED' | 'REQUIRES_REVIEW';
  todayBreakdown: AccountingTodayBreakdown;
  period: string;
  startDate?: string;
  endDate?: string;
}

export interface FinexjOperationalEntry {
  id: string;
  amount: number;
  direction: 'inflow' | 'outflow';
  reason: string;
  adminId: string;
  reference?: string;
  beforeBalance: number;
  afterBalance: number;
  createdAt: string;
}

export interface FinexjOperationalSummary {
  currentBalance: number;
  totalInflow: number;
  totalOutflow: number;
  totalFeeIncome: number;
  recentEntries: FinexjOperationalEntry[];
}

export interface UserReferralSummary {
  referralCode: string;
  referralLink: string;
  totalReferrals: number;
  level1Referrals: number;
  level2Referrals: number;
  totalReferralIncome: number;
  level1Income: number;
  level2Income: number;
  eligibleDepositPrincipal: number; // Strictly separated from referral income
}

export interface Level1ReferralItem {
  id: string;
  name: string;
  surname: string;
  status: string;
  isQualified: boolean;
  rewardEarned: number; // Income generated for the current user
  level2Count: number; // Sub-referrals count under this L1 member
  joinedAt: string;
}

export interface Level2ReferralItem {
  id: string;
  name: string;
  surname: string;
  status: string;
  isQualified: boolean;
  rewardEarned: number; // Income generated for the current user
  joinedAt: string;
  level1ReferrerId: string;
  level1ReferrerName: string;
}

export interface PaginatedLevel1ReferralsResponse {
  items: Level1ReferralItem[];
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

export interface PaginatedLevel2ReferralsResponse {
  items: Level2ReferralItem[];
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  level1ReferrerName?: string;
  level1ReferrerId?: string;
}

export interface ReferralAccountingSummary {
  totalRewardsCount: number;
  totalRewardsAmount: number;
  level1RewardsAmount: number;
  level2RewardsAmount: number;
  uniqueReferrersCount: number;
  totalReferralsCount: number;
  qualifyingReferralsCount: number;
  todayRewardsAmount: number;
  recentRewards: {
    id: string;
    referrerId: string;
    referrerEmail?: string;
    referredId: string;
    referredEmail?: string;
    rewardLevel: number;
    qualifyingDepositAmount: number;
    depositId?: string;
    rewardPercentage: number;
    amount: number;
    status: string;
    createdAt: string;
  }[];
}

export interface AdminLedgerItem {
  id: string;
  timestamp: string;
  category: 'DEPOSIT' | 'DAILY_EARNING' | 'REFERRAL_REWARD_L1' | 'REFERRAL_REWARD_L2' | 'WITHDRAWAL' | 'WITHDRAWAL_FEE' | 'FINEXJ_OPERATIONAL_ADJUSTMENT';
  type: string;
  amount: number;
  userId?: string;
  userEmail?: string;
  reference?: string;
  balanceAfter?: number;
  description: string;
  metadata?: Record<string, any>;
}

export interface AdminLedgerResponse {
  entries: AdminLedgerItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

