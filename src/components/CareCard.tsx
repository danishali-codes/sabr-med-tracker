import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import { formatTime, timeFromDate, toDateKey } from '../domain/dates';
import type { Followed } from '../sync/engine';
import { makeStyles, useTheme } from '../theme';
import { Card, Text } from './ui';

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  return new Date(iso).toLocaleDateString();
}

/** One person you follow: their doses today, as of their last update. */
export function CareCard({ person, graceMinutes }: { person: Followed; graceMinutes: number }) {
  const c = useTheme();
  const s = useStyles();
  const st = person.status;
  const today = toDateKey(new Date());
  const doses = (st?.doses ?? []).filter((d) => toDateKey(new Date(d.due)) === today);
  const now = Date.now();
  return (
    <Card>
      <View style={s.head}>
        <Text style={s.name}>{st?.name ?? 'Someone'}</Text>
        <Text style={s.meta}>Updated {ago(st?.updatedAt ?? null)}</Text>
      </View>
      {person.error ? <Text style={[s.meta, { color: c.bad, marginBottom: 6 }]}>{person.error}</Text> : null}
      {doses.length === 0 ? <Text style={s.meta}>No doses today.</Text> : null}
      {doses.map((d, i) => {
        const late = d.status === 'open' && new Date(d.due).getTime() + graceMinutes * 60_000 <= now;
        const icon =
          d.status === 'taken'
            ? 'checkmark-circle'
            : d.status === 'skipped'
              ? 'remove-circle-outline'
              : d.status === 'missed'
                ? 'close-circle'
                : late
                  ? 'alert-circle'
                  : 'ellipse-outline';
        const color = d.status === 'taken' ? c.good : late || d.status === 'missed' ? c.bad : c.faint;
        const when = formatTime(timeFromDate(new Date(d.due)));
        const what =
          d.status === 'taken' && d.at
            ? `Taken at ${formatTime(timeFromDate(new Date(d.at)))}`
            : d.status === 'skipped'
              ? 'Skipped'
              : d.status === 'missed'
                ? 'Missed'
                : late
                ? 'Not marked yet'
                : 'Coming up';
        return (
          <View key={i} style={s.row}>
            <Ionicons name={icon} size={20} color={color} />
            <Text style={s.time}>{when}</Text>
            <Text style={s.label} numberOfLines={1}>
              {d.label}
              {d.dose ? `, ${d.dose}` : ''}
            </Text>
            <Text style={[s.meta, late && { color: c.bad }]}>{what}</Text>
          </View>
        );
      })}
      {st ? (
        <View style={s.week}>
          {st.week.map((w) => (
            <View
              key={w.date}
              style={[s.day, { backgroundColor: w.total === 0 ? c.border : w.done >= w.total ? c.good : w.done > 0 ? c.warn : c.badSoft }]}
              accessibilityLabel={`${w.date}: ${w.done} of ${w.total}`}
            />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((c) => ({
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 10, marginBottom: 8 },
  name: { fontSize: 17, fontWeight: '900', color: c.text },
  meta: { fontSize: 12, fontWeight: '700', color: c.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  time: { minWidth: 70, fontSize: 14, fontWeight: '800', color: c.text },
  label: { flex: 1, fontSize: 14, fontWeight: '700', color: c.text },
  week: { flexDirection: 'row', gap: 4, marginTop: 10 },
  day: { flex: 1, height: 8, borderRadius: 4 },
}));
