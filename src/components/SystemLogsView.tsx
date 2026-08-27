import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { SystemLogItem, SystemHealthStats } from '../types';
import {
  FileText,
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  Clock,
  User,
  Shield,
  Activity,
  Layers,
  Download,
  Trash2,
  Sliders,
} from 'lucide-react';

export const SystemLogsView: React.FC = () => {
  const [logs, setLogs] = useState<SystemLogItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [healthStats, setHealthStats] = useState<SystemHealthStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [searchEvent, setSearchEvent] = useState<string>('');
  const [searchErrorCode, setSearchErrorCode] = useState<string>('');
  const [searchRequestId, setSearchRequestId] = useState<string>('');
  const [searchUserId, setSearchUserId] = useState<string>('');
  const [pageLimit] = useState(50);
  const [pageOffset, setPageOffset] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchLogs = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [logsRes, statsRes] = await Promise.all([
        api.getSystemLogs({
          level: selectedLevel !== 'all' ? selectedLevel : undefined,
          event: searchEvent.trim() || undefined,
          errorCode: searchErrorCode.trim() || undefined,
          requestId: searchRequestId.trim() || undefined,
          limit: pageLimit,
          offset: pageOffset,
        }),
        api.getSystemHealthStats(),
      ]);

      setLogs(logsRes.logs || []);
      setTotalCount(logsRes.totalCount || 0);
      setHealthStats(statsRes);
    } catch (err) {
      console.warn('Failed to load system logs:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedLevel, searchEvent, searchErrorCode, searchRequestId, pageLimit, pageOffset]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Auto refresh interval
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLogs();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20">
            <AlertCircle className="w-3 h-3" />
            ERROR
          </span>
        );
      case 'WARN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <AlertTriangle className="w-3 h-3" />
            WARN
          </span>
        );
      case 'INFO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <Info className="w-3 h-3" />
            INFO
          </span>
        );
      case 'DEBUG':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            DEBUG
          </span>
        );
    }
  };

  const exportLogsAsJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `finexj_system_logs_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div id="system-logs-container" className="space-y-6">
      {/* Top Telemetry Summary Cards */}
      {healthStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Logs</span>
              <Activity className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-bold text-slate-100 mt-2">{healthStats.totalSystemLogs}</div>
            <div className="text-xs text-slate-400 mt-1">
              {healthStats.dbLoggingEnabled ? (
                <span className="text-emerald-400 font-medium">DB Saving Active</span>
              ) : (
                <span className="text-amber-400 font-medium">Terminal-Only Mode</span>
              )}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Errors (24h)</span>
              <AlertCircle className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-2xl font-bold text-rose-400 mt-2">{healthStats.errorsToday}</div>
            <div className="text-xs text-slate-400 mt-1">Auto-persisted to database</div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Warnings</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-amber-400 mt-2">{healthStats.warningsToday}</div>
            <div className="text-xs text-slate-400 mt-1">Audit & security alerts</div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Log Retention</span>
              <Clock className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400 mt-2">
              {healthStats.retentionSettings?.systemLogRetentionDays || 30}d
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Errors: {healthStats.retentionSettings?.errorLogRetentionDays || 90}d
            </div>
          </div>
        </div>
      )}

      {/* Filter & Control Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-slate-100 text-sm">System Event & Telemetry Logs</h3>
            <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
              Showing {logs.length} of {totalCount} records
            </span>
            {healthStats?.dbLoggingEnabled ? (
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-md hidden sm:inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                ENABLE_LOGGING=true (DB + Terminal)
              </span>
            ) : (
              <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded-md hidden sm:inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Terminal-Only Mode
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-toggle-auto-refresh"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${
                autoRefresh
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                  : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Activity className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-pulse text-emerald-400' : ''}`} />
              {autoRefresh ? 'Live Streaming' : 'Live Stream Off'}
            </button>

            <button
              id="btn-refresh-logs"
              onClick={() => fetchLogs()}
              disabled={isRefreshing}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-slate-100 hover:bg-slate-700 transition flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            <button
              id="btn-export-logs"
              onClick={exportLogsAsJson}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-slate-100 hover:bg-slate-700 transition flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Export JSON
            </button>
          </div>
        </div>

        {/* Search Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-slate-800">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Log Level</label>
            <select
              id="filter-log-level"
              value={selectedLevel}
              onChange={(e) => {
                setSelectedLevel(e.target.value);
                setPageOffset(0);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            >
              <option value="all">All Levels</option>
              <option value="ERROR">ERROR only</option>
              <option value="WARN">WARN only</option>
              <option value="INFO">INFO only</option>
              <option value="DEBUG">DEBUG only</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Event / Action</label>
            <div className="relative">
              <input
                id="filter-log-event"
                type="text"
                value={searchEvent}
                onChange={(e) => {
                  setSearchEvent(e.target.value);
                  setPageOffset(0);
                }}
                placeholder="e.g. AUTH_LOGIN, DEPOSIT"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-7 pr-2 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Error Code</label>
            <input
              id="filter-log-error-code"
              type="text"
              value={searchErrorCode}
              onChange={(e) => {
                setSearchErrorCode(e.target.value);
                setPageOffset(0);
              }}
              placeholder="e.g. INVALID_CREDENTIALS"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Request ID</label>
            <input
              id="filter-log-request-id"
              type="text"
              value={searchRequestId}
              onChange={(e) => {
                setSearchRequestId(e.target.value);
                setPageOffset(0);
              }}
              placeholder="req_..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Level</th>
                <th className="py-3 px-4">Event</th>
                <th className="py-3 px-4">Message</th>
                <th className="py-3 px-4">Request ID</th>
                <th className="py-3 px-4">Route / Duration</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                      <span>Loading structured system logs...</span>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No system logs found matching the filter criteria.
                  </td>
                </tr>
              ) : (
                logs.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                      {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      <div className="text-[10px] text-slate-400">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">{getLevelBadge(item.level)}</td>
                    <td className="py-3 px-4 font-semibold text-slate-200">
                      <div>{item.event}</div>
                      {item.errorCode && (
                        <div className="text-[10px] text-rose-400 font-normal">Code: {item.errorCode}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-300 max-w-xs break-words">
                      {item.message}
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                      {item.requestId ? (
                        <span className="bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-slate-400">
                          {item.requestId}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                      {item.route ? (
                        <div>
                          <span className="text-emerald-400 font-semibold">{item.method}</span> {item.route}
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                      {item.durationMs !== undefined && (
                        <span className="text-[10px] text-slate-400">{item.durationMs}ms</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {item.metadata && Object.keys(item.metadata).length > 0 ? (
                        <span
                          title={JSON.stringify(item.metadata, null, 2)}
                          className="cursor-pointer text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded border border-slate-700 transition"
                        >
                          Payload ({Object.keys(item.metadata).length})
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        {totalCount > pageLimit && (
          <div className="p-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div>
              Showing {pageOffset + 1} - {Math.min(pageOffset + pageLimit, totalCount)} of {totalCount}
            </div>
            <div className="flex gap-2">
              <button
                disabled={pageOffset === 0}
                onClick={() => setPageOffset(Math.max(0, pageOffset - pageLimit))}
                className="px-3 py-1 bg-slate-800 text-slate-200 rounded disabled:opacity-40 hover:bg-slate-700 transition"
              >
                Previous
              </button>
              <button
                disabled={pageOffset + pageLimit >= totalCount}
                onClick={() => setPageOffset(pageOffset + pageLimit)}
                className="px-3 py-1 bg-slate-800 text-slate-200 rounded disabled:opacity-40 hover:bg-slate-700 transition"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
