import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { deleteReading, saveReading } from '../../actions';
import { popup } from '../../components/Popup';
import { TimeButton } from '../../components/Pickers';
import { PageScroll } from '../../components/Screen';
import { Button, Card, Chip, Field, Input, Text } from '../../components/ui';
import {
  adviceFor,
  fromMgdl,
  parseBp,
  parseSugar,
  readingLevelLabel,
  readingTone,
  SUGAR_TIMINGS,
  unitLabel,
} from '../../domain/checks';
import { atTime, formatDateLong, formatTime, timeFromDate, toDateKey, type TimeOfDay } from '../../domain/dates';
import type { CheckType, Reading, SugarTiming } from '../../domain/types';
import * as repo from '../../db/repo';
import { useSettings } from '../../hooks/useData';
import { makeStyles, useTheme } from '../../theme';

/**
 * Log a blood sugar or blood pressure reading: from a check's reminder (id + slot), from the
 * Readings page (type), or to change one (reading). Stays on the phone.
 */
export default function LogReadingScreen() {
  const c = useTheme();
  const st = useStyles();
  const settings = useSettings();
  const unit = settings.sugarUnit;
  const p = useLocalSearchParams<{ id?: string; slot?: string; date?: string; time?: string; reading?: string; type?: CheckType }>();
  const saved = useMemo(() => (p.reading ? repo.getReading(p.reading) : null), [p.reading]);
  const med = useMemo(() => (p.id ? repo.getMed(p.id) : saved?.medId ? repo.getMed(saved.medId) : null), [p.id, saved]);
  const type: CheckType = saved?.type ?? med?.check?.type ?? (p.type === 'bp' ? 'bp' : 'sugar');
  const now = new Date();
  const date = saved?.date ?? (p.date || toDateKey(now));
  // A reading for an earlier day keeps that day's check time; today's is "now".
  const [time, setTime] = useState<TimeOfDay>(saved ? timeFromDate(new Date(saved.at)) : date === toDateKey(now) ? timeFromDate(now) : (p.time ?? timeFromDate(now)));
  const [sugar, setSugar] = useState(saved?.sugar != null ? String(fromMgdl(saved.sugar, unit)) : '');
  const [timing, setTiming] = useState<SugarTiming>(saved?.timing ?? med?.check?.timing ?? 'random');
  const [sys, setSys] = useState(saved?.systolic != null ? String(saved.systolic) : '');
  const [dia, setDia] = useState(saved?.diastolic != null ? String(saved.diastolic) : '');
  const [pulse, setPulse] = useState(saved?.pulse != null ? String(saved.pulse) : '');
  const [note, setNote] = useState(saved?.note ?? '');

  // What it would be saved as, for the live label under the numbers.
  const draft: Pick<Reading, 'type' | 'sugar' | 'timing' | 'systolic' | 'diastolic'> | null = useMemo(() => {
    if (type === 'sugar') {
      const v = parseSugar(sugar, unit);
      return v == null ? null : { type, sugar: v, timing };
    }
    const bp = parseBp(sys, dia, pulse);
    return bp ? { type, systolic: bp.systolic, diastolic: bp.diastolic } : null;
  }, [type, sugar, unit, timing, sys, dia, pulse]);
  const tone = draft ? readingTone(draft) : null;
  const toneColor = tone === 'bad' ? c.bad : tone === 'warn' ? c.warn : c.good;

  const save = async () => {
    let fields: Partial<Reading>;
    if (type === 'sugar') {
      const v = parseSugar(sugar, unit);
      if (v == null) return popup('Check the number', unit === 'mmol' ? 'Type the reading from your meter, like 6.4.' : 'Type the reading from your meter, like 112.');
      fields = { sugar: v, timing };
    } else {
      const bp = parseBp(sys, dia, pulse);
      if (!bp) return popup('Check the numbers', 'Type the top number (systolic) and the bottom number (diastolic), like 128 and 82. Pulse is optional.');
      fields = bp;
    }
    const at = atTime(date, time);
    const reading: Reading = {
      id: saved?.id ?? repo.newId(),
      type,
      at: at.toISOString(),
      date,
      medId: saved?.medId ?? med?.id ?? null,
      slot: saved?.slot ?? (p.slot || null),
      ...fields,
      note: note.trim() || undefined,
    };
    const dose = reading.slot && reading.medId ? { slot: reading.slot, medId: reading.medId, date, time: p.time || reading.slot.split('|')[2] || time } : null;
    await saveReading(reading, dose);
    const advice = adviceFor(reading);
    router.back();
    if (advice) popup(advice.title, advice.body);
  };

  const remove = () =>
    popup('Delete this reading?', 'It is removed from your history and averages.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (saved) await deleteReading(saved);
          router.back();
        },
      },
    ]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: type === 'bp' ? 'Blood pressure' : 'Blood sugar' }} />
      <PageScroll contentContainerStyle={st.container} keyboardShouldPersistTaps="handled">
        <Text style={st.sub}>
          {med?.name ? `${med.name} · ` : ''}
          {formatDateLong(date)}
          {p.time ? ` · due ${formatTime(p.time)}` : ''}
        </Text>
        <Card>
          {type === 'sugar' ? (
            <>
              <Field label={`Reading (${unitLabel(unit)})`}>
                <Input value={sugar} onChangeText={setSugar} placeholder={unit === 'mmol' ? 'e.g. 6.4' : 'e.g. 112'} keyboardType="decimal-pad" autoFocus={!saved} style={st.big} />
              </Field>
              <Field label="When">
                <View style={st.wrap}>
                  {SUGAR_TIMINGS.map((t) => (
                    <Chip key={t.value} label={t.short} selected={timing === t.value} onPress={() => setTiming(t.value)} />
                  ))}
                </View>
              </Field>
            </>
          ) : (
            <>
              <View style={st.bpRow}>
                <Field label="Top number" style={{ flex: 1 }}>
                  <Input value={sys} onChangeText={setSys} placeholder="e.g. 128" keyboardType="number-pad" autoFocus={!saved} style={st.big} />
                </Field>
                <Field label="Bottom number" style={{ flex: 1 }}>
                  <Input value={dia} onChangeText={setDia} placeholder="e.g. 82" keyboardType="number-pad" style={st.big} />
                </Field>
              </View>
              <Field label="Pulse (optional)">
                <Input value={pulse} onChangeText={setPulse} placeholder="e.g. 70" keyboardType="number-pad" />
              </Field>
            </>
          )}
          {draft ? <Text style={[st.level, { color: toneColor }]}>{readingLevelLabel(draft)}</Text> : null}
          <Field label="Measured at">
            <TimeButton value={time} onChange={setTime} />
          </Field>
          <Field label="Notes" style={{ marginBottom: 0 }}>
            <Input value={note} onChangeText={setNote} placeholder={type === 'bp' ? 'e.g. left arm, after a walk' : 'e.g. after a big lunch'} multiline style={{ minHeight: 60, textAlignVertical: 'top' }} />
          </Field>
        </Card>
        {type === 'bp' && !saved ? (
          <Text style={st.tip}>
            For a reliable number: sit quietly for 5 minutes with your back supported and feet flat, arm resting at heart level, before medicines, food or
            exercise. Take two readings a minute apart.
          </Text>
        ) : null}
        <Button title="Save" onPress={save} />
        {saved ? <Button title="Delete reading" kind="danger" onPress={remove} style={{ marginTop: 12 }} /> : null}
        <Text style={st.hint}>Saved on this phone only. It is in your own backups, and never shared.</Text>
      </PageScroll>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) => ({
  container: { padding: 16, paddingBottom: 60 },
  sub: { fontSize: 15, fontWeight: '700', color: c.muted, marginBottom: 12, marginLeft: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  bpRow: { flexDirection: 'row', gap: 12 },
  big: { fontSize: 24, fontWeight: '800' },
  level: { fontSize: 15, fontWeight: '800', marginTop: -6, marginBottom: 14 },
  tip: { fontSize: 13, color: c.muted, fontWeight: '600', lineHeight: 19, marginBottom: 14, marginHorizontal: 6 },
  hint: { fontSize: 13, color: c.muted, fontWeight: '600', marginTop: 12, textAlign: 'center' },
}));
