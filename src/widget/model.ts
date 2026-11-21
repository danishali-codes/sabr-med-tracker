import { addDays, diffDays, formatTime, timeFromDate, toDateKey, weekdayOf, type DateKey } from '../domain/dates';
import { describeDose } from '../domain/dose';
import { adherence, computeProgress, isGoldDay, type DaySummary } from '../domain/progress';
import { groupKey } from '../domain/reminders';
import { dosesOn, dueAt, groupByTime, indexLogs, punctuality } from '../domain/schedule';
import { countsForStreak, type DoseLog, type Medication, type ScheduledDose, type Settings } from '../domain/types';
import { lookOf } from '../components/pillLook';

export type PillLook = ReturnType<typeof lookOf>;

export interface WidgetRow {
  slot: string;
  time: string;
  label: string;
  /** The medicine's name, or its dose ("500 mg · 1 tablet") when names are hidden. */
  title: string;
  /** The dose under the name; empty when names are hidden (the title already says it). */
  detail: string;
  pill: PillLook;
  status: 'taken' | 'skipped' | 'open';
  due: boolean;
  /** The scheduled dose, so a tap on the row logs exactly this one. */
  dose: ScheduledDose;
}

export interface WidgetData {
  date: DateKey;
  done: number;
  total: number;
  /** Doses taken (not skipped) today, and how many of those were on time. */
  taken: number;
  onTime: number;
  /** Share of this week's doses answered so far (0 to 1), or null before any were due. */
  week: number | null;
  streak: number;
  /** Every dose today is answered. */
  complete: boolean;
  /** Complete, and every dose taken was on time: a gold day. */
  gold: boolean;
  /** Medicine names are shown only when the person turned that on. */
  showNames: boolean;
  snoozeMinutes: number;
  /** The earliest time today with doses still open. */
  next: {
    time: string;
    label: string;
    /** "Metformin +1" with names on, "2 medicines" with them off. */
    names: string;
    due: boolean;
    /** "8:10 PM" while a snooze is running for this time. */
    snoozedUntil: string | null;
    pills: PillLook[];
    doses: ScheduledDose[];
  } | null;
  /** Doses still to take today (taken and skipped ones left out), by time, for the bigger list widget. */
  rows: WidgetRow[];
  /** This week, Monday first, for the tallest widget. */
  days: WidgetDay[];
}

export interface WidgetDay {
  date: DateKey;
  /** M, T, W... */
  letter: string;
  mark: 'gold' | 'complete' | 'partial' | 'missed' | 'none' | 'future';
  today: boolean;
}

export interface WidgetInput {
  now: Date;
  meds: Medication[];
  logs: DoseLog[];
  summaries: DaySummary[];
  snoozes: Map<string, string>;
  settings: Pick<Settings, 'onTimeWindowMinutes' | 'snoozeMinutes' | 'widgetShowNames'>;
}

const count = (n: number) => (n === 1 ? '1 medicine' : `${n} medicines`);

/** Everything the widgets show, worked out from plain data so it can be tested. */
export function buildWidgetData({ now, meds, logs: logList, summaries, snoozes, settings }: WidgetInput): WidgetData {
  const today = toDateKey(now);
  // Health checks are answered with a reading in the app, so the widgets leave them out.
  const doses = dosesOn(meds.filter((m) => !m.check), today);
  const logs = indexLogs(logList);
  const byId = new Map(meds.map((m) => [m.id, m]));
  const showNames = !!settings.widgetShowNames;

  // The rings and colours follow medicines only, like the app; supplements and machines still show in the lists.
  const counted = doses.filter((d) => countsForStreak(byId.get(d.medId)));
  const taken = counted.filter((d) => logs.get(d.slot)?.status === 'taken');
  const onTime = taken.filter((d) => punctuality(d, new Date(logs.get(d.slot)!.at), settings.onTimeWindowMinutes) === 'onTime').length;
  const done = counted.filter((d) => logs.has(d.slot)).length;
  const complete = counted.length > 0 && done === counted.length;

  let streak = 0;
  try {
    streak = computeProgress(summaries).currentStreak;
  } catch {
    // keep 0
  }
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  const week = adherence(summaries.filter((s) => diffDays(monday, s.date) >= 0 && diffDays(s.date, today) >= 0));
  const byDate = new Map(summaries.map((s) => [s.date, s]));
  const days: WidgetDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const sum = byDate.get(date);
    const mark: WidgetDay['mark'] =
      diffDays(today, date) > 0
        ? 'future'
        : isGoldDay(sum)
          ? 'gold'
          : sum?.status === 'complete'
            ? 'complete'
            : sum?.status === 'missed'
              ? 'missed'
              : sum && sum.taken + sum.skipped > 0
                ? 'partial'
                : 'none';
    return { date, letter: 'MTWTFSS'[i], mark, today: date === today };
  });

  const open = groupByTime(doses)
    .map((g) => ({ ...g, doses: g.doses.filter((d) => !logs.has(d.slot)) }))
    .find((g) => g.doses.length > 0);
  let next: WidgetData['next'] = null;
  if (open) {
    const first = byId.get(open.doses[0].medId)?.name ?? 'Medicine';
    const until = snoozes.get(groupKey(today, open.time));
    const untilDate = until ? new Date(until) : null;
    next = {
      time: open.time,
      label: formatTime(open.time),
      names: showNames ? (open.doses.length > 1 ? `${first} +${open.doses.length - 1}` : first) : count(open.doses.length),
      due: dueAt(today, open.time) <= now,
      snoozedUntil: untilDate && untilDate > now ? formatTime(timeFromDate(untilDate)) : null,
      pills: open.doses.slice(0, 3).map((d) => look(byId.get(d.medId))),
      doses: open.doses,
    };
  }

  return {
    date: today,
    done,
    total: counted.length,
    taken: taken.length,
    onTime,
    week,
    streak,
    complete,
    gold: complete && taken.length > 0 && onTime === taken.length,
    showNames,
    snoozeMinutes: settings.snoozeMinutes,
    next,
    days,
    rows: doses
      .filter((d) => !logs.has(d.slot))
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((d) => {
        const log = logs.get(d.slot);
        const med = byId.get(d.medId);
        const dose = med ? describeDose(med) : '';
        return {
          slot: d.slot,
          time: d.time,
          label: formatTime(d.time),
          title: showNames ? (med?.name ?? 'Medicine') : dose || 'Medicine',
          detail: showNames ? dose : '',
          pill: look(med),
          status: log ? log.status : 'open',
          due: dueAt(today, d.time) <= now,
          dose: d,
        };
      }),
  };
}

function look(med: Medication | undefined): PillLook {
  return med ? lookOf(med) : { form: 'pill', shape: 'round', color: '#FFFFFF', color2: null };
}
