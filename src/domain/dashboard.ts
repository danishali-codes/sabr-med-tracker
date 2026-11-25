import { formatSugar, type SugarUnit } from './checks';
import { addDays, diffDays, eachDay, monthName, parseDateKey, type DateKey } from './dates';
import type { FeatureId } from './features';
import { formatSleep, formatSteps, type HealthDay } from './health';
import type { DaySummary } from './progress';
import type { DayNote, Reading } from './types';

// The Health tab: a dashboard of cards, one per kind of health data, over a date or a range
// of dates. Everything here is worked out on the phone from data that is already there.

export type MetricId = 'meds' | 'steps' | 'sleep' | 'heart' | 'mood' | 'sugar' | 'bp' | 'cpap';

/** How a range of values is boiled down to one. */
export type StatKind = 'avg' | 'median' | 'min' | 'max' | 'range' | 'total';

export type RangePreset = 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'month' | 'custom';

export interface DashboardSettings {
  /** The cards on the Health tab, in order. Cards of features that are off are skipped. */
  cards: MetricId[];
  range: RangePreset;
  /** Only used with the custom range. */
  from: DateKey | null;
  to: DateKey | null;
  stat: StatKind;
}

export type ColorKey = 'primary' | 'good' | 'bad' | 'warn' | 'ice' | 'flame';

export interface MetricInfo {
  id: MetricId;
  title: string;
  /** Ionicons name. */
  icon: string;
  color: ColorKey;
  /** Needs this feature on. Medicines are always there. */
  feature: FeatureId | null;
  /** Comes from Health Connect, so it also needs "Read health data" on. */
  fromHealth: boolean;
  /** Which ways of summing up make sense for it. */
  stats: StatKind[];
  /** One line for the "Add a card" list. */
  hint: string;
}

const COMMON: StatKind[] = ['avg', 'median', 'min', 'max', 'range'];

export const METRICS: MetricInfo[] = [
  { id: 'meds', title: 'Medicines', icon: 'medkit', color: 'primary', feature: null, fromHealth: false, stats: [...COMMON, 'total'], hint: 'How many doses you took' },
  { id: 'steps', title: 'Steps', icon: 'footsteps', color: 'good', feature: 'healthData', fromHealth: true, stats: [...COMMON, 'total'], hint: 'From Samsung Health' },
  { id: 'sleep', title: 'Sleep', icon: 'moon', color: 'primary', feature: 'healthData', fromHealth: true, stats: [...COMMON, 'total'], hint: 'Time asleep each night' },
  { id: 'heart', title: 'Heart rate', icon: 'heart', color: 'bad', feature: 'healthData', fromHealth: true, stats: COMMON, hint: 'Resting heart rate, or the day’s average' },
  { id: 'mood', title: 'Mood', icon: 'happy', color: 'warn', feature: 'mood', fromHealth: false, stats: COMMON, hint: 'How your days felt' },
  { id: 'sugar', title: 'Blood sugar', icon: 'water', color: 'ice', feature: 'sugarChecks', fromHealth: false, stats: COMMON, hint: 'Your sugar readings' },
  { id: 'bp', title: 'Blood pressure', icon: 'speedometer', color: 'flame', feature: 'bpChecks', fromHealth: false, stats: COMMON, hint: 'Your blood pressure readings' },
  { id: 'cpap', title: 'CPAP', icon: 'pulse', color: 'primary', feature: 'machines', fromHealth: false, stats: [...COMMON, 'total'], hint: 'Hours on the machine each night' },
];

export const DEFAULT_DASHBOARD: DashboardSettings = {
  cards: METRICS.map((m) => m.id),
  range: '7d',
  from: null,
  to: null,
  stat: 'avg',
};

export const STATS: { value: StatKind; label: string }[] = [
  { value: 'avg', label: 'Average' },
  { value: 'median', label: 'Median' },
  { value: 'min', label: 'Lowest' },
  { value: 'max', label: 'Highest' },
  { value: 'range', label: 'Lowest to highest' },
  { value: 'total', label: 'Total' },
];

export const RANGES: { value: RangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Pick dates' },
];

