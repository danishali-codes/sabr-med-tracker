import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import type { DashboardData, DashboardSettings, MetricId } from '../domain/dashboard';
import { metricInfo } from '../domain/dashboard';
import type { DateKey } from '../domain/dates';
import type { HealthDay } from '../domain/health';
import { machineKind } from '../domain/machines';
import { sleepTrend } from '../domain/sleep';
import { isMachine, type Medication, type Settings } from '../domain/types';
import * as repo from '../db/repo';
import { readHealth } from '../health/connect';
import { useDbVersion, useMeds, useProgress, useSettings } from './useData';

/** Health Connect is switched on (the feature and the setting). */
export const healthReadOn = (s: Settings) => s.features.healthData && s.healthConnect;

/** A card can show: its feature is on (medicines always are). */
export const metricShown = (id: MetricId, s: Settings) => {
  const f = metricInfo(id).feature;
  return f == null || s.features[f];
};

/** The CPAP (or other nightly machine) whose nights the CPAP card shows. */
export function nightlyMachine(meds: Medication[], s: Settings): Medication | null {
  if (!s.features.machines) return null;
  return meds.find((m) => !m.archived && isMachine(m) && machineKind(m.machine?.type).nightly) ?? null;
}

/** Saves a change to the Health tab's cards, dates or stat. No reminders change, so no rescheduling. */
export function saveDashboard(patch: Partial<DashboardSettings>) {
  const s = repo.getSettings();
  repo.saveSettings({ ...s, dashboard: { ...s.dashboard, ...patch } });
}

/**
 * Everything the Health tab and its pages need for a range of days: health data from Health
 * Connect (read again when the screen comes back into view), doses, mood, readings and CPAP nights.
 */
export function useDashboardData(from: DateKey, to: DateKey): { data: DashboardData; healthLoaded: boolean } {
  const settings = useSettings();
  const meds = useMeds();
  const version = useDbVersion();
  const { summaries } = useProgress();
  const healthOn = healthReadOn(settings);
  const [health, setHealth] = useState<{ key: string; days: HealthDay[] } | null>(null);
  const key = `${from}~${to}`;

  const load = useCallback(() => {
    if (!healthOn) {
      setHealth({ key, days: [] });
      return;
    }
    readHealth(from, to)
      .then((days) => setHealth({ key, days }))
      .catch(() => setHealth({ key, days: [] }));
  }, [healthOn, from, to, key]);

  useFocusEffect(
    useCallback(() => {
      load();
      const sub = AppState.addEventListener('change', (a) => a === 'active' && load());
      return () => sub.remove();
    }, [load]),
  );

  const machine = useMemo(() => nightlyMachine(meds, settings), [meds, settings]);
  const rest = useMemo(() => {
    const cpap = machine
      ? sleepTrend({
          from,
          to,
          nights: repo.getNights(from, to, machine.id),
          checkins: repo.getLogs(from, to).filter((l) => l.medId === machine.id),
          health: [],
        })
          .nights.filter((n) => n.cpapHours != null)
          .map((n) => ({ date: n.date, hours: n.cpapHours! }))
      : [];
    return { notes: repo.getNotes(from, to), readings: repo.getReadings(from, to), cpap };
  }, [from, to, machine, version]);

  const days = health?.key === key ? health.days : [];
  return {
    data: { health: days, summaries, ...rest },
    healthLoaded: !healthOn || health?.key === key,
  };
}
