import React, { useState, useEffect, useCallback } from 'react';
import {
  Landmark,
  DollarSign,
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
  Calendar,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Users,
  Percent,
  Plus,
  Minus,
  Info,
  Search,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Scale,
  Layers,
  FileSpreadsheet,
} from 'lucide-react';
import { api } from '../services/api';
import {
  AdminAccountingSummary,
  FinexjOperationalSummary,
  ReferralAccountingSummary,
  AdminLedgerItem,
  FinexjOperationalEntry,
} from '../types';
import { useAuth } from '../context/AuthContext';

export const AdminAccountingView: React.FC = () => {
  const { user } = useAuth();
  const isAuthorized = Boolean(user && user.role === 'super_admin');
  // Period and Date Filter State
  const [period, setPeriod] = useState<'all' | 'today' | 'yesterday' | '7d' | '30d' | 'custom'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Main Data States
  const [accounting, setAccounting] = useState<AdminAccountingSummary | null>(null);
  const [opSummary, setOpSummary] = useState<FinexjOperationalSummary | null>(null);
  const [referralSummary, setReferralSummary] = useState<ReferralAccountingSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Operational Fund Modal State
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustDirection, setAdjustDirection] = useState<'inflow' | 'outflow'>('inflow');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustReference, setAdjustReference] = useState('');
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSuccessMsg, setAdjustSuccessMsg] = useState<string | null>(null);

  // Ledger Table State
  const [ledgerEntries, setLedgerEntries] = useState<AdminLedgerItem[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerLimit] = useState(15);
  const [ledgerTotalPages, setLedgerTotalPages] = useState(1);
  const [ledgerCategoryFilter, setLedgerCategoryFilter] = useState('ALL');
  const [ledgerSearchRef, setLedgerSearchRef] = useState('');
  const [ledgerSearchUser, setLedgerSearchUser] = useState('');
  const [ledgerMinAmount, setLedgerMinAmount] = useState('');
  const [ledgerMaxAmount, setLedgerMaxAmount] = useState('');
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);

  // Inspection Modals
  const [inspectingLedgerItem, setInspectingLedgerItem] = useState<AdminLedgerItem | null>(null);
  const [inspectingReferralReward, setInspectingReferralReward] = useState<any | null>(null);

  // Fetch Summary and Operational Fund
  const loadAccountingData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const [accRes, opRes, refRes] = await Promise.all([
        api.getAccountingSummary({
          period,
          startDate: period === 'custom' ? startDate : undefined,
          endDate: period === 'custom' ? endDate : undefined,
        }),
        api.getOperationalFundSummary(),
        api.getReferralAccounting(),
      ]);

      if (accRes.success) setAccounting(accRes.accounting);
      if (opRes.success) setOpSummary(opRes.summary);
      if (refRes.success) setReferralSummary(refRes.referralAccounting);
    } catch (err: any) {
      setFetchError(err?.message || 'Failed to load financial accounting data.');
    } finally {
      setIsLoading(false);
    }
  }, [period, startDate, endDate]);

  // Fetch Ledger
  const loadLedgerData = useCallback(async () => {
    setIsLoadingLedger(true);
    try {
      const res = await api.getAdminLedger({
        page: ledgerPage,
        limit: ledgerLimit,
        type: ledgerCategoryFilter,
        reference: ledgerSearchRef || undefined,
        userId: ledgerSearchUser || undefined,
        startDate: period === 'custom' ? startDate : undefined,
        endDate: period === 'custom' ? endDate : undefined,
        minAmount: ledgerMinAmount ? parseFloat(ledgerMinAmount) : undefined,
        maxAmount: ledgerMaxAmount ? parseFloat(ledgerMaxAmount) : undefined,
      });

      if (res.success) {
        setLedgerEntries(res.entries || []);
        setLedgerTotal(res.total || 0);
        setLedgerTotalPages(res.totalPages || 1);
      }
    } catch (err: any) {
      console.warn('Failed to load ledger stream:', err?.message);
    } finally {
      setIsLoadingLedger(false);
    }
  }, [ledgerPage, ledgerLimit, ledgerCategoryFilter, ledgerSearchRef, ledgerSearchUser, ledgerMinAmount, ledgerMaxAmount, period, startDate, endDate]);

  useEffect(() => {
    if (isAuthorized) {
      loadAccountingData();
    }
  }, [loadAccountingData, isAuthorized]);

  useEffect(() => {
    if (isAuthorized) {
      loadLedgerData();
    }
  }, [loadLedgerData, isAuthorized]);

  // Handle Operational Fund Adjustment Submission
  const handleOperationalAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjustError(null);
    setAdjustSuccessMsg(null);

    const amt = parseFloat(adjustAmount);
    if (isNaN(amt) || amt <= 0) {
      setAdjustError('Please enter a valid amount greater than 0 USDT.');
      return;
    }

    if (!adjustReason.trim()) {
      setAdjustError('A mandatory reason is required for operational audit compliance.');
      return;
    }

    if (adjustDirection === 'outflow' && opSummary && amt > opSummary.currentBalance) {
      setAdjustError(`Insufficient funds. Cannot disburse more than current operational balance (${opSummary.currentBalance.toLocaleString()} USDT).`);
      return;
    }

    setIsSubmittingAdjust(true);
    try {
      const res = await api.adjustOperationalFund({
        amount: amt,
        direction: adjustDirection,
        reason: adjustReason.trim(),
        reference: adjustReference.trim() || undefined,
      });

      if (res.success) {
        setAdjustSuccessMsg(res.message || 'Adjustment successfully recorded.');
        setAdjustAmount('');
        setAdjustReason('');
        setAdjustReference('');
        setTimeout(() => {
          setIsAdjustModalOpen(false);
          setAdjustSuccessMsg(null);
        }, 1200);
        await Promise.all([loadAccountingData(), loadLedgerData()]);
      }
    } catch (err: any) {
      setAdjustError(err?.message || 'Failed to submit operational fund adjustment.');
    } finally {
      setIsSubmittingAdjust(false);
    }
  };

  const parsedAdjustmentAmount = parseFloat(adjustAmount) || 0;
  const currentOpBal = opSummary?.currentBalance || 0;
  const previewNewBal = adjustDirection === 'inflow' ? currentOpBal + parsedAdjustmentAmount : currentOpBal - parsedAdjustmentAmount;

  if (!isAuthorized) {
    return (
      <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Access Restricted</h2>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          The FINEXJ Accounting section contains confidential financial reserves and operational ledger controls. Access is strictly restricted to authenticated <strong>Super Admin</strong> personnel only.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* 1. SECTION HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">FINEXJ Accounting</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Authoritative financial position, fund separation, withdrawal fee tracking, and system reconciliation
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {accounting && (
            <div
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                accounting.reconciliationStatus === 'BALANCED'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
              }`}
            >
              {accounting.reconciliationStatus === 'BALANCED' ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Reconciliation: BALANCED</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Reconciliation: REQUIRES REVIEW (${Math.abs(accounting.reconciliationDifference).toFixed(2)})</span>
                </>
              )}
            </div>
          )}

          <button
            onClick={() => {
              loadAccountingData();
              loadLedgerData();
            }}
            disabled={isLoading}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Data</span>
          </button>
        </div>
      </div>

      {/* 2. DATE FILTER CONTROLS */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-2 flex items-center">
            <Calendar className="w-3.5 h-3.5 mr-1" />
            Accounting Period:
          </span>
          {[
            { id: 'all', label: 'All Time' },
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: '7d', label: 'Last 7 Days' },
            { id: '30d', label: 'Last 30 Days' },
            { id: 'custom', label: 'Custom Range' },
          ].map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                period === p.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="flex items-center space-x-2">
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
            <button
              onClick={() => {
                loadAccountingData();
                loadLedgerData();
              }}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {fetchError && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-xs flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{fetchError}</span>
        </div>
      )}

      {/* 3. CORE ACCOUNTING PRINCIPLE & FUND SEPARATION BANNER */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-900/10 via-slate-900/10 to-indigo-900/10 dark:from-blue-950/40 dark:via-slate-900/40 dark:to-indigo-950/40 border border-blue-200/60 dark:border-blue-800/40">
        <div className="flex items-start space-x-3">
          <div className="p-2 rounded-lg bg-blue-600 text-white flex-shrink-0 mt-0.5">
            <Scale className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Strict Fund Separation Principle (User Money vs. FINEXJ Money)
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong className="text-slate-900 dark:text-white">User Money:</strong> Deposits, compound earnings, and referral rewards are user-owned liabilities held for daily trading returns and withdrawal. They are <em>never</em> treated as company profit.
              <br />
              <strong className="text-slate-900 dark:text-white">FINEXJ Money:</strong> The platform earns income strictly through{' '}
              <span className="font-semibold text-blue-600 dark:text-blue-400">
                100% of configured withdrawal fees ({accounting?.withdrawalFeePercentage || 9}%)
              </span>{' '}
              and dedicated Operational Fund capital injections. Referral rewards are funded separately and are <em>never</em> deducted from withdrawal fees.
            </p>
          </div>
        </div>
      </div>

      {/* 4. TOP 9 SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* A. TOTAL CONFIRMED DEPOSITS */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider">A. Total Confirmed Deposits</span>
            <ArrowDownToLine className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            ${accounting?.totalDeposited.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            User Capital Inflow (BEP-20 USDT)
          </div>
        </div>

        {/* B. TOTAL ELIGIBLE USER PRINCIPAL */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider">B. Eligible User Principal</span>
            <DollarSign className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            ${accounting?.activeCompoundingPrincipal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Active compounding base (Deposits - Withdrawals)
          </div>
        </div>

        {/* C. DAILY EARNINGS CREDITED */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider">C. Daily Earnings Credited</span>
            <Layers className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            ${accounting?.totalDailyEarningsDistributed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Trading yields credited to user balances
          </div>
        </div>

        {/* D. REFERRAL REWARDS DISTRIBUTED */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider">D. Referral Rewards</span>
            <Users className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            ${accounting?.totalReferralRewardsPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex justify-between">
            <span>L1 (5%): ${accounting?.totalReferralRewardsL1.toFixed(2) || '0.00'}</span>
            <span>L2 (2%): ${accounting?.totalReferralRewardsL2.toFixed(2) || '0.00'}</span>
          </div>
        </div>

        {/* E. TOTAL USER WITHDRAWALS */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider">E. User Withdrawals (Gross)</span>
            <ArrowUpFromLine className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            ${accounting?.totalWithdrawn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Net Paid Out: ${accounting?.totalNetPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </div>
        </div>

        {/* F. TOTAL WITHDRAWAL FEES */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider">F. Total Withdrawal Fees</span>
            <Percent className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
            ${accounting?.totalFeesCollected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Configured Rate: {accounting?.withdrawalFeePercentage || 9}% per withdrawal
          </div>
        </div>

        {/* G. FINEXJ RETAINED FEE INCOME */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider">G. Retained Fee Income</span>
            <Landmark className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
            ${accounting?.finexjRetainedFees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </div>
          <div className="text-[11px] text-emerald-700 dark:text-emerald-400/80 mt-1">
            100% retained by FINEXJ (0% referral split)
          </div>
        </div>

        {/* H. FINEXJ OPERATIONAL FUND */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider">H. Operational Fund</span>
            <ShieldCheck className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            ${accounting?.operationalFundBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Platform Treasury & Capital Buffer
          </div>
        </div>

        {/* I. RECONCILIATION DIFFERENCE */}
        <div
          className={`p-5 rounded-2xl border shadow-sm transition ${
            accounting?.reconciliationStatus === 'BALANCED'
              ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
              : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider">I. Reconciliation Difference</span>
            {accounting?.reconciliationStatus === 'BALANCED' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            )}
          </div>
          <div
            className={`text-2xl font-black ${
              accounting?.reconciliationStatus === 'BALANCED'
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            ${accounting?.reconciliationDifference ? Math.abs(accounting.reconciliationDifference).toFixed(2) : '0.00'}
          </div>
          <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
            Status: <span className="font-bold">{accounting?.reconciliationStatus || 'CHECKING...'}</span>
          </div>
        </div>
      </div>

      {/* 5. TODAY'S FINANCIAL METRICS BREAKDOWN & COMPARISON */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>Financial Position Today (UTC)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Real-time daily flow separating user distributions from FINEXJ fee revenue
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            {new Date().toISOString().split('T')[0]}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Deposits Today</span>
            <div className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
              ${accounting?.todayBreakdown.deposits.toFixed(2) || '0.00'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Daily Earnings</span>
            <div className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5">
              ${accounting?.todayBreakdown.dailyEarnings.toFixed(2) || '0.00'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Referrals Today</span>
            <div className="text-lg font-extrabold text-purple-600 dark:text-purple-400 mt-0.5">
              ${accounting?.todayBreakdown.totalReferralRewards.toFixed(2) || '0.00'}
            </div>
            <div className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5">
              L1: ${accounting?.todayBreakdown.referralRewardsL1.toFixed(1)} | L2: ${accounting?.todayBreakdown.referralRewardsL2.toFixed(1)}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Withdrawals Today</span>
            <div className="text-lg font-extrabold text-rose-600 dark:text-rose-400 mt-0.5">
              ${accounting?.todayBreakdown.withdrawals.toFixed(2) || '0.00'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Retained Fees Today</span>
            <div className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
              ${accounting?.todayBreakdown.finexjRetainedFees.toFixed(2) || '0.00'}
            </div>
            <div className="text-[9px] text-emerald-600 dark:text-emerald-400 mt-0.5">
              FINEXJ Income (100%)
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Op Fund Net Today</span>
            <div
              className={`text-lg font-extrabold mt-0.5 ${
                (accounting?.todayBreakdown.operationalAdjustments || 0) >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {(accounting?.todayBreakdown.operationalAdjustments || 0) >= 0 ? '+' : ''}
              ${accounting?.todayBreakdown.operationalAdjustments.toFixed(2) || '0.00'}
            </div>
          </div>
        </div>
      </div>

      {/* 6. FINEXJ EARNINGS TODAY & WITHDRAWAL FEE ACCOUNTING BANNER */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Percent className="w-4 h-4 text-amber-500" />
              <span>FINEXJ Earnings Today & Withdrawal Fee Accounting</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Primary platform income model: {accounting?.withdrawalFeePercentage || 9}% retained withdrawal fees
            </p>
          </div>
          <div className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-semibold">
            Fee Setting: {accounting?.withdrawalFeePercentage || 9.0}%
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Demonstration of Authoritative Fee Math
            </h4>
            <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-xs space-y-1.5 text-slate-700 dark:text-slate-300">
              <div className="flex justify-between">
                <span>Gross User Withdrawal:</span>
                <span className="font-bold text-slate-900 dark:text-white">$1,000.00 USDT</span>
              </div>
              <div className="flex justify-between text-amber-600 dark:text-amber-400">
                <span>Fee Deducted ({accounting?.withdrawalFeePercentage || 9}%):</span>
                <span className="font-bold">-${((1000 * (accounting?.withdrawalFeePercentage || 9)) / 100).toFixed(2)} USDT</span>
              </div>
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>FINEXJ Retained Fee Income:</span>
                <span className="font-bold">+${((1000 * (accounting?.withdrawalFeePercentage || 9)) / 100).toFixed(2)} USDT</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Referral Distribution from Fee:</span>
                <span>$0.00 USDT (Zero Split)</span>
              </div>
              <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800 flex justify-between font-bold text-slate-900 dark:text-white">
                <span>Net Payout Sent to User Wallet:</span>
                <span>${(1000 - (1000 * (accounting?.withdrawalFeePercentage || 9)) / 100).toFixed(2)} USDT</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3 flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Cumulative Fee Retained vs. Referral Distributions
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                Withdrawal fees are 100% retained by the company to capitalize the Operational Fund and reserve pool.
                Referral bonuses (5% L1, 2% L2) are one-time capital distributions funded upon qualifying deposit confirmation.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Total Fees Retained</span>
                <div className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                  ${accounting?.finexjRetainedFees.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Referral Rewards Paid</span>
                <div className="text-base font-extrabold text-purple-600 dark:text-purple-400">
                  ${accounting?.totalReferralRewardsPaid.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 7. REFERRAL ACCOUNTING BREAKDOWN & INSPECTOR */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Users className="w-4 h-4 text-purple-600" />
              <span>Referral Program Accounting</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Non-compounding one-time referral rewards distributed upon confirmed qualifying deposits ($300+ USDT)
            </p>
          </div>
          <div className="flex items-center space-x-2 text-xs text-slate-500">
            <span>Qualifying Referrals:</span>
            <span className="font-bold text-purple-600 dark:text-purple-400 px-2 py-0.5 bg-purple-50 dark:bg-purple-950/40 rounded-md">
              {referralSummary?.qualifyingReferralsCount || accounting?.qualifyingReferralsCount || 0}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Total Rewards Paid</span>
            <div className="text-lg font-extrabold text-purple-600 dark:text-purple-400 mt-0.5">
              ${referralSummary?.totalRewardsAmount.toFixed(2) || accounting?.totalReferralRewardsPaid.toFixed(2) || '0.00'}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Level 1 (5%)</span>
            <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">
              ${referralSummary?.level1RewardsAmount.toFixed(2) || accounting?.totalReferralRewardsL1.toFixed(2) || '0.00'}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Level 2 (2%)</span>
            <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">
              ${referralSummary?.level2RewardsAmount.toFixed(2) || accounting?.totalReferralRewardsL2.toFixed(2) || '0.00'}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Today's Rewards</span>
            <div className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5">
              ${referralSummary?.todayRewardsAmount.toFixed(2) || accounting?.todayBreakdown.totalReferralRewards.toFixed(2) || '0.00'}
            </div>
          </div>
        </div>

        {/* Recent Referral Rewards Stream Table */}
        <div className="pt-2">
          <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Recent Referral Reward Distributions</div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Referrer</th>
                  <th className="py-2.5 px-3">Referred User</th>
                  <th className="py-2.5 px-3">Level</th>
                  <th className="py-2.5 px-3">Deposit Base</th>
                  <th className="py-2.5 px-3">Reward</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {referralSummary?.recentRewards && referralSummary.recentRewards.length > 0 ? (
                  referralSummary.recentRewards.slice(0, 5).map(reward => (
                    <tr key={reward.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">
                        {new Date(reward.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-900 dark:text-white">
                        {reward.referrerEmail}
                      </td>
                      <td className="py-2 px-3 text-slate-600 dark:text-slate-300">
                        {reward.referredEmail}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          reward.rewardLevel === 1 ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                        }`}>
                          Level {reward.rewardLevel} ({reward.rewardPercentage}%)
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono">${reward.qualifyingDepositAmount?.toFixed(2) || '0.00'}</td>
                      <td className="py-2 px-3 font-bold text-purple-600 dark:text-purple-400 font-mono">
                        +${reward.amount.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button
                          onClick={() => setInspectingReferralReward(reward)}
                          className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 transition"
                          title="Inspect Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-slate-400 text-xs">
                      No referral rewards distributed yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 8. FINEXJ OPERATIONAL FUND CONTROLS & LEDGER */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>FINEXJ Operational Fund (Treasury & Reserve)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Autonomous corporate balance capitalized via fee retention and manual administrative injections
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                setAdjustDirection('inflow');
                setAdjustError(null);
                setAdjustSuccessMsg(null);
                setIsAdjustModalOpen(true);
              }}
              className="flex items-center space-x-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Funds</span>
            </button>
            <button
              onClick={() => {
                setAdjustDirection('outflow');
                setAdjustError(null);
                setAdjustSuccessMsg(null);
                setIsAdjustModalOpen(true);
              }}
              className="flex items-center space-x-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition shadow-sm cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
              <span>- Remove Funds</span>
            </button>
          </div>
        </div>

        {/* Operational Fund Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Current Balance</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              ${opSummary?.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'} USDT
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Total Inflows (Injected/Fees)</span>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              +${opSummary?.totalInflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'} USDT
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Total Outflows (Disbursements)</span>
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
              -${opSummary?.totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'} USDT
            </div>
          </div>
        </div>

        {/* Operational Fund Adjustment History Table */}
        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Operational Fund Immutable Audit History
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-2.5 px-3">Date/Time (UTC)</th>
                  <th className="py-2.5 px-3">Admin</th>
                  <th className="py-2.5 px-3">Direction</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Reason</th>
                  <th className="py-2.5 px-3">Reference</th>
                  <th className="py-2.5 px-3">Before Balance</th>
                  <th className="py-2.5 px-3">After Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {opSummary?.recentEntries && opSummary.recentEntries.length > 0 ? (
                  opSummary.recentEntries.map((entry: FinexjOperationalEntry) => (
                    <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                        {new Date(entry.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-medium">
                        {entry.adminId}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            entry.direction === 'inflow'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}
                        >
                          {entry.direction}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold">
                        <span className={entry.direction === 'inflow' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                          {entry.direction === 'inflow' ? '+' : '-'}${entry.amount.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-900 dark:text-white max-w-xs truncate">
                        {entry.reason}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                        {entry.reference || '-'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">
                        ${entry.beforeBalance?.toFixed(2) || '0.00'}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                        ${entry.afterBalance?.toFixed(2) || '0.00'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-400 text-xs">
                      No operational adjustments recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 9. FINEXJ ACCOUNTING RECONCILIATION */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Scale className="w-4 h-4 text-blue-600" />
              <span>FINEXJ Accounting Reconciliation & Solvency</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Authoritative formula cross-referencing system cash holdings against verified liabilities
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold ${
              accounting?.reconciliationStatus === 'BALANCED'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
            }`}
          >
            {accounting?.reconciliationStatus === 'BALANCED' ? 'STATUS: BALANCED & VERIFIED' : 'STATUS: REQUIRES REVIEW'}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Reconciliation Balance Sheet Equations:
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-bold">1. System Liquid Capital</span>
              <div className="text-lg font-bold text-slate-900 dark:text-white mt-1 font-mono">
                ${accounting?.expectedAccountingPosition.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}
              </div>
              <div className="text-[10px] text-slate-500 mt-1 leading-tight">
                Confirmed Deposits + Op Fund Inflows - Net User Payouts - Op Fund Outflows
              </div>
            </div>

            <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-bold">2. Recorded Liabilities & Capital</span>
              <div className="text-lg font-bold text-slate-900 dark:text-white mt-1 font-mono">
                ${((accounting?.totalUserAvailableBalances || 0) + (accounting?.operationalFundBalance || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-slate-500 mt-1 leading-tight">
                User Ledger Balances (${accounting?.totalUserAvailableBalances.toFixed(2)}) + Op Fund (${accounting?.operationalFundBalance.toFixed(2)})
              </div>
            </div>

            <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-bold">3. Reconciliation Variance</span>
              <div
                className={`text-lg font-bold mt-1 font-mono ${
                  accounting?.reconciliationStatus === 'BALANCED'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                ${accounting?.reconciliationDifference ? Math.abs(accounting.reconciliationDifference).toFixed(2) : '0.00'}
              </div>
              <div className="text-[10px] text-slate-500 mt-1 leading-tight">
                {accounting?.reconciliationStatus === 'BALANCED'
                  ? 'All user balances and operational balances match ledger inputs perfectly.'
                  : 'Variance detected requiring administrative ledger audit.'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 10. GENERAL LEDGER STREAM VIEW & FILTERS */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              <span>Authoritative Financial Ledger Stream</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Immutable ledger entries recording deposits, earnings, referral bonuses, withdrawals, and fee collections
            </p>
          </div>
          <div className="text-xs text-slate-500 font-mono">
            Total Records: <strong className="text-slate-900 dark:text-white">{ledgerTotal}</strong>
          </div>
        </div>

        {/* Ledger Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div>
            <label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Category</label>
            <select
              value={ledgerCategoryFilter}
              onChange={e => {
                setLedgerCategoryFilter(e.target.value);
                setLedgerPage(1);
              }}
              className="w-full text-xs py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white cursor-pointer"
            >
              <option value="ALL">All Transaction Categories</option>
              <option value="DEPOSIT">DEPOSIT</option>
              <option value="DAILY_EARNING">DAILY_EARNING</option>
              <option value="REFERRAL_REWARD_L1">REFERRAL_REWARD_L1</option>
              <option value="REFERRAL_REWARD_L2">REFERRAL_REWARD_L2</option>
              <option value="WITHDRAWAL">WITHDRAWAL</option>
              <option value="WITHDRAWAL_FEE">WITHDRAWAL_FEE</option>
              <option value="FINEXJ_OPERATIONAL_ADJUSTMENT">FINEXJ_OPERATIONAL_ADJUSTMENT</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Search Reference ID</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={ledgerSearchRef}
                onChange={e => {
                  setLedgerSearchRef(e.target.value);
                  setLedgerPage(1);
                }}
                placeholder="TX-, REF-, DEP-..."
                className="w-full text-xs py-2 pl-8 pr-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">User Filter</label>
            <input
              type="text"
              value={ledgerSearchUser}
              onChange={e => {
                setLedgerSearchUser(e.target.value);
                setLedgerPage(1);
              }}
              placeholder="User ID or Email..."
              className="w-full text-xs py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center space-x-2">
            <div className="flex-1">
              <label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Min Amount</label>
              <input
                type="number"
                value={ledgerMinAmount}
                onChange={e => {
                  setLedgerMinAmount(e.target.value);
                  setLedgerPage(1);
                }}
                placeholder="0"
                className="w-full text-xs py-2 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Max Amount</label>
              <input
                type="number"
                value={ledgerMaxAmount}
                onChange={e => {
                  setLedgerMaxAmount(e.target.value);
                  setLedgerPage(1);
                }}
                placeholder="10000"
                className="w-full text-xs py-2 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-2.5 px-3">Date/Time (UTC)</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Reference ID</th>
                <th className="py-2.5 px-3">User / Account</th>
                <th className="py-2.5 px-3 text-right">Amount (USDT)</th>
                <th className="py-2.5 px-3 text-right">Balance After</th>
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3 text-center">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {isLoadingLedger ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 text-xs font-sans">
                    <RefreshCw className="w-4 h-4 animate-spin inline mr-2 text-blue-500" />
                    Loading financial ledger records...
                  </td>
                </tr>
              ) : ledgerEntries.length > 0 ? (
                ledgerEntries.map(entry => (
                  <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="py-2 px-3 text-[11px] text-slate-500 whitespace-nowrap">
                      {new Date(entry.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2 px-3 font-sans">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          entry.category === 'DEPOSIT'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : entry.category === 'DAILY_EARNING'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                            : entry.category.startsWith('REFERRAL')
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                            : entry.category === 'WITHDRAWAL'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                            : entry.category === 'WITHDRAWAL_FEE'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                        }`}
                      >
                        {entry.category}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-300 text-[11px]">
                      {entry.reference || '-'}
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 font-sans text-xs">
                      {entry.userEmail}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-bold ${
                        entry.amount >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {entry.amount >= 0 ? '+' : ''}
                      {entry.amount.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-500">
                      {entry.balanceAfter !== undefined ? `$${entry.balanceAfter.toFixed(2)}` : '-'}
                    </td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-300 font-sans text-xs max-w-xs truncate">
                      {entry.description}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button
                        onClick={() => setInspectingLedgerItem(entry)}
                        className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 transition"
                        title="Inspect Entry"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 text-xs font-sans">
                    No ledger entries match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Ledger Pagination */}
        {ledgerTotalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
            <div>
              Showing page <strong>{ledgerPage}</strong> of <strong>{ledgerTotalPages}</strong> ({ledgerTotal} total)
            </div>
            <div className="flex items-center space-x-1.5">
              <button
                disabled={ledgerPage <= 1}
                onClick={() => setLedgerPage(p => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={ledgerPage >= ledgerTotalPages}
                onClick={() => setLedgerPage(p => Math.min(ledgerTotalPages, p + 1))}
                className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =======================================================================
          MODAL: OPERATIONAL FUND ADJUSTMENT (+ / -)
      ======================================================================= */}
      {isAdjustModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <div
                  className={`p-2 rounded-xl text-white ${
                    adjustDirection === 'inflow' ? 'bg-emerald-600' : 'bg-rose-600'
                  }`}
                >
                  {adjustDirection === 'inflow' ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {adjustDirection === 'inflow' ? 'Add Operational Capital (+ Inflow)' : 'Disburse Operational Funds (- Outflow)'}
                  </h3>
                  <p className="text-xs text-slate-500">Atomic server-side calculation with immutable audit tracking</p>
                </div>
              </div>
              <button
                onClick={() => setIsAdjustModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleOperationalAdjustment} className="p-6 space-y-4">
              {adjustError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-xs flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{adjustError}</span>
                </div>
              )}

              {adjustSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{adjustSuccessMsg}</span>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Adjustment Direction
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustDirection('inflow')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      adjustDirection === 'inflow'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    + Inflow (Capital Injection)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustDirection('outflow')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      adjustDirection === 'outflow'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    - Outflow (Disbursement / Expense)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Amount (USDT) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={adjustAmount}
                    onChange={e => setAdjustAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full text-sm font-mono py-2 pl-7 pr-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Mandatory Audit Reason <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  placeholder="e.g. Q3 Liquidity Injection, Infrastructure Hosting, Security Audit..."
                  className="w-full text-xs py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Reference Note / Transaction Hash (Optional)
                </label>
                <input
                  type="text"
                  value={adjustReference}
                  onChange={e => setAdjustReference(e.target.value)}
                  placeholder="e.g. TX-OPS-2026-001 or Blockchain TX Hash"
                  className="w-full text-xs py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                />
              </div>

              {/* Real-time Math Preview Card */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-1.5 font-mono text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Current Balance:</span>
                  <span>${currentOpBal.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT</span>
                </div>
                <div
                  className={`flex justify-between font-bold ${
                    adjustDirection === 'inflow' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  <span>Adjustment ({adjustDirection}):</span>
                  <span>
                    {adjustDirection === 'inflow' ? '+' : '-'}${parsedAdjustmentAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT
                  </span>
                </div>
                <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700 flex justify-between font-bold text-slate-900 dark:text-white">
                  <span>New Balance After Adjustment:</span>
                  <span>${previewNewBal.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT</span>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdjust || parsedAdjustmentAmount <= 0}
                  className={`px-5 py-2 text-xs font-bold text-white rounded-xl transition shadow-md cursor-pointer disabled:opacity-50 ${
                    adjustDirection === 'inflow' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {isSubmittingAdjust ? 'Executing Adjustment...' : 'Confirm & Execute'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =======================================================================
          MODAL: INSPECT LEDGER ENTRY
      ======================================================================= */}
      {inspectingLedgerItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                <span>Ledger Entry Details</span>
              </h3>
              <button
                onClick={() => setInspectingLedgerItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Record ID:</span>
                  <span className="text-slate-900 dark:text-white">{inspectingLedgerItem.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Category:</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">{inspectingLedgerItem.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Timestamp:</span>
                  <span>{new Date(inspectingLedgerItem.timestamp).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">User Account:</span>
                  <span className="font-sans">{inspectingLedgerItem.userEmail}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Amount:</span>
                  <span
                    className={`font-bold ${
                      inspectingLedgerItem.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {inspectingLedgerItem.amount >= 0 ? '+' : ''}
                    {inspectingLedgerItem.amount.toFixed(2)} USDT
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Balance After:</span>
                  <span>
                    {inspectingLedgerItem.balanceAfter !== undefined
                      ? `$${inspectingLedgerItem.balanceAfter.toFixed(2)} USDT`
                      : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Reference:</span>
                  <span className="text-slate-900 dark:text-white truncate max-w-[200px]">
                    {inspectingLedgerItem.reference || '-'}
                  </span>
                </div>
                {inspectingLedgerItem.metadata && Object.keys(inspectingLedgerItem.metadata).length > 0 && (
                  <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-700 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Transaction Metadata</span>
                    {Object.entries(inspectingLedgerItem.metadata).map(([key, val]) => (
                      <div key={key} className="flex justify-between text-[11px]">
                        <span className="text-slate-400">{key}:</span>
                        <span className="text-slate-900 dark:text-white font-mono truncate max-w-[220px]">
                          {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold">Description</span>
                <p className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 font-sans mt-1">
                  {inspectingLedgerItem.description}
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setInspectingLedgerItem(null)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
          MODAL: INSPECT REFERRAL REWARD
      ======================================================================= */}
      {inspectingReferralReward && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Users className="w-4 h-4 text-purple-600" />
                <span>Referral Reward Details</span>
              </h3>
              <button
                onClick={() => setInspectingReferralReward(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Reward ID:</span>
                  <span className="text-slate-900 dark:text-white">{inspectingReferralReward.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Referrer:</span>
                  <span className="font-sans font-medium text-slate-900 dark:text-white">{inspectingReferralReward.referrerEmail}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Referred User:</span>
                  <span className="font-sans text-slate-700 dark:text-slate-300">{inspectingReferralReward.referredEmail}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Tier Level:</span>
                  <span className="font-bold text-purple-600 dark:text-purple-400">
                    Level {inspectingReferralReward.rewardLevel} ({inspectingReferralReward.rewardPercentage}%)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Qualifying Deposit:</span>
                  <span>${inspectingReferralReward.qualifyingDepositAmount?.toFixed(2) || '0.00'} USDT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Deposit Reference ID:</span>
                  <span className="text-slate-900 dark:text-white">{inspectingReferralReward.depositId || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Reward Paid:</span>
                  <span className="font-bold text-purple-600 dark:text-purple-400">
                    +${inspectingReferralReward.amount.toFixed(2)} USDT
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className="uppercase text-emerald-600 font-bold">{inspectingReferralReward.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Date:</span>
                  <span>{new Date(inspectingReferralReward.createdAt).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setInspectingReferralReward(null)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
