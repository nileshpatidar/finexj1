import React, { useState, useEffect } from 'react';
import {
  Database,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ShieldAlert,
  FileCode,
  Play,
  Copy,
  Check,
  X,
  Lock,
  Layers,
} from 'lucide-react';
import { api } from '../services/api';
import { MigrationItem, MigrationSummary } from '../types';

interface AdminMigrationsViewProps {
  onNotifySuccess: (msg: string) => void;
  onNotifyError: (msg: string) => void;
}

export const AdminMigrationsView: React.FC<AdminMigrationsViewProps> = ({
  onNotifySuccess,
  onNotifyError,
}) => {
  const [migrations, setMigrations] = useState<MigrationItem[]>([]);
  const [summary, setSummary] = useState<MigrationSummary>({
    total: 0,
    applied: 0,
    pending: 0,
    failed: 0,
    mismatched: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Review SQL Modal State
  const [sqlModalFile, setSqlModalFile] = useState<string | null>(null);
  const [sqlModalContent, setSqlModalContent] = useState<string | null>(null);
  const [sqlModalChecksum, setSqlModalChecksum] = useState<string | null>(null);
  const [loadingSql, setLoadingSql] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Execution Confirmation Dialog State
  const [migrationToRun, setMigrationToRun] = useState<MigrationItem | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);

  const fetchMigrations = async () => {
    try {
      setRefreshing(true);
      const res = await api.getAdminMigrations();
      if (res.success) {
        setMigrations(res.migrations);
        setSummary(res.summary);
      }
    } catch (err: any) {
      onNotifyError(err?.message || 'Failed to load database migrations.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMigrations();
  }, []);

  const handleOpenSqlModal = async (filename: string) => {
    setSqlModalFile(filename);
    setSqlModalContent(null);
    setSqlModalChecksum(null);
    setLoadingSql(true);
    try {
      const res = await api.getAdminMigrationSql(filename);
      if (res.success) {
        setSqlModalContent(res.sql);
        setSqlModalChecksum(res.checksum);
      }
    } catch (err: any) {
      setSqlModalContent(`-- Failed to load SQL: ${err?.message}`);
    } finally {
      setLoadingSql(false);
    }
  };

  const handleCopySql = () => {
    if (!sqlModalContent) return;
    navigator.clipboard.writeText(sqlModalContent);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleConfirmRun = async () => {
    if (!migrationToRun) return;
    setIsExecuting(true);
    setExecutionError(null);

    try {
      const res = await api.executeAdminMigration(migrationToRun.filename);
      if (res.success) {
        onNotifySuccess(res.message || `Migration ${migrationToRun.filename} applied successfully.`);
        setMigrationToRun(null);
        await fetchMigrations();
      }
    } catch (err: any) {
      setExecutionError(err?.message || 'Execution failed with unknown error.');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Warnings */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Authoritative Database Migrations
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Track, inspect, and execute schema migrations from <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px] text-blue-600 dark:text-blue-400">/supabase/migrations</code>.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchMigrations}
            disabled={refreshing}
            className="flex items-center justify-center space-x-1.5 py-2 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh Migration Status</span>
          </button>
        </div>

        {/* Security Warning Notice */}
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 flex items-start space-x-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <p className="font-bold">
              Production Migration Safety Rules
            </p>
            <p className="leading-relaxed text-amber-700 dark:text-amber-400">
              Only run migrations that are committed to the deployed application. Migrations execute sequentially with cryptographic SHA-256 integrity verification. Arbitrary SQL execution is strictly forbidden.
            </p>
          </div>
        </div>
      </div>

      {/* Migration Metric Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
            <span>Total Migrations</span>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">
            {summary.total}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
            <span>Applied</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {summary.applied}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
            <span>Pending</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
            {summary.pending}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
            <span>Failed / Alert</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-xl font-bold text-rose-600 dark:text-rose-400">
            {summary.failed + summary.mismatched}
          </p>
        </div>
      </div>

      {/* Migrations Table / List */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            Repository Schema Migrations ({migrations.length})
          </h3>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Ordered strictly by sequence number
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs">
            Loading authoritative migration state...
          </div>
        ) : migrations.length === 0 ? (
          <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs">
            No database migrations found in manifest.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-3">#</th>
                  <th className="py-3 px-3">Migration File</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Applied Info</th>
                  <th className="py-3 px-3">Checksum</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {migrations.map((m) => {
                  const isPending = m.status === 'pending';
                  const isApplied = m.status === 'applied';
                  const isFailed = m.status === 'failed';
                  const isMismatch = m.status === 'checksum_mismatch';

                  return (
                    <tr
                      key={m.filename}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      {/* Sequence Number */}
                      <td className="py-3.5 px-3 font-mono text-slate-400 font-bold">
                        {String(m.number).padStart(3, '0')}
                      </td>

                      {/* File Name & Human Title */}
                      <td className="py-3.5 px-3">
                        <div className="font-semibold text-slate-900 dark:text-white capitalize">
                          {m.name}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {m.filename}
                        </div>
                        {isFailed && m.errorMessage && (
                          <div className="mt-1 p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 text-[11px] font-mono">
                            {m.errorMessage}
                          </div>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-3">
                        {isApplied && (
                          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 font-semibold text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Applied</span>
                          </span>
                        )}
                        {isPending && (
                          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 font-semibold text-[11px]">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Pending</span>
                          </span>
                        )}
                        {isFailed && (
                          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 font-semibold text-[11px]">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Failed</span>
                          </span>
                        )}
                        {isMismatch && (
                          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800/60 font-semibold text-[11px]">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>Checksum Mismatch</span>
                          </span>
                        )}
                      </td>

                      {/* Applied Info */}
                      <td className="py-3.5 px-3 text-slate-600 dark:text-slate-400 text-[11px]">
                        {m.appliedAt ? (
                          <div>
                            <div>{new Date(m.appliedAt).toLocaleDateString()}</div>
                            <div className="text-[10px] text-slate-400">
                              by {m.appliedBy || 'super_admin'}
                              {m.executionTimeMs ? ` (${m.executionTimeMs}ms)` : ''}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Not applied</span>
                        )}
                      </td>

                      {/* Checksum */}
                      <td className="py-3.5 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400" title={m.checksum}>
                        {m.checksum.slice(0, 10)}...
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-3 text-right">
                        <div className="inline-flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => handleOpenSqlModal(m.filename)}
                            className="inline-flex items-center space-x-1 py-1 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition cursor-pointer"
                            title="View Migration SQL"
                          >
                            <FileCode className="w-3.5 h-3.5" />
                            <span>View SQL</span>
                          </button>

                          {isPending && (
                            <button
                              type="button"
                              onClick={() => {
                                setMigrationToRun(m);
                                setExecutionError(null);
                              }}
                              className="inline-flex items-center space-x-1 py-1 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm shadow-blue-500/20 transition cursor-pointer"
                              title="Run this pending migration"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Run</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: Review SQL Modal (Read-Only Reviewer) */}
      {sqlModalFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-3xl max-h-[85vh] rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <FileCode className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Migration SQL Review: {sqlModalFile}
                  </h4>
                  {sqlModalChecksum && (
                    <p className="text-[11px] font-mono text-slate-400">
                      SHA-256: {sqlModalChecksum}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleCopySql}
                  disabled={!sqlModalContent || loadingSql}
                  className="inline-flex items-center space-x-1.5 py-1.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition cursor-pointer"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSql ? 'Copied' : 'Copy SQL'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSqlModalFile(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* SQL Content Area - Read Only Syntax Box */}
            <div className="p-5 flex-1 overflow-y-auto bg-slate-950 text-slate-100 font-mono text-xs leading-relaxed">
              {loadingSql ? (
                <div className="py-16 text-center text-slate-500">Loading migration script...</div>
              ) : (
                <pre className="whitespace-pre-wrap select-text">{sqlModalContent}</pre>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center space-x-1">
                <Lock className="w-3.5 h-3.5" />
                <span>Read-only inspection. SQL cannot be altered through this interface.</span>
              </span>
              <button
                type="button"
                onClick={() => setSqlModalFile(null)}
                className="py-1.5 px-4 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-semibold text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Execution Confirmation Dialog */}
      {migrationToRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Run database migration?
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Migration: <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{migrationToRun.filename}</span>
              </p>
              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 pt-1">
                This will modify the production database.
              </p>
            </div>

            {executionError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-mono space-y-1">
                <div className="font-bold flex items-center space-x-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>PostgreSQL Execution Error:</span>
                </div>
                <p className="text-[11px] leading-relaxed break-words">{executionError}</p>
              </div>
            )}

            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setMigrationToRun(null)}
                disabled={isExecuting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRun}
                disabled={isExecuting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition cursor-pointer disabled:opacity-50 flex items-center justify-center space-x-1.5"
              >
                {isExecuting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Running...</span>
                  </>
                ) : (
                  <span>Run Migration</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
