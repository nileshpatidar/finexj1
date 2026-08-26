import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  ShieldAlert,
  Users,
  ArrowDownToLine,
  ArrowUpFromLine,
  TrendingUp,
  Settings,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Search,
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
} from 'lucide-react';

interface AdminDashboardProps {
  onBackToUser: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBackToUser }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'withdrawals' | 'performance' | 'adjustments' | 'settings' | 'audit' | 'database'>('overview');
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [performances, setPerformances] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [appSettings, setAppSettings] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

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
      const [dash, uList, wList, pList, aList, sList] = await Promise.all([
        api.getAdminDashboard(),
        api.getAdminUsers(),
        api.getAdminWithdrawals(),
        api.getAdminPerformance(),
        api.getAdminAuditLogs(),
        api.getSettings(),
      ]);
      setDashboardData(dash);
      setUsers(uList.users || []);
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
      });

      if (res.success) {
        setActionMessage(`Successfully distributed ${(parseFloat(perfRate) * 100).toFixed(2)}% yield across ${res.affectedUsersCount} eligible user accounts! Total: $${res.totalDistributed.toFixed(2)} USDT.`);
        await loadAllAdminData();
      }
    } catch (err) {
      setActionError((err as Error).message || 'Failed to distribute daily performance.');
    } finally {
      setIsDistributing(false);
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

  const handleResetData = async () => {
    if (window.confirm('Reset all demo data back to initial seeds? This will restore demo accounts and verified deposits.')) {
      await api.resetDatabase();
      await loadAllAdminData();
      alert('Database reset to demo seed.');
    }
  };

  const stats = dashboardData?.stats;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-24 text-xs">
      {/* Admin Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-3xl bg-slate-900 border border-amber-500/30">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold text-slate-100">FINEXJ Master Admin Console</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                {user?.role.toUpperCase()}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">FINEXJ Institutional Governance & Ledger Management</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={loadAllAdminData}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Refresh All Records"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetData}
            className="py-1.5 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-semibold transition"
          >
            Reset Demo DB
          </button>
          <button
            onClick={onBackToUser}
            className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition"
          >
            Exit to User View
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex overflow-x-auto no-scrollbar gap-1.5 p-1.5 rounded-2xl bg-slate-900/60 border border-slate-800">
        {[
          { id: 'overview', label: 'Overview', icon: TrendingUp },
          { id: 'users', label: 'Users', icon: Users },
          { id: 'withdrawals', label: 'Withdrawals', icon: ArrowUpFromLine },
          { id: 'performance', label: 'Daily Performance', icon: Sliders },
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
              className={`flex items-center space-x-1.5 py-2 px-3.5 rounded-xl font-semibold whitespace-nowrap transition ${
                isActive
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.id === 'withdrawals' && stats?.pendingWithdrawalsCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {stats.pendingWithdrawalsCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Action Messages */}
      {actionMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
          <span>{actionMessage}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 flex items-center space-x-2">
          <XCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
          <span>{actionError}</span>
        </div>
      )}

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400">Total Confirmed Deposits</span>
              <p className="text-xl font-bold text-slate-100">
                ${(stats?.totalConfirmedDeposits || 0).toLocaleString()} USDT
              </p>
              <span className="text-[10px] text-emerald-400">BEP-20 Verified</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400">Total Earnings Distributed</span>
              <p className="text-xl font-bold text-teal-400">
                +${(stats?.totalEarningsAllocated || 0).toFixed(2)} USDT
              </p>
              <span className="text-[10px] text-slate-500">Fund Yield Allocations</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400">Pending Withdrawals</span>
              <p className="text-xl font-bold text-amber-400">
                {stats?.pendingWithdrawalsCount || 0} (${(stats?.totalPendingWithdrawalsAmount || 0).toFixed(2)})
              </p>
              <span className="text-[10px] text-amber-400/80">Requires Approval</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400">Withdrawal Fees (4%)</span>
              <p className="text-xl font-bold text-purple-400">
                ${(stats?.totalWithdrawalFees || 0).toFixed(2)} USDT
              </p>
              <span className="text-[10px] text-slate-500">Platform Retained</span>
            </div>
          </div>

          {/* Quick Daily Allocation Card */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                <span>Daily Performance Distribution (Profit, Loss, or Safe Day)</span>
              </h2>
              <div className="flex items-center space-x-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setPerfRate('0.01');
                    setPerfNotes('Profitable trading day (+1.00%).');
                  }}
                  className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/20 transition"
                >
                  +1.00% Profit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPerfRate('-0.005');
                    setPerfNotes('Market adjustment / draw-down (-0.50%).');
                  }}
                  className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold border border-rose-500/20 transition"
                >
                  -0.50% Loss
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPerfRate('0');
                    setPerfNotes('We are safe today, no investment / trading today (Capital Preserved).');
                  }}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold border border-slate-700 transition"
                >
                  0.00% Safe Day
                </button>
              </div>
            </div>

            <form onSubmit={handleApplyPerformance} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Performance Date</label>
                <input
                  type="date"
                  value={perfDate}
                  onChange={e => setPerfDate(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">
                  Applicable Rate (e.g. 0.01 = +1%, -0.005 = -0.5%, 0 = 0%)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={perfRate}
                  onChange={e => setPerfRate(e.target.value)}
                  className={`w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 font-bold ${
                    parseFloat(perfRate) > 0
                      ? 'text-emerald-400'
                      : parseFloat(perfRate) < 0
                      ? 'text-rose-400'
                      : 'text-slate-300'
                  }`}
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Custom Note / Condition</label>
                <input
                  type="text"
                  value={perfNotes}
                  onChange={e => setPerfNotes(e.target.value)}
                  placeholder="e.g. We are safe today, no investment today"
                  className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={isDistributing}
                  className={`w-full py-2.5 px-4 rounded-xl disabled:opacity-50 font-bold transition flex items-center justify-center space-x-2 ${
                    parseFloat(perfRate) > 0
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20'
                      : parseFloat(perfRate) < 0
                      ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-md shadow-rose-500/20'
                      : 'bg-slate-700 hover:bg-slate-600 text-slate-100'
                  }`}
                >
                  {isDistributing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>
                    {parseFloat(perfRate) > 0
                      ? `Post +${(parseFloat(perfRate) * 100).toFixed(2)}% Profit`
                      : parseFloat(perfRate) < 0
                      ? `Post ${(parseFloat(perfRate) * 100).toFixed(2)}% Loss`
                      : 'Post Safe Day (0.00%)'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: USERS */}
      {activeTab === 'users' && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
            Registered Users & Accounts ({users.length})
          </h2>
          <div className="space-y-2">
            {users.map(u => (
              <div
                key={u.id}
                className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center space-x-3">
                  <img
                    src={u.profilePictureUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.fullName}`}
                    alt="avatar"
                    className="w-10 h-10 rounded-xl object-cover border border-slate-700"
                  />
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-100 text-sm">{u.fullName}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
                        {u.role}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          u.status === 'active'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {u.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">{u.email} • {u.country}</p>
                    <p className="text-[10px] text-slate-500">
                      Created: {new Date(u.createdAt).toLocaleDateString()} ({u.balance?.accountAgeDays || 0}d age)
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-100">
                      ${u.balance?.availableBalance?.toFixed(2)} USDT
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Deposited: ${u.balance?.totalDeposited?.toFixed(2)}
                    </p>
                  </div>

                  <button
                    onClick={() => handleToggleUserStatus(u.id, u.status)}
                    className={`py-1 px-3 rounded-lg font-bold transition text-[11px] ${
                      u.status === 'active'
                        ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30'
                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
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
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
            Withdrawal Management & Payouts ({withdrawals.length})
          </h2>

          {withdrawals.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-slate-900 border border-slate-800 text-slate-400">
              No withdrawal requests.
            </div>
          ) : (
            <div className="space-y-2">
              {withdrawals.map(wd => (
                <div
                  key={wd.id}
                  className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-100 text-sm">
                        ${wd.requestedAmount.toFixed(2)} USDT
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          wd.status === 'paid'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : wd.status === 'rejected'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {wd.status.toUpperCase()}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Net: ${wd.netAmount.toFixed(2)} (4% Fee: ${wd.feeAmount.toFixed(2)})
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-300 font-mono break-all">
                      To: {wd.destinationAddress}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      User: {wd.userId} • Ref: {wd.reference} • {new Date(wd.createdAt).toLocaleString()}
                    </p>
                  </div>

                  {wd.status === 'pending' || wd.status === 'under_review' ? (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setSelectedWithdrawal(wd)}
                        className="py-1.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition"
                      >
                        Pay / Complete
                      </button>
                      <button
                        onClick={() => handleWithdrawalAction(wd.id, 'rejected')}
                        className="py-1.5 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-bold transition"
                      >
                        Reject & Refund
                      </button>
                    </div>
                  ) : (
                    <div className="text-right">
                      {wd.txHash && (
                        <p className="text-[10px] text-emerald-400 font-mono">Tx: {wd.txHash.substring(0, 10)}...</p>
                      )}
                      <p className="text-[10px] text-slate-500">{wd.status === 'paid' ? 'Paid on Chain' : 'Resolved'}</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-slate-100 uppercase">
              Complete BEP-20 Payout ({selectedWithdrawal.reference})
            </h3>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 space-y-1">
              <p>Net Payout Amount: <strong className="text-emerald-400">${selectedWithdrawal.netAmount.toFixed(2)} USDT</strong></p>
              <p className="font-mono text-[10px] break-all">Destination: {selectedWithdrawal.destinationAddress}</p>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">BNB Smart Chain Payout Tx Hash</label>
              <input
                type="text"
                value={payoutTxHash}
                onChange={e => setPayoutTxHash(e.target.value)}
                placeholder="0x..."
                className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Admin Internal Note (Optional)</label>
              <input
                type="text"
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                placeholder="Payout verified on BSC wallet"
                className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
              />
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                onClick={() => handleWithdrawalAction(selectedWithdrawal.id, 'paid', payoutTxHash || undefined)}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
              >
                Mark as Paid & Notify User
              </button>
              <button
                onClick={() => setSelectedWithdrawal(null)}
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
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
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
            Daily Performance Records ({performances.length})
          </h2>
          <div className="space-y-2">
            {performances.map(p => (
              <div
                key={p.id}
                className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-100">{p.date}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        p.applicableRate > 0
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : p.applicableRate < 0
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {p.applicableRate > 0
                        ? `+${(p.applicableRate * 100).toFixed(2)}% Profit`
                        : p.applicableRate < 0
                        ? `${(p.applicableRate * 100).toFixed(2)}% Loss`
                        : '0.00% Safe (No Trade)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">{p.notes}</p>
                </div>

                <div className="text-right">
                  <p
                    className={`text-sm font-bold ${
                      p.totalDistributed > 0
                        ? 'text-emerald-400'
                        : p.totalDistributed < 0
                        ? 'text-rose-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {p.totalDistributed > 0
                      ? `+$${p.totalDistributed.toFixed(2)} USDT`
                      : p.totalDistributed < 0
                      ? `-$${Math.abs(p.totalDistributed).toFixed(2)} USDT`
                      : '$0.00 USDT (Safe)'}
                  </p>
                  <p className="text-[10px] text-slate-500">{p.appliedCount} Users Calculated</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
            System Audit Trail ({auditLogs.length})
          </h2>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {auditLogs.map(log => (
              <div key={log.id} className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-400">{log.action}</span>
                  <span className="text-[10px] text-slate-500">{new Date(log.timestamp).toLocaleString()}</span>
                </div>
                <p className="text-slate-300">{log.reason || 'Action logged'}</p>
                <p className="text-[10px] text-slate-500">
                  Actor: {log.actorEmail} ({log.actorRole}) {log.targetUserId ? `• Target: ${log.targetUserId}` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: ADJUSTMENTS */}
      {activeTab === 'adjustments' && (
        <div className="space-y-4 p-6 rounded-3xl bg-slate-900 border border-slate-800">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
            Auditable Balance Adjustment (Super Admin Only)
          </h2>
          <form onSubmit={handleCreateAdjustment} className="space-y-3 max-w-md">
            <div>
              <label className="block text-slate-400 mb-1">Target User ID / Email</label>
              <select
                value={adjustUserId}
                onChange={e => setAdjustUserId(e.target.value)}
                className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
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
              <label className="block text-slate-400 mb-1">Amount (+ to credit, - to debit)</label>
              <input
                type="number"
                step="any"
                value={adjustAmount}
                onChange={e => setAdjustAmount(e.target.value)}
                placeholder="+50 or -50"
                className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-bold"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Mandatory Reason for Audit Log</label>
              <input
                type="text"
                value={adjustReason}
                onChange={e => setAdjustReason(e.target.value)}
                placeholder="Institutional correction / OTC topup"
                className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
            >
              Apply Adjustment with Audit Log
            </button>
          </form>
        </div>
      )}

      {/* TAB 7: DATABASE & SUPABASE MIGRATION */}
      {activeTab === 'database' && (
        <div className="space-y-6 p-6 rounded-3xl bg-slate-900 border border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center space-x-2">
                <Database className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base font-bold text-slate-100">
                  Supabase & PostgreSQL Database Manager
                </h2>
              </div>
              <p className="text-slate-400 text-[11px] mt-0.5">
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
                className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold border border-slate-700 transition"
              >
                {copiedSql ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
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
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition disabled:opacity-50"
              >
                {isTestingDb ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                <span>Test Connection & Migrate</span>
              </button>
            </div>
          </div>

          {dbMessage && (
            <div className={`p-4 rounded-2xl border text-xs font-semibold flex items-center space-x-2 ${
              dbStatus?.postgresPoolReady
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
            }`}>
              {dbStatus?.postgresPoolReady ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
              <span>{dbMessage}</span>
            </div>
          )}

          {/* Diagnostic Status Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Connection Method</span>
              <span className="text-sm font-bold text-slate-200">
                {dbStatus?.connectionType || 'Checking...'}
              </span>
              <p className="text-[10px] text-slate-500">
                {dbStatus?.connectionType === 'DATABASE_URL' ? 'Direct Pooler URI' : dbStatus?.connectionType === 'HOST_PARAMS' ? 'Direct Host Params' : 'Environment credentials'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">PostgreSQL Pool & Schema</span>
              <div className="flex items-center space-x-1.5">
                <span className={`w-2 h-2 rounded-full ${dbStatus?.postgresPoolReady ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span className="text-sm font-bold text-slate-200">
                  {dbStatus?.postgresPoolReady ? 'Ready & Active' : 'Awaiting Config'}
                </span>
              </div>
              <p className="text-[10px] text-slate-500">
                {dbStatus?.tablesFound?.length ? `${dbStatus.tablesFound.length} tables verified` : 'Ready to create tables'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">@supabase/server Client</span>
              <div className="flex items-center space-x-1.5">
                <span className={`w-2 h-2 rounded-full ${dbStatus?.supabaseJsReady ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                <span className="text-sm font-bold text-slate-200">
                  {dbStatus?.supabaseJsReady ? 'Connected' : 'Ready'}
                </span>
              </div>
              <p className="text-[10px] text-slate-500">
                {dbStatus?.latencyMs ? `${dbStatus.latencyMs} ms latency` : 'Supabase JS SDK'}
              </p>
            </div>
          </div>

          {/* Database Tables Overview */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
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
                        ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-xs">{table.name}</span>
                      {isCreated ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-slate-600" />
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">{table.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Manual Run Instructions */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-[11px] text-slate-400 leading-relaxed">
            <div className="flex items-center space-x-2 text-slate-200 font-bold">
              <Terminal className="w-4 h-4 text-teal-400" />
              <span>How to Apply Schema in Supabase</span>
            </div>
            <p>
              <strong>Method 1 (Automatic via App):</strong> Once you save your <code className="text-emerald-400">DATABASE_URL</code> or <code className="text-emerald-400">SUPABASE_URL</code> in your environment, click the <strong>Test Connection & Migrate</strong> button above. The server will run the SQL schema file automatically.
            </p>
            <p>
              <strong>Method 2 (Supabase Web Dashboard):</strong> Click <strong>Copy Schema SQL</strong>, open your <strong>Supabase Dashboard → SQL Editor</strong>, paste the script, and click <strong>Run</strong>. All tables, relationships, and indexes will be created instantly.
            </p>
          </div>
        </div>
      )}

      {/* TAB 8: SETTINGS */}
      {activeTab === 'settings' && (
        <div className="space-y-4 p-6 rounded-3xl bg-slate-900 border border-slate-800">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
            System & Wallet Configuration
          </h2>
          <div className="space-y-3 text-slate-300">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500">BEP-20 Deposit Address</span>
              <p className="font-mono text-emerald-400">{appSettings?.bep20DepositAddress}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500">USDT Token Contract (BSC)</span>
              <p className="font-mono text-slate-400">{appSettings?.usdtContractAddress}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
              <div>
                <span className="text-[10px] text-slate-500">Withdrawal Fee</span>
                <p className="font-bold text-slate-100">{appSettings?.withdrawalFeePercentage}% (Fixed)</p>
              </div>
              <div>
                <span className="text-[10px] text-slate-500">Account Age Policy</span>
                <p className="font-bold text-slate-100">{appSettings?.accountAgeRequirementDays} Full Days</p>
              </div>
              <div>
                <span className="text-[10px] text-slate-500">Deposit Lock Period</span>
                <p className="font-bold text-slate-100">{appSettings?.depositLockPeriodDays} Days</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
