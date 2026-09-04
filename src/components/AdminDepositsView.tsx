import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { DepositItem, AdminDepositDetailResponse } from '../types';
import {
  ArrowDownRight,
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
  Award,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  Lock,
  User,
  ShieldCheck,
  CheckCircle,
  Hash,
} from 'lucide-react';

interface AdminDepositsViewProps {
  onRefreshParentStats?: () => void;
}

export const AdminDepositsView: React.FC<AdminDepositsViewProps> = ({ onRefreshParentStats }) => {
  // Deposit list state
  const [deposits, setDeposits] = useState<DepositItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Pagination & Filtering state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirming' | 'confirmed' | 'rejected'>('all');
  const [amountFilter, setAmountFilter] = useState<'all' | 'qualifying' | 'below_min' | 'custom'>('all');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7days' | '30days' | 'custom'>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [minimumDepositAmount, setMinimumDepositAmount] = useState<number>(300);

  // Deposit details drawer state
  const [selectedDepositId, setSelectedDepositId] = useState<string | null>(null);
  const [depositDetail, setDepositDetail] = useState<AdminDepositDetailResponse | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<'details' | 'history' | 'rewards' | 'audit'>('details');

  // Action modals state
  const [confirmModalDeposit, setConfirmModalDeposit] = useState<DepositItem | null>(null);
  const [confirmNotes, setConfirmNotes] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  const [rejectModalDeposit, setRejectModalDeposit] = useState<DepositItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Blockchain verification state
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<{ id: string; message: string; success: boolean } | null>(null);

  // Proof Image Preview Modal
  const [previewProofUrl, setPreviewProofUrl] = useState<string | null>(null);

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
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load deposit list
  const loadDeposits = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let filterMin: number | undefined = undefined;
      let filterMax: number | undefined = undefined;

      if (amountFilter === 'qualifying') {
        filterMin = minimumDepositAmount;
      } else if (amountFilter === 'below_min') {
        filterMax = minimumDepositAmount - 0.01;
      } else if (amountFilter === 'custom') {
        if (minAmount && !isNaN(Number(minAmount))) filterMin = Number(minAmount);
        if (maxAmount && !isNaN(Number(maxAmount))) filterMax = Number(maxAmount);
      }

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

      const res = await api.getAdminDeposits({
        page: currentPage,
        limit: pageSize,
        search: debouncedSearch.trim() || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        minAmount: filterMin,
        maxAmount: filterMax,
        startDate: filterStart,
        endDate: filterEnd,
      });

      if (res.deposits) {
        setDeposits(res.deposits);
      }
      if (res.pagination) {
        setTotalPages(res.pagination.totalPages);
        setTotalCount(res.pagination.total);
      } else {
        setTotalCount(res.deposits.length);
        setTotalPages(Math.ceil(res.deposits.length / pageSize) || 1);
      }
      if (res.minimumDepositAmount) {
        setMinimumDepositAmount(res.minimumDepositAmount);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load deposit list.');
    } finally {
      setIsLoading(false);
    }
  }, [
    currentPage,
    pageSize,
    debouncedSearch,
    statusFilter,
    amountFilter,
    minAmount,
    maxAmount,
    dateFilter,
    startDate,
    endDate,
    minimumDepositAmount,
  ]);

  useEffect(() => {
    loadDeposits();
  }, [loadDeposits]);

  // Load deposit details
  const loadDepositDetail = async (depositId: string) => {
    setIsLoadingDetail(true);
    try {
      const res = await api.getAdminDepositDetail(depositId);
      setDepositDetail(res);
      if (res.minimumDepositAmount) {
        setMinimumDepositAmount(res.minimumDepositAmount);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load deposit details.');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const openDepositDetail = (depositId: string) => {
    setSelectedDepositId(depositId);
    setActiveDetailTab('details');
    loadDepositDetail(depositId);
  };

  const closeDepositDetail = () => {
    setSelectedDepositId(null);
    setDepositDetail(null);
  };

  // BSC on-chain verification handler
  const handleVerifyOnChain = async (depositId: string) => {
    setVerifyingId(depositId);
    setVerificationResult(null);
    try {
      const res = await api.verifyAdminDeposit(depositId);
      if (res.success) {
        setVerificationResult({
          id: depositId,
          success: true,
          message: res.message || 'Deposit successfully verified on BNB Smart Chain.',
        });
        loadDeposits();
        if (selectedDepositId === depositId) {
          loadDepositDetail(depositId);
        }
        if (onRefreshParentStats) onRefreshParentStats();
      } else {
        setVerificationResult({
          id: depositId,
          success: false,
          message: res.error || res.message || 'Deposit verification check did not confirm.',
        });
      }
    } catch (err: any) {
      setVerificationResult({
        id: depositId,
        success: false,
        message: err.message || 'Failed to query BNB Smart Chain RPC.',
      });
    } finally {
      setVerifyingId(null);
    }
  };

  // Confirm deposit handler
  const handleConfirmDeposit = async () => {
    if (!confirmModalDeposit) return;
    setIsConfirming(true);
    setError(null);
    try {
      const res = await api.updateDepositAction(confirmModalDeposit.id, {
        action: 'confirmed',
        adminNotes: confirmNotes.trim() || 'Admin confirmed deposit',
      });
      if (res.success) {
        setSuccessMessage(`Deposit #${confirmModalDeposit.id} confirmed successfully.`);
        setConfirmModalDeposit(null);
        setConfirmNotes('');
        loadDeposits();
        if (selectedDepositId === confirmModalDeposit.id) {
          loadDepositDetail(confirmModalDeposit.id);
        }
        if (onRefreshParentStats) onRefreshParentStats();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to confirm deposit.');
    } finally {
      setIsConfirming(false);
    }
  };

  // Reject deposit handler
  const handleRejectDeposit = async () => {
    if (!rejectModalDeposit) return;
    if (!rejectReason.trim()) {
      setError('A rejection reason is required.');
      return;
    }
    setIsRejecting(true);
    setError(null);
    try {
      const res = await api.updateDepositAction(rejectModalDeposit.id, {
        action: 'rejected',
        adminNotes: rejectReason.trim(),
      });
      if (res.success) {
        setSuccessMessage(`Deposit #${rejectModalDeposit.id} rejected.`);
        setRejectModalDeposit(null);
        setRejectReason('');
        loadDeposits();
        if (selectedDepositId === rejectModalDeposit.id) {
          loadDepositDetail(rejectModalDeposit.id);
        }
        if (onRefreshParentStats) onRefreshParentStats();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to reject deposit.');
    } finally {
      setIsRejecting(false);
    }
  };

  // Format dates
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const formatShortHash = (hash?: string) => {
    if (!hash) return '—';
    if (hash.length <= 14) return hash;
    return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
  };

  return (
    <div id="admin-deposits-view" className="space-y-6">
      {/* Notifications */}
      {successMessage && (
        <div id="admin-deposits-success" className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-emerald-800 animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span className="text-sm font-medium">{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div id="admin-deposits-error" className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-rose-800 animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-600 hover:text-rose-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {verificationResult && (
        <div
          id="admin-deposits-verify-result"
          className={`p-4 rounded-xl flex items-center justify-between animate-fade-in border ${
            verificationResult.success ? 'bg-blue-50 border-blue-200 text-blue-900' : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {verificationResult.success ? (
              <ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            )}
            <span className="text-sm font-medium">{verificationResult.message}</span>
          </div>
          <button onClick={() => setVerificationResult(null)} className="text-slate-500 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Quick Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ArrowDownRight className="w-6 h-6 text-emerald-600" />
            Deposit Management
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Review, verify BEP-20 on-chain receipts, and confirm institutional USDT deposits with atomic double-entry accounting.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-semibold text-slate-700">
            <span>Qualifying Threshold:</span>
            <span className="text-emerald-700 font-bold">${minimumDepositAmount} USDT</span>
          </div>
          <button
            id="btn-refresh-deposits"
            onClick={loadDeposits}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search Query */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="input-deposit-search"
              type="text"
              placeholder="Search user, email, txHash..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              id="select-deposit-status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
            >
              <option value="all">All Deposit Statuses</option>
              <option value="pending">Pending Review</option>
              <option value="confirming">Confirming (BSC)</option>
              <option value="confirmed">Confirmed</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {/* Amount Filter */}
          <div>
            <select
              id="select-deposit-amount-preset"
              value={amountFilter}
              onChange={(e) => {
                setAmountFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
            >
              <option value="all">All Amounts</option>
              <option value="qualifying">Qualifying (≥ ${minimumDepositAmount} USDT)</option>
              <option value="below_min">Below Minimum (&lt; ${minimumDepositAmount} USDT)</option>
              <option value="custom">Custom Amount Range</option>
            </select>
          </div>

          {/* Date Filter */}
          <div>
            <select
              id="select-deposit-date-preset"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>
        </div>

        {/* Custom Filters expandable bar */}
        {(amountFilter === 'custom' || dateFilter === 'custom') && (
          <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
            {amountFilter === 'custom' && (
              <>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Min Amount (USDT)</label>
                  <input
                    type="number"
                    placeholder="e.g. 100"
                    value={minAmount}
                    onChange={(e) => {
                      setMinAmount(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Max Amount (USDT)</label>
                  <input
                    type="number"
                    placeholder="e.g. 5000"
                    value={maxAmount}
                    onChange={(e) => {
                      setMaxAmount(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </>
            )}

            {dateFilter === 'custom' && (
              <>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700"
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Deposit Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table id="table-admin-deposits" className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4">User</th>
                <th className="py-3.5 px-4">Amount</th>
                <th className="py-3.5 px-4">Tx Hash & Network</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Created Date</th>
                <th className="py-3.5 px-4">Confirmed / Eligibility</th>
                <th className="py-3.5 px-4">Lock Expiration</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
                      <span>Loading deposits...</span>
                    </div>
                  </td>
                </tr>
              ) : deposits.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="w-8 h-8 text-slate-300" />
                      <p className="font-medium text-slate-600">No deposits found</p>
                      <p className="text-xs text-slate-400">Try adjusting your filters or search keywords.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                deposits.map((d) => {
                  const isQualifying = (d.isQualifying !== undefined)
                    ? d.isQualifying
                    : (Number(d.amount) >= minimumDepositAmount);

                  return (
                    <tr
                      key={d.id}
                      id={`deposit-row-${d.id}`}
                      className="hover:bg-slate-50/70 transition-colors group"
                    >
                      {/* User Column */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 uppercase flex-shrink-0">
                            {(d.userName || 'U')[0]}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate flex items-center gap-1.5">
                              <span>{d.userName || 'Unknown User'}</span>
                              {d.isTestUser && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                  <FlaskConical className="w-2.5 h-2.5" />
                                  TEST
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 truncate">{d.userEmail || `User #${d.userId}`}</div>
                          </div>
                        </div>
                      </td>

                      {/* Amount Column */}
                      <td className="py-4 px-4">
                        <div className="font-bold text-slate-900 flex items-center gap-1">
                          <span>${Number(d.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          <span className="text-xs font-medium text-slate-400">{d.currency}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          {isQualifying ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              <Award className="w-3 h-3 text-emerald-600" />
                              Qualifying (≥${minimumDepositAmount})
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              Below Min (&lt;${minimumDepositAmount})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Transaction Hash Column */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5">
                          <code className="text-xs font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                            {formatShortHash(d.txHash)}
                          </code>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(d.txHash, `hash-${d.id}`)}
                            title="Copy full transaction hash"
                            className="text-slate-400 hover:text-slate-700 p-0.5 transition"
                          >
                            {copiedKey === `hash-${d.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          {d.txHash && d.txHash.startsWith('0x') && (
                            <a
                              href={`https://bscscan.com/tx/${d.txHash}`}
                              target="_blank"
                              rel="noreferrer"
                              title="View on BscScan"
                              className="text-slate-400 hover:text-blue-600 p-0.5 transition"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          <span>{d.network || 'BEP-20'}</span>
                          {d.confirmations !== undefined && (
                            <span className="text-slate-400">
                              ({d.confirmations}/{d.requiredConfirmations || 12} confs)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status Column */}
                      <td className="py-4 px-4">
                        {d.status === 'confirmed' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Confirmed
                          </span>
                        ) : d.status === 'pending' || d.status === 'confirming' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3.5 h-3.5 animate-pulse" />
                            {d.status === 'confirming' ? 'Confirming' : 'Pending Review'}
                          </span>
                        ) : d.status === 'rejected' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle className="w-3.5 h-3.5" />
                            Rejected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                            {d.status}
                          </span>
                        )}
                        {d.proofPhotoUrl && (
                          <div className="mt-1">
                            <button
                              type="button"
                              onClick={() => setPreviewProofUrl(d.proofPhotoUrl || null)}
                              className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5"
                            >
                              <FileText className="w-2.5 h-2.5" />
                              View Proof Receipt
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Created Date */}
                      <td className="py-4 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {formatDate(d.createdAt)}
                      </td>

                      {/* Confirmed / Eligibility Date */}
                      <td className="py-4 px-4 text-xs whitespace-nowrap">
                        {d.confirmedAt ? (
                          <div className="space-y-0.5">
                            <div className="text-slate-900 font-medium">{formatDate(d.confirmedAt)}</div>
                            <div className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                              <span>Eligible:</span>
                              <span>{formatDate(d.eligibilityDate || d.confirmedAt)}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">Pending confirmation</span>
                        )}
                      </td>

                      {/* Lock Expiration Date */}
                      <td className="py-4 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {d.depositLockEndDate ? (
                          <div className="flex items-center gap-1">
                            <Lock className="w-3 h-3 text-slate-400" />
                            <span>{formatDate(d.depositLockEndDate)}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">30 days from confirmation</span>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td className="py-4 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Inspect Detail */}
                          <button
                            id={`btn-inspect-deposit-${d.id}`}
                            onClick={() => openDepositDetail(d.id)}
                            title="Inspect deposit details & audit logs"
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Verify on BSC (only for pending or confirming) */}
                          {d.status !== 'confirmed' && d.status !== 'rejected' && (
                            <button
                              id={`btn-verify-deposit-${d.id}`}
                              onClick={() => handleVerifyOnChain(d.id)}
                              disabled={verifyingId === d.id}
                              title="Verify transaction status on BSC blockchain"
                              className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition disabled:opacity-50"
                            >
                              <ShieldCheck className={`w-4 h-4 ${verifyingId === d.id ? 'animate-spin' : ''}`} />
                            </button>
                          )}

                          {/* Confirm Button */}
                          {d.status !== 'confirmed' && (
                            <button
                              id={`btn-confirm-deposit-${d.id}`}
                              onClick={() => {
                                setConfirmModalDeposit(d);
                                setConfirmNotes('');
                              }}
                              title="Confirm and credit deposit"
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition"
                            >
                              Confirm
                            </button>
                          )}

                          {/* Reject Button */}
                          {d.status !== 'confirmed' && d.status !== 'rejected' && (
                            <button
                              id={`btn-reject-deposit-${d.id}`}
                              onClick={() => {
                                setRejectModalDeposit(d);
                                setRejectReason('');
                              }}
                              title="Reject deposit"
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition"
                            >
                              Reject
                            </button>
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

        {/* Pagination Bar */}
        <div className="py-3.5 px-5 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div>
            Showing <span className="font-semibold text-slate-900">{deposits.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</span> to{' '}
            <span className="font-semibold text-slate-900">{Math.min(currentPage * pageSize, totalCount)}</span> of{' '}
            <span className="font-semibold text-slate-900">{totalCount}</span> deposits
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                id="btn-prev-page"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || isLoading}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 text-slate-700 font-medium">
                Page {currentPage} of {totalPages}
              </span>
              <button
                id="btn-next-page"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || isLoading}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Slide-over Drawer: Deposit Details */}
      {selectedDepositId && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-sm flex justify-end animate-fade-in">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <ArrowDownRight className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    Deposit #{selectedDepositId}
                  </h3>
                  <div className="text-xs text-slate-500">
                    {depositDetail?.deposit.createdAt ? formatDate(depositDetail.deposit.createdAt) : 'Loading...'}
                  </div>
                </div>
              </div>
              <button
                onClick={closeDepositDetail}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab navigation inside Drawer */}
            <div className="flex border-b border-slate-200 px-5 bg-white text-xs font-semibold">
              <button
                onClick={() => setActiveDetailTab('details')}
                className={`py-3 px-3 border-b-2 transition ${
                  activeDetailTab === 'details'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                Inspection Details
              </button>
              <button
                onClick={() => setActiveDetailTab('history')}
                className={`py-3 px-3 border-b-2 transition ${
                  activeDetailTab === 'history'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                Ledger Entries ({depositDetail?.history.ledger.length || 0})
              </button>
              <button
                onClick={() => setActiveDetailTab('rewards')}
                className={`py-3 px-3 border-b-2 transition ${
                  activeDetailTab === 'rewards'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                Referral Rewards ({depositDetail?.history.referralRewards.length || 0})
              </button>
              <button
                onClick={() => setActiveDetailTab('audit')}
                className={`py-3 px-3 border-b-2 transition ${
                  activeDetailTab === 'audit'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                Audit Trail ({depositDetail?.history.auditLogs.length || 0})
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isLoadingDetail ? (
                <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
                  <span>Loading deposit inspection...</span>
                </div>
              ) : !depositDetail ? (
                <div className="text-center py-16 text-slate-500">Deposit details not found.</div>
              ) : (
                <>
                  {activeDetailTab === 'details' && (
                    <div className="space-y-6">
                      {/* Financial Amount Banner */}
                      <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">Deposit Amount</div>
                          <div className="text-2xl font-black text-emerald-950 mt-0.5">
                            ${Number(depositDetail.deposit.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                            <span className="text-sm font-bold text-emerald-700">{depositDetail.deposit.currency}</span>
                          </div>
                          {depositDetail.deposit.actualAmount && depositDetail.deposit.actualAmount !== depositDetail.deposit.amount && (
                            <div className="text-xs text-emerald-800 mt-1">
                              Actual Verified Amount: ${Number(depositDetail.deposit.actualAmount).toFixed(2)} USDT
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-medium text-slate-500">Status</div>
                          <span
                            className={`inline-flex items-center gap-1 mt-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                              depositDetail.deposit.status === 'confirmed'
                                ? 'bg-emerald-600 text-white'
                                : depositDetail.deposit.status === 'rejected'
                                ? 'bg-rose-600 text-white'
                                : 'bg-amber-500 text-white'
                            }`}
                          >
                            {depositDetail.deposit.status}
                          </span>
                        </div>
                      </div>

                      {/* Qualification Card */}
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                            <Award className="w-4 h-4 text-emerald-600" />
                            Referral Qualification Status
                          </span>
                          <span className="text-xs font-semibold text-slate-500">
                            Threshold: ${depositDetail.minimumDepositAmount} USDT
                          </span>
                        </div>
                        <p className="text-xs text-slate-600">
                          {depositDetail.isQualifying ? (
                            <span className="text-emerald-700 font-semibold">
                              ✓ This deposit is a Qualifying Deposit (≥${depositDetail.minimumDepositAmount} USDT). It qualifies referrers for Level 1 (5%) and Level 2 (2%) rewards upon confirmation.
                            </span>
                          ) : (
                            <span className="text-slate-600">
                              ℹ Below configured threshold (&lt;${depositDetail.minimumDepositAmount} USDT). Does NOT trigger referral rewards according to FINEXJ qualification rules.
                            </span>
                          )}
                        </p>
                      </div>

                      {/* User Information */}
                      <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <User className="w-4 h-4 text-slate-400" />
                          Account Information
                        </h4>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-slate-400 block">User Name</span>
                            <span className="font-semibold text-slate-900">{depositDetail.user?.fullName || depositDetail.deposit.userName || '—'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Email</span>
                            <span className="font-semibold text-slate-900">{depositDetail.user?.email || depositDetail.deposit.userEmail || '—'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">User ID</span>
                            <span className="font-mono text-slate-700">#{depositDetail.deposit.userId}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Test User Status</span>
                            {depositDetail.user?.isTestUser ? (
                              <span className="inline-flex items-center gap-1 text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded">
                                <FlaskConical className="w-3 h-3" />
                                Test Account (Simulated)
                              </span>
                            ) : (
                              <span className="text-slate-600 font-medium">Standard Real Account</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Blockchain Transaction Information */}
                      <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <Hash className="w-4 h-4 text-slate-400" />
                          Blockchain & Verification
                        </h4>
                        <div className="space-y-2 text-xs">
                          <div>
                            <span className="text-slate-400 block mb-0.5">BEP-20 Transaction Hash</span>
                            <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                              <code className="font-mono text-[11px] text-slate-800 break-all flex-1">
                                {depositDetail.deposit.txHash}
                              </code>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(depositDetail.deposit.txHash, 'drawer-hash')}
                                className="p-1 hover:bg-slate-200 rounded text-slate-500 transition"
                                title="Copy Tx Hash"
                              >
                                {copiedKey === 'drawer-hash' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                              {depositDetail.deposit.txHash.startsWith('0x') && (
                                <a
                                  href={`https://bscscan.com/tx/${depositDetail.deposit.txHash}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1 hover:bg-slate-200 rounded text-blue-600 transition"
                                  title="View on BscScan"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 pt-2">
                            <div>
                              <span className="text-slate-400 block">Network</span>
                              <span className="font-semibold text-slate-900">{depositDetail.deposit.network} (BNB Smart Chain)</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block">Confirmations</span>
                              <span className="font-semibold text-slate-900">
                                {depositDetail.deposit.confirmations} / {depositDetail.deposit.requiredConfirmations || 12}
                              </span>
                            </div>
                            {depositDetail.deposit.fromAddress && (
                              <div className="col-span-2">
                                <span className="text-slate-400 block">From Address (Sender)</span>
                                <code className="font-mono text-slate-700">{depositDetail.deposit.fromAddress}</code>
                              </div>
                            )}
                            {depositDetail.deposit.toAddress && (
                              <div className="col-span-2">
                                <span className="text-slate-400 block">Deposit Vault Destination</span>
                                <code className="font-mono text-slate-700">{depositDetail.deposit.toAddress}</code>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Timelines & Lock Information */}
                      <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          Timelines & 30-Day Holding Lock
                        </h4>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-slate-400 block">Created Date</span>
                            <span className="font-medium text-slate-800">{formatDate(depositDetail.deposit.createdAt)}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Confirmed Date</span>
                            <span className="font-medium text-slate-800">{formatDate(depositDetail.deposit.confirmedAt)}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Yield Eligibility Date</span>
                            <span className="font-medium text-emerald-800">{formatDate(depositDetail.deposit.eligibilityDate || depositDetail.deposit.confirmedAt)}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">30-Day Lock Expiration</span>
                            <span className="font-medium text-slate-800">{formatDate(depositDetail.deposit.depositLockEndDate)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Proof Document / Image */}
                      {depositDetail.deposit.proofPhotoUrl && (
                        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <FileText className="w-4 h-4 text-slate-400" />
                            Submitted Payment Proof
                          </h4>
                          <div className="relative group cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-slate-50 max-h-56 flex items-center justify-center">
                            <img
                              src={depositDetail.proofUrl || depositDetail.deposit.proofPhotoUrl}
                              alt="Deposit Proof"
                              className="w-full object-contain max-h-56 hover:opacity-90 transition"
                              onClick={() => setPreviewProofUrl(depositDetail.proofUrl || depositDetail.deposit.proofPhotoUrl || null)}
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-semibold gap-1.5">
                              <Eye className="w-4 h-4" />
                              Click to Enlarge
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Review & Notes */}
                      {(depositDetail.deposit.userNotes || depositDetail.deposit.adminNotes || depositDetail.deposit.reviewedBy) && (
                        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Notes & Review Information
                          </h4>
                          {depositDetail.deposit.userNotes && (
                            <div className="text-xs">
                              <span className="text-slate-400 block">User Notes</span>
                              <p className="text-slate-800 mt-0.5 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                {depositDetail.deposit.userNotes}
                              </p>
                            </div>
                          )}
                          {depositDetail.deposit.adminNotes && (
                            <div className="text-xs">
                              <span className="text-slate-400 block">Admin Notes</span>
                              <p className="text-slate-800 mt-0.5 bg-amber-50 p-2.5 rounded-lg border border-amber-100 font-medium">
                                {depositDetail.deposit.adminNotes}
                              </p>
                            </div>
                          )}
                          {depositDetail.deposit.reviewedBy && (
                            <div className="text-xs text-slate-500 pt-1">
                              Reviewed by Admin: <span className="font-mono text-slate-700">{depositDetail.deposit.reviewedBy}</span> on {formatDate(depositDetail.deposit.reviewedAt)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab: Ledger Entries */}
                  {activeDetailTab === 'history' && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Double-Entry Ledger Records
                      </h4>
                      {depositDetail.history.ledger.length === 0 ? (
                        <p className="text-xs text-slate-400 py-8 text-center">No ledger entries created yet for this deposit.</p>
                      ) : (
                        depositDetail.history.ledger.map((entry: any) => (
                          <div key={entry.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                            <div className="flex items-center justify-between font-bold text-slate-900">
                              <span>{entry.type?.toUpperCase()}</span>
                              <span className="text-emerald-700">+${Number(entry.amount).toFixed(2)} USDT</span>
                            </div>
                            <p className="text-slate-600">{entry.description}</p>
                            <div className="text-slate-400 text-[11px] pt-1 flex items-center justify-between">
                              <span>Balance After: ${Number(entry.balance_after || entry.balanceAfter || 0).toFixed(2)}</span>
                              <span>{formatDate(entry.created_at || entry.createdAt)}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Tab: Referral Rewards */}
                  {activeDetailTab === 'rewards' && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Referral Rewards Generated
                      </h4>
                      {depositDetail.history.referralRewards.length === 0 ? (
                        <div className="text-center py-8 text-slate-400 text-xs">
                          {depositDetail.isQualifying
                            ? 'No referral rewards recorded yet (pending confirmation or user has no referrer).'
                            : 'No referral rewards applicable (deposit is below qualifying threshold).'}
                        </div>
                      ) : (
                        depositDetail.history.referralRewards.map((reward: any) => (
                          <div key={reward.id} className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 text-xs space-y-1">
                            <div className="flex items-center justify-between font-bold text-emerald-950">
                              <span>Level {reward.level || 1} Referral Reward ({reward.percentage || (reward.level === 2 ? '2%' : '5%')})</span>
                              <span className="text-emerald-700">+${Number(reward.amount).toFixed(2)} USDT</span>
                            </div>
                            <p className="text-slate-600">
                              Beneficiary User ID: <span className="font-mono font-semibold">#{reward.referrer_id || reward.referrerId}</span>
                            </p>
                            <div className="text-slate-400 text-[11px] pt-1 flex items-center justify-between">
                              <span>Status: {reward.status}</span>
                              <span>{formatDate(reward.created_at || reward.createdAt)}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Tab: Audit Logs */}
                  {activeDetailTab === 'audit' && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Security & Audit Events
                      </h4>
                      {depositDetail.history.auditLogs.length === 0 ? (
                        <p className="text-xs text-slate-400 py-8 text-center">No audit logs recorded for this deposit.</p>
                      ) : (
                        depositDetail.history.auditLogs.map((log: any) => (
                          <div key={log.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                            <div className="flex items-center justify-between font-bold text-slate-900">
                              <span className="font-mono text-emerald-800">{log.action}</span>
                              <span className="text-slate-400 text-[11px]">{formatDate(log.timestamp || log.created_at)}</span>
                            </div>
                            <p className="text-slate-700">{log.reason || 'No description provided'}</p>
                            <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
                              <span>Actor: {log.actor_id || log.actorId} ({log.actor_role || log.actorRole || 'admin'})</span>
                              {log.reference_id && <span>Ref: #{log.reference_id}</span>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Drawer Footer Actions */}
            {depositDetail && depositDetail.deposit.status !== 'confirmed' && (
              <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => handleVerifyOnChain(depositDetail.deposit.id)}
                  disabled={verifyingId === depositDetail.deposit.id}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold transition disabled:opacity-50"
                >
                  <ShieldCheck className={`w-4 h-4 ${verifyingId === depositDetail.deposit.id ? 'animate-spin' : ''}`} />
                  Verify on BSC
                </button>

                <div className="flex items-center gap-2">
                  {depositDetail.deposit.status !== 'rejected' && (
                    <button
                      type="button"
                      onClick={() => {
                        setRejectModalDeposit(depositDetail.deposit);
                        setRejectReason('');
                      }}
                      className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition"
                    >
                      Reject
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmModalDeposit(depositDetail.deposit);
                      setConfirmNotes('');
                    }}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition"
                  >
                    Confirm & Credit
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal Dialog */}
      {confirmModalDeposit && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-emerald-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Confirm Deposit</h3>
                  <p className="text-xs text-slate-500">Atomic ledger execution & credit</p>
                </div>
              </div>
              <button
                onClick={() => setConfirmModalDeposit(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm text-slate-600">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">User:</span>
                  <span className="font-semibold text-slate-900">{confirmModalDeposit.userName || `User #${confirmModalDeposit.userId}`}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Amount:</span>
                  <span className="font-bold text-emerald-700">${Number(confirmModalDeposit.amount).toFixed(2)} USDT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Hash:</span>
                  <span className="font-mono text-slate-700">{formatShortHash(confirmModalDeposit.txHash)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Referral Qualification:</span>
                  <span className="font-semibold text-slate-900">
                    {Number(confirmModalDeposit.amount) >= minimumDepositAmount ? 'Yes (≥$300)' : 'No (<$300)'}
                  </span>
                </div>
              </div>

              <div className="text-xs text-slate-500 space-y-1">
                <p>
                  <strong>What happens when confirmed:</strong>
                </p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Deposit status updates to <span className="font-semibold text-emerald-700">confirmed</span>.</li>
                  <li>Atomic double-entry ledger entry is credited.</li>
                  <li>30-day principal lock begins.</li>
                  <li>Eligible principal activates on next calendar yield cycle.</li>
                  {Number(confirmModalDeposit.amount) >= minimumDepositAmount && (
                    <li>Level 1 (5%) and Level 2 (2%) referral rewards are triggered once.</li>
                  )}
                  <li>Audit trail records confirmation with admin ID.</li>
                </ul>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Admin Notes (Optional)</label>
                <textarea
                  placeholder="e.g. Verified on BSC explorer with 12+ confirmations"
                  value={confirmNotes}
                  onChange={(e) => setConfirmNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  rows={2}
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmModalDeposit(null)}
                disabled={isConfirming}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-deposit-submit"
                type="button"
                onClick={handleConfirmDeposit}
                disabled={isConfirming}
                className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50"
              >
                {isConfirming && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Confirm & Credit Deposit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal Dialog */}
      {rejectModalDeposit && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-rose-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Reject Deposit</h3>
                  <p className="text-xs text-slate-500">Record reason and prevent crediting</p>
                </div>
              </div>
              <button
                onClick={() => setRejectModalDeposit(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm text-slate-600">
              <p className="text-xs text-slate-600">
                Rejecting this deposit will set its status to <strong>rejected</strong>. No balance or ledger entries will be credited, and no referral rewards will be distributed. An audit log will be created.
              </p>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Rejection Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  placeholder="e.g. Invalid transaction hash, funds not received, or duplicate proof submission"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  rows={3}
                  required
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectModalDeposit(null)}
                disabled={isRejecting}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                id="btn-reject-deposit-submit"
                type="button"
                onClick={handleRejectDeposit}
                disabled={isRejecting || !rejectReason.trim()}
                className="flex items-center gap-1.5 px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50"
              >
                {isRejecting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Reject Deposit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proof Photo Zoom Modal */}
      {previewProofUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setPreviewProofUrl(null)}
        >
          <div className="relative max-w-3xl w-full max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewProofUrl(null)}
              className="absolute -top-10 right-0 text-white hover:text-slate-300 p-2"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={previewProofUrl}
              alt="Deposit Proof Full"
              className="max-h-[85vh] w-auto max-w-full rounded-xl object-contain shadow-2xl bg-black"
            />
          </div>
        </div>
      )}
    </div>
  );
};
