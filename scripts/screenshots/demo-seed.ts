// Screenshot builds only. The screenshots workflow copies this file into the app as
// src/demo-seed.ts and imports it first from index.ts, so the app opens with a few
// weeks of realistic history. It uses only functions that exist in every version
// (0.1 onwards), and fills in both the old (dose, perDose) and new (strength, amount)
// medication fields so each version reads the ones it knows.
import { getKv, getMeds, saveMed, setDose, setKv } from './db/repo';
import { addDays, atTime, eachDay, toDateKey } from './domain/dates';
import { dosesOn } from './domain/schedule';

const DAYS = 45;

function seed() {
  if (getKv('demo_seeded')) return;
  const now = new Date();
  const today = toDateKey(now);
  const start = addDays(today, -DAYS);
  const createdAt = atTime(start, '07:00').toISOString();
  const base = { archived: false, archivedAt: null, createdAt, notes: '' };
  const meds = [
    { id: 'demo-metformin', name: 'Metformin', generic: 'metformin', dose: '500 mg', strength: '500 mg', amount: 1, perDose: 1, form: 'pill', shape: 'oblong', pillColor: '#FFFFFF', color: '#6A4DF4', stock: 48, refillAt: 14,
      schedule: { pattern: { kind: 'daily' }, times: ['08:00', '20:00'], startDate: start, dayTimes: [{ days: [1, 2], times: ['06:45', '20:00'] }, { days: [5, 6], times: ['10:00', '22:00'] }] } },
    { id: 'demo-omeprazole', name: 'Omeprazole', generic: 'omeprazole', dose: '20 mg', strength: '20 mg', amount: 1, perDose: 1, form: 'capsule', shape: 'capsule', pillColor: '#A98BE8', pillColor2: '#F49AB6', color: '#16B582', stock: 9, refillAt: 10,
      schedule: { pattern: { kind: 'daily' }, times: ['07:30'], startDate: start } },
    { id: 'demo-atorvastatin', name: 'Atorvastatin', generic: 'atorvastatin', dose: '20 mg', strength: '20 mg', amount: 1, perDose: 1, form: 'pill', shape: 'oval', pillColor: '#FBE37A', color: '#F29D0C', stock: 26, refillAt: 7,
      schedule: { pattern: { kind: 'daily' }, times: ['21:00'], startDate: start } },
    { id: 'demo-vitd', name: 'Vitamin D3', generic: 'cholecalciferol', dose: '50,000 IU', strength: '50,000 IU', amount: 1, perDose: 1, form: 'capsule', shape: 'oval', pillColor: '#F7A541', color: '#3AB7F0', stock: null, refillAt: null, supplement: true,
      schedule: { pattern: { kind: 'weekdays', days: [5] }, times: ['10:00'], startDate: start } },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of meds) saveMed({ ...base, ...m } as any);
  // A CPAP with a part due today, where the version has machines (0.15 onwards).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const hasMachines = typeof require('./db/repo').saveNight === 'function';
  if (hasMachines) {
    saveMed({
      ...base,
      id: 'demo-cpap', name: 'CPAP', strength: '', amount: 1, form: 'other', color: '#3AB7F0', stock: null, refillAt: null,
      schedule: { pattern: { kind: 'daily' }, times: ['22:30'], startDate: start },
      machine: {
        type: 'cpap',
        parts: [
          { id: 'cushion', name: 'Mask cushion', everyDays: 14, lastChanged: addDays(today, -14) },
          { id: 'filter', name: 'Air filter', everyDays: 30, lastChanged: addDays(today, -9) },
          { id: 'tubing', name: 'Tubing', everyDays: 90, lastChanged: addDays(today, -40) },
        ],
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }
  // A fasting blood sugar check and morning and evening blood pressure, where the version has checks (0.17 onwards).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const hasChecks = typeof require('./db/repo').saveReading === 'function';
  if (hasChecks) {
    const checkStart = addDays(today, -21);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    saveMed({ ...base, createdAt: atTime(checkStart, '06:00').toISOString(), id: 'demo-sugar', name: 'Fasting blood sugar', strength: '', amount: 1, form: 'other', color: '#3AB7F0', stock: null, refillAt: null, schedule: { pattern: { kind: 'daily' }, times: ['07:00'], startDate: checkStart }, check: { type: 'sugar', timing: 'fasting' } } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    saveMed({ ...base, createdAt: atTime(checkStart, '06:01').toISOString(), id: 'demo-bp', name: 'Blood pressure', strength: '', amount: 1, form: 'other', color: '#F04A68', stock: null, refillAt: null, schedule: { pattern: { kind: 'daily' }, times: ['07:30', '20:00'], startDate: checkStart }, check: { type: 'bp' } } as any);
  }

  // Fixed pseudo-random sequence so every version gets the same history.
  let r = 7;
  const rand = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  const all = getMeds();
  const missedDay = addDays(today, -19);
  for (const date of eachDay(start, today)) {
    for (const d of dosesOn(all, date)) {
      const due = atTime(date, d.time);
      if (due > now) continue;
      if (date === missedDay && d.time >= '20:00') continue; // one missed evening, used by a freeze
      const roll = rand();
      if (roll < 0.03) {
        setDose(d, 'skipped', due);
        continue;
      }
      const lateMin = roll > 0.85 ? 40 + Math.floor(rand() * 90) : Math.floor(rand() * 20) - 5;
      setDose(d, 'taken', new Date(Math.min(due.getTime() + lateMin * 60000, now.getTime())));
    }
  }
  if (hasMachines) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const repo = require('./db/repo');
    for (let i = 1; i <= 14; i++) {
      const roll = rand();
      repo.saveNight({ medId: 'demo-cpap', date: addDays(today, -i), start: `22:${String(30 + Math.round(roll * 25)).padStart(2, '0')}`, end: `0${5 + Math.round(roll)}:${String(10 + Math.round(roll * 40)).padStart(2, '0')}`, ahi: Math.round((1 + roll * 3) * 10) / 10, mask: roll > 0.8 ? 'some' : 'good' });
    }
  }
  if (hasChecks) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const repo = require('./db/repo');
    for (const date of eachDay(addDays(today, -21), today)) {
      for (const d of dosesOn(all.filter((m) => m.check), date)) {
        const log = repo.getLog(d.slot);
        if (log?.status !== 'taken') continue;
        const roll = rand();
        const fields = d.medId === 'demo-sugar' ? { type: 'sugar', sugar: Math.round(98 + roll * 50), timing: 'fasting' } : { type: 'bp', systolic: Math.round(122 + roll * 22), diastolic: Math.round(76 + roll * 14), pulse: Math.round(64 + roll * 12) };
        repo.saveReading({ id: `demo-${d.slot}`, at: log.at, date, medId: d.medId, slot: d.slot, ...fields });
      }
    }
  }
  // Layout check builds: every dose today taken on time, so Today shows a gold day.
  if ((globalThis as { __DEMO_GOLD?: boolean }).__DEMO_GOLD) {
    for (const d of dosesOn(all, today)) setDose(d, 'taken', atTime(today, d.time));
  }
  // A note for today, where the version has notes (0.3 onwards).
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const repo = require('./db/repo');
    if (typeof repo.saveNote === 'function') {
      // A few weeks of mood notes so Patterns and the month review have something to show (0.6 onwards).
      for (let i = 1; i <= 30; i++) {
        const date = addDays(today, -i);
        const roll = rand();
        const mood = date === addDays(missedDay, 1) || roll < 0.15 ? 2 : roll < 0.5 ? 3 : 4;
        repo.saveNote({ date, mood, symptoms: mood === 2 ? ['Tired', 'Headache'] : roll > 0.9 ? ['Tired'] : [], text: '' });
      }
      repo.saveNote({ date: today, mood: 4, symptoms: ['Tired'], text: 'Slept badly, felt fine after lunch.' });
    }
  } catch {
    // older versions have no notes
  }
  // Setup is done, with the features the demo data uses (0.16 onwards).
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const repo = require('./db/repo');
    const s = repo.getSettings();
    if ('setupDone' in s) {
      repo.saveSettings({
        ...s,
        setupDone: true,
        // A schedule (0.18 onwards) so Today shows one card for medicines taken together.
        ...('doseSets' in s ? { doseSets: [{ id: 'demo-set', name: 'Morning', time: '08:00', days: [], medIds: ['demo-metformin', 'demo-omeprazole', 'demo-vitd'] }] } : {}),
        features: { ...s.features, supplements: true, mood: true, rewards: true, machines: true, sugarChecks: true, bpChecks: true },
        profile: { ...s.profile, conditions: ['diabetes', 'highBp', 'cholesterol'], diabetesType: 'type2', insulin: false, medsPerDay: '3-5', timesPerDay: 2 },
      });
    }
  } catch {
    // older versions have no setup
  }
  setKv('demo_seeded', '1');
}

