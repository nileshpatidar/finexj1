import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { LedgerItem } from '../types';
import {
  History,
  ArrowDownToLine,
  ArrowUpFromLine,
  TrendingUp,
  Wallet,
  Search,
  Filter,
} from 'lucide-react';

export const TransactionsView: React.FC = () => {
  const [transactions, setTransactions] = useState<LedgerItem[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadTx = async () => {
      try {
        const res = await api.getTransactions();
        setTransactions(res.transactions || []);
      } catch (err) {
        console.warn('Error loading transactions:', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadTx();
  }, []);

  const filtered = transactions.filter(t => {
    if (filterType !== 'all') {
      if (filterType === 'deposits' && t.type !== 'deposit') return false;
      if (filterType === 'earnings' && t.type !== 'daily_earnings') return false;
      if (filterType === 'withdrawals' && !t.type.startsWith('withdrawal')) return false;
      if (filterType === 'adjustments' && t.type !== 'admin_adjustment') return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        t.description.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        (t.referenceId && t.referenceId.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-24 text-xs">
      {/* Title */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-100 dark:text-slate-100 text-slate-900">
          Financial Activity & Ledger
        </h1>
        <p className="text-xs text-slate-400 dark:text-slate-400 text-slate-500 mt-1">
          Complete, auditable history of deposits, performance allocations, and withdrawals.
        </p>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by TxID, description, or reference..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 dark:bg-slate-900 bg-white border border-slate-800 dark:border-slate-800 border-slate-200 text-slate-200 dark:text-slate-200 text-slate-800 text-xs focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {['all', 'deposits', 'earnings', 'withdrawals', 'adjustments'].map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-2 rounded-xl capitalize font-semibold transition ${
                filterType === type
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'bg-slate-900 dark:bg-slate-900 bg-white text-slate-400 hover:text-slate-200 border border-slate-800 dark:border-slate-800 border-slate-200'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Transaction List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-16 bg-slate-900/60 rounded-2xl"></div>
            <div className="h-16 bg-slate-900/60 rounded-2xl"></div>
            <div className="h-16 bg-slate-900/60 rounded-2xl"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400">
            No transactions found matching your criteria.
          </div>
        ) : (
          filtered.map(item => {
            const isEarning = item.type === 'daily_earnings';
            const isLoss = item.type === 'daily_loss';
            const isDeposit = item.type === 'deposit';
            const isWithdrawal = item.type.startsWith('withdrawal');

            return (
              <div
                key={item.id}
                className="p-4 rounded-2xl bg-slate-900/60 dark:bg-slate-900/60 bg-white border border-slate-800/70 dark:border-slate-800/70 border-slate-200 flex items-center justify-between gap-3 shadow-sm"
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold flex-shrink-0 ${
                      isDeposit
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : isEarning
                        ? 'bg-teal-500/20 text-teal-400'
                        : isLoss
                        ? 'bg-rose-500/20 text-rose-400'
                        : isWithdrawal
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-purple-500/20 text-purple-400'
                    }`}
                  >
                    {isDeposit && <ArrowDownToLine className="w-5 h-5" />}
                    {isEarning && <TrendingUp className="w-5 h-5" />}
                    {isLoss && <TrendingUp className="w-5 h-5 rotate-180 text-rose-400" />}
                    {isWithdrawal && <ArrowUpFromLine className="w-5 h-5" />}
                    {item.type === 'admin_adjustment' && <Wallet className="w-5 h-5" />}
                  </div>

                  <div>
                    <p className="font-bold text-slate-100 dark:text-slate-100 text-slate-900 text-xs sm:text-sm">
                      {item.description}
                    </p>
                    <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5">
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                      {item.referenceId && (
                        <>
                          <span>•</span>
                          <span className="font-mono">{item.referenceId}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <span
                    className={`font-extrabold text-sm sm:text-base ${
                      isEarning || isDeposit
                        ? 'text-emerald-400'
                        : isLoss
                        ? 'text-rose-400'
                        : 'text-slate-300 dark:text-slate-300 text-slate-700'
                    }`}
                  >
                    {isEarning || isDeposit ? '+' : isLoss ? '-' : ''}${Math.abs(item.amount).toFixed(2)}
                  </span>
                  <p className="text-[10px] text-slate-500">USDT</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
