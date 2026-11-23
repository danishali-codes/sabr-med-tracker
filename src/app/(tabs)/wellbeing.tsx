import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { HealthToday } from '../../components/HealthToday';
import { Screen } from '../../components/Screen';
import { SleepTrendCard } from '../../components/SleepTrendCard';
import { useRowStyles } from '../../components/ToggleRow';
import { PressableScale, SectionTitle, Text } from '../../components/ui';
import { addDays, formatDateLong } from '../../domain/dates';
import { formatReading } from '../../domain/checks';
import { machineKind } from '../../domain/machines';
import { isMachine } from '../../domain/types';
import * as repo from '../../db/repo';
import { useDbVersion, useMeds, useProgress, useSettings } from '../../hooks/useData';
import { useTheme } from '../../theme';

/**
 * The Health tab: everything that isn't a medicine. Samsung Health data, sleep next to the
 * CPAP, readings and mood, each shown when its feature is on.
 */
export default function HealthTab() {
  const c = useTheme();
  const st = useRowStyles();
  const settings = useSettings();
  const meds = useMeds();
  const version = useDbVersion();
  const { today } = useProgress();
  const f = settings.features;

  const machine = useMemo(
    () => (f.machines ? (meds.find((m) => !m.archived && isMachine(m) && machineKind(m.machine?.type).nightly) ?? null) : null),
    [meds, f.machines],
  );
  const lastReadings = useMemo(() => {
    const all = repo.getReadings(addDays(today, -30), today);
    const last = (type: 'sugar' | 'bp') => [...all].reverse().find((r) => r.type === type) ?? null;
    return { sugar: f.sugarChecks ? last('sugar') : null, bp: f.bpChecks ? last('bp') : null };
  }, [today, version, f.sugarChecks, f.bpChecks]);

  const links: { icon: keyof typeof Ionicons.glyphMap; title: string; hint: string; href: Href; show: boolean }[] = [
    {
      icon: 'footsteps-outline',
      title: settings.healthConnect ? 'Steps, sleep and heart rate' : 'Connect Samsung Health',
      hint: settings.healthConnect ? 'The last 7 days next to your doses and mood' : 'Read your steps, sleep and heart rate. Stays on this phone.',
      href: '/health',
      show: true,
    },
    {
      icon: 'water-outline',
      title: 'Readings',
      hint: [lastReadings.sugar, lastReadings.bp]
        .filter((r) => !!r)
        .map((r) => `Last ${r!.type === 'bp' ? 'BP' : 'sugar'} ${formatReading(r!, settings.sugarUnit)}`)
        .join(' · ') || 'Blood sugar and blood pressure',
      href: '/readings',
      show: f.sugarChecks || f.bpChecks,
    },
    { icon: 'happy-outline', title: 'Mood trend', hint: 'How your days have felt', href: '/mood', show: f.mood },
    { icon: 'analytics-outline', title: 'Patterns', hint: 'What lines up with good and bad days', href: '/patterns', show: true },
    { icon: 'person-outline', title: 'Health profile', hint: 'Your conditions, kept on this phone', href: '/profile', show: true },
  ];

  return (
    <Screen title="Health" subtitle={formatDateLong(today)}>
      <HealthToday today={today} enabled={settings.healthConnect} />
      <SleepTrendCard machine={machine} today={today} healthOn={settings.healthConnect} />
      <SectionTitle>More</SectionTitle>
      {links
        .filter((l) => l.show)
        .map((l) => (
          <PressableScale key={l.title} onPress={() => router.push(l.href)} style={[st.linkCard, { marginTop: 0, marginBottom: 10 }]}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={l.icon} size={20} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.label}>{l.title}</Text>
              <Text style={st.hint} numberOfLines={2}>
                {l.hint}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={c.faint} />
          </PressableScale>
        ))}
    </Screen>
  );
}
