import {
  DashboardResponse,
  DepositItem,
  AdminDepositDetailResponse,
  WithdrawalItem,
  AdminWithdrawalsListResponse,
  AdminWithdrawalDetailResponse,
  PayoutVerificationResponse,
  EarningItem,
  LedgerItem,
  MarketPrice,
  MarketTickerResponse,
  AppSettings,
  TestSuiteResponse,
  UserProfile,
  SystemHealthStats,
  SystemLogItem,
  AdminAccountingSummary,
  FinexjOperationalSummary,
  ReferralAccountingSummary,
  AdminLedgerResponse,
  UserReferralSummary,
  PaginatedLevel1ReferralsResponse,
  PaginatedLevel2ReferralsResponse,
  WithdrawalImpactResult,
  FinancialMessage,
  UserBalanceSummary,
  TransactionsResponse,
  MigrationListResponse,
  MigrationSqlResponse,
  MigrationExecuteResponse,
} from '../types';

const API_BASE = '';

// In-memory registry for deduplicating identical simultaneous in-flight GET requests
const inFlightGetRequests = new Map<string, Promise<any>>();

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  // Deduplicate concurrent GET requests to the exact same endpoint while in-flight
  const canDedupe = method === 'GET';
  if (canDedupe && inFlightGetRequests.has(endpoint)) {
    return inFlightGetRequests.get(endpoint)! as Promise<T>;
  }

  const fetchPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        credentials: 'same-origin', // Transmits secure HttpOnly session cookies automatically
        headers,
      });

      const rawText = await res.text();
      let data: any;

      try {
        data = JSON.parse(rawText);
      } catch {
        // If the response is not valid JSON (e.g. serverless gateway error)
        if (!res.ok) {
          throw new Error(rawText.slice(0, 150) || `Server returned error status ${res.status}`);
        }
        data = rawText;
      }

      if (!res.ok) {
        const errMsg =
          (typeof data === 'object' && data !== null && (data.error?.message || data.error || data.message)) ||
          `Server request failed with status ${res.status}`;
        throw new Error(errMsg);
      }

      return data as T;
    } finally {
      if (canDedupe) {
        inFlightGetRequests.delete(endpoint);
      }
    }
  })();

  if (canDedupe) {
    inFlightGetRequests.set(endpoint, fetchPromise);
  }

  return fetchPromise;
}

