import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { toDateKey } from '../domain/dates';
import { daysOfSupply, units } from '../domain/dose';
import { groupFromReminderId, groupKey, planReminders, refillText, REMINDER_PREFIX, reminderText, type PlannedReminder } from '../domain/reminders';
import { dosesOn, slotKey } from '../domain/schedule';
import { isCheck, type DoseStatus, type Medication } from '../domain/types';
import * as repo from '../db/repo';
import { routineAt } from '../domain/routines';
import { checkIsOn } from '../domain/checks';
import { PART_REMINDER_PREFIX, partReminderText, planPartReminders } from '../domain/machines';
import { setupTimerChannel, startFoodTimer } from './food';

// Android doesn't let an app change a channel's lock screen setting once it exists, so the
// channel got a new id when it became private. The old one is deleted in setupNotifications.
export const CHANNEL_ID = 'dose-reminders-private';
const OLD_CHANNEL_IDS = ['dose-reminders', 'refills'];
const REFILL_CHANNEL_ID = 'refills-private';
const CATEGORY_ID = 'dose';
/** Checks (blood sugar, blood pressure) are answered with a reading in the app, so they only get Snooze. */
const CHECK_CATEGORY_ID = 'check';
/** The evening "still not taken" notice: Taken, Didn't take (an honest miss) or Snooze. Skip stays in the app. */
const MISSED_CATEGORY_ID = 'missed';
export const ACTION_TAKEN = 'taken';
export const ACTION_SNOOZE = 'snooze';
const ACTION_SKIP = 'skip';
const ACTION_MISSED = 'missed';

// Android allows ~500 alarms per app; iOS keeps only 64 pending notifications.
const MAX_SCHEDULED = Platform.OS === 'ios' ? 60 : 300;
const HORIZON_DAYS = Platform.OS === 'ios' ? 3 : 10;
const MAX_PART_REMINDERS = 6;

let setupDone = false;

/** Channels and the Taken / Snooze / Skip (and Didn't take) buttons. Safe to call repeatedly. */
export async function setupNotifications() {
  if (setupDone) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Dose reminders',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 250, 400],
      // Private: when the phone hides sensitive content on the lock screen, the reminder
      // still shows there but without its text. Unlocked, it shows in full.
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      sound: 'default',
      bypassDnd: false,
    });
    await Notifications.setNotificationChannelAsync(REFILL_CHANNEL_ID, {
      name: 'Refill alerts',
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
    await setupTimerChannel().catch(() => {});
    for (const id of OLD_CHANNEL_IDS) await Notifications.deleteNotificationChannelAsync(id).catch(() => {});
  }
  const snooze = repo.getSettings().snoozeMinutes;
  await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
    { identifier: ACTION_TAKEN, buttonTitle: 'Taken', options: { opensAppToForeground: false } },
    { identifier: ACTION_SNOOZE, buttonTitle: `Snooze ${snooze} min`, options: { opensAppToForeground: false } },
    { identifier: ACTION_SKIP, buttonTitle: 'Skip', options: { opensAppToForeground: false, isDestructive: true } },
  ]);
  await Notifications.setNotificationCategoryAsync(MISSED_CATEGORY_ID, [
    { identifier: ACTION_TAKEN, buttonTitle: 'Taken', options: { opensAppToForeground: false } },
    { identifier: ACTION_MISSED, buttonTitle: "Didn't take", options: { opensAppToForeground: false } },
    { identifier: ACTION_SNOOZE, buttonTitle: `Snooze ${snooze} min`, options: { opensAppToForeground: false } },
  ]);
  await Notifications.setNotificationCategoryAsync(CHECK_CATEGORY_ID, [
    { identifier: ACTION_SNOOZE, buttonTitle: `Snooze ${snooze} min`, options: { opensAppToForeground: false } },
  ]);
  setupDone = true;
}

/** Call after the snooze length changes so the button label updates. */
export function resetNotificationSetup() {
  setupDone = false;
}

