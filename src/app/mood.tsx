import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { PageScroll } from '../components/Screen';
import { Card, FadeIn, PressableScale, SectionTitle, Text } from '../components/ui';
import { addDays, diffDays } from '../domain/dates';
import { moodTrend, type MoodTrend } from '../domain/insights';
import { MOODS } from '../domain/types';
import * as repo from '../db/repo';
import { useDbVersion, useToday } from '../hooks/useData';
import { makeStyles, useTheme } from '../theme';

const RANGES = [
  { key: 30, label: '30 days' },
  { key: 90, label: '3 months' },
  { key: 365, label: 'Year' },
] as const;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const word = (v: number) => MOODS[Math.max(0, Math.min(4, Math.round(v) - 1))].label.toLowerCase();

/** How your mood has gone, from the check-ins on the Today screen. Worked out on this phone. */
export default function MoodScreen() {
  const c = useTheme();
  const s = useStyles();
  const today = useToday();
  const version = useDbVersion();
  const [days, setDays] = useState<(typeof RANGES)[number]['key']>(30);
  const trend = useMemo(() => {
    const from = addDays(today, -(days - 1));
    return moodTrend(repo.getNotes(addDays(from, -days), today), from, today);
  }, [today, days, version]);

  const change = trend.average != null && trend.previousAverage != null ? trend.average - trend.previousAverage : null;
  const weekdays = trend.byWeekday.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v != null);
  const best = weekdays.length >= 3 ? weekdays.reduce((a, b) => (b.v > a.v ? b : a)) : null;
  const worst = weekdays.length >= 3 ? weekdays.reduce((a, b) => (b.v < a.v ? b : a)) : null;

  return (
    <PageScroll contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={s.segment}>
        {RANGES.map((r) => (
          <PressableScale key={r.key} onPress={() => setDays(r.key)} haptic style={[s.segItem, days === r.key && { backgroundColor: c.primary }]}>
            <Text style={[s.segText, days === r.key && { color: c.onPrimary }]}>{r.label}</Text>
          </PressableScale>
        ))}
      </View>

      {trend.points.length === 0 ? (
        <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
          <Ionicons name="happy-outline" size={36} color={c.muted} />
          <Text style={[s.title, { textAlign: 'center', marginTop: 8 }]}>No mood check-ins yet</Text>
          <Text style={[s.body, { textAlign: 'center', marginTop: 4 }]}>Pick how you feel on the Today screen and press Save. Your trend builds up here.</Text>
        </Card>
      ) : (
        <>
          <FadeIn>
            <Card>
              <View style={s.statsRow}>
                <Stat label="Average" value={trend.average != null ? trend.average.toFixed(1) : '–'} sub={trend.average != null ? word(trend.average) : ''} />
                <Stat
                  label="Change"
                  value={change == null ? '–' : `${change > 0 ? '+' : ''}${change.toFixed(1)}`}
                  sub={change == null ? 'no earlier notes' : Math.abs(change) < 0.2 ? 'about the same' : change > 0 ? 'better than before' : 'lower than before'}
                  color={change == null || Math.abs(change) < 0.2 ? undefined : change > 0 ? c.good : c.bad}
                />
                <Stat label="Check-ins" value={String(trend.points.length)} sub={`of ${days} days`} />
              </View>
              <MoodChart trend={trend} />
              <Text style={s.caption}>Dots are your daily check-ins. The line is the average of the 7 days before each day.</Text>
            </Card>
          </FadeIn>

          <FadeIn delay={60}>
            <SectionTitle>How often</SectionTitle>
            <Card>
              {[...MOODS].reverse().map((m) => {
                const n = trend.counts[m.value - 1];
                const share = trend.points.length ? n / trend.points.length : 0;
                return (
                  <View key={m.value} style={s.barRow}>
                    <Text style={s.barLabel}>{m.label}</Text>
                    <View style={[s.barTrack, { backgroundColor: c.sunken }]}>
                      <View style={{ width: `${Math.round(share * 100)}%`, height: '100%', borderRadius: 6, backgroundColor: c.primary, opacity: 0.45 + m.value * 0.11 }} />
                    </View>
                    <Text style={s.barNum}>{n}</Text>
                  </View>
                );
              })}
            </Card>
          </FadeIn>

          {best && worst && best.i !== worst.i && best.v - worst.v >= 0.5 ? (
            <FadeIn delay={90}>
              <Card style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[s.icon, { backgroundColor: c.primarySoft }]}>
                  <Ionicons name="calendar-outline" size={20} color={c.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>
                    {WEEKDAYS[best.i]}s tend to be your best days
                  </Text>
                  <Text style={s.body}>
                    Average {best.v.toFixed(1)} on {WEEKDAYS[best.i]}s against {worst.v.toFixed(1)} on {WEEKDAYS[worst.i]}s.
                  </Text>
                </View>
              </Card>
            </FadeIn>
          ) : null}

          {trend.topSymptoms.length ? (
            <FadeIn delay={120}>
              <SectionTitle>Symptoms noted</SectionTitle>
              <Card>
                {trend.topSymptoms.map((x) => (
                  <View key={x.name} style={s.symRow}>
                    <Text style={[s.body, { flex: 1, color: c.text, marginTop: 0 }]}>{x.name}</Text>
                    <Text style={s.barNum}>
                      {x.days} {x.days === 1 ? 'day' : 'days'}
                    </Text>
                  </View>
                ))}
              </Card>
            </FadeIn>
          ) : null}
        </>
      )}

      <PressableScale onPress={() => router.push('/patterns')} style={[s.link, { backgroundColor: c.card }]}>
        <Ionicons name="pulse-outline" size={22} color={c.primary} />
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Patterns</Text>
          <Text style={[s.body, { marginTop: 2 }]}>How your mood lines up with your doses</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={c.faint} />
      </PressableScale>
      <Text style={s.caption}>Worked out on this phone from your own check-ins. Nothing is sent anywhere.</Text>
    </PageScroll>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  const s = useStyles();
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={s.statSub} numberOfLines={2}>
        {sub}
      </Text>
    </View>
  );
}

