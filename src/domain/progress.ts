import { addDays, diffDays, parseDateKey, daysInMonth, toDateKey, type DateKey } from './dates';
import { dosesOn, isMedDueOn, punctuality, slotKey } from './schedule';
import { countsForStreak, type DoseLog, type Medication } from './types';

/**
 * Streak rules (agreed with Danish):
 * - A dose taken any time on the day it's due counts. Taking it late marks it "late"
 *   (fewer coins) but never breaks the streak.
 * - A day breaks the streak only when a scheduled dose is never taken or skipped that day.
 * - Skipping on purpose (e.g. doctor said so) is neutral.
 * - "I didn't take it" (status missed) is the honest opposite: it counts as a missed dose straight
 *   away, even today, so the day is partial (or missed) and needs a freeze or breaks the streak.
 * - Days with no scheduled doses are neutral.
 * - Every 7 perfect days in a row earns a streak freeze (max 2). A freeze is spent
 *   automatically on a missed day so one bad day doesn't wipe out a long streak.
 * - A day where every dose was skipped on purpose (a planned skip) is neutral: it neither
 *   adds to the streak nor uses a freeze.
 * - Earn it back: when a streak of 3+ days breaks with no freeze left, completing the next
 *   3 days with doses brings the old streak back (plus those 3 days).
 * - The perfect streak counts days in a row with every dose done and no freeze or earn-back used.
 */

export type DayStatus = 'none' | 'complete' | 'partial' | 'missed' | 'pending';

export interface DaySummary {
  date: DateKey;
  scheduled: number;
  taken: number;
  onTime: number;
  /** Taken, but not within the on-time window: late or early. */
  late: number;
  /** Of those, how many were taken early. Missing on summaries made before this existed. */
  early?: number;
  skipped: number;
  /** Doses marked "I didn't take it". Missing on summaries made before this existed. */
  missed?: number;
  status: DayStatus;
}

export const COINS = {
  onTime: 10,
  late: 5,
  perfectDay: 20,
  milestones: { 7: 50, 30: 150, 100: 500, 365: 1000 } as Record<number, number>,
} as const;

export const MAX_FREEZES = 2;
export const FREEZE_EVERY = 7;
/** Days in a row it takes to win back a broken streak. */
const EARN_BACK_DAYS = 3;
/** Streaks shorter than this aren't worth winning back. */
const EARN_BACK_MIN = 3;
/** Streak lengths that get a milestone moment. */
export const MILESTONES = [7, 14, 30, 60, 100, 180, 365, 500, 730, 1000];

export function summarizeDay(
  meds: Medication[],
  logs: Map<string, DoseLog>,
  date: DateKey,
  today: DateKey,
  windowMinutes: number,
): DaySummary {
  // As-needed doses are left out on purpose: they shouldn't earn coins or badges,
  // so the app never nudges anyone to take more of an as-needed medicine.
  // Supplements are left out too: they have their own ring and never touch the streak.
  // Days before a med was added don't count against you, even if its schedule
  // starts earlier (an earlier start date only anchors "every 2 weeks" style schedules).
  const doses = dosesOn(meds.filter((m) => countsForStreak(m) && trackedFrom(m) <= date), date);
  let taken = 0,
    onTime = 0,
    late = 0,
    early = 0,
    skipped = 0,
    missed = 0;
  for (const d of doses) {
    const log = logs.get(d.slot);
    if (!log) continue;
    if (log.status === 'missed') {
      missed++;
      continue;
    }
    if (log.status === 'skipped') {
      skipped++;
      continue;
    }
    taken++;
    const p = punctuality(d, new Date(log.at), windowMinutes);
    if (p === 'onTime') onTime++;
    else {
      late++;
      if (p === 'early') early++;
    }
  }
  const scheduled = doses.length;
  const resolved = taken + skipped;
  let status: DayStatus;
  if (scheduled === 0) status = 'none';
  // Every dose skipped on purpose: neutral, like a day with nothing due.
  else if (skipped === scheduled) status = 'none';
  else if (resolved === scheduled) status = 'complete';
  // A dose you said you didn't take settles the day now: there's no making it complete.
  else if (missed === 0 && diffDays(date, today) <= 0) status = 'pending';
  else status = resolved > 0 ? 'partial' : 'missed';
  return { date, scheduled, taken, onTime, late, early, skipped, missed, status };
}

