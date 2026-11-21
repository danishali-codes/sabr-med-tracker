import { addDays, formatTime, toDateKey, type DateKey, type TimeOfDay } from './dates';
import { describeDose } from './dose';
import { dosesOn, dueAt, groupByTime } from './schedule';
import { checkReminderText } from './checks';
import { isCheck, isMachine, isSupplement, type DoseLog, type Medication, type Settings } from './types';

/** One reminder per time slot: all meds due at 8:00 share a notification. */
export function groupKey(date: DateKey, time: TimeOfDay): string {
  return `${date}|${time}`;
}

export const REMINDER_PREFIX = 'dose:';

function reminderId(group: string, k: number): string {
  return `${REMINDER_PREFIX}${group}|${k}`;
}

export function groupFromReminderId(id: string): string | null {
  if (!id.startsWith(REMINDER_PREFIX)) return null;
  const parts = id.slice(REMINDER_PREFIX.length).split('|');
  return parts.length >= 2 ? `${parts[0]}|${parts[1]}` : null;
}

export interface PlannedReminder {
  id: string;
  at: Date;
  date: DateKey;
  time: TimeOfDay;
  medIds: string[];
  /** The doses this reminder is for (their slot keys), so buttons log the right ones. */
  slots: string[];
  kind: 'due' | 'snoozed' | 'nag' | 'missed';
  /** Evening check only: the times of the doses it lists, earliest first. */
  doseTimes?: TimeOfDay[];
}

/** Whether a moment falls in quiet hours (which may run past midnight). */
export function inQuietHours(at: Date, q: Settings['quietHours']): boolean {
  if (!q?.enabled) return false;
  const m = at.getHours() * 60 + at.getMinutes();
  const [fh, fm] = q.from.split(':').map(Number);
  const [th, tm] = q.to.split(':').map(Number);
  const from = fh * 60 + fm;
  const to = th * 60 + tm;
  return from <= to ? m >= from && m < to : m >= from || m < to;
}

/** Minutes after the first reminder for each repeat. Escalating: each gap is shorter, never under 5 minutes. */
export function nagOffsets(count: number, every: number, escalate: boolean): number[] {
  const out: number[] = [];
  let t = 0;
  let gap = Math.max(1, every);
  for (let k = 1; k <= count; k++) {
    t += gap;
    out.push(t);
    if (escalate) gap = Math.max(5, Math.round(gap * 0.6));
  }
  return out;
}

/**
 * Works out every reminder that should be scheduled from now on.
 * - Doses already taken or skipped get no reminder.
 * - A snoozed slot restarts from the snooze time.
 * - With nagging on, follow-ups repeat every N minutes until answered.
 */
