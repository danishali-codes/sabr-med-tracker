import { addDays, weekdayOf, type DateKey, type TimeOfDay } from './dates';
import type { HealthProfile } from './features';
import type { CheckInfo, CheckType, Medication, Reading, Schedule, SugarTiming } from './types';

// Health checks: blood sugar and blood pressure. A check is stored as a Medication with
// `check` set, like machines: its schedule gives the reminder, and a reading answers it.
// Checks never count towards streaks, gold days or badges, and are never shared.
//
// Numbers come from public guidance (checked 2026-11-21):
// - ADA Standards of Care, glycemic targets for most non-pregnant adults: 80 to 130 mg/dL
//   before meals, under 180 mg/dL 1 to 2 hours after the start of a meal. CDC: below 70 mg/dL
//   is low.
// - American Heart Association: above 180/120 is a hypertensive crisis. Wait a minute and
//   measure again; with chest pain, shortness of breath, back pain, numbness, weakness, a change
//   in vision or trouble speaking it is an emergency. Categories: normal under 120/80, elevated
//   120 to 129 and under 80, stage 1 130 to 139 or 80 to 89, stage 2 140/90 or more.
// - Home monitoring (Stergiou et al.): an average of 135/85 or more at home counts as high.
// Sabr only shows these as general guidance; the person's own targets from their doctor win.

export type SugarUnit = 'mgdl' | 'mmol';

export const MGDL_PER_MMOL = 18.016;

export interface CheckKind {
  type: CheckType;
  label: string;
  icon: 'water-outline' | 'speedometer-outline';
}

export const CHECK_KINDS: CheckKind[] = [
  { type: 'sugar', label: 'Blood sugar', icon: 'water-outline' },
  { type: 'bp', label: 'Blood pressure', icon: 'speedometer-outline' },
];

export function checkKind(type: CheckType | undefined): CheckKind {
  return CHECK_KINDS.find((k) => k.type === type) ?? CHECK_KINDS[0];
}

export const SUGAR_TIMINGS: { value: SugarTiming; label: string; short: string }[] = [
  { value: 'fasting', label: 'Fasting (before breakfast)', short: 'Fasting' },
  { value: 'beforeMeal', label: 'Before a meal', short: 'Before a meal' },
  { value: 'afterMeal', label: '2 hours after a meal', short: 'After a meal' },
  { value: 'bedtime', label: 'Bedtime', short: 'Bedtime' },
  { value: 'random', label: 'Any time', short: 'Any time' },
];

export function timingLabel(t: SugarTiming | null | undefined, short = true): string {
  const x = SUGAR_TIMINGS.find((s) => s.value === t) ?? SUGAR_TIMINGS[SUGAR_TIMINGS.length - 1];
  return short ? x.short : x.label;
}

/** The name a new check gets, e.g. "Fasting blood sugar". */
export function checkName(info: CheckInfo): string {
  if (info.type === 'bp') return 'Blood pressure';
  switch (info.timing) {
    case 'fasting':
      return 'Fasting blood sugar';
    case 'beforeMeal':
      return 'Blood sugar before meals';
    case 'afterMeal':
      return 'Blood sugar after meals';
    case 'bedtime':
      return 'Bedtime blood sugar';
    default:
      return 'Blood sugar';
  }
}

/** The line under a check's name. */
export function describeCheck(med: Pick<Medication, 'check' | 'schedule'>): string {
  if (med.schedule.pattern.kind === 'asNeeded') return 'Log when you check';
  if (med.check?.type === 'bp') return 'Two readings, a minute apart';
  return timingLabel(med.check?.timing, false);
}

// ---- units and parsing ----

export function toMgdl(value: number, unit: SugarUnit): number {
  return unit === 'mmol' ? Math.round(value * MGDL_PER_MMOL) : Math.round(value);
}

export function fromMgdl(mgdl: number, unit: SugarUnit): number {
  return unit === 'mmol' ? Math.round((mgdl / MGDL_PER_MMOL) * 10) / 10 : Math.round(mgdl);
}

export function unitLabel(unit: SugarUnit): string {
  return unit === 'mmol' ? 'mmol/L' : 'mg/dL';
}

/** "112 mg/dL" or "6.2 mmol/L". */
export function formatSugar(mgdl: number, unit: SugarUnit): string {
  const v = fromMgdl(mgdl, unit);
  return `${unit === 'mmol' ? v.toFixed(1) : v} ${unitLabel(unit)}`;
}

