import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { RoundButton, Screen } from '../../components/Screen';
import { Button, Card, FadeIn, PressableScale, SectionTitle, Text } from '../../components/ui';
import { formatDateLong } from '../../domain/dates';
import { daysOfSupply, describeDose, isLowStock, units } from '../../domain/dose';
import { medConsistency, medDays, medStreak } from '../../domain/progress';
import { foodLabel } from '../../domain/routines';
import { describeSchedule, indexLogs, isPausedOn, nextDueDate } from '../../domain/schedule';
import { isCheck, isMachine, isSupplement, type DoseLog } from '../../domain/types';
import { checkIsOn, describeCheck } from '../../domain/checks';
import { machineKind, partDueText, partsDue } from '../../domain/machines';
import type { Medication } from '../../domain/types';
import * as repo from '../../db/repo';
import { useDbVersion, useMeds, useSettings, useToday } from '../../hooks/useData';
import { MedIcon } from '../../components/MedIcon';
import { WeekSquares } from '../../components/WeekSquares';
import { makeStyles, useTheme } from '../../theme';

export default function MedsScreen() {
  const c = useTheme();
  const s = useStyles();
  const meds = useMeds();
  const today = useToday();
  const version = useDbVersion();
  const [showArchived, setShowArchived] = useState(false);
  const logs = useMemo(() => indexLogs(repo.getLogs()), [version]);
  const settings = useSettings();
  const active = meds.filter((m) => !m.archived);
  const activeMeds = active.filter((m) => !isSupplement(m) && !isMachine(m) && !isCheck(m));
  const supplements = active.filter((m) => isSupplement(m) && !isMachine(m) && !isCheck(m));
  const machines = active.filter(isMachine);
  // Blood sugar and blood pressure checks, while their feature is on.
  const checks = active.filter((m) => isCheck(m) && checkIsOn(m, settings.features));
  const checksOn = settings.features.sugarChecks || settings.features.bpChecks;
  const addCheckType = settings.features.sugarChecks ? 'sugar' : 'bp';
  const archived = meds.filter((m) => m.archived);

  return (
    <Screen title="Medicine" subtitle={`${active.length} active`} right={<RoundButton icon="add" label="Add medication" onPress={() => router.push('/med/new')} />}>
      {activeMeds.length + supplements.length >= 2 ? (
        <FadeIn>
          <PressableScale onPress={() => router.push('/interactions')} style={[s.check, { backgroundColor: c.primarySoft }]}>
            <View style={[s.checkIcon, { backgroundColor: c.primary }]}>
              <Ionicons name="shield-checkmark" size={20} color={c.onPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.checkTitle, { color: c.primary }]}>Check interactions</Text>
              <Text style={s.sub}>Your meds together, plus alcohol and food</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={c.primary} />
          </PressableScale>
        </FadeIn>
      ) : null}

      {activeMeds.length + supplements.length >= 2 ? (
        <FadeIn>
          <PressableScale onPress={() => router.push('/sets')} style={[s.check, { backgroundColor: c.card }]}>
            <View style={[s.checkIcon, { backgroundColor: c.primarySoft }]}>
              <Ionicons name="albums-outline" size={20} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.checkTitle, { color: c.text }]}>Schedules</Text>
              <Text style={s.sub}>
                {settings.doseSets.length
                  ? settings.doseSets.map((x) => x.name).join(', ')
                  : 'Medicines you take together, marked with one tap'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={c.faint} />
          </PressableScale>
        </FadeIn>
      ) : null}

      {active.length === 0 ? (
        <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
          <Ionicons name="file-tray-outline" size={40} color={c.muted} />
          <Text style={s.emptyTitle}>No medications yet</Text>
          <Button title="Add medication" onPress={() => router.push('/med/new')} style={{ marginTop: 16 }} />
        </Card>
      ) : null}
      {activeMeds.map((m, i) => (
        <FadeIn key={m.id} delay={i * 40}>
          <MedCard med={m} today={today} streak={medStreak(m, logs, today)} logs={logs} />
        </FadeIn>
      ))}
      {active.length > 0 && (settings.features.supplements || supplements.length > 0) ? (
        <SectionTitle
          right={
            <Pressable onPress={() => router.push({ pathname: '/med/[id]', params: { id: 'new', supplement: '1' } })} hitSlop={10}>
              <Text style={{ color: c.primary, fontWeight: '800' }}>Add</Text>
            </Pressable>
          }
        >
          Supplements
        </SectionTitle>
      ) : null}
      {active.length > 0 && supplements.length === 0 && settings.features.supplements ? (
        <Text style={[s.sub, { marginLeft: 6, marginBottom: 14 }]}>Vitamins and the like: reminders and their own ring, without counting towards your streak.</Text>
      ) : null}
      {supplements.map((m, i) => (
        <FadeIn key={m.id} delay={(activeMeds.length + i) * 40}>
          <MedCard med={m} today={today} streak={medStreak(m, logs, today)} logs={logs} />
        </FadeIn>
      ))}
      {/* With machines on it is always shown, so someone who only uses a CPAP can add it without adding a medicine first. */}
      {settings.features.machines || machines.length > 0 ? (
      <>
      <SectionTitle
        right={
          <Pressable onPress={() => router.push({ pathname: '/machine/[id]', params: { id: 'new' } })} hitSlop={10}>
            <Text style={{ color: c.primary, fontWeight: '800' }}>Add</Text>
          </Pressable>
        }
      >
        Machines
      </SectionTitle>
      {machines.length === 0 ? (
        <Text style={[s.sub, { marginLeft: 6, marginBottom: 14 }]}>A CPAP, nebulizer or oxygen machine: check in when you use it, and get reminded when parts are due.</Text>
      ) : null}
      </>
      ) : null}
      {machines.map((m, i) => (
        <FadeIn key={m.id} delay={(activeMeds.length + supplements.length + i) * 40}>
          <MachineCard med={m} today={today} />
        </FadeIn>
      ))}
      {checksOn || checks.length > 0 ? (
        <>
          <SectionTitle
            right={
              <Pressable onPress={() => router.push({ pathname: '/check/[id]', params: { id: 'new', type: addCheckType } })} hitSlop={10}>
                <Text style={{ color: c.primary, fontWeight: '800' }}>Add</Text>
              </Pressable>
            }
          >
            Checks
          </SectionTitle>
          {checks.length === 0 ? (
            <Text style={[s.sub, { marginLeft: 6, marginBottom: 14 }]}>Blood sugar or blood pressure: a reminder to check, and a place for the readings.</Text>
          ) : null}
        </>
      ) : null}
      {checks.map((m, i) => (
        <FadeIn key={m.id} delay={(activeMeds.length + supplements.length + machines.length + i) * 40}>
          <CheckCard med={m} />
        </FadeIn>
      ))}
      {archived.length > 0 ? (
        <>
          <SectionTitle
            right={
              <Pressable onPress={() => setShowArchived(!showArchived)} hitSlop={10}>
                <Text style={{ color: c.primary, fontWeight: '800' }}>{showArchived ? 'Hide' : 'Show'}</Text>
              </Pressable>
            }
          >
            Archived ({archived.length})
          </SectionTitle>
          {showArchived
            ? archived.map((m) => (isCheck(m) ? <CheckCard key={m.id} med={m} /> : isMachine(m) ? <MachineCard key={m.id} med={m} today={today} /> : <MedCard key={m.id} med={m} today={today} streak={0} logs={logs} />))
            : null}
        </>
      ) : null}
    </Screen>
  );
}