export function planReminders(opts: {
  meds: Medication[];
  logs: Map<string, DoseLog>;
  snoozes: Map<string, string>;
  now: Date;
  settings: Settings;
  horizonDays: number;
  maxCount: number;
}): PlannedReminder[] {
  const { meds, logs, snoozes, now, settings, horizonDays, maxCount } = opts;
  const today = toDateKey(now);
  const out: PlannedReminder[] = [];
  const nags = settings.nagEnabled ? nagOffsets(Math.max(0, settings.nagCount), settings.nagEveryMinutes, !!settings.nagEscalate) : [];
  // Supplements, machines and checks get one gentle reminder: no repeats unless a medicine is due at the same time.
  const supplements = new Set(meds.filter((m) => isSupplement(m) || isMachine(m) || isCheck(m)).map((m) => m.id));
  const machines = new Set(meds.filter((m) => isMachine(m) || isCheck(m)).map((m) => m.id));

  // Start yesterday so a late-night dose's follow-ups past midnight still fire.
  for (let i = -1; i <= horizonDays; i++) {
    const date = addDays(today, i);
    const unanswered: { medId: string; slot: string; time: TimeOfDay }[] = [];
    for (const group of groupByTime(dosesOn(meds, date))) {
      const pending = group.doses.filter((d) => !logs.has(d.slot));
      if (pending.length === 0) continue;
      const key = groupKey(date, group.time);
      const base = dueAt(date, group.time);
      // The evening check is about doses; machine check-ins and health checks have their own reminder.
      unanswered.push(...pending.filter((d) => !machines.has(d.medId)).map((d) => ({ medId: d.medId, slot: d.slot, time: group.time })));
      const snoozedUntil = snoozes.get(key);
      const snoozed = snoozedUntil != null && new Date(snoozedUntil).getTime() > base.getTime();
      const anchor = snoozed ? new Date(snoozedUntil!) : base;
      const onlySupplements = pending.every((d) => supplements.has(d.medId));
      [0, ...(onlySupplements ? [] : nags)].forEach((offset, k) => {
        const at = new Date(anchor.getTime() + offset * 60_000);
        if (at.getTime() <= now.getTime()) return;
        if (k > 0 && inQuietHours(at, settings.quietHours)) return;
        out.push({
          id: reminderId(key, k),
          at,
          date,
          time: group.time,
          medIds: pending.map((d) => d.medId),
          slots: pending.map((d) => d.slot),
          kind: k === 0 ? (snoozed ? 'snoozed' : 'due') : 'nag',
        });
      });
    }
    // One last notice in the evening for anything due earlier that day and still unanswered.
    if (settings.missedNotice && unanswered.length > 0) {
      const base = dueAt(date, settings.missedNoticeAt);
      const earlier = unanswered.filter((u) => dueAt(date, u.time).getTime() < base.getTime());
      // Snooze on this notice brings it back later, like any other reminder.
      const snoozedUntil = snoozes.get(groupKey(date, 'missed'));
      const at = snoozedUntil != null && new Date(snoozedUntil).getTime() > base.getTime() ? new Date(snoozedUntil) : base;
      if (earlier.length > 0 && at.getTime() > now.getTime()) {
        out.push({
          id: reminderId(groupKey(date, 'missed'), 0),
          at,
          date,
          time: settings.missedNoticeAt,
          medIds: earlier.map((u) => u.medId),
          slots: earlier.map((u) => u.slot),
          kind: 'missed',
          doseTimes: [...new Set(earlier.map((u) => u.time))].sort(),
        });
      }
    }
  }
  out.sort((a, b) => a.at.getTime() - b.at.getTime());
  return out.slice(0, maxCount);
}

/**
 * The words a reminder shows. Medicine names are only included when the person turned
 * them on, so by default nothing on the lock screen or a watch says what they take.
 */
export function reminderText(
  r: Pick<PlannedReminder, 'kind' | 'time' | 'doseTimes'>,
  meds: (Pick<Medication, 'name' | 'strength' | 'amount' | 'form' | 'supplement' | 'machine'> & Partial<Pick<Medication, 'schedule' | 'check'>>)[],
  showNames: boolean,
  /** The routine's name, e.g. "Breakfast", when this time has one. */
  routine?: string,
): { title: string; body: string } {
  const t = reminderTextPlain(r, meds, showNames);
  if (!routine || r.kind === 'missed') return t;
  const title = r.kind === 'nag' ? `Still waiting: ${routine}` : r.kind === 'snoozed' ? `Snoozed: ${routine}` : `${routine}: ${t.title.charAt(0).toLowerCase()}${t.title.slice(1)}`;
  return { ...t, title };
}

