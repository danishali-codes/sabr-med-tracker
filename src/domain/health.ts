import { addDays, type DateKey } from './dates';
import type { Pattern } from './insights';
import type { DaySummary } from './progress';
import type { DayNote } from './types';

// Health data read from Health Connect (where Samsung Health, Google Fit and most watches
// share it). Read on the phone, used on the phone, never stored by Sabr or sent anywhere.

/** One day of health data. Any field can be missing when nothing was recorded. */
export interface HealthDay {
  date: DateKey;
  steps?: number;
  /** Minutes asleep in the night that ended on this day (awake time left out). */
  sleepMin?: number;
  /** The main night's bedtime and wake time ("HH:MM", phone time). */
  bedtime?: string;
  wake?: string;
  /** Minutes in bed for that night's main (longest) session, awake time included... */
  inBedMin?: number;
  /** ...and minutes asleep in that same session (naps left out). */
  mainSleepMin?: number;
  /** Minutes in each sleep stage, when the watch tracks stages. */
  deepMin?: number;
  remMin?: number;
  lightMin?: number;
  awakeMin?: number;
  /** Average, lowest and highest heart rate over the day, in beats per minute. */
  hrAvg?: number;
  hrMin?: number;
  hrMax?: number;
  /** Resting heart rate, when the watch measured it. */
  restingHr?: number;
}

/** What Sabr can ask Health Connect for. All read-only. */
export type HealthKind = 'steps' | 'sleep' | 'heartRate' | 'restingHeartRate';

export const HEALTH_KINDS: { kind: HealthKind; label: string; hint: string }[] = [
  { kind: 'steps', label: 'Steps', hint: 'Your daily step count' },
  { kind: 'sleep', label: 'Sleep', hint: 'How long you slept each night' },
  { kind: 'heartRate', label: 'Heart rate', hint: 'Average, lowest and highest each day' },
  { kind: 'restingHeartRate', label: 'Resting heart rate', hint: 'Measured by your watch while you rest' },
];

export function formatSleep(min: number | undefined): string {
  if (min == null || min <= 0) return '-';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : h === 0 ? `${m}m` : `${h}h ${m}m`;
}

export function formatSteps(n: number | undefined): string {
  if (n == null) return '-';
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n).toLocaleString('en-US');
}

