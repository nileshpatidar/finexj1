import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { UserTransaction, UserBalanceSummary, TransactionsPagination, TransactionsSummary } from '../types';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  TrendingUp,
  Users,
  Search,
  Filter,
  Calendar,
  Check,
  Copy,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  X,
  Wallet,
  ShieldCheck,
  Lock,
  CheckCircle2,
  Clock,
  Layers,
  ChevronDown,
  Info,
} from 'lucide-react';

export const TransactionsView: React.FC = () => {
  const [transactions, setTransactions] = useState<UserTransaction[]>([]);
  const [balance, setBalance] = useState<UserBalanceSummary | null>(null);
  const [summary, setSummary] = useState<TransactionsSummary | null>(null);
  const [pagination, setPagination] = useState<TransactionsPagination>({
    page: 1,
    limit: 20,
    totalCount: 0,
    totalPages: 1,
    hasMore: false,
  });

  // Filter States
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateRangePreset, setDateRangePreset] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [selectedTx, setSelectedTx] = useState<UserTransaction | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Load Transactions from backend API
  const loadTransactions = useCallback(async (pageToLoad: number = 1) => {
    try {
      setIsLoading(true);
      const res = await api.getTransactions({
        page: pageToLoad,
        limit: pagination.limit,
        type: filterType !== 'all' ? filterType : undefined,
        status: filterStatus !== 'all' ? filterStatus : undefined,
        search: searchQuery.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      setTransactions(res.transactions || []);
      if (res.pagination) {
        setPagination(res.pagination);
      }
      if (res.balance) {
        setBalance(res.balance);
      }
      if (res.summary) {
        setSummary(res.summary);
      }
    } catch (err) {
      console.warn('[TransactionsView] Failed to load transactions:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [filterType, filterStatus, searchQuery, startDate, endDate, pagination.limit]);

  // Initial load and filter change trigger
  useEffect(() => {
    loadTransactions(1);
  }, [loadTransactions]);

  // Quick Date Preset handler
  const handleDatePresetChange = (preset: string) => {
    setDateRangePreset(preset);
    const now = new Date();
    if (preset === '7d') {
      const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      setStartDate(past.toISOString().split('T')[0]);
      setEndDate(now.toISOString().split('T')[0]);
    } else if (preset === '30d') {
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      setStartDate(past.toISOString().split('T')[0]);
      setEndDate(now.toISOString().split('T')[0]);
    } else if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    }
  };

  const handleCopy = (text: string, fieldKey: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const resetAllFilters = () => {
    setFilterType('all');
    setFilterStatus('all');
    setSearchQuery('');
    setDateRangePreset('all');
    setStartDate('');
    setEndDate('');
  };

  const hasActiveFilters =
    filterType !== 'all' ||
    filterStatus !== 'all' ||
    searchQuery.trim() !== '' ||
    startDate !== '' ||
    endDate !== '';

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-24 text-slate-900 dark:text-white">
      {/* Top Header & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Financial Activity & Ledger
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              BEP-20 Audited
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Authoritative history of deposits, daily compounding yields, referral rewards, and network payouts.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              setIsRefreshing(true);
              loadTransactions(pagination.page);
            }}
            disabled={isLoading || isRefreshing}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer shadow-xs disabled:opacity-50"
            title="Sync with authoritative backend ledger"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-500' : ''}`} />
            <span>{isRefreshing ? 'Syncing...' : 'Sync History'}</span>
          </button>
        </div>
      </div>

      {/* Authoritative Financial Balance Summary Bar (From Backend API) */}
      {balance && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Total Balance
              </span>
              <Wallet className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-1">
              ${balance.availableBalance.toFixed(2)}{' '}
              <span className="text-[10px] font-bold text-slate-500">USDT</span>
            </p>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Available liquid funds
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Eligible Principal
              </span>
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">
              ${(balance.activeCompoundingPrincipal || 0).toFixed(2)}{' '}
              <span className="text-[10px] font-bold text-slate-500">USDT</span>
            </p>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Compounding capital base
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Daily Earnings
              </span>
              <TrendingUp className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-base sm:text-lg font-black text-blue-600 dark:text-blue-400 mt-1">
              +${(balance.totalEarnings || 0).toFixed(2)}{' '}
              <span className="text-[10px] font-bold text-slate-500">USDT</span>
            </p>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Lifetime yield distributed
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Referral Income
              </span>
              <Users className="w-4 h-4 text-purple-500" />
            </div>
            <p className="text-base sm:text-lg font-black text-purple-600 dark:text-purple-400 mt-1">
              +${(balance.referralEarnings || 0).toFixed(2)}{' '}
              <span className="text-[10px] font-bold text-slate-500">USDT</span>
            </p>
            <div className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold mt-0.5">
              Liquid • Non-Compounding
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="space-y-3 bg-white dark:bg-[#0F172A] p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-xs">
        {/* Category Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-slate-100 dark:border-slate-800">
          {[
            { id: 'all', label: 'All Activity', icon: Layers },
            { id: 'deposits', label: 'Deposits', icon: ArrowDownToLine },
            { id: 'withdrawals', label: 'Withdrawals', icon: ArrowUpFromLine },
            { id: 'earnings', label: 'Daily Earnings', icon: TrendingUp },
            { id: 'referrals', label: 'Referral Rewards', icon: Users },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = filterType === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilterType(tab.id)}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl font-bold text-xs transition cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search, Status, and Date Range Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-1">
          {/* Search Box */}
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by TxID, Reference, or Destination..."
              className="w-full pl-10 pr-8 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Dropdown */}
          <div className="sm:col-span-3">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="w-full py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs focus:outline-none focus:border-blue-500 transition cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="confirmed">Confirmed / Credited</option>
              <option value="paid">Paid (Withdrawals)</option>
              <option value="pending">Pending</option>
              <option value="under_review">Under Review</option>
              <option value="rejected">Rejected / Refunded</option>
            </select>
          </div>

          {/* Date Presets */}
          <div className="sm:col-span-3">
            <select
              value={dateRangePreset}
              onChange={e => handleDatePresetChange(e.target.value)}
              className="w-full py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs focus:outline-none focus:border-blue-500 transition cursor-pointer"
            >
              <option value="all">All Time</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>
        </div>

        {/* Custom Date Pickers (Shown if custom preset is selected) */}
        {dateRangePreset === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">From:</span>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="py-1.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:border-blue-500"
            />
            <span className="text-slate-500 dark:text-slate-400 font-medium">To:</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="py-1.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
        )}

        {/* Active Filter Indicators */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
            <span className="text-slate-500 dark:text-slate-400 text-[11px]">
              Active filters applied • Showing {pagination.totalCount} results
            </span>
            <button
              onClick={resetAllFilters}
              className="text-blue-600 dark:text-blue-400 hover:underline font-bold text-[11px] cursor-pointer"
            >
              Reset All Filters
            </button>
          </div>
        )}
      </div>

      {/* Transaction List / Rows */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3, 4].map(n => (
              <div key={n} className="h-24 bg-white dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-slate-800"></div>
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Clock className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">No transactions found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {hasActiveFilters
                ? 'No transactions match your currently selected filters. Try clearing or expanding your search.'
                : 'Your account has no recorded financial activity yet. Confirmed deposits and daily distributions will appear here.'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={resetAllFilters}
                className="mt-4 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition cursor-pointer shadow-xs"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          transactions.map(item => {
            const isDeposit = item.type === 'deposit';
            const isWithdrawal = item.type === 'withdrawal' || item.type.startsWith('withdrawal');
            const isEarning = item.type === 'daily_earnings';
            const isLoss = item.type === 'daily_loss';
            const isReferralL1 = item.type === 'referral_reward_l1';
            const isReferralL2 = item.type === 'referral_reward_l2';
            const isAdjustment = item.type === 'admin_adjustment' || item.type === 'reversal';

            // Distinctive visual color palette per transaction type
            let badgeBg = 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
            let iconColor = 'text-slate-500';
            let typeTitle = 'Adjustment';

            if (isDeposit) {
              badgeBg = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
              iconColor = 'text-emerald-600 dark:text-emerald-400';
              typeTitle = 'BEP-20 USDT Deposit';
            } else if (isWithdrawal) {
              badgeBg = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
              iconColor = 'text-amber-600 dark:text-amber-400';
              typeTitle = 'BEP-20 Withdrawal';
            } else if (isEarning || isLoss) {
              badgeBg = 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
              iconColor = 'text-blue-600 dark:text-blue-400';
              typeTitle = 'Daily Yield Distribution';
            } else if (isReferralL1) {
              badgeBg = 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
              iconColor = 'text-purple-600 dark:text-purple-400';
              typeTitle = 'Referral L1 Reward (5%)';
            } else if (isReferralL2) {
              badgeBg = 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20';
              iconColor = 'text-indigo-600 dark:text-indigo-400';
              typeTitle = 'Referral L2 Reward (2%)';
            }

            // Authoritative Status styling
            let statusBadge = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700';
            let statusLabel = item.status || 'Completed';

            if (item.status === 'confirmed' || item.status === 'paid' || item.status === 'credited' || item.status === 'completed') {
              statusBadge = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
              statusLabel = item.status === 'paid' ? 'Paid (On-Chain)' : item.status === 'credited' ? 'Credited' : 'Confirmed';
            } else if (item.status === 'pending' || item.status === 'under_review' || item.status === 'processing') {
              statusBadge = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
              statusLabel = item.status === 'under_review' ? 'Under Review' : 'Pending Verification';
            } else if (item.status === 'confirming') {
              statusBadge = 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
              statusLabel = `Confirming (${item.confirmations || 0}/${item.requiredConfirmations || 12})`;
            } else if (item.status === 'rejected' || item.status === 'cancelled') {
              statusBadge = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
              statusLabel = item.status === 'rejected' ? 'Rejected' : 'Cancelled';
            }

            // Display Amount
            const displayAmount = Math.abs(item.amount || 0);
            const isPositive = isDeposit || isEarning || isReferralL1 || isReferralL2;

            return (
              <div
                key={item.id}
                className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800/80 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Left Column: Icon + Primary Details */}
                  <div className="flex items-start space-x-3.5 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${badgeBg} border`}>
                      {isDeposit && <ArrowDownToLine className={`w-5 h-5 ${iconColor}`} />}
                      {isWithdrawal && <ArrowUpFromLine className={`w-5 h-5 ${iconColor}`} />}
                      {(isEarning || isLoss) && <TrendingUp className={`w-5 h-5 ${iconColor}`} />}
                      {(isReferralL1 || isReferralL2) && <Users className={`w-5 h-5 ${iconColor}`} />}
                      {isAdjustment && <Wallet className={`w-5 h-5 ${iconColor}`} />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold text-slate-900 dark:text-white text-xs sm:text-sm">
                          {typeTitle}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${statusBadge}`}>
                          {statusLabel}
                        </span>
                        {isReferralL1 && (
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                            Non-Compounding
                          </span>
                        )}
                        {isReferralL2 && (
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                            Non-Compounding
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-1">
                        {item.description}
                      </p>

                      {/* Metadata row: Reference, Date, Blockchain links */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                        <span className="flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(item.createdAt).toLocaleString()}</span>
                        </span>

                        {item.reference && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-slate-600 dark:text-slate-400">
                              Ref: {item.reference}
                            </span>
                          </>
                        )}

                        {item.txHash && (
                          <>
                            <span>•</span>
                            <a
                              href={`https://bscscan.com/tx/${item.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center space-x-1 font-mono text-blue-600 dark:text-blue-400 hover:underline"
                              title="View on BscScan"
                            >
                              <span>{item.txHash.slice(0, 8)}...{item.txHash.slice(-6)}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Authoritative Financial Amounts */}
                  <div className="sm:text-right flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800 flex sm:flex-col justify-between items-end sm:items-end">
                    <div className="flex items-baseline space-x-1">
                      <span
                        className={`text-base sm:text-lg font-black ${
                          isPositive
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isPositive ? '+' : '-'}${displayAmount.toFixed(2)}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase">
                        USDT
                      </span>
                    </div>

                    {/* Authoritative fee / net details for withdrawals */}
                    {isWithdrawal && item.netAmount !== undefined && (
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 space-x-1">
                        <span>Fee ({item.feePercentage || 9}%): -${(item.feeAmount || 0).toFixed(2)}</span>
                        <span>•</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          Net: ${(item.netAmount || 0).toFixed(2)}
                        </span>
                      </div>
                    )}

                    {/* Daily Yield Base Details */}
                    {isEarning && item.baseEligibleAmount !== undefined && (
                      <div className="text-[10px] text-blue-600 dark:text-blue-400 font-medium mt-0.5">
                        Yield on ${item.baseEligibleAmount.toFixed(2)} principal
                      </div>
                    )}

                    <button
                      onClick={() => setSelectedTx(item)}
                      className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline mt-1.5 inline-flex items-center space-x-1 cursor-pointer"
                    >
                      <span>View Details</span>
                      <ChevronDown className="w-3 h-3 -rotate-90" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Controls */}
      {pagination.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs">
          <div className="text-slate-500 dark:text-slate-400 text-xs">
            Showing <span className="font-bold text-slate-900 dark:text-white">{transactions.length}</span> of{' '}
            <span className="font-bold text-slate-900 dark:text-white">{pagination.totalCount}</span> transactions
            (Page {pagination.page} of {pagination.totalPages})
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => loadTransactions(pagination.page - 1)}
              disabled={pagination.page <= 1 || isLoading}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] font-bold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer shadow-xs"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>

            <span className="px-3 py-1.5 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-xs">
              {pagination.page}
            </span>

            <button
              onClick={() => loadTransactions(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages || isLoading}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] font-bold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer shadow-xs"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Transaction Details Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#0F172A] rounded-2xl max-w-lg w-full p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <Info className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                    Transaction Audit Details
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    ID: {selectedTx.id}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedTx(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Financial Overview Card */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Type</span>
                <span className="font-bold capitalize text-slate-900 dark:text-white">
                  {selectedTx.type.replace(/_/g, ' ')}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Status</span>
                <span className="font-extrabold uppercase text-[10px] px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  {selectedTx.status}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Recorded Date</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {new Date(selectedTx.createdAt).toLocaleString()}
                </span>
              </div>

              {/* Authoritative Withdrawal Financial Breakdown */}
              {selectedTx.type === 'withdrawal' && (
                <>
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-2 mt-2 space-y-1 text-xs">
                    <div className="flex justify-between text-slate-600 dark:text-slate-300">
                      <span>Gross Requested Amount</span>
                      <span className="font-bold">${(selectedTx.grossAmount || Math.abs(selectedTx.amount)).toFixed(2)} USDT</span>
                    </div>
                    <div className="flex justify-between text-amber-600 dark:text-amber-400">
                      <span>FINEXJ Policy Fee ({selectedTx.feePercentage || 9}%)</span>
                      <span className="font-bold">-${(selectedTx.feeAmount || 0).toFixed(2)} USDT</span>
                    </div>
                    <div className="flex justify-between font-extrabold text-sm text-emerald-600 dark:text-emerald-400 pt-1 border-t border-slate-200 dark:border-slate-800">
                      <span>Authoritative Net Payout</span>
                      <span>${(selectedTx.netAmount || 0).toFixed(2)} USDT</span>
                    </div>
                  </div>
                </>
              )}

              {/* Daily Yield Breakdown */}
              {selectedTx.type === 'daily_earnings' && (
                <div className="border-t border-slate-200 dark:border-slate-800 pt-2 mt-2 space-y-1 text-xs">
                  <div className="flex justify-between text-slate-600 dark:text-slate-300">
                    <span>Compounding Principal Base</span>
                    <span className="font-bold">${(selectedTx.baseEligibleAmount || 0).toFixed(2)} USDT</span>
                  </div>
                  <div className="flex justify-between text-blue-600 dark:text-blue-400">
                    <span>Distributed Yield Rate</span>
                    <span className="font-bold">+{selectedTx.ratePercentage || 0}%</span>
                  </div>
                  <div className="flex justify-between font-extrabold text-sm text-emerald-600 dark:text-emerald-400 pt-1 border-t border-slate-200 dark:border-slate-800">
                    <span>Net Credited Yield</span>
                    <span>+${selectedTx.amount.toFixed(2)} USDT</span>
                  </div>
                </div>
              )}

              {/* Referral Incentive Breakdown */}
              {(selectedTx.type === 'referral_reward_l1' || selectedTx.type === 'referral_reward_l2') && (
                <div className="border-t border-slate-200 dark:border-slate-800 pt-2 mt-2 space-y-1 text-xs">
                  <div className="flex justify-between text-slate-600 dark:text-slate-300">
                    <span>Reward Tier</span>
                    <span className="font-bold">Level {selectedTx.rewardLevel || 1} ({selectedTx.percentage || 5}%)</span>
                  </div>
                  <div className="flex justify-between text-purple-600 dark:text-purple-400">
                    <span>Classification</span>
                    <span className="font-bold">Liquid Partner Commission</span>
                  </div>
                  <div className="flex justify-between font-extrabold text-sm text-emerald-600 dark:text-emerald-400 pt-1 border-t border-slate-200 dark:border-slate-800">
                    <span>Credited Liquid Bonus</span>
                    <span>+${selectedTx.amount.toFixed(2)} USDT</span>
                  </div>
                </div>
              )}
            </div>

            {/* Blockchain & Routing Details */}
            <div className="space-y-2.5 text-xs">
              <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[10px]">
                Network & Reference Verification
              </h4>

              <div className="space-y-2">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block mb-0.5">
                    Network
                  </span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    BNB Smart Chain (BEP-20)
                  </span>
                </div>

                {selectedTx.reference && (
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block mb-0.5">
                        Internal Reference
                      </span>
                      <span className="font-mono text-slate-800 dark:text-slate-200 font-bold">
                        {selectedTx.reference}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopy(selectedTx.reference || '', 'ref')}
                      className="p-1 text-slate-400 hover:text-blue-500 cursor-pointer"
                    >
                      {copiedField === 'ref' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}

                {selectedTx.txHash && (
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="min-w-0 flex-1 pr-2">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block mb-0.5">
                        BNB Smart Chain TxID
                      </span>
                      <span className="font-mono text-slate-800 dark:text-slate-200 font-bold text-[11px] truncate block">
                        {selectedTx.txHash}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1 flex-shrink-0">
                      <button
                        onClick={() => handleCopy(selectedTx.txHash || '', 'tx')}
                        className="p-1 text-slate-400 hover:text-blue-500 cursor-pointer"
                        title="Copy TxHash"
                      >
                        {copiedField === 'tx' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <a
                        href={`https://bscscan.com/tx/${selectedTx.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 text-blue-500 hover:text-blue-600"
                        title="View on BscScan"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                )}

                {selectedTx.destinationAddress && (
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="min-w-0 flex-1 pr-2">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block mb-0.5">
                        Destination BEP-20 Wallet
                      </span>
                      <span className="font-mono text-slate-800 dark:text-slate-200 font-bold text-[11px] truncate block">
                        {selectedTx.destinationAddress}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopy(selectedTx.destinationAddress || '', 'dest')}
                      className="p-1 text-slate-400 hover:text-blue-500 cursor-pointer"
                      title="Copy Wallet Address"
                    >
                      {copiedField === 'dest' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}

                {selectedTx.depositLockEndDate && (
                  <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300">
                    <div className="flex items-center space-x-1.5 font-bold text-xs mb-0.5">
                      <Lock className="w-3.5 h-3.5" />
                      <span>30-Day Liquidity Commitment Date</span>
                    </div>
                    <p className="text-[11px]">
                      Lock expires on {new Date(selectedTx.depositLockEndDate).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Close Button */}
            <div className="pt-2">
              <button
                onClick={() => setSelectedTx(null)}
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
