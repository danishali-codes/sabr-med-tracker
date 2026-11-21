import { addDays, type DateKey } from '../domain/dates';
import { describeDose } from '../domain/dose';
import { dosesOn, dueAt } from '../domain/schedule';
import { isCheck, isMachine, type DoseLog, type Medication } from '../domain/types';

/**
 * What a caregiver sees: the last couple of days' doses and whether each was answered.
 * Built on the patient's phone, encrypted, and only then sent. Medicine names are left
 * out unless the patient chooses to share them.
 */
export interface CareDose {
  date: DateKey;
  /** Absolute due time (ISO), so it reads right in the caregiver's own time zone. */
  due: string;
  label: string;
  dose: string;
  status: 'taken' | 'skipped' | 'open';
  /** When it was answered (ISO). */
  at?: string;
}

export interface CareStatus {
  v: 1;
  name: string;
  updatedAt: string;
  doses: CareDose[];
  /** Done / due per day for the last week, oldest first. */
  week: { date: DateKey; done: number; total: number }[];
}

export function buildStatus(opts: {
  meds: Medication[];
  logs: Map<string, DoseLog>;
  today: DateKey;
  now: Date;
  name: string;
  showNames: boolean;
}): CareStatus {
  const { meds, logs, today, now, name, showNames } = opts;
  // Machines (CPAP and the like) and health checks aren't medicines, so they're never shared.
  const active = meds.filter((m) => !m.archived && !isMachine(m) && !isCheck(m));
  const labelOf = (id: string) => {
    const i = active.findIndex((m) => m.id === id);
    const med = active[i];
    if (showNames && med) return med.name;
    return `Medicine ${String.fromCharCode(65 + Math.max(0, i) % 26)}`;
  };
  const doses: CareDose[] = [];
  for (const date of [addDays(today, -1), today]) {
    for (const d of dosesOn(active, date)) {
      const log = logs.get(d.slot);
      const med = active.find((m) => m.id === d.medId);
      doses.push({
        date,
        due: dueAt(date, d.time).toISOString(),
        label: labelOf(d.medId),
        dose: showNames && med ? describeDose(med) : '',
        status: log ? log.status : 'open',
        ...(log ? { at: log.at } : {}),
      });
    }
  }
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const date = addDays(today, -i);
    const due = dosesOn(active, date);
    week.push({ date, done: due.filter((d) => logs.get(d.slot)?.status === 'taken').length, total: due.length });
  }
  return { v: 1, name, updatedAt: now.toISOString(), doses, week };
}

/** Doses still not answered this long after they were due. */
export function overdue(status: CareStatus, now: Date, graceMinutes: number): CareDose[] {
  return status.doses.filter((d) => d.status === 'open' && new Date(d.due).getTime() + graceMinutes * 60_000 <= now.getTime());
}

/** When the caregiver should next be told, if a dose is still open by then. */
export function nextAlerts(status: CareStatus, now: Date, graceMinutes: number): { at: Date; dose: CareDose }[] {
  return status.doses
    .filter((d) => d.status === 'open')
    .map((dose) => ({ at: new Date(new Date(dose.due).getTime() + graceMinutes * 60_000), dose }))
    .filter((a) => a.at.getTime() > now.getTime());
}

export function parseStatus(json: string): CareStatus {
  const s = JSON.parse(json) as CareStatus;
  if (s?.v !== 1 || !Array.isArray(s.doses)) throw new Error('This share is from a newer version of the app');
  return s;
}
