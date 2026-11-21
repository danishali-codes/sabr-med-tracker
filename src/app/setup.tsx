import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConditionFields, MedicineFields } from '../components/ProfileFields';
import { ToggleRow } from '../components/ToggleRow';
import { Button, Card, Text } from '../components/ui';
import * as repo from '../db/repo';
import { formatTime, toDateKey } from '../domain/dates';
import { defaultPlan, planMeds } from '../domain/checks';
import { saveMedication } from '../actions';
import {
  featuresHere,
  featuresInUse,
  featuresPatch,
  normalizeFeatures,
  routinesFor,
  suggestedFeatures,
  type FeatureFlags,
  type FeatureId,
  type HealthProfile,
} from '../domain/features';
import { useSettings } from '../hooks/useData';
import { updateSettings } from '../settings/rows';
import { pushToWatchNow, clearWatch } from '../wear/sync';
import { FONT, makeStyles, MED_COLORS, useTheme } from '../theme';

type Step = 'welcome' | 'health' | 'medicines' | 'features' | 'reminders' | 'finish';
const FULL: Step[] = ['welcome', 'health', 'medicines', 'features', 'reminders', 'finish'];

const android = Platform.OS === 'android';

/**
 * First-run setup. A fresh install goes through every step; an install that already has
 * medicines (after updating) gets the features step only, with what it already uses ticked.
 * Every step can be skipped, and it can be run again from Settings, Features.
 */
