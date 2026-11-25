import { formatTime, timeFromDate, type DateKey } from '../domain/dates';
import { groupKey } from '../domain/reminders';
import type { DoseLog, ScheduledDose } from '../domain/types';

/**
 * What the phone sends to the watch tile. Kept small on purpose: counts, times and each
 * dose's state. Medicine names are only included when "Show medicine names" is on.
 */
export interface WatchPayload {
  v: 1;
  date: DateKey;
  /** When this was made, so the watch can tell how old it is. */
  made: number;
  done: number;
  total: number;
  streak: number;
  /** Every dose today in time order: t = time (HH:MM), s = state. Draws the ring. */
  marks: { t: string; s: 'taken' | 'skipped' | 'missed' | 'open' }[];
  /**
   * Today's full list for the watch app (tap the tile): every dose in time order. `name` only
   * when names are on; otherwise `what` says how much, e.g. "2 tablets".
   */
  list?: { t: string; label: string; name: string | null; what: string; s: 'taken' | 'skipped' | 'missed' | 'open'; at: string | null }[];
  /** Times that still have doses to take, earliest first. */
  open: { time: string; label: string; at: number; count: number; names: string | null; snoozedUntil: number | null }[];
}

export function watchPayload(input: {
  date: DateKey;
  now: Date;
  doses: ScheduledDose[];
  logs: Map<string, DoseLog>;
  names: Map<string, string>;
  /** How much each dose is, without the name ("2 tablets"). */
  amounts?: Map<string, string>;
  streak: number;
  showNames: boolean;
  /** Snoozed times: group key (date|time) to when the snooze ends. */
  snoozes?: Map<string, number>;
  dueAt: (date: DateKey, time: string) => Date;
}): WatchPayload {
  const { date, doses, logs, names, showNames } = input;
  const sorted = [...doses].sort((a, b) => a.time.localeCompare(b.time));
  const open = new Map<string, ScheduledDose[]>();
  for (const d of sorted) {
    if (logs.has(d.slot)) continue;
    open.set(d.time, [...(open.get(d.time) ?? []), d]);
  }
  return {
    v: 1,
    date,
    made: input.now.getTime(),
    // Taken or skipped; a dose marked missed leaves the open list but isn't done.
    done: sorted.filter((d) => { const st = logs.get(d.slot)?.status; return st === 'taken' || st === 'skipped'; }).length,
    total: sorted.length,
    streak: input.streak,
    marks: sorted.map((d) => ({ t: d.time, s: logs.get(d.slot)?.status ?? 'open' })),
    list: sorted.map((d) => {
      const log = logs.get(d.slot);
      return {
        t: d.time,
        label: formatTime(d.time),
        name: showNames ? (names.get(d.medId) ?? 'Medicine') : null,
        what: input.amounts?.get(d.medId) ?? '',
        s: log?.status ?? 'open',
        at: log ? formatTime(timeFromDate(new Date(log.at))) : null,
      };
    }),
    open: [...open.entries()].map(([time, group]) => {
      const first = names.get(group[0].medId) ?? 'Medicine';
      return {
        time,
        label: formatTime(time),
        at: input.dueAt(date, time).getTime(),
        count: group.length,
        names: showNames ? (group.length > 1 ? `${first} +${group.length - 1}` : first) : null,
        snoozedUntil: input.snoozes?.get(groupKey(date, time)) ?? null,
      };
    }),
  };
}
