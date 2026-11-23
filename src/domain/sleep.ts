import { addDays, eachDay, timeFromDate, type DateKey } from './dates';
import type { HealthDay } from './health';
import { averageClock, clockSpread, nightHours } from './machines';
import type { DoseLog, MachineNight } from './types';

// Sleep next to CPAP use. A CPAP night belongs to the day it started (the check-in day);
// Health Connect counts a night on the day you woke up, so night D lines up with day D + 1.

export interface SleepNight {
  /** The evening the night started. */
  date: DateKey;
  /** CPAP: hours used, and when the mask went on and came off. */
  cpapHours: number | null;
  start: string | null;
  end: string | null;
  /** From Health Connect (Samsung Health), for the morning after. */
  sleepMin: number | null;
  bedtime: string | null;
  wake: string | null;
  /** Asleep / in bed, 0 to 1. */
  efficiency: number | null;
  /** Deep + REM as a share of time asleep, 0 to 1. */
  deepRem: number | null;
}

export interface SleepTrend {
  nights: SleepNight[];
  cpapNights: number;
  /** Nights with 4 hours or more (the usual CPAP mark). */
  fourHourNights: number;
  avgCpapHours: number | null;
  avgStart: string | null;
  avgEnd: string | null;
  /** How much mask-on time moves about from night to night, in minutes. */
  startSpread: number | null;
  avgSleepMin: number | null;
  avgEfficiency: number | null;
  avgDeepRem: number | null;
  /** Share of the night's sleep that had the CPAP on, 0 to 1. */
  coverage: number | null;
  /** Sleep on nights with 4+ hours of CPAP against nights with less (or none). Needs 3 of each. */
  compare: { withMin: number; withoutMin: number; withQuality: number | null; withoutQuality: number | null } | null;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

/**
 * Lines up CPAP nights and Health Connect sleep for the nights that started from `from` to `to`.
 * `checkins` are the machine's taken logs: when a night has no mask-on time, the check-in time is used.
 */
export function sleepTrend(opts: { from: DateKey; to: DateKey; nights: MachineNight[]; checkins: DoseLog[]; health: HealthDay[] }): SleepTrend {
  const byNight = new Map(opts.nights.map((n) => [n.date, n]));
  const checkin = new Map<DateKey, DoseLog>();
  for (const l of opts.checkins) if (l.status === 'taken' && !checkin.has(l.date)) checkin.set(l.date, l);
  const health = new Map(opts.health.map((h) => [h.date, h]));

  const nights: SleepNight[] = eachDay(opts.from, opts.to).map((date) => {
    const n = byNight.get(date);
    const log = checkin.get(date);
    const h = health.get(addDays(date, 1));
    const start = n?.start ?? (log ? timeFromDate(new Date(log.at)) : null);
    const end = n?.end ?? null;
    const used = !!log || !!n;
    const cpapHours = used ? nightHours(n ? { ...n, start } : null) : null;
    const asleep = h?.sleepMin && h.sleepMin > 0 ? h.sleepMin : null;
    const staged = (h?.deepMin ?? 0) + (h?.remMin ?? 0) + (h?.lightMin ?? 0);
    return {
      date,
      cpapHours,
      start: used ? start : null,
      end: used ? end : null,
      sleepMin: asleep,
      bedtime: h?.bedtime ?? null,
      wake: h?.wake ?? null,
      efficiency: asleep && h?.inBedMin && h.inBedMin > 0 ? Math.min(1, asleep / h.inBedMin) : null,
      deepRem: staged > 0 ? ((h?.deepMin ?? 0) + (h?.remMin ?? 0)) / staged : null,
    };
  });

  const withHours = nights.filter((n) => n.cpapHours != null);
  const starts = nights.map((n) => n.start).filter((t): t is string => !!t);
  const ends = nights.map((n) => n.end).filter((t): t is string => !!t);
  const slept = nights.filter((n) => n.sleepMin != null);
  const both = nights.filter((n) => n.sleepMin != null && n.cpapHours != null);
  const quality = (n: SleepNight) => n.efficiency ?? n.deepRem;

  let compare: SleepTrend['compare'] = null;
  const good = slept.filter((n) => (n.cpapHours ?? 0) >= 4);
  const poor = slept.filter((n) => (n.cpapHours ?? 0) < 4);
  if (good.length >= 3 && poor.length >= 3) {
    const q = (xs: SleepNight[]) => avg(xs.map(quality).filter((x): x is number => x != null));
    compare = {
      withMin: Math.round(avg(good.map((n) => n.sleepMin!))!),
      withoutMin: Math.round(avg(poor.map((n) => n.sleepMin!))!),
      withQuality: q(good),
      withoutQuality: q(poor),
    };
  }

  return {
    nights,
    cpapNights: nights.filter((n) => n.start != null || n.cpapHours != null).length,
    fourHourNights: withHours.filter((n) => n.cpapHours! >= 4).length,
    avgCpapHours: round1(avg(withHours.map((n) => n.cpapHours!))),
    avgStart: averageClock(starts),
    avgEnd: averageClock(ends),
    startSpread: clockSpread(starts),
    avgSleepMin: slept.length ? Math.round(avg(slept.map((n) => n.sleepMin!))!) : null,
    avgEfficiency: avg(nights.map((n) => n.efficiency).filter((x): x is number => x != null)),
    avgDeepRem: avg(nights.map((n) => n.deepRem).filter((x): x is number => x != null)),
    coverage: both.length ? Math.min(1, avg(both.map((n) => Math.min(1, (n.cpapHours! * 60) / n.sleepMin!)))!) : null,
    compare,
  };
}
