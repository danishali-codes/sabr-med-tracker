import { addDays, atTime, diffDays, eachDay, formatTime, type DateKey, type TimeOfDay } from './dates';
import { dosesOn } from './schedule';
import { isMachine, type DoseLog, type MachineNight, type MachinePart, type MachineType, type Medication } from './types';

// Home therapy machines (CPAP, nebulizer, oxygen...). A machine is stored as a Medication
// with `machine` set: its schedule gives the check-in reminder ("Used it"), and its parts
// get replacement reminders. Nothing here ever counts towards streaks.

export interface MachineKind {
  type: MachineType;
  label: string;
  /** What a check-in is called on this machine. */
  checkIn: string;
  /** Ionicons name. */
  icon: 'moon-outline' | 'cloud-outline' | 'water-outline' | 'hardware-chip-outline';
  /** Usual check-in time for a new one. */
  time: TimeOfDay;
  /** Usual replacement schedule, as a starting point the person can change. */
  parts: { name: string; everyDays: number }[];
  /** Whether nights get hours, AHI and mask fit. */
  nightly: boolean;
}

export const MACHINE_KINDS: MachineKind[] = [
  {
    type: 'cpap',
    label: 'CPAP / APAP',
    checkIn: 'Nightly check-in',
    icon: 'moon-outline',
    time: '22:30',
    nightly: true,
    parts: [
      { name: 'Mask cushion', everyDays: 14 },
      { name: 'Air filter', everyDays: 30 },
      { name: 'Tubing', everyDays: 90 },
      { name: 'Mask', everyDays: 90 },
      { name: 'Headgear', everyDays: 180 },
      { name: 'Water chamber', everyDays: 180 },
    ],
  },
  {
    type: 'bipap',
    label: 'BiPAP / ventilator',
    checkIn: 'Nightly check-in',
    icon: 'moon-outline',
    time: '22:30',
    nightly: true,
    parts: [
      { name: 'Mask cushion', everyDays: 14 },
      { name: 'Air filter', everyDays: 30 },
      { name: 'Tubing', everyDays: 90 },
      { name: 'Mask', everyDays: 90 },
      { name: 'Headgear', everyDays: 180 },
      { name: 'Water chamber', everyDays: 180 },
    ],
  },
  {
    type: 'nebulizer',
    label: 'Nebulizer',
    checkIn: 'Session',
    icon: 'cloud-outline',
    time: '08:00',
    nightly: false,
    parts: [
      { name: 'Nebulizer cup', everyDays: 30 },
      { name: 'Tubing', everyDays: 30 },
      { name: 'Mask or mouthpiece', everyDays: 90 },
      { name: 'Air filter', everyDays: 30 },
    ],
  },
  {
    type: 'oxygen',
    label: 'Oxygen concentrator',
    checkIn: 'Daily check-in',
    icon: 'water-outline',
    time: '09:00',
    nightly: false,
    parts: [
      { name: 'Nasal cannula', everyDays: 14 },
      { name: 'Tubing', everyDays: 60 },
      { name: 'Clean the filter', everyDays: 7 },
      { name: 'Humidifier bottle', everyDays: 30 },
    ],
  },
  {
    type: 'other',
    label: 'Other machine',
    checkIn: 'Check-in',
    icon: 'hardware-chip-outline',
    time: '09:00',
    nightly: false,
    parts: [],
  },
];

export function machineKind(type: MachineType | undefined): MachineKind {
  return MACHINE_KINDS.find((k) => k.type === type) ?? MACHINE_KINDS[MACHINE_KINDS.length - 1];
}

/** The line under a machine's name, e.g. "Nightly check-in". */
export function describeMachine(med: Pick<Medication, 'machine' | 'schedule'>): string {
  const kind = machineKind(med.machine?.type);
  return med.schedule.pattern.kind === 'asNeeded' ? 'Log when used' : kind.checkIn;
}

// ---- parts ----

export function partDueDate(part: MachinePart): DateKey {
  return addDays(part.lastChanged, Math.max(1, Math.round(part.everyDays)));
}