/** A typed blood sugar, in mg/dL, or null when it isn't a believable meter reading. */
export function parseSugar(text: string, unit: SugarUnit): number | null {
  const n = Number(text.trim().replace(',', '.'));
  if (!text.trim() || !Number.isFinite(n)) return null;
  const mgdl = toMgdl(n, unit);
  return mgdl >= 20 && mgdl <= 600 ? mgdl : null;
}

/** Systolic over diastolic (and pulse), or null when they don't make sense together. */
export function parseBp(sys: string, dia: string, pulse: string): { systolic: number; diastolic: number; pulse: number | null } | null {
  const s = Number(sys.trim());
  const d = Number(dia.trim());
  if (!sys.trim() || !dia.trim() || !Number.isInteger(s) || !Number.isInteger(d)) return null;
  if (s < 60 || s > 260 || d < 30 || d > 160 || d >= s) return null;
  const p = pulse.trim() ? Number(pulse.trim()) : null;
  if (p != null && (!Number.isInteger(p) || p < 25 || p > 250)) return null;
  return { systolic: s, diastolic: d, pulse: p };
}

// ---- what a reading means ----

export type SugarLevel = 'low' | 'inRange' | 'high';

/** Low under 70; above target over 130 before meals and fasting, over 180 otherwise. */
export function classifySugar(mgdl: number, timing: SugarTiming | null | undefined): SugarLevel {
  if (mgdl < 70) return 'low';
  const top = timing === 'fasting' || timing === 'beforeMeal' ? 130 : 180;
  return mgdl > top ? 'high' : 'inRange';
}

export function sugarLevelLabel(l: SugarLevel): string {
  return l === 'low' ? 'Low' : l === 'high' ? 'Above target' : 'In range';
}

export type BpLevel = 'low' | 'normal' | 'elevated' | 'stage1' | 'stage2' | 'crisis';

export function classifyBp(systolic: number, diastolic: number): BpLevel {
  if (systolic > 180 || diastolic > 120) return 'crisis';
  if (systolic >= 140 || diastolic >= 90) return 'stage2';
  if (systolic >= 130 || diastolic >= 80) return 'stage1';
  if (systolic < 90 || diastolic < 60) return 'low';
  if (systolic >= 120) return 'elevated';
  return 'normal';
}

export function bpLevelLabel(l: BpLevel): string {
  switch (l) {
    case 'crisis':
      return 'Very high';
    case 'stage2':
      return 'High, stage 2';
    case 'stage1':
      return 'High, stage 1';
    case 'elevated':
      return 'Elevated';
    case 'low':
      return 'Low';
    default:
      return 'Normal';
  }
}

/** good = green, warn = amber, bad = red. */
export function readingTone(r: Pick<Reading, 'type' | 'sugar' | 'timing' | 'systolic' | 'diastolic'>): 'good' | 'warn' | 'bad' {
  if (r.type === 'sugar' && r.sugar != null) {
    const l = classifySugar(r.sugar, r.timing);
    return l === 'low' ? 'bad' : l === 'high' ? 'warn' : 'good';
  }
  if (r.systolic != null && r.diastolic != null) {
    const l = classifyBp(r.systolic, r.diastolic);
    return l === 'crisis' ? 'bad' : l === 'normal' ? 'good' : 'warn';
  }
  return 'good';
}

export function readingLevelLabel(r: Pick<Reading, 'type' | 'sugar' | 'timing' | 'systolic' | 'diastolic'>): string {
  if (r.type === 'sugar' && r.sugar != null) return sugarLevelLabel(classifySugar(r.sugar, r.timing));
  if (r.systolic != null && r.diastolic != null) return bpLevelLabel(classifyBp(r.systolic, r.diastolic));
  return '';
}

/** "112 mg/dL" or "128/82, pulse 70". */
export function formatReading(r: Pick<Reading, 'type' | 'sugar' | 'systolic' | 'diastolic' | 'pulse'>, unit: SugarUnit): string {
  if (r.type === 'sugar') return r.sugar != null ? formatSugar(r.sugar, unit) : '';
  if (r.systolic == null || r.diastolic == null) return '';
  return `${r.systolic}/${r.diastolic}${r.pulse != null ? `, pulse ${r.pulse}` : ''}`;
}

