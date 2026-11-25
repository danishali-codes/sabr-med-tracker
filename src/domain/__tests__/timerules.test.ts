import { afterEach, describe, expect, it } from 'vitest';
import { CITIES, prayerTimes } from '../prayer';
import { inQuietHours, nagOffsets, planReminders } from '../reminders';
import { dosesOn, dueAt, ramadanMove, setTimeRules, slotKey, timesOn, type TimeRules } from '../schedule';
import { DEFAULT_SETTINGS, type Medication } from '../types';

const med = (id: string, times: string[], extra: Partial<Medication['schedule']> = {}): Medication => ({
  id,
  name: id,
  strength: '',
  amount: 1,
  form: 'pill',
  color: '#000',
  schedule: { pattern: { kind: 'daily' }, times, startDate: '2026-11-01', ...extra },
  stock: null,
  refillAt: null,
  archived: false,
  createdAt: '2026-11-01T00:00:00Z',
});

const rules = (r: Partial<TimeRules> = {}): TimeRules => ({
  ramadan: DEFAULT_SETTINGS.ramadan,
  timeChanges: [],
  travelMode: false,
  homeTimeZone: null,
  ...r,
});

afterEach(() => setTimeRules(null));

describe('weekday times', () => {
  // 2026-11-16 is a Monday, 2026-11-18 a Wednesday, 2026-11-21 a Saturday.
  const m = med('a', ['08:00', '20:00'], {
    dayTimes: [
      { days: [1, 2], times: ['06:45', '20:00'] },
      { days: [0, 6], times: ['10:00', '22:00'] },
    ],
  });
  it('uses the day rule on its days and keeps the dose identity', () => {
    expect(timesOn(m, '2026-11-16', null)).toEqual([
      { base: '08:00', time: '06:45' },
      { base: '20:00', time: '20:00' },
    ]);
    expect(timesOn(m, '2026-11-21', null).map((t) => t.time)).toEqual(['10:00', '22:00']);
    expect(timesOn(m, '2026-11-18', null).map((t) => t.time)).toEqual(['08:00', '20:00']);
  });
  it('keeps each dose its own identity when a day rule moves it past another dose', () => {
    // On Saturdays the morning dose moves to 21:00, after the evening one.
    const late = med('b', ['08:00', '20:00'], { dayTimes: [{ days: [6], times: ['21:00', '20:00'] }] });
    expect(timesOn(late, '2026-11-21', null)).toEqual([
      { base: '08:00', time: '21:00' },
      { base: '20:00', time: '20:00' },
    ]);
    expect(dosesOn([late], '2026-11-21').map((d) => [d.slot, d.time])).toEqual([
      [slotKey('b', '2026-11-21', '20:00'), '20:00'],
      [slotKey('b', '2026-11-21', '08:00'), '21:00'],
    ]);
  });
  it('dosesOn keeps the usual slot so logs still match', () => {
    const [first] = dosesOn([m], '2026-11-16');
    expect(first).toEqual({ slot: slotKey('a', '2026-11-16', '08:00'), medId: 'a', date: '2026-11-16', time: '06:45', usualTime: '08:00' });
  });
});

describe('temporary changes', () => {
  it('moves one time or shifts all, only in the date range and for the chosen meds', () => {
    setTimeRules(
      rules({
        timeChanges: [
          { id: '1', from: '2026-11-24', to: '2026-11-30', medIds: null, moveFrom: '08:00', moveTo: '09:00' },
          { id: '2', from: '2026-11-24', to: '2026-11-24', medIds: ['b'], shiftMinutes: -30 },
        ],
      }),
    );
    const a = med('a', ['08:00', '20:00']);
    const b = med('b', ['21:00']);
    expect(timesOn(a, '2026-11-23').map((t) => t.time)).toEqual(['08:00', '20:00']);
    expect(timesOn(a, '2026-11-24').map((t) => t.time)).toEqual(['09:00', '20:00']);
    expect(timesOn(b, '2026-11-24').map((t) => t.time)).toEqual(['20:30']);
    expect(timesOn(b, '2026-11-25').map((t) => t.time)).toEqual(['21:00']);
  });
});

