import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import {
  WithdrawalItem,
  AdminWithdrawalDetailResponse,
  PayoutVerificationResponse,
} from '../types';
import {
  ArrowUpRight,
  Search,
  Filter,
  RefreshCw,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ExternalLink,
  DollarSign,
  Copy,
  Check,
  X,
  FileText,
  Calendar,
  Layers,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  Hash,
  Wallet,
  User,
  Info,
  Send,
  Lock,
  History,
  AlertCircle,
  FlaskConical,
} from 'lucide-react';

interface AdminWithdrawalsViewProps {
  onRefreshParentStats?: () => void;
}

export const AdminWithdrawalsView: React.FC<AdminWithdrawalsViewProps> = ({ onRefreshParentStats }) => {
  // List state
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Pagination & Filtering state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [walletFilter, setWalletFilter] = useState('');
  const [txHashFilter, setTxHashFilter] = useState('');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7days' | '30days' | 'custom'>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Details drawer state
  const [selectedWithdrawalId, setSelectedWithdrawalId] = useState<string | null>(null);
  const [withdrawalDetail, setWithdrawalDetail] = useState<AdminWithdrawalDetailResponse | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<'overview' | 'composition' | 'fraud' | 'ledger' | 'audit'>('overview');

  // Manual Payout Modal State
  const [payModalWithdrawal, setPayModalWithdrawal] = useState<WithdrawalItem | null>(null);
  const [payoutTxHash, setPayoutTxHash] = useState('');
  const [payoutNotes, setPayoutNotes] = useState('');
  const [isVerifyingPayout, setIsVerifyingPayout] = useState(false);
  const [verificationResult, setVerificationResult] = useState<PayoutVerificationResponse | null>(null);
  const [isSubmittingPayout, setIsSubmittingPayout] = useState(false);

  // Rejection Modal State
  const [rejectModalWithdrawal, setRejectModalWithdrawal] = useState<WithdrawalItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmittingRejection, setIsSubmittingRejection] = useState(false);

  // Copy helper
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load withdrawals from backend
  const loadWithdrawals = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let filterStart: string | undefined = undefined;
      let filterEnd: string | undefined = undefined;

      if (dateFilter === 'today') {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        filterStart = start.toISOString();
      } else if (dateFilter === '7days') {
        const start = new Date(Date.now() - 7 * 86400 * 1000);
        filterStart = start.toISOString();
      } else if (dateFilter === '30days') {
        const start = new Date(Date.now() - 30 * 86400 * 1000);
        filterStart = start.toISOString();
      } else if (dateFilter === 'custom') {
        if (startDate) filterStart = new Date(startDate).toISOString();
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          filterEnd = end.toISOString();
        }
      }

      const res = await api.getAdminWithdrawals({
        page: currentPage,
        limit: pageSize,
        search: debouncedSearch.trim() || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        walletAddress: walletFilter.trim() || undefined,
        txHash: txHashFilter.trim() || undefined,
        minAmount: minAmount && !isNaN(Number(minAmount)) ? Number(minAmount) : undefined,
        maxAmount: maxAmount && !isNaN(Number(maxAmount)) ? Number(maxAmount) : undefined,
        startDate: filterStart,
        endDate: filterEnd,
      });

      if (res && res.withdrawals) {
        setWithdrawals(res.withdrawals);
        setTotalCount(res.total);
        setTotalPages(res.totalPages || 1);
      } else {
        setWithdrawals([]);
        setTotalCount(0);
        setTotalPages(1);
      }
    } catch (err: any) {
      console.error('[Admin Withdrawals Error]:', err);
      setError(err?.message || 'Failed to load withdrawal requests.');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, statusFilter, walletFilter, txHashFilter, minAmount, maxAmount, dateFilter, startDate, endDate]);

  useEffect(() => {
    loadWithdrawals();
  }, [loadWithdrawals]);

  // Load withdrawal detail
  const loadDetail = async (id: string) => {
    setSelectedWithdrawalId(id);
    setIsLoadingDetail(true);
    setWithdrawalDetail(null);
    try {
      const res = await api.getAdminWithdrawalById(id);
      setWithdrawalDetail(res);
    } catch (err: any) {
      console.error('[Admin Withdrawal Detail Error]:', err);
      setError(err?.message || 'Failed to load withdrawal details.');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // On-Chain verification helper
  const handleVerifyPayout = async () => {
    if (!payModalWithdrawal) return;
    const cleanHash = payoutTxHash.trim();
    if (!cleanHash) {
      setError('Please enter a 64-hex BSC transaction hash first.');
      return;
    }

    setIsVerifyingPayout(true);
    setVerificationResult(null);
    setError(null);

    try {
      const result = await api.verifyAdminWithdrawalPayout(payModalWithdrawal.id, {
        txHash: cleanHash,
      });
      setVerificationResult(result);
    } catch (err: any) {
      setVerificationResult({
        isValid: false,
        status: 'invalid',
        errorMessage: err?.message || 'On-chain verification failed.',
      });
    } finally {
      setIsVerifyingPayout(false);
    }
  };

  // Submit manual payout confirmation
  const handleSubmitPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModalWithdrawal) return;
    const cleanHash = payoutTxHash.trim();
    if (!cleanHash) {
      setError('A valid BSC Transaction Hash is required to confirm payout.');
      return;
    }

    setIsSubmittingPayout(true);
    setError(null);
    try {
      const res = await api.updateWithdrawalAction(payModalWithdrawal.id, {
        action: 'paid',
        txHash: cleanHash,
        adminNotes: payoutNotes.trim() || undefined,
      });

      if (res.success) {
        setSuccessMessage(`Withdrawal #${payModalWithdrawal.id} successfully marked as PAID on BSC.`);
        setPayModalWithdrawal(null);
        setPayoutTxHash('');
        setPayoutNotes('');
        setVerificationResult(null);
        loadWithdrawals();
        if (selectedWithdrawalId === payModalWithdrawal.id) {
          loadDetail(payModalWithdrawal.id);
        }
        if (onRefreshParentStats) onRefreshParentStats();
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to mark withdrawal as paid.');
    } finally {
      setIsSubmittingPayout(false);
    }
  };

  // Submit rejection
  const handleSubmitRejection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalWithdrawal) return;
    const cleanReason = rejectionReason.trim();
    if (!cleanReason) {
      setError('A specific rejection reason is mandatory.');
      return;
    }

    setIsSubmittingRejection(true);
    setError(null);
    try {
      const res = await api.updateWithdrawalAction(rejectModalWithdrawal.id, {
        action: 'rejected',
        reason: cleanReason,
        adminNotes: cleanReason,
      });

      if (res.success) {
        setSuccessMessage(`Withdrawal #${rejectModalWithdrawal.id} rejected. Held funds refunded to user ledger.`);
        setRejectModalWithdrawal(null);
        setRejectionReason('');
        loadWithdrawals();
        if (selectedWithdrawalId === rejectModalWithdrawal.id) {
          loadDetail(rejectModalWithdrawal.id);
        }
        if (onRefreshParentStats) onRefreshParentStats();
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to reject withdrawal.');
    } finally {
      setIsSubmittingRejection(false);
    }
  };

  // Status badge styling helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Paid
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" />
            Pending Review
          </span>
        );
      case 'under_review':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Eye className="w-3 h-3" />
            Under Review
          </span>
        );
      case 'approved':
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            <Send className="w-3 h-3" />
            Processing Payout
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" />
            Rejected
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
            <X className="w-3 h-3" />
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div id="admin-withdrawals-view" className="space-y-4">
      {/* Alert Notices */}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="p-1 hover:bg-rose-100 dark:hover:bg-rose-900 rounded">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900 rounded">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header & Quick Context */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <ArrowUpRight className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white">Admin Withdrawal Management</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Authoritative 9% fee verification, on-chain payout tracking, anti-fraud review, and manual BSC disbursement.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="refresh-withdrawals-btn"
            onClick={() => loadWithdrawals()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-3">
        {/* Row 1: Search & Status Tabs */}
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="withdrawal-search-input"
              type="text"
              placeholder="Search user name, email, ID, ref, wallet address, or BSC tx hash..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-rose-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
            {[
              { id: 'all', label: 'All' },
              { id: 'pending', label: 'Pending' },
              { id: 'under_review', label: 'Under Review' },
              { id: 'approved', label: 'Approved' },
              { id: 'paid', label: 'Paid' },
              { id: 'rejected', label: 'Rejected' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setStatusFilter(tab.id);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                  statusFilter === tab.id
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Secondary Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-1 text-xs">
          {/* Specific Wallet Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Destination Wallet
            </label>
            <input
              type="text"
              placeholder="0x..."
              value={walletFilter}
              onChange={e => {
                setWalletFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-rose-500"
            />
          </div>

          {/* TxHash Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              BSC Tx Hash
            </label>
            <input
              type="text"
              placeholder="0x..."
              value={txHashFilter}
              onChange={e => {
                setTxHashFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-rose-500"
            />
          </div>

          {/* Amount Range */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Amount Range (USDT)
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                placeholder="Min"
                value={minAmount}
                onChange={e => {
                  setMinAmount(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-1/2 px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-rose-500"
              />
              <span className="text-slate-400">-</span>
              <input
                type="number"
                placeholder="Max"
                value={maxAmount}
                onChange={e => {
                  setMaxAmount(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-1/2 px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          {/* Date Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Date Period
            </label>
            <select
              value={dateFilter}
              onChange={e => {
                setDateFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-rose-500"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>
        </div>

        {/* Custom Date Inputs if custom selected */}
        {dateFilter === 'custom' && (
          <div className="flex items-center gap-2 pt-1 text-xs">
            <div>
              <span className="text-slate-500 mr-1.5 text-[11px]">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={e => {
                  setStartDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <span className="text-slate-500 mr-1.5 text-[11px]">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={e => {
                  setEndDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Withdrawal Table */}
      <div className="rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Withdrawal ID</th>
                <th className="py-3 px-4 text-right">Gross Amount</th>
                <th className="py-3 px-4 text-right">Fee (9%)</th>
                <th className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">Net Payout</th>
                <th className="py-3 px-4">Destination BEP-20</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Request Date</th>
                <th className="py-3 px-4">Paid Date</th>
                <th className="py-3 px-4">BSC Tx Hash</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-rose-500" />
                    Loading withdrawal requests...
                  </td>
                </tr>
              ) : withdrawals.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <ArrowUpRight className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600 opacity-60" />
                    No withdrawals match the selected filters.
                  </td>
                </tr>
              ) : (
                withdrawals.map(wd => {
                  const isTestUser = Boolean(wd.isTestUser);
                  const isPending = wd.status === 'pending' || wd.status === 'under_review' || wd.status === 'approved' || wd.status === 'processing';

                  return (
                    <tr
                      key={wd.id}
                      className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                        isTestUser ? 'bg-amber-500/[0.02]' : ''
                      }`}
                    >
                      {/* User Name & Email */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {wd.userFullName || `User #${wd.userId}`}
                            </span>
                            {isTestUser && (
                              <span
                                title="Simulated Test Account — do not broadcast real USDT"
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                              >
                                <FlaskConical className="w-2.5 h-2.5" />
                                Test User
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {wd.userEmail || `ID: ${wd.userId}`}
                          </span>
                        </div>
                      </td>

                      {/* Withdrawal ID & Reference */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <span className="font-mono text-slate-700 dark:text-slate-300 font-medium">
                            #{wd.id}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">
                            {wd.reference || '—'}
                          </span>
                        </div>
                      </td>

                      {/* Gross Amount */}
                      <td className="py-3 px-4 text-right font-medium text-slate-800 dark:text-slate-200">
                        ${Number(wd.requestedAmount).toFixed(2)}
                      </td>

                      {/* 9% Fee */}
                      <td className="py-3 px-4 text-right text-rose-600 dark:text-rose-400 font-medium">
                        -${Number(wd.feeAmount || wd.requestedAmount * 0.09).toFixed(2)}
                      </td>

                      {/* Net Payout */}
                      <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                        ${Number(wd.netAmount).toFixed(2)}
                      </td>

                      {/* Destination Wallet */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                            {wd.destinationAddress
                              ? `${wd.destinationAddress.slice(0, 6)}...${wd.destinationAddress.slice(-4)}`
                              : '—'}
                          </span>
                          {wd.destinationAddress && (
                            <>
                              <button
                                onClick={() => copyToClipboard(wd.destinationAddress, `wallet-${wd.id}`)}
                                title="Copy Wallet Address"
                                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"
                              >
                                {copiedKey === `wallet-${wd.id}` ? (
                                  <Check className="w-3 h-3 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                              <a
                                href={`https://bscscan.com/address/${wd.destinationAddress}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="View on BSCScan"
                                className="p-1 text-slate-400 hover:text-rose-500 rounded"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">{getStatusBadge(wd.status)}</td>

                      {/* Request Date */}
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {new Date(wd.createdAt).toLocaleDateString()} {new Date(wd.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>

                      {/* Paid Date */}
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {wd.paidAt ? (
                          <span>
                            {new Date(wd.paidAt).toLocaleDateString()} {new Date(wd.paidAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* BSC Tx Hash */}
                      <td className="py-3 px-4">
                        {wd.txHash || wd.payoutTxHash ? (
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                              {(wd.txHash || wd.payoutTxHash)!.slice(0, 6)}...{(wd.txHash || wd.payoutTxHash)!.slice(-4)}
                            </span>
                            <button
                              onClick={() => copyToClipboard(wd.txHash || wd.payoutTxHash || '', `tx-${wd.id}`)}
                              title="Copy Transaction Hash"
                              className="p-1 text-slate-400 hover:text-slate-600 rounded"
                            >
                              {copiedKey === `tx-${wd.id}` ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                            <a
                              href={`https://bscscan.com/tx/${wd.txHash || wd.payoutTxHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View on BSCScan"
                              className="p-1 text-slate-400 hover:text-rose-500 rounded"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            id={`inspect-wd-${wd.id}`}
                            onClick={() => loadDetail(wd.id)}
                            title="Inspect Details"
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {isPending && (
                            <>
                              <button
                                id={`pay-wd-${wd.id}`}
                                onClick={() => {
                                  setPayModalWithdrawal(wd);
                                  setPayoutTxHash('');
                                  setPayoutNotes('');
                                  setVerificationResult(null);
                                }}
                                title="Process / Mark Paid"
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shadow-xs"
                              >
                                <Send className="w-3 h-3" />
                                Pay
                              </button>

                              <button
                                id={`reject-wd-${wd.id}`}
                                onClick={() => {
                                  setRejectModalWithdrawal(wd);
                                  setRejectionReason('');
                                }}
                                title="Reject Request"
                                className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Server-Side Pagination Controls */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div>
            Showing <span className="font-semibold text-slate-900 dark:text-white">{withdrawals.length}</span> of{' '}
            <span className="font-semibold text-slate-900 dark:text-white">{totalCount}</span> withdrawal records
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || isLoading}
                className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 font-medium">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || isLoading}
                className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* WITHDRAWAL DETAILS SLIDE-OUT DRAWER */}
      {selectedWithdrawalId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in">
          <div
            id="withdrawal-details-drawer"
            className="w-full max-w-2xl bg-white dark:bg-[#0F172A] border-l border-slate-200 dark:border-slate-800 h-full overflow-y-auto shadow-2xl flex flex-col"
          >
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white/90 dark:bg-[#0F172A]/90 backdrop-blur-sm z-10">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    Withdrawal #{selectedWithdrawalId} Details
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Comprehensive ledger, accounting impact, and audit review.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedWithdrawalId(null);
                  setWithdrawalDetail(null);
                }}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="p-5 space-y-5 flex-1">
              {isLoadingDetail ? (
                <div className="py-20 text-center text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-rose-500" />
                  Loading withdrawal details...
                </div>
              ) : !withdrawalDetail ? (
                <div className="py-20 text-center text-slate-400">
                  Withdrawal record details could not be loaded.
                </div>
              ) : (
                <>
                  {/* Test User Warning Banner if applicable */}
                  {withdrawalDetail.user?.isTestUser && (
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2.5">
                      <FlaskConical className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">SIMULATED TEST ACCOUNT</span>
                        <p className="text-[11px] mt-0.5 text-amber-700 dark:text-amber-400">
                          This user is flagged as <code className="font-mono">is_test_user = true</code>. Do NOT broadcast real USDT from your BSC admin wallet. Testing payouts simulate completion safely.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Financial Overview Cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                        Gross Requested
                      </span>
                      <span className="text-base font-bold text-slate-900 dark:text-white">
                        ${Number(withdrawalDetail.withdrawal.requestedAmount).toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">BEP-20 USDT</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/60">
                      <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 block mb-1">
                        Authoritative Fee (9%)
                      </span>
                      <span className="text-base font-bold text-rose-600 dark:text-rose-400">
                        ${Number(withdrawalDetail.withdrawal.feeAmount || withdrawalDetail.withdrawal.requestedAmount * 0.09).toFixed(2)}
                      </span>
                      <span className="text-[10px] text-rose-500/80 block mt-0.5">100% FINEXJ Revenue</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/60">
                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 block mb-1">
                        Net Payout
                      </span>
                      <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                        ${Number(withdrawalDetail.withdrawal.netAmount).toFixed(2)}
                      </span>
                      <span className="text-[10px] text-emerald-500/80 block mt-0.5">To Destination Wallet</span>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2 text-xs font-semibold">
                    {[
                      { id: 'overview', label: 'Overview' },
                      { id: 'composition', label: 'Fund Composition' },
                      { id: 'fraud', label: 'Fraud & Security' },
                      { id: 'ledger', label: 'Ledger Entries' },
                      { id: 'audit', label: 'Audit Trail' },
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveDetailTab(tab.id as any)}
                        className={`pb-2.5 px-2 border-b-2 transition-colors ${
                          activeDetailTab === tab.id
                            ? 'border-rose-500 text-rose-600 dark:text-rose-400'
                            : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* TAB 1: OVERVIEW */}
                  {activeDetailTab === 'overview' && (
                    <div className="space-y-4 text-xs">
                      {/* User Profile Info */}
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-rose-500" />
                            Requester Information
                          </span>
                          <span className="text-[11px] text-slate-400">User ID: {withdrawalDetail.user?.id}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-300">
                          <div>
                            <span className="text-slate-400 block text-[11px]">Full Name:</span>
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {withdrawalDetail.user?.fullName || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">Email:</span>
                            <span>{withdrawalDetail.user?.email || '—'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">Account Status:</span>
                            <span className="capitalize">{withdrawalDetail.user?.status || 'active'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">Registered Date:</span>
                            <span>{withdrawalDetail.user?.createdAt ? new Date(withdrawalDetail.user.createdAt).toLocaleDateString() : '—'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Destination Wallet & On-Chain Status */}
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2.5">
                        <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Wallet className="w-3.5 h-3.5 text-emerald-500" />
                          Destination BEP-20 Wallet
                        </span>
                        <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between font-mono text-[11px]">
                          <span className="break-all text-slate-800 dark:text-slate-200">
                            {withdrawalDetail.withdrawal.destinationAddress}
                          </span>
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            <button
                              onClick={() => copyToClipboard(withdrawalDetail.withdrawal.destinationAddress, 'drawer-wallet')}
                              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                            >
                              {copiedKey === 'drawer-wallet' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                            <a
                              href={`https://bscscan.com/address/${withdrawalDetail.withdrawal.destinationAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 text-slate-400 hover:text-rose-500"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>

                        {withdrawalDetail.withdrawal.txHash && (
                          <div>
                            <span className="text-slate-400 block text-[11px] mb-1">Confirmed BSC Payout Tx Hash:</span>
                            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                              <span className="break-all">{withdrawalDetail.withdrawal.txHash}</span>
                              <div className="flex items-center gap-1 shrink-0 ml-2">
                                <button
                                  onClick={() => copyToClipboard(withdrawalDetail.withdrawal.txHash!, 'drawer-tx')}
                                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                                >
                                  {copiedKey === 'drawer-tx' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                                <a
                                  href={`https://bscscan.com/tx/${withdrawalDetail.withdrawal.txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 text-slate-400 hover:text-rose-500"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Admin Notes & Timestamps */}
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-300 text-[11px]">
                          <div>
                            <span className="text-slate-400 block">Requested At:</span>
                            <span>{new Date(withdrawalDetail.withdrawal.createdAt).toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Current Status:</span>
                            <span className="capitalize font-bold text-slate-900 dark:text-white">
                              {withdrawalDetail.withdrawal.status}
                            </span>
                          </div>
                          {withdrawalDetail.withdrawal.paidAt && (
                            <div>
                              <span className="text-slate-400 block">Paid At:</span>
                              <span>{new Date(withdrawalDetail.withdrawal.paidAt).toLocaleString()}</span>
                            </div>
                          )}
                          {withdrawalDetail.withdrawal.reviewedBy && (
                            <div>
                              <span className="text-slate-400 block">Reviewed By Admin:</span>
                              <span>ID #{withdrawalDetail.withdrawal.reviewedBy}</span>
                            </div>
                          )}
                        </div>

                        {withdrawalDetail.withdrawal.adminNotes && (
                          <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                            <span className="text-slate-400 block text-[11px] font-semibold mb-0.5">Admin Notes / Rejection Reason:</span>
                            <p className="p-2 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px]">
                              {withdrawalDetail.withdrawal.adminNotes}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 2: FUND COMPOSITION & LOCK VALIDATION */}
                  {activeDetailTab === 'composition' && (
                    <div className="space-y-4 text-xs">
                      {withdrawalDetail.financialImpact ? (
                        <div className="space-y-3">
                          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
                            <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <Layers className="w-3.5 h-3.5 text-rose-500" />
                              Source Fund Breakdown
                            </span>

                            <div className="grid grid-cols-2 gap-3 text-xs">
                              <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                <span className="text-slate-400 block text-[11px]">Available Balance</span>
                                <span className="text-sm font-bold text-slate-900 dark:text-white">
                                  ${Number(withdrawalDetail.financialImpact.availableBalance).toFixed(2)}
                                </span>
                              </div>

                              <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                <span className="text-slate-400 block text-[11px]">Referral Income</span>
                                <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                                  ${Number(withdrawalDetail.financialImpact.referralEarnings).toFixed(2)}
                                </span>
                              </div>

                              <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                <span className="text-slate-400 block text-[11px]">Active Compounding Principal</span>
                                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                  ${Number(withdrawalDetail.financialImpact.activeCompoundingPrincipal).toFixed(2)}
                                </span>
                              </div>

                              <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                <span className="text-slate-400 block text-[11px]">Deposit-Locked Principal</span>
                                <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
                                  ${Number(withdrawalDetail.financialImpact.depositLockedPrincipal).toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Lock Compliance Status */}
                          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                            <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <Lock className="w-3.5 h-3.5 text-amber-500" />
                              30-Day Lock Rule Evaluation
                            </span>

                            <div className="space-y-1.5 text-slate-600 dark:text-slate-300 text-[11px]">
                              <div className="flex items-center justify-between">
                                <span>30-Day Account Maturity:</span>
                                <span className={withdrawalDetail.financialImpact.is30DaysOld ? 'text-emerald-500 font-bold' : 'text-amber-500 font-bold'}>
                                  {withdrawalDetail.financialImpact.is30DaysOld ? 'Matured (≥ 30 Days)' : 'Within Initial 30-Day Window'}
                                </span>
                              </div>

                              <div className="flex items-center justify-between">
                                <span>Touches Protected Fund:</span>
                                <span className={withdrawalDetail.financialImpact.touchesProtectedFund ? 'text-rose-500 font-bold' : 'text-slate-400'}>
                                  {withdrawalDetail.financialImpact.touchesProtectedFund ? 'Yes (Confirmed by User)' : 'No'}
                                </span>
                              </div>

                              <div className="flex items-center justify-between">
                                <span>Eligible Principal After Withdrawal:</span>
                                <span className="font-bold text-slate-900 dark:text-white">
                                  ${Number(withdrawalDetail.financialImpact.eligiblePrincipalBalance || withdrawalDetail.financialImpact.remainingPrincipal || 0).toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-6 text-center text-slate-400">
                          Fund composition details not available for this withdrawal.
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: FRAUD & SIGNALS */}
                  {activeDetailTab === 'fraud' && (
                    <div className="space-y-4 text-xs">
                      {/* Wallet Duplication Check */}
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                        <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          {withdrawalDetail.fraudReview.walletDuplication.isReused ? (
                            <ShieldAlert className="w-4 h-4 text-rose-500" />
                          ) : (
                            <ShieldCheck className="w-4 h-4 text-emerald-500" />
                          )}
                          Wallet Duplication Assessment
                        </span>
                        {withdrawalDetail.fraudReview.walletDuplication.isReused ? (
                          <div className="p-2.5 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300">
                            <span className="font-bold">SUSPICIOUS:</span> This destination wallet address is associated with multiple user accounts:
                            <span className="font-mono block mt-1">
                              {withdrawalDetail.fraudReview.walletDuplication.matchingUserIds.join(', ')}
                            </span>
                          </div>
                        ) : (
                          <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                            Clean: Destination wallet address is uniquely mapped to this user account.
                          </p>
                        )}
                      </div>

                      {/* Rapid Cycle Check */}
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                        <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          {withdrawalDetail.fraudReview.rapidCycle.isRapidCycle ? (
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          )}
                          Rapid Deposit-Withdrawal Cycle Check
                        </span>
                        {withdrawalDetail.fraudReview.rapidCycle.isRapidCycle ? (
                          <div className="p-2.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300">
                            Rapid withdrawal detected shortly following a recent deposit. Verify provenance before payout.
                          </div>
                        ) : (
                          <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                            Clean: No rapid deposit-withdrawal cycling detected for this user.
                          </p>
                        )}
                      </div>

                      {/* System Fraud Signals */}
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                        <span className="font-bold text-slate-900 dark:text-white">Active Fraud Signals</span>
                        {withdrawalDetail.fraudReview.fraudSignals.length === 0 ? (
                          <p className="text-slate-400 text-[11px]">No active fraud signals on record for this account.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {withdrawalDetail.fraudReview.fraudSignals.map((fs: any) => (
                              <div
                                key={fs.id}
                                className="p-2 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-[11px]"
                              >
                                <span className="font-semibold text-rose-500">{fs.signal_type}</span>
                                <span className="text-slate-400">{new Date(fs.created_at).toLocaleDateString()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 4: LEDGER ENTRIES */}
                  {activeDetailTab === 'ledger' && (
                    <div className="space-y-2 text-xs">
                      {withdrawalDetail.ledgerHistory.length === 0 ? (
                        <div className="p-6 text-center text-slate-400">
                          No ledger entries found for this withdrawal.
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                          {withdrawalDetail.ledgerHistory.map((le: any) => (
                            <div key={le.id} className="py-2.5 flex items-center justify-between">
                              <div className="space-y-0.5">
                                <span className="font-semibold text-slate-900 dark:text-white block">
                                  {le.type}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {le.description || 'Ledger event'}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className={`font-bold ${le.amount > 0 ? 'text-emerald-500' : 'text-slate-700 dark:text-slate-300'}`}>
                                  {le.amount > 0 ? `+${Number(le.amount).toFixed(2)}` : `${Number(le.amount).toFixed(2)}`} USDT
                                </span>
                                <span className="block text-[10px] text-slate-400">
                                  Bal: ${Number(le.balance_after || 0).toFixed(2)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 5: AUDIT TRAIL */}
                  {activeDetailTab === 'audit' && (
                    <div className="space-y-2 text-xs">
                      {withdrawalDetail.auditLogs.length === 0 ? (
                        <div className="p-6 text-center text-slate-400">
                          No audit entries recorded for this withdrawal yet.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {withdrawalDetail.auditLogs.map((log: any) => (
                            <div
                              key={log.id}
                              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1 text-[11px]"
                            >
                              <div className="flex items-center justify-between font-semibold">
                                <span className="text-rose-600 dark:text-rose-400 font-mono">{log.action}</span>
                                <span className="text-slate-400">{new Date(log.created_at || log.timestamp).toLocaleString()}</span>
                              </div>
                              <div className="text-slate-600 dark:text-slate-300">
                                {log.reason || log.details || 'Administrative event'}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Actor: {log.actor_role} ({log.actor_id})
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

            {/* Drawer Footer Actions */}
            {withdrawalDetail && (withdrawalDetail.withdrawal.status === 'pending' || withdrawalDetail.withdrawal.status === 'under_review' || withdrawalDetail.withdrawal.status === 'approved' || withdrawalDetail.withdrawal.status === 'processing') && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-end gap-2.5">
                <button
                  onClick={() => {
                    setRejectModalWithdrawal(withdrawalDetail.withdrawal);
                    setRejectionReason('');
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors"
                >
                  Reject Request
                </button>
                <button
                  onClick={() => {
                    setPayModalWithdrawal(withdrawalDetail.withdrawal);
                    setPayoutTxHash('');
                    setPayoutNotes('');
                    setVerificationResult(null);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  Process & Complete Payout
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MANUAL PAYOUT WORKFLOW MODAL */}
      {payModalWithdrawal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div
            id="pay-withdrawal-modal"
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
          >
            {/* Modal Header */}
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-100 dark:border-emerald-900/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Manual BEP-20 Payout Confirmation
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Withdrawal #{payModalWithdrawal.id} • {payModalWithdrawal.userFullName || `User #${payModalWithdrawal.userId}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setPayModalWithdrawal(null);
                  setVerificationResult(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitPayout} className="p-5 space-y-4 text-xs">
              {/* Test User Notice */}
              {payModalWithdrawal.isTestUser && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-[11px] flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>
                    <strong>SIMULATED TEST ACCOUNT:</strong> Real BSC USDT transfer is NOT required. You may enter any valid format hash or simulated hash to test completion.
                  </span>
                </div>
              )}

              {/* Disbursement Summary */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Gross Amount:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    ${Number(payModalWithdrawal.requestedAmount).toFixed(2)} USDT
                  </span>
                </div>
                <div className="flex justify-between text-rose-500">
                  <span>Authoritative Fee (9%):</span>
                  <span className="font-semibold">
                    -${Number(payModalWithdrawal.feeAmount || payModalWithdrawal.requestedAmount * 0.09).toFixed(2)} USDT
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                  <span>Required Payout (Net):</span>
                  <span>${Number(payModalWithdrawal.netAmount).toFixed(2)} USDT</span>
                </div>
              </div>

              {/* Destination Address Confirmation */}
              <div className="space-y-1">
                <label className="block font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                  Send exactly ${Number(payModalWithdrawal.netAmount).toFixed(2)} USDT to BEP-20 Wallet:
                </label>
                <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between font-mono text-[11px]">
                  <span className="break-all text-slate-800 dark:text-slate-200">
                    {payModalWithdrawal.destinationAddress}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(payModalWithdrawal.destinationAddress, 'modal-wallet')}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white ml-2 shrink-0"
                  >
                    {copiedKey === 'modal-wallet' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Real BSC Transaction Hash Input */}
              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                  Real BSC Transaction Hash (TxID) <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    id="payout-txhash-input"
                    type="text"
                    required
                    placeholder="0x..."
                    value={payoutTxHash}
                    onChange={e => {
                      setPayoutTxHash(e.target.value);
                      setVerificationResult(null);
                    }}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    id="verify-onchain-btn"
                    onClick={handleVerifyPayout}
                    disabled={!payoutTxHash.trim() || isVerifyingPayout}
                    className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold disabled:opacity-40 transition-colors whitespace-nowrap"
                  >
                    {isVerifyingPayout ? 'Verifying...' : 'Verify On-Chain'}
                  </button>
                </div>
              </div>

              {/* Verification Result Feedback */}
              {verificationResult && (
                <div
                  className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                    verificationResult.isValid
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
                      : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    {verificationResult.isValid ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-500" />
                    )}
                    <span>
                      {verificationResult.isValid ? 'Valid BSC Transaction' : 'Verification Issue Detected'}
                    </span>
                  </div>
                  {verificationResult.isValid ? (
                    <div className="text-[11px] space-y-0.5">
                      <div>Transferred: ${verificationResult.amount?.toFixed(2)} USDT</div>
                      <div>Confirmations: {verificationResult.confirmations} / {verificationResult.requiredConfirmations || 12} blocks</div>
                      {verificationResult.isTestAccount && (
                        <div className="text-amber-500 font-semibold">Simulated test account verified</div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[11px]">{verificationResult.errorMessage}</div>
                  )}
                </div>
              )}

              {/* Admin Notes */}
              <div className="space-y-1">
                <label className="block font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                  Admin Payout Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Manual payout dispatched via Safe Multisig..."
                  value={payoutNotes}
                  onChange={e => setPayoutNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Modal Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setPayModalWithdrawal(null);
                    setVerificationResult(null);
                  }}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="confirm-payout-submit-btn"
                  disabled={isSubmittingPayout || !payoutTxHash.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isSubmittingPayout ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Processing Payout...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Confirm & Mark Paid
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REJECTION MODAL */}
      {rejectModalWithdrawal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div
            id="reject-withdrawal-modal"
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
          >
            <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border-b border-rose-100 dark:border-rose-900/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  <XCircle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Reject Withdrawal Request</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Withdrawal #{rejectModalWithdrawal.id} (${rejectModalWithdrawal.requestedAmount} USDT)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRejectModalWithdrawal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitRejection} className="p-5 space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-[11px]">
                <span className="font-bold block mb-0.5">Automated Accounting Refund:</span>
                Held funds (${Number(rejectModalWithdrawal.requestedAmount).toFixed(2)} USDT) will be restored to the user's available balance in the immutable ledger.
              </div>

              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                  Mandatory Rejection Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  id="rejection-reason-input"
                  placeholder="Explain why this withdrawal is being rejected (e.g. invalid wallet address format, verification failure, suspicious activity)..."
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-rose-500 resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setRejectModalWithdrawal(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="confirm-rejection-btn"
                  disabled={isSubmittingRejection || !rejectionReason.trim()}
                  className="px-4 py-2 rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isSubmittingRejection ? 'Rejecting...' : 'Confirm Rejection & Refund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
