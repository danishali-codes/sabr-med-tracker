import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Animated, Image, Pressable, View } from 'react-native';
import { deleteReading, logDose, snoozeDoses } from '../actions';
import { formatReading, readingLevelLabel, readingTone } from '../domain/checks';
import * as repo from '../db/repo';
import { useSettings } from '../hooks/useData';
import { formatTime, timeFromDate, toDateKey } from '../domain/dates';
import { describeDose } from '../domain/dose';
import { foodLabel } from '../domain/routines';
import { punctuality } from '../domain/schedule';
import type { DoseLog, Medication, ScheduledDose } from '../domain/types';
import { makeStyles, useTheme } from '../theme';
import { MedIcon } from './MedIcon';
import { ActionSheet, Text, type SheetAction } from './ui';
import { askTakenTime } from './takenTime';

export function DoseRow({
  dose,
  med,
  log,
  windowMinutes,
  showTime,
}: {
  dose: ScheduledDose;
  med: Medication;
  log?: DoseLog;
  windowMinutes: number;
  showTime?: boolean;
}) {
  const c = useTheme();
  const s = useStyles();
  const pop = useRef(new Animated.Value(1)).current;
  const taken = log?.status === 'taken';
  const skipped = log?.status === 'skipped';
  // "I didn't take it": an honest miss, unlike Skip, which is on purpose and neutral.
  const missed = log?.status === 'missed';

  const prev = useRef(taken);
  useEffect(() => {
    if (taken && !prev.current) {
      pop.setValue(0.6);
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 18 }).start();
    }
    prev.current = taken;
  }, [taken, pop]);

  const [sheet, setSheet] = useState(false);
  const options = () => setSheet(true);
  const isToday = dose.date === toDateKey(new Date());
  // A machine (CPAP...) is checked in, not taken, and is never early or late.
  const machine = !!med.machine;
  // A check (blood sugar, blood pressure) is answered with a reading.
  const check = !!med.check;
  const settings = useSettings();
  // Looked up whatever the status, so a reading is never hidden and logged twice.
  const reading = check && log ? repo.getReadingForSlot(dose.slot, dose.date) : null;
  const openReading = () =>
    router.push({ pathname: '/check/log', params: { id: med.id, slot: dose.slot, date: dose.date, time: dose.time, ...(reading ? { reading: reading.id } : {}) } });
  // "Not today" on a check that has a reading removes the reading, so it isn't counted for a skipped check.
  const skip = async () => {
    if (reading) await deleteReading(reading);
    await logDose(dose, 'skipped');
  };
  const undo = () => (reading ? deleteReading(reading) : logDose(dose, null));
  const actions: SheetAction[] = [
    ...(check ? [{ label: reading ? 'Change the reading' : 'Log the reading', icon: 'create-outline' as const, onPress: openReading }] : []),
    ...(!taken && !check ? [{ label: machine ? 'Used it' : 'Taken', icon: 'checkmark-circle-outline' as const, onPress: () => logDose(dose, 'taken') }] : []),
    ...(!taken && !check
      ? [{ label: machine ? 'Used it earlier, pick the time' : 'Taken earlier, pick the time', icon: 'time-outline' as const, onPress: () => askTakenTime([dose]) }]
      : []),
    ...(taken && !check
      ? [{ label: machine ? 'Change the time used' : 'Change the time taken', icon: 'time-outline' as const, onPress: () => askTakenTime([dose], new Date(log!.at)) }]
      : []),
    ...(!log && isToday
      ? [10, 30, 60].map((m) => ({
          label: m === 60 ? 'Remind me in 1 hour' : `Remind me in ${m} minutes`,
          icon: 'alarm-outline' as const,
          onPress: () => snoozeDoses(dose.date, dose.time, m),
        }))
      : []),
    ...(machine && taken
      ? [{ label: 'Add hours and notes', icon: 'create-outline' as const, onPress: () => router.push({ pathname: '/machine/night', params: { id: med.id, date: dose.date } }) }]
      : []),
    ...(!skipped ? [{ label: check ? 'Not today' : machine ? "Didn't use it" : 'Skip this dose', icon: 'remove-circle-outline' as const, onPress: skip }] : []),
    ...(!missed && !check && !machine
      ? [{ label: "I didn't take it", icon: 'close-circle-outline' as const, onPress: () => logDose(dose, 'missed') }]
      : []),
    ...(log ? [{ label: 'Undo', icon: 'arrow-undo-outline' as const, onPress: undo, destructive: true }] : []),
  ];

  const toggle = () => {
    if (log) return options();
    if (check) return openReading();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    logDose(dose, 'taken');
  };

  let status: { text: string; color: string } | null = null;
  if (taken && check) {
    const tone = reading ? readingTone(reading) : 'good';
    status = reading
      ? { text: `${formatReading(reading, settings.sugarUnit)} · ${readingLevelLabel(reading)}`, color: tone === 'good' ? c.good : tone === 'warn' ? c.warn : c.bad }
      : { text: `Done at ${formatTime(timeFromDate(new Date(log!.at)))}`, color: c.good };
  } else if (skipped && check) {
    status = { text: 'Not checked', color: c.muted };
  } else if (taken && machine) {
    status = { text: `Used at ${formatTime(timeFromDate(new Date(log!.at)))}`, color: c.good };
  } else if (skipped && machine) {
    status = { text: 'Not used', color: c.muted };
  } else if (taken) {
    const p = punctuality(dose, new Date(log!.at), windowMinutes);
    const word = p === 'late' ? 'Late' : p === 'early' ? 'Early' : 'Taken';
    status = { text: `${word} at ${formatTime(timeFromDate(new Date(log!.at)))}`, color: p === 'onTime' ? c.good : c.warn };
  } else if (skipped) {
    status = { text: 'Skipped', color: c.muted };
  } else if (missed) {
    status = { text: 'Missed', color: c.bad };
  }

  return (
    <Pressable onPress={options} onLongPress={options} style={[s.row, log && { opacity: skipped ? 0.55 : missed ? 0.8 : 0.92 }]} delayLongPress={300}>
      {med.photo ? <Image source={{ uri: med.photo }} style={s.photo} accessibilityLabel={`Photo of ${med.name}`} /> : <MedIcon med={med} />}
      <View style={{ flex: 1 }}>
        <Text style={[s.name, taken && s.nameDone]} numberOfLines={1}>
          {med.name}
        </Text>
        <Text style={s.sub} numberOfLines={1}>
          {[showTime ? formatTime(dose.time) : null, describeDose(med), foodLabel(med.food, med.foodWaitMinutes)].filter(Boolean).join(' · ')}
        </Text>
        {dose.usualTime ? <Text style={s.moved}>Moved from {formatTime(dose.usualTime)}</Text> : null}
        {status ? <Text style={[s.status, { color: status.color }]}>{status.text}</Text> : null}
      </View>
      <Pressable onPress={toggle} hitSlop={10} accessibilityRole="button" accessibilityLabel={log ? `${status?.text}. Change` : check ? `Log ${med.name}` : machine ? `Check in ${med.name}` : `Take ${med.name}`}>
        <Animated.View
          style={[
            s.check,
            taken
              ? { backgroundColor: c.good, borderColor: c.good }
              : skipped
                ? { backgroundColor: c.sunken, borderColor: c.sunken }
                : missed
                  ? { backgroundColor: c.sunken, borderColor: c.bad }
                  : { borderColor: med.color },
            { transform: [{ scale: pop }] },
          ]}
        >
          {taken ? (
            <Ionicons name="checkmark" size={24} color="#fff" />
          ) : skipped ? (
            <Ionicons name="remove" size={22} color={c.muted} />
          ) : missed ? (
            <Ionicons name="close" size={22} color={c.bad} />
          ) : null}
        </Animated.View>
      </Pressable>
      <ActionSheet
        visible={sheet}
        title={med.name}
        subtitle={`${formatTime(dose.time)} · ${describeDose(med)}`}
        header={med.photo ? <Image source={{ uri: med.photo }} style={s.photoBig} /> : null}
        actions={actions}
        onClose={() => setSheet(false)}
      />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  photo: { width: 48, height: 48, borderRadius: 16, backgroundColor: c.sunken },
  photoBig: { width: '100%', height: 220, borderRadius: 22, marginBottom: 14, backgroundColor: c.sunken },
  moved: { fontSize: 12, fontWeight: '700', color: c.primary, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 14 },
  icon: { width: 50, height: 50, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 17, fontWeight: '800', color: c.text },
  nameDone: { color: c.muted },
  sub: { fontSize: 14, color: c.muted, marginTop: 1, fontWeight: '600' },
  status: { fontSize: 13, fontWeight: '700', marginTop: 3 },
  check: { width: 42, height: 42, borderRadius: 21, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
}));