function contentFor(r: PlannedReminder, meds: Map<string, Medication>, showNames: boolean, routineName?: string): Notifications.NotificationContentInput {
  const due = r.medIds.map((id) => meds.get(id)).filter((m): m is Medication => !!m);
  const { title, body } = reminderText(r, due, showNames, routineName);
  if (r.kind === 'missed') {
    return {
      title,
      body,
      data: { date: r.date, time: r.time, medIds: r.medIds, slots: r.slots, group: groupKey(r.date, 'missed') },
      categoryIdentifier: MISSED_CATEGORY_ID,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.HIGH,
      autoDismiss: true,
    };
  }
  const onlyChecks = due.length > 0 && due.every(isCheck);
  return {
    title,
    body,
    data: { date: r.date, time: r.time, medIds: r.medIds, slots: r.slots, ...(onlyChecks ? { check: true } : {}) },
    categoryIdentifier: onlyChecks ? CHECK_CATEGORY_ID : CATEGORY_ID,
    sound: 'default',
    priority: Notifications.AndroidNotificationPriority.MAX,
    autoDismiss: true,
    threadIdentifier: groupKey(r.date, r.time),
  };
}

let running: Promise<void> | null = null;
let again = false;

/**
 * Cancels our pending reminders and schedules them again from the current data.
 * Runs after every change. Calls that overlap are merged into one extra pass.
 */
export function rescheduleAll(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await rescheduleOnce();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function rescheduleOnce() {
  await setupNotifications();
  const now = new Date();
  repo.pruneSnoozes(toDateKey(now));
  const settings = repo.getSettings();
  // Checks (blood sugar, blood pressure) whose feature is off get no reminders.
  const meds = repo.getMeds().filter((m) => checkIsOn(m, settings.features));
  // Machine parts (CPAP cushion, filter...) on the day they're due. They share the platform's
  // budget with dose reminders, so a handful at most, soonest first.
  const parts = planPartReminders(meds, now, Platform.OS === 'ios' ? HORIZON_DAYS : 60).slice(0, MAX_PART_REMINDERS);
  const plan = planReminders({
    meds,
    logs: new Map(repo.getLogs(toDateKey(new Date(now.getTime() - 2 * 86_400_000)), '9999-12-31').map((l) => [l.slot, l])),
    snoozes: repo.getSnoozes(),
    now,
    settings,
    horizonDays: HORIZON_DAYS,
    maxCount: MAX_SCHEDULED - parts.length,
  });

  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    existing
      .filter((n) => n.identifier.startsWith(REMINDER_PREFIX) || n.identifier.startsWith(PART_REMINDER_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );

  const byId = new Map(meds.map((m) => [m.id, m]));
  for (const r of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: r.id,
      content: contentFor(r, byId, settings.showMedNames, r.kind === 'missed' ? undefined : routineAt(r.time, settings.routines)?.name),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: r.at,
        channelId: CHANNEL_ID,
        delivery: settings.alarmStyle ? 'alarmClock' : 'bestEffort',
      },
    });
  }

  // Gentle: one reminder per part, no repeats.
  for (const p of parts) {
    const med = byId.get(p.medId);
    const part = med?.machine?.parts.find((x) => x.id === p.partId);
    if (!med || !part) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: p.id,
      content: { ...partReminderText(med.name, part.name, settings.showMedNames), data: { part: p.partId, medId: p.medId }, autoDismiss: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: REFILL_CHANNEL_ID },
    });
  }
}

/** Removes any reminder for this time slot that's showing in the notification shade. */
export async function dismissGroup(group: string) {
  const shown = await Notifications.getPresentedNotificationsAsync();
  await Promise.all(
    shown
      .filter((n) => groupFromReminderId(n.request.identifier) === group)
      .map((n) => Notifications.dismissNotificationAsync(n.request.identifier)),
  );
}

interface ReminderData {
  date: string;
  time: string;
  medIds: string[];
  /** Slot keys of the doses, in the same order as medIds. Older reminders don't have them. */
  slots: string[] | null;
  /** Which notification group to clear; defaults to the date and time. */
  group: string | null;
}

function readData(data: unknown): ReminderData | null {
  const d = data as Partial<ReminderData> | null;
  if (!d || typeof d.date !== 'string' || typeof d.time !== 'string' || !Array.isArray(d.medIds)) return null;
  const slots = Array.isArray(d.slots) && d.slots.length === d.medIds.length ? (d.slots as string[]) : null;
  return { date: d.date, time: d.time, medIds: d.medIds as string[], slots, group: typeof d.group === 'string' ? d.group : null };
}

type DoseRef = { slot: string; medId: string; date: string; time: string };

/**
 * The one way doses get answered: the app's screens, notification buttons, the home screen
 * widget and the watch tile all come through here. Each dose is logged with its own
 * scheduled time; doses already answered are left alone unless `replace` is set (the app's
 * own screens let you change an answer). Then the food timer starts, reminders for times
 * that are now done are cleared, low stock is announced and reminders are planned again.
 */
