import Ionicons from '@expo/vector-icons/Ionicons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { popup } from '../components/Popup';
import { PageScroll } from '../components/Screen';
import { DateButton } from '../components/Pickers';
import { Button, Card, Chip, Field, Input, SectionTitle, Text } from '../components/ui';
import { addDays, formatDateLong, toDateKey, type DateKey } from '../domain/dates';
import { buildReport, reportHtml } from '../domain/report';
import * as repo from '../db/repo';
import { useMeds, useSettings } from '../hooks/useData';
import { ToggleRow } from '../components/ToggleRow';
import { makeStyles, useTheme } from '../theme';

const RANGES = [
  { key: '7', label: 'Last 7 days', days: 7 },
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: '90', label: '3 months', days: 91 },
  { key: '182', label: '6 months', days: 182 },
  { key: 'custom', label: 'Custom', days: 0 },
] as const;

/** A PDF for the doctor covering any period. Made on the phone; you choose who to share it with. */
export default function ReportScreen() {
  const c = useTheme();
  const st = useStyles();
  const meds = useMeds();
  const settings = useSettings();
  const today = toDateKey(new Date());
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('30');
  const [from, setFrom] = useState<DateKey>(addDays(today, -29));
  const [to, setTo] = useState<DateKey>(today);
  const [name, setName] = useState(repo.getKv('report_name') ?? '');
  const [busy, setBusy] = useState(false);
  // Blood sugar and blood pressure readings go in only when the person ticks it, for this report.
  const [withReadings, setWithReadings] = useState(false);
  const checksOn = settings.features.sugarChecks || settings.features.bpChecks;

  const pick = (key: (typeof RANGES)[number]['key']) => {
    setRange(key);
    const r = RANGES.find((x) => x.key === key)!;
    if (r.days) {
      setFrom(addDays(today, -(r.days - 1)));
      setTo(today);
    }
  };

  const report = useMemo(
    () =>
      buildReport({
        // Checks (blood sugar, blood pressure) aren't medicines; their readings have their own part.
        meds: meds.filter((m) => !m.check),
        logs: repo.getLogs(from, to),
        notes: repo.getNotes(from, to),
        from,
        to,
        now: new Date(),
        windowMinutes: settings.onTimeWindowMinutes,
      }),
    [meds, from, to, settings.onTimeWindowMinutes],
  );

  const html = () => {
    repo.setKv('report_name', name.trim());
    return reportHtml(report, {
      patient: name.trim() || undefined,
      generatedAt: new Date(),
      windowMinutes: settings.onTimeWindowMinutes,
      readings: withReadings ? repo.getReadings(from, to) : undefined,
      sugarUnit: settings.sugarUnit,
    });
  };

  const share = async () => {
    setBusy(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: html() });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Share the report' });
    } catch (e) {
      popup('Could not make the PDF', String(e));
    } finally {
      setBusy(false);
    }
  };

  const print = async () => {
    try {
      await Print.printAsync({ html: html() });
    } catch (e) {
      popup('Could not print', String(e));
    }
  };

  const t = report.totals;
  const pct = t.adherence == null ? '–' : `${Math.round(t.adherence * 100)}%`;

  return (
    <PageScroll contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Card>
        <Field label="Period">
          <View style={st.wrap}>
            {RANGES.map((r) => (
              <Chip key={r.key} label={r.label} selected={range === r.key} onPress={() => pick(r.key)} />
            ))}
          </View>
        </Field>
        {range === 'custom' ? (
          <View style={st.inline}>
            <Field label="From" style={{ flex: 1 }}>
              <DateButton value={from} onChange={(d) => setFrom(d > to ? to : d)} />
            </Field>
            <Field label="To" style={{ flex: 1 }}>
              <DateButton value={to} onChange={(d) => setTo(d > today ? today : d < from ? from : d)} />
            </Field>
          </View>
        ) : (
          <Text style={st.hint}>
            {formatDateLong(from)} to {formatDateLong(to)}
          </Text>
        )}
        <Field label="Name on the report (optional)" style={{ marginTop: 14, marginBottom: checksOn ? 6 : 0 }}>
          <Input value={name} onChangeText={setName} placeholder="Your name" autoCorrect={false} />
        </Field>
        {checksOn ? (
          <ToggleRow
            label="Include my readings"
            hint={`Blood sugar and blood pressure readings in this period${withReadings ? `: ${repo.getReadings(from, to).length} of them` : ''}, with averages.`}
            value={withReadings}
            onChange={setWithReadings}
          />
        ) : null}
      </Card>

      <SectionTitle>Summary</SectionTitle>
      <View style={st.tiles}>
        <Tile value={pct} label="Taken" color={c.primary} />
        <Tile value={`${t.late}`} label="Late" color={c.warn} />
        <Tile value={`${t.missed}`} label="Missed" color={c.bad} />
        <Tile value={`${t.skipped}`} label="Skipped" color={c.muted} />
      </View>
      <Card>
        {report.meds.length === 0 ? <Text style={st.hint}>No doses were due in this period.</Text> : null}
        {report.meds.map((m) => (
          <View key={m.id} style={st.medRow}>
            <View style={{ flex: 1 }}>
              <Text style={st.medName}>{m.name}</Text>
              <Text style={st.hint}>
                {m.taken} of {m.due - m.skipped} taken{m.late ? `, ${m.late} late` : ''}
                {m.missed ? `, ${m.missed} missed` : ''}
              </Text>
            </View>
            <Text style={st.medPct}>{m.adherence == null ? '–' : `${Math.round(m.adherence * 100)}%`}</Text>
          </View>
        ))}
        {report.notes.length ? (
          <Text style={[st.hint, { marginTop: 10 }]}>
            Includes {report.notes.length} {report.notes.length === 1 ? 'day' : 'days'} of mood and symptom notes.
          </Text>
        ) : null}
      </Card>

      <Button
        title={busy ? 'Making the PDF...' : 'Share as PDF'}
        icon={busy ? <ActivityIndicator color={c.onPrimary} /> : <Ionicons name="share-outline" size={18} color={c.onPrimary} />}
        onPress={share}
        style={{ marginTop: 16 }}
      />
      <Button title="Print" kind="secondary" icon={<Ionicons name="print-outline" size={18} color={c.primary} />} onPress={print} style={{ marginTop: 10 }} />
      <Text style={[st.hint, { textAlign: 'center', marginTop: 12 }]}>The PDF is made on your phone. Nothing is sent anywhere until you choose where to share it.</Text>
    </PageScroll>
  );
}

function Tile({ value, label, color }: { value: string; label: string; color: string }) {
  const st = useStyles();
  return (
    <Card style={st.tile}>
      <Text style={[st.tileValue, { color }]}>{value}</Text>
      <Text style={st.hint}>{label}</Text>
    </Card>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  inline: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  hint: { fontSize: 13, color: c.muted, fontWeight: '600', lineHeight: 18 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tile: { flexGrow: 1, flexBasis: 70, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4, marginBottom: 0 },
  tileValue: { fontSize: 22, fontWeight: '900' },
  medRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  medName: { fontSize: 16, fontWeight: '800', color: c.text },
  medPct: { fontSize: 18, fontWeight: '900', color: c.text },
}));
