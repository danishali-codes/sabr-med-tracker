import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Platform, View } from 'react-native';
import { BarChart, metricColor, RangeBar } from '../../components/Dashboard';
import { PageScroll } from '../../components/Screen';
import { SleepTrendCard } from '../../components/SleepTrendCard';
import { useRowStyles } from '../../components/ToggleRow';
import { Button, Card, PressableScale, SectionTitle, Text } from '../../components/ui';
import {
  coverageText,
  dailySeries,
  formatMetric,
  formatStat,
  metricInfo,
  metricPoints,
  metricUnit,
  METRICS,
  moodWord,
  rangeDays,
  rangeText,
  resolveRange,
  shortDate,
  summarize,
  type MetricId,
  type StatKind,
} from '../../domain/dashboard';
import { formatTime, timeFromDate, type DateKey } from '../../domain/dates';
import { healthReadOn, metricShown, nightlyMachine, useDashboardData } from '../../hooks/useDashboard';
import { useMeds, useProgress, useSettings } from '../../hooks/useData';
import { makeStyles, useTheme } from '../../theme';

/** One card's own page: every way of summing it up, a bar per day, and the days one by one. */
export default function MetricScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = METRICS.find((m) => m.id === raw)?.id;
  if (!id || id === 'meds') return <Redirect href="/meds" />;
  return <MetricPage id={id} />;
}

