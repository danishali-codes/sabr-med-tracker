import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { atTime, dateFromKey, formatDateLong, formatTime, timeFromDate, toDateKey, type DateKey, type TimeOfDay } from '../domain/dates';
import { makeStyles, useTheme } from '../theme';
import { PressableScale, Text } from './ui';

export function TimeButton({ value, onChange }: { value: TimeOfDay; onChange: (t: TimeOfDay) => void }) {
  const c = useTheme();
  const st = useStyles();
  const [open, setOpen] = useState(false);
  const date = atTime(toDateKey(new Date()), value);
  const press = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: date,
        mode: 'time',
        is24Hour: false,
        onChange: (e, d) => e.type === 'set' && d && onChange(timeFromDate(d)),
      });
    } else setOpen(!open);
  };
  return (
    <View>
      <PressableScale onPress={press} style={st.pickerBtn}>
        <Ionicons name="time-outline" size={18} color={c.primary} />
        <Text style={st.pickerText}>{formatTime(value)}</Text>
      </PressableScale>
      {open && Platform.OS !== 'android' ? (
        <DateTimePicker value={date} mode="time" display="spinner" onChange={(_, d) => d && onChange(timeFromDate(d))} />
      ) : null}
    </View>
  );
}

export function DateButton({ value, onChange }: { value: DateKey; onChange: (d: DateKey) => void }) {
  const c = useTheme();
  const st = useStyles();
  const [open, setOpen] = useState(false);
  const date = dateFromKey(value);
  const press = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: date,
        mode: 'date',
        onChange: (e, d) => e.type === 'set' && d && onChange(toDateKey(d)),
      });
    } else setOpen(!open);
  };
  return (
    <View>
      <PressableScale onPress={press} style={st.pickerBtn}>
        <Ionicons name="calendar-outline" size={18} color={c.primary} />
        <Text style={st.pickerText}>{formatDateLong(value)}</Text>
      </PressableScale>
      {open && Platform.OS !== 'android' ? (
        <DateTimePicker value={date} mode="date" display="inline" onChange={(_, d) => d && onChange(toDateKey(d))} />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: c.primarySoft,
    alignSelf: 'flex-start',
  },
  pickerText: { fontSize: 16, fontWeight: '800', color: c.primary },
}));

/** Opens the time picker on its own (Android), resolving with the picked time or null when cancelled. */
export function pickTime(initial: TimeOfDay): Promise<TimeOfDay | null> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'android') return resolve(null);
    DateTimePickerAndroid.open({
      value: atTime(toDateKey(new Date()), initial),
      mode: 'time',
      is24Hour: false,
      onChange: (e, d) => resolve(e.type === 'set' && d ? timeFromDate(d) : null),
    });
  });
}
