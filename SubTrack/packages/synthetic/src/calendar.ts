/**
 * Swedish calendar utilities for synthetic transaction generation.
 * Covers official Swedish public holidays (röda dagar) plus bank-specific
 * closure days (Christmas Eve, Midsummer Eve, New Year's Eve).
 */

/** Compute Easter Sunday for a given year (Gregorian, Anonymous algorithm). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Add calendar days to a date (returns a new Date; does not mutate). */
export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Midsummer Day: the Saturday between June 20 and June 26 (inclusive).
 * Midsummer Eve: the Friday immediately before Midsummer Day.
 */
function midsummerDay(year: number): Date {
  const jun20 = new Date(year, 5, 20); // June 20
  const dow = jun20.getDay(); // 0=Sun … 6=Sat
  const daysToSat = dow === 6 ? 0 : (6 - dow + 7) % 7;
  return addDays(jun20, daysToSat);
}

/**
 * All Saints' Day: the Saturday between October 31 and November 6 (inclusive).
 */
function allSaintsDay(year: number): Date {
  const oct31 = new Date(year, 9, 31); // October 31
  const dow = oct31.getDay();
  const daysToSat = dow === 6 ? 0 : (6 - dow + 7) % 7;
  return addDays(oct31, daysToSat);
}

/** Return yyyy-mm-dd string for a Date (local time). */
function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Build the full set of Swedish bank holidays for a given year. */
function buildHolidaySet(year: number): Set<string> {
  const easter = easterSunday(year);
  const mid = midsummerDay(year);
  const allSaints = allSaintsDay(year);

  const dates: Date[] = [
    new Date(year, 0, 1),            // New Year's Day
    new Date(year, 0, 6),            // Epiphany
    addDays(easter, -2),             // Good Friday
    easter,                          // Easter Sunday
    addDays(easter, 1),              // Easter Monday
    new Date(year, 4, 1),            // May Day
    addDays(easter, 39),             // Ascension Day
    new Date(year, 5, 6),            // National Day
    addDays(mid, -1),                // Midsummer Eve (Friday)
    mid,                             // Midsummer Day (Saturday)
    allSaints,                       // All Saints' Day
    new Date(year, 11, 24),          // Christmas Eve
    new Date(year, 11, 25),          // Christmas Day
    new Date(year, 11, 26),          // Boxing Day
    new Date(year, 11, 31),          // New Year's Eve
  ];

  return new Set(dates.map(toIso));
}

// Cache holiday sets for years we've already computed
const holidayCache = new Map<number, Set<string>>();

function getHolidaySet(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached !== undefined) return cached;
  const set = buildHolidaySet(year);
  holidayCache.set(year, set);
  return set;
}

/** Return true if the date is a Swedish public holiday or bank closure day. */
export function isSwedishBankHoliday(date: Date): boolean {
  return getHolidaySet(date.getFullYear()).has(toIso(date));
}

/** Return true if the date is a Swedish business day (Mon–Fri, not a holiday). */
export function isSwedishBusinessDay(date: Date): boolean {
  const dow = date.getDay();
  return dow !== 0 && dow !== 6 && !isSwedishBankHoliday(date);
}

/** Return the next Swedish business day on or after `date`. */
export function nextSwedishBusinessDay(date: Date, skipForward = 0): Date {
  let d = new Date(date);
  while (!isSwedishBusinessDay(d) || skipForward-- > 0) {
    d = addDays(d, 1);
  }
  return d;
}

/** Return all calendar dates in [start, end] (inclusive). */
export function datesBetween(start: Date, end: Date): Date[] {
  const result: Date[] = [];
  let current = new Date(start);
  while (current <= end) {
    result.push(new Date(current));
    current = addDays(current, 1);
  }
  return result;
}

/** Return all Swedish business days in [start, end] (inclusive). */
export function businessDaysBetween(start: Date, end: Date): Date[] {
  return datesBetween(start, end).filter(isSwedishBusinessDay);
}