// Health builds (0.14 onwards): made-up steps, sleep and heart rate so Today and Health have
// something to show, as if Health Connect were allowed.
try {
  const today = toDateKey(new Date());
  (globalThis as { __DEMO_HEALTH?: unknown }).__DEMO_HEALTH = Array.from({ length: 35 }, (_, i) => ({
    date: addDays(today, -i),
    steps: i === 0 ? 4318 : 5200 + ((i * 2731) % 6100),
    sleepMin: 380 + ((i * 47) % 110),
    inBedMin: 380 + ((i * 47) % 110) + 20 + (i % 4) * 8,
    bedtime: `23:${String(5 + ((i * 13) % 50)).padStart(2, '0')}`,
    wake: `06:${String(10 + ((i * 17) % 45)).padStart(2, '0')}`,
    deepMin: 60 + (i % 5) * 6,
    remMin: 80 + (i % 4) * 7,
    lightMin: 230 + ((i * 47) % 90),
    awakeMin: 20 + (i % 4) * 8,
    hrAvg: 74 + (i % 7),
    hrMin: 55 + (i % 5),
    hrMax: 118 + (i % 13),
    restingHr: 60 + (i % 6),
  }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const repo = require('./db/repo');
  if (!getKv('demo_health') && typeof repo.saveSettings === 'function' && 'healthConnect' in repo.getSettings()) {
    repo.saveSettings({ ...repo.getSettings(), healthConnect: true });
    setKv('demo_health', '1');
  }
} catch {
  // older versions have no health data
}

try {
  seed();
} catch (e) {
  console.error('demo seed failed', e);
}
