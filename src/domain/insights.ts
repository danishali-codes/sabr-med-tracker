import { addDays, daysInMonth, diffDays, monthName, parseTime, weekdayOf, type DateKey, type TimeOfDay } from './dates';
import { consistencySeries, isFullDay, isGoldDay, trackedFrom, type DaySummary } from './progress';
import { isMedDueOn, slotKey } from './schedule';
import { editTimes } from './routines';
import type { DayNote, DoseLog, Medication } from './types';

// Everything here runs on the phone, from data already on the phone.

// ---------------------------------------------------------------------------
// Month and year in review
// ---------------------------------------------------------------------------

export interface Review {
  title: string;
  from: DateKey;
  to: DateKey;
  /** Days that had at least one dose due. */
  daysWithDoses: number;
  scheduled: number;
  taken: number;
  skipped: number;
  missed: number;
  onTime: number;
  /** Share of due doses taken (skips left out), or null when nothing was due. */
  takenPct: number | null;
  onTimePct: number | null;
  /** Days with every dose done. */
  perfectDays: number;
  /** Days with every dose done on time. */
  goldDays: number;
  missedDays: number;
  freezesUsed: number;
  /** Longest run of complete days inside the period. */
  longestRun: number;
  consistencyStart: number;
  consistencyEnd: number;
  /** The part of the day with the most missed doses, when there were any. */
  hardestTime: { label: string; missed: number } | null;
  moodAverage: number | null;
  moodDays: number;
  topSymptoms: { name: string; days: number }[];
  /** Taken percentage per month (year review) or per week (month review), for a small chart. */
  parts: { label: string; pct: number | null }[];
}

