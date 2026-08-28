import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { SystemLogsView } from './SystemLogsView';
import { SystemSecurityControls } from './SystemSecurityControls';
import { SystemWalletSettings } from './SystemWalletSettings';
import {
  ShieldAlert,
  Users,
  ArrowUpFromLine,
  ArrowDownToLine,
  TrendingUp,
  Settings,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Sliders,
  DollarSign,
  Send,
  AlertTriangle,
  Database,
  Copy,
  Check,
  Play,
  Terminal,
  ExternalLink,
  Eye,
  Image as ImageIcon,
  CheckCircle,
  X,
  Activity,
  Lock,
} from 'lucide-react';

interface AdminDashboardProps {
  onBackToUser?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'deposits' | 'withdrawals' | 'performance' | 'adjustments' | 'security' | 'logs' | 'audit' | 'database' | 'settings'>('overview');
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [performances, setPerformances] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [appSettings, setAppSettings] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Deposits Filter & Modal State
  const [depositFilter, setDepositFilter] = useState<'all' | 'pending' | 'confirmed' | 'rejected'>('all');
  const [previewPhotoModal, setPreviewPhotoModal] = useState<{ url: string; title: string } | null>(null);
  const [selectedDepositForAction, setSelectedDepositForAction] = useState<{ deposit: any; action: 'confirmed' | 'rejected' } | null>(null);
  const [depositAdminNotes, setDepositAdminNotes] = useState('');

  // Database / Supabase Migration State
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [isTestingDb, setIsTestingDb] = useState(false);
  const [dbMessage, setDbMessage] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  // Performance Form State
  const todayDateStr = new Date().toISOString().split('T')[0];
  const [perfDate, setPerfDate] = useState(todayDateStr);
  const [perfFundAmount, setPerfFundAmount] = useState('2500000');
  const [perfRate, setPerfRate] = useState('0.0050'); // 0.50%
  const [perfNotes, setPerfNotes] = useState('Institutional algorithmic yield & liquidity arbitrage allocation');
  const [allowOverwritePerf, setAllowOverwritePerf] = useState(false);
  const [isDistributing, setIsDistributing] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Payout Modal State
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<any>(null);
  const [payoutTxHash, setPayoutTxHash] = useState('');
  const [adminNote, setAdminNote] = useState('');

  // Adjustment State
  const [adjustUserId, setAdjustUserId] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  const loadAllAdminData = async () => {
    setIsLoading(true);
    try {
      const [dash, uList, dList, wList, pList, aList, sList] = await Promise.all([
        api.getAdminDashboard(),
        api.getAdminUsers(),
        api.getAdminDeposits(),
        api.getAdminWithdrawals(),
        api.getAdminPerformance(),
        api.getAdminAuditLogs(),
        api.getSettings(),
      ]);
      setDashboardData(dash);
      setUsers(uList.users || []);
      setDeposits(dList.deposits || []);
      setWithdrawals(wList.withdrawals || []);
      setPerformances(pList.performances || []);
      setAuditLogs(aList.auditLogs || []);
      setAppSettings(sList);
    } catch (err) {
      console.warn('Failed to load admin data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllAdminData();
  }, []);

  const handleApplyPerformance = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDistributing(true);
    setActionError(null);
    setActionMessage(null);

    try {
      const res = await api.createDailyPerformance({
        date: perfDate,
        overallFundAmount: parseFloat(perfFundAmount),
        actualFundPerformance: parseFloat(perfRate) * 100,
        applicableRate: parseFloat(perfRate),
        notes: perfNotes,
        overwriteExisting: allowOverwritePerf,
      });

      if (res.success) {
        setActionMessage(`Successfully ${allowOverwritePerf ? 'updated & recalculated' : 'distributed'} ${(parseFloat(perfRate) * 100).toFixed(2)}% yield across ${res.affectedUsersCount || res.appliedCount || 0} eligible user accounts! Total: $${(res.totalDistributed || 0).toFixed(2)} USDT.`);
        setAllowOverwritePerf(false);
        await loadAllAdminData();
      }
    } catch (err) {
      setActionError((err as Error).message || 'Failed to distribute daily performance.');
    } finally {
      setIsDistributing(false);
    }
  };

  const handleDepositAction = async (depositId: string, action: 'confirmed' | 'rejected', notes?: string) => {
    try {
      setActionError(null);
      setActionMessage(null);
      const res = await api.updateDepositAction(depositId, {
        action,
        adminNotes: notes || depositAdminNotes || undefined,
      });
      if (res.success) {
        setActionMessage(`Deposit ${depositId} marked as ${action.toUpperCase()} and balance ledger updated.`);
        setSelectedDepositForAction(null);
        setDepositAdminNotes('');
        await loadAllAdminData();
      }
    } catch (err) {
      setActionError((err as Error).message || 'Deposit action failed.');
    }
  };

