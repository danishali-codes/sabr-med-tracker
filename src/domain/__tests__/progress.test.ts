import { describe, expect, it } from 'vitest';
import { addDays, eachDay } from '../dates';
import { BADGES, COINS, adherence, computeProgress, isGoldDay, medDays, medStreak, summarizeDay, type DaySummary } from '../progress';
import { indexLogs, slotKey } from '../schedule';
import type { DoseLog, Medication } from '../types';

const med = (id: string, times = ['08:00', '20:00']): Medication => ({
  id,
  name: id,
  strength: '1 mg',
  amount: 1,
  form: 'pill',
  color: '#000',
  schedule: { pattern: { kind: 'daily' }, times, startDate: '2026-11-01' },
  stock: null,
  refillAt: null,
  archived: false,
  createdAt: '2026-11-01T00:00:00Z',
});

const take = (medId: string, date: string, time: string, at: Date): DoseLog => ({
  slot: slotKey(medId, date, time),
  medId,
  date,
  time,
  status: 'taken',
  at: at.toISOString(),
});

const local = (date: string, hh: number, mm = 0) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, hh, mm);
};

const day = (status: DaySummary['status'], extra: Partial<DaySummary> = {}): DaySummary => ({
  date: '2026-11-01',
  scheduled: 1,
  taken: status === 'complete' ? 1 : 0,
  onTime: status === 'complete' ? 1 : 0,
  late: 0,
  skipped: 0,
  status,
  ...extra,
});

describe('summarizeDay', () => {
  const meds = [med('a')];

  it('a morning dose taken in the evening still completes the day (late, not missed)', () => {
    const logs = indexLogs([take('a', '2026-11-03', '08:00', local('2026-11-03', 19)), take('a', '2026-11-03', '20:00', local('2026-11-03', 20, 5))]);
    const s = summarizeDay(meds, logs, '2026-11-03', '2026-11-04', 60);
    expect(s.status).toBe('complete');
    expect(s.late).toBe(1);
    expect(s.onTime).toBe(1);
  });

  it('a dose taken well before its time is early: it completes the day but is not on time', () => {
    // 8:00 PM dose taken at 6:30 PM, outside the 60 minute window.
    const logs = indexLogs([take('a', '2026-11-03', '08:00', local('2026-11-03', 8)), take('a', '2026-11-03', '20:00', local('2026-11-03', 18, 30))]);
    const s = summarizeDay(meds, logs, '2026-11-03', '2026-11-04', 60);
    expect(s.status).toBe('complete');
    expect(s.onTime).toBe(1);
    expect(s.early).toBe(1);
    expect(s.late).toBe(1);
    expect(isGoldDay(s)).toBe(false);
    // Within the window counts as on time, even if a little early.
    const close = summarizeDay(meds, indexLogs([take('a', '2026-11-03', '08:00', local('2026-11-03', 7, 15)), take('a', '2026-11-03', '20:00', local('2026-11-03', 20))]), '2026-11-03', '2026-11-04', 60);
    expect(close.early).toBe(0);
    expect(isGoldDay(close)).toBe(true);
  });

  it('the early bird badge is hidden and earned by an early dose', () => {
    const bird = BADGES.find((b) => b.id === 'early_bird')!;
    expect(bird.hidden).toBe(true);
    expect(bird.earned(computeProgress([day('complete')]))).toBe(false);
    expect(bird.earned(computeProgress([day('complete', { onTime: 0, late: 1, early: 1 })]))).toBe(true);
  });

  it('a dose never taken makes a finished day partial', () => {
    const logs = indexLogs([take('a', '2026-11-03', '08:00', local('2026-11-03', 8))]);
    expect(summarizeDay(meds, logs, '2026-11-03', '2026-11-04', 60).status).toBe('partial');
    expect(summarizeDay(meds, new Map(), '2026-11-03', '2026-11-04', 60).status).toBe('missed');
  });

  it('today stays pending until every dose is answered', () => {
    expect(summarizeDay(meds, new Map(), '2026-11-04', '2026-11-04', 60).status).toBe('pending');
  });

  it('skipping on purpose is neutral', () => {
    const skip: DoseLog = { ...take('a', '2026-11-03', '08:00', local('2026-11-03', 8)), status: 'skipped' };
    const logs = indexLogs([skip, take('a', '2026-11-03', '20:00', local('2026-11-03', 20))]);
    expect(summarizeDay(meds, logs, '2026-11-03', '2026-11-04', 60).status).toBe('complete');
  });
});

