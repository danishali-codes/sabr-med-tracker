import { router } from 'expo-router';
import { View } from 'react-native';
import { HealthConnectSetup } from '../../components/HealthConnectSetup';
import { popup } from '../../components/Popup';
import { Button, Text } from '../../components/ui';
import { DEFAULT_DASHBOARD } from '../../domain/dashboard';
import { saveDashboard } from '../../hooks/useDashboard';
import { useSettingStyles } from '../rows';
import type { SettingsGroup } from '../types';

function Info({ children }: { children: string }) {
  const st = useSettingStyles();
  return <Text style={[st.hint, { marginVertical: 4 }]}>{children}</Text>;
}

function DashboardCards() {
  const st = useSettingStyles();
  return (
    <View style={{ paddingVertical: 6 }}>
      <Text style={st.label}>Cards on the Health tab</Text>
      <Text style={st.hint}>Tap Edit on the Health tab to add, remove or move cards. The dates and the way values are summed up are picked at the top of the tab.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        <Button title="Open the Health tab" small onPress={() => router.navigate('/wellbeing')} style={{ flexGrow: 1 }} />
        <Button
          title="Reset the cards"
          small
          kind="secondary"
          style={{ flexGrow: 1 }}
          onPress={() =>
            popup('Reset the Health tab?', 'Puts every card back in the starting order, and shows the last 7 days as averages.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reset', onPress: () => saveDashboard(DEFAULT_DASHBOARD) },
            ])
          }
        />
      </View>
    </View>
  );
}

/** Reading from Samsung Health (through Health Connect), and the Health tab's cards. */
export const healthGroup: SettingsGroup = {
  id: 'health',
  title: 'Health data',
  icon: 'heart-outline',
  blurb: 'Samsung Health, and the cards on the Health tab',
  summary: (s) => (s.features.healthData && s.healthConnect ? 'Reading steps, sleep and heart rate' : null),
  sections: [
    {
      items: [
        {
          id: 'healthData',
          feature: 'healthData',
          title: 'Read health data',
          hint: 'Bring in steps, sleep and heart rate from Samsung Health through Health Connect.',
          keywords: ['samsung health', 'health connect', 'steps', 'sleep', 'heart rate', 'pulse', 'fitness', 'galaxy watch', 'google fit', 'permissions'],
          androidOnly: true,
          Component: HealthConnectSetup,
        },
      ],
    },
    {
      title: 'From Samsung Health',
      items: [
        {
          id: 'samsungHealthSharing',
          feature: 'healthData',
          title: 'Sharing from Samsung Health',
          hint: 'Samsung Health has to share with Health Connect first.',
          keywords: ['samsung health', 'health connect', 'galaxy watch', 'share', 'not showing'],
          androidOnly: true,
          Component: () => (
            <Info>
              Samsung Health has to share with Health Connect first. In Samsung Health, open the menu, then Settings, then Health Connect, and allow steps, sleep
              and heart rate. Data from your Galaxy Watch reaches Samsung Health first, so it comes through too. New data shows up a few minutes after it syncs.
            </Info>
          ),
        },
      ],
    },
    {
      title: 'Health tab',
      items: [
        {
          id: 'dashboardCards',
          title: 'Cards on the Health tab',
          hint: 'Add, remove and move the cards, or reset them.',
          keywords: ['dashboard', 'cards', 'reorder', 'move', 'remove', 'add', 'health tab', 'average', 'median', 'date range'],
          Component: DashboardCards,
        },
        {
          id: 'healthPrivacy',
          title: 'Where health data goes',
          hint: 'Read on this phone only, never saved or sent.',
          keywords: ['privacy', 'health data', 'stored', 'backup'],
          Component: () => (
            <Info>
              Health data from Health Connect is read on this phone each time you look, and Sabr never writes to it. Sabr doesn't keep a copy, so it isn't in
              backups, reports or anything shared. Shown for your own interest, not as medical advice.
            </Info>
          ),
        },
      ],
    },
  ],
};
