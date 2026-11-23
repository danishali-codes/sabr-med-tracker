import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { popup } from '../../components/Popup';
import { PageScroll } from '../../components/Screen';
import { Button, Card, Chip, Field, Input, Text } from '../../components/ui';
import { formatDateLong, timeFromDate, toDateKey, type TimeOfDay } from '../../domain/dates';
import { hoursBetween, machineKind, parseAhi, parseHours } from '../../domain/machines';
import { dosesOn } from '../../domain/schedule';
import { TimeButton } from '../../components/Pickers';
import type { MachineNight } from '../../domain/types';
import * as repo from '../../db/repo';
import { makeStyles } from '../../theme';

const MASK: { value: NonNullable<MachineNight['mask']>; label: string }[] = [
  { value: 'good', label: 'Good seal' },
  { value: 'some', label: 'Some leaks' },
  { value: 'leaky', label: 'Leaky' },
];

/** How a night (or session) on a machine went. Everything is optional and stays on the phone. */
export default function NightScreen() {
  const st = useStyles();
  const params = useLocalSearchParams<{ id: string; date?: string }>();
  const date = params.date ?? toDateKey(new Date());
  const med = useMemo(() => repo.getMed(params.id), [params.id]);
  const saved = useMemo(() => repo.getNight(params.id, date), [params.id, date]);
  const [hours, setHours] = useState(saved?.hours != null ? String(saved.hours) : '');
  const [ahi, setAhi] = useState(saved?.ahi != null ? String(saved.ahi) : '');
  const [mask, setMask] = useState<MachineNight['mask']>(saved?.mask ?? null);
  const [note, setNote] = useState(saved?.note ?? '');
  const nightly = machineKind(med?.machine?.type).nightly;
  // Mask on defaults to when you checked in.
  const checkin = useMemo(() => {
    if (!med) return null;
    const log = dosesOn([med], date).map((d) => repo.getLog(d.slot)).find((l) => l?.status === 'taken');
    return log ? timeFromDate(new Date(log.at)) : null;
  }, [med, date]);
  const [start, setStart] = useState<TimeOfDay | null>(saved?.start ?? checkin);
  const [end, setEnd] = useState<TimeOfDay | null>(saved?.end ?? null);
  const worked = start && end ? hoursBetween(start, end) : null;

  const save = () => {
    const h = parseHours(hours);
    const a = parseAhi(ahi);
    if (hours.trim() && h == null) return popup('Check the hours', 'Use a number like 6.5, or a time like 6:30.');
    if (ahi.trim() && a == null) return popup('Check the AHI', 'Use the number from the machine, like 2.4.');
    if (worked != null && worked > 16) return popup('Check the times', `That's ${worked} hours. Check mask on and mask off.`);
    repo.saveNight({ medId: params.id, date, start, end, hours: h, ahi: nightly ? a : null, mask: nightly ? mask : null, note: note.trim() || undefined });
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: nightly ? 'How was the night?' : 'How did it go?' }} />
      <PageScroll contentContainerStyle={st.container} keyboardShouldPersistTaps="handled">
        <Text style={st.sub}>
          {med?.name ?? 'Machine'} · {nightly ? `Night of ${formatDateLong(date)}` : formatDateLong(date)}
        </Text>
        <Card>
          <View style={st.row}>
            <Field label={nightly ? 'Mask on' : 'Started'} style={{ flexGrow: 1 }}>
              <OptionalTime value={start} onChange={setStart} />
            </Field>
            <Field label={nightly ? 'Mask off' : 'Finished'} style={{ flexGrow: 1 }}>
              <OptionalTime value={end} onChange={setEnd} />
            </Field>
          </View>
          <Field
            label="Hours used"
            hint={
              worked != null && !hours.trim()
                ? `${worked} hours from the times above. Type a number to use the machine's own count instead.`
                : nightly
                  ? 'From the machine screen, or leave it empty and set mask on and off. 4 hours or more counts as a full night for most doctors.'
                  : undefined
            }
          >
            <Input value={hours} onChangeText={setHours} placeholder={worked != null ? String(worked) : 'e.g. 6.5'} keyboardType="numbers-and-punctuation" />
          </Field>
          {nightly ? (
            <>
              <Field label="AHI" hint="Events per hour, if your machine shows it.">
                <Input value={ahi} onChangeText={setAhi} placeholder="e.g. 2.4" keyboardType="decimal-pad" />
              </Field>
              <Field label="Mask fit">
                <View style={st.wrap}>
                  {MASK.map((m) => (
                    <Chip key={m.value} label={m.label} selected={mask === m.value} onPress={() => setMask(mask === m.value ? null : m.value)} />
                  ))}
                </View>
              </Field>
            </>
          ) : null}
          <Field label="Notes" style={{ marginBottom: 0 }}>
            <Input value={note} onChangeText={setNote} placeholder={nightly ? 'e.g. dry mouth, woke up twice' : 'Anything to remember'} multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />
          </Field>
        </Card>
        <Button title="Save" onPress={save} />
        <Text style={st.hint}>Saved on this phone only. It's included in your own backups.</Text>
      </PageScroll>
    </KeyboardAvoidingView>
  );
}

function OptionalTime({ value, onChange }: { value: TimeOfDay | null; onChange: (t: TimeOfDay | null) => void }) {
  if (!value) return <Button title="Add time" kind="secondary" small onPress={() => onChange(timeFromDate(new Date()))} />;
  return (
    <View style={{ gap: 6 }}>
      <TimeButton value={value} onChange={onChange} />
      <Button title="Clear" kind="ghost" small onPress={() => onChange(null)} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
  container: { padding: 16, paddingBottom: 60 },
  sub: { fontSize: 15, fontWeight: '700', color: c.muted, marginBottom: 12, marginLeft: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { fontSize: 13, color: c.muted, fontWeight: '600', marginTop: 12, textAlign: 'center' },
}));
