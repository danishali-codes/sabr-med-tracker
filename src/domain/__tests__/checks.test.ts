import { describe, expect, it } from 'vitest';
import {
  adviceFor,
  bpStats,
  checkIsOn,
  CHECK_PLANS,
  classifyBp,
  classifySugar,
  defaultPlan,
  formatReading,
  formatSugar,
  parseBp,
  parseSugar,
  planMeds,
  sugarStats,
} from '../checks';
import { describeDose } from '../dose';
import { DEFAULT_FEATURES, EMPTY_PROFILE } from '../features';
import { summarizeDay } from '../progress';
import { planReminders, reminderText } from '../reminders';
import { dosesOn } from '../schedule';
import { buildStatus } from '../../sync/status';
import { countsForStreak, DEFAULT_SETTINGS, type Medication, type Reading } from '../types';

const pill: Medication = {
  id: 'pill',
  name: 'Metformin',
  strength: '500 mg',
  amount: 1,
  form: 'pill',
  color: '#000',
  schedule: { pattern: { kind: 'daily' }, times: ['07:00'], startDate: '2026-11-01' },
  stock: null,
  refillAt: null,
  archived: false,
  createdAt: '2026-11-01T00:00:00Z',
};

const fasting: Medication = { ...pill, id: 'fbs', name: 'Fasting blood sugar', strength: '', form: 'other', check: { type: 'sugar', timing: 'fasting' } };
const bp: Medication = { ...pill, id: 'bp', name: 'Blood pressure', strength: '', form: 'other', schedule: { ...pill.schedule, times: ['07:30', '20:00'] }, check: { type: 'bp' } };

const sugarReading = (mgdl: number, timing: Reading['timing'] = 'fasting'): Reading => ({ id: String(mgdl), type: 'sugar', at: '2026-11-20T07:00:00Z', date: '2026-11-20', sugar: mgdl, timing });
const bpReading = (s: number, d: number, pulse: number | null = null): Reading => ({ id: `${s}/${d}`, type: 'bp', at: '2026-11-20T07:00:00Z', date: '2026-11-20', systolic: s, diastolic: d, pulse });

describe('blood sugar', () => {
  it('reads mg/dL and mmol/L, and stores mg/dL', () => {
    expect(parseSugar('112', 'mgdl')).toBe(112);
    expect(parseSugar('6.2', 'mmol')).toBe(112);
    expect(parseSugar('6,2', 'mmol')).toBe(112);
    expect(parseSugar('', 'mgdl')).toBeNull();
    expect(parseSugar('abc', 'mgdl')).toBeNull();
    expect(parseSugar('5', 'mgdl')).toBeNull();
    expect(parseSugar('900', 'mgdl')).toBeNull();
    expect(formatSugar(112, 'mgdl')).toBe('112 mg/dL');
    expect(formatSugar(112, 'mmol')).toBe('6.2 mmol/L');
  });

  it('uses the usual targets: low under 70, 80 to 130 fasting, under 180 after meals', () => {
    expect(classifySugar(65, 'fasting')).toBe('low');
    expect(classifySugar(70, 'fasting')).toBe('inRange');
    expect(classifySugar(130, 'fasting')).toBe('inRange');
    expect(classifySugar(131, 'fasting')).toBe('high');
    expect(classifySugar(131, 'beforeMeal')).toBe('high');
    expect(classifySugar(170, 'afterMeal')).toBe('inRange');
    expect(classifySugar(181, 'afterMeal')).toBe('high');
    expect(classifySugar(150, 'random')).toBe('inRange');
  });

  it('says what to do when it is low, and nothing alarming otherwise', () => {
    expect(adviceFor(sugarReading(62))?.title).toBe('Your blood sugar is low');
    expect(adviceFor(sugarReading(62))?.body).toMatch(/15 minutes/);
    expect(adviceFor(sugarReading(110))).toBeNull();
    expect(adviceFor(sugarReading(250, 'afterMeal'))).toBeNull();
  });

  it('averages and counts in range, low and high', () => {
    const st = sugarStats([sugarReading(100), sugarReading(140), sugarReading(60), sugarReading(200, 'afterMeal')]);
    expect(st).toEqual({ count: 4, average: 125, inRange: 1, low: 1, high: 2 });
    expect(sugarStats([]).average).toBeNull();
  });
});

describe('blood pressure', () => {
  it('needs believable numbers, top above bottom', () => {
    expect(parseBp('128', '82', '')).toEqual({ systolic: 128, diastolic: 82, pulse: null });
    expect(parseBp('128', '82', '70')).toEqual({ systolic: 128, diastolic: 82, pulse: 70 });
    expect(parseBp('82', '128', '')).toBeNull();
    expect(parseBp('128', '', '')).toBeNull();
    expect(parseBp('128.5', '82', '')).toBeNull();
    expect(parseBp('300', '82', '')).toBeNull();
    expect(parseBp('128', '82', '5')).toBeNull();
  });

  it('follows the American Heart Association categories', () => {
    expect(classifyBp(115, 75)).toBe('normal');
    expect(classifyBp(125, 75)).toBe('elevated');
    expect(classifyBp(132, 78)).toBe('stage1');
    expect(classifyBp(118, 84)).toBe('stage1');
    expect(classifyBp(145, 85)).toBe('stage2');
    expect(classifyBp(181, 100)).toBe('crisis');
    expect(classifyBp(170, 121)).toBe('crisis');
    expect(classifyBp(85, 55)).toBe('low');
  });

  it('says to measure again and when to call for help above 180/120', () => {
    const a = adviceFor(bpReading(190, 110));
    expect(a?.title).toBe('Your blood pressure is very high');
    expect(a?.body).toMatch(/wait a minute and measure again/);
    expect(a?.body).toMatch(/chest pain/);
    expect(adviceFor(bpReading(150, 95))).toBeNull();
  });

  it('averages readings and flags a home average of 135/85 or more', () => {
    expect(bpStats([bpReading(130, 80, 70), bpReading(140, 90, 72)])).toEqual({ count: 2, systolic: 135, diastolic: 85, pulse: 71, highAverage: true });
    expect(bpStats([bpReading(120, 78)]).highAverage).toBe(false);
    // A week before a doctor visit leaves out its first day, when there are other days.
    const day1 = { ...bpReading(160, 100), date: '2026-11-14' };
    expect(bpStats([day1, bpReading(120, 78)], '2026-11-14').systolic).toBe(120);
    expect(bpStats([day1], '2026-11-14').systolic).toBe(160);
    expect(formatReading(bpReading(128, 82, 70), 'mgdl')).toBe('128/82, pulse 70');
  });
});

