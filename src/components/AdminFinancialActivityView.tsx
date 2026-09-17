import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  DollarSign,
  Filter,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Database,
  Lock,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
} from 'lucide-react';

interface FinancialActivityItem {
  id: string;
  action: string;
  actorId: string;
  actorEmail: string;
  actorRole: string;
  targetUserId?: string;
  timestamp: string;
  reason?: string;
  beforeValue?: any;
  afterValue?: any;
  referenceId?: string;
  category?: string;
}

interface AdminFinancialActivityViewProps {
  userRole?: string;
}

export const AdminFinancialActivityView: React.FC<AdminFinancialActivityViewProps> = ({ userRole }) => {
  const [events, setEvents] = useState<FinancialActivityItem[]>([]);
  const [allAuditLogs, setAllAuditLogs] = useState<FinancialActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState<'financial' | 'all'>('financial');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'deposits' | 'withdrawals' | 'performance' | 'adjustments'>('all');

  // Database Cleanup State
  const [isInspectingCleanup, setIsInspectingCleanup] = useState(false);
  const [isExecutingCleanup, setIsExecutingCleanup] = useState(false);
  const [cleanupReport, setCleanupReport] = useState<any | null>(null);
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [cleanupSuccessMessage, setCleanupSuccessMessage] = useState<string | null>(null);

  const loadActivity = async () => {
    setIsLoading(true);
    try {
      const [finRes, allRes] = await Promise.all([
        api.getCleanFinancialActivity(),
        api.getAdminAuditLogs(),
      ]);

      setEvents(finRes.events || []);
      setAllAuditLogs(allRes.auditLogs || []);
    } catch (err) {
      console.warn('Failed to load financial activity:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadActivity();
  }, []);

  const handleInspectCleanup = async () => {
    setIsInspectingCleanup(true);
    setCleanupSuccessMessage(null);
    try {
      const res = await api.runDatabaseCleanup(true);
      if (res.success && res.report) {
        setCleanupReport(res.report);
        setShowCleanupModal(true);
      }
    } catch (err: any) {
      alert(`Cleanup inspection failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsInspectingCleanup(false);
    }
  };

  const handleExecuteCleanup = async () => {
    setIsExecutingCleanup(true);
    try {
      const res = await api.runDatabaseCleanup(false);
      if (res.success && res.report) {
        setCleanupReport(res.report);
        setCleanupSuccessMessage('Deterministic database cleanup completed successfully. All valid deposits and legitimate accounts remain untouched.');
        await loadActivity();
      } else {
        alert('Database cleanup failed to execute.');
      }
    } catch (err: any) {
      alert(`Cleanup execution failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsExecutingCleanup(false);
    }
  };

  // Filter items
  const rawList = mode === 'financial' ? events : allAuditLogs;
  const filteredList = rawList.filter(item => {
    if (categoryFilter === 'all') return true;
    if (categoryFilter === 'deposits') return item.action.includes('DEPOSIT');
    if (categoryFilter === 'withdrawals') return item.action.includes('WITHDRAWAL');
    if (categoryFilter === 'performance') return item.action.includes('PERFORMANCE') || item.action.includes('EARNINGS');
    if (categoryFilter === 'adjustments') return item.action.includes('ADJUSTMENT');
    return true;
  });

  const getActionBadge = (action: string) => {
    if (action.includes('DEPOSIT_APPROVED') || action.includes('DEPOSIT_CONFIRMED')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <ArrowDownToLine className="w-3 h-3" />
          Deposit Approved
        </span>
      );
    }
    if (action.includes('DEPOSIT_REJECTED')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
          <XCircle className="w-3 h-3" />
          Deposit Rejected
        </span>
      );
    }
    if (action.includes('WITHDRAWAL_PAID') || action.includes('WITHDRAWAL_APPROVED')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <ArrowUpFromLine className="w-3 h-3" />
          Withdrawal Paid
        </span>
      );
    }
    if (action.includes('WITHDRAWAL_REJECTED')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
          <XCircle className="w-3 h-3" />
          Withdrawal Rejected
        </span>
      );
    }
    if (action.includes('WITHDRAWAL_REQUESTED') || action.includes('WITHDRAWAL_PROCESSING')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
          <Clock className="w-3 h-3" />
          Withdrawal Pending
        </span>
      );
    }
    if (action.includes('PERFORMANCE') || action.includes('EARNINGS')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
          <TrendingUp className="w-3 h-3" />
          Daily Performance
        </span>
      );
    }
    if (action.includes('ADJUSTMENT')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          <DollarSign className="w-3 h-3" />
          Balance Adjustment
        </span>
      );
    }
    if (action.includes('DATABASE_CLEANUP')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
          <Database className="w-3 h-3" />
          Database Cleanup
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
        <ShieldCheck className="w-3 h-3" />
        {action}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls Bar */}
      <div className="p-5 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {mode === 'financial' ? 'Clean Financial Activity Feed' : 'All System Audit Logs'}
              </h2>
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60">
                {filteredList.length} events
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Authoritative financial event trail filtered to deposits, withdrawals, earnings, and balance adjustments.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadActivity}
              disabled={isLoading}
              className="p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Refresh Activity"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            {userRole === 'super_admin' && (
              <button
                onClick={handleInspectCleanup}
                disabled={isInspectingCleanup || isExecutingCleanup}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                <Database className="w-3.5 h-3.5 text-blue-500" />
                <span>Database Cleanup</span>
              </button>
            )}

            {/* Mode Switcher */}
            <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setMode('financial')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  mode === 'financial'
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Financial Only
              </button>
              <button
                onClick={() => setMode('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  mode === 'all'
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                All Logs
              </button>
            </div>
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <span className="text-xs font-medium text-slate-400 dark:text-slate-500 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Filter:
          </span>
          {[
            { id: 'all', label: 'All Financial' },
            { id: 'deposits', label: 'Deposits' },
            { id: 'withdrawals', label: 'Withdrawals' },
            { id: 'performance', label: 'Performance & Earnings' },
            { id: 'adjustments', label: 'Adjustments' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setCategoryFilter(f.id as any)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                categoryFilter === f.id
                  ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold border border-blue-500/30'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Events List */}
      <div className="space-y-2.5">
        {filteredList.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800">
            <ShieldCheck className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No events found in this category</p>
            <p className="text-xs text-slate-400 mt-1">Financial activity records will appear here as deposits, withdrawals, and daily earnings are processed.</p>
          </div>
        ) : (
          filteredList.map(item => (
            <div
              key={item.id}
              className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-2 hover:border-slate-300 dark:hover:border-slate-700 transition"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {getActionBadge(item.action)}
                  {item.referenceId && (
                    <span className="text-[11px] font-mono font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                      Ref: {item.referenceId}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(item.timestamp).toLocaleString()}</span>
                </div>
              </div>

              <div className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                {item.reason || 'Financial event processed.'}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1 text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800/60">
                <span>
                  Actor: <strong className="text-slate-600 dark:text-slate-400">{item.actorEmail}</strong> ({item.actorRole})
                </span>
                {item.targetUserId && (
                  <span>
                    User ID: <strong className="text-slate-600 dark:text-slate-400">{item.targetUserId}</strong>
                  </span>
                )}
                <span className="ml-auto font-mono text-[9px] text-slate-400">
                  ID: #{item.id}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Database Cleanup Modal */}
      {showCleanupModal && cleanupReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-xl p-6 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-500" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Deterministic Database Cleanup
                </h3>
              </div>
              <button
                onClick={() => setShowCleanupModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            {cleanupSuccessMessage && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{cleanupSuccessMessage}</span>
              </div>
            )}

            {/* Preserved Data Invariants Badge */}
            <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-700 dark:text-blue-300">
                <Lock className="w-3.5 h-3.5" />
                <span>Strict Financial Preservation Guarantee</span>
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
                All confirmed & pending deposits, transaction hashes (tx_hash), deposit proof images,
                investor user accounts, double-entry ledger entries, and active earnings are 100% protected and cannot be deleted.
              </p>
            </div>

            {/* Preserved vs Noise Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Preserved Valid Deposits</span>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  {cleanupReport.preservedSummary?.validDeposits ?? cleanupReport.preserved_records?.deposits ?? 0}
                </p>
                <span className="text-[10px] text-slate-400">Untouched & Intact</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Preserved Investor Users</span>
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                  {cleanupReport.preservedSummary?.investorUsers ?? cleanupReport.preserved_records?.users ?? 0}
                </p>
                <span className="text-[10px] text-slate-400">Legitimate Accounts</span>
              </div>
            </div>

            {/* Deletion Breakdown if dry run */}
            {cleanupReport.deletionPlan && (
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <div className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  <span>Identified Test / Noise Data for Removal</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-500 dark:text-slate-400 text-[11px]">
                  <div>Test Users: <strong>{cleanupReport.deletionPlan.testUsers}</strong></div>
                  <div>Test Ledger: <strong>{cleanupReport.deletionPlan.testLedgerEntries}</strong></div>
                  <div>Test Earnings: <strong>{cleanupReport.deletionPlan.testEarnings}</strong></div>
                  <div>Test Withdrawals: <strong>{cleanupReport.deletionPlan.testWithdrawals}</strong></div>
                  <div>Noise Audit Logs: <strong>{cleanupReport.deletionPlan.noiseAuditLogs}</strong></div>
                  <div>Noise System Logs: <strong>{cleanupReport.deletionPlan.noiseSystemLogs}</strong></div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setShowCleanupModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Close
              </button>
              {cleanupReport.dryRun && (
                <button
                  onClick={handleExecuteCleanup}
                  disabled={isExecutingCleanup}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 transition shadow-sm"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isExecutingCleanup ? 'Executing Cleanup...' : 'Execute Deterministic Cleanup'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
