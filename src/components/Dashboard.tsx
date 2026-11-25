import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { View } from 'react-native';
import {
  coverageText,
  dailySeries,
  formatStat,
  metricInfo,
  metricPoints,
  metricUnit,
  moodWord,
  rangeDays,
  rangeText,
  RANGES,
  statFor,
  statLabel,
  STATS,
  summarize,
  type ColorKey,
  type DashboardData,
  type DashboardSettings,
  type MetricId,
  type StatKind,
} from '../domain/dashboard';
import { addDays, type DateKey } from '../domain/dates';
import type { Settings } from '../domain/types';
import { healthReadOn, saveDashboard } from '../hooks/useDashboard';
import { makeStyles, useTheme, type Palette } from '../theme';
import { DateButton } from './Pickers';
import { PressableScale, Select, Text } from './ui';

export const metricColor = (c: Palette, k: ColorKey) => c[k];

/** Where a card goes when tapped: medicines to the Medicine tab, the rest to their own page. */
export function openMetric(id: MetricId) {
  if (id === 'meds') router.navigate('/meds');
  else router.push({ pathname: '/metric/[id]', params: { id } });
}

/**
 * The dates the Health tab shows (a preset or two picked dates) and, optionally, how values are
 * summed up. Saved, so the tab and each card's page stay on the same dates.
 */
