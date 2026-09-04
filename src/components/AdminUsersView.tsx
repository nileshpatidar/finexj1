import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { AdminUserListItem, AdminUserDetailResponse, AccountStatus } from '../types';
import {
  Users,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Shield,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  Unlock,
  FlaskConical,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  DollarSign,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Wallet,
  Clock,
  Copy,
  Check,
  X,
  FileText,
  HelpCircle,
  Network,
  Share2,
} from 'lucide-react';

interface AdminUsersViewProps {
  onRefreshParentStats?: () => void;
}

export const AdminUsersView: React.FC<AdminUsersViewProps> = ({ onRefreshParentStats }) => {
  // User list state
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Pagination & Filtering state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AccountStatus>('all');
  const [testUserFilter, setTestUserFilter] = useState<'all' | 'true' | 'false'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // User details modal state
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userDetail, setUserDetail] = useState<AdminUserDetailResponse | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<'overview' | 'referrals' | 'deposits' | 'withdrawals' | 'earnings' | 'rewards' | 'ledger' | 'audit'>('overview');

  // Action modals state
  const [statusModalUser, setStatusModalUser] = useState<AdminUserListItem | null>(null);
  const [newStatus, setNewStatus] = useState<AccountStatus>('active');
  const [statusReason, setStatusReason] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const [testUserModalUser, setTestUserModalUser] = useState<AdminUserListItem | null>(null);
  const [newTestStatus, setNewTestStatus] = useState(false);
  const [testReason, setTestReason] = useState('');
  const [isUpdatingTest, setIsUpdatingTest] = useState(false);

  const [fundLockModalUser, setFundLockModalUser] = useState<AdminUserListItem | null>(null);
  const [fundLockAction, setFundLockAction] = useState<'lock' | 'unlock'>('lock');
  const [fundLockDays, setFundLockDays] = useState(30);
  const [fundLockReason, setFundLockReason] = useState('');
  const [isUpdatingFundLock, setIsUpdatingFundLock] = useState(false);

  // Copy feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // Reset to page 1 on new search
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load user list
  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.getAdminUsers({
        page: currentPage,
        limit: pageSize,
        search: debouncedSearch || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        isTestUser: testUserFilter !== 'all' ? testUserFilter : undefined,
      });

      setUsers(response.users || []);
      if (response.pagination) {
        setTotalPages(response.pagination.totalPages || 1);
        setTotalCount(response.pagination.total || 0);
      } else {
        setTotalCount(response.users?.length || 0);
        setTotalPages(1);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load user records.');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, statusFilter, testUserFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Load detailed user record
  const openUserDetails = async (userId: string) => {
    setSelectedUserId(userId);
    setIsLoadingDetail(true);
    setUserDetail(null);
    setActiveDetailTab('overview');
    try {
      const data = await api.getAdminUserDetail(userId);
      setUserDetail(data);
    } catch (err: any) {
      setError(`Failed to load details for user ${userId}: ${err?.message}`);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Handle status update
  const handleUpdateStatus = async () => {
    if (!statusModalUser) return;
    setIsUpdatingStatus(true);
    try {
      await api.updateUserStatus(statusModalUser.id, newStatus, statusReason || undefined);
      setSuccessMessage(`User status successfully updated to ${newStatus}.`);
      setStatusModalUser(null);
      setStatusReason('');
      fetchUsers();
      if (selectedUserId === statusModalUser.id) {
        openUserDetails(statusModalUser.id);
      }
      onRefreshParentStats?.();
    } catch (err: any) {
      setError(err?.message || 'Failed to update user status.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Handle test status update
  const handleUpdateTestStatus = async () => {
    if (!testUserModalUser) return;
    setIsUpdatingTest(true);
    try {
      await api.updateUserTestStatus(testUserModalUser.id, newTestStatus, testReason || undefined);
      setSuccessMessage(`Test user status updated to ${newTestStatus ? 'TEST USER' : 'NORMAL USER'}.`);
      setTestUserModalUser(null);
      setTestReason('');
      fetchUsers();
      if (selectedUserId === testUserModalUser.id) {
        openUserDetails(testUserModalUser.id);
      }
      onRefreshParentStats?.();
    } catch (err: any) {
      setError(err?.message || 'Failed to update test user status.');
    } finally {
      setIsUpdatingTest(false);
    }
  };

  // Handle fund lock update
  const handleUpdateFundLock = async () => {
    if (!fundLockModalUser) return;
    setIsUpdatingFundLock(true);
    try {
      await api.updateUserFundLock(
        fundLockModalUser.id,
        fundLockAction,
        fundLockAction === 'lock' ? fundLockDays : undefined,
        fundLockReason || undefined
      );
      setSuccessMessage(
        fundLockAction === 'lock'
          ? `30-Day fund lock successfully applied for ${fundLockDays} days.`
          : 'Fund lock successfully released.'
      );
      setFundLockModalUser(null);
      setFundLockReason('');
      fetchUsers();
      if (selectedUserId === fundLockModalUser.id) {
        openUserDetails(fundLockModalUser.id);
      }
      onRefreshParentStats?.();
    } catch (err: any) {
      setError(err?.message || 'Failed to update fund lock.');
    } finally {
      setIsUpdatingFundLock(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Alert Messages */}
      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-600 hover:text-rose-800 dark:text-rose-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Controls Toolbar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2">
              <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                User Management
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold">
                {totalCount} total
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Authoritative financial oversight, referral tree inspection, test accounts, and access controls.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => fetchUsers()}
              disabled={isLoading}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition cursor-pointer"
              title="Refresh users"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-1">
          {/* Search Bar */}
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, referral code, wallet, ID..."
              className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Account Status Filter */}
          <div className="sm:col-span-3">
            <select
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full py-2 px-3 text-xs rounded-xl bg-slate-50 dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Account Statuses</option>
              <option value="active">Active Accounts</option>
              <option value="suspended">Suspended Accounts</option>
              <option value="pending_verification">Pending Verification</option>
            </select>
          </div>

          {/* Test User Filter */}
          <div className="sm:col-span-2">
            <select
              value={testUserFilter}
              onChange={e => {
                setTestUserFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full py-2 px-3 text-xs rounded-xl bg-slate-50 dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All User Types</option>
              <option value="false">Normal Users</option>
              <option value="true">Test Users Only</option>
            </select>
          </div>

          {/* Page Size */}
          <div className="sm:col-span-2">
            <select
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="w-full py-2 px-3 text-xs rounded-xl bg-slate-50 dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table / List */}
      <div className="rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            <p className="text-xs font-semibold">Loading authoritative user accounts...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 space-y-2">
            <Users className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">No users found</p>
            <p className="text-xs">Try adjusting your search query or status filter.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-900/50 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">User Details</th>
                    <th className="py-3 px-4">Referral & Referrer</th>
                    <th className="py-3 px-4">Account Status</th>
                    <th className="py-3 px-4 text-right">Eligible Principal</th>
                    <th className="py-3 px-4 text-right">Available Balance</th>
                    <th className="py-3 px-4 text-center">Risk / Review</th>
                    <th className="py-3 px-4">Joined Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {users.map(u => {
                    const isTest = Boolean(u.isTestUser);
                    const isSuspended = u.status === 'suspended';
                    const principal = Number(u.balance?.activeCompoundingPrincipal ?? u.balance?.totalDeposited ?? 0);
                    const available = Number(u.balance?.availableBalance ?? 0);
                    const isFlagged = Boolean(u.isFlaggedForReview) || (u.riskScore || 0) > 20;

                    return (
                      <tr
                        key={u.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition group"
                      >
                        {/* User Details */}
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-3">
                            <img
                              src={u.profilePictureUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.fullName}`}
                              alt=""
                              className="w-9 h-9 rounded-xl object-cover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
                            />
                            <div>
                              <div className="flex items-center space-x-1.5">
                                <span className="font-bold text-slate-900 dark:text-white">
                                  {u.fullName}
                                </span>
                                {isTest && (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold text-[9px] border border-amber-300 dark:border-amber-800">
                                    TEST
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                {u.email}
                              </p>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                ID: #{u.id} • {u.country || 'Global'}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Referral & Referrer */}
                        <td className="py-3 px-4">
                          <div className="space-y-0.5">
                            <div className="flex items-center space-x-1">
                              <span className="text-[10px] text-slate-400">Code:</span>
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200 text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded">
                                {u.referralCode || `FXJ-${u.id}`}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
                              {u.referrer ? (
                                <span>Ref: <strong className="text-slate-700 dark:text-slate-300">{u.referrer.fullName}</strong></span>
                              ) : (
                                <span className="text-slate-400 italic">Direct registration</span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Account Status */}
                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                u.status === 'active'
                                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                  : u.status === 'suspended'
                                  ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                                  : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                              }`}
                            >
                              {u.status === 'active' ? 'Active' : u.status === 'suspended' ? 'Suspended' : 'Pending Verification'}
                            </span>
                            {u.balance?.isFundLocked && (
                              <div className="flex items-center space-x-1 text-[10px] text-amber-600 dark:text-amber-400">
                                <Lock className="w-3 h-3" />
                                <span>30d Fund Lock</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Eligible Principal */}
                        <td className="py-3 px-4 text-right font-mono">
                          <p className="font-bold text-slate-900 dark:text-white">
                            ${principal.toFixed(2)}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            Dep: ${Number(u.balance?.totalDeposited || 0).toFixed(2)}
                          </p>
                        </td>

                        {/* Available Balance */}
                        <td className="py-3 px-4 text-right font-mono">
                          <p className="font-bold text-blue-600 dark:text-blue-400">
                            ${available.toFixed(2)}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            Earn: ${Number(u.balance?.totalEarnings || 0).toFixed(2)}
                          </p>
                        </td>

                        {/* Risk / Review */}
                        <td className="py-3 px-4 text-center">
                          {isFlagged ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[10px] font-bold">
                              <ShieldAlert className="w-3 h-3" />
                              <span>Review Flag</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 text-slate-400 text-[10px]">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                              <span>Clear</span>
                            </span>
                          )}
                        </td>

                        {/* Registration Date */}
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          <p>{new Date(u.createdAt).toLocaleDateString()}</p>
                          <p className="text-[10px] text-slate-400">
                            {u.balance?.accountAgeDays ?? 0} days active
                          </p>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              onClick={() => openUserDetails(u.id)}
                              className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 transition cursor-pointer"
                              title="Inspect User Details & History"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setStatusModalUser(u);
                                setNewStatus(u.status === 'active' ? 'suspended' : 'active');
                              }}
                              className={`p-1.5 rounded-lg transition cursor-pointer ${
                                isSuspended
                                  ? 'bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-600 dark:text-rose-400'
                              }`}
                              title={isSuspended ? 'Activate Account' : 'Suspend Account'}
                            >
                              {isSuspended ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => {
                                setTestUserModalUser(u);
                                setNewTestStatus(!isTest);
                              }}
                              className={`p-1.5 rounded-lg transition cursor-pointer ${
                                isTest
                                  ? 'bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 text-amber-600 dark:text-amber-400'
                                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300'
                              }`}
                              title={isTest ? 'Convert to Normal User' : 'Mark as Test User'}
                            >
                              <FlaskConical className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="block lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {users.map(u => {
                const isTest = Boolean(u.isTestUser);
                const isSuspended = u.status === 'suspended';
                const principal = Number(u.balance?.activeCompoundingPrincipal ?? u.balance?.totalDeposited ?? 0);
                const available = Number(u.balance?.availableBalance ?? 0);

                return (
                  <div key={u.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2.5">
                        <img
                          src={u.profilePictureUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.fullName}`}
                          alt=""
                          className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
                        />
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <span className="font-bold text-slate-900 dark:text-white text-sm">
                              {u.fullName}
                            </span>
                            {isTest && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-bold text-[9px]">
                                TEST
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 font-mono">{u.email}</p>
                        </div>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          u.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                        }`}
                      >
                        {u.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400">Eligible Principal</span>
                        <p className="font-bold text-slate-900 dark:text-white">${principal.toFixed(2)} USDT</p>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400">Available Balance</span>
                        <p className="font-bold text-blue-600 dark:text-blue-400">${available.toFixed(2)} USDT</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-slate-400 font-mono">
                        Ref: {u.referralCode || `FXJ-${u.id}`}
                      </span>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => openUserDetails(u.id)}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold text-xs flex items-center space-x-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Inspect</span>
                        </button>
                        <button
                          onClick={() => {
                            setStatusModalUser(u);
                            setNewStatus(u.status === 'active' ? 'suspended' : 'active');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold"
                        >
                          {isSuspended ? 'Activate' : 'Suspend'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Toolbar */}
            <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400">
                Showing {totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1} to{' '}
                {Math.min(currentPage * pageSize, totalCount)} of {totalCount} users
              </span>

              <div className="flex items-center space-x-1.5">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition text-slate-700 dark:text-slate-300"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2.5 py-1 font-semibold text-slate-700 dark:text-slate-300">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition text-slate-700 dark:text-slate-300"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ========================================== */}
      {/* USER DETAIL MODAL / DRAWER */}
      {/* ========================================== */}
      {selectedUserId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in">
          <div className="w-full max-w-4xl max-h-[92vh] bg-white dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/75 dark:bg-slate-900/50">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/10 dark:bg-blue-400/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">
                      {userDetail?.user?.fullName || 'User Profile'}
                    </h3>
                    {userDetail?.user?.isTestUser && (
                      <span className="px-2 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold text-[10px] border border-amber-300 dark:border-amber-800">
                        TEST USER
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                        userDetail?.user?.status === 'active'
                          ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                          : 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                      }`}
                    >
                      {userDetail?.user?.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    ID #{selectedUserId} • {userDetail?.user?.email}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setSelectedUserId(null);
                    setUserDetail(null);
                  }}
                  className="p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
              {isLoadingDetail ? (
                <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center space-y-3">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                  <p className="text-xs font-semibold">Loading authoritative ledger & network metrics...</p>
                </div>
              ) : !userDetail ? (
                <div className="p-8 text-center text-rose-600">Failed to load user information.</div>
              ) : (
                <>
                  {/* Authoritative Financial Breakdown Banner (Principal vs Daily Earnings vs Referral Income) */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {/* 1. Principal */}
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Eligible Principal
                      </span>
                      <p className="text-lg font-bold text-slate-900 dark:text-white font-mono">
                        ${Number(userDetail.balance?.activeCompoundingPrincipal ?? userDetail.balance?.totalDeposited ?? 0).toFixed(2)}
                      </p>
                      <span className="text-[10px] text-slate-500">
                        Deposited: ${Number(userDetail.balance?.totalDeposited || 0).toFixed(2)}
                      </span>
                    </div>

                    {/* 2. Daily Earnings */}
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Trading Yield
                      </span>
                      <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                        +${Number(userDetail.balance?.totalEarnings || 0).toFixed(2)}
                      </p>
                      <span className="text-[10px] text-slate-500">Daily fund earnings</span>
                    </div>

                    {/* 3. Referral Income */}
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Referral Income
                      </span>
                      <p className="text-lg font-bold text-blue-600 dark:text-blue-400 font-mono">
                        ${Number(userDetail.balance?.referralEarnings ?? userDetail.referralDetails?.totalRewardsEarned ?? 0).toFixed(2)}
                      </p>
                      <span className="text-[10px] text-slate-500">
                        L1: ${Number(userDetail.referralDetails?.level1RewardsEarned || 0).toFixed(2)} • L2: ${Number(userDetail.referralDetails?.level2RewardsEarned || 0).toFixed(2)}
                      </span>
                    </div>

                    {/* 4. Available Balance */}
                    <div className="p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                      <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider">
                        Available Balance
                      </span>
                      <p className="text-lg font-bold text-blue-700 dark:text-blue-300 font-mono">
                        ${Number(userDetail.balance?.availableBalance || 0).toFixed(2)}
                      </p>
                      <span className="text-[10px] text-blue-600/80 dark:text-blue-400">
                        Withdrawn: ${Number(userDetail.balance?.totalWithdrawn || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Administrative Quick Action Controls */}
                  <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60 text-xs">
                    <span className="font-bold text-slate-700 dark:text-slate-300 mr-1">Admin Actions:</span>

                    <button
                      onClick={() => {
                        setStatusModalUser(userDetail.user as any);
                        setNewStatus(userDetail.user.status === 'active' ? 'suspended' : 'active');
                      }}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                        userDetail.user.status === 'active'
                          ? 'bg-rose-100 hover:bg-rose-200 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
                          : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                      }`}
                    >
                      {userDetail.user.status === 'active' ? 'Suspend Account' : 'Activate Account'}
                    </button>

                    <button
                      onClick={() => {
                        setTestUserModalUser(userDetail.user as any);
                        setNewTestStatus(!userDetail.user.isTestUser);
                      }}
                      className="px-3 py-1.5 rounded-lg font-semibold bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-950 dark:text-amber-200 transition cursor-pointer"
                    >
                      {userDetail.user.isTestUser ? 'Remove Test Tag' : 'Mark as Test User'}
                    </button>

                    <button
                      onClick={() => {
                        setFundLockModalUser(userDetail.user as any);
                        setFundLockAction(userDetail.balance?.isFundLocked ? 'unlock' : 'lock');
                      }}
                      className="px-3 py-1.5 rounded-lg font-semibold bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-700 dark:text-slate-200 transition cursor-pointer flex items-center space-x-1"
                    >
                      {userDetail.balance?.isFundLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                      <span>{userDetail.balance?.isFundLocked ? 'Release Fund Lock' : 'Apply 30-Day Lock'}</span>
                    </button>
                  </div>

                  {/* Navigation Tabs for User Details */}
                  <div className="flex border-b border-slate-200 dark:border-slate-800 overflow-x-auto space-x-1">
                    {[
                      { id: 'overview', label: 'Overview & Profile' },
                      { id: 'referrals', label: `Referrals (L1: ${userDetail.referralDetails?.level1Count || 0} / L2: ${userDetail.referralDetails?.level2Count || 0})` },
                      { id: 'deposits', label: `Deposits (${userDetail.history?.deposits?.length || 0})` },
                      { id: 'withdrawals', label: `Withdrawals (${userDetail.history?.withdrawals?.length || 0})` },
                      { id: 'earnings', label: `Trading Yield (${userDetail.history?.earnings?.length || 0})` },
                      { id: 'rewards', label: `Referral Rewards (${userDetail.history?.referralRewards?.length || 0})` },
                      { id: 'ledger', label: `Ledger (${userDetail.history?.ledger?.length || 0})` },
                      { id: 'audit', label: `Audit Trail (${userDetail.history?.auditLogs?.length || 0})` },
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveDetailTab(tab.id as any)}
                        className={`py-2 px-3 text-xs font-semibold whitespace-nowrap border-b-2 transition cursor-pointer ${
                          activeDetailTab === tab.id
                            ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Tab Content: OVERVIEW */}
                  {activeDetailTab === 'overview' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                        <h4 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
                          Account Details
                        </h4>
                        <div className="space-y-1.5 text-slate-600 dark:text-slate-300">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Full Name:</span>
                            <span className="font-semibold">{userDetail.user.fullName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Email:</span>
                            <span className="font-mono">{userDetail.user.email}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Phone:</span>
                            <span>{userDetail.user.phone || 'Not provided'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Country:</span>
                            <span>{userDetail.user.country || 'Not provided'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Role:</span>
                            <span className="font-semibold uppercase">{userDetail.user.role}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">2FA Security:</span>
                            <span className={userDetail.user.twoFactorEnabled ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                              {userDetail.user.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">BEP-20 Wallet:</span>
                            <span className="font-mono text-[10px] truncate max-w-[180px]">
                              {userDetail.user.walletAddress || 'None'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                        <h4 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
                          Financial & Lock Status
                        </h4>
                        <div className="space-y-1.5 text-slate-600 dark:text-slate-300">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Account Age:</span>
                            <span className="font-semibold">{userDetail.balance?.accountAgeDays ?? 0} days</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">30-Day Age Check:</span>
                            <span className={userDetail.balance?.is30DaysOld ? 'text-emerald-600 font-bold' : 'text-amber-600'}>
                              {userDetail.balance?.is30DaysOld ? 'Eligible (>30d)' : 'In 30-Day Holding Period'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">30-Day Fund Lock:</span>
                            <span className={userDetail.balance?.isFundLocked ? 'text-amber-600 font-bold' : 'text-slate-400'}>
                              {userDetail.balance?.isFundLocked
                                ? `Active (${userDetail.balance.fundLockRemainingDays}d remaining)`
                                : 'Unlocked'}
                            </span>
                          </div>
                          {userDetail.balance?.fundLockReason && (
                            <div className="flex justify-between">
                              <span className="text-slate-400">Lock Reason:</span>
                              <span className="text-amber-600">{userDetail.balance.fundLockReason}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-slate-400">Can Withdraw:</span>
                            <span className={userDetail.balance?.canWithdraw ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                              {userDetail.balance?.canWithdraw ? 'Eligible' : 'Restricted'}
                            </span>
                          </div>
                          {userDetail.balance?.withdrawalRestrictionReason && (
                            <div className="text-[11px] text-rose-600 bg-rose-50 dark:bg-rose-950/40 p-2 rounded-lg">
                              {userDetail.balance.withdrawalRestrictionReason}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tab Content: REFERRALS (Strictly 2 Levels: Level 1 & Level 2. No Level 3!) */}
                  {activeDetailTab === 'referrals' && (
                    <div className="space-y-4 text-xs">
                      {/* Referrer & Code Banner */}
                      <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase">
                            User's Own Referral Code
                          </span>
                          <div className="flex items-center space-x-2 mt-1">
                            <span className="text-base font-bold font-mono text-slate-900 dark:text-white">
                              {userDetail.referralDetails?.referralCode}
                            </span>
                            <button
                              onClick={() => copyToClipboard(userDetail.referralDetails.referralCode, 'code')}
                              className="p-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-600 cursor-pointer"
                            >
                              {copiedKey === 'code' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase">
                            Direct Referrer (Who referred this user)
                          </span>
                          <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                            {userDetail.referrer ? (
                              <span>{userDetail.referrer.fullName} ({userDetail.referrer.email})</span>
                            ) : (
                              <span className="text-slate-400 italic">No referrer (Direct / Company)</span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* 2-Tier Referral Breakdown */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Level 1 Direct Referrals */}
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                              Level 1 Direct Referrals ({userDetail.referralDetails?.level1Count || 0})
                            </h4>
                            <span className="text-blue-600 dark:text-blue-400 font-bold font-mono">
                              ${Number(userDetail.referralDetails?.level1RewardsEarned || 0).toFixed(2)} earned
                            </span>
                          </div>

                          {userDetail.referralDetails?.level1Referrals?.length === 0 ? (
                            <p className="text-slate-400 text-center py-4">No Level 1 referrals registered.</p>
                          ) : (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                              {userDetail.referralDetails?.level1Referrals?.map((ref, idx) => (
                                <div
                                  key={ref.id || idx}
                                  className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                                >
                                  <div>
                                    <p className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                                      {ref.email}
                                    </p>
                                    <p className="text-[10px] text-slate-400">
                                      Joined: {new Date(ref.createdAt).toLocaleDateString()}
                                    </p>
                                  </div>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      ref.isQualified
                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                        : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                                    }`}
                                  >
                                    {ref.isQualified ? 'Qualified ($300+)' : 'Pending Dep'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Level 2 Indirect Referrals */}
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                              Level 2 Indirect Referrals ({userDetail.referralDetails?.level2Count || 0})
                            </h4>
                            <span className="text-blue-600 dark:text-blue-400 font-bold font-mono">
                              ${Number(userDetail.referralDetails?.level2RewardsEarned || 0).toFixed(2)} earned
                            </span>
                          </div>

                          {userDetail.referralDetails?.level2Referrals?.length === 0 ? (
                            <p className="text-slate-400 text-center py-4">No Level 2 referrals registered.</p>
                          ) : (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                              {userDetail.referralDetails?.level2Referrals?.map((ref, idx) => (
                                <div
                                  key={ref.id || idx}
                                  className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                                >
                                  <div>
                                    <p className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                                      {ref.email}
                                    </p>
                                    <p className="text-[10px] text-slate-400">
                                      Joined: {new Date(ref.createdAt).toLocaleDateString()}
                                    </p>
                                  </div>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      ref.isQualified
                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                        : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                                    }`}
                                  >
                                    {ref.isQualified ? 'Qualified ($300+)' : 'Pending Dep'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-500 flex items-center space-x-2">
                        <HelpCircle className="w-4 h-4 flex-shrink-0 text-slate-400" />
                        <span>FINEXJ strictly enforces a maximum 2-tier referral reward structure (L1 and L2). Level 3 and deeper are not supported.</span>
                      </div>
                    </div>
                  )}

                  {/* Tab Content: DEPOSITS */}
                  {activeDetailTab === 'deposits' && (
                    <div className="space-y-2 text-xs">
                      {userDetail.history?.deposits?.length === 0 ? (
                        <p className="text-center py-6 text-slate-400">No deposit records found for this user.</p>
                      ) : (
                        userDetail.history?.deposits?.map(dep => (
                          <div
                            key={dep.id}
                            className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-slate-900 dark:text-white font-mono text-sm">
                                  ${Number(dep.amount || 0).toFixed(2)} USDT
                                </span>
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-800">
                                  {dep.network || 'BEP-20'}
                                </span>
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                    dep.status === 'confirmed'
                                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                      : dep.status === 'rejected'
                                      ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                      : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                  }`}
                                >
                                  {String(dep.status).toUpperCase()}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 font-mono break-all">
                                Tx: {dep.txHash || 'Manual / Internal'}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                ID: #{dep.id} • {new Date(dep.createdAt).toLocaleString()}
                              </p>
                            </div>

                            {dep.txHash && dep.txHash.startsWith('0x') && (
                              <a
                                href={`https://bscscan.com/tx/${dep.txHash}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center space-x-1 text-blue-600 hover:underline text-[11px] font-semibold"
                              >
                                <span>BscScan</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Tab Content: WITHDRAWALS */}
                  {activeDetailTab === 'withdrawals' && (
                    <div className="space-y-2 text-xs">
                      {userDetail.history?.withdrawals?.length === 0 ? (
                        <p className="text-center py-6 text-slate-400">No withdrawal records found for this user.</p>
                      ) : (
                        userDetail.history?.withdrawals?.map(w => (
                          <div
                            key={w.id}
                            className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-slate-900 dark:text-white font-mono text-sm">
                                  ${Number(w.requestedAmount || 0).toFixed(2)} USDT
                                </span>
                                <span className="text-slate-500">
                                  Net: ${Number(w.netAmount || 0).toFixed(2)} (Fee: ${Number(w.feeAmount || 0).toFixed(2)})
                                </span>
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                    w.status === 'paid'
                                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                      : w.status === 'rejected'
                                      ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                      : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                  }`}
                                >
                                  {String(w.status).toUpperCase()}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 font-mono break-all">
                                To: {w.destinationAddress}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                Ref: {w.reference} • {new Date(w.createdAt).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Tab Content: EARNINGS */}
                  {activeDetailTab === 'earnings' && (
                    <div className="space-y-2 text-xs">
                      {userDetail.history?.earnings?.length === 0 ? (
                        <p className="text-center py-6 text-slate-400">No daily yield records recorded.</p>
                      ) : (
                        <div className="divide-y divide-slate-200 dark:divide-slate-800">
                          {userDetail.history?.earnings?.map((e: any) => (
                            <div key={e.id} className="py-2.5 flex items-center justify-between">
                              <div>
                                <span className="font-bold text-slate-900 dark:text-white">
                                  Trading Yield ({e.performanceDate || e.date})
                                </span>
                                <p className="text-[10px] text-slate-400">
                                  Rate: {e.applicableRate}% • Status: {e.status}
                                </p>
                              </div>
                              <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400 text-sm">
                                +${Number(e.amount || 0).toFixed(4)} USDT
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab Content: REFERRAL REWARDS */}
                  {activeDetailTab === 'rewards' && (
                    <div className="space-y-2 text-xs">
                      {userDetail.history?.referralRewards?.length === 0 ? (
                        <p className="text-center py-6 text-slate-400">No referral rewards credited yet.</p>
                      ) : (
                        <div className="divide-y divide-slate-200 dark:divide-slate-800">
                          {userDetail.history?.referralRewards?.map((rw: any) => (
                            <div key={rw.id} className="py-2.5 flex items-center justify-between">
                              <div>
                                <div className="flex items-center space-x-1.5">
                                  <span className="font-bold text-slate-900 dark:text-white">
                                    {rw.rewardLevel === 2 || rw.reference?.includes('L2') ? 'Level 2 Bonus' : 'Level 1 Direct Bonus'}
                                  </span>
                                  <span className="px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                                    {rw.percentage}%
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-400">
                                  Ref: {rw.reference} • {new Date(rw.createdAt).toLocaleString()}
                                </p>
                              </div>
                              <span className="font-bold font-mono text-blue-600 dark:text-blue-400 text-sm">
                                +${Number(rw.amount || 0).toFixed(4)} USDT
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab Content: LEDGER */}
                  {activeDetailTab === 'ledger' && (
                    <div className="space-y-2 text-xs">
                      {userDetail.history?.ledger?.length === 0 ? (
                        <p className="text-center py-6 text-slate-400">No ledger entries found.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-72 overflow-y-auto">
                          {userDetail.history?.ledger?.map((l: any) => (
                            <div
                              key={l.id}
                              className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between"
                            >
                              <div>
                                <span className="font-bold text-slate-900 dark:text-white uppercase text-[10px] bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                  {l.type}
                                </span>
                                <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">{l.description}</p>
                                <p className="text-[10px] text-slate-400">{new Date(l.createdAt).toLocaleString()}</p>
                              </div>
                              <div className="text-right font-mono">
                                <p className={`font-bold ${l.amount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                  {l.amount >= 0 ? '+' : ''}{Number(l.amount || 0).toFixed(2)} USDT
                                </p>
                                <p className="text-[10px] text-slate-400">
                                  Bal: ${Number(l.balanceAfter || 0).toFixed(2)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab Content: AUDIT TRAIL */}
                  {activeDetailTab === 'audit' && (
                    <div className="space-y-2 text-xs">
                      {userDetail.history?.auditLogs?.length === 0 ? (
                        <p className="text-center py-6 text-slate-400">No admin audit events recorded for this user.</p>
                      ) : (
                        <div className="space-y-2 max-h-72 overflow-y-auto">
                          {userDetail.history?.auditLogs?.map((al: any) => (
                            <div
                              key={al.id}
                              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900 dark:text-white font-mono text-[11px]">
                                  {al.action}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {new Date(al.timestamp).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                                {al.reason || 'Admin operation recorded'}
                              </p>
                              <div className="flex items-center space-x-2 text-[10px] text-slate-400">
                                <span>Actor: {al.actorEmail} ({al.actorRole})</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/75 dark:bg-slate-900/50">
              <span className="text-[11px] text-slate-400">
                Authoritative data verified against Supabase database & balance service.
              </span>
              <button
                onClick={() => {
                  setSelectedUserId(null);
                  setUserDetail(null);
                }}
                className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 font-semibold text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* STATUS UPDATE MODAL */}
      {/* ========================================== */}
      {statusModalUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Shield className="w-4 h-4 text-blue-600" />
                <span>Update Account Status</span>
              </h3>
              <button onClick={() => setStatusModalUser(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Updating account status for <strong>{statusModalUser.fullName}</strong> ({statusModalUser.email}).
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Select New Status</label>
                <select
                  value={newStatus}
                  onChange={e => setNewStatus(e.target.value as any)}
                  className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">Active (Full platform access)</option>
                  <option value="suspended">Suspended (Login & transactions locked)</option>
                  <option value="pending_verification">Pending Verification</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Reason (Recorded in Audit Log)</label>
                <input
                  type="text"
                  value={statusReason}
                  onChange={e => setStatusReason(e.target.value)}
                  placeholder="e.g. Risk review, user request, or compliance clearance"
                  className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setStatusModalUser(null)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateStatus}
                disabled={isUpdatingStatus}
                className="px-4 py-1.5 rounded-xl bg-blue-600 text-white font-semibold text-xs hover:bg-blue-700 disabled:opacity-50 cursor-pointer flex items-center space-x-1.5"
              >
                {isUpdatingStatus && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Status Update</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* TEST USER MODAL */}
      {/* ========================================== */}
      {testUserModalUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <FlaskConical className="w-4 h-4 text-amber-600" />
                <span>Manage Test-User Status</span>
              </h3>
              <button onClick={() => setTestUserModalUser(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Modify test user classification for <strong>{testUserModalUser.fullName}</strong>.
            </p>

            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <p className="font-semibold">What is a Test User?</p>
              <p className="text-[11px]">
                Test users can verify deposits without live BSC RPC waiting and receive simplified OTPs for QA testing. Test users cannot modify this flag themselves.
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Status Mode</label>
                <select
                  value={newTestStatus ? 'true' : 'false'}
                  onChange={e => setNewTestStatus(e.target.value === 'true')}
                  className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="false">Normal User (Standard On-Chain & Live Verification)</option>
                  <option value="true">Test User (Internal Testing & Simulation Mode)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Reason for Audit Log</label>
                <input
                  type="text"
                  value={testReason}
                  onChange={e => setTestReason(e.target.value)}
                  placeholder="e.g. QA simulation, onboarding sandbox verification"
                  className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setTestUserModalUser(null)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateTestStatus}
                disabled={isUpdatingTest}
                className="px-4 py-1.5 rounded-xl bg-amber-600 text-white font-semibold text-xs hover:bg-amber-700 disabled:opacity-50 cursor-pointer flex items-center space-x-1.5"
              >
                {isUpdatingTest && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Test Status</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* FUND LOCK MODAL */}
      {/* ========================================== */}
      {fundLockModalUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Lock className="w-4 h-4 text-blue-600" />
                <span>30-Day Fund Lock Management</span>
              </h3>
              <button onClick={() => setFundLockModalUser(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Apply or release fund withdrawal lock for <strong>{fundLockModalUser.fullName}</strong>.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Action</label>
                <select
                  value={fundLockAction}
                  onChange={e => setFundLockAction(e.target.value as any)}
                  className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="lock">Apply 30-Day Lock</option>
                  <option value="unlock">Release Fund Lock Immediately</option>
                </select>
              </div>

              {fundLockAction === 'lock' && (
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Duration (Days)</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={fundLockDays}
                    onChange={e => setFundLockDays(Number(e.target.value))}
                    className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Reason for Audit Log</label>
                <input
                  type="text"
                  value={fundLockReason}
                  onChange={e => setFundLockReason(e.target.value)}
                  placeholder="e.g. Deposit holding period, voluntary reinvestment lock, or admin review"
                  className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setFundLockModalUser(null)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateFundLock}
                disabled={isUpdatingFundLock}
                className="px-4 py-1.5 rounded-xl bg-blue-600 text-white font-semibold text-xs hover:bg-blue-700 disabled:opacity-50 cursor-pointer flex items-center space-x-1.5"
              >
                {isUpdatingFundLock && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Fund Lock</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
