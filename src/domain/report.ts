// The doctor report: what was due, taken, late, skipped or missed over a period,
// per medication and per day, plus mood and symptom notes. Pure, so it's tested.
import { diffDays, eachDay, formatDateLong, formatTime, toDateKey, type DateKey } from './dates';
import { describeDose } from './dose';
import { trackedFrom } from './progress';
import { describeSchedule, dosesOn, dueAt, punctuality } from './schedule';
import { bpStats, formatReading, readingLevelLabel, sugarStats, timingLabel, formatSugar, type SugarUnit } from './checks';
import type { DayNote, DoseLog, Medication, Reading } from './types';

export interface MedReport {
  id: string;
  name: string;
  generic: string | null;
  dose: string;
  schedule: string;
  due: number;
  taken: number;
  onTime: number;
  late: number;
  skipped: number;
  missed: number;
  /** Taken out of due, ignoring skipped doses (skipping on purpose isn't non-adherence). */
  adherence: number | null;
  /** Dates of missed doses (and their times). */
  missedDoses: { date: DateKey; time: string }[];
  /** Extra as-needed doses taken in the period. */
  asNeededTaken: number;
}

export interface DayReport {
  date: DateKey;
  due: number;
  taken: number;
  late: number;
  skipped: number;
  missed: number;
  note: DayNote | null;
}

export interface Report {
  from: DateKey;
  to: DateKey;
  days: number;
  meds: MedReport[];
  daily: DayReport[];
  totals: { due: number; taken: number; onTime: number; late: number; skipped: number; missed: number; adherence: number | null };
  notes: DayNote[];
  /** How often each symptom was noted, most frequent first. */
  symptoms: { name: string; days: number }[];
  /** Average mood (1 to 5) over days with a mood, or null. */
  averageMood: number | null;
}

/**
 * Builds the report for `from`..`to` (inclusive). Doses later today that aren't due
 * yet count as neither taken nor missed.
 */