/** Plain-language minutes, e.g. "50 minutes" or "1 hour 10 minutes". */
function minutesWord(min: number): string {
  const m = Math.round(min / 5) * 5;
  if (m < 60) return `${m} minutes`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h} ${h === 1 ? 'hour' : 'hours'}${r ? ` ${r} minutes` : ''}`;
}

const MIN_DAYS = 4;
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const moodWords = ['awful', 'bad', 'okay', 'good', 'great'];
const moodWord = (v: number) => `${moodWords[Math.max(0, Math.min(4, Math.round(v) - 1))]} (${v.toFixed(1)})`;

/**
 * Lines up health data with doses and mood. Only reports a pattern when both sides have a
 * few days behind them and the difference is big enough to notice. These are coincidences in
 * your own data, not medical findings.
 */
export function findHealthPatterns(opts: { summaries: DaySummary[]; notes: DayNote[]; health: HealthDay[] }): Pattern[] {
  const { summaries, notes, health } = opts;
  const byDate = new Map(summaries.map((s) => [s.date, s]));
  const hByDate = new Map(health.map((h) => [h.date, h]));
  const out: Pattern[] = [];

  const split = (pick: (h: HealthDay) => number | undefined) => {
    const done: number[] = [];
    const missed: number[] = [];
    for (const h of health) {
      const v = pick(h);
      const s = byDate.get(h.date);
      if (v == null || !s || s.scheduled === 0) continue;
      if (s.status === 'complete') done.push(v);
      else if (s.status === 'partial' || s.status === 'missed') missed.push(v);
    }
    return { done, missed };
  };

  // Sleep the night before days with a missed dose.
  {
    const { done, missed } = split((h) => (h.sleepMin && h.sleepMin > 60 ? h.sleepMin : undefined));
    if (done.length >= MIN_DAYS && missed.length >= MIN_DAYS) {
      const diff = avg(done) - avg(missed);
      if (Math.abs(diff) >= 30) {
        out.push({
          id: 'health-sleep-missed',
          title: diff > 0 ? 'You miss doses more after a short night' : 'You miss doses more after a long sleep',
          detail: `Before days with a missed dose you slept ${formatSleep(avg(missed))} on average, against ${formatSleep(avg(done))} before days you took everything. That's about ${minutesWord(Math.abs(diff))} ${diff > 0 ? 'less' : 'more'}.`,
          weight: Math.abs(diff) / 60,
        });
      }
    }
  }

  // Steps on days with a missed dose (busy days, or slow days).
  {
    const { done, missed } = split((h) => (h.steps && h.steps > 100 ? h.steps : undefined));
    if (done.length >= MIN_DAYS && missed.length >= MIN_DAYS) {
      const a = avg(done);
      const b = avg(missed);
      const rel = (b - a) / a;
      if (Math.abs(rel) >= 0.2) {
        out.push({
          id: 'health-steps-missed',
          title: rel > 0 ? 'Doses get missed more on busy days' : 'Doses get missed more on quiet days',
          detail: `You walked about ${formatSteps(b)} steps on days with a missed dose and ${formatSteps(a)} on days you took everything (${missed.length} and ${done.length} days).`,
          weight: Math.abs(rel),
        });
      }
    }
  }

  // Resting heart rate on days doses were taken against missed.
  {
    const { done, missed } = split((h) => h.restingHr);
    if (done.length >= MIN_DAYS && missed.length >= MIN_DAYS) {
      const diff = avg(missed) - avg(done);
      if (Math.abs(diff) >= 3) {
        out.push({
          id: 'health-resting-missed',
          title: `Your resting heart rate is ${diff > 0 ? 'higher' : 'lower'} on days with a missed dose`,
          detail: `${Math.round(avg(missed))} bpm on days with a missed dose against ${Math.round(avg(done))} bpm on days you took everything (${missed.length} and ${done.length} days).`,
          weight: Math.abs(diff) / 5,
        });
      }
    }
  }

  // Mood after a good night against a short one.
  {
    const rested: number[] = [];
    const short: number[] = [];
    for (const n of notes) {
      const sl = hByDate.get(n.date)?.sleepMin;
      if (n.mood == null || sl == null || sl < 60) continue;
      if (sl >= 7 * 60) rested.push(n.mood);
      else if (sl < 6 * 60) short.push(n.mood);
    }
    if (rested.length >= MIN_DAYS && short.length >= MIN_DAYS) {
      const diff = avg(rested) - avg(short);
      if (Math.abs(diff) >= 0.4) {
        out.push({
          id: 'health-sleep-mood',
          title: diff > 0 ? 'Your mood is better after 7 hours of sleep' : 'Your mood is lower after 7 hours of sleep',
          detail: `Average mood ${moodWord(avg(rested))} after 7 hours or more (${rested.length} days) against ${moodWord(avg(short))} after under 6 hours (${short.length} days).`,
          weight: Math.abs(diff),
        });
      }
    }
  }

  // Mood on active days against quiet ones (top and bottom third of your own step counts).
  {
    const pairs = notes
      .map((n) => ({ mood: n.mood, steps: hByDate.get(n.date)?.steps }))
      .filter((p): p is { mood: 1 | 2 | 3 | 4 | 5; steps: number } => p.mood != null && p.steps != null && p.steps > 100)
      .sort((a, b) => a.steps - b.steps);
    const third = Math.floor(pairs.length / 3);
    if (third >= MIN_DAYS) {
      const quiet = pairs.slice(0, third);
      const active = pairs.slice(-third);
      const diff = avg(active.map((p) => p.mood)) - avg(quiet.map((p) => p.mood));
      if (Math.abs(diff) >= 0.4) {
        out.push({
          id: 'health-steps-mood',
          title: diff > 0 ? 'Your mood is better on active days' : 'Your mood is better on quiet days',
          detail: `Average mood ${moodWord(avg(active.map((p) => p.mood)))} on your most active days (about ${formatSteps(avg(active.map((p) => p.steps)))} steps) against ${moodWord(avg(quiet.map((p) => p.mood)))} on your quietest (about ${formatSteps(avg(quiet.map((p) => p.steps)))}).`,
          weight: Math.abs(diff),
        });
      }
    }
  }

  return out.sort((a, b) => b.weight - a.weight);
}

/** The last `days` days ending today, newest first, with health, doses and mood side by side. */
export function healthTable(opts: {
  today: DateKey;
  days: number;
  health: HealthDay[];
  summaries: DaySummary[];
  notes: DayNote[];
}): { date: DateKey; health?: HealthDay; summary?: DaySummary; mood: number | null }[] {
  const h = new Map(opts.health.map((x) => [x.date, x]));
  const s = new Map(opts.summaries.map((x) => [x.date, x]));
  const n = new Map(opts.notes.map((x) => [x.date, x]));
  return Array.from({ length: opts.days }, (_, i) => {
    const date = addDays(opts.today, -i);
    return { date, health: h.get(date), summary: s.get(date), mood: n.get(date)?.mood ?? null };
  });
}
