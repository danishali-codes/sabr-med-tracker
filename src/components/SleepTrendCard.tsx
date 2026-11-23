import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { addDays, formatTime, parseDateKey, weekdayOf, type DateKey } from '../domain/dates';
import { formatSleep, type HealthDay } from '../domain/health';
import { machineKind } from '../domain/machines';
import { sleepTrend } from '../domain/sleep';
import type { Medication } from '../domain/types';
import * as repo from '../db/repo';
import { readHealth } from '../health/connect';
import { useDbVersion } from '../hooks/useData';
import { makeStyles, useTheme } from '../theme';
import { Card, Chip, PressableScale, SectionTitle, Text } from './ui';

const RANGES = [7, 14, 30] as const;

/**
 * Sleep next to CPAP use: hours on the machine, when the mask went on and came off, and (with
 * Samsung Health connected) how long and how well you slept. Bars per night, newest on the right.
 */
export function SleepTrendCard({ machine, today, healthOn }: { machine: Medication | null; today: DateKey; healthOn: boolean }) {
  const c = useTheme();
  const s = useStyles();
  const version = useDbVersion();
  const [range, setRange] = useState<(typeof RANGES)[number]>(14);
  const [health, setHealth] = useState<HealthDay[]>([]);
  // Nights that started up to last night.
  const to = addDays(today, -1);
  const from = addDays(to, -(range - 1));

  useFocusEffect(
    useCallback(() => {
      if (!healthOn) {
        setHealth([]);
        return;
      }
      readHealth(addDays(from, 1), today).then(setHealth).catch(() => setHealth([]));
    }, [healthOn, from, today]),
  );

  const trend = useMemo(() => {
    const nights = machine ? repo.getNights(from, to, machine.id) : [];
    const checkins = machine ? repo.getLogs(from, to).filter((l) => l.medId === machine.id) : [];
    return sleepTrend({ from, to, nights, checkins, health });
  }, [machine, from, to, health, version]);

  const nightly = machine && machineKind(machine.machine?.type).nightly;
  const hasSleep = trend.avgSleepMin != null;
  if (!nightly && !hasSleep) return null;

  const maxH = Math.max(9, ...trend.nights.map((n) => Math.max(n.cpapHours ?? 0, (n.sleepMin ?? 0) / 60)));
  const pct = (x: number | null) => (x == null ? '-' : `${Math.round(x * 100)}%`);
  const quality = trend.avgEfficiency ?? trend.avgDeepRem;
  const qualityLabel = trend.avgEfficiency != null ? 'Sleep efficiency' : 'Deep and REM';
  const barW = range === 30 ? 4 : range === 14 ? 8 : 14;

  return (
    <View>
      <SectionTitle>{nightly ? 'Sleep and CPAP' : 'Sleep'}</SectionTitle>
      <Card>
        <View style={s.chips}>
          {RANGES.map((r) => (
            <Chip key={r} label={`${r} nights`} selected={range === r} onPress={() => setRange(r)} />
          ))}
        </View>

        <View style={s.chart} accessible accessibilityLabel={`Bars for each of the last ${range} nights`}>
          {trend.nights.map((n) => (
            <PressableScale
              key={n.date}
              disabled={!machine}
              onPress={() => machine && router.push({ pathname: '/machine/night', params: { id: machine.id, date: n.date } })}
              style={s.col}
            >
              <View style={s.bars}>
                {nightly ? (
                  <View
                    style={{
                      width: barW,
                      height: `${Math.min(100, ((n.cpapHours ?? 0) / maxH) * 100)}%`,
                      backgroundColor: (n.cpapHours ?? 0) >= 4 ? c.primary : c.warn,
                      borderRadius: barW / 2,
                    }}
                  />
                ) : null}
                {hasSleep ? (
                  <View style={{ width: barW, height: `${Math.min(100, ((n.sleepMin ?? 0) / 60 / maxH) * 100)}%`, backgroundColor: c.faint, borderRadius: barW / 2 }} />
                ) : null}
              </View>
            </PressableScale>
          ))}
          {/* The 4 hour line most doctors use for CPAP. */}
          {nightly ? <View pointerEvents="none" style={[s.line, { bottom: `${(4 / maxH) * 100}%`, borderColor: c.border }]} /> : null}
        </View>
        {range <= 14 ? (
          <View style={s.days}>
            {trend.nights.map((n) => (
              <Text key={n.date} style={s.day}>
                {range === 7 ? 'SMTWTFS'[weekdayOf(n.date)] : String(parseDateKey(n.date).d)}
              </Text>
            ))}
          </View>
        ) : null}
        <View style={s.legend}>
          {nightly ? <Key color={c.primary} label="CPAP hours" /> : null}
          {hasSleep ? <Key color={c.faint} label="Sleep (Samsung Health)" /> : null}
        </View>

        <View style={s.grid}>
          {nightly ? (
            <>
              <Stat label="CPAP average" value={trend.avgCpapHours != null ? `${trend.avgCpapHours} h` : '-'} />
              <Stat label="Nights over 4 h" value={`${trend.fourHourNights} of ${range}`} />
              <Stat
                label="Mask on"
                value={trend.avgStart ? formatTime(trend.avgStart) : '-'}
                sub={trend.startSpread != null ? `give or take ${trend.startSpread} min` : undefined}
              />
              <Stat label="Mask off" value={trend.avgEnd ? formatTime(trend.avgEnd) : '-'} />
            </>
          ) : null}
          {hasSleep ? (
            <>
              <Stat label="Sleep average" value={formatSleep(trend.avgSleepMin ?? undefined)} />
              <Stat label={qualityLabel} value={pct(quality)} />
              {nightly ? <Stat label="Sleep with CPAP on" value={pct(trend.coverage)} /> : null}
            </>
          ) : null}
        </View>

        {trend.compare ? (
          <Text style={s.note}>
            On nights with 4 hours or more on the CPAP you slept {formatSleep(trend.compare.withMin)}, against {formatSleep(trend.compare.withoutMin)} on the others
            {trend.compare.withQuality != null && trend.compare.withoutQuality != null
              ? ` (${qualityLabel.toLowerCase()} ${pct(trend.compare.withQuality)} against ${pct(trend.compare.withoutQuality)})`
              : ''}
            . Your own data, not a medical finding.
          </Text>
        ) : null}
        {nightly && trend.avgEnd == null ? (
          <Text style={s.note}>Set when the mask came off (on Today, the morning after) to see your CPAP hours and timing here.</Text>
        ) : null}
        {!healthOn && nightly ? <Text style={s.note}>Connect Samsung Health below to see your sleep next to your CPAP use.</Text> : null}
      </Card>
    </View>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  const s = useStyles();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text style={s.keyText}>{label}</Text>
    </View>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const s = useStyles();
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, marginTop: 4 },
  col: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  bars: { height: '100%', flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  days: { flexDirection: 'row', marginTop: 4 },
  day: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700', color: c.muted },
  line: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 },
  keyText: { fontSize: 12, fontWeight: '700', color: c.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, rowGap: 12 },
  stat: { width: '50%', paddingRight: 8 },
  statLabel: { fontSize: 12, fontWeight: '700', color: c.muted },
  statValue: { fontSize: 18, fontWeight: '900', color: c.text, marginTop: 2 },
  statSub: { fontSize: 12, fontWeight: '600', color: c.muted },
  note: { fontSize: 13, fontWeight: '600', color: c.muted, marginTop: 12 },
}));