export function buildReport(opts: {
  meds: Medication[];
  logs: DoseLog[];
  notes: DayNote[];
  from: DateKey;
  to: DateKey;
  now: Date;
  windowMinutes: number;
}): Report {
  const { meds, from, to, now, windowMinutes } = opts;
  const notes = new Map(opts.notes.map((n) => [n.date, n]));
  const per = new Map<string, MedReport>();
  for (const m of meds) {
    per.set(m.id, {
      id: m.id,
      name: m.name,
      generic: m.generic ?? null,
      dose: describeDose(m),
      schedule: describeSchedule(m.schedule),
      due: 0,
      taken: 0,
      onTime: 0,
      late: 0,
      skipped: 0,
      missed: 0,
      adherence: null,
      missedDoses: [],
      asNeededTaken: 0,
    });
  }
  for (const l of opts.logs) {
    if (l.date >= from && l.date <= to && l.slot.includes('|prn-') && l.status === 'taken') {
      const r = per.get(l.medId);
      if (r) r.asNeededTaken++;
    }
  }

  // Scheduled-dose logs by day and med, so logs can be matched even if the schedule changed since.
  const logsByDay = new Map<string, DoseLog[]>();
  for (const l of opts.logs) {
    if (l.slot.includes('|prn-')) continue;
    const k = `${l.date}|${l.medId}`;
    logsByDay.set(k, [...(logsByDay.get(k) ?? []), l]);
  }

  const daily: DayReport[] = [];
  for (const date of eachDay(from, to)) {
    const day: DayReport = { date, due: 0, taken: 0, late: 0, skipped: 0, missed: 0, note: notes.get(date) ?? null };
    const scheduled = dosesOn(
      meds.filter((m) => trackedFrom(m) <= date),
      date,
    );
    const count = (medId: string, log: DoseLog | undefined, time: string) => {
      const r = per.get(medId);
      if (!r) return;
      r.due++;
      day.due++;
      if (!log) {
        r.missed++;
        day.missed++;
        r.missedDoses.push({ date, time });
        return;
      }
      if (log.status === 'skipped') {
        r.skipped++;
        day.skipped++;
        return;
      }
      r.taken++;
      day.taken++;
      if (punctuality({ date, time: log.time }, new Date(log.at), windowMinutes) === 'onTime') r.onTime++;
      else {
        r.late++;
        day.late++;
      }
    };
    const medIds = new Set([...scheduled.map((d) => d.medId), ...meds.map((m) => m.id).filter((id) => logsByDay.has(`${date}|${id}`))]);
    for (const medId of medIds) {
      const doses = scheduled.filter((d) => d.medId === medId);
      // Logs record what was actually due that day: match them by slot, then pair any
      // left over (the schedule's times changed since) with unmatched doses in order.
      const dayLogs = [...(logsByDay.get(`${date}|${medId}`) ?? [])].sort((x, y) => x.time.localeCompare(y.time));
      const bySlot = new Map(dayLogs.map((l) => [l.slot, l]));
      const unmatchedDoses = doses.filter((d) => !bySlot.has(d.slot));
      const leftLogs = dayLogs.filter((l) => !doses.some((d) => d.slot === l.slot));
      for (const d of doses) if (bySlot.has(d.slot)) count(medId, bySlot.get(d.slot), d.time);
      for (const l of leftLogs) {
        const d = unmatchedDoses.shift();
        count(medId, l, d?.time ?? l.time);
      }
      for (const d of unmatchedDoses) {
        // Not due yet, or due earlier today: neither taken nor missed until the day is over.
        if (dueAt(date, d.time) > now || diffDays(date, toDateKey(now)) <= 0) continue;
        count(medId, undefined, d.time);
      }
    }
    daily.push(day);
  }

  const medList = [...per.values()]
    .map((r) => ({ ...r, adherence: r.due - r.skipped > 0 ? r.taken / (r.due - r.skipped) : null }))
    .filter((r) => r.due > 0 || r.asNeededTaken > 0);
  const t = medList.reduce(
    (a, r) => ({ due: a.due + r.due, taken: a.taken + r.taken, onTime: a.onTime + r.onTime, late: a.late + r.late, skipped: a.skipped + r.skipped, missed: a.missed + r.missed }),
    { due: 0, taken: 0, onTime: 0, late: 0, skipped: 0, missed: 0 },
  );
  const noteList = [...notes.values()].filter((n) => n.date >= from && n.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  const counts = new Map<string, number>();
  for (const n of noteList) for (const s of n.symptoms) counts.set(s, (counts.get(s) ?? 0) + 1);
  const moods = noteList.map((n) => n.mood).filter((m): m is NonNullable<typeof m> => m != null);
  return {
    from,
    to,
    days: diffDays(from, to) + 1,
    meds: medList,
    daily,
    totals: { ...t, adherence: t.due - t.skipped > 0 ? t.taken / (t.due - t.skipped) : null },
    notes: noteList,
    symptoms: [...counts.entries()].map(([name, days]) => ({ name, days })).sort((a, b) => b.days - a.days || a.name.localeCompare(b.name)),
    averageMood: moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null,
  };
}

const pct = (v: number | null) => (v == null ? '–' : `${Math.round(v * 100)}%`);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A printable A4 page for the report. Plain HTML and CSS so it prints the same everywhere. */
export function reportHtml(
  r: Report,
  opts: { patient?: string; generatedAt: Date; windowMinutes: number; readings?: Reading[]; sugarUnit?: SugarUnit },
): string {
  const range = `${formatDateLong(r.from)} to ${formatDateLong(r.to)}`;
  const medRows = r.meds
    .map(
      (m) => `<tr>
        <td><b>${esc(m.name)}</b>${m.generic && m.generic.toLowerCase() !== m.name.toLowerCase() ? `<div class="sub">${esc(m.generic)}</div>` : ''}</td>
        <td>${esc(m.dose)}<div class="sub">${esc(m.schedule)}</div></td>
        <td class="n">${m.due}</td><td class="n">${m.taken}</td><td class="n">${m.late}</td><td class="n">${m.skipped}</td><td class="n ${m.missed ? 'bad' : ''}">${m.missed}</td>
        <td class="n"><b>${pct(m.adherence)}</b>${m.asNeededTaken ? `<div class="sub">+${m.asNeededTaken} as needed</div>` : ''}</td>
      </tr>`,
    )
    .join('');
  const missed = r.meds
    .filter((m) => m.missedDoses.length)
    .map(
      (m) =>
        `<li><b>${esc(m.name)}:</b> ${m.missedDoses
          .slice(0, 40)
          .map((x) => `${formatDateLong(x.date)} ${formatTime(x.time)}`)
          .join('; ')}${m.missedDoses.length > 40 ? ` and ${m.missedDoses.length - 40} more` : ''}</li>`,
    )
    .join('');
  const cells = r.daily
    .map((d) => {
      const cls = d.due === 0 ? 'none' : d.missed === 0 && d.taken + d.skipped === d.due ? 'ok' : d.taken === 0 ? 'miss' : 'part';
      return `<div class="cell ${cls}" title="${d.date}">${Number(d.date.slice(8))}</div>`;
    })
    .join('');
  const noteRows = r.notes
    .map(
      (n) =>
        `<tr><td>${formatDateLong(n.date)}</td><td class="n">${n.mood ?? '–'}</td><td>${esc(n.symptoms.join(', '))}</td><td>${esc(n.text)}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 16mm; }
  body { font-family: -apple-system, Roboto, 'Segoe UI', Arial, sans-serif; color: #1d1b2c; font-size: 11pt; }
  h1 { font-size: 20pt; margin: 0 0 2pt; } h2 { font-size: 13pt; margin: 18pt 0 6pt; border-bottom: 1px solid #ddd; padding-bottom: 3pt; }
  .muted, .sub { color: #6b6880; } .sub { font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 5pt 4pt; border-bottom: 1px solid #eee; vertical-align: top; }
  th { font-size: 9pt; color: #6b6880; font-weight: 600; } .n { text-align: right; } .bad { color: #c62d4a; font-weight: 700; }
  .totals { display: flex; gap: 10pt; margin-top: 8pt; } .tile { flex: 1; background: #f4f3fa; border-radius: 8pt; padding: 8pt; }
  .tile b { font-size: 16pt; display: block; }
  .grid { display: flex; flex-wrap: wrap; gap: 3pt; } .cell { width: 18pt; height: 18pt; border-radius: 4pt; font-size: 7pt; display: flex; align-items: center; justify-content: center; color: #fff; }
  .ok { background: #16a374; } .part { background: #e59a10; } .miss { background: #d9415d; } .none { background: #e6e5ee; color: #888; }
  .legend span { display: inline-block; width: 9pt; height: 9pt; border-radius: 2pt; margin: 0 3pt 0 10pt; vertical-align: middle; }
  footer { margin-top: 20pt; font-size: 8.5pt; color: #6b6880; }
  </style></head><body>
  <h1>Medication report</h1>
  <div class="muted">${opts.patient ? `${esc(opts.patient)} · ` : ''}${range} (${r.days} days)</div>
  <div class="totals">
    <div class="tile"><b>${pct(r.totals.adherence)}</b>Doses taken</div>
    <div class="tile"><b>${r.totals.onTime}</b>On time</div>
    <div class="tile"><b>${r.totals.late}</b>Late, same day</div>
    <div class="tile"><b>${r.totals.missed}</b>Missed</div>
    <div class="tile"><b>${r.totals.skipped}</b>Skipped on purpose</div>
  </div>
  <h2>Medications</h2>
  <table><tr><th>Medication</th><th>Dose and schedule</th><th class="n">Due</th><th class="n">Taken</th><th class="n">Late</th><th class="n">Skipped</th><th class="n">Missed</th><th class="n">Taken %</th></tr>${medRows || '<tr><td colspan="8" class="muted">No scheduled doses in this period.</td></tr>'}</table>
  <h2>Day by day</h2>
  <div class="grid">${cells}</div>
  <div class="legend sub" style="margin-top:6pt"><span class="ok"></span>All taken<span class="part"></span>Some missed<span class="miss"></span>All missed<span class="none"></span>Nothing due</div>
  ${missed ? `<h2>Missed doses</h2><ul>${missed}</ul>` : ''}
  ${
    r.notes.length
      ? `<h2>How they felt</h2>
  <div class="muted">${r.averageMood != null ? `Average mood ${r.averageMood.toFixed(1)} out of 5. ` : ''}${r.symptoms.length ? `Symptoms noted: ${r.symptoms.map((s) => `${esc(s.name)} (${s.days} ${s.days === 1 ? 'day' : 'days'})`).join(', ')}.` : ''}</div>
  <table style="margin-top:6pt"><tr><th>Date</th><th class="n">Mood (1–5)</th><th>Symptoms</th><th>Note</th></tr>${noteRows}</table>`
      : ''
  }
  ${opts.readings?.length ? readingsHtml(opts.readings, opts.sugarUnit ?? 'mgdl') : ''}
  <footer>Made with Sabr on ${formatDateLong(toDateKey(opts.generatedAt))}. "Late" means taken the same day but outside the on-time window (more than ${opts.windowMinutes} minutes from the scheduled time). This report is based on what was logged in the app.</footer>
  </body></html>`;
}

/** Blood sugar and blood pressure readings, when the person chose to include them. */
function readingsHtml(readings: Reading[], unit: SugarUnit): string {
  const part = (type: Reading['type']) => {
    const xs = readings.filter((x) => x.type === type);
    if (!xs.length) return '';
    let summary = '';
    if (type === 'sugar') {
      const st = sugarStats(xs);
      summary = `${st.count} readings, average ${st.average != null ? formatSugar(st.average, unit) : '–'}. In range ${st.inRange}, above target ${st.high}, low ${st.low} (targets 80–130 fasting or before meals, under 180 after meals).`;
    } else {
      const st = bpStats(xs);
      summary = `${st.count} readings, average ${st.systolic}/${st.diastolic}${st.pulse != null ? `, pulse ${st.pulse}` : ''}.`;
    }
    const rows = xs
      .map((x) => {
        const at = new Date(x.at);
        const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
        return `<tr><td>${formatDateLong(x.date)} ${formatTime(time)}</td><td>${esc(formatReading(x, unit))}</td><td>${esc(readingLevelLabel(x))}</td><td>${esc([type === 'sugar' ? timingLabel(x.timing) : '', x.note ?? ''].filter(Boolean).join(' · '))}</td></tr>`;
      })
      .join('');
    return `<h3>${type === 'sugar' ? 'Blood sugar' : 'Blood pressure'}</h3><div class="muted">${summary}</div>
  <table style="margin-top:6pt"><tr><th>When</th><th>Reading</th><th>Level</th><th>Notes</th></tr>${rows}</table>`;
  };
  return `<h2>Readings</h2>${part('sugar')}${part('bp')}`;
}
