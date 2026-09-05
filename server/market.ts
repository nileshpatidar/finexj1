import { MarketPrice } from './types';
import { marketDataService } from './services/marketDataService';

export async function getMarketPrices(): Promise<MarketPrice> {
  return marketDataService.getMarketPrices();
}

export { marketDataService };