function MoodChart({ trend }: { trend: MoodTrend }) {
  const c = useTheme();
  // Sized to the space the card actually leaves (after its padding and the mood labels), so
  // the chart never runs off the right edge, whatever the screen width or text size.
  const [width, setWidth] = useState(0);
  const height = 150;
  const pad = 8;
  const span = Math.max(1, diffDays(trend.from, trend.to));
  const x = (date: string) => pad + (diffDays(trend.from, date) / span) * (width - pad * 2);
  const y = (mood: number) => pad + ((5 - mood) / 4) * (height - pad * 2);

  // The running average as one or more line pieces (gaps where there were no notes).
  let d = '';
  let drawing = false;
  for (const p of trend.rolling) {
    if (p.avg == null) {
      drawing = false;
      continue;
    }
    d += `${drawing ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.avg).toFixed(1)} `;
    drawing = true;
  }
  const dot = trend.points.length > 120 ? 2 : 3.5;

  return (
    <View style={{ flexDirection: 'row', marginTop: 16 }}>
      <View style={{ minWidth: 40, maxWidth: 64, marginRight: 4, height, justifyContent: 'space-between', paddingVertical: pad - 7 }}>
        {[5, 3, 1].map((m) => (
          <Text key={m} style={{ fontSize: 11, fontWeight: '700', color: c.muted }}>
            {MOODS[m - 1].label}
          </Text>
        ))}
      </View>
      <View style={{ flex: 1, height }} onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}>
      {width > 0 ? (
      <Svg width={width} height={height}>
        {[1, 2, 3, 4, 5].map((m) => (
          <Line key={m} x1={pad} x2={width - pad} y1={y(m)} y2={y(m)} stroke={c.border} strokeWidth={1} />
        ))}
        {trend.points.map((p) => (
          <Circle key={p.date} cx={x(p.date)} cy={y(p.mood)} r={dot} fill={c.primary} opacity={0.35} />
        ))}
        {d ? <Path d={d} stroke={c.primary} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
      </Svg>
      ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  segment: { flexDirection: 'row', backgroundColor: c.sunken, borderRadius: 999, padding: 4, marginBottom: 14 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999 },
  segText: { fontSize: 14, fontWeight: '800', color: c.muted },
  title: { fontSize: 16, fontWeight: '800', color: c.text },
  body: { fontSize: 14, color: c.muted, marginTop: 4, fontWeight: '600', lineHeight: 19 },
  caption: { fontSize: 12, color: c.muted, marginTop: 10, fontWeight: '600', lineHeight: 17 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statLabel: { fontSize: 12, fontWeight: '800', color: c.muted },
  statValue: { fontSize: 24, fontWeight: '900', color: c.text, marginTop: 2 },
  statSub: { fontSize: 12, fontWeight: '600', color: c.muted },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  barLabel: { width: 52, fontSize: 13, fontWeight: '800', color: c.text },
  barTrack: { flex: 1, height: 12, borderRadius: 6, overflow: 'hidden' },
  barNum: { minWidth: 28, textAlign: 'right', fontSize: 13, fontWeight: '800', color: c.muted },
  symRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 28, padding: 18, marginTop: 6 },
}));