export interface Advice {
  tone: 'bad' | 'warn';
  title: string;
  body: string;
}

/** What to do now, for readings where that matters. Nothing for ordinary ones. */
export function adviceFor(r: Pick<Reading, 'type' | 'sugar' | 'timing' | 'systolic' | 'diastolic'>): Advice | null {
  if (r.type === 'sugar' && r.sugar != null && r.sugar < 70) {
    return {
      tone: 'bad',
      title: 'Your blood sugar is low',
      body: 'Have something with fast-acting sugar, like juice or glucose tablets, then check again in 15 minutes. Follow the plan your doctor gave you, and get help if you feel confused or faint.',
    };
  }
  if (r.type === 'bp' && r.systolic != null && r.diastolic != null && classifyBp(r.systolic, r.diastolic) === 'crisis') {
    return {
      tone: 'bad',
      title: 'Your blood pressure is very high',
      body: 'Sit quietly, wait a minute and measure again. If it is still above 180/120 and you have chest pain, shortness of breath, back pain, numbness, weakness, a change in vision or trouble speaking, call an ambulance (998 in the UAE). Without those, contact your doctor as soon as you can.',
    };
  }
  return null;
}

// ---- averages ----

export interface SugarStats {
  count: number;
  average: number | null;
  inRange: number;
  low: number;
  high: number;
}

export function sugarStats(readings: Reading[]): SugarStats {
  const xs = readings.filter((r) => r.type === 'sugar' && r.sugar != null);
  let inRange = 0,
    low = 0,
    high = 0,
    sum = 0;
  for (const r of xs) {
    sum += r.sugar!;
    const l = classifySugar(r.sugar!, r.timing);
    if (l === 'low') low++;
    else if (l === 'high') high++;
    else inRange++;
  }
  return { count: xs.length, average: xs.length ? Math.round(sum / xs.length) : null, inRange, low, high };
}

export interface BpStats {
  count: number;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  /** Home average of 135/85 or more. */
  highAverage: boolean;
}

export function bpStats(readings: Reading[]): BpStats {
  const xs = readings.filter((r) => r.type === 'bp' && r.systolic != null && r.diastolic != null);
  if (xs.length === 0) return { count: 0, systolic: null, diastolic: null, pulse: null, highAverage: false };
  const avg = (ns: number[]) => Math.round(ns.reduce((a, b) => a + b, 0) / ns.length);
  const systolic = avg(xs.map((r) => r.systolic!));
  const diastolic = avg(xs.map((r) => r.diastolic!));
  const pulses = xs.map((r) => r.pulse).filter((p): p is number => p != null);
  return { count: xs.length, systolic, diastolic, pulse: pulses.length ? avg(pulses) : null, highAverage: systolic >= 135 || diastolic >= 85 };
}

// ---- plans ----

export interface CheckPlanItem {
  check: CheckInfo;
  times: TimeOfDay[];
  /** Weekdays (0 = Sunday), or every day when left out. */
  days?: number[];
  /** Ends after this many days (a week before a doctor's visit). */
  forDays?: number;
}

export interface CheckPlan {
  id: string;
  type: CheckType;
  label: string;
  hint: string;
  items: CheckPlanItem[];
}

