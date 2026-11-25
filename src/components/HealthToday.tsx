import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, View } from 'react-native';
import type { DateKey } from '../domain/dates';
import { formatSleep, formatSteps, type HealthDay } from '../domain/health';
import { readHealth } from '../health/connect';
import { makeStyles, useTheme } from '../theme';
import { PressableScale, Text } from './ui';

/**
 * Today's steps, last night's sleep and heart rate from Health Connect, on the Today screen.
 * Only shown while "Read health data" is on; read on the phone and never kept.
 */
export function HealthToday({ today, enabled }: { today: DateKey; enabled: boolean }) {
  const [day, setDay] = useState<HealthDay | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    if (!enabled) {
      setDay(null);
      setLoaded(false);
      return;
    }
    readHealth(today, today)
      .then((days) => {
        setDay(days.find((d) => d.date === today) ?? null);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [today, enabled]);

  useFocusEffect(
    useCallback(() => {
      load();
      const sub = AppState.addEventListener('change', (a) => a === 'active' && load());
      return () => sub.remove();
    }, [load]),
  );

  if (!enabled || !loaded) return null;
  return <HealthStrip day={day} />;
}

/** The card itself, from one day of data (or none yet). */
export function HealthStrip({ day }: { day: HealthDay | null }) {
  const c = useTheme();
  const s = useStyles();
  // Resting heart rate when the watch measured it, else the day's average. "Heart" fits big text in a third of a narrow screen.
  const heart = day?.restingHr ?? day?.hrAvg;
  const empty = !day || (day.steps == null && !day.sleepMin && heart == null);
  return (
    <PressableScale onPress={() => router.navigate('/wellbeing')} style={s.card} accessibilityRole="button" accessibilityLabel="Health today. Open health">
      <View style={s.head}>
        <Text style={s.title}>Health today</Text>
        <Ionicons name="chevron-forward" size={18} color={c.faint} />
      </View>
      {empty ? (
        <Text style={s.empty}>Nothing from Health Connect yet today. It shows up a few minutes after your watch or Samsung Health syncs.</Text>
      ) : (
        <View style={s.tiles}>
          <Tile icon="footsteps" color={c.rings[1]} label="Steps" value={day?.steps != null ? formatSteps(day.steps) : '–'} />
          <Tile icon="moon" color={c.primary} label="Sleep" value={day?.sleepMin ? formatSleep(day.sleepMin) : '–'} />
          <Tile icon="heart" color={c.bad} label="Heart" value={heart != null ? `${Math.round(heart)}` : '–'} unit={heart != null ? 'bpm' : undefined} />
        </View>
      )}
    </PressableScale>
  );
}

function Tile({ icon, color, label, value, unit }: { icon: keyof typeof Ionicons.glyphMap; color: string; label: string; value: string; unit?: string }) {
  const s = useStyles();
  return (
    <View style={s.tile}>
      <View style={s.tileHead}>
        <Ionicons name={icon} size={14} color={color} />
        <Text style={s.label} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={s.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? <Text style={s.unit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.card, borderRadius: 28, padding: 16, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '800', color: c.text },
  empty: { fontSize: 13, fontWeight: '600', color: c.muted, lineHeight: 18 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, backgroundColor: c.sunken, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 10 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  label: { fontSize: 12, fontWeight: '700', color: c.muted, flexShrink: 1 },
  value: { fontSize: 20, fontWeight: '900', color: c.text, marginTop: 4 },
  unit: { fontSize: 12, fontWeight: '700', color: c.muted },
}));
