import { describe, expect, it } from 'vitest';
import type { DoseLog, ScheduledDose } from '../../domain/types';
import { watchPayload } from '../payload';

const date = '2026-11-19';
const dose = (medId: string, time: string): ScheduledDose => ({ slot: `${medId}|${date}|${time}`, medId, date, time });
const doses = [dose('c', '21:00'), dose('a', '08:00'), dose('b', '08:00'), dose('d', '13:00')];
const log = (d: ScheduledDose, status: 'taken' | 'skipped'): DoseLog => ({ ...d, status, at: '2026-11-19T08:05:00Z' });
const names = new Map([
  ['a', 'Metformin'],
  ['b', 'Omeprazole'],
  ['c', 'Atorvastatin'],
  ['d', 'Vitamin D'],
]);
const base = {
  date,
  now: new Date('2026-11-19T10:00:00'),
  names,
  streak: 4,
  dueAt: (_: string, time: string) => new Date(`${date}T${time}:00`),
};

describe('watch tile payload', () => {
  it('lists doses in time order and groups what is still open', () => {
    const logs = new Map([[doses[1].slot, log(doses[1], 'taken')]]);
    const p = watchPayload({ ...base, doses, logs, showNames: false });
    expect(p.total).toBe(4);
    expect(p.done).toBe(1);
    expect(p.marks.map((m) => m.t)).toEqual(['08:00', '08:00', '13:00', '21:00']);
    expect(p.marks[0].s).toBe('taken');
    expect(p.open.map((g) => [g.time, g.count])).toEqual([
      ['08:00', 1],
      ['13:00', 1],
      ['21:00', 1],
    ]);
    expect(p.open[0].at).toBe(new Date(`${date}T08:00:00`).getTime());
  });

  it('leaves medicine names out unless they are switched on', () => {
    const logs = new Map<string, DoseLog>();
    expect(watchPayload({ ...base, doses, logs, showNames: false }).open.every((g) => g.names === null)).toBe(true);
    const named = watchPayload({ ...base, doses, logs, showNames: true });
    expect(named.open[0].names).toBe('Metformin +1');
    expect(named.open[1].names).toBe('Vitamin D');
    expect(JSON.stringify(watchPayload({ ...base, doses, logs, showNames: false }))).not.toMatch(/Metformin|Omeprazole|Atorvastatin|Vitamin/);
  });

  it('counts skipped doses as answered', () => {
    const logs = new Map(doses.map((d) => [d.slot, log(d, d.medId === 'c' ? 'skipped' : 'taken')]));
    const p = watchPayload({ ...base, doses, logs, showNames: false });
    expect(p.done).toBe(4);
    expect(p.open).toEqual([]);
    expect(p.marks.filter((m) => m.s === 'skipped')).toHaveLength(1);
  });
});

describe('watch day list', () => {
  it('lists every dose with its state, and names only when they are on', () => {
    const logs = new Map([[doses[1].slot, log(doses[1], 'taken')]]);
    const amounts = new Map([['a', '1 tablet'], ['b', '2 capsules']]);
    const off = watchPayload({ ...base, doses, logs, amounts, showNames: false });
    expect(off.list!.map((x) => [x.t, x.name, x.s])).toEqual([
      ['08:00', null, 'taken'],
      ['08:00', null, 'open'],
      ['13:00', null, 'open'],
      ['21:00', null, 'open'],
    ]);
    expect(off.list![0].what).toBe('1 tablet');
    expect(off.list![0].at).not.toBeNull();
    const on = watchPayload({ ...base, doses, logs, amounts, showNames: true });
    expect(on.list!.map((x) => x.name)).toEqual(['Metformin', 'Omeprazole', 'Vitamin D', 'Atorvastatin']);
  });
});
