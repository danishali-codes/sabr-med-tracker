import { parseTime, weekdayOf, weekdayShort, type DateKey, type TimeOfDay } from './dates';
import type { DoseLog, DoseSet, Medication, ScheduledDose } from './types';

/** Whether a saved set is used on this day (no days picked = every day). */
export function setAppliesOn(set: Pick<DoseSet, 'days'>, date: DateKey): boolean {
  return set.days.length === 0 || set.days.includes(weekdayOf(date));
}

const minutes = (t: TimeOfDay) => {
  const { h, min } = parseTime(t);
  return h * 60 + min;
};

export interface SetToday {
  set: DoseSet;
  /** The member doses this set takes care of today, one per medicine, in time order. */
  doses: ScheduledDose[];
  /** Members that have no dose today. */
  notDue: string[];
}

/**
 * Today's sets and the doses each one holds. A member gives the set its dose nearest the
 * set's time (the earlier one on a tie); a dose is only ever in one set, the earliest set
 * that asks for it. Sets with no doses today are left out.
 */
export function setsOn(sets: DoseSet[], doses: ScheduledDose[], date: DateKey): SetToday[] {
  const claimed = new Set<string>();
  const out: SetToday[] = [];
  const sorted = [...sets].filter((s) => setAppliesOn(s, date)).sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));
  for (const set of sorted) {
    const mine: ScheduledDose[] = [];
    const notDue: string[] = [];
    for (const medId of set.medIds) {
      const options = doses.filter((d) => d.medId === medId && d.date === date && !claimed.has(d.slot));
      if (options.length === 0) {
        notDue.push(medId);
        continue;
      }
      const target = minutes(set.time);
      const best = options.reduce((a, b) => (Math.abs(minutes(b.time) - target) < Math.abs(minutes(a.time) - target) ? b : a));
      claimed.add(best.slot);
      mine.push(best);
    }
    if (mine.length) out.push({ set, doses: mine.sort((a, b) => a.time.localeCompare(b.time)), notDue });
  }
  return out;
}

/** Doses in a set that are still open. */
export function openIn(doses: ScheduledDose[], logs: Map<string, DoseLog>): ScheduledDose[] {
  return doses.filter((d) => !logs.has(d.slot));
}

/** "Every day", "Weekdays", "Mon, Tue, Wed" */
export function describeDays(days: number[]): string {
  const ds = [...new Set(days)].sort((a, b) => a - b);
  if (ds.length === 0 || ds.length === 7) return 'Every day';
  if (ds.join() === '1,2,3,4,5') return 'Mon to Fri';
  if (ds.join() === '0,6') return 'Weekends';
  // Runs of three or more days read as a range: Mon to Thu.
  if (ds.length >= 3 && ds[ds.length - 1] - ds[0] === ds.length - 1) return `${weekdayShort(ds[0])} to ${weekdayShort(ds[ds.length - 1])}`;
  return ds.map(weekdayShort).join(', ');
}

/** Members that still exist and aren't archived, as-needed, machines or checks. */
export function setMembers(set: Pick<DoseSet, 'medIds'>, meds: Medication[]): Medication[] {
  return set.medIds.map((id) => meds.find((m) => m.id === id)).filter((m): m is Medication => !!m && canBeInSet(m));
}

export function canBeInSet(m: Medication): boolean {
  return !m.archived && m.schedule.pattern.kind !== 'asNeeded' && !m.machine && !m.check;
}

/**
 * When a dose was taken, from a time picked afterwards. The day is the dose's own day, but a
 * time after midnight for a late evening dose (e.g. 00:30 for a 22:00 dose) means the next
 * morning. Returns null when that moment is still in the future.
 */
export function takenAtFor(dose: { date: DateKey; time: TimeOfDay }, picked: TimeOfDay, now: Date): Date | null {
  const [y, m, d] = dose.date.split('-').map(Number);
  const { h, min } = parseTime(picked);
  let at = new Date(y, m - 1, d, h, min, 0, 0);
  // A dose due late in the evening, said to be taken in the small hours, was taken the next day.
  if (minutes(dose.time) >= 18 * 60 && minutes(picked) < 6 * 60) at = new Date(y, m - 1, d + 1, h, min, 0, 0);
  if (at.getTime() > now.getTime() + 60_000) return null;
  return at;
}