export default function SetupScreen() {
  const c = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const [fresh, setFresh] = useState(() => repo.isFreshInstall());
  // Coming back from Settings: start from what is set now. After an update: from what is in use.
  const [features, setFeatures] = useState<FeatureFlags>(() =>
    settings.setupDone || fresh ? settings.features : normalizeFeatures({ ...featuresInUse(repo.inUseNow()), ...pickedBefore(settings.features) }),
  );
  const [profile, setProfile] = useState<HealthProfile>(settings.profile);
  const [alarmStyle, setAlarmStyle] = useState(settings.alarmStyle);
  const [showMedNames, setShowMedNames] = useState(settings.showMedNames);
  const steps: Step[] = fresh || settings.setupDone ? FULL : ['features', 'finish'];
  const [i, setI] = useState(0);
  const step = steps[i];

  // Back from restoring a backup: start again from what the backup brought, so finishing or
  // skipping never writes this screen's earlier answers over the restored settings.
  useFocusEffect(
    useCallback(() => {
      if (!fresh || repo.isFreshInstall()) return;
      const restored = repo.getSettings();
      if (restored.setupDone) {
        router.replace('/');
        return;
      }
      setFresh(false);
      setFeatures(normalizeFeatures({ ...featuresInUse(repo.inUseNow()), ...pickedBefore(restored.features) }));
      setProfile(restored.profile);
      setAlarmStyle(restored.alarmStyle);
      setShowMedNames(restored.showMedNames);
      setI(0);
    }, [fresh]),
  );
  const last = i === steps.length - 1;

  const changeProfile = (next: HealthProfile) => {
    // Picking a condition ticks the features it suggests; taking it away leaves them for the person to untick.
    const added = next.conditions.filter((x) => !profile.conditions.includes(x));
    const suggest = suggestedFeatures(added);
    if (suggest.length) setFeatures((f) => ({ ...f, ...Object.fromEntries(suggest.map((id) => [id, true])) }));
    setProfile(next);
  };

  const finish = (then: 'today' | 'addMed') => {
    const s0 = repo.getSettings();
    const patch = { ...featuresPatch(s0, features), profile, setupDone: true, alarmStyle, showMedNames };
    // Routines from "how many times a day", only when there are none yet.
    const routines =
      s0.routines.length === 0 && profile.timesPerDay && profile.medsPerDay && profile.medsPerDay !== 'none'
        ? routinesFor(profile.timesPerDay).map((r) => ({ id: repo.newId(), ...r }))
        : s0.routines;
    updateSettings({ ...patch, routines });
    // Blood sugar or blood pressure checks ticked with none set up yet: start them on the usual
    // plan for this profile. They can be changed from the Meds tab.
    for (const type of ['sugar', 'bp'] as const) {
      const on = type === 'sugar' ? features.sugarChecks : features.bpChecks;
      if (!on || s0.features[type === 'sugar' ? 'sugarChecks' : 'bpChecks'] || repo.getMeds().some((m) => m.check?.type === type)) continue;
      for (const med of planMeds(defaultPlan(type, profile), toDateKey(new Date()), repo.newId, type === 'sugar' ? MED_COLORS[4] : MED_COLORS[3])) {
        saveMedication(med).catch(() => {});
      }
    }
    if (patch.watchTile !== s0.watchTile) (patch.watchTile ? pushToWatchNow() : clearWatch()).catch(() => {});
    router.replace('/');
    if (then === 'addMed') router.push({ pathname: '/med/[id]', params: { id: 'new', setup: '1' } });
  };

  const skipAll = () => finish('today');
  const next = () => setI((n) => Math.min(n + 1, steps.length - 1));
  const back = () => setI((n) => Math.max(n - 1, 0));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: 20, paddingBottom: 24 }}>
        <View style={s.topRow}>
          <Text style={s.stepCount}>{steps.length > 2 ? `Step ${i + 1} of ${steps.length}` : 'One more thing'}</Text>
          {!last ? <Button title="Skip setup" kind="ghost" small onPress={skipAll} /> : null}
        </View>

        {step === 'welcome' ? (
          <>
            <Text style={s.title}>Sabr keeps your health on this phone</Text>
            <Text style={s.body}>A few questions so Sabr shows what you need and leaves out the rest. It takes about a minute, and you can change anything later in Settings.</Text>
            <Card>
              <Point icon="phone-portrait-outline" text="Everything you add stays on this phone. Nothing goes online unless you turn it on." />
              <Point icon="eye-off-outline" text="Reminders say 'your medicine', not its name, until you choose otherwise." />
              <Point icon="options-outline" text="Features you don't pick stay off and out of the way." />
            </Card>
            {fresh ? <Button title="Restore a backup instead" kind="ghost" onPress={() => router.push('/backup')} /> : null}
          </>
        ) : null}

        {step === 'health' ? (
          <>
            <Text style={s.title}>Do you have any of these?</Text>
            <Text style={s.body}>Pick any that apply, or none. Sabr uses this to suggest features. It stays on this phone and is never shared.</Text>
            <Card>
              <ConditionFields profile={profile} onChange={changeProfile} />
            </Card>
          </>
        ) : null}

        {step === 'medicines' ? (
          <>
            <Text style={s.title}>Your medicines</Text>
            <Text style={s.body}>Roughly is fine. This sets up your reminder times; you add the medicines themselves at the end.</Text>
            <Card>
              <MedicineFields profile={profile} onChange={changeProfile} />
              {profile.timesPerDay && profile.medsPerDay !== 'none' && settings.routines.length === 0 ? (
                <Text style={[s.body, { marginTop: 12, marginBottom: 0 }]}>
                  Sabr will set up{' '}
                  {routinesFor(profile.timesPerDay)
                    .map((r) => `${r.name} at ${formatTime(r.time)}`)
                    .join(', ')}
                  . You can rename or move them in Routines.
                </Text>
              ) : null}
            </Card>
          </>
        ) : null}

        {step === 'features' ? (
          <>
            <Text style={s.title}>{fresh || settings.setupDone ? 'What would help you?' : 'Choose your features'}</Text>
            <Text style={s.body}>
              {fresh || settings.setupDone
                ? 'Medicines and reminders are always on. Tick anything else you want; the rest stays off until you turn it on in Settings, Features.'
                : "Sabr can now hide the parts you don't use. Everything you already use is ticked. Nothing you saved is removed, and you can change this any time in Settings, Features."}
            </Text>
            <Card>
              {featuresHere(android, true).map((f, n) => (
                <View key={f.id}>
                  {n > 0 ? <View style={s.divider} /> : null}
                  <ToggleRow
                    label={f.question}
                    hint={f.available ? f.hint : `${f.hint} Coming in a later update.`}
                    value={features[f.id]}
                    onChange={(v) => setFeatures((cur) => ({ ...cur, [f.id]: v }))}
                  />
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {step === 'reminders' ? (
          <>
            <Text style={s.title}>Reminders</Text>
            <Text style={s.body}>You can fine-tune repeats, snooze and quiet hours later in Settings, Reminders.</Text>
            <Card>
              {android ? (
                <>
                  <ToggleRow label="Alarm-style reminders" hint="Rings exactly on time, even in battery saver." value={alarmStyle} onChange={setAlarmStyle} />
                  <View style={s.divider} />
                </>
              ) : null}
              <ToggleRow
                label="Medicine names in reminders"
                hint={showMedNames ? 'Reminders name the medicine, so anyone who sees your screen can read it.' : "Off. Reminders say 'Time for your 8:00 dose'."}
                value={showMedNames}
                onChange={setShowMedNames}
              />
            </Card>
          </>
        ) : null}

        {step === 'finish' ? (
          <>
            <Text style={s.title}>All set</Text>
            <Text style={s.body}>
              {fresh && profile.medsPerDay !== 'none'
                ? 'Add your medicines now, one after another, or skip and add them from the Meds tab later.'
                : 'You can change your features any time in Settings, Features.'}
            </Text>
            {(['sugar', 'bp'] as const)
              .filter((t) => (t === 'sugar' ? features.sugarChecks && !settings.features.sugarChecks : features.bpChecks && !settings.features.bpChecks))
              .filter((t) => !repo.getMeds().some((m) => m.check?.type === t))
              .map((t) => (
                <Text key={t} style={s.body}>
                  {t === 'sugar' ? 'Blood sugar checks' : 'Blood pressure checks'}: {defaultPlan(t, profile).label.toLowerCase()}. You can change the times or pick another plan in the Meds tab.
                </Text>
              ))}
          </>
        ) : null}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        {last ? (
          fresh && profile.medsPerDay !== 'none' ? (
            <>
              <Button title="Add my medicines" onPress={() => finish('addMed')} />
              <Button title="Skip, I'll add them later" kind="ghost" onPress={() => finish('today')} />
            </>
          ) : (
            <Button title="Done" onPress={() => finish('today')} />
          )
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {i > 0 ? <Button title="Back" kind="secondary" onPress={back} style={{ flexGrow: 1 }} /> : null}
            <Button title="Continue" onPress={next} style={{ flexGrow: 2 }} />
          </View>
        )}
      </View>
    </View>
  );
}

/** Flags turned on earlier that the in-use check can't see (e.g. sugar checks ticked before they were built). */
function pickedBefore(f: FeatureFlags): Partial<FeatureFlags> {
  const out: Partial<FeatureFlags> = {};
  for (const id of Object.keys(f) as FeatureId[]) if (f[id] && id !== 'rewards') out[id] = true;
  return out;
}

function Point({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const c = useTheme();
  const s = useStyles();
  return (
    <View style={s.point}>
      <Ionicons name={icon} size={20} color={c.primary} />
      <Text style={s.pointText}>{text}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, minHeight: 36 },
  stepCount: { fontSize: 13, color: c.muted, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontSize: 28, color: c.text, fontFamily: FONT.black, marginBottom: 8, lineHeight: 34 },
  body: { fontSize: 15, color: c.muted, fontWeight: '600', lineHeight: 21, marginBottom: 16 },
  divider: { height: 1, backgroundColor: c.border, marginVertical: 4 },
  point: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 8 },
  pointText: { flex: 1, fontSize: 15, color: c.text, fontWeight: '700', lineHeight: 21 },
  footer: { paddingHorizontal: 20, paddingTop: 12, gap: 8, backgroundColor: c.bg, borderTopWidth: 1, borderTopColor: c.border },
}));
