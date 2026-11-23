import { View } from 'react-native';
import { Chip, Text } from '../../components/ui';
import { toggle, useSettingStyles } from '../rows';
import type { SettingsGroup } from '../types';

const APPEARANCE = [
  ['system', 'Match phone'],
  ['light', 'Light'],
  ['dark', 'Dark'],
] as const;

export const lookGroup: SettingsGroup = {
  id: 'look',
  title: 'Look and feel',
  icon: 'color-palette-outline',
  blurb: 'Light or dark, true black, tabs at the bottom, confetti',
  summary: (s) => `${APPEARANCE.find(([v]) => v === s.appearance)?.[1] ?? 'Match phone'}${s.trueBlack ? ', true black' : ''}`,
  sections: [
    {
      items: [
        {
          id: 'appearance',
          title: 'Appearance',
          hint: 'Light, dark, or match the phone.',
          keywords: ['theme', 'dark mode', 'light mode', 'night', 'colour', 'color'],
          Component: function Appearance({ settings, update }) {
            const st = useSettingStyles();
            return (
              <View style={{ paddingVertical: 6 }}>
                <Text style={[st.label, { marginBottom: 8 }]}>Appearance</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {APPEARANCE.map(([v, label]) => (
                    <Chip key={v} label={label} selected={settings.appearance === v} onPress={() => update({ appearance: v })} />
                  ))}
                </View>
              </View>
            );
          },
        },
        toggle({
          id: 'trueBlack',
          title: 'True black in dark mode',
          hint: 'Pure black backgrounds. Looks great and saves battery on most Samsung screens.',
          keywords: ['amoled', 'oled', 'battery', 'theme'],
          get: (s) => s.trueBlack,
          set: (trueBlack) => ({ trueBlack }),
        }),
        toggle({
          id: 'celebrate',
          feature: 'rewards',
          title: 'Confetti when the day is done',
          hint: 'A short burst of confetti when every dose of the day is logged.',
          keywords: ['celebrate', 'animation'],
          get: (s) => s.celebrate,
          set: (celebrate) => ({ celebrate }),
        }),
      ],
    },
    {
      title: 'Tabs at the bottom',
      items: [
        toggle({
          id: 'tab-meds',
          title: 'Medicine',
          hint: 'Your medicines, supplements, machines and schedules. Today is always there, and a hidden tab keeps everything in it.',
          keywords: ['tab', 'tabs', 'bottom bar', 'navigation', ...['meds', 'medication', 'pills']],
          get: (s) => s.tabs.meds,
          set: (v, s) => ({ tabs: { ...s.tabs, meds: v } }),
        }),
        toggle({
          id: 'tab-health',
          title: 'Health',
          hint: 'Samsung Health, sleep and CPAP trends, readings and mood.',
          keywords: ['tab', 'tabs', 'bottom bar', 'navigation', ...['health', 'sleep', 'cpap', 'steps', 'samsung']],
          get: (s) => s.tabs.health,
          set: (v, s) => ({ tabs: { ...s.tabs, health: v } }),
        }),
        toggle({
          id: 'tab-history',
          title: 'History',
          hint: 'The calendar of past days.',
          keywords: ['tab', 'tabs', 'bottom bar', 'navigation', ...['calendar', 'history', 'past']],
          get: (s) => s.tabs.history,
          set: (v, s) => ({ tabs: { ...s.tabs, history: v } }),
        }),
        toggle({
          id: 'tab-progress',
          title: 'Progress',
          hint: 'Streaks, badges, reports and reviews.',
          keywords: ['tab', 'tabs', 'bottom bar', 'navigation', ...['streak', 'badges', 'report', 'progress']],
          get: (s) => s.tabs.progress,
          set: (v, s) => ({ tabs: { ...s.tabs, progress: v } }),
        }),
      ],
    },
  ],
};
