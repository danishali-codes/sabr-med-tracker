import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { View } from 'react-native';
import { popup } from '../components/Popup';
import { PageScroll } from '../components/Screen';
import { MedIcon } from '../components/MedIcon';
import { TimeButton } from '../components/Pickers';
import { useRowStyles } from '../components/ToggleRow';
import { Button, Card, Chip, Field, Input, PressableScale, SectionTitle, Text } from '../components/ui';
import { formatTime, weekdayShort } from '../domain/dates';
import { describeDose } from '../domain/dose';
import { canBeInSet, describeDays, setMembers } from '../domain/sets';
import type { DoseSet } from '../domain/types';
import * as repo from '../db/repo';
import { useMeds, useSettings } from '../hooks/useData';
import { rescheduleAll } from '../notifications/reminders';
import { useTheme } from '../theme';

const SUGGESTED = ['Morning', 'Work days', 'Weekend morning', 'Lunch', 'Evening', 'Bedtime'];
// Monday first, as on Today.
const WEEK = [1, 2, 3, 4, 5, 6, 0];

/**
 * Schedules: medicines you take together at one time on some days, e.g. "Work days" at 7:00
 * on Monday to Thursday. On those days each medicine's nearest dose moves to the schedule's
 * time (reminders too), and Today shows them in one card with Take all.
 */
export default function SetsScreen() {
  const c = useTheme();
  const st = useRowStyles();
  const settings = useSettings();
  const meds = useMeds();
  const eligible = meds.filter(canBeInSet);
  const [editing, setEditing] = useState<DoseSet | null>(null);
  const isNew = editing != null && !settings.doseSets.some((s) => s.id === editing.id);

  const startNew = () => setEditing({ id: repo.newId(), name: '', time: '07:00', days: [], medIds: [] });

  const save = () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return popup('Name it', 'Give the schedule a name, like Work days.');
    const medIds = editing.medIds.filter((id) => eligible.some((m) => m.id === id));
    if (medIds.length === 0) return popup('Pick the medicines', 'Tick the medicines you take together at this time.');
    const set: DoseSet = { ...editing, name, medIds, days: editing.days.length === 7 ? [] : [...editing.days].sort() };
    const doseSets = [...settings.doseSets.filter((s) => s.id !== set.id), set].sort((a, b) => a.time.localeCompare(b.time));
    repo.saveSettings({ ...repo.getSettings(), doseSets });
    setEditing(null);
    rescheduleAll().catch(() => {});
  };

  const remove = (set: DoseSet) =>
    popup(`Remove ${set.name}?`, 'Your medicines go back to their own times.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          repo.saveSettings({ ...repo.getSettings(), doseSets: settings.doseSets.filter((s) => s.id !== set.id) });
          setEditing(null);
          rescheduleAll().catch(() => {});
        },
      },
    ]);

  if (editing) {
    const toggleDay = (d: number) =>
      setEditing({ ...editing, days: editing.days.includes(d) ? editing.days.filter((x) => x !== d) : [...editing.days, d] });
    return (
      <PageScroll contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Field label="Name">
            <Input value={editing.name} onChangeText={(name) => setEditing({ ...editing, name })} placeholder="e.g. Work days" />
          </Field>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {SUGGESTED.filter((n) => !settings.doseSets.some((s) => s.name === n && s.id !== editing.id)).map((n) => (
              <PressableScale key={n} onPress={() => setEditing({ ...editing, name: n })} style={{ backgroundColor: c.sunken, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ color: c.text, fontWeight: '700', fontSize: 13 }}>{n}</Text>
              </PressableScale>
            ))}
          </View>
          <Field label="Time">
            <TimeButton value={editing.time} onChange={(time) => setEditing({ ...editing, time })} />
          </Field>
          <Field label="Days" hint={editing.days.length === 0 ? 'None picked: every day.' : describeDays(editing.days)} style={{ marginBottom: 0 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {WEEK.map((d) => (
                <Chip key={d} label={weekdayShort(d)} selected={editing.days.includes(d)} onPress={() => toggleDay(d)} />
              ))}
            </View>
          </Field>
        </Card>
        <SectionTitle>Medicines</SectionTitle>
        <Card style={{ paddingVertical: 6 }}>
          {eligible.length === 0 ? <Text style={[st.hint, { paddingVertical: 12 }]}>Add a medicine with a schedule first.</Text> : null}
          {eligible.map((m) => {
            const on = editing.medIds.includes(m.id);
            return (
              <PressableScale
                key={m.id}
                onPress={() => setEditing({ ...editing, medIds: on ? editing.medIds.filter((x) => x !== m.id) : [...editing.medIds, m.id] })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
              >
                <MedIcon med={m} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={st.label}>{m.name}</Text>
                  <Text style={st.hint}>
                    {describeDose(m)} · {m.schedule.times.map(formatTime).join(', ')}
                  </Text>
                </View>
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? c.primary : c.faint} />
              </PressableScale>
            );
          })}
        </Card>
        <Text style={[st.hint, { marginTop: 10, marginHorizontal: 4 }]}>
          On {editing.days.length === 0 ? 'every day' : describeDays(editing.days)}, Today puts the ticked medicines together under {editing.name.trim() || 'this schedule'} at{' '}
          {formatTime(editing.time)}, with one Take all button. Each medicine's nearest dose moves to {formatTime(editing.time)}, and so does its reminder.
          Other days keep the medicine's own times.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
          <Button title="Cancel" kind="secondary" onPress={() => setEditing(null)} style={{ flexGrow: 1 }} />
          <Button title="Save" onPress={save} style={{ flexGrow: 1 }} />
        </View>
        {!isNew ? <Button title="Remove schedule" kind="ghost" onPress={() => remove(editing)} style={{ marginTop: 8 }} /> : null}
      </PageScroll>
    );
  }

  return (
    <PageScroll contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={st.hint}>
        A schedule is a group of medicines you take together, like everything at 7:00 on work days. On those days their doses move to the schedule's time,
        reminders included, and Today shows them in one card so one tap marks them all taken. Other days keep each medicine's own times.
      </Text>
      {settings.doseSets.map((set) => {
        const members = setMembers(set, meds);
        return (
          <PressableScale key={set.id} onPress={() => setEditing(set)} style={st.linkCard}>
            <View style={{ width: 64, alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: c.primary }}>{formatTime(set.time)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.label}>{set.name}</Text>
              <Text style={st.hint}>{describeDays(set.days)}</Text>
              <Text style={st.hint} numberOfLines={2}>
                {members.length ? members.map((m) => m.name).join(', ') : 'No medicines'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={c.faint} />
          </PressableScale>
        );
      })}
      <Button title="New schedule" onPress={startNew} style={{ marginTop: 16 }} />
    </PageScroll>
  );
}