export const CHECK_PLANS: CheckPlan[] = [
  {
    id: 'sugarFasting',
    type: 'sugar',
    label: 'Each morning, fasting',
    hint: 'One check before breakfast. A common start for type 2 diabetes without insulin.',
    items: [{ check: { type: 'sugar', timing: 'fasting' }, times: ['07:00'] }],
  },
  {
    id: 'sugarPair',
    type: 'sugar',
    label: 'Fasting and after a meal',
    hint: 'Before breakfast, and 2 hours after lunch, to see how meals affect you.',
    items: [
      { check: { type: 'sugar', timing: 'fasting' }, times: ['07:00'] },
      { check: { type: 'sugar', timing: 'afterMeal' }, times: ['15:00'] },
    ],
  },
  {
    id: 'sugarInsulin',
    type: 'sugar',
    label: 'Before meals and at bedtime',
    hint: 'The usual plan with mealtime insulin: before each meal, and before bed.',
    items: [
      { check: { type: 'sugar', timing: 'beforeMeal' }, times: ['07:30', '13:00', '19:30'] },
      { check: { type: 'sugar', timing: 'bedtime' }, times: ['22:30'] },
    ],
  },
  {
    id: 'sugarFew',
    type: 'sugar',
    label: 'Twice a week',
    hint: 'Fasting on Mondays and Thursdays, for prediabetes or a steady routine.',
    items: [{ check: { type: 'sugar', timing: 'fasting' }, times: ['07:00'], days: [1, 4] }],
  },
  {
    id: 'bpDaily',
    type: 'bp',
    label: 'Morning and evening',
    hint: 'Before medicines and food in the morning, and again in the evening.',
    items: [{ check: { type: 'bp' }, times: ['07:30', '20:00'] }],
  },
  {
    id: 'bpWeek',
    type: 'bp',
    label: 'One week before a doctor visit',
    hint: 'Morning and evening for 7 days, then it stops. Your average leaves out the first day.',
    items: [{ check: { type: 'bp' }, times: ['07:30', '20:00'], forDays: 7 }],
  },
  {
    id: 'bpMorning',
    type: 'bp',
    label: 'Every morning',
    hint: 'One check a day, before medicines and breakfast.',
    items: [{ check: { type: 'bp' }, times: ['07:30'] }],
  },
  {
    id: 'bpWeekly',
    type: 'bp',
    label: 'Once a week',
    hint: 'Same day each week, in the morning.',
    items: [{ check: { type: 'bp' }, times: ['08:00'], days: [] }],
  },
];

export function plansFor(type: CheckType): CheckPlan[] {
  return CHECK_PLANS.filter((p) => p.type === type);
}

/** The plan setup suggests from the health profile. */
export function defaultPlan(type: CheckType, profile: Pick<HealthProfile, 'conditions' | 'insulin'>): CheckPlan {
  if (type === 'bp') return CHECK_PLANS.find((p) => p.id === 'bpDaily')!;
  if (profile.insulin) return CHECK_PLANS.find((p) => p.id === 'sugarInsulin')!;
  if (!profile.conditions.includes('diabetes') && profile.conditions.includes('prediabetes')) return CHECK_PLANS.find((p) => p.id === 'sugarFew')!;
  return CHECK_PLANS.find((p) => p.id === 'sugarFasting')!;
}

export function scheduleFor(item: CheckPlanItem, today: DateKey): Schedule {
  // An empty day list means "the same weekday as today".
  const days = item.days?.length === 0 ? [weekdayOf(today)] : item.days;
  return {
    pattern: days ? { kind: 'weekdays', days } : { kind: 'daily' },
    times: [...item.times].sort(),
    startDate: today,
    endDate: item.forDays ? addDays(today, item.forDays - 1) : null,
  };
}

/** The checks a plan makes, ready to save. */
export function planMeds(plan: CheckPlan, today: DateKey, newId: () => string, color: string): Medication[] {
  const now = new Date().toISOString();
  return plan.items.map((item) => ({
    id: newId(),
    name: checkName(item.check),
    strength: '',
    amount: 1,
    form: 'other',
    color,
    schedule: scheduleFor(item, today),
    stock: null,
    refillAt: null,
    archived: false,
    archivedAt: null,
    check: item.check,
    createdAt: now,
  }));
}

/** Reminder words for checks. With names hidden they never say what is checked, since that tells people about a condition. */
export function checkReminderText(
  kind: 'due' | 'nag' | 'snoozed' | 'missed',
  when: string,
  meds: Pick<Medication, 'check'>[],
  showNames: boolean,
): { title: string; body: string } {
  const types = new Set(meds.map((m) => m.check?.type));
  const what = !showNames ? 'check' : types.size === 1 && types.has('bp') ? 'blood pressure check' : types.size === 1 ? 'blood sugar check' : 'checks';
  const title = kind === 'nag' ? `Still waiting: ${when} ${what}` : kind === 'snoozed' ? `Snoozed reminder: ${when} ${what}` : `Time for your ${when} ${what}`;
  return { title, body: 'Tap to log the reading.' };
}

/** A check whose feature is switched off is hidden and gets no reminders; it comes back when the feature is on again. */
export function checkIsOn(med: Pick<Medication, 'check'>, features: { sugarChecks: boolean; bpChecks: boolean }): boolean {
  if (!med.check) return true;
  return med.check.type === 'bp' ? features.bpChecks : features.sugarChecks;
}
