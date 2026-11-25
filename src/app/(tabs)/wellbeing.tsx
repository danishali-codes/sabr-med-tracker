import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { metricColor, MetricCard, RangeBar } from '../../components/Dashboard';
import { Screen } from '../../components/Screen';
import { useRowStyles } from '../../components/ToggleRow';
import { Card, PressableScale, SectionTitle, Text } from '../../components/ui';
import { formatDateLong } from '../../domain/dates';
import { featureInfo } from '../../domain/features';
import { METRICS, metricInfo, moveCard, resolveRange, type MetricId } from '../../domain/dashboard';
import { metricShown, saveDashboard, useDashboardData } from '../../hooks/useDashboard';
import { useProgress, useSettings } from '../../hooks/useData';
import { setFeature } from '../../settings/features';
import { makeStyles, useTheme } from '../../theme';

/**
 * The Health tab: a card for each kind of health data (medicines, steps, sleep, heart rate,
 * mood, blood sugar, blood pressure, CPAP) over the dates picked at the top. Cards can be added,
 * removed and moved with Edit. Tapping one opens its own page; medicines open the Medicine tab.
 */
export default function HealthTab() {
  const c = useTheme();
  const s = useStyles();
  const st = useRowStyles();
  const settings = useSettings();
  const { today } = useProgress();
  const dash = settings.dashboard;
  const { from, to } = resolveRange(dash, today);
  const { data, healthLoaded } = useDashboardData(from, to);
  const [editing, setEditing] = useState(false);

  const shown = (id: MetricId) => metricShown(id, settings);
  const cards = dash.cards.filter(shown);
  const addable = METRICS.filter((m) => !dash.cards.includes(m.id) || !shown(m.id));

  const links: { icon: keyof typeof Ionicons.glyphMap; title: string; hint: string; href: Href; show: boolean }[] = [
    { icon: 'analytics-outline', title: 'Patterns', hint: 'What lines up with good and bad days', href: '/patterns', show: true },
    {
      icon: 'list-outline',
      title: 'All readings',
      hint: 'Every blood sugar and blood pressure reading',
      href: '/readings',
      show: settings.features.sugarChecks || settings.features.bpChecks,
    },
    { icon: 'person-outline', title: 'Health profile', hint: 'Your conditions, kept on this phone', href: '/profile', show: true },
    {
      icon: 'settings-outline',
      title: 'Health data settings',
      hint: settings.healthConnect ? 'Reading from Samsung Health. Change what Sabr can read.' : 'Connect Samsung Health for steps, sleep and heart rate',
      href: '/settings/health',
      show: Platform.OS === 'android',
    },
  ];

  const editButton = (
    <Pressable onPress={() => setEditing(!editing)} hitSlop={10} accessibilityRole="button" style={s.editBtn}>
      <Ionicons name={editing ? 'checkmark' : 'create-outline'} size={16} color={c.primary} />
      <Text style={s.editText}>{editing ? 'Done' : 'Edit'}</Text>
    </Pressable>
  );

  return (
    <Screen title="Health" subtitle={formatDateLong(today)}>
      <RangeBar dash={dash} today={today} />

      <SectionTitle right={editButton}>Your cards</SectionTitle>

      {editing ? (
        <>
          <Card>
            {cards.length === 0 ? <Text style={st.hint}>No cards yet. Add some below.</Text> : null}
            {cards.map((id, i) => {
              const info = metricInfo(id);
              return (
                <View key={id} style={[s.editRow, i > 0 && s.divider]}>
                  <Ionicons name={info.icon as keyof typeof Ionicons.glyphMap} size={20} color={metricColor(c, info.color)} />
                  <Text style={[st.label, { flex: 1 }]} numberOfLines={1}>
                    {info.title}
                  </Text>
                  <IconBtn icon="arrow-up" label={`Move ${info.title} up`} disabled={i === 0} onPress={() => saveDashboard({ cards: moveCard(dash.cards, id, -1, shown) })} />
                  <IconBtn
                    icon="arrow-down"
                    label={`Move ${info.title} down`}
                    disabled={i === cards.length - 1}
                    onPress={() => saveDashboard({ cards: moveCard(dash.cards, id, 1, shown) })}
                  />
                  <IconBtn icon="close" label={`Remove ${info.title}`} onPress={() => saveDashboard({ cards: dash.cards.filter((x) => x !== id) })} />
                </View>
              );
            })}
          </Card>
          {addable.length ? (
            <>
              <SectionTitle>Add a card</SectionTitle>
              <Card>
                {addable.map((m, i) => {
                  const off = m.feature && !settings.features[m.feature] ? featureInfo(m.feature) : null;
                  return (
                    <PressableScale
                      key={m.id}
                      scaleTo={0.98}
                      onPress={() => {
                        if (m.feature && off) setFeature(m.feature, true);
                        const now = dash.cards.filter((x) => x !== m.id);
                        saveDashboard({ cards: [...now, m.id] });
                      }}
                      style={[s.editRow, i > 0 && s.divider]}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${m.title}`}
                    >
                      <Ionicons name={m.icon as keyof typeof Ionicons.glyphMap} size={20} color={metricColor(c, m.color)} />
                      <View style={{ flex: 1 }}>
                        <Text style={st.label}>{m.title}</Text>
                        <Text style={st.hint}>{off ? `Turns on ${off.title}` : m.hint}</Text>
                      </View>
                      <Ionicons name="add-circle" size={24} color={c.primary} />
                    </PressableScale>
                  );
                })}
              </Card>
            </>
          ) : null}
        </>
      ) : cards.length === 0 ? (
        <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
          <Ionicons name="grid-outline" size={32} color={c.muted} />
          <Text style={[st.label, { marginTop: 8 }]}>No cards</Text>
          <Text style={[st.hint, { textAlign: 'center' }]}>Tap Edit to add steps, sleep, mood and more.</Text>
        </Card>
      ) : (
        <View style={s.grid}>
          {cards.map((id) => (
            <MetricCard key={id} id={id} data={data} from={from} to={to} today={today} stat={dash.stat} settings={settings} loaded={healthLoaded} />
          ))}
          {/* An odd card out stays half width instead of stretching across. */}
          {cards.length % 2 === 1 ? <View style={s.spacer} /> : null}
        </View>
      )}

      <SectionTitle>More</SectionTitle>
      {links
        .filter((l) => l.show)
        .map((l) => (
          <PressableScale key={l.title} onPress={() => router.push(l.href)} style={[st.linkCard, { marginTop: 0, marginBottom: 10 }]}>
            <View style={s.bubble}>
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

function IconBtn({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  const c = useTheme();
  const s = useStyles();
  return (
    <PressableScale onPress={onPress} disabled={disabled} haptic accessibilityLabel={label} style={[s.iconBtn, disabled && { opacity: 0.35 }]}>
      <Ionicons name={icon} size={18} color={c.text} />
    </PressableScale>
  );
}

const useStyles = makeStyles((c) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  spacer: { flexGrow: 1, flexBasis: 150 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: c.primarySoft },
  editText: { fontSize: 13, fontWeight: '800', color: c.primary },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: c.border },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.sunken, alignItems: 'center', justifyContent: 'center' },
  bubble: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
}));
