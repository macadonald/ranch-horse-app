export type HolidayEntry = { date: string; name: string }
export type SchoolBreak  = { label: string; approx: boolean }

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// nth weekday of a month (1-based month, 0=Sun … 6=Sat, n=1,2,3,4)
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const d = new Date(year, month - 1, 1)
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1)
  d.setDate(d.getDate() + (n - 1) * 7)
  return d
}

// Last occurrence of a weekday in a month
function lastWeekday(year: number, month: number, weekday: number): Date {
  const d = new Date(year, month, 0) // last day of month
  while (d.getDay() !== weekday) d.setDate(d.getDate() - 1)
  return d
}

// Easter — Anonymous Gregorian algorithm
function easter(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day   = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

export function holidaysForYear(year: number): HolidayEntry[] {
  const add = (d: Date, name: string): HolidayEntry => ({ date: toYMD(d), name })
  return [
    add(new Date(year, 0, 1),              "New Year's Day"),
    add(nthWeekday(year, 1, 1, 3),         'MLK Day'),
    add(nthWeekday(year, 2, 1, 3),         "Presidents' Day"),
    add(easter(year),                       'Easter'),
    add(lastWeekday(year, 5, 1),           'Memorial Day'),
    add(new Date(year, 5, 19),             'Juneteenth'),
    add(new Date(year, 6, 4),              'July 4th'),
    add(nthWeekday(year, 9, 1, 1),         'Labor Day'),
    add(nthWeekday(year, 10, 1, 2),        'Columbus Day'),
    add(new Date(year, 10, 11),            'Veterans Day'),
    add(nthWeekday(year, 11, 4, 4),        'Thanksgiving'),
    add(new Date(year, 11, 24),            'Christmas Eve'),
    add(new Date(year, 11, 25),            'Christmas'),
    add(new Date(year, 11, 31),            "New Year's Eve"),
  ].sort((a, b) => a.date.localeCompare(b.date))
}

export function holidaysInRange(start: string, end: string): HolidayEntry[] {
  const sy = parseInt(start.slice(0, 4))
  const ey = parseInt(end.slice(0, 4))
  const all: HolidayEntry[] = []
  for (let y = sy; y <= ey; y++) all.push(...holidaysForYear(y))
  return all.filter(h => h.date >= start && h.date <= end)
}

export function schoolBreakFor(date: string): SchoolBreak | null {
  const mmdd = date.slice(5)
  const year = parseInt(date.slice(0, 4))

  // Summer: May 25 – Aug 10
  if (mmdd >= '05-25' && mmdd <= '08-10') return { label: 'Summer break', approx: true }

  // Spring break season: Mar 7 – Mar 31
  if (mmdd >= '03-07' && mmdd <= '03-31') return { label: 'Spring break season', approx: true }

  // Winter break: Dec 20 – Jan 3 (crosses year boundary)
  if (mmdd >= '12-20') return { label: 'Winter break', approx: true }
  if (mmdd <= '01-03') return { label: 'Winter break', approx: true }

  // Thanksgiving week: Sat before → Sun after Thanksgiving
  const thanksgiving = nthWeekday(year, 11, 4, 4)
  const tkStart = new Date(thanksgiving); tkStart.setDate(tkStart.getDate() - 5)
  const tkEnd   = new Date(thanksgiving); tkEnd.setDate(tkEnd.getDate() + 3)
  if (date >= toYMD(tkStart) && date <= toYMD(tkEnd)) return { label: 'Thanksgiving break', approx: true }

  return null
}