export const api = {
  // In-flight request deduplication control
  clearInFlight: (endpoint?: string) => {
    if (endpoint) {
      inFlightGetRequests.delete(endpoint);
    } else {
      inFlightGetRequests.clear();
    }
  },
  // Auth (Session tokens managed securely via HttpOnly cookies)
  register: (payload: any) => request<{ success: boolean; user: UserProfile }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),

  login: (payload: { email: string; password: string }) =>
    request<{ success?: boolean; user?: UserProfile; message?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () => request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),
  logoutAll: () => request<{ success: boolean }>('/api/auth/logout-all', { method: 'POST' }),

  getMe: () => request<{ user: UserProfile }>('/api/auth/me'),

  updateProfile: (payload: Partial<UserProfile>) =>
    request<{ success: boolean; user: UserProfile }>('/api/auth/update-profile', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  changePassword: (payload: { currentPassword: string; newPassword: string; confirmNewPassword: string }) =>
    request<{ success: boolean; message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // 2FA / Authenticator App (RFC 6238 TOTP)
  setup2FA: () => request<{ success: boolean; secret: string; otpAuthUrl: string }>('/api/user/2fa/setup', { method: 'POST' }),

  verifySetup2FA: (payload: { secret: string; code: string }) =>
    request<{ success: boolean; twoFactorEnabled: boolean; message: string }>('/api/user/2fa/verify-setup', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  disable2FA: (payload: { code?: string; password?: string }) =>
    request<{ success: boolean; twoFactorEnabled: boolean; message: string }>('/api/user/2fa/disable', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  generate2FA: () => request<{ secret: string; otpAuthUrl: string }>('/api/user/2fa/setup', { method: 'POST' }),

  toggle2FA: (payload: { enable: boolean; secret?: string; code?: string; password?: string }) =>
    payload.enable
      ? request<{ success: boolean; twoFactorEnabled: boolean }>('/api/user/2fa/verify-setup', {
          method: 'POST',
          body: JSON.stringify({ secret: payload.secret, code: payload.code }),
        })
      : request<{ success: boolean; twoFactorEnabled: boolean }>('/api/user/2fa/disable', {
          method: 'POST',
          body: JSON.stringify({ code: payload.code, password: payload.password }),
        }),

  // User Financial
  getDashboard: () => request<DashboardResponse>('/api/user/dashboard'),

  getDeposits: () => request<{ deposits: DepositItem[] }>('/api/user/deposits'),

  submitDeposit: async (payload: { txHash?: string; amount?: number; proofPhotoUrl?: string; userNotes?: string }) => {
    try {
      return await request<{ success: boolean; deposit: DepositItem; balance: any }>('/api/user/deposits', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } finally {
      inFlightGetRequests.delete('/api/user/dashboard');
      inFlightGetRequests.delete('/api/user/deposits');
    }
  },

  getEarnings: (params?: { page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params?.page !== undefined) query.set('page', String(params.page));
    if (params?.pageSize !== undefined) query.set('pageSize', String(params.pageSize));
    const qs = query.toString();
    return request<{
      earnings: EarningItem[];
      totalEarnings: number;
      page: number;
      pageSize: number;
      hasMore: boolean;
      totalCount?: number;
    }>(`/api/user/earnings${qs ? `?${qs}` : ''}`);
  },

  getWithdrawals: () => request<{ withdrawals: WithdrawalItem[]; balance: UserBalanceSummary }>('/api/user/withdrawals'),

  previewWithdrawal: (requestedAmount: number) =>
    request<{ success: boolean; impact: WithdrawalImpactResult }>('/api/user/withdrawals/preview', {
      method: 'POST',
      body: JSON.stringify({ requestedAmount }),
    }),

  submitWithdrawal: async (payload: {
    requestedAmount: number;
    destinationAddress: string;
    network?: string;
    password: string;
    totpCode: string;
    twoFactorCode?: string;
    confirmCompoundingImpact?: boolean;
    confirmLockBreak?: boolean;
    confirmMinimumBreak?: boolean;
    idempotencyKey?: string;
    userNotes?: string;
  }) => {
    try {
      return await request<{
        success: boolean;
        withdrawal?: WithdrawalItem;
        balance?: UserBalanceSummary;
        requiresTotp?: boolean;
        requiresTotpSetup?: boolean;
        requiresConfirmation?: boolean;
        warningType?: 'COMPOUNDING_NOTICE' | 'LOCK_BREAK_WARNING' | 'MINIMUM_FUND_WARNING';
        error?: string;
      }>('/api/user/withdrawals', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } finally {
      inFlightGetRequests.delete('/api/user/dashboard');
      inFlightGetRequests.delete('/api/user/withdrawals');
    }
  },

  lockFunds: async (days: number = 30, reason?: string) => {
    try {
      return await request<{ success: boolean; fundLockUntil: string; balance: any; message: string }>('/api/user/lock-funds', {
        method: 'POST',
        body: JSON.stringify({ days, reason }),
      });
    } finally {
      inFlightGetRequests.delete('/api/user/dashboard');
    }
  },

  getTransactions: (params?: {
    page?: number;
    limit?: number;
    type?: string;
    status?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.type && params.type !== 'all') query.set('type', params.type);
    if (params?.status && params.status !== 'all') query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    const qs = query.toString();
    return request<TransactionsResponse>(`/api/user/transactions${qs ? `?${qs}` : ''}`);
  },

  getSettings: () => request<AppSettings>('/api/settings'),

  getMarketPrices: () => request<MarketPrice>('/api/market/prices'),

  getMarketTicker: (refresh?: boolean) =>
    request<MarketTickerResponse>(`/api/market/ticker${refresh ? '?refresh=true' : ''}`),

  verifyUserDeposit: async (depositId: string) => {
    try {
      return await request<{ success: boolean; deposit?: DepositItem; balance: any; isPendingConfirmations?: boolean; confirmations?: number; requiredConfirmations?: number; message?: string; error?: string }>(
        `/api/user/deposits/${depositId}/verify`,
        { method: 'POST' }
      );
    } finally {
      inFlightGetRequests.delete('/api/user/dashboard');
      inFlightGetRequests.delete('/api/user/deposits');
    }
  },

  verifyBlockchainTx: (txHash: string, claimedAmount?: number) =>
    request<any>('/api/blockchain/verify-tx', {
      method: 'POST',
      body: JSON.stringify({ txHash, claimedAmount }),
    }),

  runTests: () => request<TestSuiteResponse>('/api/tests/run', { method: 'POST' }),

  // Admin
  getAdminDashboard: () => request<any>('/api/admin/dashboard'),
  getAdminUsers: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    isTestUser?: string | boolean;
    role?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.search) query.set('search', params.search);
    if (params?.status && params.status !== 'all') query.set('status', params.status);
    if (params?.isTestUser !== undefined && params.isTestUser !== 'all') query.set('isTestUser', String(params.isTestUser));
    if (params?.role && params.role !== 'all') query.set('role', params.role);
    const qs = query.toString();
    return request<{
      users: any[];
      pagination?: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(`/api/admin/users${qs ? `?${qs}` : ''}`);
  },
  getAdminUserDetail: (userId: string) =>
    request<{
      success: boolean;
      user: any;
      referrer?: any;
      balance: any;
      referralDetails: any;
      history: {
        deposits: any[];
        withdrawals: any[];
        earnings: any[];
        referralRewards: any[];
        ledger: any[];
        auditLogs: any[];
      };
    }>(`/api/admin/users/${userId}`),
  updateUserStatus: (userId: string, status: string, reason?: string) =>
    request<{ success: boolean; user: any }>(`/api/admin/users/${userId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, reason }),
    }),
  updateUserTestStatus: (userId: string, isTestUser: boolean, reason?: string) =>
    request<{ success: boolean; user: any; isTestUser: boolean }>(`/api/admin/users/${userId}/test-user`, {
      method: 'POST',
      body: JSON.stringify({ isTestUser, reason }),
    }),
  updateUserFundLock: (userId: string, action: 'lock' | 'unlock', days?: number, reason?: string) =>
    request<{ success: boolean; user: any }>(`/api/admin/users/${userId}/fund-lock`, {
      method: 'POST',
      body: JSON.stringify({ action, days, reason }),
    }),
  getAdminDeposits: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    txHash?: string;
    minAmount?: number;
    maxAmount?: number;
    startDate?: string;
    endDate?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.status && params.status !== 'all') query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.txHash) query.set('txHash', params.txHash);
    if (params?.minAmount !== undefined && !isNaN(params.minAmount)) query.set('minAmount', String(params.minAmount));
    if (params?.maxAmount !== undefined && !isNaN(params.maxAmount)) query.set('maxAmount', String(params.maxAmount));
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    const qs = query.toString();
    return request<{
      deposits: DepositItem[];
      pagination?: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
      minimumDepositAmount?: number;
    }>(`/api/admin/deposits${qs ? `?${qs}` : ''}`);
  },
  getAdminDepositDetail: (depositId: string) =>
    request<AdminDepositDetailResponse>(`/api/admin/deposits/${depositId}`),
  verifyAdminDeposit: (depositId: string) =>
    request<{ success: boolean; deposit?: DepositItem; isPendingConfirmations?: boolean; confirmations?: number; requiredConfirmations?: number; message?: string; error?: string }>(
      `/api/admin/deposits/${depositId}/verify`,
      { method: 'POST' }
    ),
  updateDepositAction: (depositId: string, payload: { action: string; adminNotes?: string; txHash?: string }) =>
    request<{ success: boolean; deposit: DepositItem }>(`/api/admin/deposits/${depositId}/action`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getAdminWithdrawals: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    walletAddress?: string;
    txHash?: string;
    minAmount?: number;
    maxAmount?: number;
    startDate?: string;
    endDate?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.status && params.status !== 'all') query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.walletAddress) query.set('walletAddress', params.walletAddress);
    if (params?.txHash) query.set('txHash', params.txHash);
    if (params?.minAmount !== undefined && !isNaN(params.minAmount)) query.set('minAmount', String(params.minAmount));
    if (params?.maxAmount !== undefined && !isNaN(params.maxAmount)) query.set('maxAmount', String(params.maxAmount));
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    const qs = query.toString();
    return request<AdminWithdrawalsListResponse>(`/api/admin/withdrawals${qs ? `?${qs}` : ''}`);
  },
  getAdminWithdrawalById: (withdrawalId: string) =>
    request<AdminWithdrawalDetailResponse>(`/api/admin/withdrawals/${withdrawalId}`),
  verifyAdminWithdrawalPayout: (withdrawalId: string, payload: { txHash: string }) =>
    request<PayoutVerificationResponse>(`/api/admin/withdrawals/${withdrawalId}/verify-payout`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateWithdrawalAction: (
    withdrawalId: string,
    payload: { action: string; txHash?: string; adminNotes?: string; reason?: string }
  ) =>
    request<{ success: boolean; withdrawal: WithdrawalItem }>(`/api/admin/withdrawals/${withdrawalId}/action`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getAdminPerformance: () => request<{ performances: any[] }>('/api/admin/performance'),
  createDailyPerformance: (payload: {
    date: string;
    overallFundAmount?: number;
    actualFundPerformance: number;
    applicableRate: number;
    notes?: string;
    overwriteExisting?: boolean;
  }) => request<any>('/api/admin/performance', { method: 'POST', body: JSON.stringify(payload) }),
  getAdminAuditLogs: (financialOnly?: boolean) => 
    request<{ auditLogs: any[] }>(`/api/admin/audit-logs${financialOnly ? '?financialOnly=true' : ''}`),
  getCleanFinancialActivity: () => 
    request<{ success: boolean; events: any[]; total: number; allowedActions: string[] }>('/api/admin/financial-activity'),
  runDatabaseCleanup: (dryRun: boolean = true) => 
    request<{ success: boolean; report: any }>('/api/admin/database/cleanup', {
      method: 'POST',
      body: JSON.stringify({ dryRun }),
    }),
  updateAdminSettings: (payload: Partial<AppSettings> & { reason?: string }) =>
    request<{ success: boolean; settings: AppSettings }>('/api/admin/settings', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createAdjustment: (payload: { targetUserId: string; amount: number; reason: string }) =>
    request<{ success: boolean; balance: any }>('/api/admin/adjust-balance', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // User Notifications & Messages
  getUserMessages: () => request<{ messages: any[]; unreadCount: number }>('/api/user/messages'),
  markMessageRead: (messageId: string) => request<{ success: boolean }>(`/api/user/messages/${messageId}/read`, { method: 'POST' }),

  // Financial Messages (Step 57 - User <-> Admin Communication for Deposits & Withdrawals)
  getUserDepositMessages: (depositId: string) =>
    request<{ messages: FinancialMessage[] }>(`/api/user/deposits/${depositId}/messages`),
  sendUserDepositMessage: (depositId: string, message: string) =>
    request<{ success: boolean; message: FinancialMessage }>(`/api/user/deposits/${depositId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  getUserWithdrawalMessages: (withdrawalId: string) =>
    request<{ messages: FinancialMessage[] }>(`/api/user/withdrawals/${withdrawalId}/messages`),
  sendUserWithdrawalMessage: (withdrawalId: string, message: string) =>
    request<{ success: boolean; message: FinancialMessage }>(`/api/user/withdrawals/${withdrawalId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  // Admin Financial Messages (Step 57)
  getAdminDepositMessages: (depositId: string) =>
    request<{ messages: FinancialMessage[] }>(`/api/admin/deposits/${depositId}/messages`),
  sendAdminDepositMessage: (depositId: string, payload: { message: string; isInternal?: boolean }) =>
    request<{ success: boolean; message: FinancialMessage }>(`/api/admin/deposits/${depositId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getAdminWithdrawalMessages: (withdrawalId: string) =>
    request<{ messages: FinancialMessage[] }>(`/api/admin/withdrawals/${withdrawalId}/messages`),
  sendAdminWithdrawalMessage: (withdrawalId: string, payload: { message: string; isInternal?: boolean }) =>
    request<{ success: boolean; message: FinancialMessage }>(`/api/admin/withdrawals/${withdrawalId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Admin Messages & Deposit Proof URL
  sendAdminMessage: (payload: { userId: string; depositId?: string; withdrawalId?: string; messageType?: string; subject?: string; body: string }) =>
    request<{ success: boolean; message: any }>('/api/admin/messages', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getDepositProofUrl: (depositId: string) => request<{ signedUrl: string }>(`/api/admin/deposits/${depositId}/proof-url`),
  getAdminSystemHealth: () => request<any>('/api/admin/system-health'),

  // Observability & System Health
  getSystemHealthStats: () => request<SystemHealthStats>('/api/admin/health/stats'),
  getSystemLogs: (params?: {
    level?: string;
    event?: string;
    errorCode?: string;
    requestId?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.level) query.set('level', params.level);
    if (params?.event) query.set('event', params.event);
    if (params?.errorCode) query.set('errorCode', params.errorCode);
    if (params?.requestId) query.set('requestId', params.requestId);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    return request<{
      logs: SystemLogItem[];
      totalCount: number;
      limit: number;
      offset: number;
    }>(`/api/admin/logs?${query.toString()}`);
  },
  forceLogoutAllUsers: (reason?: string) =>
    request<{ success: boolean; message: string; sessionVersion: number }>('/api/admin/auth/force-logout-all', {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  runStorageCleanup: () =>
    request<{ success: boolean; report: any }>('/api/admin/health/cleanup', {
      method: 'POST',
    }),

  // FINEXJ Accounting & Operational Fund (Step 5)
  getAccountingSummary: (params?: { period?: string; startDate?: string; endDate?: string }) => {
    const query = new URLSearchParams();
    if (params?.period) query.set('period', params.period);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    return request<{ success: boolean; accounting: AdminAccountingSummary }>(`/api/admin/accounting/summary?${query.toString()}`);
  },

  getOperationalFundSummary: () =>
    request<{ success: boolean; summary: FinexjOperationalSummary }>('/api/admin/operational-fund'),

  adjustOperationalFund: (payload: { amount: number; direction: 'inflow' | 'outflow'; reason: string; reference?: string }) =>
    request<{ success: boolean; entry: any; message: string }>('/api/admin/operational-fund/adjust', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getReferralAccounting: () =>
    request<{ success: boolean; referralAccounting: ReferralAccountingSummary }>('/api/admin/accounting/referrals'),

  getAdminLedger: (params?: {
    page?: number;
    limit?: number;
    type?: string;
    userId?: string;
    reference?: string;
    startDate?: string;
    endDate?: string;
    minAmount?: number;
    maxAmount?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.type) query.set('type', params.type);
    if (params?.userId) query.set('userId', params.userId);
    if (params?.reference) query.set('reference', params.reference);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.minAmount !== undefined) query.set('minAmount', String(params.minAmount));
    if (params?.maxAmount !== undefined) query.set('maxAmount', String(params.maxAmount));
    return request<{ success: boolean } & AdminLedgerResponse>(`/api/admin/accounting/ledger?${query.toString()}`);
  },

  // User Referral Dashboard APIs
  getUserReferralSummary: () =>
    request<{ success: boolean; summary: UserReferralSummary }>('/api/referrals/summary'),

  checkReferralEligibility: () =>
    request<{
      success: boolean;
      eligibility: {
        isEligible: boolean;
        hasConfirmedDeposit: boolean;
        totalDeposited: number;
        totalWithdrawn: number;
        maintainedEligiblePrincipal: number;
        minimumRequiredPrincipal: number;
        reason?: string;
      };
    }>('/api/referrals/eligibility'),

  getLevel1Referrals: (page: number = 1, limit: number = 10) =>
    request<{ success: boolean; data: PaginatedLevel1ReferralsResponse }>(
      `/api/referrals/level1?page=${page}&limit=${limit}`
    ),

  getLevel2Referrals: (params?: { level1UserId?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.level1UserId) query.set('level1UserId', params.level1UserId);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    return request<{ success: boolean; data: PaginatedLevel2ReferralsResponse }>(
      `/api/referrals/level2?${query.toString()}`
    );
  },

  validateReferralCode: (code: string) =>
    request<{ success: boolean; valid: boolean; referrerName?: string; error?: string }>(
      `/api/referrals/validate/${encodeURIComponent(code)}`
    ),

  // Database Migration Center (Super Admin)
  getAdminMigrations: () =>
    request<MigrationListResponse>('/api/admin/migrations'),

  getAdminMigrationSql: (filename: string) =>
    request<MigrationSqlResponse>(`/api/admin/migrations/${encodeURIComponent(filename)}/sql`),

  executeAdminMigration: (filename: string) =>
    request<MigrationExecuteResponse>('/api/admin/migrations/execute', {
      method: 'POST',
      body: JSON.stringify({ filename }),
    }),

  // Cancel / purge all pending in-flight GET requests (used on logout/session expiry)
  clearInFlightRequests: () => {
    inFlightGetRequests.clear();
  },
};
