import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { popup } from '../../components/Popup';
import { logAsNeeded, takeDoses } from '../../actions';
import { Confetti } from '../../components/Confetti';
import { DoneList } from '../../components/DoneList';
import { DoseRow } from '../../components/DoseRow';
import { HealthToday } from '../../components/HealthToday';
import { Screen } from '../../components/Screen';
import { Button, Card, FadeIn, PressableScale, Ring, Rings, SectionTitle, Text } from '../../components/ui';
import { addDays, diffDays, formatDateLong, formatTime, parseDateKey, timeFromDate, weekdayOf } from '../../domain/dates';
import { describeDose } from '../../domain/dose';
import { adherence, isGoldDay } from '../../domain/progress';
import { routineAt } from '../../domain/routines';
import { describeDays, setsOn } from '../../domain/sets';
import { askTakenTime } from '../../components/takenTime';
import { isCheck, isMachine, isSupplement } from '../../domain/types';
import { checkIsOn } from '../../domain/checks';
import { ChecksSection } from '../../components/CheckCards';
import { MachinesSection } from '../../components/MachineCards';
import { EarnBackCard, FoodTimerCard, MilestoneCard, ReviewPrompt, TimingCard } from '../../components/TodayCards';
import { dosesOn, dueAt, groupByTime, indexLogs, punctuality } from '../../domain/schedule';
import * as repo from '../../db/repo';
import { useDbVersion, useMeds, useProgress, useSettings } from '../../hooks/useData';
import { getPermissionState, requestExactAlarms, requestNotificationPermission, type PermissionState } from '../../notifications/permissions';
import { rescheduleAll } from '../../notifications/reminders';
import { MedIcon } from '../../components/MedIcon';
import { NoteCard } from '../../components/NoteCard';
import { CareCard } from '../../components/CareCard';
import { useFollowing } from '../../hooks/useFollowing';
import { makeStyles, useTheme } from '../../theme';

