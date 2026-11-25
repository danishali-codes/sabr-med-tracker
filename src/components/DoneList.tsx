import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { AppState, LayoutAnimation, View } from 'react-native';
import type { DoseLog, Medication, ScheduledDose } from '../domain/types';
import { makeStyles, useTheme } from '../theme';
import { DoseRow } from './DoseRow';
import { Card, PressableScale, Text } from './ui';

/**
 * Doses already taken or skipped today, folded into one line so the ones still to take
 * sit at the top. Closed each time the app opens; tap to see them (and undo from there).
 */
export function DoneList({
  doses,
  medById,
  logs,
  windowMinutes,
}: {
  doses: ScheduledDose[];
  medById: Map<string, Medication>;
  logs: Map<string, DoseLog>;
  windowMinutes: number;
}) {
  const c = useTheme();
  const s = useStyles();
  const [open, setOpen] = useState(false);

  // Fold it again whenever the app comes back to the front.
  useEffect(() => {
    let last = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && last !== 'active') setOpen(false);
      last = next;
    });
    return () => sub.remove();
  }, []);

  if (doses.length === 0) return null;
  const taken = doses.filter((d) => logs.get(d.slot)?.status === 'taken').length;
  const missed = doses.filter((d) => logs.get(d.slot)?.status === 'missed').length;
  const skipped = doses.length - taken - missed;
  const summary = [taken ? `${taken} taken` : null, skipped ? `${skipped} skipped` : null, missed ? `${missed} missed` : null].filter(Boolean).join(', ');

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => !o);
  };

  return (
    <View style={{ marginTop: 4, marginBottom: 6 }}>
      <PressableScale
        onPress={toggle}
        style={s.head}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Done today, ${summary}. ${open ? 'Hide' : 'Show'}`}
      >
        <View style={[s.badge, { backgroundColor: c.goodSoft }]}>
          <Ionicons name="checkmark-done" size={18} color={c.good} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Done today</Text>
          <Text style={s.sub} numberOfLines={1}>
            {summary}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={c.muted} />
      </PressableScale>
      {open ? (
        <Card style={{ paddingVertical: 6, marginTop: 8 }}>
          {doses.map((d) => {
            const med = medById.get(d.medId);
            return med ? <DoseRow key={d.slot} dose={d} med={med} log={logs.get(d.slot)} windowMinutes={windowMinutes} showTime /> : null;
          })}
        </Card>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12 },
  badge: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: c.text },
  sub: { fontSize: 13, fontWeight: '600', color: c.muted, marginTop: 1 },
}));