export const metricInfo = (id: MetricId): MetricInfo => METRICS.find((m) => m.id === id)!;
export const statLabel = (s: StatKind): string => STATS.find((x) => x.value === s)?.label ?? 'Average';

/** Saved dashboard settings, tidied: unknown or repeated cards dropped, a bad stat or range reset. */
export function cleanDashboard(saved: Partial<DashboardSettings> | undefined | null): DashboardSettings {
  const d = { ...DEFAULT_DASHBOARD, ...(saved ?? {}) };
  const known = new Set(METRICS.map((m) => m.id));
  const cards = Array.isArray(d.cards) ? d.cards.filter((c, i, all) => known.has(c) && all.indexOf(c) === i) : DEFAULT_DASHBOARD.cards;
  return {
    cards,
    range: RANGES.some((r) => r.value === d.range) ? d.range : DEFAULT_DASHBOARD.range,
    from: d.from ?? null,
    to: d.to ?? null,
    stat: STATS.some((s) => s.value === d.stat) ? d.stat : DEFAULT_DASHBOARD.stat,
  };
}

/** The first and last day of a range, never past today. */
export function resolveRange(d: Pick<DashboardSettings, 'range' | 'from' | 'to'>, today: DateKey): { from: DateKey; to: DateKey } {
  switch (d.range) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case '30d':
      return { from: addDays(today, -29), to: today };
    case '90d':
      return { from: addDays(today, -89), to: today };
    case 'month':
      return { from: `${today.slice(0, 8)}01`, to: today };
    case 'custom': {
      let from = d.from ?? addDays(today, -6);
      let to = d.to ?? today;
      if (to > today) to = today;
      if (from > to) [from, to] = [to, from];
      return { from, to };
    }
    case '7d':
    default:
      return { from: addDays(today, -6), to: today };
  }
}

/** "12 Nov", or "12 Nov 2025" when it isn't this year. */
export function shortDate(d: DateKey, today: DateKey): string {
  const { y, m, d: day } = parseDateKey(d);
  return `${day} ${monthName(m).slice(0, 3)}${String(y) === today.slice(0, 4) ? '' : ` ${y}`}`;
}

/** The range in words, e.g. "Today", "12 Nov" or "6 Nov to 12 Nov". */
export function rangeText(from: DateKey, to: DateKey, today: DateKey): string {
  if (from === to) return to === today ? 'Today' : to === addDays(today, -1) ? 'Yesterday' : shortDate(to, today);
  return `${shortDate(from, today)} to ${shortDate(to, today)}`;
}

export const rangeDays = (from: DateKey, to: DateKey) => diffDays(from, to) + 1;

/** Everything the cards are worked out from. */
export interface DashboardData {
  health: HealthDay[];
  summaries: DaySummary[];
  notes: DayNote[];
  readings: Reading[];
  /** CPAP hours for each night, by the day the night started. */
  cpap: { date: DateKey; hours: number }[];
}

/**
 * One value (two for blood pressure). Most metrics have one a day; readings can have several.
 * lo and hi are the day's lowest and highest when the source has them (heart rate).
 */
export interface Point {
  date: DateKey;
  value: number;
  value2?: number;
  lo?: number;
  hi?: number;
  /** Medicines: doses taken and due that day, so "Average" can be worked out over all doses. */
  taken?: number;
  due?: number;
}

const inRange = (d: DateKey, from: DateKey, to: DateKey) => d >= from && d <= to;

