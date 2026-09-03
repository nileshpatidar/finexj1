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
  Check,
  ExternalLink,
  Eye,
  Image as ImageIcon,
  CheckCircle,
  X,
  Activity,
  Lock,
  ChevronDown,
  Landmark,
} from 'lucide-react';
import { AdminAccountingView } from './AdminAccountingView';

interface AdminDashboardProps {
  onBackToUser?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'accounting' | 'users' | 'deposits' | 'withdrawals' | 'performance' | 'adjustments' | 'security' | 'logs' | 'audit' | 'settings'>('overview');
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

  // Performance Form State
  const todayDateStr = new Date().toISOString().split('T')[0];
  const [perfDate, setPerfDate] = useState(todayDateStr);
  const [perfMode, setPerfMode] = useState<'profit' | 'loss' | 'safe'>('profit');
  const [perfPercent, setPerfPercent] = useState('0.50'); // e.g. 0.50%
  const [perfNotes, setPerfNotes] = useState('Profitable trading day (+0.50%).');
  const [allowOverwritePerf, setAllowOverwritePerf] = useState(false);
  const [isDistributing, setIsDistributing] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Payout Modal State
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<any>(null);
  const [payoutTxHash, setPayoutTxHash] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);

  // Action Loading States
  const [isProcessingDepositAction, setIsProcessingDepositAction] = useState<string | null>(null);
  const [isProcessingWithdrawalAction, setIsProcessingWithdrawalAction] = useState<string | null>(null);

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

    const parsedPercent = parseFloat(perfPercent || '0');
    const validPercent = isNaN(parsedPercent) ? 0 : parsedPercent;

    const effectivePercentagePoints =
      perfMode === 'safe'
        ? 0
        : perfMode === 'loss'
        ? -Math.abs(validPercent)
        : Math.abs(validPercent);

    const effectiveApplicableRate = effectivePercentagePoints / 100;

    try {
      const res = await api.createDailyPerformance({
        date: perfDate,
        actualFundPerformance: effectivePercentagePoints,
        applicableRate: effectiveApplicableRate,
        notes: perfNotes,
        overwriteExisting: allowOverwritePerf,
      });

      if (res.success) {
        const sign = effectivePercentagePoints > 0 ? '+' : '';
        setActionMessage(
          `Successfully ${allowOverwritePerf ? 'updated & recalculated' : 'distributed'} ${sign}${effectivePercentagePoints.toFixed(2)}% yield across ${res.affectedUsersCount || res.appliedCount || 0} eligible user accounts! Total: $${(res.totalDistributed || 0).toFixed(2)} USDT.`
        );
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
    setIsProcessingDepositAction(depositId);
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
    } finally {
      setIsProcessingDepositAction(null);
    }
  };

  const handleAdminVerifyDeposit = async (depositId: string) => {
    setIsProcessingDepositAction(depositId);
    try {
      setActionError(null);
      setActionMessage(null);
      const res = await api.verifyAdminDeposit(depositId);
      if (res.success) {
        if (res.deposit?.status === 'confirmed') {
          setActionMessage(res.message || `Deposit verified on BNB Smart Chain and confirmed!`);
        } else {
          setActionMessage(res.message || `BSC verification checked. Confirmations: ${res.confirmations || 0}/${res.requiredConfirmations || 12}`);
        }
        await loadAllAdminData();
      } else {
        setActionError(res.error || 'Verification on BNB Smart Chain failed.');
      }
    } catch (err: any) {
      setActionError(err?.message || 'Failed to query BNB Smart Chain RPC node.');
    } finally {
      setIsProcessingDepositAction(null);
    }
  };

  const handleWithdrawalAction = async (withdrawalId: string, action: string, txHash?: string) => {
    if (action === 'paid' && (!txHash || !txHash.trim())) {
      setActionError('BNB Smart Chain Payout Tx Hash is a required field to complete payout confirmation.');
      return;
    }
    setIsProcessingWithdrawalAction(withdrawalId);
    try {
      setActionError(null);
      setActionMessage(null);
      const res = await api.updateWithdrawalAction(withdrawalId, {
        action,
        txHash: txHash ? txHash.trim() : undefined,
        adminNotes: adminNote ? adminNote.trim() : undefined,
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
    } finally {
      setIsProcessingWithdrawalAction(null);
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

      {/* Streamlined Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
        {[
          { id: 'overview', label: 'Overview', icon: TrendingUp },
          ...(user?.role === 'super_admin' ? [{ id: 'accounting', label: 'FINEXJ Accounting', icon: Landmark }] : []),
          { id: 'deposits', label: 'Deposits', icon: ArrowDownToLine },
          { id: 'withdrawals', label: 'Withdrawals', icon: ArrowUpFromLine },
          { id: 'users', label: 'Users', icon: Users },
          { id: 'performance', label: 'Daily Performance', icon: Sliders },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                setToolsMenuOpen(false);
              }}
              className={`flex items-center space-x-1.5 py-2 px-3.5 rounded-xl font-semibold whitespace-nowrap transition cursor-pointer text-xs ${
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

        {/* More Tools Dropdown */}
        <div className="relative">
          {(() => {
            const secondaryTabs = [
              { id: 'security', label: 'Security & Auth Controls', icon: Lock },
              { id: 'adjustments', label: 'Adjustments', icon: DollarSign },
              { id: 'logs', label: 'System Logs', icon: Activity },
              { id: 'audit', label: 'Audit Trail', icon: ShieldCheck },
              { id: 'settings', label: 'Settings', icon: Settings },
            ];
            const activeSecondary = secondaryTabs.find(t => t.id === activeTab);
            const SelectedIcon = activeSecondary ? activeSecondary.icon : Settings;

            return (
              <>
                <button
                  type="button"
                  onClick={() => setToolsMenuOpen(prev => !prev)}
                  className={`flex items-center space-x-1.5 py-2 px-3.5 rounded-xl font-semibold whitespace-nowrap transition cursor-pointer text-xs ${
                    activeSecondary
                      ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-500/20'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <SelectedIcon className="w-3.5 h-3.5" />
                  <span>{activeSecondary ? activeSecondary.label : 'More Tools & Logs'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${toolsMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {toolsMenuOpen && (
                  <div className="absolute left-0 top-full mt-2 w-56 p-1.5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xl z-50 animate-in fade-in zoom-in-95">
                    {secondaryTabs.map(item => {
                      const ItemIcon = item.icon;
                      const isItemActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActiveTab(item.id as any);
                            setToolsMenuOpen(false);
                          }}
                          className={`w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-left text-xs font-medium transition cursor-pointer ${
                            isItemActive
                              ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-bold'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <ItemIcon className="w-4 h-4 text-slate-400" />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </div>
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
              <p className={`text-xl font-bold ${(stats?.totalEarningsAllocated || 0) >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {(stats?.totalEarningsAllocated || 0) >= 0 ? '+' : '-'}${Math.abs(stats?.totalEarningsAllocated || 0).toFixed(2)} USDT
              </p>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">Fund Yield Allocations</span>
            </div>

            {/* 6. Withdrawal Fees */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Withdrawal Fees ({appSettings?.withdrawalFeePercentage ?? 6}%)</span>
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
          <div className="p-6 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-5 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center space-x-2">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center space-x-2">
                    <Sliders className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Daily Yield & Performance Distribution</span>
                  </h2>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold border border-emerald-200 dark:border-emerald-800/60 animate-pulse">
                    ● Live Fund Pool
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Post authoritative daily trading returns (+Profit, -Loss, or 0.00% Safe Day) for all confirmed deposits.
                </p>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 mr-1">Presets:</span>
                <button
                  type="button"
                  onClick={() => {
                    setPerfMode('profit');
                    setPerfPercent('1.00');
                    setPerfNotes('Profitable trading day (+1.00%).');
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold border transition cursor-pointer ${
                    perfMode === 'profit' && perfPercent === '1.00'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60'
                  }`}
                >
                  +1.00% Profit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPerfMode('profit');
                    setPerfPercent('0.50');
                    setPerfNotes('Profitable trading day (+0.50%).');
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold border transition cursor-pointer ${
                    perfMode === 'profit' && perfPercent === '0.50'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60'
                  }`}
                >
                  +0.50% Profit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPerfMode('loss');
                    setPerfPercent('0.50');
                    setPerfNotes('Market adjustment / draw-down (-0.50%).');
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold border transition cursor-pointer ${
                    perfMode === 'loss' && perfPercent === '0.50'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                      : 'bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60'
                  }`}
                >
                  -0.50% Loss
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPerfMode('loss');
                    setPerfPercent('1.00');
                    setPerfNotes('Market adjustment / draw-down (-1.00%).');
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold border transition cursor-pointer ${
                    perfMode === 'loss' && perfPercent === '1.00'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                      : 'bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60'
                  }`}
                >
                  -1.00% Loss
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPerfMode('safe');
                    setPerfPercent('0.00');
                    setPerfNotes('We are safe today, no investment / trading today (Capital Preserved).');
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold border transition cursor-pointer ${
                    perfMode === 'safe'
                      ? 'bg-slate-700 text-white border-slate-700 shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  0.00% Safe Day
                </button>
              </div>
            </div>

            {/* Live Overall Fund & Distribution Banner */}
            {(() => {
              const liveConfirmedDeposits = deposits.filter(d => d.status === 'confirmed');
              const totalConfirmedDeposits = liveConfirmedDeposits.reduce((acc, d) => acc + (d.amount || 0), 0);
              const paidWithdrawals = withdrawals.filter(w => w.status === 'paid');
              const totalPaidWithdrawals = paidWithdrawals.reduce((acc, w) => acc + (w.requestedAmount || 0), 0);
              const liveFundPrincipal = Math.max(0, totalConfirmedDeposits - totalPaidWithdrawals);
              const currentPercentNum = parseFloat(perfPercent || '0') || 0;
              const multiplier = perfMode === 'safe' ? 0 : perfMode === 'loss' ? -currentPercentNum / 100 : currentPercentNum / 100;
              const estDistribution = liveFundPrincipal * multiplier;

              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0">
                      <Database className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider block">
                        Live Fund Pool
                      </span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                        ${liveFundPrincipal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2.5 border-t sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-800 pt-2 sm:pt-0 sm:pl-3">
                    <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950/60 flex items-center justify-center text-purple-600 dark:text-purple-400 flex-shrink-0">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider block">
                        Active Confirmed Deposits
                      </span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                        {liveConfirmedDeposits.length} deposits active
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2.5 border-t sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-800 pt-2 sm:pt-0 sm:pl-3">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        perfMode === 'profit'
                          ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                          : perfMode === 'loss'
                          ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Activity className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider block">
                        Est. Distribution Total
                      </span>
                      <span
                        className={`text-sm font-bold font-mono ${
                          perfMode === 'profit'
                            ? 'text-blue-600 dark:text-blue-400'
                            : perfMode === 'loss'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {perfMode === 'safe'
                          ? '$0.00 USDT (Capital Preserved)'
                          : `${estDistribution >= 0 ? '+' : '-'}$${Math.abs(estDistribution).toFixed(2)} USDT`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Date already distributed notice */}
            {(() => {
              const existingPerf = performances.find(p => p.date === perfDate);
              if (existingPerf) {
                const isExistingPositive = Number(existingPerf.actualFundPerformance ?? existingPerf.ratePercentage ?? 0) > 0;
                const isExistingNegative = Number(existingPerf.actualFundPerformance ?? existingPerf.ratePercentage ?? 0) < 0;
                return (
                  <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 text-xs text-amber-800 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <div>
                        <span className="font-bold">Yield for {perfDate} is already calculated & recorded</span>
                        <span className="ml-1 text-amber-700 dark:text-amber-300 font-mono">
                          ({isExistingPositive ? '+' : ''}{Number(existingPerf.actualFundPerformance ?? existingPerf.ratePercentage ?? 0).toFixed(2)}% | {existingPerf.appliedCount || 0} accounts credited | ${Number(existingPerf.totalDistributed || 0).toFixed(2)} USDT)
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

            <form onSubmit={handleApplyPerformance} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                {/* 1. Date */}
                <div className="sm:col-span-3">
                  <label className="block text-slate-500 dark:text-slate-400 text-[11px] mb-1 font-medium">
                    Performance Date
                  </label>
                  <input
                    type="date"
                    value={perfDate}
                    onChange={e => {
                      setPerfDate(e.target.value);
                      setAllowOverwritePerf(false);
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-semibold text-xs"
                  />
                </div>

                {/* 2. Type Selector (Profit / Loss / Safe) */}
                <div className="sm:col-span-4">
                  <label className="block text-slate-500 dark:text-slate-400 text-[11px] mb-1 font-medium">
                    Yield Result Type
                  </label>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setPerfMode('profit');
                        if (perfPercent === '0.00' || perfPercent === '0') setPerfPercent('0.50');
                        setPerfNotes('Profitable trading day (+0.50%).');
                      }}
                      className={`py-1.5 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1 cursor-pointer ${
                        perfMode === 'profit'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <span>+ Profit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPerfMode('loss');
                        if (perfPercent === '0.00' || perfPercent === '0') setPerfPercent('0.50');
                        setPerfNotes('Market adjustment / draw-down (-0.50%).');
                      }}
                      className={`py-1.5 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1 cursor-pointer ${
                        perfMode === 'loss'
                          ? 'bg-rose-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <span>- Loss</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPerfMode('safe');
                        setPerfPercent('0.00');
                        setPerfNotes('We are safe today, no investment / trading today (Capital Preserved).');
                      }}
                      className={`py-1.5 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1 cursor-pointer ${
                        perfMode === 'safe'
                          ? 'bg-slate-700 dark:bg-slate-800 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <span>0.00% Safe</span>
                    </button>
                  </div>
                </div>

                {/* 3. Percentage Input */}
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-500 dark:text-slate-400 text-[11px] font-medium">
                      Rate (%)
                    </label>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                      {perfMode === 'safe'
                        ? 'x0.0000'
                        : perfMode === 'loss'
                        ? `-x${((parseFloat(perfPercent || '0') || 0) / 100).toFixed(4)}`
                        : `+x${((parseFloat(perfPercent || '0') || 0) / 100).toFixed(4)}`}
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      disabled={perfMode === 'safe'}
                      value={perfMode === 'safe' ? '0.00' : perfPercent}
                      onChange={e => {
                        // Clean input, allow numbers and decimal point
                        const val = e.target.value.replace(/[^0-9.]/g, '');
                        setPerfPercent(val);
                      }}
                      placeholder="0.50"
                      className={`w-full py-2 pl-3 pr-7 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono font-bold text-xs ${
                        perfMode === 'profit'
                          ? 'text-blue-600 dark:text-blue-400'
                          : perfMode === 'loss'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-400 dark:text-slate-600 bg-slate-100 dark:bg-slate-900 cursor-not-allowed'
                      }`}
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold pointer-events-none">
                      %
                    </span>
                  </div>
                </div>

                {/* 4. Notes */}
                <div className="sm:col-span-3">
                  <label className="block text-slate-500 dark:text-slate-400 text-[11px] mb-1 font-medium">
                    Ledger Memo / Note
                  </label>
                  <input
                    type="text"
                    value={perfNotes}
                    onChange={e => setPerfNotes(e.target.value)}
                    placeholder="Note for audit log and user statement"
                    className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs"
                  />
                </div>
              </div>

              {/* Submit Row */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center space-x-2">
                  <span className="font-semibold">Selected Output:</span>
                  <span
                    className={`font-bold font-mono px-2 py-0.5 rounded text-[11px] ${
                      perfMode === 'profit'
                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                        : perfMode === 'loss'
                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {perfMode === 'safe'
                      ? '0.00% Safe (Capital Preserved)'
                      : perfMode === 'loss'
                      ? `-${(parseFloat(perfPercent || '0') || 0).toFixed(2)}% Loss`
                      : `+${(parseFloat(perfPercent || '0') || 0).toFixed(2)}% Profit`}
                  </span>
                </div>

                {(() => {
                  const existingPerf = performances.find(p => p.date === perfDate);
                  const isBlocked = existingPerf && !allowOverwritePerf;
                  const currentPercentNum = parseFloat(perfPercent || '0') || 0;

                  return (
                    <button
                      type="submit"
                      disabled={isDistributing || Boolean(isBlocked)}
                      title={isBlocked ? `Date ${perfDate} has already been calculated. Enable Overwrite to recalculate.` : ''}
                      className={`w-full sm:w-auto px-6 py-2.5 rounded-xl disabled:opacity-50 font-bold transition flex items-center justify-center space-x-2 cursor-pointer text-xs ${
                        isBlocked
                          ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                          : allowOverwritePerf && existingPerf
                          ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-500/20'
                          : perfMode === 'profit'
                          ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20'
                          : perfMode === 'loss'
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
                          ? `Already Posted (${(Number(existingPerf.applicableRate || 0) * 100).toFixed(2)}%)`
                          : allowOverwritePerf && existingPerf
                          ? `Recalculate & Update (${perfMode === 'loss' ? '-' : perfMode === 'profit' ? '+' : ''}${currentPercentNum.toFixed(2)}%)`
                          : perfMode === 'profit'
                          ? `Post +${currentPercentNum.toFixed(2)}% Profit`
                          : perfMode === 'loss'
                          ? `Post -${currentPercentNum.toFixed(2)}% Loss`
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

      {/* TAB: FINEXJ ACCOUNTING */}
      {activeTab === 'accounting' && <AdminAccountingView />}

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
                          ${Number(dep.amount || 0).toFixed(2)} USDT
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
                            title: `Deposit Proof - $${Number(dep.amount || 0).toFixed(2)} USDT (${dep.reference || dep.id})`
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
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={Boolean(isProcessingDepositAction)}
                            onClick={() => handleAdminVerifyDeposit(dep.id)}
                            className="py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-800 dark:text-slate-200 font-bold transition cursor-pointer flex items-center space-x-1 border border-slate-200 dark:border-slate-700"
                            title="Query live BNB Smart Chain RPC node for this deposit tx"
                          >
                            {isProcessingDepositAction === dep.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            )}
                            <span>Verify on BSC</span>
                          </button>
                          <button
                            disabled={Boolean(isProcessingDepositAction)}
                            onClick={() => setSelectedDepositForAction({ deposit: dep, action: 'confirmed' })}
                            className="py-2 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold transition shadow-sm cursor-pointer flex items-center space-x-1"
                          >
                            {isProcessingDepositAction === dep.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>Approve & Credit</span>
                          </button>
                          <button
                            disabled={Boolean(isProcessingDepositAction)}
                            onClick={() => setSelectedDepositForAction({ deposit: dep, action: 'rejected' })}
                            className="py-2 px-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 disabled:opacity-50 disabled:cursor-not-allowed text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 font-bold transition cursor-pointer flex items-center space-x-1"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      ) : (
                        <div className="text-right space-y-0.5">
                          <span className="text-[11px] font-bold block text-blue-600 dark:text-blue-400">
                            {dep.status === 'confirmed' ? '✓ Credited to Balance' : '✕ Rejected'}
                          </span>
                          {dep.blockNumber && (
                            <span className="text-[10px] text-slate-400 block font-mono">
                              Block #{dep.blockNumber}
                            </span>
                          )}
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
                      ${Number(u.balance?.availableBalance || 0).toFixed(2)} USDT
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      Deposited: ${Number(u.balance?.totalDeposited || 0).toFixed(2)}
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
                        ${Number(wd.requestedAmount || 0).toFixed(2)} USDT
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
                        {String(wd.status || 'pending').toUpperCase()}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Net: ${Number(wd.netAmount || 0).toFixed(2)} ({wd.feePercentage ?? appSettings?.withdrawalFeePercentage ?? 6}% Fee: ${Number(wd.feeAmount || 0).toFixed(2)})
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
                        disabled={Boolean(isProcessingWithdrawalAction)}
                        onClick={() => {
                          setSelectedWithdrawal(wd);
                          setPayoutTxHash('');
                          setAdminNote('');
                        }}
                        className="py-1.5 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold transition shadow-sm cursor-pointer"
                      >
                        Pay / Complete
                      </button>
                      <button
                        disabled={Boolean(isProcessingWithdrawalAction)}
                        onClick={() => handleWithdrawalAction(wd.id, 'rejected')}
                        className="py-1.5 px-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/60 font-bold transition cursor-pointer flex items-center space-x-1"
                      >
                        {isProcessingWithdrawalAction === wd.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : null}
                        <span>Reject & Refund</span>
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
              <p>Net Payout Amount: <strong className="text-blue-600 dark:text-blue-400 font-bold">${Number(selectedWithdrawal.netAmount || 0).toFixed(2)} USDT</strong></p>
              <p className="font-mono text-[10px] break-all text-slate-500 dark:text-slate-400">Destination: {selectedWithdrawal.destinationAddress}</p>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 mb-1 text-xs font-semibold">
                BNB Smart Chain Payout Tx Hash <span className="text-rose-500 font-bold">*Required</span>
              </label>
              <input
                type="text"
                required
                value={payoutTxHash}
                onChange={e => setPayoutTxHash(e.target.value)}
                placeholder="0x... (TxID from BSC on-chain transfer)"
                className="w-full py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:border-blue-600"
              />
              {!payoutTxHash.trim() && (
                <p className="text-[11px] text-rose-500 mt-1">Transaction hash is required for user confirmation & blockchain verification.</p>
              )}
            </div>

            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1 text-xs font-medium">Admin Internal Note (Optional)</label>
              <input
                type="text"
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                placeholder="e.g. Paid via corporate Binance / BSC wallet"
                className="w-full py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs"
              />
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                disabled={Boolean(isProcessingWithdrawalAction) || !payoutTxHash.trim()}
                onClick={() => handleWithdrawalAction(selectedWithdrawal.id, 'paid', payoutTxHash)}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs transition cursor-pointer shadow-md shadow-blue-500/20 flex items-center justify-center space-x-1.5"
              >
                {isProcessingWithdrawalAction === selectedWithdrawal.id ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing Payout...</span>
                  </>
                ) : (
                  <span>Mark as Paid & Notify User</span>
                )}
              </button>
              <button
                disabled={Boolean(isProcessingWithdrawalAction)}
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
                  ${Number(selectedDepositForAction.deposit.amount || 0).toFixed(2)} USDT
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
              {selectedDepositForAction.deposit.proofPhotoUrl && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400 block mb-1">Attached Payment Receipt:</span>
                  <button
                    type="button"
                    onClick={() => setPreviewPhotoModal({
                      url: selectedDepositForAction.deposit.proofPhotoUrl,
                      title: `Deposit Proof - $${Number(selectedDepositForAction.deposit.amount || 0).toFixed(2)} USDT`
                    })}
                    className="w-full flex items-center space-x-2 p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 font-semibold transition cursor-pointer"
                  >
                    <img
                      src={selectedDepositForAction.deposit.proofPhotoUrl}
                      alt="Receipt"
                      className="w-10 h-10 rounded-lg object-cover border border-blue-200 dark:border-blue-700"
                    />
                    <div className="text-left text-xs">
                      <span className="block font-bold">Inspect Full Receipt Screenshot</span>
                      <span className="text-[10px] text-blue-600 dark:text-blue-400 flex items-center space-x-0.5">
                        <Eye className="w-3 h-3" />
                        <span>Click to Zoom</span>
                      </span>
                    </div>
                  </button>
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
                disabled={Boolean(isProcessingDepositAction)}
                onClick={() => handleDepositAction(
                  selectedDepositForAction.deposit.id,
                  selectedDepositForAction.action,
                  depositAdminNotes
                )}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs text-white transition cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-1.5 ${
                  selectedDepositForAction.action === 'confirmed'
                    ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
                    : 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20'
                }`}
              >
                {isProcessingDepositAction === selectedDepositForAction.deposit.id ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>
                    {selectedDepositForAction.action === 'confirmed'
                      ? 'Confirm & Credit Balance'
                      : 'Confirm Rejection'}
                  </span>
                )}
              </button>
              <button
                disabled={Boolean(isProcessingDepositAction)}
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
                className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-900 dark:text-white">{p.date}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        Number(p.applicableRate || 0) > 0
                          ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60'
                          : Number(p.applicableRate || 0) < 0
                          ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {Number(p.applicableRate || 0) > 0
                        ? `+${(Number(p.applicableRate || 0) * 100).toFixed(2)}% Profit`
                        : Number(p.applicableRate || 0) < 0
                        ? `${(Number(p.applicableRate || 0) * 100).toFixed(2)}% Loss`
                        : '0.00% Safe (No Trade)'}
                    </span>
                    {Number(p.overallFundAmount || 0) > 0 && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                        Pool: ${Number(p.overallFundAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{p.notes}</p>
                </div>

                <div className="flex items-center space-x-3 self-end sm:self-center">
                  <div className="text-right">
                    <p
                      className={`text-sm font-bold font-mono ${
                        Number(p.totalDistributed || 0) > 0
                          ? 'text-blue-600 dark:text-blue-400'
                          : Number(p.totalDistributed || 0) < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {Number(p.totalDistributed || 0) > 0
                        ? `+$${Number(p.totalDistributed || 0).toFixed(2)} USDT`
                        : Number(p.totalDistributed || 0) < 0
                        ? `-$${Math.abs(Number(p.totalDistributed || 0)).toFixed(2)} USDT`
                        : '$0.00 USDT (Safe)'}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">{p.appliedCount || 0} Accounts Credited</p>
                  </div>
                  <button
                    onClick={() => {
                      setPerfDate(p.date);
                      const rate = Number(p.applicableRate ?? (Number(p.actualFundPerformance ?? p.ratePercentage ?? 0) / 100) ?? 0);
                      if (rate > 0) {
                        setPerfMode('profit');
                        setPerfPercent((rate * 100).toFixed(2));
                      } else if (rate < 0) {
                        setPerfMode('loss');
                        setPerfPercent(Math.abs(rate * 100).toFixed(2));
                      } else {
                        setPerfMode('safe');
                        setPerfPercent('0.00');
                      }
                      setPerfNotes(p.notes || '');
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
                    {u.fullName} ({u.email}) - Current: ${Number(u.balance?.availableBalance || 0).toFixed(2)}
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