export function monthRange(y: number, m: number): { from: DateKey; to: DateKey } {
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(daysInMonth(y, m)).padStart(2, '0')}` };
}

const PARTS_OF_DAY: { label: string; from: number; to: number }[] = [
  { label: 'Night (before 6 AM)', from: 0, to: 6 },
  { label: 'Morning', from: 6, to: 12 },
  { label: 'Afternoon', from: 12, to: 17 },
  { label: 'Evening', from: 17, to: 21 },
  { label: 'Late evening', from: 21, to: 24 },
];

function partOfDay(t: TimeOfDay): string {
  const h = parseTime(t).h;
  return PARTS_OF_DAY.find((p) => h >= p.from && h < p.to)?.label ?? 'Morning';
}

/**
 * Sums up a month or a year. `summaries` must cover the period (and ideally the weeks
 * before it, for the consistency score); `doses` are the doses that were due, used only
 * to find the hardest time of day.
 */
export function buildReview(opts: {
  kind: 'month' | 'year';
  y: number;
  m?: number;
  summaries: DaySummary[];
  frozenDays: Set<DateKey>;
  notes: DayNote[];
  logs: Map<string, DoseLog>;
  dueDoses: { slot: string; date: DateKey; time: TimeOfDay }[];
  today: DateKey;
}): Review {
  const { kind, y, summaries, notes, logs, today } = opts;
  const range = kind === 'month' ? monthRange(y, opts.m!) : { from: `${y}-01-01`, to: `${y}-12-31` };
  const to = range.to < today ? range.to : addDays(today, -1);
  const inRange = summaries.filter((s) => s.date >= range.from && s.date <= to);

  let scheduled = 0,
    taken = 0,
    skipped = 0,
    onTime = 0,
    perfectDays = 0,
    goldDays = 0,
    missedDays = 0,
    daysWithDoses = 0,
    run = 0,
    longestRun = 0,
    freezesUsed = 0;
  for (const s of inRange) {
    scheduled += s.scheduled;
    taken += s.taken;
    skipped += s.skipped;
    onTime += s.onTime;
    if (s.scheduled > 0) daysWithDoses++;
    if (isFullDay(s)) perfectDays++;
    if (isGoldDay(s)) goldDays++;
    if (s.status === 'partial' || s.status === 'missed') missedDays++;
    if (opts.frozenDays.has(s.date)) freezesUsed++;
    if (s.status === 'complete') longestRun = Math.max(longestRun, ++run);
    else if (s.status === 'partial' || s.status === 'missed') run = 0;
  }
  const missed = Math.max(0, scheduled - taken - skipped);
  const due = scheduled - skipped;

  const series = consistencySeries(summaries.filter((s) => s.date <= to));
  const at = (d: DateKey) => {
    let v = 0;
    for (const p of series) {
      if (p.date > d) break;
      v = p.score;
    }
    return v;
  };

  const missedByPart = new Map<string, number>();
  for (const d of opts.dueDoses) {
    if (d.date < range.from || d.date > to) continue;
    const st = logs.get(d.slot)?.status;
    if (st === 'taken' || st === 'skipped') continue;
    const label = partOfDay(d.time);
    missedByPart.set(label, (missedByPart.get(label) ?? 0) + 1);
  }
  const worst = [...missedByPart.entries()].sort((a, b) => b[1] - a[1])[0];

  const periodNotes = notes.filter((n) => n.date >= range.from && n.date <= to);
  const moods = periodNotes.map((n) => n.mood).filter((m): m is 1 | 2 | 3 | 4 | 5 => m != null);
  const symptomDays = new Map<string, number>();
  for (const n of periodNotes) for (const sy of new Set(n.symptoms)) symptomDays.set(sy, (symptomDays.get(sy) ?? 0) + 1);

  const parts: { label: string; pct: number | null }[] = [];
  if (kind === 'year') {
    for (let m = 1; m <= 12; m++) {
      const r = monthRange(y, m);
      parts.push({ label: monthName(m).slice(0, 1), pct: takenShare(inRange.filter((s) => s.date >= r.from && s.date <= r.to)) });
    }
  } else {
    // Weeks of the month: days 1-7, 8-14, 15-21, 22-28, 29+.
    const r = monthRange(y, opts.m!);
    for (let w = 0; w * 7 < diffDays(r.from, r.to) + 1; w++) {
      const a = addDays(r.from, w * 7);
      const b = addDays(r.from, w * 7 + 6);
      parts.push({ label: `${w * 7 + 1}`, pct: takenShare(inRange.filter((s) => s.date >= a && s.date <= b)) });
    }
  }

  return {
    title: kind === 'month' ? `${monthName(opts.m!)} ${y}` : `${y}`,
    from: range.from,
    to,
    daysWithDoses,
    scheduled,
    taken,
    skipped,
    missed,
    onTime,
    takenPct: due > 0 ? taken / due : null,
    onTimePct: taken > 0 ? onTime / taken : null,
    perfectDays,
    goldDays,
    missedDays,
    freezesUsed,
    longestRun,
    consistencyStart: at(addDays(range.from, -1)),
    consistencyEnd: at(to),
    hardestTime: worst && worst[1] > 0 ? { label: worst[0], missed: worst[1] } : null,
    moodAverage: moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null,
    moodDays: moods.length,
    topSymptoms: [...symptomDays.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, days]) => ({ name, days })),
    parts,
  };
}

function takenShare(days: DaySummary[]): number | null {
  let due = 0,
    taken = 0;
  for (const s of days) {
    due += s.scheduled - s.skipped;
    taken += s.taken;
  }
  return due > 0 ? taken / due : null;
}

/** The month whose review to offer: last month, once it has finished. */
export function lastMonth(today: DateKey): { y: number; m: number } {
  const [y, m] = today.split('-').map(Number);
  return m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
}

// ---------------------------------------------------------------------------
// Patterns: how you felt against how the doses went
// ---------------------------------------------------------------------------

export interface Pattern {
  id: string;
  title: string;
  detail: string;
  /** Bigger = a clearer difference. Used for ordering only. */
  weight: number;
}

const MIN_DAYS = 4;
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Compares mood and symptoms on days after doses were missed with days after everything was
 * taken. Only shows a pattern when both sides have a few days behind them. These are just
 * coincidences in your own notes, not medical findings.
 */
export function findPatterns(opts: {
  summaries: DaySummary[];
  notes: DayNote[];
  meds: Medication[];
  logs: Map<string, DoseLog>;
}): Pattern[] {
  const { summaries, notes, meds, logs } = opts;
  const byDate = new Map(summaries.map((s) => [s.date, s]));
  const out: Pattern[] = [];

  // Mood on the same day and the day after.
  for (const lag of [0, 1] as const) {
    const good: number[] = [];
    const bad: number[] = [];
    for (const n of notes) {
      if (n.mood == null) continue;
      const s = byDate.get(addDays(n.date, -lag));
      if (!s || s.scheduled === 0) continue;
      if (s.status === 'complete') good.push(n.mood);
      else if (s.status === 'partial' || s.status === 'missed') bad.push(n.mood);
    }
    if (good.length >= MIN_DAYS && bad.length >= MIN_DAYS) {
      const diff = avg(good) - avg(bad);
      if (Math.abs(diff) >= 0.4) {
        const when = lag === 0 ? 'on days you' : 'the day after you';
        out.push({
          id: `mood-${lag}`,
          title: diff > 0 ? `Your mood is better ${when} take every dose` : `Your mood is lower ${when} take every dose`,
          detail: `Average mood ${moodWord(avg(good))} (${good.length} days) against ${moodWord(avg(bad))} when doses were missed (${bad.length} days).`,
          weight: Math.abs(diff),
        });
      }
    }
  }

  // Each symptom the day after a miss against the day after a complete day.
  const symptoms = new Set(notes.flatMap((n) => n.symptoms));
  for (const sy of symptoms) {
    let afterGood = 0,
      afterGoodWith = 0,
      afterBad = 0,
      afterBadWith = 0;
    for (const n of notes) {
      const prev = byDate.get(addDays(n.date, -1));
      if (!prev || prev.scheduled === 0) continue;
      const has = n.symptoms.includes(sy);
      if (prev.status === 'complete') {
        afterGood++;
        if (has) afterGoodWith++;
      } else if (prev.status === 'partial' || prev.status === 'missed') {
        afterBad++;
        if (has) afterBadWith++;
      }
    }
    if (afterGood < MIN_DAYS || afterBad < MIN_DAYS || afterGoodWith + afterBadWith < 3) continue;
    const a = afterBadWith / afterBad;
    const b = afterGoodWith / afterGood;
    if (Math.abs(a - b) < 0.25) continue;
    out.push({
      id: `symptom-${sy}`,
      title: a > b ? `${sy} shows up more after a missed dose` : `${sy} shows up less after a missed dose`,
      detail: `Noted on ${pct(a)} of days after a miss (${afterBadWith} of ${afterBad}) and ${pct(b)} of days after taking everything (${afterGoodWith} of ${afterGood}).`,
      weight: Math.abs(a - b) * 2,
    });
  }

  // Per medicine: mood the day after it was missed.
  for (const med of meds) {
    if (med.schedule.pattern.kind === 'asNeeded') continue;
    const taken: number[] = [];
    const missed: number[] = [];
    for (const n of notes) {
      if (n.mood == null) continue;
      const d = addDays(n.date, -1);
      const s = byDate.get(d);
      if (!s || s.scheduled === 0) continue;
      if (diffDays(trackedFrom(med), d) < 0 || !isMedDueOn(med, d)) continue;
      const slots = med.schedule.times.map((t) => logs.get(slotKey(med.id, d, t)));
      if (slots.length === 0) continue;
      if (slots.every((x) => x?.status === 'taken')) taken.push(n.mood);
      else if (slots.some((x) => !x)) missed.push(n.mood);
    }
    if (taken.length >= MIN_DAYS && missed.length >= 3) {
      const diff = avg(taken) - avg(missed);
      if (Math.abs(diff) >= 0.5) {
        out.push({
          id: `med-${med.id}`,
          title: `${med.name}: mood ${diff > 0 ? 'drops' : 'rises'} the day after it's missed`,
          detail: `${moodWord(avg(missed))} after missing it (${missed.length} days), ${moodWord(avg(taken))} after taking it (${taken.length} days).`,
          weight: Math.abs(diff),
        });
      }
    }
  }

  return out.sort((a, b) => b.weight - a.weight);
}

