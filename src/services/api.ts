import {
  DashboardResponse,
  DepositItem,
  WithdrawalItem,
  EarningItem,
  LedgerItem,
  MarketPrice,
  AppSettings,
  TestSuiteResponse,
  UserProfile,
  SystemHealthStats,
  SystemLogItem,
} from '../types';

const API_BASE = '';

function getAuthToken(): string | null {
  return localStorage.getItem('finexj_auth_token') || localStorage.getItem('usdt_auth_token');
}

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem('finexj_auth_token', token);
    localStorage.setItem('usdt_auth_token', token);
  } else {
    localStorage.removeItem('finexj_auth_token');
    localStorage.removeItem('usdt_auth_token');
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
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

    // Cache successful GET responses for offline browsing
    if (!options.method || options.method === 'GET') {
      try {
        localStorage.setItem(`cache_${endpoint}`, JSON.stringify({
          data,
          timestamp: Date.now(),
        }));
      } catch {
        // LocalStorage full, ignore
      }
    }

    return data as T;
  } catch (err) {
    // If offline or network error, attempt to load cached version for GET requests
    if (!options.method || options.method === 'GET') {
      const cached = localStorage.getItem(`cache_${endpoint}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          return parsed.data as T;
        } catch {
          // Ignore
        }
      }
    }
    throw err;
  }
}

export const api = {
  // Auth
  register: (payload: any) => request<{ success: boolean; token: string; user: UserProfile }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),

  login: (payload: { email: string; password: string; twoFactorCode?: string }) =>
    request<{ success?: boolean; require2FA?: boolean; token?: string; user?: UserProfile; message?: string }>('/api/auth/login', {
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

  generate2FA: () => request<{ secret: string; otpAuthUrl: string }>('/api/auth/2fa/generate', { method: 'POST' }),

  toggle2FA: (payload: { enable: boolean; secret?: string; code?: string }) =>
    request<{ success: boolean; twoFactorEnabled: boolean }>('/api/auth/2fa/toggle', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // User Financial
  getDashboard: () => request<DashboardResponse>('/api/user/dashboard'),

  getDeposits: () => request<{ deposits: DepositItem[] }>('/api/user/deposits'),

  submitDeposit: (payload: { txHash?: string; amount?: number; proofPhotoUrl?: string; userNotes?: string }) =>
    request<{ success: boolean; deposit: DepositItem; balance: any }>('/api/user/deposits', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getEarnings: () => request<{ earnings: EarningItem[]; totalEarnings: number }>('/api/user/earnings'),

  getWithdrawals: () => request<{ withdrawals: WithdrawalItem[]; balance: any }>('/api/user/withdrawals'),

  submitWithdrawal: (payload: {
    requestedAmount: number;
    destinationAddress: string;
    password: string;
    twoFactorCode?: string;
    idempotencyKey?: string;
    userNotes?: string;
  }) =>
    request<{ success: boolean; withdrawal: WithdrawalItem; balance: any }>('/api/user/withdrawals', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  lockFunds: (days: number = 30, reason?: string) =>
    request<{ success: boolean; fundLockUntil: string; balance: any; message: string }>('/api/user/lock-funds', {
      method: 'POST',
      body: JSON.stringify({ days, reason }),
    }),

  getTransactions: () => request<{ transactions: LedgerItem[] }>('/api/user/transactions'),

  getSettings: () => request<AppSettings>('/api/settings'),

  getMarketPrices: () => request<MarketPrice>('/api/market/prices'),

  getMockTxHash: () => request<{ txHash: string; network: string; currency: string }>('/api/blockchain/mock-tx'),

  runTests: () => request<TestSuiteResponse>('/api/tests/run', { method: 'POST' }),

  // Admin
  getAdminDashboard: () => request<any>('/api/admin/dashboard'),
  getAdminUsers: () => request<{ users: any[] }>('/api/admin/users'),
  updateUserStatus: (userId: string, status: string) =>
    request<{ success: boolean; user: any }>(`/api/admin/users/${userId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  getAdminDeposits: () => request<{ deposits: DepositItem[] }>('/api/admin/deposits'),
  updateDepositAction: (depositId: string, payload: { action: string; adminNotes?: string; txHash?: string }) =>
    request<{ success: boolean; deposit: DepositItem }>(`/api/admin/deposits/${depositId}/action`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getAdminWithdrawals: () => request<{ withdrawals: WithdrawalItem[] }>('/api/admin/withdrawals'),
  updateWithdrawalAction: (withdrawalId: string, payload: { action: string; txHash?: string; adminNotes?: string }) =>
    request<{ success: boolean; withdrawal: WithdrawalItem }>(`/api/admin/withdrawals/${withdrawalId}/action`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getAdminPerformance: () => request<{ performances: any[] }>('/api/admin/performance'),
  createDailyPerformance: (payload: {
    date: string;
    overallFundAmount: number;
    actualFundPerformance: number;
    applicableRate: number;
    notes: string;
    overwriteExisting?: boolean;
  }) => request<any>('/api/admin/performance', { method: 'POST', body: JSON.stringify(payload) }),
  getAdminAuditLogs: () => request<{ auditLogs: any[] }>('/api/admin/audit-logs'),
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
  resetDatabase: () => request<{ success: boolean; message: string }>('/api/admin/reset-data', { method: 'POST' }),
  getDbStatus: () => request<any>('/api/admin/db/status'),
  runDbMigration: () => request<any>('/api/admin/db/migrate', { method: 'POST' }),
  getDbSchemaSql: async () => {
    const res = await fetch('/api/admin/db/schema-sql');
    return res.text();
  },

  // User Notifications & Messages
  getUserMessages: () => request<{ messages: any[]; unreadCount: number }>('/api/user/messages'),
  markMessageRead: (messageId: string) => request<{ success: boolean }>(`/api/user/messages/${messageId}/read`, { method: 'POST' }),

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
};