export default function TodayScreen() {
  const c = useTheme();
  const s = useStyles();
  const meds = useMeds();
  const settings = useSettings();
  const people = useFollowing();
  const version = useDbVersion();
  const { today, progress, byDate, summaries } = useProgress();
  const summariesCount = summaries.length;
  const [perm, setPerm] = useState<PermissionState | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  // On a narrow phone (or with big text) the rings give up some width so the legend beside them fits.
  const { width: screenWidth, fontScale } = useWindowDimensions();
  const ringSize = Math.max(112, Math.min(148, Math.round((screenWidth - 76) * (fontScale > 1.15 ? 0.42 : 0.5))));

  const refreshPerm = useCallback(() => {
    getPermissionState().then(setPerm).catch(() => {});
  }, []);
  useEffect(refreshPerm, [refreshPerm, today]);

  const medById = useMemo(() => new Map(meds.map((m) => [m.id, m])), [meds]);
  // Medicines fill the rings and the streak; supplements have a ring and a list of their own.
  const allDoses = useMemo(() => dosesOn(meds, today), [meds, today]);
  const doses = useMemo(
    () => allDoses.filter((d) => !isSupplement(medById.get(d.medId)) && !isMachine(medById.get(d.medId)) && !isCheck(medById.get(d.medId))),
    [allDoses, medById],
  );
  const suppDoses = useMemo(() => allDoses.filter((d) => isSupplement(medById.get(d.medId))), [allDoses, medById]);
  // Machines (CPAP...) have their own section too.
  const machines = useMemo(() => meds.filter((m) => !m.archived && isMachine(m)), [meds]);
  const machineDoses = useMemo(() => allDoses.filter((d) => isMachine(medById.get(d.medId))), [allDoses, medById]);
  // Blood sugar and blood pressure checks too, while their feature is on.
  const checks = useMemo(() => meds.filter((m) => !m.archived && isCheck(m) && checkIsOn(m, settings.features)), [meds, settings.features]);
  const checkDoses = useMemo(() => allDoses.filter((d) => checks.some((m) => m.id === d.medId)), [allDoses, checks]);
  const todayLogs = useMemo(() => repo.getLogs(today, today), [today, version]);
  const logs = useMemo(() => indexLogs(todayLogs), [todayLogs]);
  // Saved sets for today (e.g. "Work days" at 7:00) gather their medicines into one card.
  const sets = useMemo(() => setsOn(settings.doseSets, [...doses, ...suppDoses], today), [settings.doseSets, doses, suppDoses, today]);
  const inSet = new Set(sets.flatMap((x) => x.doses.map((d) => d.slot)));
  const openSets = sets.map((x) => ({ ...x, open: x.doses.filter((d) => !logs.has(d.slot)) })).filter((x) => x.open.length > 0);
  // Doses still to take stay up top, grouped by time; taken and skipped ones fold into "Done today".
  const groups = groupByTime(doses.filter((d) => !logs.has(d.slot) && !inSet.has(d.slot)));
  const suppOpen = suppDoses.filter((d) => !logs.has(d.slot) && !inSet.has(d.slot));
  const doneDoses = allDoses.filter((d) => logs.has(d.slot) && !isMachine(medById.get(d.medId)) && !isCheck(medById.get(d.medId))).sort((a, b) => a.time.localeCompare(b.time));
  const suppDone = suppDoses.filter((d) => logs.has(d.slot)).length;
  const machineDone = machineDoses.filter((d) => logs.has(d.slot)).length;
  const checkDone = checkDoses.filter((d) => logs.has(d.slot)).length;
  const asNeeded = meds.filter((m) => !m.archived && !isMachine(m) && !isCheck(m) && m.schedule.pattern.kind === 'asNeeded');
  const answered = doses.filter((d) => logs.has(d.slot)).length;
  const taken = doses.filter((d) => logs.get(d.slot)?.status === 'taken');
  const onTime = taken.filter((d) => punctuality(d, new Date(logs.get(d.slot)!.at), settings.onTimeWindowMinutes) === 'onTime').length;
  const now = new Date();
  const allDone = doses.length > 0 && answered === doses.length;
  const goldToday = allDone && taken.length > 0 && onTime === taken.length;

  // This week, Monday first.
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const weekPct = adherence(week.filter((d) => diffDays(d, today) >= 0).map((d) => byDate.get(d)).filter((x) => !!x));

  // Confetti when the last dose of the day is answered while the app is open.
  const wasDone = useRef(allDone);
  useEffect(() => {
    if (allDone && !wasDone.current && settings.celebrate) setCelebrate(true);
    wasDone.current = allDone;
  }, [allDone, settings.celebrate]);

  const enableReminders = async () => {
    await requestNotificationPermission();
    await requestExactAlarms();
    refreshPerm();
    rescheduleAll().catch(() => {});
  };

  const activeCount = meds.filter((m) => !m.archived).length;

  const takeAll = async (pending: typeof doses) => {
    await takeDoses(pending).catch(() => popup('Some doses were not saved', 'Please try again.'));
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen title="Today" subtitle={formatDateLong(today)}>
        {perm && (!perm.notifications || !perm.exactAlarms) ? (
          <FadeIn>
            <Card style={{ backgroundColor: c.warnSoft }}>
              <Text style={s.bannerTitle}>{!perm.notifications ? 'Reminders are off' : 'Reminders may arrive late'}</Text>
              <Text style={s.bannerText}>
                {!perm.notifications
                  ? 'Allow notifications so the app can remind you when a dose is due.'
                  : 'Allow "Alarms & reminders" so doses ring on time, even when battery saving is on.'}
              </Text>
              <Button title="Turn on" onPress={enableReminders} style={{ marginTop: 12, alignSelf: 'flex-start' }} small />
            </Card>
          </FadeIn>
        ) : null}

        <FadeIn>
          <View style={[s.hero, { backgroundColor: c.hero }]}>
            <View style={s.heroTop}>
              <Rings
                size={ringSize}
                stroke={Math.round(ringSize * 0.095)}
                track="rgba(255,255,255,0.18)"
                rings={[
                  { value: answered, total: doses.length, color: c.rings[0] },
                  { value: onTime, total: taken.length, color: c.rings[1] },
                  { value: weekPct ?? 0, total: weekPct == null ? 0 : 1, color: c.rings[2] },
                ]}
              >
                <Text style={[s.ringBig, { fontSize: Math.round(ringSize * 0.2) }]} maxFontSizeMultiplier={1.2}>
                  {answered}
                  <Text style={[s.ringOf, { fontSize: Math.round(ringSize * 0.12) }]}>/{doses.length}</Text>
                </Text>
              </Rings>
              <View style={{ flex: 1, gap: 12 }}>
                <Legend color={c.rings[0]} label="Doses today" value={doses.length ? `${answered} of ${doses.length}` : 'None due'} />
                <Legend color={c.rings[1]} label="On time" value={taken.length ? `${onTime} of ${taken.length}` : '–'} />
                <Legend color={c.rings[2]} label="This week" value={weekPct == null ? '–' : `${Math.round(weekPct * 100)}%`} />
                {suppDoses.length > 0 ? (
                  <Legend color={c.rings[0]} label="Supplements" value={`${suppDone} of ${suppDoses.length}`} ring={{ value: suppDone, total: suppDoses.length }} />
                ) : null}
                {machineDoses.length > 0 ? (
                  <Legend color={c.rings[0]} label="Machines" value={`${machineDone} of ${machineDoses.length}`} ring={{ value: machineDone, total: machineDoses.length }} />
                ) : null}
                {checkDoses.length > 0 ? (
                  <Legend color={c.rings[0]} label="Checks" value={`${checkDone} of ${checkDoses.length}`} ring={{ value: checkDone, total: checkDoses.length }} />
                ) : null}
              </View>
            </View>
            <View style={s.heroPills}>
              <View style={s.pill}>
                <Ionicons name="flame" size={14} color="#fff" />
                <Text style={s.pillText}>{progress.currentStreak} day streak</Text>
              </View>
              <View style={s.pill}>
                <Ionicons name="snow-outline" size={14} color="#fff" />
                <Text style={s.pillText}>{progress.freezes} {progress.freezes === 1 ? 'freeze' : 'freezes'}</Text>
              </View>
              {goldToday ? (
                <View style={[s.pill, { backgroundColor: c.warn }]}>
                  <Ionicons name="star" size={14} color="#fff" />
                  <Text style={s.pillText}>All on time</Text>
                </View>
              ) : null}
            </View>
          </View>
        </FadeIn>

        <FadeIn delay={80}>
          <Card style={s.week}>
            {week.map((d) => {
              const sum = byDate.get(d);
              const future = diffDays(today, d) > 0;
              const isToday = d === today;
              const done = sum ? sum.taken + sum.skipped : 0;
              return (
                <PressableScale key={d} onPress={() => router.push('/calendar')} style={s.weekDay}>
                  <Text style={[s.weekLetter, isToday && { color: c.primary }]}>{'MTWTFSS'[(weekdayOf(d) + 6) % 7]}</Text>
                  <Ring
                    value={future ? 0 : done}
                    total={future ? 0 : (sum?.scheduled ?? 0)}
                    size={34}
                    stroke={5}
                    color={isGoldDay(sum) ? c.warn : sum?.status === 'complete' ? c.good : sum?.status === 'missed' ? c.bad : c.primary}
                  >
                    {isGoldDay(sum) ? (
                      <Ionicons name="star" size={13} color={c.warn} />
                    ) : sum?.status === 'complete' ? (
                      <Ionicons name="checkmark" size={14} color={c.good} />
                    ) : null}
                  </Ring>
                  <Text style={[s.weekNum, isToday && { color: c.primary, fontWeight: '900' }]}>{parseDateKey(d).d}</Text>
                </PressableScale>
              );
            })}
          </Card>
        </FadeIn>

        <HealthToday today={today} enabled={settings.healthConnect} />

        <MilestoneCard progress={progress} />
        <EarnBackCard progress={progress} />
        <FoodTimerCard key={version} />

        {allDone ? (
          <FadeIn>
            <Card style={[s.done, { backgroundColor: goldToday ? c.warnSoft : c.goodSoft }]}>
              <Ionicons name={goldToday ? 'star' : 'checkmark-circle'} size={30} color={goldToday ? c.warn : c.good} />
              <View style={{ flex: 1 }}>
                <Text style={[s.bannerTitle, { color: goldToday ? c.warn : c.good }]}>{goldToday ? 'A gold day' : 'All done for today'}</Text>
                <Text style={s.bannerText}>{goldToday ? 'Every dose taken, and every one on time.' : 'Every dose is logged.'}</Text>
              </View>
            </Card>
          </FadeIn>
        ) : null}

        <TimingCard meds={meds} settings={settings} today={today} version={version} />
        <ReviewPrompt today={today} hasHistory={summariesCount > 20} />

        {activeCount === 0 ? (
          <FadeIn delay={120}>
            <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
              <Ionicons name="medkit-outline" size={40} color={c.muted} />
              <Text style={s.emptyTitle}>Add your first medication</Text>
              <Text style={[s.bannerText, { textAlign: 'center' }]}>Set its schedule once and the app reminds you every time it's due.</Text>
              <Button title="Add medication" onPress={() => router.push('/med/new')} style={{ marginTop: 16 }} />
            </Card>
          </FadeIn>
        ) : null}

        {openSets.map((x, i) => {
          const overdue = dueAt(today, x.set.time) < now;
          return (
            <FadeIn key={x.set.id} delay={110 + i * 50}>
              <SectionTitle right={overdue ? <Text style={[s.tag, { color: c.bad, backgroundColor: c.badSoft }]}>Due now</Text> : null}>
                {`${x.set.name} · ${formatTime(x.set.time)}`}
              </SectionTitle>
              <Card style={{ paddingVertical: 6 }}>
                {x.open.map((d) => {
                  const med = medById.get(d.medId);
                  return med ? <DoseRow key={d.slot} dose={d} med={med} log={logs.get(d.slot)} windowMinutes={settings.onTimeWindowMinutes} showTime={d.time !== x.set.time} /> : null;
                })}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6, marginBottom: 6 }}>
                  <Button title={x.open.length > 1 ? `Take all ${x.open.length}` : 'Take it'} small onPress={() => takeAll(x.open)} style={{ flexGrow: 1 }} />
                  <Button title="Taken earlier" kind="secondary" small onPress={() => askTakenTime(x.open)} style={{ flexGrow: 1 }} />
                </View>
                {x.notDue.length ? (
                  <Text style={s.setHint}>
                    {x.notDue.map((id) => medById.get(id)?.name).filter(Boolean).join(', ')} not due today. {describeDays(x.set.days)}.
                  </Text>
                ) : null}
              </Card>
            </FadeIn>
          );
        })}

        {groups.map((g, i) => {
          const pending = g.doses;
          const overdue = dueAt(today, g.time) < now;
          return (
            <FadeIn key={g.time} delay={120 + i * 50}>
              <SectionTitle right={overdue ? <Text style={[s.tag, { color: c.bad, backgroundColor: c.badSoft }]}>Due now</Text> : null}>
                {routineAt(g.time, settings.routines) ? `${routineAt(g.time, settings.routines)!.name} · ${formatTime(g.time)}` : formatTime(g.time)}
              </SectionTitle>
              <Card style={{ paddingVertical: 6 }}>
                {g.doses.map((d) => {
                  const med = medById.get(d.medId);
                  return med ? <DoseRow key={d.slot} dose={d} med={med} log={logs.get(d.slot)} windowMinutes={settings.onTimeWindowMinutes} /> : null;
                })}
                {pending.length > 1 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6, marginBottom: 6 }}>
                    <Button title={`Take all ${pending.length}`} kind="secondary" small onPress={() => takeAll(pending)} style={{ flexGrow: 1 }} />
                    <Button title="Taken earlier" kind="secondary" small onPress={() => askTakenTime(pending)} style={{ flexGrow: 1 }} />
                  </View>
                ) : null}
              </Card>
            </FadeIn>
          );
        })}

        {suppOpen.length > 0 ? (
          <FadeIn delay={140}>
            <SectionTitle>Supplements</SectionTitle>
            <Card style={{ paddingVertical: 6 }}>
              {suppOpen.map((d) => {
                const med = medById.get(d.medId);
                return med ? <DoseRow key={d.slot} dose={d} med={med} log={logs.get(d.slot)} windowMinutes={settings.onTimeWindowMinutes} showTime /> : null;
              })}
            </Card>
            <Text style={s.suppHint}>Missing a supplement never affects your streak.</Text>
          </FadeIn>
        ) : null}

        <ChecksSection checks={checks} doses={checkDoses} logs={logs} windowMinutes={settings.onTimeWindowMinutes} />

        <MachinesSection
          machines={machines}
          doses={machineDoses}
          logs={logs}
          todayLogs={todayLogs}
          today={today}
          windowMinutes={settings.onTimeWindowMinutes}
          version={version}
        />

        <DoneList doses={doneDoses} medById={medById} logs={logs} windowMinutes={settings.onTimeWindowMinutes} />

        {asNeeded.length > 0 ? (
          <>
            <SectionTitle>As needed</SectionTitle>
            <Card style={{ paddingVertical: 6 }}>
              {asNeeded.map((m) => {
                const last = todayLogs.filter((l) => l.medId === m.id).sort((a, b) => b.at.localeCompare(a.at))[0];
                return (
                  <View key={m.id} style={s.prnRow}>
                    <MedIcon med={m} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.prnName}>{m.name}</Text>
                      <Text style={s.prnSub}>{last ? `Last today at ${formatTime(timeFromDate(new Date(last.at)))}` : describeDose(m)}</Text>
                    </View>
                    <Button title="Log" small kind="secondary" onPress={() => logAsNeeded(m)} />
                  </View>
                );
              })}
            </Card>
          </>
        ) : null}

        {activeCount > 0 && settings.features.mood ? (
          <View style={{ marginTop: 14 }}>
            <NoteCard date={today} />
          </View>
        ) : null}

        {people.length > 0 && settings.features.caregiving ? (
          <>
            <SectionTitle>People I look after</SectionTitle>
            {people.map((p) => (
              <PressableScale key={p.code.id} onPress={() => router.push('/care')} style={{ marginBottom: 10 }}>
                <CareCard person={p} graceMinutes={settings.care.graceMinutes} />
              </PressableScale>
            ))}
          </>
        ) : null}
      </Screen>
      {celebrate ? <Confetti onDone={() => setCelebrate(false)} /> : null}
    </View>
  );
}