export async function answerDoses(
  doses: DoseRef[],
  status: DoseStatus,
  opts: { now?: Date; replace?: boolean; group?: string | null } = {},
) {
  const now = opts.now ?? new Date();
  const low: Medication[] = [];
  const taken: string[] = [];
  for (const d of doses) {
    if (!opts.replace && repo.getLog(d.slot)) continue; // already answered somewhere else
    low.push(...repo.setDose(d, status, now));
    if (status === 'taken') taken.push(d.medId);
  }
  if (taken.length) await startFoodTimer(taken, now).catch(() => {});
  await settleGroups(doses, opts.group ?? null);
  await notifyLowStock(low).catch(() => {});
  await rescheduleAll().catch((e) => console.warn('reschedule failed', e));
}

/**
 * For every time these doses belong to: once nothing there is still open, the snooze ends
 * and the reminder showing in the shade goes away. `extra` (the evening notice) always does.
 */
async function settleGroups(doses: DoseRef[], extra: string | null) {
  const groups = new Map<string, DoseRef>();
  for (const d of doses) groups.set(groupKey(d.date, d.time), d);
  const done: string[] = extra ? [extra] : [];
  for (const [group, d] of groups) {
    const open = dosesOn(repo.getMeds(), d.date).some((x) => x.time === d.time && !repo.getLog(x.slot));
    if (!open) done.push(group);
  }
  for (const group of done) {
    repo.clearSnooze(group);
    await dismissGroup(group).catch(() => {});
  }
}

/** Remind again in a few minutes (the snooze length from Settings) for everything due at this time. */
export async function snoozeGroup(group: string, minutes = repo.getSettings().snoozeMinutes) {
  repo.setSnooze(group, new Date(Date.now() + minutes * 60_000));
  await dismissGroup(group).catch(() => {});
  await rescheduleAll().catch((e) => console.warn('reschedule failed', e));
}

/**
 * Handles a tap on Taken / Snooze / Skip. Runs both from the app and from the
 * background task (Android runs it even when the app is closed). Repeating it is harmless.
 */
export async function handleReminderAction(actionId: string, rawData: unknown) {
  const data = readData(rawData);
  if (!data) return;
  const group = data.group ?? groupKey(data.date, data.time);
  if (actionId === ACTION_TAKEN || actionId === ACTION_SKIP || actionId === ACTION_MISSED) {
    // The doses as scheduled that day, so each is logged with its own time.
    const meds = repo.getMeds();
    const day = new Map(dosesOn(meds, data.date).map((d) => [d.slot, d]));
    // A check (blood sugar, blood pressure) is answered with a reading, so Taken leaves it open.
    const checks = new Set(meds.filter(isCheck).map((m) => m.id));
    const doses = data.medIds
      .map((medId, i) => {
        const slot = data.slots?.[i] ?? slotKey(medId, data.date, data.time);
        return day.get(slot) ?? { slot, medId, date: data.date, time: data.time };
      })
      .filter((d) => actionId === ACTION_SKIP || !checks.has(d.medId));
    const status: DoseStatus = actionId === ACTION_TAKEN ? 'taken' : actionId === ACTION_MISSED ? 'missed' : 'skipped';
    await answerDoses(doses, status, { group });
  } else if (actionId === ACTION_SNOOZE) {
    await snoozeGroup(group);
  }
  // A plain tap opens the app; nothing to record.
}

export async function notifyLowStock(meds: Medication[]) {
  for (const m of meds) {
    const days = daysOfSupply(m);
    const left = `${units(m.form, m.stock ?? 0)} left${days != null ? `, about ${days === 1 ? '1 day' : `${days} days`}` : ''}`;
    await Notifications.scheduleNotificationAsync({
      identifier: `refill:${m.id}`,
      content: {
        ...refillText(m.name, left, repo.getSettings().showMedNames),
        data: { medId: m.id },
      },
      trigger: Platform.OS === 'android' ? { channelId: REFILL_CHANNEL_ID } : null,
    });
  }
}

export async function sendTestReminder() {
  await setupNotifications();
  const at = new Date(Date.now() + 10_000);
  await Notifications.scheduleNotificationAsync({
    identifier: 'test-reminder',
    content: {
      title: 'Test reminder',
      body: 'If you can see this with buttons, reminders are working.',
      categoryIdentifier: CATEGORY_ID,
      sound: 'default',
      data: {},
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: at,
      channelId: CHANNEL_ID,
      delivery: repo.getSettings().alarmStyle ? 'alarmClock' : 'bestEffort',
    },
  });
}