/** Days until the part is due: 0 = today, negative = overdue. */
export function partDaysLeft(part: MachinePart, today: DateKey): number {
  return diffDays(today, partDueDate(part));
}

/** "Due today", "2 days overdue", "In 5 days", "In 3 weeks". */
export function partDueText(part: MachinePart, today: DateKey): string {
  const n = partDaysLeft(part, today);
  if (n === 0) return 'Due today';
  if (n < 0) return n === -1 ? '1 day overdue' : `${-n} days overdue`;
  if (n === 1) return 'Due tomorrow';
  if (n < 14) return `In ${n} days`;
  if (n < 60) return `In ${Math.round(n / 7)} weeks`;
  return `In ${Math.round(n / 30)} months`;
}

/** "Every 2 weeks", "Every month", "Every 10 days". */
export function everyText(days: number): string {
  if (days === 1) return 'Every day';
  if (days % 30 === 0 && days >= 30) return days === 30 ? 'Every month' : `Every ${days / 30} months`;
  if (days % 7 === 0) return days === 7 ? 'Every week' : `Every ${days / 7} weeks`;
  return `Every ${days} days`;
}

/** Common replacement intervals for the picker. */
export const EVERY_OPTIONS = [7, 14, 30, 60, 90, 180, 365];

export interface DuePart {
  med: Medication;
  part: MachinePart;
  daysLeft: number;
}

/** Parts on active machines due within `withinDays` (overdue ones included), soonest first. */
export function partsDue(meds: Medication[], today: DateKey, withinDays = 0): DuePart[] {
  const out: DuePart[] = [];
  for (const med of meds) {
    if (med.archived || !med.machine) continue;
    for (const part of med.machine.parts) {
      const daysLeft = partDaysLeft(part, today);
      if (daysLeft <= withinDays) out.push({ med, part, daysLeft });
    }
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft || a.part.name.localeCompare(b.part.name));
}

/** The machine with this part marked as replaced on `date`. */
export function markPartChanged(med: Medication, partId: string, date: DateKey): Medication {
  if (!med.machine) return med;
  return { ...med, machine: { ...med.machine, parts: med.machine.parts.map((p) => (p.id === partId ? { ...p, lastChanged: date } : p)) } };
}

export function defaultParts(type: MachineType, today: DateKey, newId: () => string): MachinePart[] {
  return machineKind(type).parts.map((p) => ({ id: newId(), name: p.name, everyDays: p.everyDays, lastChanged: today }));
}

export interface PartReminder {
  id: string;
  at: Date;
  medId: string;
  partId: string;
}

export const PART_REMINDER_PREFIX = 'part:';

/**
 * One reminder per part on the day it's due, at the machine's check-in time (when you're
 * next to it), or 9:00 for a machine logged when used. Only future ones, within the horizon.
 */