/** The first day a med counts towards streaks: the later of its start date and the day it was added. */
export function trackedFrom(med: Medication): DateKey {
  const added = toDateKey(new Date(med.createdAt));
  return added > med.schedule.startDate ? added : med.schedule.startDate;
}

function dayCoins(s: DaySummary): number {
  return s.onTime * COINS.onTime + s.late * COINS.late + (s.status === 'complete' && s.taken > 0 ? COINS.perfectDay : 0);
}

export interface Progress {
  currentStreak: number;
  bestStreak: number;
  freezes: number;
  frozenDays: Set<DateKey>;
  /** Missed days whose streak was won back. */
  restoredDays: Set<DateKey>;
  /** A broken streak that can still be won back, and how many complete days that takes. */
  earnBack: { streak: number; missedOn: DateKey; daysLeft: number } | null;
  /** How many times a streak was won back. */
  earnedBack: number;
  /** Days in a row with every dose done and no freeze or earn-back used. */
  perfectStreak: number;
  bestPerfectStreak: number;
  /** Freezes spent so far. */
  freezesUsed: number;
  perfectDays: number;
  totalTaken: number;
  totalOnTime: number;
  /** Doses taken earlier than the on-time window. */
  totalEarly: number;
  perfectMonths: number;
  coinsEarned: number;
}

/** Walks every day in order (oldest first, ending today) and derives streaks and coins. */
export function computeProgress(days: DaySummary[]): Progress {
  let streak = 0,
    best = 0,
    freezes = 0,
    perfectDays = 0,
    totalTaken = 0,
    totalOnTime = 0,
    totalEarly = 0,
    coins = 0,
    perfect = 0,
    bestPerfect = 0,
    earnedBack = 0,
    freezesUsed = 0;
  const frozenDays = new Set<DateKey>();
  const restoredDays = new Set<DateKey>();
  let earnBack: { streak: number; missedOn: DateKey; done: number } | null = null;

  for (const s of days) {
    totalTaken += s.taken;
    totalOnTime += s.onTime;
    totalEarly += s.early ?? 0;
    coins += dayCoins(s);
    switch (s.status) {
      case 'none':
      case 'pending':
        break;
      case 'complete':
        streak++;
        perfectDays++;
        perfect++;
        bestPerfect = Math.max(bestPerfect, perfect);
        if (streak % FREEZE_EVERY === 0) freezes = Math.min(MAX_FREEZES, freezes + 1);
        coins += COINS.milestones[streak] ?? 0;
        if (earnBack && ++earnBack.done >= EARN_BACK_DAYS) {
          streak += earnBack.streak;
          restoredDays.add(earnBack.missedOn);
          earnedBack++;
          earnBack = null;
        }
        best = Math.max(best, streak);
        break;
      case 'partial':
      case 'missed':
        perfect = 0;
        if (freezes > 0) {
          freezes--;
          freezesUsed++;
          frozenDays.add(s.date);
        } else {
          // A second miss while winning a streak back loses it for good.
          earnBack = !earnBack && streak >= EARN_BACK_MIN ? { streak, missedOn: s.date, done: 0 } : null;
          streak = 0;
        }
        break;
    }
  }

  return {
    currentStreak: streak,
    bestStreak: best,
    freezes,
    frozenDays,
    restoredDays,
    earnBack: earnBack ? { streak: earnBack.streak, missedOn: earnBack.missedOn, daysLeft: EARN_BACK_DAYS - earnBack.done } : null,
    earnedBack,
    perfectStreak: perfect,
    bestPerfectStreak: bestPerfect,
    freezesUsed,
    perfectDays,
    totalTaken,
    totalOnTime,
    totalEarly,
    perfectMonths: countPerfectMonths(days),
    coinsEarned: coins,
  };
}

