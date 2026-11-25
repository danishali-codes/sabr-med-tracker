import { DEFAULT_FEATURES, EMPTY_PROFILE, type FeatureFlags, type HealthProfile } from './features';
import { DEFAULT_DASHBOARD, type DashboardSettings } from './dashboard';
import type { DateKey, TimeOfDay } from './dates';

export type SchedulePattern =
  | { kind: 'daily' }
  /** days: 0 = Sunday ... 6 = Saturday */
  | { kind: 'weekdays'; days: number[] }
  /** Every N days or weeks, counted from the start date (e.g. every 2 weeks). */
  | { kind: 'interval'; every: number; unit: 'day' | 'week' }
  /** X days on, Y days off, repeating from the start date (e.g. 21 on / 7 off). */
  | { kind: 'cycle'; onDays: number; offDays: number }
  /** Once a month on this day (31 falls back to the month's last day). */
  | { kind: 'monthly'; dayOfMonth: number }
  /** No reminders; logged by hand from the Today screen. */
  | { kind: 'asNeeded' };

export interface Schedule {
  pattern: SchedulePattern;
  /** Times of day the dose is due, sorted "HH:MM". Empty for as-needed. */
  times: TimeOfDay[];
  startDate: DateKey;
  endDate?: DateKey | null;
  /**
   * Different times on some weekdays, e.g. Mon and Tue at 06:45. Each rule's times
   * replace `times` in order on those days (the first rule that lists a day wins).
   */
  dayTimes?: DayTimes[];
}

export interface DayTimes {
  /** 0 = Sunday ... 6 = Saturday */
  days: number[];
  times: TimeOfDay[];
}

/** "From 24 to 30 Nov, remind me at 9:00 instead of 8:00", for one med or all. Ends by itself. */
export interface TimeChange {
  id: string;
  from: DateKey;
  to: DateKey;
  /** null = every medication */
  medIds: string[] | null;
  /** Move every dose by this many minutes (can be negative)... */
  shiftMinutes?: number;
  /** ...or move doses at one time to another. */
  moveFrom?: TimeOfDay;
  moveTo?: TimeOfDay;
}

export type PrayerMethod = 'uae' | 'ummalqura' | 'mwl' | 'isna' | 'egypt' | 'karachi';

export interface RamadanSettings {
  enabled: boolean;
  from: DateKey;
  to: DateKey;
  /** null = every medication */
  medIds: string[] | null;
  /** Set the times yourself, or work them out from a city's prayer times. */
  mode: 'manual' | 'city';
  suhoor: TimeOfDay;
  iftar: TimeOfDay;
  cityId: string | null;
  method: PrayerMethod;
  /** City mode: suhoor dose this many minutes before Fajr, iftar dose this many after Maghrib. */
  suhoorBeforeFajr: number;
  iftarAfterMaghrib: number;
}

/** 'pill' is shown as "Tablet" (kept as the stored key so older data still reads). */
export type MedForm = 'pill' | 'capsule' | 'liquid' | 'injection' | 'drops' | 'inhaler' | 'spray' | 'patch' | 'cream' | 'sachet' | 'other';

export type FoodRule = 'empty' | 'with' | 'after';

export const FOOD_RULES: { value: FoodRule; label: string }[] = [
  { value: 'empty', label: 'Before food (empty stomach)' },
  { value: 'with', label: 'With food' },
  { value: 'after', label: 'After food' },
];

/**
 * A saved set of medicines you take together, e.g. "Work days" at 07:00 on Mon to Thu. On those
 * days Today shows them in one card with Take all, so they can be marked in one go. It doesn't
 * change any reminder times (routines do that).
 */
export interface DoseSet {
  id: string;
  name: string;
  time: TimeOfDay;
  /** 0 = Sunday ... 6 = Saturday. Empty = every day. */
  days: number[];
  medIds: string[];
}

/** Bottom tabs that can be hidden. Today is always there. */
export type TabId = 'meds' | 'health' | 'history' | 'progress';

/** A named reminder time shared by several medicines, e.g. "Breakfast" at 08:00. */
export interface Routine {
  id: string;
  name: string;
  time: TimeOfDay;
}

export type PillShape = 'round' | 'oval' | 'oblong' | 'capsule' | 'square' | 'diamond' | 'triangle';

