import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import type { DoseLog, Medication, ScheduledDose } from '../domain/types';
import { makeStyles, useTheme } from '../theme';
import { DoseRow } from './DoseRow';
import { Card, FadeIn, SectionTitle, Text } from './ui';

/**
 * Today's blood sugar and blood pressure checks. Kept apart from medicines, so a missed
 * check never touches the streak.
 */
export function ChecksSection({
  checks,
  doses,
  logs,
  windowMinutes,
}: {
  checks: Medication[];
  doses: ScheduledDose[];
  logs: Map<string, DoseLog>;
  windowMinutes: number;
}) {
  const c = useTheme();
  const s = useStyles();
  if (checks.length === 0) return null;
  const answered = doses.filter((d) => logs.has(d.slot)).length;
  const types = new Set(checks.map((m) => m.check?.type));
  const only = types.size === 1 ? [...types][0] : undefined;

  return (
    <FadeIn delay={140}>
      <SectionTitle right={doses.length > 0 && answered === doses.length ? <Text style={[s.tag, { color: c.good, backgroundColor: c.goodSoft }]}>Done</Text> : null}>
        Checks
      </SectionTitle>
      <Card style={{ paddingVertical: 6 }}>
        {doses.map((d) => {
          const med = checks.find((m) => m.id === d.medId);
          return med ? <DoseRow key={d.slot} dose={d} med={med} log={logs.get(d.slot)} windowMinutes={windowMinutes} showTime /> : null;
        })}
        <View style={[s.links, doses.length > 0 && s.linksBorder]}>
          <Pressable onPress={() => router.push({ pathname: '/check/log', params: only ? { type: only } : {} })} style={s.link} accessibilityRole="button">
            <Ionicons name="add-circle-outline" size={18} color={c.primary} />
            <Text style={s.linkText}>Log a reading</Text>
          </Pressable>
          <Pressable onPress={() => router.push({ pathname: '/readings', params: only ? { type: only } : {} })} style={s.link} accessibilityRole="button">
            <Ionicons name="stats-chart-outline" size={18} color={c.primary} />
            <Text style={s.linkText}>Readings</Text>
          </Pressable>
        </View>
      </Card>
      <Text style={s.hint}>Checks never affect your streak.</Text>
    </FadeIn>
  );
}

const useStyles = makeStyles((c) => ({
  tag: { fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, paddingVertical: 12 },
  linksBorder: { borderTopWidth: 1, borderTopColor: c.border },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkText: { fontSize: 14, fontWeight: '800', color: c.primary },
  hint: { fontSize: 13, color: c.muted, fontWeight: '600', marginTop: -4, marginBottom: 10, marginLeft: 6 },
}));