/** Finished calendar months where every day with doses was complete. */
function countPerfectMonths(days: DaySummary[]): number {
  if (days.length === 0) return 0;
  const today = days[days.length - 1].date;
  const byMonth = new Map<string, DaySummary[]>();
  for (const s of days) {
    const k = s.date.slice(0, 7);
    const arr = byMonth.get(k) ?? [];
    arr.push(s);
    byMonth.set(k, arr);
  }
  let count = 0;
  for (const [k, list] of byMonth) {
    const { y, m } = parseDateKey(`${k}-01`);
    const last = `${k}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
    if (diffDays(last, today) <= 0) continue; // month not finished
    if (list.length < daysInMonth(y, m)) continue; // tracking started mid-month
    if (list.some((s) => s.status === 'complete') && list.every((s) => s.status === 'complete' || s.status === 'none')) count++;
  }
  return count;
}

/** Consecutive due-days (back from today) on which every dose of this med was answered. */
export function medStreak(med: Medication, logs: Map<string, DoseLog>, today: DateKey): number {
  let n = 0;
  for (let i = 0; i < 800; i++) {
    const date = addDays(today, -i);
    if (diffDays(trackedFrom(med), date) < 0) break;
    if (!isMedDueOn(med, date)) continue;
    const slots = med.schedule.times.map((t) => logs.get(slotKey(med.id, date, t)));
    if (slots.every(isAnswered)) n++;
    // Today is still in progress, unless a dose was marked "I didn't take it".
    else if (i === 0 && !slots.some((l) => l?.status === 'missed')) continue;
    else break;
  }
  return n;
}

export interface BadgeDef {
  id: string;
  name: string;
  /** Ionicons glyph name */
  icon: string;
  description: string;
  earned: (s: BadgeStats) => boolean;
  /** A surprise: not listed until it's earned. */
  hidden?: boolean;
}

export type BadgeStats = Progress;

export const BADGES: BadgeDef[] = [
  { id: 'first_dose', name: 'First step', icon: 'footsteps-outline', description: 'Log your first dose', earned: (s) => s.totalTaken >= 1 },
  { id: 'perfect_day', name: 'Perfect day', icon: 'star-outline', description: 'Take every dose in a day', earned: (s) => s.perfectDays >= 1 },
  { id: 'streak_7', name: 'One week strong', icon: 'flame-outline', description: 'Reach a 7-day streak', earned: (s) => s.bestStreak >= 7 },
  { id: 'streak_30', name: 'Monthly master', icon: 'medal-outline', description: 'Reach a 30-day streak', earned: (s) => s.bestStreak >= 30 },
  { id: 'streak_100', name: 'Centurion', icon: 'trending-up-outline', description: 'Reach a 100-day streak', earned: (s) => s.bestStreak >= 100 },
  { id: 'streak_365', name: 'Year of care', icon: 'trophy-outline', description: 'Reach a 365-day streak', earned: (s) => s.bestStreak >= 365 },
  { id: 'doses_100', name: 'Hundred club', icon: 'medical-outline', description: 'Take 100 doses', earned: (s) => s.totalTaken >= 100 },
  { id: 'doses_500', name: 'Dedicated', icon: 'diamond-outline', description: 'Take 500 doses', earned: (s) => s.totalTaken >= 500 },
  { id: 'on_time_50', name: 'Like clockwork', icon: 'alarm-outline', description: 'Take 50 doses on time', earned: (s) => s.totalOnTime >= 50 },
  { id: 'earn_back', name: 'Back on track', icon: 'refresh-outline', description: 'Win back a broken streak', earned: (s) => s.earnedBack >= 1 },
  { id: 'perfect_14', name: 'Spotless', icon: 'sparkles-outline', description: 'Reach a 14-day perfect streak', earned: (s) => s.bestPerfectStreak >= 14 },
  { id: 'perfect_60', name: 'Unbroken', icon: 'ribbon-outline', description: 'Reach a 60-day perfect streak', earned: (s) => s.bestPerfectStreak >= 60 },
  { id: 'perfect_month', name: 'Flawless month', icon: 'calendar-outline', description: 'Finish a calendar month with every dose taken', earned: (s) => s.perfectMonths >= 1 },
  {
    id: 'early_bird',
    name: 'Early bird',
    icon: 'sunny-outline',
    description: 'Took a dose well ahead of its time',
    earned: (s) => s.totalEarly >= 1,
    hidden: true,
  },
];

/** Share of scheduled doses answered (taken or skipped) across these days, or null when none were due. */
export function adherence(days: DaySummary[]): number | null {
  let due = 0,
    done = 0;
  for (const s of days) {
    due += s.scheduled;
    done += s.taken + s.skipped;
  }
  return due ? done / due : null;
}

export type DayMark = 'taken' | 'partial' | 'missed' | 'pending' | 'off';

/**
 * One mark per day for a single med over the last `days` days, oldest first:
 * taken (every dose answered), partial, missed, pending (today, not done yet) or off (not due).
 */
export function medDays(med: Medication, logs: Map<string, DoseLog>, today: DateKey, days = 7): { date: DateKey; mark: DayMark }[] {
  const out: { date: DateKey; mark: DayMark }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    if (diffDays(trackedFrom(med), date) < 0 || !isMedDueOn(med, date) || med.schedule.times.length === 0) {
      out.push({ date, mark: 'off' });
      continue;
    }
    const slots = med.schedule.times.map((t) => logs.get(slotKey(med.id, date, t)));
    const answered = slots.filter(isAnswered).length;
    const saidMissed = slots.some((l) => l?.status === 'missed');
    const total = med.schedule.times.length;
    const mark: DayMark = answered === total ? 'taken' : date === today && !saidMissed ? 'pending' : answered > 0 ? 'partial' : 'missed';
    out.push({ date, mark });
  }
  return out;
}

/** Taken or skipped. A dose marked missed ("I didn't take it") is logged but not answered. */
export function isAnswered(log: DoseLog | undefined | null): boolean {
  return log?.status === 'taken' || log?.status === 'skipped';
}

/** A complete day with at least one dose taken (skips are fine). */
export function isFullDay(s: DaySummary | undefined): boolean {
  return !!s && s.status === 'complete' && s.taken > 0;
}

/** A gold day: every dose taken, and every one on time. A bonus marker; late doses never cost anything. */
export function isGoldDay(s: DaySummary | undefined): boolean {
  return isFullDay(s) && s!.late === 0;
}

/** The highest milestone reached by this streak that hasn't been shown yet, or null. */
export function newMilestone(streak: number, lastSeen: number): number | null {
  const hit = MILESTONES.filter((m) => m <= streak && m > lastSeen);
  return hit.length ? hit[hit.length - 1] : null;
}

export function nextMilestone(streak: number): number | null {
  return MILESTONES.find((m) => m > streak) ?? null;
}

/**
 * Consistency score, after Loop Habit Tracker's habit strength: every day with doses moves the
 * score towards that day's share of doses taken, with a half-life of about two weeks. So one bad
 * day after a good month only dents it, and it climbs back as soon as you're on track again.
 * Skipped doses and days with nothing due leave it alone. Returns 0..1, one value per day given.
 */
const CONSISTENCY_HALF_LIFE = 13;
export function consistencySeries(days: DaySummary[]): { date: DateKey; score: number }[] {
  const keep = Math.pow(0.5, 1 / CONSISTENCY_HALF_LIFE);
  let score = 0;
  const out: { date: DateKey; score: number }[] = [];
  for (const s of days) {
    const due = s.scheduled - s.skipped;
    if (s.status !== 'pending' && s.status !== 'none' && due > 0) score = score * keep + (s.taken / due) * (1 - keep);
    else if (s.status === 'pending' && due > 0 && s.taken === due) score = score * keep + (1 - keep);
    out.push({ date: s.date, score });
  }
  return out;
}

export function consistency(days: DaySummary[]): number {
  const series = consistencySeries(days);
  return series.length ? series[series.length - 1].score : 0;
}

/** The same score for one medicine, from its own due days. */
export function medConsistency(med: Medication, logs: Map<string, DoseLog>, today: DateKey, lookback = 400): number {
  const keep = Math.pow(0.5, 1 / CONSISTENCY_HALF_LIFE);
  let score = 0;
  for (let i = lookback; i >= 0; i--) {
    const date = addDays(today, -i);
    if (diffDays(trackedFrom(med), date) < 0 || !isMedDueOn(med, date)) continue;
    const slots = med.schedule.times.map((t) => logs.get(slotKey(med.id, date, t)));
    const skipped = slots.filter((l) => l?.status === 'skipped').length;
    const taken = slots.filter((l) => l?.status === 'taken').length;
    const due = slots.length - skipped;
    if (due <= 0) continue;
    if (i === 0 && taken < due) continue; // today still in progress
    score = score * keep + (taken / due) * (1 - keep);
  }
  return score;
}
