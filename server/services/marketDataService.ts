import { MarketPrice, MarketTickerResponse } from '../types';
import { logger } from '../logger';

export interface ProviderPriceResult {
  price: number | null;
  change24h: number | null;
  isAvailable: boolean;
  providerName: string;
}

export interface MarketDataCache {
  data: MarketTickerResponse | null;
  lastFetchTime: number;
}

const CACHE_TTL_MS = 50 * 1000; // 50 seconds cache TTL
const STALE_THRESHOLD_MS = 180 * 1000; // 3 minutes stale threshold
const REQUEST_TIMEOUT_MS = 4500; // 4.5 second timeout per external provider

export class MarketDataService {
  private cache: MarketDataCache = {
    data: null,
    lastFetchTime: 0,
  };

  private inFlightPromise: Promise<MarketTickerResponse> | null = null;

  // Provider override hook for testing
  private mockBtcProvider: (() => Promise<ProviderPriceResult>) | null = null;
  private mockGoldProvider: (() => Promise<ProviderPriceResult>) | null = null;

  /**
   * Fetch live BTC price and 24h percentage change.
   * Primary: CoinGecko Public API
   * Secondary: Binance Public 24hr Ticker API
   * Never falls back to a hardcoded price.
   */
  async getBTCPrice(): Promise<ProviderPriceResult> {
    if (this.mockBtcProvider) {
      return this.mockBtcProvider();
    }

    // 1. Try Primary Provider: CoinGecko
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const res = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true',
        {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = (await res.json()) as any;
        const btcData = json?.bitcoin;
        if (btcData && typeof btcData.usd === 'number' && isFinite(btcData.usd)) {
          const price = Number(btcData.usd.toFixed(2));
          const change24h =
            typeof btcData.usd_24h_change === 'number' && isFinite(btcData.usd_24h_change)
              ? Number(btcData.usd_24h_change.toFixed(2))
              : 0;
          return { price, change24h, isAvailable: true, providerName: 'CoinGecko' };
        }
      }
    } catch (err: any) {
      logger.warn('BTC_PRIMARY_PROVIDER_FAILED', `CoinGecko fetch failed: ${err?.message || err}`);
    }

