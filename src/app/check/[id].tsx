import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { removeMedication, saveMedication } from '../../actions';
import { MedIcon } from '../../components/MedIcon';
import { popup } from '../../components/Popup';
import { TimeButton } from '../../components/Pickers';
import { PageScroll } from '../../components/Screen';
import { Button, Card, Chip, Field, Input, PressableScale, Select, Text } from '../../components/ui';
import { bpStats, checkName, CHECK_KINDS, formatSugar, planMeds, plansFor, SUGAR_TIMINGS, sugarStats, type CheckPlan } from '../../domain/checks';
import { addDays, formatDateLong, toDateKey, weekdayShort, type TimeOfDay } from '../../domain/dates';
import type { CheckType, Medication, SugarTiming } from '../../domain/types';
import * as repo from '../../db/repo';
import { useDbVersion, useSettings } from '../../hooks/useData';
import { makeStyles, MED_COLORS, useTheme } from '../../theme';

const CHECK_COLORS: Record<CheckType, string> = { sugar: MED_COLORS[4], bp: MED_COLORS[3] };

/** One blood sugar or blood pressure check: when to check, and how the readings look. */
export default function CheckEditor() {
  const c = useTheme();
  const st = useStyles();
  const settings = useSettings();
  const params = useLocalSearchParams<{ id: string; type?: CheckType }>();
  const version = useDbVersion();
  const existing = useMemo(() => (params.id && params.id !== 'new' ? repo.getMed(params.id) : null), [params.id, version]);
  const today = toDateKey(new Date());

  const [type, setType] = useState<CheckType>(existing?.check?.type ?? (params.type === 'bp' ? 'bp' : 'sugar'));
  const [timing, setTiming] = useState<SugarTiming>(existing?.check?.timing ?? 'fasting');
  const [name, setName] = useState(existing?.name ?? '');
  const [times, setTimes] = useState<TimeOfDay[]>(existing?.schedule.times.length ? existing.schedule.times : ['07:00']);
  const pattern = existing?.schedule.pattern;
  const [days, setDays] = useState<number[] | null>(pattern?.kind === 'weekdays' ? pattern.days : null);
  const [endDate, setEndDate] = useState<string | null>(existing?.schedule.endDate ?? null);
  const [color, setColor] = useState(existing?.color ?? CHECK_COLORS[type]);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const firstOfType = !existing && !repo.getMeds().some((m) => !m.archived && m.check?.type === type);
  const [custom, setCustom] = useState(!firstOfType);

  const pickType = (t: CheckType) => {
    setType(t);
    if (!existing) {
      setColor(CHECK_COLORS[t]);
      setTimes(t === 'bp' ? ['07:30', '20:00'] : ['07:00']);
    }
  };

  const addPlan = async (plan: CheckPlan) => {
    for (const med of planMeds(plan, today, repo.newId, CHECK_COLORS[plan.type])) await saveMedication(med);
    router.back();
  };

  const build = (): Medication => {
    const check = type === 'sugar' ? { type, timing } : { type };
    return {
      id: existing?.id ?? repo.newId(),
      name: name.trim() || checkName(check),
      strength: '',
      amount: 1,
      form: 'other',
      color,
      schedule: {
        pattern: days && days.length ? { kind: 'weekdays', days: [...days].sort() } : { kind: 'daily' },
        times: [...new Set(times)].sort(),
        startDate: existing?.schedule.startDate ?? today,
        endDate,
      },
      stock: null,
      refillAt: null,
      archived: existing?.archived ?? false,
      archivedAt: existing?.archivedAt ?? null,
      pauses: existing?.pauses,
      notes: notes.trim() || undefined,
      check,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
  };

  const save = async () => {
    if (times.length === 0) return popup('Add a time', 'When should Sabr remind you to check?');
    if (days && days.length === 0) return popup('Pick a day', 'Choose at least one day, or switch to every day.');
    await saveMedication(build());
    router.back();
  };

  const archive = async () => {
    if (!existing) return;
    await saveMedication({ ...existing, archived: !existing.archived, archivedAt: existing.archived ? null : new Date().toISOString() });
    router.back();
  };

  const remove = () =>
    popup('Delete this check?', 'Its reminders stop. Readings you already saved stay in Readings. Your medicine streak is not affected.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (existing) await removeMedication(existing.id);
          router.back();
        },
      },
    ]);

  const from = addDays(today, -29);
  const readings = useMemo(() => (existing ? repo.getReadings(from, today).filter((r) => r.medId === existing.id) : []), [existing, from, today, version]);

  const title = existing ? (existing.archived ? 'Archived check' : 'Edit check') : type === 'bp' ? 'Blood pressure checks' : 'Blood sugar checks';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title }} />
      <PageScroll contentContainerStyle={st.container} keyboardShouldPersistTaps="handled">
        {!existing ? (
          <Card>
            <Field label="What to check" style={{ marginBottom: 0 }}>
              <View style={st.wrap}>
                {CHECK_KINDS.map((k) => (
                  <Chip key={k.type} label={k.label} selected={type === k.type} onPress={() => pickType(k.type)} />
                ))}
              </View>
            </Field>
          </Card>
        ) : null}

        {!existing && !custom ? (
          <>
            <Text style={st.section}>Pick a plan</Text>
            <Text style={[st.hint, { marginHorizontal: 6, marginBottom: 10 }]}>
              Common plans to start from. Your doctor may suggest something else; you can change the times after.
            </Text>
            {plansFor(type).map((plan) => (
              <PressableScale key={plan.id} onPress={() => addPlan(plan)} scaleTo={0.98}>
                <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.planTitle}>{plan.label}</Text>
                    <Text style={st.hint}>{plan.hint}</Text>
                  </View>
                  <Ionicons name="add-circle" size={28} color={c.primary} />
                </Card>
              </PressableScale>
            ))}
            <Button title="Set my own times instead" kind="ghost" onPress={() => setCustom(true)} />
          </>
        ) : (
          <>
            {existing && readings.length > 0 ? <ReadingsCard type={type} readings={readings} unit={settings.sugarUnit} /> : null}

            <Card>
              <View style={st.headRow}>
                <MedIcon med={{ form: 'other', color, check: { type } }} size={54} />
                <Text style={[st.hint, { flex: 1 }]}>A reminder at each time, answered by logging the reading. Checks have their own place on Today and never count towards your streak.</Text>
              </View>
              {type === 'sugar' ? (
                <Field label="When">
                  <Select title="When" value={timing} onChange={setTiming} options={SUGAR_TIMINGS.map((t) => ({ value: t.value, label: t.label }))} />
                </Field>
              ) : null}
              <Field label="Name" style={{ marginBottom: 0 }}>
                <Input value={name} onChangeText={setName} placeholder={checkName(type === 'sugar' ? { type, timing } : { type })} autoCorrect={false} />
              </Field>
            </Card>

            <Card>
              <Text style={st.cardTitle}>Reminders</Text>
              {times.map((t, i) => (
                <View key={i} style={st.timeRow}>
                  <TimeButton value={t} onChange={(v) => setTimes((ts) => ts.map((x, j) => (j === i ? v : x)))} />
                  {times.length > 1 ? (
                    <Pressable onPress={() => setTimes((ts) => ts.filter((_, j) => j !== i))} hitSlop={10} accessibilityLabel="Remove this time">
                      <Ionicons name="close-circle" size={26} color={c.faint} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
              <Button title="Add a time" kind="secondary" small onPress={() => setTimes((ts) => [...ts, ts[ts.length - 1] ?? '12:00'])} icon={<Ionicons name="add" size={16} color={c.primary} />} style={{ alignSelf: 'flex-start', marginBottom: 14 }} />
              <Field label="Days" style={{ marginBottom: endDate ? 14 : 0 }}>
                <View style={st.wrap}>
                  <Chip label="Every day" selected={!days} onPress={() => setDays(null)} />
                  <Chip label="Certain days" selected={!!days} onPress={() => setDays(days ?? [new Date().getDay()])} />
                </View>
                {days ? (
                  <View style={[st.wrap, { marginTop: 8 }]}>
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                      <Chip key={d} label={weekdayShort(d)} selected={days.includes(d)} onPress={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])} />
                    ))}
                  </View>
                ) : null}
              </Field>
              {endDate ? (
                <View style={st.endRow}>
                  <Text style={[st.hint, { flex: 1 }]}>{endDate < today ? `Ended ${formatDateLong(endDate)}` : `Stops after ${formatDateLong(endDate)}`}</Text>
                  <Button title="Keep going" kind="secondary" small onPress={() => setEndDate(null)} />
                </View>
              ) : null}
            </Card>

            <Card>
              <Field label="Colour">
                <View style={st.wrap}>
                  {MED_COLORS.map((col) => (
                    <PressableScale key={col} onPress={() => setColor(col)} haptic style={[st.swatch, { backgroundColor: col }, color === col && st.swatchOn]} accessibilityLabel={`Colour ${col}`}>
                      {color === col ? <Ionicons name="checkmark" size={18} color="#fff" /> : null}
                    </PressableScale>
                  ))}
                </View>
              </Field>
              <Field label="Notes" style={{ marginBottom: 0 }}>
                <Input value={notes} onChangeText={setNotes} placeholder={type === 'bp' ? 'e.g. target under 130/80' : 'e.g. target 80 to 130 fasting'} multiline style={{ minHeight: 60, textAlignVertical: 'top' }} />
              </Field>
            </Card>

            <Button title="Save" onPress={save} />
            {existing ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
                <Button title={existing.archived ? 'Unarchive' : 'Archive'} kind="secondary" onPress={archive} style={{ flexGrow: 1 }} />
                <Button title="Delete" kind="danger" onPress={remove} style={{ flexGrow: 1 }} />
              </View>
            ) : firstOfType ? (
              <Button title="Back to the plans" kind="ghost" onPress={() => setCustom(false)} />
            ) : null}
          </>
        )}
      </PageScroll>
    </KeyboardAvoidingView>
  );
}

