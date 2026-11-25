import { addDays, atTime, daysInMonth, toDateKey, diffDays, ordinal, parseDateKey, weekdayOf, weekdayShort, formatTime, type DateKey, type TimeOfDay } from './dates';
import { CITIES, localOffsetMinutes, prayerTimes } from './prayer';
import { setAppliesOn } from './sets';
import type { DoseLog, DoseSet, Medication, RamadanSettings, Schedule, ScheduledDose, Settings, TimeChange } from './types';

export function slotKey(medId: string, date: DateKey, time: TimeOfDay): string {
  return `${medId}|${date}|${time}`;
}

/** Whether a schedule has a dose on the given day (ignores times). */
export function isDueOn(schedule: Schedule, date: DateKey): boolean {
  const { pattern, startDate, endDate } = schedule;
  if (pattern.kind === 'asNeeded') return false;
  const since = diffDays(startDate, date);
  if (since < 0) return false;
  if (endDate && diffDays(endDate, date) > 0) return false;

  switch (pattern.kind) {
    case 'daily':
      return true;
    case 'weekdays':
      return pattern.days.includes(weekdayOf(date));
    case 'interval': {
      const step = Math.max(1, pattern.every) * (pattern.unit === 'week' ? 7 : 1);
      return since % step === 0;
    }
    case 'cycle': {
      const on = Math.max(1, pattern.onDays);
      const period = on + Math.max(0, pattern.offDays);
      return since % period < on;
    }
    case 'monthly': {
      const { y, m, d } = parseDateKey(date);
      const target = Math.min(pattern.dayOfMonth, daysInMonth(y, m));
      return d === target;
    }
  }
}

export function isPausedOn(med: Pick<Medication, 'pauses'>, date: DateKey): boolean {
  return (med.pauses ?? []).some((p) => date >= p.from && (p.to == null || date <= p.to));
}

/** Pause from `today` until resumed. Already paused: unchanged. */
export function pauseMed<M extends Pick<Medication, 'pauses'>>(med: M, today: DateKey): M {
  if (isPausedOn(med, today)) return med;
  return { ...med, pauses: [...(med.pauses ?? []), { from: today, to: null }] };
}

/** End the current pause so doses are due again from today. */
export function resumeMed<M extends Pick<Medication, 'pauses'>>(med: M, today: DateKey): M {
  const pauses = (med.pauses ?? [])
    .map((p) => (p.to == null || p.to >= today ? { ...p, to: addDays(today, -1) } : p))
    .filter((p) => p.to == null || p.to >= p.from);
  return { ...med, pauses };
}

/** Whether this med has doses on the day: its schedule, minus archived and paused days. */
export function isMedDueOn(med: Medication, date: DateKey): boolean {
  // Archived meds stop being due from the day they were archived, but stay in earlier history.
  if (med.archived && (!med.archivedAt || date >= toDateKey(new Date(med.archivedAt)))) return false;
  if (isPausedOn(med, date)) return false;
  return isDueOn(med.schedule, date);
}

// ---- time rules: things that move a dose's time on some days ----

/** The parts of Settings that move dose times. Set from the saved settings by the repo. */
export type TimeRules = Pick<Settings, 'ramadan' | 'timeChanges' | 'travelMode' | 'homeTimeZone'> & { doseSets?: DoseSet[] };

let rules: TimeRules | null = null;

export function setTimeRules(r: TimeRules | null) {
  rules = r;
}

export function getTimeRules(): TimeRules | null {
  return rules;
}

