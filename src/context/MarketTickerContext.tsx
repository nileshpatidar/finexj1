import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { MarketTickerResponse } from '../types';
import { api } from '../services/api';

export interface FormattedChange {
  text: string;
  direction: 'up' | 'down' | 'zero' | 'none';
  className: string;
}

export interface MarketTickerContextValue {
  ticker: MarketTickerResponse | null;
  isLoading: boolean;
  isError: boolean;
  isStale: boolean;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
  formatBtcPrice: (price: number | null | undefined) => string;
  formatGoldPrice: (price: number | null | undefined) => string;
  format24hChange: (change: number | null | undefined) => FormattedChange;
}

const MarketTickerContext = createContext<MarketTickerContextValue | null>(null);

const REFRESH_INTERVAL_MS = 60 * 1000; // 60 seconds auto-refresh
const STALE_THRESHOLD_MS = 180 * 1000; // 3 minutes threshold

export const MarketTickerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ticker, setTicker] = useState<MarketTickerResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const fetchTicker = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setIsLoading(true);
      }
      const data = await api.getMarketTicker(isManualRefresh);
      setTicker(data);
      setIsError(false);
    } catch (err) {
      console.warn('Market ticker request failed:', err);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and single shared polling interval
  useEffect(() => {
    let mounted = true;

    fetchTicker();

    const intervalId = setInterval(() => {
      if (mounted) {
        fetchTicker(false);
      }
    }, REFRESH_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [fetchTicker]);

  // Derive lastUpdated and staleness
  const lastUpdated = useMemo(() => {
    if (!ticker?.updatedAt) return null;
    const d = new Date(ticker.updatedAt);
    return isNaN(d.getTime()) ? null : d;
  }, [ticker?.updatedAt]);

  const isStale = useMemo(() => {
    if (!lastUpdated) return false;
    if (ticker?.isStale) return true;
    return Date.now() - lastUpdated.getTime() > STALE_THRESHOLD_MS;
  }, [lastUpdated, ticker?.isStale]);

  // Number Formatting: BTC (USD, comma separators, 2 decimal places)
  const formatBtcPrice = useCallback((price: number | null | undefined): string => {
    if (price === null || price === undefined || !isFinite(price) || price <= 0) {
      return 'Unavailable';
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  }, []);

  // Number Formatting: Gold (USD per troy ounce, comma separators, 2 decimal places, /oz suffix)
  const formatGoldPrice = useCallback((price: number | null | undefined): string => {
    if (price === null || price === undefined || !isFinite(price) || price <= 0) {
      return 'Unavailable';
    }
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
    return `${formatted}/oz`;
  }, []);

  // 24h Change Formatting (Authoritative 24-hour percentage change)
  const format24hChange = useCallback((change: number | null | undefined): FormattedChange => {
    if (change === null || change === undefined || !isFinite(change)) {
      return {
        text: '',
        direction: 'none',
        className: 'text-slate-400',
      };
    }

    if (change > 0) {
      return {
        text: `▲ +${change.toFixed(2)}%`,
        direction: 'up',
        className: 'text-emerald-500 dark:text-emerald-400 font-semibold',
      };
    }

    if (change < 0) {
      return {
        text: `▼ ${change.toFixed(2)}%`,
        direction: 'down',
        className: 'text-rose-500 dark:text-rose-400 font-semibold',
      };
    }

    return {
      text: '0.00%',
      direction: 'zero',
      className: 'text-slate-400 dark:text-slate-500 font-medium',
    };
  }, []);

  const value = useMemo<MarketTickerContextValue>(
    () => ({
      ticker,
      isLoading,
      isError,
      isStale,
      lastUpdated,
      refresh: () => fetchTicker(true),
      formatBtcPrice,
      formatGoldPrice,
      format24hChange,
    }),
    [ticker, isLoading, isError, isStale, lastUpdated, fetchTicker, formatBtcPrice, formatGoldPrice, format24hChange]
  );

  return (
    <MarketTickerContext.Provider value={value}>
      {children}
    </MarketTickerContext.Provider>
  );
};

export function useMarketTicker(): MarketTickerContextValue {
  const context = useContext(MarketTickerContext);
  if (!context) {
    throw new Error('useMarketTicker must be used within a MarketTickerProvider');
  }
  return context;
}
