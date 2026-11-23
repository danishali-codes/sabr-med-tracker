import { timeFromDate, toDateKey, type DateKey } from './domain/dates';
import { groupKey } from './domain/reminders';
import { markPartChanged } from './domain/machines';
import type { DoseStatus, Medication, Reading } from './domain/types';
import * as repo from './db/repo';
import { answerDoses, notifyLowStock, rescheduleAll, snoozeGroup } from './notifications/reminders';
import { recalcFoodTimer, startFoodTimer } from './notifications/food';

/** Log, change or clear (null) a dose from inside the app, then refresh reminders. */
export async function logDose(
  dose: { slot: string; medId: string; date: DateKey; time: string },
  status: DoseStatus | null,
) {
  if (status) return answerDoses([dose], status, { replace: true });
  repo.setDose(dose, null);
  await rescheduleAll().catch((e) => console.warn('reschedule failed', e));
}

/** "Take all": every open dose at one time, logged together. `at` = taken earlier than now. */
export async function takeDoses(doses: { slot: string; medId: string; date: DateKey; time: string }[], at?: Date) {
  await answerDoses(doses, 'taken', at ? { now: at } : {});
}

/**
 * Taken at another time: marks doses as taken at `at` (for one you forgot to tick), or moves
 * the time of doses already taken. Stock isn't used twice.
 */
export async function setTakenAt(doses: { slot: string; medId: string; date: DateKey; time: string }[], at: Date) {
  for (const d of doses) {
    const log = repo.getLog(d.slot);
    if (log?.status === 'taken') repo.setTakenTime(d.slot, at);
  }
  const open = doses.filter((d) => repo.getLog(d.slot)?.status !== 'taken');
  if (open.length) await answerDoses(open, 'taken', { now: at, replace: true });
  else await rescheduleAll().catch((e) => console.warn('reschedule failed', e));
  // An empty-stomach wait follows the corrected time.
  await recalcFoodTimer().catch(() => {});
}

/** As-needed meds: record a dose right now. */
export async function logAsNeeded(med: Medication) {
  const now = new Date();
  const date = toDateKey(now);
  const time = timeFromDate(now);
  const slot = `${med.id}|${date}|prn-${now.getTime()}`;
  const low = repo.setDose({ slot, medId: med.id, date, time }, 'taken', now);
  startFoodTimer([med.id], now).catch(() => {});
  await notifyLowStock(low).catch(() => {});
}

/** Saves a medicine. Usual times that were moved carry today's logged doses along. */
export async function saveMedication(med: Medication, moves: { from: string; to: string }[] = []) {
  repo.saveMedMoved(med, moves, toDateKey(new Date()));
  await rescheduleAll().catch((e) => console.warn('reschedule failed', e));
}

export async function removeMedication(id: string) {
  repo.deleteMed(id);
  await rescheduleAll().catch((e) => console.warn('reschedule failed', e));
}

/** Remind again in a few minutes for every dose due at this time. */
export async function snoozeDoses(date: DateKey, time: string, minutes: number) {
  await snoozeGroup(groupKey(date, time), minutes).catch((e) => console.warn('snooze failed', e));
}

/** A machine part (CPAP cushion, filter...) was replaced today: its next reminder moves on. */
export async function changePart(medId: string, partId: string, date: DateKey = toDateKey(new Date())) {
  const med = repo.getMed(medId);
  if (!med?.machine) return;
  repo.saveMed(markPartChanged(med, partId, date));
  await rescheduleAll().catch((e) => console.warn('reschedule failed', e));
}

/**
 * Saves a blood sugar or blood pressure reading. When it answers a scheduled check, that
 * check is marked done too (checks never count towards the streak).
 */
export async function saveReading(r: Reading, dose?: { slot: string; medId: string; date: DateKey; time: string } | null) {
  repo.saveReading(r);
  const log = dose ? repo.getLog(dose.slot) : null;
  if (dose && log?.status !== 'taken') await answerDoses([dose], 'taken', { replace: true });
  else await rescheduleAll().catch((e) => console.warn('reschedule failed', e));
}

/** Deletes a reading. The check it answered is open again. */
export async function deleteReading(r: Reading) {
  repo.deleteReading(r.id);
  const log = r.slot ? repo.getLog(r.slot) : null;
  if (log) await logDose(log, null);
}