export interface Medication {
  id: string;
  name: string;
  /** Strength of one unit, free text, e.g. "500 mg" or "5 mg/ml". */
  strength: string;
  /** How many units make one dose, e.g. 3 (tablets) or 5 (ml). Can be a fraction like 0.5. */
  amount: number;
  form: MedForm;
  /** Active ingredient(s), e.g. "paracetamol", filled from the medicine search. Used for interaction checks. */
  generic?: string | null;
  /** RxNorm concept id, when picked from the medicine search. */
  rxcui?: string | null;
  /** Accent colour used for the med's rings, tags and icon background. */
  color: string;
  /** What the pill looks like (tablets and capsules). */
  shape?: PillShape;
  /** Colour of the pill, or of the bottle/pen/etc. for other forms. */
  pillColor?: string;
  /** Second half of a two-colour capsule. */
  pillColor2?: string | null;
  /** A photo of the pill, stored on the phone only. */
  photo?: string | null;
  /** The box's barcode, so scanning it again finds this medicine. */
  barcode?: string | null;
  notes?: string;
  /** How it goes with food. 'empty' = on an empty stomach, wait `foodWaitMinutes` before eating. */
  food?: FoodRule | null;
  /** For 'empty': minutes to wait after taking it before eating; a timer tells you when. */
  foodWaitMinutes?: number | null;
  schedule: Schedule;
  /** Units (tablets, ml...) on hand; null when stock isn't tracked. Each dose uses `amount` units. */
  stock: number | null;
  /** Alert when stock falls to this many units or fewer. */
  refillAt: number | null;
  archived: boolean;
  /**
   * A supplement (vitamins, fish oil...): reminded like a medicine and shown with its own ring,
   * but left out of streaks, gold days and badges, so missing one never costs anything.
   */
  supplement?: boolean;
  /**
   * A home therapy machine (CPAP, nebulizer, oxygen...) instead of a medicine. Its "doses" are
   * check-ins ("Used it"), and its parts have their own replacement reminders. Like supplements,
   * machines never touch streaks, gold days or badges.
   */
  machine?: MachineInfo | null;
  /**
   * A health check (blood sugar, blood pressure) instead of a medicine. Its "doses" are the
   * times to check, answered by logging a reading. Never counts towards streaks or badges.
   */
  check?: CheckInfo | null;
  /** Breaks (e.g. "stop for a week"): no doses or reminders, and the streak isn't affected. `to` null = until resumed. */
  pauses?: { from: DateKey; to: DateKey | null }[];
  /** When it was archived; doses before this still show in history. */
  archivedAt?: string | null;
  createdAt: string;
}

/** Supplements are tracked on their own and never count towards streaks. */
export function isSupplement(med: Pick<Medication, 'supplement'> | undefined | null): boolean {
  return med?.supplement === true;
}

/** Machines are tracked on their own too, and never count towards streaks. */
export function isMachine(med: Pick<Medication, 'machine'> | undefined | null): boolean {
  return med?.machine != null;
}

/** Blood sugar and blood pressure checks are tracked on their own, and never count towards streaks. */
export function isCheck(med: Pick<Medication, 'check'> | undefined | null): boolean {
  return med?.check != null;
}

/** Medicines fill the rings and the streak; supplements, machines and checks have their own. */
export function countsForStreak(med: (Pick<Medication, 'supplement' | 'machine'> & Partial<Pick<Medication, 'check'>>) | undefined | null): boolean {
  return med != null && !isSupplement(med) && !isMachine(med) && !isCheck(med);
}

export type CheckType = 'sugar' | 'bp';

/** When a blood sugar reading is taken, relative to meals. */
export type SugarTiming = 'fasting' | 'beforeMeal' | 'afterMeal' | 'bedtime' | 'random';

export interface CheckInfo {
  type: CheckType;
  /** Blood sugar only: when this check is, e.g. fasting. */
  timing?: SugarTiming | null;
}

/** One blood sugar or blood pressure reading. Kept on the phone (and in encrypted backups) only. */
export interface Reading {
  id: string;
  type: CheckType;
  /** ISO timestamp of when it was measured. */
  at: string;
  date: DateKey;
  /** The check it answers, when it was logged from a reminder. */
  medId?: string | null;
  slot?: string | null;
  /** Blood sugar, always stored in mg/dL. */
  sugar?: number | null;
  timing?: SugarTiming | null;
  systolic?: number | null;
  diastolic?: number | null;
  pulse?: number | null;
  note?: string;
}

export type MachineType = 'cpap' | 'bipap' | 'nebulizer' | 'oxygen' | 'other';

export interface MachineInfo {
  type: MachineType;
  /** Parts that wear out, each with how often it's replaced. */
  parts: MachinePart[];
}

export interface MachinePart {
  id: string;
  name: string;
  /** Replace every this many days. */
  everyDays: number;
  /** When it was last replaced (or when tracking started). */
  lastChanged: DateKey;
}