  const handleWithdrawalAction = async (withdrawalId: string, action: string, txHash?: string) => {
    try {
      setActionError(null);
      setActionMessage(null);
      const res = await api.updateWithdrawalAction(withdrawalId, {
        action,
        txHash,
        adminNotes: adminNote || undefined,
      });
      if (res.success) {
        setActionMessage(`Withdrawal ${action.toUpperCase()} successfully.`);
        setSelectedWithdrawal(null);
        setPayoutTxHash('');
        setAdminNote('');
        await loadAllAdminData();
      }
    } catch (err) {
      setActionError((err as Error).message || 'Action failed.');
    }
  };

  const handleToggleUserStatus = async (targetId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      await api.updateUserStatus(targetId, newStatus);
      await loadAllAdminData();
    } catch (err) {
      alert('Failed to update status');
    }
  };

  const handleCreateAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustUserId || !adjustAmount || !adjustReason) {
      setActionError('All adjustment fields are required.');
      return;
    }

    try {
      setActionError(null);
      const res = await api.createAdjustment({
        targetUserId: adjustUserId,
        amount: parseFloat(adjustAmount),
        reason: adjustReason,
      });
      if (res.success) {
        setActionMessage(`Adjustment of $${adjustAmount} applied with full audit trail.`);
        setAdjustAmount('');
        setAdjustReason('');
        await loadAllAdminData();
      }
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const stats = dashboardData?.stats;
  const filteredDeposits = deposits.filter((d) => {
    if (depositFilter === 'all') return true;
    return d.status === depositFilter;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-24 text-xs">
      {/* Admin Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-5 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-md">
        <div className="flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/20">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold text-slate-900 dark:text-white">FINEXJ Master Admin Console</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                {user?.role.toUpperCase()}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">FINEXJ Institutional Governance & Ledger Management</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={loadAllAdminData}
            className="flex items-center space-x-1.5 py-2 px-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-semibold text-xs transition cursor-pointer"
            title="Refresh All Records"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Action Notification Messages */}
      {actionMessage && (
        <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="font-semibold">{actionMessage}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-blue-500 hover:text-blue-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            <span className="font-semibold">{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex overflow-x-auto no-scrollbar gap-1.5 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
        {[
          { id: 'overview', label: 'Overview', icon: TrendingUp },
          { id: 'deposits', label: 'Deposits', icon: ArrowDownToLine },
          { id: 'withdrawals', label: 'Withdrawals', icon: ArrowUpFromLine },
          { id: 'users', label: 'Users', icon: Users },
          { id: 'performance', label: 'Daily Performance', icon: Sliders },
          { id: 'security', label: 'Security & Auth Controls', icon: Lock },
          { id: 'logs', label: 'System Logs', icon: Activity },
          { id: 'adjustments', label: 'Adjustments', icon: DollarSign },
          { id: 'audit', label: 'Audit Trail', icon: ShieldCheck },
          { id: 'database', label: 'Supabase / DB', icon: Database },
          { id: 'settings', label: 'Settings', icon: Settings },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-1.5 py-2 px-3.5 rounded-xl font-semibold whitespace-nowrap transition cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-500/20'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.id === 'deposits' && (stats?.pendingDepositsCount || 0) > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[9px] font-bold">
                  {stats.pendingDepositsCount}
                </span>
              )}
              {tab.id === 'withdrawals' && (stats?.pendingWithdrawalsCount || 0) > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[9px] font-bold">
                  {stats.pendingWithdrawalsCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Comprehensive Financial Summary Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {/* 1. Total Confirmed Deposits */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Total Confirmed Deposits</span>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                ${(stats?.totalConfirmedDeposits || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
              </p>
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-semibold text-blue-600 dark:text-blue-400">BEP-20 Verified</span>
                <span className="text-slate-400 font-medium">{stats?.totalConfirmedDepositsCount || 0} deposits</span>
              </div>
            </div>

            {/* 2. Total Withdrawals Paid / Provided */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Total Withdrawals Paid</span>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                ${(stats?.totalPaidWithdrawals || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
              </p>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-500 dark:text-slate-400">Net: ${(stats?.totalPaidWithdrawalsNet || 0).toFixed(2)}</span>
                <span className="text-slate-400 font-medium">{stats?.totalPaidWithdrawalsCount || 0} paid</span>
              </div>
            </div>

            {/* 3. Pending Deposits */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Pending Deposits</span>
              <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
                {stats?.pendingDepositsCount || 0} (${(stats?.totalPendingDepositsAmount || 0).toFixed(2)})
              </p>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-amber-600 dark:text-amber-400 font-semibold">Requires Proof Review</span>
                <button
                  onClick={() => {
                    setDepositFilter('pending');
                    setActiveTab('deposits');
                  }}
                  className="underline hover:text-amber-700 cursor-pointer font-medium"
                >
                  Review
                </button>
              </div>
            </div>

            {/* 4. Pending Withdrawals */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Pending Withdrawals</span>
              <p className="text-xl font-bold text-rose-600 dark:text-rose-400">
                {stats?.pendingWithdrawalsCount || 0} (${(stats?.totalPendingWithdrawalsAmount || 0).toFixed(2)})
              </p>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-rose-600 dark:text-rose-400 font-semibold">Requires Approval</span>
                <button
                  onClick={() => setActiveTab('withdrawals')}
                  className="underline hover:text-rose-700 cursor-pointer font-medium"
                >
                  Review
                </button>
              </div>
            </div>

            {/* 5. Total Earnings Distributed */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Total Earnings Distributed</span>
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                +${(stats?.totalEarningsAllocated || 0).toFixed(2)} USDT
              </p>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">Fund Yield Allocations</span>
            </div>

            {/* 6. Withdrawal Fees (4%) */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Withdrawal Fees (4%)</span>
              <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
                ${(stats?.totalWithdrawalFees || 0).toFixed(2)} USDT
              </p>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">Platform Retained Pool</span>
            </div>

            {/* 7. Vault Retained Liquidity */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm col-span-2 sm:col-span-1 lg:col-span-2">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Vault Retained Liquidity</span>
              <p className="text-xl font-bold text-blue-700 dark:text-blue-300 font-mono">
                ${(stats?.vaultRetainedLiquidity || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
              </p>
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">Net Active Vault Balance (Deposits - Withdrawals + Fees)</span>
            </div>
          </div>

          {/* Quick Daily Allocation Card */}
          <div className="p-6 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Daily Performance Distribution (Profit, Loss, or Safe Day)</span>
              </h2>
              <div className="flex items-center space-x-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setPerfRate('0.01');
                    setPerfNotes('Profitable trading day (+1.00%).');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-800/60 transition cursor-pointer"
                >
                  +1.00% Profit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPerfRate('-0.005');
                    setPerfNotes('Market adjustment / draw-down (-0.50%).');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 font-bold border border-rose-200 dark:border-rose-800/60 transition cursor-pointer"
                >
                  -0.50% Loss
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPerfRate('0');
                    setPerfNotes('We are safe today, no investment / trading today (Capital Preserved).');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                >
                  0.00% Safe Day
                </button>
              </div>
            </div>

            {/* Date already distributed notice */}
            {(() => {
              const existingPerf = performances.find(p => p.date === perfDate);
              if (existingPerf) {
                return (
                  <div className="mb-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 text-xs text-amber-800 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <div>
                        <span className="font-bold">Yield for {perfDate} is already calculated & recorded</span>
                        <span className="ml-1 text-amber-700 dark:text-amber-300">
                          ({existingPerf.actualFundPerformance >= 0 ? '+' : ''}{existingPerf.actualFundPerformance.toFixed(2)}% | {existingPerf.appliedCount} accounts credited | ${(existingPerf.totalDistributed || 0).toFixed(2)} USDT)
                        </span>
                      </div>
                    </div>
                    <label className="flex items-center space-x-2 cursor-pointer bg-white dark:bg-amber-900/40 px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-700 select-none">
                      <input
                        type="checkbox"
                        checked={allowOverwritePerf}
                        onChange={e => setAllowOverwritePerf(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-semibold text-[11px] text-amber-900 dark:text-amber-100">
                        Allow Overwrite / Recalculate
                      </span>
                    </label>
                  </div>
                );
              }
              return null;
            })()}

            <form onSubmit={handleApplyPerformance} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-slate-500 dark:text-slate-400 text-[11px] mb-1 font-medium">Performance Date</label>
                <input
                  type="date"
                  value={perfDate}
                  onChange={e => {
                    setPerfDate(e.target.value);
                    setAllowOverwritePerf(false);
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-500 dark:text-slate-400 text-[11px] mb-1 font-medium">
                  Applicable Rate (e.g. 0.01 = +1%, -0.005 = -0.5%, 0 = 0%)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={perfRate}
                  onChange={e => setPerfRate(e.target.value)}
                  className={`w-full py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-bold ${
                    parseFloat(perfRate) > 0
                      ? 'text-blue-600 dark:text-blue-400'
                      : parseFloat(perfRate) < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                />
              </div>

              <div>
                <label className="block text-slate-500 dark:text-slate-400 text-[11px] mb-1 font-medium">Custom Note / Condition</label>
                <input
                  type="text"
                  value={perfNotes}
                  onChange={e => setPerfNotes(e.target.value)}
                  placeholder="e.g. We are safe today, no investment today"
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-end">
                {(() => {
                  const existingPerf = performances.find(p => p.date === perfDate);
                  const isBlocked = existingPerf && !allowOverwritePerf;
                  return (
                    <button
                      type="submit"
                      disabled={isDistributing || Boolean(isBlocked)}
                      title={isBlocked ? `Date ${perfDate} has already been calculated. Enable Overwrite to recalculate.` : ''}
                      className={`w-full py-2.5 px-4 rounded-xl disabled:opacity-50 font-bold transition flex items-center justify-center space-x-2 cursor-pointer ${
                        isBlocked
                          ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                          : allowOverwritePerf && existingPerf
                          ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-500/20'
                          : parseFloat(perfRate) > 0
                          ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20'
                          : parseFloat(perfRate) < 0
                          ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-500/20'
                          : 'bg-slate-700 hover:bg-slate-600 text-white'
                      }`}
                    >
                      {isDistributing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isBlocked ? (
                        <Lock className="w-4 h-4" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span>
                        {isBlocked
                          ? `Already Posted (${(existingPerf.applicableRate * 100).toFixed(2)}%)`
                          : allowOverwritePerf && existingPerf
                          ? `Recalculate & Update (${(parseFloat(perfRate) * 100).toFixed(2)}%)`
                          : parseFloat(perfRate) > 0
                          ? `Post +${(parseFloat(perfRate) * 100).toFixed(2)}% Profit`
                          : parseFloat(perfRate) < 0
                          ? `Post ${(parseFloat(perfRate) * 100).toFixed(2)}% Loss`
                          : 'Post Safe Day (0.00%)'}
                      </span>
                    </button>
                  );
                })()}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB: DEPOSITS */}
      {activeTab === 'deposits' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center space-x-2">
                <ArrowDownToLine className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>User Deposits & Payment Proof Review ({filteredDeposits.length})</span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Inspect uploaded payment receipts, verify BSC transactions on BscScan, and approve deposits to credit user balances.
              </p>
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center space-x-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
              {[
                { id: 'all', label: `All (${deposits.length})` },
                { id: 'pending', label: `Pending Review (${deposits.filter(d => d.status === 'pending').length})` },
                { id: 'confirmed', label: `Confirmed (${deposits.filter(d => d.status === 'confirmed').length})` },
                { id: 'rejected', label: `Rejected (${deposits.filter(d => d.status === 'rejected').length})` },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setDepositFilter(f.id as any)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                    depositFilter === f.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {filteredDeposits.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              No deposits match the selected filter.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDeposits.map((dep) => {
                const targetUser = users.find(u => u.id === dep.userId);
                return (
                  <div
                    key={dep.id}
                    className="p-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm hover:border-blue-500/30 transition"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold text-slate-900 dark:text-white">
                          ${dep.amount.toFixed(2)} USDT
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            dep.status === 'confirmed'
                              ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60'
                              : dep.status === 'rejected'
                              ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60'
                              : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                          }`}
                        >
                          {dep.status === 'confirmed' ? '✓ CONFIRMED & CREDITED' : dep.status === 'rejected' ? '✕ REJECTED' : '⏳ PENDING PROOF REVIEW'}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                          Ref: {dep.reference || dep.id}
                        </span>
                      </div>

                      {/* User & Submission Details */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <div>
                          <p>
                            <strong>User:</strong> {targetUser ? `${targetUser.fullName} (${targetUser.email})` : dep.userId}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            <strong>Date:</strong> {new Date(dep.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          {dep.txHash ? (
                            <p className="flex items-center space-x-1.5">
                              <strong>Tx Hash:</strong>
                              <a
                                href={`https://bscscan.com/tx/${dep.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1 inline-flex"
                              >
                                <span>{dep.txHash.slice(0, 10)}...{dep.txHash.slice(-6)}</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </p>
                          ) : (
                            <p className="text-slate-400 italic">No blockchain tx hash provided</p>
                          )}
                          {dep.userNotes && (
                            <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                              <strong>User Note:</strong> &ldquo;{dep.userNotes}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Admin Note if already reviewed */}
                      {dep.adminNotes && (
                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900 text-[11px] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
                          <strong>Admin Review Note:</strong> {dep.adminNotes} (by {dep.reviewedBy || 'Admin'})
                        </div>
                      )}
                    </div>

                    {/* Proof Photo & Actions */}
                    <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between gap-3 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
                      {/* Photo Proof Preview Button / Thumbnail */}
                      {dep.proofPhotoUrl ? (
                        <button
                          onClick={() => setPreviewPhotoModal({
                            url: dep.proofPhotoUrl,
                            title: `Deposit Proof - $${dep.amount.toFixed(2)} USDT (${dep.reference || dep.id})`
                          })}
                          className="flex items-center space-x-2 p-1.5 pr-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 font-semibold transition cursor-pointer"
                        >
                          <img
                            src={dep.proofPhotoUrl}
                            alt="Receipt"
                            className="w-9 h-9 rounded-lg object-cover border border-blue-200 dark:border-blue-700"
                          />
                          <div className="text-left text-[11px]">
                            <span className="block font-bold">View Receipt</span>
                            <span className="text-[9px] text-blue-600 dark:text-blue-400 flex items-center space-x-0.5">
                              <Eye className="w-2.5 h-2.5" />
                              <span>Click to Inspect</span>
                            </span>
                          </div>
                        </button>
                      ) : (
                        <div className="text-[11px] text-slate-400 flex items-center space-x-1">
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>No receipt photo</span>
                        </div>
                      )}

                      {/* Admin Decision Action Buttons */}
                      {dep.status === 'pending' ? (
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setSelectedDepositForAction({ deposit: dep, action: 'confirmed' })}
                            className="py-2 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-sm cursor-pointer flex items-center space-x-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve & Credit</span>
                          </button>
                          <button
                            onClick={() => setSelectedDepositForAction({ deposit: dep, action: 'rejected' })}
                            className="py-2 px-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 font-bold transition cursor-pointer flex items-center space-x-1"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      ) : (
                        <div className="text-right">
                          <span className="text-[11px] text-slate-400">
                            {dep.status === 'confirmed' ? 'Credited to Balance' : 'Rejected'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: USERS */}
      {activeTab === 'users' && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            Registered Users & Accounts ({users.length})
          </h2>
          <div className="space-y-2">
            {users.map(u => (
              <div
                key={u.id}
                className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
              >
                <div className="flex items-center space-x-3">
                  <img
                    src={u.profilePictureUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.fullName}`}
                    alt="avatar"
                    className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                  />
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-900 dark:text-white text-sm">{u.fullName}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {u.role}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          u.status === 'active'
                            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                            : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                        }`}
                      >
                        {u.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{u.email} • {u.country}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                      Created: {new Date(u.createdAt).toLocaleDateString()} ({u.balance?.accountAgeDays || 0}d age)
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      ${u.balance?.availableBalance?.toFixed(2)} USDT
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      Deposited: ${u.balance?.totalDeposited?.toFixed(2)}
                    </p>
                  </div>

                  <button
                    onClick={() => handleToggleUserStatus(u.id, u.status)}
                    className={`py-1.5 px-3 rounded-lg font-bold transition text-[11px] cursor-pointer ${
                      u.status === 'active'
                        ? 'bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/60'
                        : 'bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60'
                    }`}
                  >
                    {u.status === 'active' ? 'Suspend' : 'Activate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: WITHDRAWALS */}
      {activeTab === 'withdrawals' && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            Withdrawal Management & Payouts ({withdrawals.length})
          </h2>

          {withdrawals.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              No withdrawal requests.
            </div>
          ) : (
            <div className="space-y-2">
              {withdrawals.map(wd => (
                <div
                  key={wd.id}
                  className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-900 dark:text-white text-sm">
                        ${wd.requestedAmount.toFixed(2)} USDT
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          wd.status === 'paid'
                            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                            : wd.status === 'rejected'
                            ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {wd.status.toUpperCase()}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Net: ${wd.netAmount.toFixed(2)} (4% Fee: ${wd.feeAmount.toFixed(2)})
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-700 dark:text-slate-300 font-mono break-all">
                      To: {wd.destinationAddress}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                      User: {wd.userId} • Ref: {wd.reference} • {new Date(wd.createdAt).toLocaleString()}
                    </p>
                  </div>

                  {wd.status === 'pending' || wd.status === 'under_review' ? (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setSelectedWithdrawal(wd)}
                        className="py-1.5 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-sm cursor-pointer"
                      >
                        Pay / Complete
                      </button>
                      <button
                        onClick={() => handleWithdrawalAction(wd.id, 'rejected')}
                        className="py-1.5 px-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/60 font-bold transition cursor-pointer"
                      >
                        Reject & Refund
                      </button>
                    </div>
                  ) : (
                    <div className="text-right">
                      {wd.txHash && (
                        <p className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">Tx: {wd.txHash.substring(0, 10)}...</p>
                      )}
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">{wd.status === 'paid' ? 'Paid on Chain' : 'Resolved'}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Payout Completion Modal */}
      {selectedWithdrawal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase">
              Complete BEP-20 Payout ({selectedWithdrawal.reference})
            </h3>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 space-y-1 text-xs">
              <p>Net Payout Amount: <strong className="text-blue-600 dark:text-blue-400 font-bold">${selectedWithdrawal.netAmount.toFixed(2)} USDT</strong></p>
              <p className="font-mono text-[10px] break-all text-slate-500 dark:text-slate-400">Destination: {selectedWithdrawal.destinationAddress}</p>
            </div>

            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1 text-xs font-medium">BNB Smart Chain Payout Tx Hash</label>
              <input
                type="text"
                value={payoutTxHash}
                onChange={e => setPayoutTxHash(e.target.value)}
                placeholder="0x..."
                className="w-full py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1 text-xs font-medium">Admin Internal Note (Optional)</label>
              <input
                type="text"
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                placeholder="Payout verified on BSC wallet"
                className="w-full py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs"
              />
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                onClick={() => handleWithdrawalAction(selectedWithdrawal.id, 'paid', payoutTxHash || undefined)}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition cursor-pointer shadow-md shadow-blue-500/20"
              >
                Mark as Paid & Notify User
              </button>
              <button
                onClick={() => setSelectedWithdrawal(null)}
                className="py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deposit Receipt Preview Fullscreen Modal */}
      {previewPhotoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-2xl p-6 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ImageIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {previewPhotoModal.title}
                </h3>
              </div>
              <button
                onClick={() => setPreviewPhotoModal(null)}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative rounded-2xl overflow-hidden bg-slate-950/90 border border-slate-800 max-h-[65vh] flex items-center justify-center">
              <img
                src={previewPhotoModal.url}
                alt="Payment Receipt"
                className="max-h-[60vh] max-w-full object-contain rounded-xl shadow-lg"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <a
                href={previewPhotoModal.url}
                target="_blank"
                rel="noopener noreferrer"
                download="deposit-proof.png"
                className="py-2 px-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center space-x-1.5 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Original Image</span>
              </a>
              <button
                onClick={() => setPreviewPhotoModal(null)}
                className="py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-sm cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deposit Action Confirmation Modal (Approve / Reject) */}
      {selectedDepositForAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center space-x-2">
              {selectedDepositForAction.action === 'confirmed' ? (
                <CheckCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              )}
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase">
                {selectedDepositForAction.action === 'confirmed'
                  ? 'Approve & Credit Deposit'
                  : 'Reject Deposit Submission'}
              </h3>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Amount:</span>
                <strong className="text-base font-bold text-slate-900 dark:text-white">
                  ${selectedDepositForAction.deposit.amount.toFixed(2)} USDT
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Reference:</span>
                <span className="font-mono">{selectedDepositForAction.deposit.reference || selectedDepositForAction.deposit.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">User ID:</span>
                <span>{selectedDepositForAction.deposit.userId}</span>
              </div>
              {selectedDepositForAction.deposit.txHash && (
                <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-800 text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400">BscScan:</span>
                  <a
                    href={`https://bscscan.com/tx/${selectedDepositForAction.deposit.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 font-mono hover:underline flex items-center space-x-1"
                  >
                    <span>View Tx ↗</span>
                  </a>
                </div>
              )}
            </div>

            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1 text-xs font-medium">
                {selectedDepositForAction.action === 'confirmed'
                  ? 'Administrative Approval Note (Optional)'
                  : 'Rejection Reason (Will be visible to user)'}
              </label>
              <textarea
                rows={2}
                value={depositAdminNotes}
                onChange={e => setDepositAdminNotes(e.target.value)}
                placeholder={
                  selectedDepositForAction.action === 'confirmed'
                    ? 'Receipt verified against on-chain wallet balance'
                    : 'Receipt illegible or transaction hash not found on BEP-20 chain'
                }
                className="w-full py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs"
              />
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                onClick={() => handleDepositAction(
                  selectedDepositForAction.deposit.id,
                  selectedDepositForAction.action,
                  depositAdminNotes
                )}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs text-white transition cursor-pointer shadow-md ${
                  selectedDepositForAction.action === 'confirmed'
                    ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
                    : 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20'
                }`}
              >
                {selectedDepositForAction.action === 'confirmed'
                  ? 'Confirm & Credit Balance'
                  : 'Confirm Rejection'}
              </button>
              <button
                onClick={() => {
                  setSelectedDepositForAction(null);
                  setDepositAdminNotes('');
                }}
                className="py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PERFORMANCE HISTORY */}
      {activeTab === 'performance' && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            Daily Performance Records ({performances.length})
          </h2>
          <div className="space-y-2">
            {performances.map(p => (
              <div
                key={p.id}
                className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-900 dark:text-white">{p.date}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        p.applicableRate > 0
                          ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60'
                          : p.applicableRate < 0
                          ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {p.applicableRate > 0
                        ? `+${(p.applicableRate * 100).toFixed(2)}% Profit`
                        : p.applicableRate < 0
                        ? `${(p.applicableRate * 100).toFixed(2)}% Loss`
                        : '0.00% Safe (No Trade)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{p.notes}</p>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <p
                      className={`text-sm font-bold ${
                        p.totalDistributed > 0
                          ? 'text-blue-600 dark:text-blue-400'
                          : p.totalDistributed < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {p.totalDistributed > 0
                        ? `+$${p.totalDistributed.toFixed(2)} USDT`
                        : p.totalDistributed < 0
                        ? `-$${Math.abs(p.totalDistributed).toFixed(2)} USDT`
                        : '$0.00 USDT (Safe)'}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">{p.appliedCount} Users Calculated</p>
                  </div>
                  <button
                    onClick={() => {
                      setPerfDate(p.date);
                      setPerfRate(String(p.applicableRate));
                      setPerfNotes(p.notes);
                      setAllowOverwritePerf(true);
                      setActiveTab('overview');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition cursor-pointer"
                  >
                    Edit / Recalculate
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            System Audit Trail ({auditLogs.length})
          </h2>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {auditLogs.map(log => (
              <div key={log.id} className="p-3.5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-blue-600 dark:text-blue-400">{log.action}</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">{new Date(log.timestamp).toLocaleString()}</span>
                </div>
                <p className="text-slate-700 dark:text-slate-300">{log.reason || 'Action logged'}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  Actor: {log.actorEmail} ({log.actorRole}) {log.targetUserId ? `• Target: ${log.targetUserId}` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: ADJUSTMENTS */}
      {activeTab === 'adjustments' && (
        <div className="space-y-4 p-6 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            Auditable Balance Adjustment (Super Admin Only)
          </h2>
          <form onSubmit={handleCreateAdjustment} className="space-y-3 max-w-md">
            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1 text-xs font-medium">Target User ID / Email</label>
              <select
                value={adjustUserId}
                onChange={e => setAdjustUserId(e.target.value)}
                className="w-full py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs"
              >
                <option value="">Select User</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.email}) - Current: ${u.balance?.availableBalance?.toFixed(2)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1 text-xs font-medium">Amount (+ to credit, - to debit)</label>
              <input
                type="number"
                step="any"
                value={adjustAmount}
                onChange={e => setAdjustAmount(e.target.value)}
                placeholder="+50 or -50"
                className="w-full py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-bold text-xs"
              />
            </div>

            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1 text-xs font-medium">Mandatory Reason for Audit Log</label>
              <input
                type="text"
                value={adjustReason}
                onChange={e => setAdjustReason(e.target.value)}
                placeholder="Institutional correction / OTC topup"
                className="w-full py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition cursor-pointer"
            >
              Apply Adjustment with Audit Log
            </button>
          </form>
        </div>
      )}

      {/* TAB 7: DATABASE & SUPABASE MIGRATION */}
      {activeTab === 'database' && (
        <div className="space-y-6 p-6 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="flex items-center space-x-2">
                <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Supabase & PostgreSQL Database Manager
                </h2>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                Test connection, execute automated schema migrations, and inspect table readiness.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={async () => {
                  try {
                    const sql = await api.getDbSchemaSql();
                    await navigator.clipboard.writeText(sql);
                    setCopiedSql(true);
                    setTimeout(() => setCopiedSql(false), 3000);
                  } catch (e) {
                    console.error(e);
                  }
                }}
                className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700 transition cursor-pointer text-xs"
              >
                {copiedSql ? <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedSql ? 'SQL Copied!' : 'Copy Schema SQL'}</span>
              </button>

              <button
                onClick={async () => {
                  setIsTestingDb(true);
                  setDbMessage(null);
                  try {
                    const res = await api.runDbMigration();
                    setDbStatus(res);
                    if (res.postgresPoolReady) {
                      setDbMessage(`Connected & verified ${res.tablesFound?.length || 0} tables successfully (${res.latencyMs}ms)!`);
                    } else {
                      setDbMessage(`Notice: ${res.postgresPoolError || 'Database parameters not yet detected in environment.'}`);
                    }
                  } catch (err) {
                    setDbMessage((err as Error).message);
                  } finally {
                    setIsTestingDb(false);
                  }
                }}
                disabled={isTestingDb}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition disabled:opacity-50 cursor-pointer text-xs shadow-md shadow-blue-500/20"
              >
                {isTestingDb ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                <span>Test Connection & Migrate</span>
              </button>
            </div>
          </div>

          {dbMessage && (
            <div className={`p-4 rounded-2xl border text-xs font-semibold flex items-center space-x-2 ${
              dbStatus?.postgresPoolReady
                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
            }`}>
              {dbStatus?.postgresPoolReady ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-blue-600 dark:text-blue-400" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />}
              <span>{dbMessage}</span>
            </div>
          )}

          {/* Diagnostic Status Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">Connection Method</span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                {dbStatus?.connectionType || 'Checking...'}
              </span>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {dbStatus?.connectionType === 'DATABASE_URL' ? 'Direct Pooler URI' : dbStatus?.connectionType === 'HOST_PARAMS' ? 'Direct Host Params' : 'Environment credentials'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">PostgreSQL Pool & Schema</span>
              <div className="flex items-center space-x-1.5">
                <span className={`w-2 h-2 rounded-full ${dbStatus?.postgresPoolReady ? 'bg-blue-600 dark:bg-blue-400' : 'bg-amber-500'}`} />
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {dbStatus?.postgresPoolReady ? 'Ready & Active' : 'Awaiting Config'}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {dbStatus?.tablesFound?.length ? `${dbStatus.tablesFound.length} tables verified` : 'Ready to create tables'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">@supabase/server Client</span>
              <div className="flex items-center space-x-1.5">
                <span className={`w-2 h-2 rounded-full ${dbStatus?.supabaseJsReady ? 'bg-blue-600 dark:bg-blue-400' : 'bg-slate-400'}`} />
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {dbStatus?.supabaseJsReady ? 'Connected' : 'Ready'}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {dbStatus?.latencyMs ? `${dbStatus.latencyMs} ms latency` : 'Supabase JS SDK'}
              </p>
            </div>
          </div>

          {/* Database Tables Overview */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Database Table Schemas
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { name: 'users', desc: 'Auth, roles & 2FA' },
                { name: 'deposits', desc: 'BEP-20 transactions' },
                { name: 'withdrawals', desc: 'Payout requests & fees' },
                { name: 'daily_performances', desc: 'Fund yield history' },
                { name: 'earnings', desc: 'User daily allocations' },
                { name: 'ledger', desc: 'Double-entry journal' },
                { name: 'audit_logs', desc: 'Compliance audit trail' },
                { name: 'system_settings', desc: 'Fund parameters' },
              ].map((table) => {
                const isCreated = dbStatus?.tablesFound?.includes(table.name);
                return (
                  <div
                    key={table.name}
                    className={`p-3 rounded-2xl border transition ${
                      isCreated
                        ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-xs">{table.name}</span>
                      {isCreated ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-600" />
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{table.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Manual Run Instructions */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
            <div className="flex items-center space-x-2 text-slate-900 dark:text-white font-bold">
              <Terminal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>How to Apply Schema in Supabase</span>
            </div>
            <p>
              <strong>Method 1 (Automatic via App):</strong> Once you save your <code className="text-blue-600 dark:text-blue-400 font-bold">DATABASE_URL</code> or <code className="text-blue-600 dark:text-blue-400 font-bold">SUPABASE_URL</code> in your environment, click the <strong>Test Connection & Migrate</strong> button above. The server will run the SQL schema file automatically.
            </p>
            <p>
              <strong>Method 2 (Supabase Web Dashboard):</strong> Click <strong>Copy Schema SQL</strong>, open your <strong>Supabase Dashboard → SQL Editor</strong>, paste the script, and click <strong>Run</strong>. All tables, relationships, and indexes will be created instantly.
            </p>
          </div>
        </div>
      )}

      {/* TAB: SECURITY & AUTH CONTROLS */}
      {activeTab === 'security' && (
        <SystemSecurityControls
          appSettings={appSettings}
          onSettingsUpdated={() => loadAllAdminData()}
        />
      )}

      {/* TAB: SYSTEM LOGS */}
      {activeTab === 'logs' && <SystemLogsView />}

      {/* TAB 8: SETTINGS */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <SystemWalletSettings
            appSettings={appSettings}
            onSettingsUpdated={() => loadAllAdminData()}
          />

          <SystemSecurityControls
            appSettings={appSettings}
            onSettingsUpdated={() => loadAllAdminData()}
          />
        </div>
      )}
    </div>
  );
};
