import type Ionicons from '@expo/vector-icons/Ionicons';
import type { Settings } from './types';

/**
 * Features: the parts of Sabr someone can switch on or off.
 *
 * Medicines, reminders, Today, the streak, refills and the calendar are the core and are
 * always on. Everything else is a feature. A new install starts with only what the person
 * picked in setup; the rest stays off and out of sight until they turn it on in Settings,
 * Features. Turning a feature off hides it, and never deletes what it saved.
 */
export type FeatureId =
  | 'supplements'
  | 'machines'
  | 'sugarChecks'
  | 'bpChecks'
  | 'mood'
  | 'healthData'
  | 'fasting'
  | 'caregiving'
  | 'rewards'
  | 'watch';

export type FeatureFlags = Record<FeatureId, boolean>;

/** Health conditions the person told Sabr about. Kept on the phone only, never shared. */
export type ConditionId =
  | 'diabetes'
  | 'prediabetes'
  | 'highBp'
  | 'sleepApnea'
  | 'asthmaCopd'
  | 'heart'
  | 'kidney'
  | 'thyroid'
  | 'cholesterol'
  | 'mentalHealth';

export type DiabetesType = 'type1' | 'type2' | 'gestational' | 'other';
export type MedsPerDay = 'none' | '1-2' | '3-5' | '6+';

/**
 * What the person told Sabr about their health in setup or in Settings, Health profile.
 * Lives in settings, so it is in encrypted backups, but it is never part of sharing,
 * caregiver views, reminders or reports.
 */
export interface HealthProfile {
  conditions: ConditionId[];
  /** Only when diabetes is ticked. */
  diabetesType: DiabetesType | null;
  /** Only when diabetes is ticked: whether they use insulin (changes the sugar check plan). */
  insulin: boolean | null;
  medsPerDay: MedsPerDay | null;
  /** How many times a day they take medicines (1 to 4, 4 meaning four or more). */
  timesPerDay: 1 | 2 | 3 | 4 | null;
}

export const EMPTY_PROFILE: HealthProfile = { conditions: [], diabetesType: null, insulin: null, medsPerDay: null, timesPerDay: null };

/** A new install: everything off except the rewards, which are part of how Sabr feels. */
export const DEFAULT_FEATURES: FeatureFlags = {
  supplements: false,
  machines: false,
  sugarChecks: false,
  bpChecks: false,
  mood: false,
  healthData: false,
  fasting: false,
  caregiving: false,
  rewards: true,
  watch: false,
};

export interface FeatureInfo {
  id: FeatureId;
  title: string;
  /** What it adds, in a sentence. */
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Shown in setup. */
  question: string;
  keywords: string[];
  /** Built and usable in this version. Unbuilt ones can be picked in setup but don't show in Features yet. */
  available: boolean;
  androidOnly?: boolean;
}