describe('Ramadan', () => {
  const t = { suhoor: '04:30', iftar: '18:15' };
  it('moves morning doses to suhoor and later ones to iftar', () => {
    expect(ramadanMove(['08:00'], t)).toEqual(['04:30']);
    expect(ramadanMove(['14:00'], t)).toEqual(['18:15']);
    expect(ramadanMove(['08:00', '20:00'], t)).toEqual(['04:30', '18:15']);
    expect(ramadanMove(['08:00', '14:00', '20:00'], t)).toEqual(['04:30', '18:15', '23:23']);
  });
  it('only applies in its dates, to the chosen meds', () => {
    setTimeRules(rules({ ramadan: { ...DEFAULT_SETTINGS.ramadan, enabled: true, from: '2027-02-08', to: '2027-03-09', medIds: ['a'] } }));
    const a = med('a', ['08:00', '20:00']);
    const b = med('b', ['08:00']);
    expect(timesOn(a, '2027-02-10').map((x) => x.time)).toEqual(['04:30', '18:15']);
    expect(timesOn(a, '2027-03-10').map((x) => x.time)).toEqual(['08:00', '20:00']);
    expect(timesOn(b, '2027-02-10').map((x) => x.time)).toEqual(['08:00']);
  });
  it('works out Dubai times from the sun', () => {
    const p = prayerTimes('2026-03-01', CITIES.find((c) => c.id === 'dubai')!, 'uae', 240)!;
    const mins = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    // Published UAE times for that day: Fajr 05:22, Maghrib 18:22.
    expect(Math.abs(mins(p.fajr) - mins('05:22'))).toBeLessThanOrEqual(4);
    expect(Math.abs(mins(p.maghrib) - mins('18:22'))).toBeLessThanOrEqual(4);
  });
});

describe('travel mode', () => {
  it('reads times in the home time zone when on', () => {
    const r = rules({ travelMode: true, homeTimeZone: 'Asia/Dubai' });
    // 08:00 in Dubai is 04:00 UTC whatever the phone's own zone is.
    expect(dueAt('2026-11-20', '08:00', r).toISOString()).toBe('2026-11-20T04:00:00.000Z');
    expect(dueAt('2026-11-20', '08:00', rules()).getHours()).toBe(8);
  });
});

describe('nags', () => {
  it('can come closer together each time', () => {
    expect(nagOffsets(3, 15, false)).toEqual([15, 30, 45]);
    expect(nagOffsets(4, 20, true)).toEqual([20, 32, 39, 44]);
  });
  it('respects quiet hours across midnight', () => {
    const q = { enabled: true, from: '23:00', to: '07:00' };
    expect(inQuietHours(new Date(2026, 10, 17, 23, 30), q)).toBe(true);
    expect(inQuietHours(new Date(2026, 10, 17, 6, 59), q)).toBe(true);
    expect(inQuietHours(new Date(2026, 10, 17, 7, 0), q)).toBe(false);
  });
  it('adds an evening notice for doses still unanswered', () => {
    const plan = planReminders({
      meds: [med('a', ['08:00', '23:00'])],
      logs: new Map(),
      snoozes: new Map(),
      now: new Date(2026, 10, 17, 12, 0),
      settings: { ...DEFAULT_SETTINGS, nagEnabled: false, missedNotice: true, missedNoticeAt: '22:00' },
      horizonDays: 0,
      maxCount: 50,
    });
    const missed = plan.find((p) => p.kind === 'missed')!;
    expect(missed.slots).toEqual([slotKey('a', '2026-11-17', '08:00')]);
    expect(missed.at.getHours()).toBe(22);
  });
});

