import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { PageScroll } from '../components/Screen';
import { Button, Card, Chip, Text } from '../components/ui';
import { bpStats, formatReading, formatSugar, readingLevelLabel, readingTone, sugarStats, timingLabel } from '../domain/checks';
import { addDays, formatDateLong, formatTime, timeFromDate, toDateKey } from '../domain/dates';
import type { CheckType, Reading } from '../domain/types';
import * as repo from '../db/repo';
import { useDbVersion, useSettings } from '../hooks/useData';
import { makeStyles, useTheme } from '../theme';

const RANGES = [7, 30, 90];

/** Every blood sugar or blood pressure reading, newest first, with averages. On the phone only. */
export default function ReadingsScreen() {
  const c = useTheme();
  const st = useStyles();
  const settings = useSettings();
  const version = useDbVersion();
  const params = useLocalSearchParams<{ type?: CheckType }>();
  const both = settings.features.sugarChecks && settings.features.bpChecks;
  const [type, setType] = useState<CheckType>(params.type === 'bp' || (!params.type && !settings.features.sugarChecks && settings.features.bpChecks) ? 'bp' : 'sugar');
  const [days, setDays] = useState(30);
  const today = toDateKey(new Date());
  const readings = useMemo(() => repo.getReadings(addDays(today, -(days - 1)), today, type), [today, days, type, version]);
  const sugar = type === 'sugar' ? sugarStats(readings) : null;
  const bp = type === 'bp' ? bpStats(readings) : null;

  // Newest first, grouped by day.
  const byDay = useMemo(() => {
    const m = new Map<string, Reading[]>();
    for (const r of [...readings].reverse()) m.set(r.date, [...(m.get(r.date) ?? []), r]);
    return [...m.entries()];
  }, [readings]);

  const tone = (r: Reading) => {
    const t = readingTone(r);
    return t === 'bad' ? c.bad : t === 'warn' ? c.warn : c.good;
  };

  return (
    <PageScroll contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      {both || params.type ? (
        <View style={st.wrap}>
          <Chip label="Blood sugar" selected={type === 'sugar'} onPress={() => setType('sugar')} />
          <Chip label="Blood pressure" selected={type === 'bp'} onPress={() => setType('bp')} />
        </View>
      ) : null}
      <View style={[st.wrap, { marginBottom: 6 }]}>
        {RANGES.map((d) => (
          <Chip key={d} label={`${d} days`} selected={days === d} onPress={() => setDays(d)} />
        ))}
      </View>

      <Card>
        <View style={st.stats}>
          <Stat label="Readings" value={String(readings.length)} />
          {sugar?.average != null ? <Stat label="Average" value={formatSugar(sugar.average, settings.sugarUnit)} /> : null}
          {sugar && sugar.count > 0 ? <Stat label="In range" value={`${Math.round((sugar.inRange / sugar.count) * 100)}%`} /> : null}
          {sugar && sugar.low > 0 ? <Stat label="Low" value={String(sugar.low)} /> : null}
          {bp?.systolic != null ? <Stat label="Average" value={`${bp.systolic}/${bp.diastolic}`} /> : null}
          {bp?.pulse != null ? <Stat label="Pulse" value={String(bp.pulse)} /> : null}
        </View>
        <Text style={[st.hint, { marginTop: 12 }]}>
          {type === 'sugar'
            ? 'In range here means 80 to 130 fasting or before a meal, and under 180 after a meal, the usual targets for most adults. Your doctor may give you different ones.'
            : bp?.highAverage
              ? 'At home, an average of 135/85 or more counts as high blood pressure. Show these readings to your doctor.'
              : 'At home, an average under 135/85 is usually in range. Your doctor may give you a different target.'}
        </Text>
      </Card>

      <Button
        title="Add a reading"
        kind="secondary"
        onPress={() => router.push({ pathname: '/check/log', params: { type } })}
        icon={<Ionicons name="add" size={18} color={c.primary} />}
        style={{ marginBottom: 14 }}
      />

      {byDay.length === 0 ? <Text style={[st.hint, { textAlign: 'center', marginTop: 10 }]}>No readings in the last {days} days.</Text> : null}
      {byDay.map(([date, rs]) => (
        <View key={date}>
          <Text style={st.day}>{date === today ? 'Today' : formatDateLong(date)}</Text>
          <Card style={{ paddingVertical: 4 }}>
            {rs.map((r, i) => (
              <Pressable key={r.id} onPress={() => router.push({ pathname: '/check/log', params: { reading: r.id } })} style={[st.row, i > 0 && st.rowBorder]} accessibilityRole="button">
                <Text style={st.time}>{formatTime(timeFromDate(new Date(r.at)))}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={st.value}>{formatReading(r, settings.sugarUnit)}</Text>
                  <Text style={st.sub}>
                    <Text style={[st.level, { color: tone(r) }]}>{readingLevelLabel(r)}</Text>
                    {[r.type === 'sugar' ? timingLabel(r.timing) : null, r.note].filter(Boolean).map((t) => ` · ${t}`).join('')}
                  </Text>
                </View>
              </Pressable>
            ))}
          </Card>
        </View>
      ))}
      <Text style={[st.hint, { textAlign: 'center', marginTop: 8 }]}>Readings stay on this phone and in your own backups. They are never shared.</Text>
    </PageScroll>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const st = useStyles();
  return (
    <View style={st.stat}>
      <Text style={st.statValue}>{value}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { backgroundColor: c.sunken, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, minWidth: 100, flexGrow: 1 },
  statValue: { fontSize: 18, fontWeight: '900', color: c.text },
  statLabel: { fontSize: 12, fontWeight: '700', color: c.muted, marginTop: 2 },
  hint: { fontSize: 13, color: c.muted, fontWeight: '600', lineHeight: 18 },
  day: { fontSize: 14, fontWeight: '800', color: c.muted, marginTop: 4, marginBottom: 6, marginLeft: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: c.border },
  time: { fontSize: 14, fontWeight: '800', color: c.text, minWidth: 64, flexShrink: 0 },
  value: { fontSize: 17, fontWeight: '800', color: c.text },
  sub: { fontSize: 13, fontWeight: '600', color: c.muted, marginTop: 1 },
  level: { fontSize: 13, fontWeight: '800' },
}));