export const FEATURES: FeatureInfo[] = [
  {
    id: 'supplements',
    title: 'Supplements',
    hint: 'Vitamins and other supplements with their own ring. Missing one never affects your streak.',
    icon: 'leaf-outline',
    question: 'I take vitamins or supplements',
    keywords: ['vitamin', 'fish oil', 'iron'],
    available: true,
  },
  {
    id: 'machines',
    title: 'Machines',
    hint: 'CPAP, nebulizer or oxygen: a nightly check-in and reminders to change parts.',
    icon: 'pulse-outline',
    question: 'I use a machine at home, like a CPAP or nebulizer',
    keywords: ['cpap', 'nebulizer', 'oxygen', 'mask', 'filter', 'sleep apnea'],
    available: true,
  },
  {
    id: 'sugarChecks',
    title: 'Blood sugar checks',
    hint: 'Reminders to check your blood sugar, fasting and after meals, and a log of readings.',
    icon: 'water-outline',
    question: 'Remind me to check my blood sugar',
    keywords: ['glucose', 'diabetes', 'sugar', 'fasting', 'insulin', 'reading'],
    available: true,
  },
  {
    id: 'bpChecks',
    title: 'Blood pressure checks',
    hint: 'Reminders to check your blood pressure, a log of readings and a weekly average.',
    icon: 'heart-outline',
    question: 'Remind me to check my blood pressure',
    keywords: ['bp', 'hypertension', 'pressure', 'reading'],
    available: true,
  },
  {
    id: 'mood',
    title: 'Mood',
    hint: 'Note how you feel each day and see how it changes with your medicines.',
    icon: 'happy-outline',
    question: 'I want to note how I feel each day',
    keywords: ['feeling', 'symptoms', 'diary', 'journal', 'note'],
    available: true,
  },
  {
    id: 'healthData',
    title: 'Health data',
    hint: 'Steps, sleep and heart rate from Samsung Health, through Health Connect. Read on the phone only.',
    icon: 'fitness-outline',
    question: 'Bring in steps and sleep from Samsung Health',
    keywords: ['samsung', 'health connect', 'steps', 'sleep', 'heart rate'],
    available: true,
    androidOnly: true,
  },
  {
    id: 'fasting',
    title: 'Fasting',
    hint: 'Ramadan mode: move doses to suhoor and iftar, by hand or from prayer times.',
    icon: 'moon-outline',
    question: 'I fast in Ramadan',
    keywords: ['ramadan', 'suhoor', 'iftar', 'prayer'],
    available: true,
  },
  {
    id: 'caregiving',
    title: 'Family and caregivers',
    hint: 'Let family see whether you took your doses, or follow someone you look after.',
    icon: 'people-outline',
    question: 'Someone helps me with my medicines, or I help someone',
    keywords: ['share', 'family', 'caregiver', 'follow', 'parent'],
    available: true,
  },
  {
    id: 'rewards',
    title: 'Rewards',
    hint: 'Badges, streak freezes and a small celebration when the day is done.',
    icon: 'ribbon-outline',
    question: 'I like streaks and badges',
    keywords: ['badges', 'confetti', 'celebrate', 'freeze', 'gamification'],
    available: true,
  },
  {
    id: 'watch',
    title: 'Watch',
    hint: "Today's doses on a Wear OS watch tile, with Taken on the watch.",
    icon: 'watch-outline',
    question: 'I wear a smartwatch',
    keywords: ['wear os', 'galaxy watch', 'tile'],
    available: true,
    androidOnly: true,
  },
];

export const CONDITIONS: { id: ConditionId; label: string }[] = [
  { id: 'diabetes', label: 'Diabetes' },
  { id: 'prediabetes', label: 'Prediabetes' },
  { id: 'highBp', label: 'High blood pressure' },
  { id: 'heart', label: 'Heart condition' },
  { id: 'cholesterol', label: 'High cholesterol' },
  { id: 'sleepApnea', label: 'Sleep apnea' },
  { id: 'asthmaCopd', label: 'Asthma or COPD' },
  { id: 'kidney', label: 'Kidney disease' },
  { id: 'thyroid', label: 'Thyroid' },
  { id: 'mentalHealth', label: 'Anxiety or depression' },
];

export function featureInfo(id: FeatureId): FeatureInfo {
  return FEATURES.find((f) => f.id === id)!;
}

/** Fills in flags missing from older saved settings (all off, except rewards). */
export function normalizeFeatures(saved: Partial<FeatureFlags> | undefined): FeatureFlags {
  return { ...DEFAULT_FEATURES, ...(saved ?? {}) };
}

export function normalizeProfile(saved: Partial<HealthProfile> | undefined): HealthProfile {
  const p = { ...EMPTY_PROFILE, ...(saved ?? {}) };
  const known = new Set(CONDITIONS.map((c) => c.id));
  const conditions = [...new Set(p.conditions ?? [])].filter((c) => known.has(c));
  const diabetic = conditions.includes('diabetes');
  return { ...p, conditions, diabetesType: diabetic ? p.diabetesType : null, insulin: diabetic ? p.insulin : null };
}

/**
 * Features a condition suggests. Setup ticks these for the person when they pick the
 * condition; they can untick them before finishing.
 */