function Legend({ color, label, value, ring }: { color: string; label: string; value: string; ring?: { value: number; total: number } }) {
  const s = useStyles();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {ring ? (
        <Ring value={ring.value} total={ring.total} size={18} stroke={4} color="#fff" track="rgba(255,255,255,0.25)" />
      ) : (
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      )}
      <View>
        <Text style={s.legendLabel}>{label}</Text>
        <Text style={s.legendValue}>{value}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  hero: { borderRadius: 32, padding: 20, marginBottom: 14, shadowColor: c.hero, shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  ringBig: { fontSize: 30, fontWeight: '900', color: '#fff' },
  ringOf: { fontSize: 18, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },
  legendLabel: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  legendValue: { fontSize: 17, fontWeight: '900', color: '#fff' },
  heroPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  pillText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  week: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 12 },
  weekDay: { alignItems: 'center', gap: 6 },
  weekLetter: { fontSize: 12, fontWeight: '800', color: c.muted },
  weekNum: { fontSize: 12, fontWeight: '700', color: c.muted },
  done: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  tag: { fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  bannerTitle: { fontSize: 17, fontWeight: '800', color: c.text },
  bannerText: { fontSize: 14, color: c.muted, marginTop: 4 },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: c.text, marginTop: 8 },
  setHint: { fontSize: 13, color: c.muted, fontWeight: '600', marginBottom: 6 },
  suppHint: { fontSize: 13, color: c.muted, fontWeight: '600', marginTop: -4, marginBottom: 10, marginLeft: 6 },
  prnRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  prnName: { fontSize: 17, fontWeight: '800', color: c.text },
  prnSub: { fontSize: 14, color: c.muted, marginTop: 1, fontWeight: '600' },
}));
