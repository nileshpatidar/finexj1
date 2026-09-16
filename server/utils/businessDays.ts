/**
 * FINEXJ Business Day & Federal Holiday Calculator
 * Strictly enforces US-business-day timeline (Monday-Friday, skipping Saturday, Sunday, and US Federal Holidays).
 * Accurately handles observed federal holidays per 5 U.S.C. 6103.
 */

/**
 * Returns true if the day is a Saturday (6) or Sunday (0) in UTC.
 */
export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Generates the set of observed US Federal Holidays (in 'YYYY-MM-DD' UTC format) for a given calendar year.
 * Per 5 U.S.C. 6103:
 * - If a holiday falls on Saturday, it is observed on the preceding Friday.
 * - If a holiday falls on Sunday, it is observed on the following Monday.
 */
export function getUSFederalHolidaysForYear(year: number): Set<string> {
  const holidays = new Set<string>();

  const toYMD = (d: Date): string => {
    return d.toISOString().slice(0, 10);
  };

  const addObserved = (y: number, mZeroIndexed: number, d: number) => {
    const actual = new Date(Date.UTC(y, mZeroIndexed, d));
    const day = actual.getUTCDay();
    if (day === 0) {
      // Sunday -> observed Monday
      const obs = new Date(Date.UTC(y, mZeroIndexed, d + 1));
      holidays.add(toYMD(obs));
    } else if (day === 6) {
      // Saturday -> observed Friday
      const obs = new Date(Date.UTC(y, mZeroIndexed, d - 1));
      holidays.add(toYMD(obs));
    } else {
      holidays.add(toYMD(actual));
    }
  };

  // 1. New Year's Day - January 1
  addObserved(year, 0, 1);

  // 2. Martin Luther King Jr. Day - 3rd Monday in January
  {
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const offset = (1 - jan1.getUTCDay() + 7) % 7;
    const firstMon = 1 + offset;
    const thirdMon = firstMon + 14;
    holidays.add(toYMD(new Date(Date.UTC(year, 0, thirdMon))));
  }

  // 3. Washington's Birthday (Presidents' Day) - 3rd Monday in February
  {
    const feb1 = new Date(Date.UTC(year, 1, 1));
    const offset = (1 - feb1.getUTCDay() + 7) % 7;
    const firstMon = 1 + offset;
    const thirdMon = firstMon + 14;
    holidays.add(toYMD(new Date(Date.UTC(year, 1, thirdMon))));
  }

  // 4. Memorial Day - Last Monday in May (May has 31 days)
  {
    const may31 = new Date(Date.UTC(year, 4, 31));
    const offset = (may31.getUTCDay() - 1 + 7) % 7;
    const lastMon = 31 - offset;
    holidays.add(toYMD(new Date(Date.UTC(year, 4, lastMon))));
  }

  // 5. Juneteenth National Independence Day - June 19
  addObserved(year, 5, 19);

  // 6. Independence Day - July 4
  addObserved(year, 6, 4);

  // 7. Labor Day - 1st Monday in September
  {
    const sep1 = new Date(Date.UTC(year, 8, 1));
    const offset = (1 - sep1.getUTCDay() + 7) % 7;
    const firstMon = 1 + offset;
    holidays.add(toYMD(new Date(Date.UTC(year, 8, firstMon))));
  }

  // 8. Columbus Day - 2nd Monday in October
  {
    const oct1 = new Date(Date.UTC(year, 9, 1));
    const offset = (1 - oct1.getUTCDay() + 7) % 7;
    const firstMon = 1 + offset;
    const secondMon = firstMon + 7;
    holidays.add(toYMD(new Date(Date.UTC(year, 9, secondMon))));
  }

  // 9. Veterans Day - November 11
  addObserved(year, 10, 11);

  // 10. Thanksgiving Day - 4th Thursday in November
  {
    const nov1 = new Date(Date.UTC(year, 10, 1));
    const offset = (4 - nov1.getUTCDay() + 7) % 7;
    const firstThu = 1 + offset;
    const fourthThu = firstThu + 21;
    holidays.add(toYMD(new Date(Date.UTC(year, 10, fourthThu))));
  }

  // 11. Christmas Day - December 25
  addObserved(year, 11, 25);

  return holidays;
}

// In-memory cache for computed holiday sets by year
const holidayCache = new Map<number, Set<string>>();

function getCachedHolidays(year: number): Set<string> {
  let cached = holidayCache.get(year);
  if (!cached) {
    cached = getUSFederalHolidaysForYear(year);
    holidayCache.set(year, cached);
  }
  return cached;
}

/**
 * Checks if a given UTC date is an observed US Federal Holiday.
 * Checks adjacent years to correctly capture edge observations (e.g. Jan 1 observed on Dec 31).
 */
export function isUSFederalHoliday(date: Date): boolean {
  const ymd = date.toISOString().slice(0, 10);
  const year = date.getUTCFullYear();

  return (
    getCachedHolidays(year).has(ymd) ||
    getCachedHolidays(year - 1).has(ymd) ||
    getCachedHolidays(year + 1).has(ymd)
  );
}

/**
 * Returns true if a date is a standard US Business Day (Monday-Friday and NOT an observed Federal Holiday).
 */
export function isUSBusinessDay(date: Date): boolean {
  if (isWeekend(date)) return false;
  return !isUSFederalHoliday(date);
}

/**
 * Adds N business days to a given start date.
 * Skips Saturdays, Sundays, and observed US Federal Holidays.
 * Preserves the exact UTC time-of-day (hours, minutes, seconds, milliseconds).
 */
export function addUSBusinessDays(startDate: Date | string | number, businessDays: number): Date {
  const d = new Date(startDate);
  if (isNaN(d.getTime())) {
    throw new Error('Invalid startDate provided to addUSBusinessDays');
  }

  const daysNeeded = Math.floor(businessDays);
  if (daysNeeded <= 0) {
    return new Date(d);
  }

  let remaining = daysNeeded;
  const current = new Date(d);

  while (remaining > 0) {
    current.setUTCDate(current.getUTCDate() + 1);
    if (isUSBusinessDay(current)) {
      remaining -= 1;
    }
  }

  return current;
}

/**
 * Authoritative Deposit Principal Lock End Date calculation.
 * Counts `lockPeriodDays` US business days starting from the deposit timestamp.
 */
export function calculateDepositLockEndDate(
  startDate: Date | string | number,
  lockPeriodDays: number
): string {
  const lockDays = typeof lockPeriodDays === 'number' && !isNaN(lockPeriodDays) && lockPeriodDays >= 0
    ? lockPeriodDays
    : 66;

  return addUSBusinessDays(startDate, lockDays).toISOString();
}

/**
 * Counts the number of US business days between startDate and endDate.
 */
export function countUSBusinessDays(startDate: Date | string | number, endDate: Date | string | number): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
    return 0;
  }

  let count = 0;
  const current = new Date(start);
  while (current.getTime() < end.getTime()) {
    current.setUTCDate(current.getUTCDate() + 1);
    if (isUSBusinessDay(current)) {
      count += 1;
    }
  }
  return count;
}

/**
 * Checks whether a deposit lock is currently active at referenceDate (defaults to now).
 */
export function isDepositLockActive(
  lockEndDate: Date | string | null | undefined,
  referenceDate: Date = new Date()
): boolean {
  if (!lockEndDate) return false;
  const end = new Date(lockEndDate);
  if (isNaN(end.getTime())) return false;
  return referenceDate.getTime() < end.getTime();
}