/** The raw values of one metric between two days, oldest first. */
export function metricPoints(id: MetricId, data: DashboardData, from: DateKey, to: DateKey): Point[] {
  const out: Point[] = [];
  switch (id) {
    case 'meds':
      for (const s of data.summaries) {
        if (!inRange(s.date, from, to) || s.scheduled <= 0) continue;
        out.push({ date: s.date, value: (s.taken / s.scheduled) * 100, taken: s.taken, due: s.scheduled });
      }
      break;
    case 'steps':
      for (const h of data.health) if (inRange(h.date, from, to) && h.steps != null) out.push({ date: h.date, value: h.steps });
      break;
    case 'sleep':
      for (const h of data.health) if (inRange(h.date, from, to) && h.sleepMin && h.sleepMin > 0) out.push({ date: h.date, value: h.sleepMin });
      break;
    case 'heart':
      for (const h of data.health) {
        const v = h.restingHr ?? h.hrAvg;
        if (!inRange(h.date, from, to) || v == null) continue;
        out.push({ date: h.date, value: v, lo: h.hrMin ?? undefined, hi: h.hrMax ?? undefined });
      }
      break;
    case 'mood':
      for (const n of data.notes) if (inRange(n.date, from, to) && n.mood != null) out.push({ date: n.date, value: n.mood });
      break;
    case 'sugar':
      for (const r of data.readings) if (r.type === 'sugar' && r.sugar != null && inRange(r.date, from, to)) out.push({ date: r.date, value: r.sugar });
      break;
    case 'bp':
      for (const r of data.readings) {
        if (r.type !== 'bp' || r.systolic == null || r.diastolic == null || !inRange(r.date, from, to)) continue;
        out.push({ date: r.date, value: r.systolic, value2: r.diastolic });
      }
      break;
    case 'cpap':
      for (const n of data.cpap) if (inRange(n.date, from, to) && n.hours > 0) out.push({ date: n.date, value: n.hours });
      break;
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** A summed-up value: one number, or a low and high for "Lowest to highest". */
export interface StatValue {
  value: number | null;
  value2?: number | null;
  /** For "Lowest to highest": the highest (and highest second value). */
  hi?: number | null;
  hi2?: number | null;
}

function reduce(xs: number[], stat: StatKind): { v: number | null; hi?: number | null } {
  if (!xs.length) return { v: null };
  switch (stat) {
    case 'median':
      return { v: median(xs) };
    case 'min':
      return { v: Math.min(...xs) };
    case 'max':
      return { v: Math.max(...xs) };
    case 'range':
      return { v: Math.min(...xs), hi: Math.max(...xs) };
    case 'total':
      return { v: xs.reduce((a, b) => a + b, 0) };
    case 'avg':
    default:
      return { v: mean(xs) };
  }
}

/** The stat to use for a metric: the one asked for, or Average when it doesn't fit (a total heart rate). */
export function statFor(id: MetricId, stat: StatKind): StatKind {
  return metricInfo(id).stats.includes(stat) ? stat : 'avg';
}

export function summarize(id: MetricId, points: Point[], wanted: StatKind): StatValue {
  const stat = statFor(id, wanted);
  if (!points.length) return { value: null };
  if (id === 'meds' && (stat === 'avg' || stat === 'total')) {
    // Over all doses, so a day with one dose doesn't count as much as a day with six.
    const taken = points.reduce((a, p) => a + (p.taken ?? 0), 0);
    const due = points.reduce((a, p) => a + (p.due ?? 0), 0);
    return stat === 'total' ? { value: taken, value2: due } : { value: due ? (taken / due) * 100 : null };
  }
  // Heart rate: the lowest and highest come from the whole day, not just the resting value.
  const lows = id === 'heart' ? points.map((p) => p.lo ?? p.value) : points.map((p) => p.value);
  const highs = id === 'heart' ? points.map((p) => p.hi ?? p.value) : points.map((p) => p.value);
  const base = stat === 'min' ? lows : stat === 'max' ? highs : points.map((p) => p.value);
  const r = stat === 'range' ? { v: Math.min(...lows), hi: Math.max(...highs) } : reduce(base, stat);
  const out: StatValue = { value: r.v, hi: r.hi };
  if (id === 'bp') {
    const r2 = reduce(
      points.map((p) => p.value2 ?? 0),
      stat,
    );
    out.value2 = r2.v;
    out.hi2 = r2.hi;
  }
  return out;
}

/** Formats one value of a metric, without its unit. */
export function formatMetric(id: MetricId, v: number, v2?: number | null, opts: { sugarUnit?: SugarUnit } = {}): string {
  switch (id) {
    case 'meds':
      return `${Math.round(v)}%`;
    case 'steps':
      return formatSteps(v);
    case 'sleep':
      return formatSleep(v);
    case 'heart':
      return `${Math.round(v)}`;
    case 'mood':
      return v.toFixed(1);
    case 'sugar':
      return formatSugar(v, opts.sugarUnit ?? 'mgdl').replace(/ .*$/, '');
    case 'bp':
      return `${Math.round(v)}/${Math.round(v2 ?? 0)}`;
    case 'cpap':
      return formatSleep(v * 60);
  }
}

export function metricUnit(id: MetricId, opts: { sugarUnit?: SugarUnit } = {}): string {
  switch (id) {
    case 'steps':
      return 'steps';
    case 'heart':
      return 'bpm';
    case 'sugar':
      return opts.sugarUnit === 'mmol' ? 'mmol/L' : 'mg/dL';
    case 'bp':
      return 'mmHg';
    case 'mood':
      return 'of 5';
    default:
      return '';
  }
}

/** The mood word nearest a value, e.g. 4.2 is "Good". */
export const moodWord = (v: number) => ['Awful', 'Bad', 'Okay', 'Good', 'Great'][Math.max(0, Math.min(4, Math.round(v) - 1))];

/** A summed-up value as text, e.g. "7h 10m", "62 to 71" or "12 of 14". */
export function formatStat(id: MetricId, s: StatValue, wanted: StatKind, opts: { sugarUnit?: SugarUnit } = {}): string {
  if (s.value == null) return '–';
  const stat = statFor(id, wanted);
  if (id === 'meds' && stat === 'total') return `${s.value} of ${s.value2 ?? 0}`;
  if (stat === 'range' && s.hi != null) {
    return `${formatMetric(id, s.value, s.value2, opts)} to ${formatMetric(id, s.hi, s.hi2, opts)}`;
  }
  return formatMetric(id, s.value, s.value2, opts);
}

/**
 * One value per day across the range (the day's average when there are several), for the
 * small chart on a card. Long ranges are squeezed into at most `maxBars` bars so it always fits.
 */
export function dailySeries(points: Point[], from: DateKey, to: DateKey, maxBars = 31): { date: DateKey; value: number | null; value2: number | null }[] {
  const byDay = new Map<DateKey, Point[]>();
  for (const p of points) byDay.set(p.date, [...(byDay.get(p.date) ?? []), p]);
  const days = eachDay(from, to).map((date) => {
    const ps = byDay.get(date) ?? [];
    return {
      date,
      value: mean(ps.map((p) => p.value)),
      value2: ps.some((p) => p.value2 != null) ? mean(ps.map((p) => p.value2 ?? 0)) : null,
    };
  });
  if (days.length <= maxBars) return days;
  const per = Math.ceil(days.length / maxBars);
  const out: { date: DateKey; value: number | null; value2: number | null }[] = [];
  for (let i = 0; i < days.length; i += per) {
    const chunk = days.slice(i, i + per);
    const vs = chunk.map((d) => d.value).filter((v): v is number => v != null);
    const v2s = chunk.map((d) => d.value2).filter((v): v is number => v != null);
    out.push({ date: chunk[0].date, value: mean(vs), value2: mean(v2s) });
  }
  return out;
}

/** "5 of 7 days" or "12 readings". */
export function coverageText(id: MetricId, points: Point[], from: DateKey, to: DateKey): string {
  if (id === 'sugar' || id === 'bp') return points.length === 1 ? '1 reading' : `${points.length} readings`;
  const days = rangeDays(from, to);
  if (days === 1) return points.length ? '' : 'Nothing yet';
  const n = new Set(points.map((p) => p.date)).size;
  const what = id === 'sleep' || id === 'cpap' ? 'nights' : 'days';
  return `${n} of ${days} ${what}`;
}

/**
 * Moves a card up (-1) or down (+1), past the next card that is showing (cards of features
 * that are off stay where they are, out of sight).
 */
export function moveCard(cards: MetricId[], id: MetricId, dir: -1 | 1, shown: (id: MetricId) => boolean = () => true): MetricId[] {
  const i = cards.indexOf(id);
  if (i < 0) return cards;
  let j = i + dir;
  while (j >= 0 && j < cards.length && !shown(cards[j])) j += dir;
  if (j < 0 || j >= cards.length) return cards;
  const next = [...cards];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
