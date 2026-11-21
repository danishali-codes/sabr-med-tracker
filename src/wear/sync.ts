import { Platform } from 'react-native';
import { SabrWear, type WatchStatus } from '../../modules/sabr-wear';
import { toDateKey } from '../domain/dates';
import { computeProgress } from '../domain/progress';
import { dosesOn, dueAt, groupByTime, indexLogs } from '../domain/schedule';
import * as repo from '../db/repo';
import { groupKey } from '../domain/reminders';
import { answerDoses, snoozeGroup } from '../notifications/reminders';
import { pushShare } from '../sync/engine';
import { refreshWidgetNow } from '../widget/update';
import { watchPayload } from './payload';

/** The watch tile, when it's switched on in Settings (off by default). */
function enabled() {
  const s = repo.getSettings();
  // Fully local pauses the tile too: away from Bluetooth, the watch connection can relay through Google.
  return Platform.OS === 'android' && SabrWear != null && s.watchTile === true && s.fullyLocal !== true;
}

function todayPayload(now = new Date()) {
  const date = toDateKey(now);
  const settings = repo.getSettings();
  // Health checks need a reading typed in on the phone, so the watch leaves them out.
  const meds = repo.getMeds().filter((m) => !m.check);
  const snoozes = new Map<string, number>();
  for (const [group, until] of repo.getSnoozes()) {
    const t = new Date(until).getTime();
    if (t > now.getTime()) snoozes.set(group, t);
  }
  let streak = 0;
  try {
    streak = computeProgress(repo.getDaySummaries(date)).currentStreak;
  } catch {
    // keep 0
  }
  return watchPayload({
    date,
    now,
    doses: dosesOn(meds, date),
    logs: indexLogs(repo.getLogs(date, date)),
    names: new Map(meds.map((m) => [m.id, m.name])),
    streak,
    showNames: settings.showMedNames,
    snoozes,
    dueAt: (d, t) => dueAt(d, t),
  });
}

/** Sends today's doses to the watch tile right away. Does nothing while the tile is off. */
export async function pushToWatchNow() {
  if (!enabled()) return;
  await SabrWear!.sendToday(JSON.stringify(todayPayload())).catch((e) => console.warn('Could not update the watch', e));
}

/** Takes everything off the watch, for when the tile is switched off. */
export async function clearWatch() {
  if (Platform.OS !== 'android' || !SabrWear) return;
  await SabrWear.clear().catch(() => {});
}

export async function watchStatus(): Promise<WatchStatus> {
  const none = { withSabr: [], others: [] };
  if (Platform.OS !== 'android' || !SabrWear) return none;
  return SabrWear.watchStatus().catch(() => none);
}

let pending: ReturnType<typeof setTimeout> | null = null;

/** Cheap to call often; calls are merged. */
function pushToWatch() {
  if (Platform.OS !== 'android' || !SabrWear) return;
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    pushToWatchNow();
  }, 500);
}

// Any change to doses, meds or settings updates the tile.
repo.subscribe(pushToWatch);

/**
 * Runs when the watch tile's Taken or Snooze is pressed (or it asks for fresh data), even
 * with the app closed. The watch sends only the day and time it showed.
 */
export async function handleWatchAction(data: { action?: string; body?: string }) {
  if (!enabled()) return;
  try {
    if (data.action === 'take' || data.action === 'snooze') await applyWatchPress(data.action, data.body);
  } finally {
    // Always answer with the phone's real state: the tile shows a press straight away, so a
    // press the phone turned down (not due yet, a new day) must be undone on the watch.
    await pushToWatchNow();
  }
}

async function applyWatchPress(action: 'take' | 'snooze', body: string | undefined) {
  let req: { date?: unknown; time?: unknown };
  try {
    req = JSON.parse(body ?? '{}');
  } catch {
    return;
  }
  const now = new Date();
  if (typeof req.date !== 'string' || typeof req.time !== 'string' || req.date !== toDateKey(now)) return;
  const group = groupByTime(dosesOn(repo.getMeds().filter((m) => !m.check), req.date)).find((g) => g.time === req.time);
  // A minute of grace: the watch's clock may run slightly ahead of the phone's.
  if (!group || dueAt(req.date, req.time).getTime() > now.getTime() + 60_000) return;
  const open = group.doses.filter((d) => !repo.getLog(d.slot));
  if (open.length === 0) return;
  // The same path as the notification and widget buttons.
  if (action === 'take') await answerDoses(open, 'taken', { now });
  else await snoozeGroup(groupKey(req.date, req.time));
  // The app may not be running, so update the widgets and caregivers before finishing.
  await refreshWidgetNow().catch(() => {});
  await pushShare().catch(() => {});
}