function MedCard({ med, today, streak, logs }: { med: Medication; today: string; streak: number; logs: Map<string, DoseLog> }) {
  const c = useTheme();
  const s = useStyles();
  const paused = isPausedOn(med, today);
  const scheduled = !med.archived && med.schedule.pattern.kind !== 'asNeeded';
  const next = !scheduled || paused ? null : nextDueDate(med.schedule, today);
  const low = isLowStock(med);
  const days = daysOfSupply(med);
  return (
    <PressableScale onPress={() => router.push({ pathname: '/med/[id]', params: { id: med.id } })} scaleTo={0.98}>
      <Card style={med.archived ? { opacity: 0.6 } : undefined}>
        <View style={s.row}>
          <MedIcon med={med} size={54} />
          <View style={{ flex: 1 }}>
            <Text style={s.name} numberOfLines={1}>
              {med.name}
            </Text>
            <Text style={s.dose}>{describeDose(med)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={c.faint} />
        </View>
        <View style={s.meta}>
          <Text style={s.sub}>{describeSchedule(med.schedule)}</Text>
          {next && next !== today ? <Text style={s.sub}>Next: {formatDateLong(next)}</Text> : null}
        </View>
        {scheduled ? <WeekSquares days={medDays(med, logs, today)} color={med.color} today={today} /> : null}
        <View style={s.tags}>
          {paused ? <Text style={[s.tag, { backgroundColor: c.sunken, color: c.muted }]}>Paused</Text> : null}
          {streak > 0 ? <Text style={[s.tag, { backgroundColor: c.warnSoft, color: c.flame }]}>{streak} in a row</Text> : null}
          {scheduled && !paused ? (
            <Text style={[s.tag, { backgroundColor: c.primarySoft, color: c.primary }]}>Consistency {Math.round(medConsistency(med, logs, today) * 100)}</Text>
          ) : null}
          {foodLabel(med.food, med.foodWaitMinutes) ? (
            <Text style={[s.tag, { backgroundColor: c.sunken, color: c.muted }]}>{foodLabel(med.food, med.foodWaitMinutes)}</Text>
          ) : null}
          {med.stock != null ? (
            <Text style={[s.tag, low ? { backgroundColor: c.badSoft, color: c.bad } : { backgroundColor: c.goodSoft, color: c.good }]}>
              {units(med.form, med.stock)} left{days != null ? ` · ~${days}d` : ''}
            </Text>
          ) : null}
        </View>
      </Card>
    </PressableScale>
  );
}

function MachineCard({ med, today }: { med: Medication; today: string }) {
  const c = useTheme();
  const s = useStyles();
  const next = partsDue([{ ...med, archived: false }], today, 100000)[0];
  return (
    <PressableScale onPress={() => router.push({ pathname: '/machine/[id]', params: { id: med.id } })} scaleTo={0.98}>
      <Card style={med.archived ? { opacity: 0.6 } : undefined}>
        <View style={s.row}>
          <MedIcon med={med} size={54} />
          <View style={{ flex: 1 }}>
            <Text style={s.name} numberOfLines={1}>
              {med.name}
            </Text>
            <Text style={s.dose}>{machineKind(med.machine?.type).label}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={c.faint} />
        </View>
        <View style={s.meta}>
          <Text style={s.sub}>{med.schedule.pattern.kind === 'asNeeded' ? 'Logged when used' : describeSchedule(med.schedule)}</Text>
        </View>
        {next && !med.archived ? (
          <View style={s.tags}>
            <Text style={[s.tag, next.daysLeft <= 0 ? { backgroundColor: c.warnSoft, color: c.warn } : { backgroundColor: c.sunken, color: c.muted }]}>
              {next.part.name}: {partDueText(next.part, today).toLowerCase()}
            </Text>
          </View>
        ) : null}
      </Card>
    </PressableScale>
  );
}

function CheckCard({ med }: { med: Medication }) {
  const c = useTheme();
  const s = useStyles();
  return (
    <PressableScale onPress={() => router.push({ pathname: '/check/[id]', params: { id: med.id } })} scaleTo={0.98}>
      <Card style={med.archived ? { opacity: 0.6 } : undefined}>
        <View style={s.row}>
          <MedIcon med={med} size={54} />
          <View style={{ flex: 1 }}>
            <Text style={s.name} numberOfLines={1}>
              {med.name}
            </Text>
            <Text style={s.dose}>{describeCheck(med)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={c.faint} />
        </View>
        <View style={s.meta}>
          <Text style={s.sub}>
            {med.schedule.pattern.kind === 'asNeeded' ? 'No reminder' : describeSchedule(med.schedule)}
            {med.schedule.endDate ? ` · until ${formatDateLong(med.schedule.endDate)}` : ''}
          </Text>
        </View>
      </Card>
    </PressableScale>
  );
}

const useStyles = makeStyles((c) => ({
  emptyTitle: { fontSize: 20, fontWeight: '900', color: c.text, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 19, fontWeight: '900', color: c.text },
  dose: { fontSize: 15, fontWeight: '700', color: c.muted, marginTop: 1 },
  meta: { marginTop: 12, gap: 2 },
  sub: { fontSize: 13, color: c.muted, fontWeight: '600' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tag: { fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: 'hidden' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 24, marginBottom: 14 },
  checkIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  checkTitle: { fontSize: 16, fontWeight: '900' },
}));