/** How a night (or session) on a machine went. Everything is optional. */
export interface MachineNight {
  medId: string;
  /** The check-in day: a night belongs to the day it started. */
  date: DateKey;
  /** Hours used, e.g. 6.5. */
  hours?: number | null;
  /** When the mask went on and came off ("HH:MM"). With both, the hours are worked out. */
  start?: TimeOfDay | null;
  end?: TimeOfDay | null;
  /** Events per hour, from the machine's screen (CPAP). */
  ahi?: number | null;
  mask?: 'good' | 'some' | 'leaky' | null;
  note?: string;
}

export type DoseStatus = 'taken' | 'skipped';

/** A recorded dose. The slot identifies which scheduled dose it answers. */
export interface DoseLog {
  slot: string;
  medId: string;
  date: DateKey;
  time: TimeOfDay;
  status: DoseStatus;
  /** ISO timestamp of when it was taken or skipped. */
  at: string;
}

/** A dose the schedule says is due. */
export interface ScheduledDose {
  slot: string;
  medId: string;
  date: DateKey;
  /** When it's due on this day, after weekday times, Ramadan and temporary changes. */
  time: TimeOfDay;
  /** The usual time from the schedule, when it was moved. */
  usualTime?: TimeOfDay;
}

export interface Settings {
  /** Use Android's alarm-clock delivery so reminders are never delayed by battery saving. */
  alarmStyle: boolean;
  /** Keep re-alerting until the dose is answered. */
  nagEnabled: boolean;
  nagEveryMinutes: number;
  nagCount: number;
  snoozeMinutes: number;
  /** A dose within this many minutes of its time counts as on time. */
  onTimeWindowMinutes: number;
  /** Light, dark, or follow the phone. */
  appearance: 'system' | 'light' | 'dark';
  /** Confetti when the day's doses are all done. */
  celebrate: boolean;
  /** Pure black backgrounds in dark mode (saves battery on OLED screens). */
  trueBlack: boolean;
  /** Keep reminders on home time while abroad, instead of following the phone's clock. */
  travelMode: boolean;
  /** The home time zone (IANA name) used when travel mode is on. */
  homeTimeZone: string | null;
  ramadan: RamadanSettings;
  timeChanges: TimeChange[];
  /** No repeat reminders in these hours (the first reminder still comes). */
  quietHours: { enabled: boolean; from: TimeOfDay; to: TimeOfDay };
  /** One last notice in the evening listing doses not answered yet. */
  missedNotice: boolean;
  missedNoticeAt: TimeOfDay;
  /** Repeat reminders come closer together each time. */
  nagEscalate: boolean;
  /**
   * Online medicine search and interaction lookups (off by default). When off, the app
   * never goes online: search and the interaction check use only the built-in list and
   * anything already saved on the phone.
   */
  onlineLookups: boolean;
  /** Show medicine names in reminders and refill alerts (off by default, so they say "your medicine"). */
  showMedNames: boolean;
  /** Show medicine names on the home screen widget (off by default: it shows the dose and pill instead). */
  widgetShowNames: boolean;
  /**
   * Optional sync with the Sabr server or a PocketBase server you run. Off by default: with it off, nothing
   * ever leaves the phone. Everything sent is end-to-end encrypted first.
   */
  sync: SyncSettings;
  /** Following someone else's doses as their caregiver. */
  care: CareSettings;
  /** Ask for fingerprint, face or the phone's PIN to open the app. */
  appLock: boolean;
  /** Lock again after the app has been in the background this long (0 = straight away). */
  lockAfterMinutes: number;
  /** Blank the app in the recent apps screen (this also blocks screenshots). */
  hideInRecents: boolean;
  /** Named times, e.g. "Breakfast" at 08:00, that group the medicines due then. */
  routines: Routine[];
  /** Saved sets of medicines taken together on some days, marked with one tap on Today. */
  doseSets: DoseSet[];
  /** Which bottom tabs show (Today always does). */
  tabs: Record<TabId, boolean>;
  /** Suggest moving a reminder when you usually take the dose at another time. */
  smartTiming: boolean;
  /** A notice when the wait after an empty-stomach medicine is over. */
  foodTimers: boolean;
  /** Save an encrypted backup to a folder you chose, once a week. */
  autoBackup: AutoBackupSettings;
  /**
   * Today's progress on a Wear OS watch tile (off by default). Sent to the paired watch over
   * the Wear OS data layer; names are only included when showMedNames is on.
   */
  watchTile: boolean;
  /**
   * Read steps, sleep and heart rate from Health Connect (where Samsung Health shares them).
   * Off by default. Read-only, kept in memory on the phone, never saved or sent anywhere.
   */
  healthConnect: boolean;
  /** Show the advanced settings too (off: Settings shows only the everyday ones; search always finds everything). */
  showAdvanced: boolean;
  /**
   * Fully local: nothing goes online at all, whatever the other settings say. Online
   * search, server backup and sharing, following someone, Google Drive and the watch tile
   * all pause. Belongs to this phone, so restoring a backup doesn't change it.
   */
  fullyLocal: boolean;
  /** Which optional parts of Sabr are on. Off ones are hidden; their data is kept. */
  features: FeatureFlags;
  /** What the person told Sabr about their health. Kept on the phone (and in encrypted backups), never shared. */
  profile: HealthProfile;
  /** How blood sugar is shown and typed in. Readings are always stored in mg/dL. */
  sugarUnit: 'mgdl' | 'mmol';
  /** Setup (or, after updating, the one-time "choose your features" screen) has been finished or skipped. */
  setupDone: boolean;
  /** The Health tab's cards, their order, and the dates and stat it shows. */
  dashboard: DashboardSettings;
}