describe('checks as items', () => {
  it('never count towards the streak', () => {
    expect(countsForStreak(fasting)).toBe(false);
    expect(countsForStreak(bp)).toBe(false);
    const day = summarizeDay([pill, fasting, bp], new Map(), '2026-11-10', '2026-11-12', 60);
    expect(day.scheduled).toBe(1);
  });

  it('describe themselves by when to check', () => {
    expect(describeDose(fasting)).toBe('Fasting (before breakfast)');
    expect(describeDose(bp)).toBe('Two readings, a minute apart');
  });

  it('get one reminder, no repeats, and stay out of the evening check', () => {
    const plan = planReminders({
      meds: [bp],
      logs: new Map(),
      snoozes: new Map(),
      now: new Date(2026, 10, 17, 6, 0),
      settings: { ...DEFAULT_SETTINGS, nagEnabled: true, nagCount: 3, missedNotice: true, missedNoticeAt: '23:30' },
      horizonDays: 0,
      maxCount: 100,
    });
    expect(plan.map((r) => r.kind)).toEqual(['due', 'due']);
  });

  it('never say what is checked in a reminder unless names are on', () => {
    const hidden = reminderText({ kind: 'due', time: '07:00' }, [fasting], false);
    expect(hidden.title).toBe('Time for your 7:00 AM check');
    expect(JSON.stringify(hidden)).not.toMatch(/sugar|blood/i);
    expect(reminderText({ kind: 'due', time: '07:30' }, [bp], true).title).toBe('Time for your 7:30 AM blood pressure check');
    // Due with a medicine: the medicine leads, the check is mentioned.
    expect(reminderText({ kind: 'due', time: '07:00' }, [pill, fasting], false).body).toBe('1 medicine to take, and a check');
  });

  it('are never shared with people who follow you', () => {
    const status = buildStatus({ meds: [fasting, pill], logs: new Map(), today: '2026-11-10', now: new Date(2026, 10, 10, 23), name: 'Me', showNames: true });
    expect(status.doses.length).toBeGreaterThan(0);
    expect(status.doses.every((d) => d.label === 'Metformin')).toBe(true);
  });

  it('are hidden while their feature is off', () => {
    expect(checkIsOn(fasting, DEFAULT_FEATURES)).toBe(false);
    expect(checkIsOn(fasting, { ...DEFAULT_FEATURES, sugarChecks: true })).toBe(true);
    expect(checkIsOn(bp, { ...DEFAULT_FEATURES, sugarChecks: true })).toBe(false);
    expect(checkIsOn(pill, DEFAULT_FEATURES)).toBe(true);
  });
});

describe('check plans', () => {
  let n = 0;
  const newId = () => `id${++n}`;

  it('make one check per timing, with the plan times', () => {
    const insulin = CHECK_PLANS.find((p) => p.id === 'sugarInsulin')!;
    const meds = planMeds(insulin, '2026-11-21', newId, '#3AB7F0');
    expect(meds.map((m) => [m.name, m.schedule.times])).toEqual([
      ['Blood sugar before meals', ['07:30', '13:00', '19:30']],
      ['Bedtime blood sugar', ['22:30']],
    ]);
    expect(meds.every((m) => !countsForStreak(m))).toBe(true);
  });

  it('end the doctor-visit week after 7 days', () => {
    const week = CHECK_PLANS.find((p) => p.id === 'bpWeek')!;
    const [m] = planMeds(week, '2026-11-21', newId, '#F04A68');
    expect(m.schedule.endDate).toBe('2026-11-27');
    expect(dosesOn([m], '2026-11-27')).toHaveLength(2);
    expect(dosesOn([m], '2026-11-28')).toHaveLength(0);
  });

  it('weekly checks fall on the day they were set up', () => {
    const weekly = CHECK_PLANS.find((p) => p.id === 'bpWeekly')!;
    const [m] = planMeds(weekly, '2026-11-21', newId, '#F04A68'); // a Saturday
    expect(m.schedule.pattern).toEqual({ kind: 'weekdays', days: [6] });
  });

  it('suggest a plan from the health profile', () => {
    expect(defaultPlan('sugar', { ...EMPTY_PROFILE, conditions: ['diabetes'], insulin: true }).id).toBe('sugarInsulin');
    expect(defaultPlan('sugar', { ...EMPTY_PROFILE, conditions: ['diabetes'], insulin: false }).id).toBe('sugarFasting');
    expect(defaultPlan('sugar', { ...EMPTY_PROFILE, conditions: ['prediabetes'] }).id).toBe('sugarFew');
    expect(defaultPlan('bp', EMPTY_PROFILE).id).toBe('bpDaily');
  });
});