export function RangeBar({ dash, today, showStat = true }: { dash: DashboardSettings; today: DateKey; showStat?: boolean }) {
  const s = useStyles();
  const custom = dash.range === 'custom';
  const from = dash.from ?? addDays(today, -6);
  const to = dash.to ?? today;
  return (
    <View style={{ marginBottom: 6 }}>
      <View style={s.selects}>
        <View style={s.selectBox}>
          <Text style={s.selectLabel}>Dates</Text>
          <Select
            title="Show which days"
            value={dash.range}
            options={RANGES}
            onChange={(range) => saveDashboard(range === 'custom' && !dash.from ? { range, from: addDays(today, -6), to: today } : { range })}
          />
        </View>
        {showStat ? (
          <View style={s.selectBox}>
            <Text style={s.selectLabel}>Show</Text>
            <Select title="Sum up each card as" value={dash.stat} options={STATS} onChange={(stat) => saveDashboard({ stat })} />
          </View>
        ) : null}
      </View>
      {custom ? (
        <View style={s.dates}>
          <View style={s.dateBox}>
            <Text style={s.selectLabel}>From</Text>
            <DateButton value={from} onChange={(d) => saveDashboard({ from: d > today ? today : d })} />
          </View>
          <View style={s.dateBox}>
            <Text style={s.selectLabel}>To</Text>
            <DateButton value={to} onChange={(d) => saveDashboard({ to: d > today ? today : d })} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** One card on the Health tab: the summed-up value over the dates, and a small chart when there's more than a day. */
export function MetricCard({
  id,
  data,
  from,
  to,
  today,
  stat,
  settings,
  loaded,
}: {
  id: MetricId;
  data: DashboardData;
  from: DateKey;
  to: DateKey;
  today: DateKey;
  stat: StatKind;
  settings: Settings;
  loaded: boolean;
}) {
  const c = useTheme();
  const s = useStyles();
  const info = metricInfo(id);
  const color = metricColor(c, info.color);
  const needsHealth = info.fromHealth && !healthReadOn(settings);
  const points = metricPoints(id, data, from, to);
  const used = statFor(id, stat);
  const value = summarize(id, points, used);
  const opts = { sugarUnit: settings.sugarUnit };
  const days = rangeDays(from, to);
  const text = needsHealth || !loaded ? '–' : formatStat(id, value, used, opts);
  const unit = id === 'meds' && used === 'total' ? 'doses' : metricUnit(id, opts);
  const label = days === 1 && id !== 'sugar' && id !== 'bp' ? rangeText(from, to, today) : statLabel(used);
  const series = days > 1 ? dailySeries(points, from, to, 31) : [];
  const sub = needsHealth
    ? 'Connect Samsung Health in Settings'
    : id === 'mood' && value.value != null && used !== 'range'
      ? moodWord(value.value)
      : loaded
        ? coverageText(id, points, from, to)
        : '';

  return (
    <PressableScale
      onPress={() => (needsHealth ? router.push('/settings/health') : openMetric(id))}
      style={s.card}
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={`${info.title}. ${label}: ${text} ${unit}. ${sub}`}
    >
      <View style={s.head}>
        <Ionicons name={info.icon as keyof typeof Ionicons.glyphMap} size={16} color={color} />
        <Text style={s.title} numberOfLines={2}>
          {info.title}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={c.faint} />
      </View>
      <Text style={s.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={s.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
        {text}
        {unit && text !== '–' ? <Text style={s.unit}> {unit}</Text> : null}
      </Text>
      {series.length > 1 && points.length > 0 ? <Spark series={series} color={color} pair={id === 'bp'} /> : null}
      {sub ? (
        <Text style={s.sub} numberOfLines={2}>
          {sub}
        </Text>
      ) : null}
    </PressableScale>
  );
}

/** Tiny bars, one per day (or per few days on long ranges). Always as wide as the card. */
function Spark({ series, color, pair }: { series: { value: number | null; value2: number | null }[]; color: string; pair?: boolean }) {
  const c = useTheme();
  const vals = series.map((d) => d.value).filter((v): v is number => v != null);
  const max = Math.max(...vals, 1);
  const min = pair ? Math.min(...series.map((d) => d.value2).filter((v): v is number => v != null), max) * 0.9 : 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 34, gap: series.length > 20 ? 1 : 3, marginTop: 8 }}>
      {series.map((d, i) => {
        if (d.value == null) return <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: c.sunken }} />;
        const top = Math.max(0.08, (d.value - min) / (max - min || 1));
        const bottom = pair && d.value2 != null ? Math.max(0, (d.value2 - min) / (max - min || 1)) : 0;
        return (
          <View key={i} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
            <View style={{ height: `${Math.max(6, (top - bottom) * 100)}%`, marginBottom: `${bottom * 100}%`, borderRadius: 3, backgroundColor: color }} />
          </View>
        );
      })}
    </View>
  );
}

/** Bigger bars for a card's own page, with the highest value and the first and last day marked. */
export function BarChart({
  series,
  color,
  pair,
  format,
  firstLabel,
  lastLabel,
}: {
  series: { date: DateKey; value: number | null; value2: number | null }[];
  color: string;
  pair?: boolean;
  format: (v: number) => string;
  firstLabel: string;
  lastLabel: string;
}) {
  const c = useTheme();
  const s = useStyles();
  const vals = series.map((d) => d.value).filter((v): v is number => v != null);
  if (!vals.length) return null;
  const max = Math.max(...vals);
  const lows = series.map((d) => d.value2).filter((v): v is number => v != null);
  const min = pair && lows.length ? Math.min(...lows) * 0.9 : 0;
  const span = max - min || 1;
  return (
    <View>
      <Text style={s.axis}>{format(max)}</Text>
      <View style={s.chart}>
        {series.map((d, i) => {
          if (d.value == null) return <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: c.sunken }} />;
          const top = Math.max(0.03, (d.value - min) / span);
          const bottom = pair && d.value2 != null ? Math.max(0, (d.value2 - min) / span) : 0;
          return (
            <View key={i} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
              <View style={{ height: `${Math.max(3, (top - bottom) * 100)}%`, marginBottom: `${bottom * 100}%`, borderRadius: 4, backgroundColor: color }} />
            </View>
          );
        })}
      </View>
      <View style={s.axisRow}>
        <Text style={s.axis}>{firstLabel}</Text>
        <Text style={s.axis}>{lastLabel}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  selects: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  selectBox: { flexGrow: 1, flexBasis: 150 },
  selectLabel: { fontSize: 12, fontWeight: '800', color: c.muted, marginBottom: 4, marginLeft: 4 },
  dates: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  dateBox: { flexGrow: 1, flexBasis: 150 },
  card: { flexGrow: 1, flexBasis: 150, backgroundColor: c.card, borderRadius: 24, padding: 14, minHeight: 128 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  title: { flex: 1, fontSize: 14, fontWeight: '800', color: c.text, lineHeight: 18 },
  statLabel: { fontSize: 12, fontWeight: '700', color: c.muted, marginTop: 8 },
  value: { fontSize: 24, fontWeight: '900', color: c.text, marginTop: 2 },
  unit: { fontSize: 12, fontWeight: '700', color: c.muted },
  sub: { fontSize: 12, fontWeight: '600', color: c.muted, marginTop: 6, lineHeight: 16 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 2, marginTop: 4 },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  axis: { fontSize: 11, fontWeight: '700', color: c.muted },
}));