function reminderTextPlain(
  r: Pick<PlannedReminder, 'kind' | 'time' | 'doseTimes'>,
  meds: (Pick<Medication, 'name' | 'strength' | 'amount' | 'form' | 'supplement' | 'machine'> & Partial<Pick<Medication, 'schedule' | 'check'>>)[],
  showNames: boolean,
): { title: string; body: string } {
  const when = formatTime(r.time);
  // Blood sugar or blood pressure checks: a reading to log, not a dose.
  const checks = meds.filter(isCheck);
  if (checks.length > 0 && checks.length === meds.length && r.kind !== 'missed') return checkReminderText(r.kind, when, checks, showNames);
  if (checks.length > 0) {
    const t = reminderTextPlain(r, meds.filter((m) => !isCheck(m)), showNames);
    return { ...t, body: `${t.body}, and ${checks.length === 1 ? 'a check' : `${checks.length} checks`}` };
  }
  // A machine on its own (CPAP at bedtime): a check-in, not a dose.
  if (meds.length > 0 && meds.every(isMachine) && r.kind !== 'missed') {
    if (!showNames) {
      const title = r.kind === 'nag' ? `Still waiting: ${when} check-in` : r.kind === 'snoozed' ? `Snoozed reminder: ${when} check-in` : `Time for your ${when} check-in`;
      return { title, body: 'Tap Taken once it\'s on.' };
    }
    const names = listWords(meds.map((m) => m.name));
    const title = r.kind === 'snoozed' ? `Snoozed reminder: ${names}` : `Time for your ${names}`;
    return { title, body: 'Tap Taken once it\'s on.' };
  }
  const supps = meds.filter(isSupplement).length;
  const allSupps = meds.length > 0 && supps === meds.length;
  const count = allSupps
    ? meds.length === 1
      ? '1 supplement'
      : `${meds.length} supplements`
    : supps > 0
      ? `${meds.length - supps} ${meds.length - supps === 1 ? 'medicine' : 'medicines'} and ${supps} ${supps === 1 ? 'supplement' : 'supplements'}`
      : meds.length === 1
        ? '1 medicine'
        : `${meds.length} medicines`;
  if (r.kind === 'missed') {
    // Times aren't private, so even with names hidden the notice says which doses it means.
    const from = r.doseTimes?.length ? ` from ${listWords(r.doseTimes.map(formatTime))}` : '';
    if (!showNames) {
      const title =
        meds.length === 1
          ? `You haven't logged your ${r.doseTimes?.length ? `${formatTime(r.doseTimes[0])} ` : ''}${allSupps ? 'supplement' : 'dose'} today`
          : `${meds.length} doses not logged today`;
      return { title, body: meds.length === 1 ? 'Tap Taken if you already had it.' : `${count}${from}. Tap Taken if you already had them.` };
    }
    const list = meds.map((m) => `${m.name} (${describeDose(m)})`).join(', ');
    return { title: meds.length === 1 ? `Did you take ${meds[0].name}?` : `${meds.length} doses not logged today`, body: `${list}. Tap Taken if you already had them.` };
  }
  if (!showNames) {
    const what = allSupps ? (meds.length === 1 ? 'supplement' : 'supplements') : 'dose';
    const title =
      r.kind === 'nag' ? `Still waiting: ${when} ${what}` : r.kind === 'snoozed' ? `Snoozed reminder: ${when} ${what}` : `Time for your ${when} ${what}`;
    return { title, body: `${count} to take` };
  }
  const title =
    r.kind === 'nag'
      ? `Still waiting: ${when} meds`
      : r.kind === 'snoozed'
        ? `Snoozed reminder: ${when} meds`
        : meds.length === 1
          ? `Time for ${meds[0].name}`
          : `Time for your ${when} meds`;
  return { title, body: meds.map((m) => `${m.name} (${describeDose(m)})`).join(', ') };
}

/** "a", "a and b", "a, b and c". */
function listWords(xs: string[]): string {
  return xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/** Refill alert words, without the name unless the person turned names on. */
export function refillText(name: string, left: string, showNames: boolean): { title: string; body: string } {
  return showNames
    ? { title: `Running low on ${name}`, body: `${left}. Time to order a refill.` }
    : { title: 'Running low on a medicine', body: 'Open the app to see which one needs a refill.' };
}
