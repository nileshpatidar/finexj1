/**
 * Formatters and parsers for Daily Performance activities.
 * Ensures consistent display of performance dates, rates, and compounding base amounts
 * without exposing internal database creation timestamps to users.
 */

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats a performance date (e.g. '2026-09-16' or ISO date) to '16/09/2026'.
 * Avoids UTC timezone day-shifting by splitting YYYY-MM-DD components directly.
 */
export function formatPerformanceDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const cleanStr = String(dateStr).trim();

  // If already DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleanStr)) {
    return cleanStr;
  }

  const datePart = cleanStr.split('T')[0];
  const parts = datePart.split('-');

  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);

    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      const dd = String(day).padStart(2, '0');
      const mm = String(month).padStart(2, '0');
      return `${dd}/${mm}/${year}`;
    }
  }

  const parsed = new Date(cleanStr);
  if (!isNaN(parsed.getTime())) {
    const dd = String(parsed.getDate()).padStart(2, '0');
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const yyyy = parsed.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  return cleanStr;
}

/**
 * Formats a numeric currency/base amount cleanly, keeping up to 4 significant decimals
 * if present, but avoiding trailing zeros like 836.3619 -> "836.3619", 300.00 -> "300".
 */
export function formatBaseAmount(val: number | string | undefined | null): string {
  if (val === undefined || val === null || val === '') return '0';
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) return '0';
  // If integer or has few decimals:
  const formatted = num.toFixed(4);
  return formatted.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0000$/, '');
}

export interface ParsedPerformanceInfo {
  isPerformance: boolean;
  performanceDate?: string;
  formattedDate: string;
  ratePercentage?: number;
  baseAmount?: number;
  displayTitle: string;
  secondaryText: string;
}

/**
 * Extracts authoritative performance date, yield percentage, and base amount
 * from a ledger/transaction item, with safe fallback to parsing existing description strings.
 */
export function parsePerformanceItem(item: {
  type?: string;
  performanceDate?: string;
  ratePercentage?: number;
  baseEligibleAmount?: number;
  description?: string;
  createdAt?: string;
}): ParsedPerformanceInfo {
  const isPerformance =
    item.type === 'daily_earnings' ||
    item.type === 'daily_loss' ||
    item.type === 'earning' ||
    item.type === 'performance' ||
    Boolean(item.description && /daily\s+performance/i.test(item.description));

  let perfDate = item.performanceDate;
  let ratePct = item.ratePercentage;
  let baseAmt = item.baseEligibleAmount;

  // Fallback parsing from description if structured properties are not explicitly set
  if (item.description) {
    if (!perfDate) {
      const matchDate =
        item.description.match(/(?:for|yield for|—|-|\s|^)\s*(\d{4}-\d{2}-\d{2})/i) ||
        item.description.match(/(\d{4}-\d{2}-\d{2})/) ||
        item.description.match(/(\d{2}\/\d{2}\/\d{4})/);
      if (matchDate) {
        perfDate = matchDate[1];
      }
    }
    if (ratePct === undefined) {
      const matchRate = item.description.match(/@\s*([+\-]?\d+(?:\.\d+)?)\s*%/);
      if (matchRate) {
        ratePct = parseFloat(matchRate[1]);
      }
    }
    if (baseAmt === undefined) {
      const matchBase = item.description.match(/on\s+([\d.]+)\s*USDT/i);
      if (matchBase) {
        baseAmt = parseFloat(matchBase[1]);
      }
    }
  }

  const formattedDate = perfDate ? formatPerformanceDate(perfDate) : '';

  // Authoritative separation: Title is strictly 'Daily Performance', date is separated into formattedDate
  const displayTitle = isPerformance
    ? 'Daily Performance'
    : (item.description || 'Transaction');

  let secondaryText = '';
  if (isPerformance) {
    if (ratePct !== undefined && baseAmt !== undefined) {
      secondaryText = `${ratePct >= 0 ? '' : ''}${ratePct.toFixed(2)}% on ${formatBaseAmount(baseAmt)} USDT`;
    } else if (ratePct !== undefined) {
      secondaryText = `${ratePct.toFixed(2)}% Yield`;
    } else if (baseAmt !== undefined) {
      secondaryText = `on ${formatBaseAmount(baseAmt)} USDT base`;
    }
  }

  return {
    isPerformance,
    performanceDate: perfDate,
    formattedDate,
    ratePercentage: ratePct,
    baseAmount: baseAmt,
    displayTitle,
    secondaryText,
  };
}