export function suggestedFeatures(conditions: ConditionId[]): FeatureId[] {
  const out = new Set<FeatureId>();
  for (const c of conditions) {
    if (c === 'diabetes' || c === 'prediabetes') out.add('sugarChecks');
    if (c === 'highBp') out.add('bpChecks');
    if (c === 'sleepApnea' || c === 'asthmaCopd') out.add('machines');
  }
  return [...out];
}

/** What an existing install already uses, so the one-time "choose your features" screen keeps it all on. */
export interface InUse {
  hasSupplements: boolean;
  hasMachines: boolean;
  hasSugarChecks?: boolean;
  hasBpChecks?: boolean;
  hasMoodNotes: boolean;
  healthConnect: boolean;
  ramadan: boolean;
  sharing: boolean;
  following: boolean;
  watchTile: boolean;
  celebrate: boolean;
}

export function featuresInUse(u: InUse): FeatureFlags {
  return {
    supplements: u.hasSupplements,
    machines: u.hasMachines,
    sugarChecks: !!u.hasSugarChecks,
    bpChecks: !!u.hasBpChecks,
    mood: u.hasMoodNotes,
    healthData: u.healthConnect,
    fasting: u.ramadan,
    caregiving: u.sharing || u.following,
    rewards: u.celebrate,
    watch: u.watchTile,
  };
}

/** Features shown on the Features page and in setup for this phone. */
export function featuresHere(android: boolean, includeUnbuilt = false): FeatureInfo[] {
  return FEATURES.filter((f) => (includeUnbuilt || f.available) && (android || !f.androidOnly));
}

/**
 * Settings that follow from turning a feature off, so a hidden feature never keeps working
 * out of sight (e.g. watch updates, or Health Connect reads).
 */
export function offPatch(id: FeatureId): { healthConnect?: false; watchTile?: false; celebrate?: false } {
  if (id === 'healthData') return { healthConnect: false };
  if (id === 'watch') return { watchTile: false };
  if (id === 'rewards') return { celebrate: false };
  return {};
}

/** Default reminder times for routines made from "how many times a day". */
export function routinesFor(timesPerDay: 1 | 2 | 3 | 4): { name: string; time: string }[] {
  const all = [
    { name: 'Morning', time: '08:00' },
    { name: 'Afternoon', time: '14:00' },
    { name: 'Evening', time: '20:00' },
    { name: 'Bedtime', time: '22:30' },
  ];
  if (timesPerDay === 1) return [all[0]];
  if (timesPerDay === 2) return [all[0], all[2]];
  if (timesPerDay === 3) return [all[0], all[1], all[2]];
  return all;
}

/** The settings change for turning a feature on or off. */
export function featurePatch(s: Settings, id: FeatureId, on: boolean): Partial<Settings> {
  const patch: Partial<Settings> = { features: { ...s.features, [id]: on } };
  if (on) {
    if (id === 'watch') patch.watchTile = true;
    if (id === 'rewards') patch.celebrate = true;
    return patch;
  }
  Object.assign(patch, offPatch(id));
  if (id === 'fasting' && s.ramadan.enabled) patch.ramadan = { ...s.ramadan, enabled: false };
  return patch;
}

/** Applies a whole set of features at once, as setup does. */
export function featuresPatch(s: Settings, next: FeatureFlags): Partial<Settings> {
  let merged: Settings = s;
  for (const id of Object.keys(next) as FeatureId[]) {
    // Off is always applied, so settings from before features existed (Health Connect, watch
    // tile or Ramadan on, flag off) are switched off too when the person leaves them unticked.
    if (next[id] && s.features[id]) continue;
    if (!next[id] && id === 'caregiving' && s.sync.share) continue;
    merged = { ...merged, ...featurePatch(merged, id, next[id]) };
  }
  return {
    features: merged.features,
    watchTile: merged.watchTile,
    celebrate: merged.celebrate,
    healthConnect: merged.healthConnect,
    ramadan: merged.ramadan,
  };
}