    // 2. Try Secondary Provider: Binance
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const res = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT', {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = (await res.json()) as any;
        const priceNum = parseFloat(json?.lastPrice);
        const changeNum = parseFloat(json?.priceChangePercent);
        if (!isNaN(priceNum) && isFinite(priceNum)) {
          return {
            price: Number(priceNum.toFixed(2)),
            change24h: !isNaN(changeNum) ? Number(changeNum.toFixed(2)) : 0,
            isAvailable: true,
            providerName: 'Binance',
          };
        }
      }
    } catch (err: any) {
      logger.warn('BTC_SECONDARY_PROVIDER_FAILED', `Binance fetch failed: ${err?.message || err}`);
    }

    // Providers failed: Return unavailable, NEVER hardcode a price
    return {
      price: null,
      change24h: null,
      isAvailable: false,
      providerName: 'None',
    };
  }

  /**
   * Fetch live Gold price (USD per troy ounce) and 24h percentage change.
   * Primary: GoldAPI.io (if GOLD_API_KEY configured)
   * Secondary / Spot: Paxos Gold (PAXG, 1:1 physical gold ounce in Brink's vaults) via CoinGecko or Binance
   * Never falls back to a hardcoded price.
   */
  async getGoldPrice(): Promise<ProviderPriceResult> {
    if (this.mockGoldProvider) {
      return this.mockGoldProvider();
    }

    // 1. Primary: Check for configured Gold API key
    const goldApiKey = process.env.GOLD_API_KEY || process.env.METALS_API_KEY;
    if (goldApiKey) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const res = await fetch('https://www.goldapi.io/api/XAU/USD', {
          headers: {
            'x-access-token': goldApiKey,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const json = (await res.json()) as any;
          const price = parseFloat(json?.price);
          const changePct = parseFloat(json?.chp);
          if (!isNaN(price) && isFinite(price)) {
            return {
              price: Number(price.toFixed(2)),
              change24h: !isNaN(changePct) ? Number(changePct.toFixed(2)) : 0,
              isAvailable: true,
              providerName: 'GoldAPI',
            };
          }
        }
      } catch (err: any) {
        logger.warn('GOLD_API_KEY_PROVIDER_FAILED', `GoldAPI fetch failed: ${err?.message || err}`);
      }
    }

    // 2. Secondary: Real-time Paxos Gold physical gold feed via CoinGecko
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const res = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd&include_24hr_change=true',
        {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = (await res.json()) as any;
        const paxData = json?.['pax-gold'];
        if (paxData && typeof paxData.usd === 'number' && isFinite(paxData.usd)) {
          const price = Number(paxData.usd.toFixed(2));
          const change24h =
            typeof paxData.usd_24h_change === 'number' && isFinite(paxData.usd_24h_change)
              ? Number(paxData.usd_24h_change.toFixed(2))
              : 0;
          return { price, change24h, isAvailable: true, providerName: 'CoinGecko_PAXG' };
        }
      }
    } catch (err: any) {
      logger.warn('GOLD_COINGECKO_FEED_FAILED', `CoinGecko gold feed failed: ${err?.message || err}`);
    }

    // 3. Fallback: Paxos Gold 24hr ticker via Binance
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const res = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=PAXGUSDT', {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = (await res.json()) as any;
        const priceNum = parseFloat(json?.lastPrice);
        const changeNum = parseFloat(json?.priceChangePercent);
        if (!isNaN(priceNum) && isFinite(priceNum)) {
          return {
            price: Number(priceNum.toFixed(2)),
            change24h: !isNaN(changeNum) ? Number(changeNum.toFixed(2)) : 0,
            isAvailable: true,
            providerName: 'Binance_PAXG',
          };
        }
      }
    } catch (err: any) {
      logger.warn('GOLD_BINANCE_FEED_FAILED', `Binance gold feed failed: ${err?.message || err}`);
    }

    // Controlled unavailable state: NEVER invent or hardcode a fake gold price
    return {
      price: null,
      change24h: null,
      isAvailable: false,
      providerName: 'None',
    };
  }

  /**
   * Returns unified market ticker data with caching, deduplication, and stale handling.
   */
  async getMarketTicker(forceRefresh = false): Promise<MarketTickerResponse> {
    const now = Date.now();

    // 1. Return fresh cache if available and not forced
    if (
      !forceRefresh &&
      this.cache.data &&
      now - this.cache.lastFetchTime < CACHE_TTL_MS
    ) {
      return this.cache.data;
    }

    // 2. Request Deduplication: If already fetching, wait for the same promise
    if (this.inFlightPromise) {
      return this.inFlightPromise;
    }

    // 3. Execute external fetch and cache result
    this.inFlightPromise = (async () => {
      try {
        const [btcResult, goldResult] = await Promise.all([
          this.getBTCPrice(),
          this.getGoldPrice(),
        ]);

        const timestamp = new Date().toISOString();

        // If both failed and we have existing cache, we can preserve with stale flag
        if (!btcResult.isAvailable && !goldResult.isAvailable && this.cache.data) {
          const isStale = now - this.cache.lastFetchTime > STALE_THRESHOLD_MS;
          return {
            ...this.cache.data,
            isStale,
          };
        }

        const ticker: MarketTickerResponse = {
          btc: {
            price: btcResult.price,
            change24h: btcResult.change24h,
            currency: 'USD',
            isAvailable: btcResult.isAvailable,
          },
          gold: {
            price: goldResult.price,
            change24h: goldResult.change24h,
            currency: 'USD',
            unit: 'oz',
            isAvailable: goldResult.isAvailable,
          },
          updatedAt: timestamp,
          isStale: false,
        };

        // Cache successful response
        this.cache = {
          data: ticker,
          lastFetchTime: now,
        };

        return ticker;
      } finally {
        this.inFlightPromise = null;
      }
    })();

    return this.inFlightPromise;
  }

  /**
   * Backwards compatible method matching existing MarketPrice schema.
   */
  async getMarketPrices(): Promise<MarketPrice> {
    const ticker = await this.getMarketTicker();
    const isAvailable = Boolean(ticker.btc.isAvailable || ticker.gold.isAvailable);

    return {
      btcUsd: ticker.btc.price ?? 0,
      goldUsd: ticker.gold.price ?? 0,
      lastUpdated: ticker.updatedAt,
      isAvailable,
    };
  }

  // --- Testing & Diagnostic Helpers ---
  resetCacheForTesting(): void {
    this.cache = { data: null, lastFetchTime: 0 };
    this.inFlightPromise = null;
    this.mockBtcProvider = null;
    this.mockGoldProvider = null;
  }

  setMockBtcProvider(mock: (() => Promise<ProviderPriceResult>) | null): void {
    this.mockBtcProvider = mock;
  }

  setMockGoldProvider(mock: (() => Promise<ProviderPriceResult>) | null): void {
    this.mockGoldProvider = mock;
  }

  setCachedDataForTesting(data: MarketTickerResponse, ageMs = 0): void {
    this.cache = {
      data,
      lastFetchTime: Date.now() - ageMs,
    };
  }

  getCacheStatus(): { hasCache: boolean; ageMs: number; isStale: boolean } {
    const ageMs = Date.now() - this.cache.lastFetchTime;
    return {
      hasCache: this.cache.data !== null,
      ageMs,
      isStale: ageMs > STALE_THRESHOLD_MS,
    };
  }
}

// Global singleton instance
export const marketDataService = new MarketDataService();