describe('review fixes', () => {
  it('a weekday rule follows a dose added or removed later', () => {
    // Rule made when the med was once a day; a second usual time was added since.
    const added = med('a', ['08:00', '20:00'], { dayTimes: [{ days: [1], times: ['06:45'] }] });
    expect(timesOn(added, '2026-11-16', null).map((t) => t.time)).toEqual(['06:45', '20:00']);
    // Rule made when it was twice a day; the evening dose was removed since.
    const removed = med('a', ['08:00'], { dayTimes: [{ days: [1], times: ['06:45', '21:00'] }] });
    expect(timesOn(removed, '2026-11-16', null).map((t) => t.time)).toEqual(['06:45']);
  });

  it('snoozing the evening check brings it back later', () => {
    const now = new Date(2026, 10, 16, 21, 5);
    const base = {
      meds: [med('a', ['08:00'])],
      logs: new Map(),
      now,
      settings: { ...DEFAULT_SETTINGS, nagEnabled: false, missedNotice: true, missedNoticeAt: '21:00' },
      horizonDays: 0,
      maxCount: 50,
    };
    const none = planReminders({ ...base, snoozes: new Map() }).filter((r) => r.kind === 'missed' && r.date === '2026-11-16');
    expect(none).toHaveLength(0);
    const until = new Date(2026, 10, 16, 21, 30).toISOString();
    const back = planReminders({ ...base, snoozes: new Map([['2026-11-16|missed', until]]) }).filter((r) => r.kind === 'missed');
    expect(back.map((r) => r.at.toISOString())).toEqual([until]);
  });
});

describe('schedules (dose sets) move dose times', () => {
  // 2026-11-23 is a Monday, 2026-11-28 a Saturday.
  const work = { id: 's1', name: 'Work days', time: '07:00', days: [1, 2, 3, 4], medIds: ['a', 'b'] };
  it('moves the nearest dose to the schedule time on its days only, keeping the dose identity', () => {
    const a = med('a', ['08:00', '20:00']);
    expect(timesOn(a, '2026-11-23', rules({ doseSets: [work] }))).toEqual([
      { base: '08:00', time: '07:00' },
      { base: '20:00', time: '20:00' },
    ]);
    expect(timesOn(a, '2026-11-28', rules({ doseSets: [work] })).map((t) => t.time)).toEqual(['08:00', '20:00']);
  });
  it('leaves medicines that are not in the schedule alone', () => {
    expect(timesOn(med('c', ['08:00']), '2026-11-23', rules({ doseSets: [work] })).map((t) => t.time)).toEqual(['08:00']);
  });
  it('gives each schedule its own dose', () => {
    const evening = { id: 's2', name: 'Evening', time: '21:30', days: [], medIds: ['a'] };
    const a = med('a', ['08:00', '20:00']);
    expect(timesOn(a, '2026-11-23', rules({ doseSets: [evening, work] })).map((t) => t.time)).toEqual(['07:00', '21:30']);
    // One dose, two schedules: the earlier schedule wins it.
    const one = med('a', ['12:00']);
    expect(timesOn(one, '2026-11-23', rules({ doseSets: [evening, work] })).map((t) => t.time)).toEqual(['07:00']);
  });
  it('reaches dosesOn, so reminders and Today use the schedule time', () => {
    setTimeRules(rules({ doseSets: [work] }));
    const [first] = dosesOn([med('b', ['06:30'])], '2026-11-23');
    expect(first).toEqual({ slot: slotKey('b', '2026-11-23', '06:30'), medId: 'b', date: '2026-11-23', time: '07:00', usualTime: '06:30' });
  });
  it('Ramadan still wins over a schedule', () => {
    const r = rules({
      doseSets: [{ ...work, days: [] }],
      ramadan: { ...DEFAULT_SETTINGS.ramadan, enabled: true, mode: 'manual', from: '2026-11-01', to: '2026-11-30', suhoor: '04:30', iftar: '17:45', medIds: null },
    });
    expect(timesOn(med('a', ['08:00']), '2026-11-23', r).map((t) => t.time)).toEqual(['04:30']);
  });
});
