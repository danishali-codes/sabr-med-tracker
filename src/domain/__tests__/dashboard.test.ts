import { describe, expect, it } from 'vitest';
import {
  cleanDashboard,
  coverageText,
  dailySeries,
  DEFAULT_DASHBOARD,
  formatStat,
  median,
  metricPoints,
  moveCard,
  rangeText,
  resolveRange,
  summarize,
  type DashboardData,
} from '../dashboard';
import type { Reading } from '../types';

const today = '2026-11-25';
const empty: DashboardData = { health: [], summaries: [], notes: [], readings: [], cpap: [] };

describe('ranges', () => {
  it('resolves presets ending today', () => {
    expect(resolveRange({ range: 'today', from: null, to: null }, today)).toEqual({ from: today, to: today });
    expect(resolveRange({ range: 'yesterday', from: null, to: null }, today)).toEqual({ from: '2026-11-24', to: '2026-11-24' });
    expect(resolveRange({ range: '7d', from: null, to: null }, today)).toEqual({ from: '2026-11-19', to: today });
    expect(resolveRange({ range: 'month', from: null, to: null }, today)).toEqual({ from: '2026-11-01', to: today });
  });

  it('keeps a custom range in order and not past today', () => {
    expect(resolveRange({ range: 'custom', from: '2026-11-20', to: '2026-12-30' }, today)).toEqual({ from: '2026-11-20', to: today });
    expect(resolveRange({ range: 'custom', from: '2026-11-20', to: '2026-11-10' }, today)).toEqual({ from: '2026-11-10', to: '2026-11-20' });
  });

  it('describes ranges', () => {
    expect(rangeText(today, today, today)).toBe('Today');
    expect(rangeText('2026-11-19', today, today)).toBe('19 Nov to 25 Nov');
    expect(rangeText('2025-12-30', '2026-01-02', today)).toBe('30 Dec 2025 to 2 Jan');
  });
});

describe('cleanDashboard', () => {
  it('drops unknown and repeated cards and fixes bad values', () => {
    const d = cleanDashboard({ cards: ['steps', 'steps', 'nope' as never, 'mood'], stat: 'bogus' as never, range: 'x' as never });
    expect(d.cards).toEqual(['steps', 'mood']);
    expect(d.stat).toBe('avg');
    expect(d.range).toBe(DEFAULT_DASHBOARD.range);
  });
  it('fills in defaults', () => {
    expect(cleanDashboard(undefined)).toEqual(DEFAULT_DASHBOARD);
  });
});

describe('stats', () => {
  const data: DashboardData = {
    ...empty,
    health: [
      { date: '2026-11-23', steps: 4000, sleepMin: 360, restingHr: 60, hrMin: 50, hrMax: 120 },
      { date: '2026-11-24', steps: 8000, sleepMin: 420, restingHr: 64, hrMin: 55, hrMax: 140 },
      { date: '2026-11-25', steps: 12000, hrAvg: 70 },
    ],
  };

  it('works out average, median, total and range', () => {
    const steps = metricPoints('steps', data, '2026-11-19', today);
    expect(summarize('steps', steps, 'avg').value).toBe(8000);
    expect(summarize('steps', steps, 'median').value).toBe(8000);
    expect(summarize('steps', steps, 'total').value).toBe(24000);
    expect(formatStat('steps', summarize('steps', steps, 'range'), 'range')).toBe('4,000 to 12.0k');
  });

  it('uses the whole day for the lowest and highest heart rate', () => {
    const hr = metricPoints('heart', data, '2026-11-19', today);
    expect(summarize('heart', hr, 'min').value).toBe(50);
    expect(summarize('heart', hr, 'max').value).toBe(140);
    expect(summarize('heart', hr, 'avg').value).toBeCloseTo((60 + 64 + 70) / 3);
  });

  it('falls back to average when a stat does not fit', () => {
    const hr = metricPoints('heart', data, '2026-11-19', today);
    expect(summarize('heart', hr, 'total').value).toBeCloseTo((60 + 64 + 70) / 3);
  });

  it('counts medicines over all doses', () => {
    const d: DashboardData = {
      ...empty,
      summaries: [
        { date: '2026-11-24', scheduled: 1, taken: 0, onTime: 0, late: 0, skipped: 0, status: 'missed' },
        { date: '2026-11-25', scheduled: 3, taken: 3, onTime: 3, late: 0, skipped: 0, status: 'complete' },
      ],
    };
    const p = metricPoints('meds', d, '2026-11-19', today);
    expect(summarize('meds', p, 'avg').value).toBe(75);
    expect(formatStat('meds', summarize('meds', p, 'total'), 'total')).toBe('3 of 4');
    expect(summarize('meds', p, 'median').value).toBe(50);
  });

  it('sums up blood pressure as two numbers', () => {
    const r = (date: string, systolic: number, diastolic: number): Reading => ({ id: date + systolic, type: 'bp', at: `${date}T08:00:00`, date, systolic, diastolic });
    const d: DashboardData = { ...empty, readings: [r('2026-11-24', 120, 80), r('2026-11-25', 140, 90)] };
    const p = metricPoints('bp', d, '2026-11-19', today);
    expect(formatStat('bp', summarize('bp', p, 'avg'), 'avg')).toBe('130/85');
    expect(formatStat('bp', summarize('bp', p, 'range'), 'range')).toBe('120/80 to 140/90');
    expect(coverageText('bp', p, '2026-11-19', today)).toBe('2 readings');
  });

  it('shows a dash with no data', () => {
    expect(formatStat('sleep', summarize('sleep', [], 'avg'), 'avg')).toBe('–');
  });

  it('median of an even list', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('dailySeries', () => {
  it('has one value per day with gaps', () => {
    const s = dailySeries([{ date: '2026-11-24', value: 5 }], '2026-11-23', today);
    expect(s.map((d) => d.value)).toEqual([null, 5, null]);
  });
  it('squeezes long ranges into a few bars', () => {
    const s = dailySeries([], '2026-08-28', today, 30);
    expect(s.length).toBeLessThanOrEqual(30);
  });
});

describe('moveCard', () => {
  it('skips cards that are hidden', () => {
    const cards = ['meds', 'steps', 'mood', 'sugar'] as const;
    expect(moveCard([...cards], 'sugar', -1, (id) => id !== 'mood')).toEqual(['meds', 'sugar', 'mood', 'steps']);
    expect(moveCard([...cards], 'meds', -1)).toEqual([...cards]);
  });
});