export function planPartReminders(meds: Medication[], now: Date, horizonDays: number): PartReminder[] {
  const out: PartReminder[] = [];
  const limit = now.getTime() + horizonDays * 86_400_000;
  for (const med of meds) {
    if (med.archived || !med.machine) continue;
    const time = med.schedule.pattern.kind !== 'asNeeded' && med.schedule.times[0] ? med.schedule.times[0] : '09:00';
    for (const part of med.machine.parts) {
      const at = atTime(partDueDate(part), time);
      if (at.getTime() <= now.getTime() || at.getTime() > limit) continue;
      out.push({ id: `${PART_REMINDER_PREFIX}${med.id}|${part.id}`, at, medId: med.id, partId: part.id });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Part reminder words, without the machine or part unless names are on. */
export function partReminderText(machineName: string, partName: string, showNames: boolean): { title: string; body: string } {
  return showNames
    ? { title: `Time to change your ${machineName} ${partName.toLowerCase()}`, body: 'Tap Changed in Sabr once it\'s done.' }
    : { title: 'A part is due for a change', body: 'Open Sabr to see which one.' };
}

// ---- nights ----

export interface MachineUsage {
  /** Check-ins due in the range. */
  due: number;
  /** How many of them were "Used it". */
  used: number;
  /** Average hours over nights that have hours. */
  avgHours: number | null;
  /** Nights with 4 hours or more (the usual CPAP compliance mark). */
  fourHourNights: number;
  nightsWithHours: number;
  avgAhi: number | null;
}

/** How a machine was used over a range of days (both ends included). */
export function machineUsage(med: Medication, logs: Map<string, DoseLog>, nights: MachineNight[], from: DateKey, to: DateKey): MachineUsage {
  let due = 0;
  let used = 0;
  for (const date of eachDay(from, to)) {
    for (const d of dosesOn([med], date)) {
      due++;
      if (logs.get(d.slot)?.status === 'taken') used++;
    }
  }
  const mine = nights.filter((n) => n.medId === med.id && n.date >= from && n.date <= to);
  const hours = mine.map((n) => nightHours(n)).filter((h): h is number => h != null && Number.isFinite(h));
  const ahi = mine.map((n) => n.ahi).filter((a): a is number => a != null && Number.isFinite(a));
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  return {
    due,
    used,
    avgHours: avg(hours),
    fourHourNights: hours.filter((h) => h >= 4).length,
    nightsWithHours: hours.length,
    avgAhi: avg(ahi),
  };
}

/** Parses "6.5", "6,5" or "6:30" into hours; null when empty or not a sensible number. */
export function parseHours(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const hm = /^(\d{1,2}):(\d{2})$/.exec(t);
  const n = hm ? Number(hm[1]) + Number(hm[2]) / 60 : Number(t.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 24 ? Math.round(n * 10) / 10 : null;
}

export function parseAhi(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n < 200 ? Math.round(n * 10) / 10 : null;
}

/** "6.5 h · AHI 2.1 · Some leaks" */
export function describeNight(n: MachineNight | null | undefined): string {
  if (!n) return '';
  const mask = n.mask === 'good' ? 'Good seal' : n.mask === 'some' ? 'Some leaks' : n.mask === 'leaky' ? 'Leaky' : null;
  const h = nightHours(n);
  const span = n.start && n.end ? `${formatTime(n.start)} to ${formatTime(n.end)}` : n.start ? `On at ${formatTime(n.start)}` : null;
  return [h != null ? `${h} h` : null, span, n.ahi != null ? `AHI ${n.ahi}` : null, mask].filter(Boolean).join(' · ');
}

export function machinesOf(meds: Medication[]): Medication[] {
  return meds.filter((m) => !m.archived && isMachine(m));
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** Hours between mask on and mask off, across midnight if needed (23:10 to 06:40 = 7.5). */
export function hoursBetween(start: string, end: string): number {
  let diff = toMinutes(end) - toMinutes(start);
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 10) / 10;
}

/** The night's hours: typed in, or worked out from mask on and off. */
export function nightHours(n: Pick<MachineNight, 'hours' | 'start' | 'end'> | null | undefined): number | null {
  if (!n) return null;
  if (n.hours != null && Number.isFinite(n.hours)) return n.hours;
  if (n.start && n.end) return hoursBetween(n.start, n.end);
  return null;
}

/**
 * The average of clock times around midnight, e.g. 23:30 and 00:30 average to 00:00, not noon.
 * Times are moved to minutes from noon first, so an evening and the small hours sit together.
 */
export function averageClock(times: string[]): string | null {
  if (times.length === 0) return null;
  const fromNoon = times.map((t) => (toMinutes(t) - 12 * 60 + 24 * 60) % (24 * 60));
  const avg = Math.round(fromNoon.reduce((a, b) => a + b, 0) / fromNoon.length);
  const m = (avg + 12 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Spread of clock times in minutes (how much bedtime moves about), using the same noon trick. */
export function clockSpread(times: string[]): number | null {
  if (times.length < 2) return null;
  const fromNoon = times.map((t) => (toMinutes(t) - 12 * 60 + 24 * 60) % (24 * 60));
  const mean = fromNoon.reduce((a, b) => a + b, 0) / fromNoon.length;
  const sd = Math.sqrt(fromNoon.reduce((a, b) => a + (b - mean) ** 2, 0) / fromNoon.length);
  return Math.round(sd);
}
