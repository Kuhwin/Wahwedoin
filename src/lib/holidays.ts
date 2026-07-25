export interface Holiday {
  name: string;
  month: number;
  day: number;
}

export const BARBADOS_HOLIDAYS: Holiday[] = [
  { name: "New Year's Day", month: 1, day: 1 },
  { name: "Errol Barrow Day", month: 1, day: 21 },
  { name: "Good Friday", month: 0, day: 0 }, // computed
  { name: "Easter Monday", month: 0, day: 0 }, // computed
  { name: "National Heroes Day", month: 4, day: 28 },
  { name: "Emancipation Day", month: 7, day: 1 },
  { name: "Kadooment Day", month: 7, day: 2 },
  { name: "Independence Day", month: 10, day: 30 },
  { name: "BCA National Day", month: 11, day: 1 },
  { name: "Christmas Day", month: 11, day: 25 },
  { name: "Boxing Day", month: 11, day: 26 },
];

function easterSunday(year: number): Date {
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
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

export function getHolidaysForYear(year: number) {
  const easter = easterSunday(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  const easterMonday = new Date(easter);
  easterMonday.setDate(easter.getDate() + 1);

  const computed = [
    { name: "Good Friday", month: goodFriday.getMonth(), day: goodFriday.getDate() },
    { name: "Easter Monday", month: easterMonday.getMonth(), day: easterMonday.getDate() },
  ];

  const all = [...BARBADOS_HOLIDAYS.filter((h) => h.day !== 0), ...computed];
  return all.map((h) => ({
    ...h,
    dateStr: `${year}-${String(h.month + 1).padStart(2, "0")}-${String(h.day).padStart(2, "0")}`,
  }));
}