export interface AutoBackupSettings {
  enabled: boolean;
  /** Where automatic backups go: a folder on the phone, or your own Google Drive. */
  target: 'folder' | 'drive';
  /** Folder picked with the system file picker (a content:// address on Android). */
  folderUri: string | null;
  folderName: string | null;
  everyDays: number;
}

export interface SyncSettings {
  enabled: boolean;
  /** Keep an encrypted backup on your server. */
  backup: boolean;
  /** Let people you give a share code to see whether doses were taken. */
  share: boolean;
  /** Include medicine names and doses in what you share. Off: "Medicine A", "Medicine B". */
  shareNames: boolean;
  /** The name caregivers see, e.g. "Mum". */
  shareAs: string;
}

export interface CareSettings {
  /** Tell me when someone I follow hasn't marked a dose this long after it was due. */
  alerts: boolean;
  graceMinutes: number;
}

export const DEFAULT_SETTINGS: Settings = {
  alarmStyle: true,
  nagEnabled: true,
  nagEveryMinutes: 15,
  nagCount: 3,
  snoozeMinutes: 10,
  onTimeWindowMinutes: 60,
  appearance: 'system',
  celebrate: true,
  trueBlack: false,
  travelMode: false,
  homeTimeZone: null,
  ramadan: {
    enabled: false,
    from: '2027-02-08',
    to: '2027-03-09',
    medIds: null,
    mode: 'manual',
    suhoor: '04:30',
    iftar: '18:15',
    cityId: null,
    method: 'uae',
    suhoorBeforeFajr: 30,
    iftarAfterMaghrib: 0,
  },
  timeChanges: [],
  quietHours: { enabled: false, from: '23:00', to: '07:00' },
  missedNotice: true,
  missedNoticeAt: '22:00',
  nagEscalate: false,
  onlineLookups: false,
  showMedNames: false,
  widgetShowNames: false,
  sync: { enabled: false, backup: false, share: false, shareNames: false, shareAs: '' },
  care: { alerts: true, graceMinutes: 30 },
  appLock: false,
  lockAfterMinutes: 1,
  hideInRecents: false,
  routines: [],
  doseSets: [],
  tabs: { meds: true, health: true, history: true, progress: true },
  smartTiming: true,
  foodTimers: true,
  autoBackup: { enabled: false, target: 'folder', folderUri: null, folderName: null, everyDays: 7 },
  watchTile: false,
  healthConnect: false,
  showAdvanced: false,
  fullyLocal: false,
  features: DEFAULT_FEATURES,
  profile: EMPTY_PROFILE,
  sugarUnit: 'mgdl',
  setupDone: false,
  dashboard: DEFAULT_DASHBOARD,
};

/** How the day went: a mood from 1 (awful) to 5 (great), symptom tags and free text. */
export interface DayNote {
  date: DateKey;
  mood: 1 | 2 | 3 | 4 | 5 | null;
  symptoms: string[];
  text: string;
}

export const MOODS: { value: 1 | 2 | 3 | 4 | 5; label: string }[] = [
  { value: 1, label: 'Awful' },
  { value: 2, label: 'Bad' },
  { value: 3, label: 'Okay' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Great' },
];

export const COMMON_SYMPTOMS = ['Headache', 'Nausea', 'Dizzy', 'Tired', 'Stomach ache', 'Sleepy', "Can't sleep", 'Anxious', 'Low mood', 'Pain', 'Rash', 'Dry mouth'];