function ReadingsCard({ type, readings, unit }: { type: CheckType; readings: ReturnType<typeof repo.getReadings>; unit: 'mgdl' | 'mmol' }) {
  const st = useStyles();
  const sugar = type === 'sugar' ? sugarStats(readings) : null;
  const bp = type === 'bp' ? bpStats(readings) : null;
  return (
    <Card>
      <Text style={st.cardTitle}>Last 30 days</Text>
      <View style={st.stats}>
        <Stat label="Readings" value={String(readings.length)} />
        {sugar?.average != null ? <Stat label="Average" value={formatSugar(sugar.average, unit)} /> : null}
        {sugar && sugar.count > 0 ? <Stat label="In range" value={`${sugar.inRange} of ${sugar.count}`} /> : null}
        {bp?.systolic != null ? <Stat label="Average" value={`${bp.systolic}/${bp.diastolic}`} /> : null}
      </View>
      <Button title="See all readings" kind="ghost" small onPress={() => router.push({ pathname: '/readings', params: { type } })} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const st = useStyles();
  return (
    <View style={st.stat}>
      <Text style={st.statValue}>{value}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { padding: 16, paddingBottom: 60 },
  section: { fontSize: 18, fontWeight: '900', color: c.text, marginTop: 6, marginBottom: 4, marginHorizontal: 6 },
  cardTitle: { fontSize: 18, fontWeight: '900', color: c.text, marginBottom: 14 },
  planTitle: { fontSize: 17, fontWeight: '800', color: c.text, marginBottom: 2 },
  hint: { fontSize: 13, color: c.muted, fontWeight: '600', lineHeight: 18 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  endRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { backgroundColor: c.sunken, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, minWidth: 120, flexGrow: 1 },
  statValue: { fontSize: 18, fontWeight: '900', color: c.text },
  statLabel: { fontSize: 12, fontWeight: '700', color: c.muted, marginTop: 2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  swatch: { width: 38, height: 38, borderRadius: 19, marginRight: 10, marginBottom: 8, alignItems: 'center', justifyContent: 'center' },
  swatchOn: { borderWidth: 3, borderColor: c.card, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, elevation: 3 },
}));