const toMin = (t: TimeOfDay) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const fromMin = (n: number): TimeOfDay => {
  const c = Math.min(Math.max(Math.round(n), 0), 23 * 60 + 59);
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`;
};

/** The schedule's own times on a day, after weekday-specific times. */
function scheduleTimesOn(s: Schedule, date: DateKey): TimeOfDay[] {
  const wd = weekdayOf(date);
  const rule = (s.dayTimes ?? []).find((r) => r.days.includes(wd) && r.times.length > 0);
  if (!rule) return s.times;
  // A rule lines up with the usual times dose by dose. If the usual times gained a
  // dose since the rule was made, that dose keeps its usual time; extras are dropped.
  // Not re-sorted: the n-th entry must stay the n-th dose (dosesOn sorts by time).
  return s.times.map((t, i) => rule.times[i] ?? t);
}

export function isRamadanOn(r: RamadanSettings | undefined | null, date: DateKey): boolean {
  return !!r && r.enabled && date >= r.from && date <= r.to;
}

/** Suhoor and iftar dose times on a day, from the set times or the city's prayer times. */
export function ramadanTimes(r: RamadanSettings, date: DateKey): { suhoor: TimeOfDay; iftar: TimeOfDay } {
  if (r.mode === 'city') {
    const city = CITIES.find((c) => c.id === r.cityId);
    const p = city ? prayerTimes(date, city, r.method, localOffsetMinutes(date)) : null;
    if (p) return { suhoor: fromMin(toMin(p.fajr) - r.suhoorBeforeFajr), iftar: fromMin(toMin(p.maghrib) + r.iftarAfterMaghrib) };
  }
  return { suhoor: r.suhoor, iftar: r.iftar };
}

/**
 * Where a med's doses go during Ramadan. One dose: morning doses at suhoor, later
 * ones at iftar. Two: iftar and suhoor. Three: iftar, halfway through the night
 * (capped before midnight) and suhoor. More: spread from iftar to just before midnight.
 */
export function ramadanMove(times: TimeOfDay[], t: { suhoor: TimeOfDay; iftar: TimeOfDay }): TimeOfDay[] {
  const n = times.length;
  if (n === 0) return times;
  const iftar = toMin(t.iftar);
  const suhoor = toMin(t.suhoor);
  const late = 23 * 60 + 30;
  if (n === 1) return [toMin(times[0]) < 12 * 60 ? t.suhoor : t.iftar];
  if (n === 2) return [t.suhoor, t.iftar];
  if (n === 3) return [t.suhoor, t.iftar, fromMin(Math.min(late, iftar + (24 * 60 - iftar + suhoor) / 2))];
  const spread = Array.from({ length: n - 1 }, (_, i) => fromMin(iftar + ((late - iftar) * i) / (n - 2)));
  return [t.suhoor, ...spread];
}

/**
 * Schedules (dose sets) move a member's dose to the schedule's time on its days. Each schedule
 * takes the member's dose nearest its time (the earlier one on a tie), and a dose is only moved
 * by one schedule: the earliest one that asks for it. Same rule Today uses to group them.
 */
export function applySets(med: Pick<Medication, 'id' | 'machine' | 'check'>, times: TimeOfDay[], date: DateKey, sets: DoseSet[] | undefined): TimeOfDay[] {
  if (!sets?.length || med.machine || med.check || times.length === 0) return times;
  const mine = sets
    .filter((s) => s.medIds.includes(med.id) && setAppliesOn(s, date))
    .sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));
  if (mine.length === 0) return times;
  const out = [...times];
  const claimed = new Set<number>();
  for (const set of mine) {
    const target = toMin(set.time);
    let best = -1;
    for (let i = 0; i < out.length; i++) {
      if (claimed.has(i)) continue;
      if (best < 0 || Math.abs(toMin(out[i]) - target) < Math.abs(toMin(out[best]) - target)) best = i;
    }
    if (best < 0) break;
    claimed.add(best);
    out[best] = set.time;
  }
  return out;
}

function applies(c: TimeChange, medId: string, date: DateKey) {
  return date >= c.from && date <= c.to && (c.medIds == null || c.medIds.includes(medId));
}

/**
 * A med's doses on a day: which usual time each one belongs to (`base`, which keeps
 * the dose's identity) and when it's due after weekday times, schedules, Ramadan and
 * temporary changes.
 */
export function timesOn(med: Medication, date: DateKey, r: TimeRules | null = rules): { base: TimeOfDay; time: TimeOfDay }[] {
  const base = med.schedule.times;
  let times = applySets(med, scheduleTimesOn(med.schedule, date), date, r?.doseSets);
  if (r && isRamadanOn(r.ramadan, date) && (r.ramadan.medIds == null || r.ramadan.medIds.includes(med.id))) {
    times = ramadanMove(times, ramadanTimes(r.ramadan, date));
  }
  for (const c of r?.timeChanges ?? []) {
    if (!applies(c, med.id, date)) continue;
    if (c.moveFrom && c.moveTo) times = times.map((t) => (t === c.moveFrom ? c.moveTo! : t));
    else if (c.shiftMinutes) times = times.map((t) => fromMin(toMin(t) + c.shiftMinutes!));
  }
  // The n-th dose of the day keeps the n-th usual time as its identity, so a log
  // stays matched to its dose even if the day's times change later.
  return times.map((time, i) => ({ base: base[i] ?? time, time }));
}

/** All scheduled doses on a day, ordered by time. Archived and paused meds are skipped. */
export function dosesOn(meds: Medication[], date: DateKey): ScheduledDose[] {
  const out: ScheduledDose[] = [];
  for (const med of meds) {
    if (!isMedDueOn(med, date)) continue;
    const seen = new Set<string>();
    for (const { base, time } of timesOn(med, date)) {
      const slot = slotKey(med.id, date, base);
      if (seen.has(slot)) continue;
      seen.add(slot);
      out.push(time === base ? { slot, medId: med.id, date, time } : { slot, medId: med.id, date, time, usualTime: base });
    }
  }
  return out.sort((a, b) => (a.time === b.time ? a.medId.localeCompare(b.medId) : a.time < b.time ? -1 : 1));
}

// ---- travel: home time zone ----

/** Offset from UTC (minutes) of a time zone at an instant, using the phone's time zone data. */
function zoneOffsetMinutes(timeZone: string, at: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
    return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
  } catch {
    return null;
  }
}

export function phoneTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/**
 * The moment a dose is due. Normally the phone's local time. With travel mode on,
 * the time is read in the home time zone, so 8:00 stays 8:00 at home while abroad.
 */
export function dueAt(date: DateKey, time: TimeOfDay, r: TimeRules | null = rules): Date {
  const local = atTime(date, time);
  if (!r?.travelMode || !r.homeTimeZone || r.homeTimeZone === phoneTimeZone()) return local;
  const { y, m, d } = parseDateKey(date);
  const [h, min] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, min);
  let off = zoneOffsetMinutes(r.homeTimeZone, new Date(wall));
  if (off == null) return local;
  // Second pass in case the offset changes between the guess and the answer (DST).
  off = zoneOffsetMinutes(r.homeTimeZone, new Date(wall - off * 60000)) ?? off;
  return new Date(wall - off * 60000);
}

/** Doses grouped by time (one reminder per time slot). */
export function groupByTime(doses: ScheduledDose[]): { time: TimeOfDay; doses: ScheduledDose[] }[] {
  const groups = new Map<TimeOfDay, ScheduledDose[]>();
  for (const d of doses) {
    const g = groups.get(d.time) ?? [];
    g.push(d);
    groups.set(d.time, g);
  }
  return [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([time, ds]) => ({ time, doses: ds }));
}

export type Punctuality = 'onTime' | 'late' | 'early';

/**
 * Within the on-time window either side of the dose time is on time. Taken earlier than
 * that is early, later is late. Early and late both still count as taken for the streak;
 * neither counts as on time, so neither makes a gold day.
 */
export function punctuality(dose: { date: DateKey; time: TimeOfDay }, takenAt: Date, windowMinutes: number): Punctuality {
  const due = dueAt(dose.date, dose.time).getTime();
  const diff = takenAt.getTime() - due;
  if (Math.abs(diff) <= windowMinutes * 60_000) return 'onTime';
  return diff < 0 ? 'early' : 'late';
}

export function indexLogs(logs: DoseLog[]): Map<string, DoseLog> {
  return new Map(logs.map((l) => [l.slot, l]));
}

/** Human summary such as "Every 2 weeks · 8:00 AM, 8:00 PM". */
export function describeSchedule(s: Schedule): string {
  const p = s.pattern;
  let when: string;
  switch (p.kind) {
    case 'daily':
      when = 'Every day';
      break;
    case 'weekdays':
      when = p.days.length === 7 ? 'Every day' : [...p.days].sort().map(weekdayShort).join(', ');
      break;
    case 'interval':
      when =
        p.every === 1
          ? p.unit === 'week'
            ? `Weekly (${weekdayShort(weekdayOf(s.startDate))})`
            : 'Every day'
          : `Every ${p.every} ${p.unit}s`;
      break;
    case 'cycle':
      when = `${p.onDays} days on, ${p.offDays} off`;
      break;
    case 'monthly':
      when = `Monthly on the ${ordinal(p.dayOfMonth)}`;
      break;
    case 'asNeeded':
      return 'As needed';
  }
  const times = s.times.map(formatTime).join(', ');
  return times ? `${when} · ${times}` : when;
}

/** The next day (from `from`, inclusive) a dose is due, searching up to a year ahead. */
export function nextDueDate(s: Schedule, from: DateKey): DateKey | null {
  for (let i = 0; i <= 366; i++) {
    const key = addDays(from, i);
    if (isDueOn(s, key)) return key;
  }
  return null;
}