describe('computeProgress', () => {
  it('counts the streak and ignores days without doses', () => {
    const p = computeProgress([day('complete'), day('none'), day('complete'), day('pending')]);
    expect(p.currentStreak).toBe(2);
    expect(p.bestStreak).toBe(2);
  });

  it('a missed day resets the streak when there is no freeze', () => {
    const p = computeProgress([day('complete'), day('complete'), day('missed'), day('complete')]);
    expect(p.currentStreak).toBe(1);
    expect(p.bestStreak).toBe(2);
  });

  it('7 perfect days earn a freeze that saves the streak on a missed day', () => {
    const days = [...Array(7)].map(() => day('complete'));
    const p = computeProgress([...days, { ...day('partial'), date: '2026-11-08' }, day('complete')]);
    expect(p.currentStreak).toBe(8);
    expect(p.freezes).toBe(0);
    expect(p.frozenDays.has('2026-11-08')).toBe(true);
  });

  it('freezes cap at two', () => {
    const p = computeProgress([...Array(28)].map(() => day('complete')));
    expect(p.freezes).toBe(2);
  });

  it('awards coins for doses, perfect days and milestones', () => {
    const p = computeProgress([...Array(7)].map(() => day('complete')));
    expect(p.coinsEarned).toBe(7 * (COINS.onTime + COINS.perfectDay) + COINS.milestones[7]);
  });

  it('counts a finished perfect month', () => {
    const days = eachDay('2026-11-01', '2026-12-01').map((d) => ({ ...day('complete'), date: d }));
    days[days.length - 1].status = 'pending';
    expect(computeProgress(days).perfectMonths).toBe(1);
  });
});

describe('medStreak', () => {
  it('counts back from today, not counting an unfinished today against it', () => {
    const m = med('a', ['08:00']);
    const logs = indexLogs(
      ['2026-11-01', '2026-11-02', '2026-11-03'].map((d) => take('a', d, '08:00', local(d, 8))),
    );
    expect(medStreak(m, logs, '2026-11-04')).toBe(3);
    expect(medStreak(m, logs, addDays('2026-11-04', 1))).toBe(0);
  });
});

describe('trackedFrom', () => {
  it('does not count days before a med was added, even with an earlier start date', () => {
    const m = { ...med('a', ['08:00']), createdAt: new Date(2026, 10, 10, 12).toISOString() };
    const s = summarizeDay([m], new Map(), '2026-11-05', '2026-11-12', 60);
    expect(s.status).toBe('none');
    expect(summarizeDay([m], new Map(), '2026-11-11', '2026-11-12', 60).status).toBe('missed');
  });
});

describe("I didn't take it (missed)", () => {
  const miss = (medId: string, date: string, time: string): DoseLog => ({ ...take(medId, date, time, local(date, 21)), status: 'missed' });
  const skip = (medId: string, date: string, time: string): DoseLog => ({ ...take(medId, date, time, local(date, 9)), status: 'skipped' });
  const meds = [med('a')];

  it('settles today straight away as a partial day, not pending', () => {
    const logs = indexLogs([take('a', '2026-11-04', '08:00', local('2026-11-04', 8)), miss('a', '2026-11-04', '20:00')]);
    const s = summarizeDay(meds, logs, '2026-11-04', '2026-11-04', 60);
    expect(s).toMatchObject({ taken: 1, missed: 1, skipped: 0, status: 'partial' });
    expect(adherence([s])).toBe(0.5);
  });

  it('is not the neutral skip: a day of skips stays neutral, a day of misses is missed', () => {
    const skipped = summarizeDay(meds, indexLogs([skip('a', '2026-11-03', '08:00'), skip('a', '2026-11-03', '20:00')]), '2026-11-03', '2026-11-04', 60);
    expect(skipped.status).toBe('none');
    const missed = summarizeDay(meds, indexLogs([miss('a', '2026-11-03', '08:00'), miss('a', '2026-11-03', '20:00')]), '2026-11-03', '2026-11-04', 60);
    expect(missed.status).toBe('missed');
  });

  it('uses a freeze or breaks the streak like any missed day', () => {
    const p = computeProgress([day('complete', { date: '2026-11-02' }), day('missed', { date: '2026-11-03', missed: 1 })]);
    expect(p.currentStreak).toBe(0);
  });

  it('marks the medicine missed today and breaks its own streak', () => {
    const logs = indexLogs([miss('a', '2026-11-04', '08:00')]);
    expect(medDays(meds[0], logs, '2026-11-04', 1)).toEqual([{ date: '2026-11-04', mark: 'missed' }]);
    expect(medStreak(meds[0], indexLogs([miss('a', '2026-11-03', '08:00'), miss('a', '2026-11-03', '20:00')]), '2026-11-04')).toBe(0);
  });
});
