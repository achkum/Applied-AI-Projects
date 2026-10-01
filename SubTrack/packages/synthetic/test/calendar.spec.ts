import { describe, it, expect } from 'vitest';
import {
  easterSunday,
  addDays,
  isSwedishBankHoliday,
  isSwedishBusinessDay,
  nextSwedishBusinessDay,
  businessDaysBetween,
} from '../src/index.js';

describe('easterSunday()', () => {
  // Known Easter dates for verification
  const knownEasters: [number, string][] = [
    [2020, '2020-04-12'],
    [2021, '2021-04-04'],
    [2022, '2022-04-17'],
    [2023, '2023-04-09'],
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
  ];

  for (const [year, expected] of knownEasters) {
    it(`Easter ${year} = ${expected}`, () => {
      const date = easterSunday(year);
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      expect(iso).toBe(expected);
    });
  }
});

describe('isSwedishBankHoliday()', () => {
  it('New Year\'s Day is a holiday', () => {
    expect(isSwedishBankHoliday(new Date(2025, 0, 1))).toBe(true);
  });

  it('Epiphany (Jan 6) is a holiday', () => {
    expect(isSwedishBankHoliday(new Date(2025, 0, 6))).toBe(true);
  });

  it('May Day is a holiday', () => {
    expect(isSwedishBankHoliday(new Date(2025, 4, 1))).toBe(true);
  });

  it('National Day (Jun 6) is a holiday', () => {
    expect(isSwedishBankHoliday(new Date(2025, 5, 6))).toBe(true);
  });

  it('Christmas Day is a holiday', () => {
    expect(isSwedishBankHoliday(new Date(2025, 11, 25))).toBe(true);
  });

  it('Christmas Eve is a bank holiday', () => {
    expect(isSwedishBankHoliday(new Date(2025, 11, 24))).toBe(true);
  });

  it('New Year\'s Eve is a bank holiday', () => {
    expect(isSwedishBankHoliday(new Date(2025, 11, 31))).toBe(true);
  });

  it('Good Friday 2025 (Apr 18) is a holiday', () => {
    expect(isSwedishBankHoliday(new Date(2025, 3, 18))).toBe(true);
  });

  it('Easter Sunday 2025 (Apr 20) is a holiday', () => {
    expect(isSwedishBankHoliday(new Date(2025, 3, 20))).toBe(true);
  });

  it('Easter Monday 2025 (Apr 21) is a holiday', () => {
    expect(isSwedishBankHoliday(new Date(2025, 3, 21))).toBe(true);
  });

  it('a normal weekday (Jan 8, 2025) is NOT a holiday', () => {
    expect(isSwedishBankHoliday(new Date(2025, 0, 8))).toBe(false);
  });
});

describe('isSwedishBusinessDay()', () => {
  it('a Tuesday mid-January is a business day', () => {
    expect(isSwedishBusinessDay(new Date(2025, 0, 14))).toBe(true);
  });

  it('Saturday is not a business day', () => {
    expect(isSwedishBusinessDay(new Date(2025, 0, 11))).toBe(false);
  });

  it('Sunday is not a business day', () => {
    expect(isSwedishBusinessDay(new Date(2025, 0, 12))).toBe(false);
  });

  it('May Day (Monday 2025) is not a business day', () => {
    // May 1, 2025 is a Thursday — still a holiday
    expect(isSwedishBusinessDay(new Date(2025, 4, 1))).toBe(false);
  });
});

describe('nextSwedishBusinessDay()', () => {
  it('Thursday → Thursday if it is a business day', () => {
    const thu = new Date(2025, 0, 9); // Jan 9, 2025 — Thursday
    const result = nextSwedishBusinessDay(thu);
    expect(result.toDateString()).toBe(thu.toDateString());
  });

  it('Saturday → following Monday', () => {
    const sat = new Date(2025, 0, 11);
    const result = nextSwedishBusinessDay(sat);
    expect(result.getDay()).toBe(1); // Monday
  });

  it('Christmas Eve 2025 → Dec 29 (first business day after holiday block)', () => {
    const xmasEve = new Date(2025, 11, 24);
    const result = nextSwedishBusinessDay(xmasEve);
    // Dec 24,25,26 holidays; Dec 27 Sat, Dec 28 Sun, Dec 29 Mon
    expect(result.getDate()).toBe(29);
    expect(result.getMonth()).toBe(11);
  });
});

describe('businessDaysBetween()', () => {
  it('count business days in a normal week', () => {
    const mon = new Date(2025, 0, 13); // Jan 13 — Monday
    const fri = new Date(2025, 0, 17); // Jan 17 — Friday
    const days = businessDaysBetween(mon, fri);
    expect(days.length).toBe(5);
  });

  it('excludes weekends', () => {
    const fri = new Date(2025, 0, 17);
    const mon = new Date(2025, 0, 20);
    const days = businessDaysBetween(fri, mon);
    // Fri + Mon = 2 (Sat and Sun excluded)
    expect(days.length).toBe(2);
  });
});