function moodWord(v: number): string {
  const words = ['awful', 'bad', 'okay', 'good', 'great'];
  return `${words[Math.max(0, Math.min(4, Math.round(v) - 1))]} (${v.toFixed(1)})`;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** How many days with a mood note there are, to say how far off patterns are. */
export function patternReadiness(notes: DayNote[]): { moodDays: number; needed: number } {
  return { moodDays: notes.filter((n) => n.mood != null).length, needed: MIN_DAYS * 2 };
}

// ---------------------------------------------------------------------------
// Smart reminder timing
// ---------------------------------------------------------------------------

export interface TimingSuggestion {
  /** The reminder time as set now. */
  time: TimeOfDay;
  /** Where it would move to (rounded to 5 minutes). */
  suggested: TimeOfDay;
  /** Typical minutes between the reminder and taking the dose (negative = early). */
  typicalOffset: number;
  samples: number;
  medIds: string[];
}

const SAMPLE_DAYS = 21;
const MIN_SAMPLES = 7;
const MIN_SHIFT = 20;

/**
 * Looks at when doses due at each reminder time were actually taken over the last three
 * weeks. When it's consistently 20+ minutes off (in the same direction most days), suggests
 * moving the reminder to the usual time.
 */
export function suggestTimings(meds: Medication[], logs: DoseLog[], today: DateKey): TimingSuggestion[] {
  const from = addDays(today, -SAMPLE_DAYS);
  const active = meds.filter((m) => !m.archived && m.schedule.pattern.kind !== 'asNeeded');
  const byTime = new Map<TimeOfDay, { offsets: Map<DateKey, number>; medIds: Set<string> }>();
  for (const m of active) {
    for (const t of m.schedule.times) {
      const e = byTime.get(t) ?? { offsets: new Map(), medIds: new Set<string>() };
      e.medIds.add(m.id);
      byTime.set(t, e);
    }
  }
  const medIds = new Set(active.map((m) => m.id));
  for (const l of logs) {
    if (l.status !== 'taken' || !medIds.has(l.medId) || l.date < from || l.date >= today) continue;
    const e = byTime.get(l.time);
    if (!e || !e.medIds.has(l.medId)) continue;
    const at = new Date(l.at);
    const [y, mo, d] = l.date.split('-').map(Number);
    const { h, min } = parseTime(l.time);
    const due = new Date(y, mo - 1, d, h, min);
    const off = Math.round((at.getTime() - due.getTime()) / 60_000);
    if (Math.abs(off) > 6 * 60) continue; // logged much later by hand, not a timing signal
    // One sample per day per time: the first dose taken.
    const prev = e.offsets.get(l.date);
    if (prev == null || off < prev) e.offsets.set(l.date, off);
  }

  const out: TimingSuggestion[] = [];
  for (const [time, e] of byTime) {
    const offs = [...e.offsets.values()].sort((a, b) => a - b);
    if (offs.length < MIN_SAMPLES) continue;
    const median = offs[Math.floor(offs.length / 2)];
    if (Math.abs(median) < MIN_SHIFT) continue;
    const sameSide = offs.filter((o) => Math.sign(o) === Math.sign(median) && Math.abs(o) >= MIN_SHIFT / 2).length;
    if (sameSide / offs.length < 0.7) continue;
    const { h, min } = parseTime(time);
    let total = h * 60 + min + median;
    total = Math.round(total / 5) * 5;
    if (total < 0 || total >= 24 * 60) continue; // would cross midnight; leave it alone
    const suggested = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    if (suggested === time) continue;
    // Never suggest a time one of these medicines already has: the two doses would merge.
    if (active.some((m) => e.medIds.has(m.id) && m.schedule.times.includes(suggested))) continue;
    out.push({ time, suggested, typicalOffset: median, samples: offs.length, medIds: [...e.medIds] });
  }
  return out.sort((a, b) => (a.time < b.time ? -1 : 1));
}

/** Moves one usual time, keeping weekday times lined up. Null when the medicine already has a dose then. */
export function moveTime(med: Medication, from: TimeOfDay, to: TimeOfDay): Medication | null {
  const schedule = editTimes(med.schedule, [{ move: from, to }]);
  return schedule ? { ...med, schedule } : null;
}

// ---------------------------------------------------------------------------
// Mood trend
// ---------------------------------------------------------------------------

export interface MoodTrend {
  from: DateKey;
  to: DateKey;
  /** Every day in the range with a mood, oldest first. */
  points: { date: DateKey; mood: number }[];
  /** Average over the 7 days up to each day that has any mood nearby; null where there's none. */
  rolling: { date: DateKey; avg: number | null }[];
  average: number | null;
  /** The same-length period just before, to say whether things are going up or down. */
  previousAverage: number | null;
  /** Average mood by weekday (0 = Sunday), null with fewer than 2 notes that weekday. */
  byWeekday: (number | null)[];
  /** How often each mood was picked, 1 to 5. */
  counts: number[];
  topSymptoms: { name: string; days: number }[];
  /** Days in the range with any note at all. */
  noted: number;
}

/** How mood has gone over a period, from the notes on the phone. */
export function moodTrend(notes: DayNote[], from: DateKey, to: DateKey): MoodTrend {
  const span = diffDays(from, to) + 1;
  const prevFrom = addDays(from, -span);
  const byDate = new Map(notes.map((n) => [n.date, n]));
  const inRange = notes.filter((n) => n.date >= from && n.date <= to).sort((a, b) => (a.date < b.date ? -1 : 1));
  const points = inRange.filter((n) => n.mood != null).map((n) => ({ date: n.date, mood: n.mood as number }));
  const prev = notes.filter((n) => n.date >= prevFrom && n.date < from && n.mood != null).map((n) => n.mood as number);

  const rolling: MoodTrend['rolling'] = [];
  for (let i = 0; i < span; i++) {
    const date = addDays(from, i);
    const week: number[] = [];
    for (let k = 0; k < 7; k++) {
      const m = byDate.get(addDays(date, -k))?.mood;
      if (m != null) week.push(m);
    }
    rolling.push({ date, avg: week.length ? avg(week) : null });
  }

  const weekday: number[][] = Array.from({ length: 7 }, () => []);
  const counts = [0, 0, 0, 0, 0];
  for (const p of points) {
    const [y, m, d] = p.date.split('-').map(Number);
    weekday[new Date(y, m - 1, d).getDay()].push(p.mood);
    counts[p.mood - 1]++;
  }
  const symptomDays = new Map<string, number>();
  for (const n of inRange) for (const sy of new Set(n.symptoms)) symptomDays.set(sy, (symptomDays.get(sy) ?? 0) + 1);

  return {
    from,
    to,
    points,
    rolling,
    average: points.length ? avg(points.map((p) => p.mood)) : null,
    previousAverage: prev.length ? avg(prev) : null,
    byWeekday: weekday.map((xs) => (xs.length >= 2 ? avg(xs) : null)),
    counts,
    topSymptoms: [...symptomDays.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, 5)
      .map(([name, days]) => ({ name, days })),
    noted: inRange.length,
  };
}

// ---------------------------------------------------------------------------
// Learned routines
// ---------------------------------------------------------------------------
// Two more things the phone can learn from when doses are actually taken. Both only
// suggest; nothing changes until you accept, and nothing leaves the phone.

const toMinutes = (t: TimeOfDay) => {
  const { h, min } = parseTime(t);
  return h * 60 + min;
};
const fromMinutes = (m: number): TimeOfDay => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const round5 = (m: number) => Math.round(m / 5) * 5;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
/** Minutes from the dose's time to when it was taken (negative = early). */
const offsetOf = (l: DoseLog) => {
  const [y, mo, d] = l.date.split('-').map(Number);
  const { h, min } = parseTime(l.time);
  return Math.round((new Date(l.at).getTime() - new Date(y, mo - 1, d, h, min).getTime()) / 60_000);
};
const clockOf = (iso: string) => {
  const at = new Date(iso);
  return at.getHours() * 60 + at.getMinutes();
};
const scheduled = (meds: Medication[]) => meds.filter((m) => !m.archived && m.schedule.pattern.kind !== 'asNeeded');

export interface DayTimeSuggestion {
  id: string;
  /** The usual time that runs late (or early) on some days. */
  time: TimeOfDay;
  /** Those weekdays (0 = Sunday). */
  days: number[];
  suggested: TimeOfDay;
  /** Typical minutes off on those days. */
  typicalOffset: number;
  medIds: string[];
}

const WEEKDAY_LOOKBACK = 42;
const WEEKDAY_MIN_SAMPLES = 3;
const WEEKDAY_MIN_SHIFT = 45;

/**
 * Finds a dose you take at a clearly different time on certain weekdays, for example an hour
 * and a half later on Saturdays and Sundays, and suggests a different time on those days.
 */
export function suggestDayTimes(meds: Medication[], logs: DoseLog[], today: DateKey): DayTimeSuggestion[] {
  const from = addDays(today, -WEEKDAY_LOOKBACK);
  const byKey = new Map<string, DayTimeSuggestion>();
  for (const med of scheduled(meds)) {
    const covered = new Set((med.schedule.dayTimes ?? []).flatMap((r) => r.days));
    for (const time of med.schedule.times) {
      const perDay: number[][] = Array.from({ length: 7 }, () => []);
      for (const l of logs) {
        // Only days the dose was at its usual time, so an existing change doesn't count.
        if (l.medId !== med.id || l.status !== 'taken' || l.time !== time || l.date < from || l.date >= today) continue;
        const off = offsetOf(l);
        if (Math.abs(off) > 6 * 60) continue;
        perDay[weekdayOf(l.date)].push(off);
      }
      const medians = perDay.map((xs) => (xs.length >= WEEKDAY_MIN_SAMPLES ? median(xs) : null));
      const known = medians.filter((x): x is number => x != null);
      if (known.length < 4) continue; // too little to tell the usual days from the odd ones
      const usual = median(known);
      const odd = medians.map((m, day) => ({ m, day })).filter((x): x is { m: number; day: number } => x.m != null && Math.abs(x.m - usual) >= WEEKDAY_MIN_SHIFT);
      if (odd.length === 0 || odd.length > 3) continue;
      if (!odd.every((x) => Math.sign(x.m - usual) === Math.sign(odd[0].m - usual))) continue;
      if (Math.max(...odd.map((x) => x.m)) - Math.min(...odd.map((x) => x.m)) > 60) continue;
      if (odd.some((x) => covered.has(x.day))) continue;
      const shift = round5(avg(odd.map((x) => x.m)));
      const total = toMinutes(time) + shift;
      if (total < 0 || total >= 24 * 60) continue;
      const suggested = fromMinutes(total);
      if (med.schedule.times.includes(suggested)) continue;
      const days = odd.map((x) => x.day);
      const key = `${time}|${days.join(',')}|${suggested}`;
      const e = byKey.get(key) ?? { id: `days:${key}`, time, days, suggested, typicalOffset: shift, medIds: [] };
      e.medIds.push(med.id);
      byKey.set(key, e);
    }
  }
  return [...byKey.values()];
}

/** Adds "on these days, take it at this time instead" to a medicine. Null if those days already have their own times. */
export function addDayTime(med: Medication, time: TimeOfDay, days: number[], to: TimeOfDay): Medication | null {
  const s = med.schedule;
  const i = s.times.indexOf(time);
  if (i < 0 || s.times.includes(to)) return null;
  if ((s.dayTimes ?? []).some((r) => r.days.some((d) => days.includes(d)))) return null;
  const times = s.times.map((t, k) => (k === i ? to : t));
  return { ...med, schedule: { ...s, dayTimes: [...(s.dayTimes ?? []), { days: [...days].sort(), times }] } };
}

export interface RoutineSuggestion {
  id: string;
  /** The two reminder times you take together in practice. */
  times: [TimeOfDay, TimeOfDay];
  /** One time for both, from when you usually take them. */
  suggested: TimeOfDay;
  /** A name for the routine, from the time of day. */
  name: string;
  together: number;
  medIds: string[];
}

const ROUTINE_LOOKBACK = 21;
const ROUTINE_MIN_DAYS = 7;
const TOGETHER_MINUTES = 15;

/**
 * Finds two reminder times close together (within 2 hours) whose doses you usually take in
 * one go, for example 8:00 and 9:00 both taken around 8:20, and suggests one routine instead.
 */
export function suggestRoutines(meds: Medication[], logs: DoseLog[], today: DateKey, routines: { time: TimeOfDay }[] = []): RoutineSuggestion[] {
  const from = addDays(today, -ROUTINE_LOOKBACK);
  const active = scheduled(meds);
  const atTime = new Map<TimeOfDay, Medication[]>();
  for (const m of active) for (const t of m.schedule.times) atTime.set(t, [...(atTime.get(t) ?? []), m]);
  // When each time's doses were taken, per day: the first dose taken at that time.
  const taken = new Map<string, number>();
  for (const l of logs) {
    if (l.status !== 'taken' || l.date < from || l.date >= today) continue;
    // Only the medicines due at that time now, so old or archived ones don't count.
    if (!atTime.get(l.time)?.some((m) => m.id === l.medId)) continue;
    const k = `${l.date}|${l.time}`;
    const at = clockOf(l.at);
    if (!taken.has(k) || at < taken.get(k)!) taken.set(k, at);
  }

  const times = [...atTime.keys()].sort();
  const out: RoutineSuggestion[] = [];
  for (let a = 0; a < times.length; a++) {
    for (let b = a + 1; b < times.length; b++) {
      const t1 = times[a];
      const t2 = times[b];
      if (toMinutes(t2) - toMinutes(t1) > 120) break;
      const meds1 = atTime.get(t1)!;
      const meds2 = atTime.get(t2)!;
      if (meds1.some((m) => meds2.includes(m))) continue; // one medicine twice: keep them apart
      let both = 0;
      const together: number[] = [];
      for (let i = 1; i <= ROUTINE_LOOKBACK; i++) {
        const date = addDays(today, -i);
        const x = taken.get(`${date}|${t1}`);
        const y = taken.get(`${date}|${t2}`);
        if (x == null || y == null) continue;
        both++;
        if (Math.abs(x - y) <= TOGETHER_MINUTES) together.push(Math.min(x, y));
      }
      if (together.length < ROUTINE_MIN_DAYS || together.length / both < 0.75) continue;
      const suggested = fromMinutes(Math.min(24 * 60 - 5, round5(median(together))));
      if (routines.some((r) => r.time === suggested)) continue;
      out.push({
        id: `routine:${t1}|${t2}`,
        times: [t1, t2],
        suggested,
        name: routineName(suggested),
        together: together.length,
        medIds: [...meds1, ...meds2].map((m) => m.id),
      });
    }
  }
  return out;
}

function routineName(t: TimeOfDay): string {
  const h = parseTime(t).h;
  return h < 5 ? 'Night' : h < 11 ? 'Morning' : h < 15 ? 'Midday' : h < 18 ? 'Afternoon' : h < 22 ? 'Evening' : 'Bedtime';
}