function MetricPage({ id }: { id: MetricId }) {
  const c = useTheme();
  const s = useStyles();
  const st = useRowStyles();
  const settings = useSettings();
  const meds = useMeds();
  const { today } = useProgress();
  const dash = settings.dashboard;
  const { from, to } = resolveRange(dash, today);
  const { data, healthLoaded } = useDashboardData(from, to);
  const info = metricInfo(id);
  const color = metricColor(c, info.color);
  const opts = { sugarUnit: settings.sugarUnit };
  const unit = metricUnit(id, opts);
  const needsHealth = info.fromHealth && !healthReadOn(settings);
  const points = useMemo(() => metricPoints(id, data, from, to), [id, data, from, to]);
  const days = rangeDays(from, to);
  const series = useMemo(() => dailySeries(points, from, to, days > 45 ? 45 : 31), [points, from, to, days]);
  const machine = nightlyMachine(meds, settings);

  const stats: { stat: StatKind; label: string }[] = [
    { stat: 'avg', label: 'Average' },
    { stat: 'median', label: 'Median' },
    { stat: 'min', label: 'Lowest' },
    { stat: 'max', label: 'Highest' },
    ...(info.stats.includes('total') ? [{ stat: 'total' as const, label: 'Total' }] : []),
  ];

  // Newest first: each reading for sugar and blood pressure, each day for the rest.
  const rows = useMemo(() => {
    if (id === 'sugar' || id === 'bp') {
      const rs = data.readings.filter((r) => r.type === id && r.date >= from && r.date <= to);
      return [...rs].reverse().map((r) => ({
        key: r.id,
        title: `${shortDate(r.date, today)}, ${formatTime(timeFromDate(new Date(r.at)))}`,
        value: id === 'bp' ? formatMetric('bp', r.systolic ?? 0, r.diastolic) : formatMetric('sugar', r.sugar ?? 0, null, opts),
        extra: id === 'bp' && r.pulse != null ? `Pulse ${r.pulse}` : null,
      }));
    }
    const health = new Map(data.health.map((h) => [h.date, h]));
    return [...points].reverse().map((p) => {
      const h = health.get(p.date);
      let extra: string | null = null;
      if (id === 'sleep' && h?.bedtime && h.wake) extra = `${formatTime(h.bedtime)} to ${formatTime(h.wake)}`;
      if (id === 'heart' && h?.hrMin != null && h.hrMax != null) extra = `${Math.round(h.hrMin)} to ${Math.round(h.hrMax)} bpm over the day`;
      if (id === 'mood') extra = moodWord(p.value);
      return { key: p.date, title: dayTitle(p.date, today, id), value: formatMetric(id, p.value, p.value2, opts), extra };
    });
  }, [id, data, points, from, to, today, settings.sugarUnit]);

  const links: { title: string; icon: keyof typeof Ionicons.glyphMap; href: Href }[] = [];
  if (id === 'sugar') links.push({ title: 'All blood sugar readings', icon: 'list-outline', href: '/readings?type=sugar' });
  if (id === 'bp') links.push({ title: 'All blood pressure readings', icon: 'list-outline', href: '/readings?type=bp' });
  if (id === 'mood') links.push({ title: 'Mood trend', icon: 'happy-outline', href: '/mood' });
  if (id === 'cpap' && machine) links.push({ title: 'Your machine', icon: 'pulse-outline', href: `/machine/${machine.id}` });
  if (info.fromHealth && Platform.OS === 'android') links.push({ title: 'Health data settings', icon: 'settings-outline', href: '/settings/health' });
  links.push({ title: 'Patterns', icon: 'analytics-outline', href: '/patterns' });

  if (!metricShown(id, settings)) return <Redirect href="/wellbeing" />;

  return (
    <PageScroll contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: info.title }} />
      <RangeBar dash={dash} today={today} showStat={false} />
      <Text style={s.range}>{rangeText(from, to, today)}</Text>

      {needsHealth ? (
        <Card style={{ alignItems: 'center', paddingVertical: 22 }}>
          <Ionicons name="watch-outline" size={32} color={c.muted} />
          <Text style={[st.label, { marginTop: 8, textAlign: 'center' }]}>Connect Samsung Health</Text>
          <Text style={[st.hint, { textAlign: 'center' }]}>
            {info.title} comes from Samsung Health through Health Connect. Turn on Read health data in Settings to see it here.
          </Text>
          <Button title="Open health data settings" small onPress={() => router.push('/settings/health')} style={{ marginTop: 12 }} />
        </Card>
      ) : (
        <>
          <Card>
            <View style={s.stats}>
              {stats.map((x) => {
                const v = summarize(id, points, x.stat);
                return (
                  <View key={x.stat} style={s.stat}>
                    <Text style={s.statLabel}>{x.label}</Text>
                    <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                      {healthLoaded ? formatStat(id, v, x.stat, opts) : '–'}
                    </Text>
                  </View>
                );
              })}
            </View>
            <Text style={[st.hint, { marginTop: 8 }]}>
              {[unit ? `In ${unit}` : null, healthLoaded ? coverageText(id, points, from, to) : null].filter(Boolean).join('. ')}
            </Text>
          </Card>

          {days > 1 && points.length > 0 ? (
            <Card>
              <BarChart
                series={series}
                color={color}
                pair={id === 'bp'}
                format={(v) => (id === 'bp' ? String(Math.round(v)) : formatMetric(id, v, null, opts))}
                firstLabel={shortDate(from, today)}
                lastLabel={shortDate(to, today)}
              />
            </Card>
          ) : null}

          {(id === 'sleep' || id === 'cpap') && (machine || healthReadOn(settings)) ? (
            <SleepTrendCard machine={machine} today={today} healthOn={healthReadOn(settings)} />
          ) : null}

          <SectionTitle>{id === 'sugar' || id === 'bp' ? 'Readings' : id === 'sleep' || id === 'cpap' ? 'Nights' : 'Days'}</SectionTitle>
          <Card>
            {rows.length === 0 ? (
              <Text style={st.hint}>{healthLoaded ? 'Nothing for these dates yet.' : 'Reading…'}</Text>
            ) : (
              rows.slice(0, 120).map((r, i) => (
                <View key={r.key} style={[s.row, i > 0 && s.divider]}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.label}>{r.title}</Text>
                    {r.extra ? <Text style={st.hint}>{r.extra}</Text> : null}
                  </View>
                  <Text style={s.rowValue}>
                    {r.value}
                    {unit && id !== 'sleep' && id !== 'cpap' ? <Text style={s.unit}> {unit}</Text> : null}
                  </Text>
                </View>
              ))
            )}
          </Card>
        </>
      )}

      <SectionTitle>More</SectionTitle>
      {links.map((l) => (
        <PressableScale key={l.title} onPress={() => router.push(l.href)} style={[st.linkCard, { marginTop: 0, marginBottom: 10 }]}>
          <Ionicons name={l.icon} size={20} color={c.primary} />
          <Text style={[st.label, { flex: 1 }]}>{l.title}</Text>
          <Ionicons name="chevron-forward" size={20} color={c.faint} />
        </PressableScale>
      ))}

      {info.fromHealth ? (
        <Text style={[st.hint, { marginTop: 6, marginHorizontal: 4 }]}>
          Read from Health Connect on this phone each time you look. Sabr doesn't keep a copy or send it anywhere. Not medical advice.
        </Text>
      ) : null}
    </PageScroll>
  );
}

/** Sleep and CPAP rows are nights; the rest are days. */
function dayTitle(date: DateKey, today: DateKey, id: MetricId): string {
  const d = shortDate(date, today);
  if (id === 'sleep') return `Night before ${d}`;
  if (id === 'cpap') return `Night of ${d}`;
  return d;
}

const useStyles = makeStyles((c) => ({
  range: { fontSize: 13, fontWeight: '700', color: c.muted, marginHorizontal: 4, marginBottom: 10, marginTop: 4 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, columnGap: 10 },
  stat: { flexGrow: 1, flexBasis: '28%', minWidth: 90 },
  statLabel: { fontSize: 12, fontWeight: '700', color: c.muted },
  statValue: { fontSize: 20, fontWeight: '900', color: c.text, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: c.border },
  rowValue: { fontSize: 16, fontWeight: '900', color: c.text },
  unit: { fontSize: 12, fontWeight: '700', color: c.muted },
}));
