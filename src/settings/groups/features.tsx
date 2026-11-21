import { CONDITIONS, featuresHere } from '../../domain/features';
import { setFeature } from '../features';
import { platform } from '../render';
import { View } from 'react-native';
import { Chip, Text } from '../../components/ui';
import { link, toggle, useSettingStyles } from '../rows';
import type { SettingItem, SettingsGroup } from '../types';

const featureToggles: SettingItem[] = featuresHere(platform.android).map((f) =>
  toggle({
    id: `feature-${f.id}`,
    title: f.title,
    hint: f.hint,
    keywords: ['feature', 'module', 'turn on', 'enable', ...f.keywords],
    androidOnly: f.androidOnly,
    get: (s) => s.features[f.id],
    set: (on, s) => ({ features: { ...s.features, [f.id]: on } }),
    handle: async (on) => setFeature(f.id, on),
  }),
);

const sugarUnit: SettingItem = {
  id: 'sugarUnit',
  title: 'Blood sugar unit',
  hint: 'How readings are shown and typed in. Changing it converts everything already saved.',
  keywords: ['mg/dl', 'mmol', 'glucose', 'unit'],
  feature: 'sugarChecks',
  Component: function SugarUnitRow({ settings, update }) {
    const st = useSettingStyles();
    return (
      <View style={{ paddingVertical: 8 }}>
        <Text style={st.label}>Blood sugar unit</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
          <Chip label="mg/dL" selected={settings.sugarUnit !== 'mmol'} onPress={() => update({ sugarUnit: 'mgdl' })} />
          <Chip label="mmol/L" selected={settings.sugarUnit === 'mmol'} onPress={() => update({ sugarUnit: 'mmol' })} />
        </View>
        <Text style={st.hint}>mg/dL is used in the UAE and the US; mmol/L in the UK and Europe.</Text>
      </View>
    );
  },
};

export const featuresGroup: SettingsGroup = {
  id: 'features',
  title: 'Features and health profile',
  icon: 'apps-outline',
  blurb: 'Choose which parts of Sabr you use',
  summary: (s) => {
    const on = featuresHere(platform.android).filter((f) => s.features[f.id]).length;
    return `${on} ${on === 1 ? 'feature' : 'features'} on`;
  },
  sections: [
    {
      items: [
        link({
          id: 'healthProfile',
          icon: 'person-circle-outline',
          title: 'Health profile',
          hint: 'Your conditions and medicines, so Sabr can suggest the right features. Stays on this phone.',
          keywords: ['conditions', 'diabetes', 'blood pressure', 'profile', 'about me'],
          href: '/profile',
          summary: (s) => {
            const names = s.profile.conditions.map((c) => CONDITIONS.find((x) => x.id === c)?.label).filter(Boolean);
            return names.length ? names.join(', ') : 'Nothing added';
          },
        }),
        link({
          id: 'runSetup',
          icon: 'refresh-outline',
          title: 'Run setup again',
          hint: 'Go through the first-run questions again. Nothing you saved is removed.',
          keywords: ['onboarding', 'welcome', 'start over', 'setup'],
          href: '/setup',
        }),
      ],
    },
    {
      title: 'Features',
      items: featureToggles,
    },
    {
      title: 'Health checks',
      items: [
        link({
          id: 'readings',
          icon: 'stats-chart-outline',
          title: 'Readings',
          hint: 'Every blood sugar and blood pressure reading, with averages.',
          keywords: ['history', 'average', 'glucose', 'blood pressure', 'log'],
          visible: (s) => s.features.sugarChecks || s.features.bpChecks,
          href: '/readings',
        }),
        sugarUnit,
      ],
    },
  ],
};
