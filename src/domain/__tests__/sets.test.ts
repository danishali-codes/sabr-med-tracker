import { describe, expect, it } from 'vitest';
import { describeDays, setsOn, setAppliesOn, takenAtFor } from '../sets';
import { averageClock, clockSpread, hoursBetween, nightHours } from '../machines';
import { sleepTrend } from '../sleep';
import type { DoseLog, DoseSet, ScheduledDose } from '../types';

const dose = (medId: string, time: string, date = '2026-11-23'): ScheduledDose => ({ slot: `${medId}|${date}|${time}`, medId, date, time });

describe('dose sets', () => {
  const work: DoseSet = { id: 's1', name: 'Work days', time: '07:00', days: [1, 2, 3, 4], medIds: ['a', 'b', 'c'] };

  it('applies on its days only, or every day when none are picked', () => {
    expect(setAppliesOn(work, '2026-11-23')).toBe(true); // Monday
    expect(setAppliesOn(work, '2026-11-28')).toBe(false); // Saturday
    expect(setAppliesOn({ days: [] }, '2026-11-28')).toBe(true);
  });

  it('takes each member dose nearest the set time, and lists members not due', () => {
    const doses = [dose('a', '06:45'), dose('a', '20:00'), dose('b', '07:30'), dose('x', '07:00')];
    const [today] = setsOn([work], doses, '2026-11-23');
    expect(today.doses.map((d) => d.slot)).toEqual(['a|2026-11-23|06:45', 'b|2026-11-23|07:30']);
    expect(today.notDue).toEqual(['c']);
  });

  it('never puts one dose in two sets', () => {
    const evening: DoseSet = { id: 's2', name: 'Evening', time: '08:00', days: [], medIds: ['a'] };
    const doses = [dose('a', '07:00'), dose('a', '20:00')];
    const out = setsOn([evening, work], doses, '2026-11-23');
    expect(out.map((s) => [s.set.name, s.doses.map((d) => d.time)])).toEqual([
      ['Work days', ['07:00']],
      ['Evening', ['20:00']],
    ]);
  });

  it('skips sets with nothing due', () => {
    expect(setsOn([work], [dose('x', '07:00')], '2026-11-23')).toEqual([]);
  });

  it('describes days', () => {
    expect(describeDays([])).toBe('Every day');
    expect(describeDays([1, 2, 3, 4, 5])).toBe('Mon to Fri');
    expect(describeDays([1, 2, 3, 4])).toBe('Mon to Thu');
    expect(describeDays([0, 6])).toBe('Weekends');
    expect(describeDays([1, 3])).toBe('Mon, Wed');
  });
});

describe('taken at a picked time', () => {
  const now = new Date(2026, 10, 23, 12, 0);
  it('uses the dose day', () => {
    expect(takenAtFor({ date: '2026-11-23', time: '08:00' }, '07:40', now)).toEqual(new Date(2026, 10, 23, 7, 40));
  });
  it('refuses a time still to come', () => {
    expect(takenAtFor({ date: '2026-11-23', time: '08:00' }, '13:00', now)).toBeNull();
  });
  it('reads the small hours after a late dose as the next morning', () => {
    expect(takenAtFor({ date: '2026-11-21', time: '22:00' }, '00:30', now)).toEqual(new Date(2026, 10, 22, 0, 30));
  });
});

describe('CPAP times', () => {
  it('works out hours across midnight', () => {
    expect(hoursBetween('23:10', '06:40')).toBe(7.5);
    expect(nightHours({ start: '22:00', end: '05:00' })).toBe(7);
    expect(nightHours({ hours: 5, start: '22:00', end: '05:00' })).toBe(5);
    expect(nightHours({ start: '22:00' })).toBeNull();
  });
  it('averages clock times around midnight', () => {
    expect(averageClock(['23:30', '00:30'])).toBe('00:00');
    expect(averageClock(['06:00', '07:00'])).toBe('06:30');
    expect(clockSpread(['23:00', '23:00'])).toBe(0);
  });
});

describe('sleep trend', () => {
  const log = (date: string, hh: number): DoseLog => ({
    slot: `cpap|${date}|22:30`,
    medId: 'cpap',
    date,
    time: '22:30',
    status: 'taken',
    at: new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8)), hh, 0).toISOString(),
  });
  it('lines CPAP night D up with the sleep that ended on D + 1', () => {
    const t = sleepTrend({
      from: '2026-11-20',
      to: '2026-11-21',
      nights: [{ medId: 'cpap', date: '2026-11-20', end: '06:00' }],
      checkins: [log('2026-11-20', 23)],
      health: [{ date: '2026-11-21', sleepMin: 460, mainSleepMin: 400, inBedMin: 440, deepMin: 80, remMin: 80, lightMin: 240 }],
    });
    expect(t.nights[0]).toMatchObject({ start: '23:00', end: '06:00', cpapHours: 7, sleepMin: 460, deepRem: 0.4 });
    expect(t.nights[0].efficiency).toBeCloseTo(400 / 440);
    expect(t.nights[1].cpapHours).toBeNull();
    expect(t.fourHourNights).toBe(1);
    expect(t.coverage).toBeCloseTo(420 / 460);
    expect(t.compare).toBeNull();
  });
});
