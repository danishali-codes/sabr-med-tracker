import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, View } from 'react-native';
import { HEALTH_KINDS, type HealthKind } from '../domain/health';
import * as repo from '../db/repo';
import { clearHealthCache, grantedKinds, healthStatus, installHealthConnect, openHealthConnect, requestHealthAccess, type HealthStatus } from '../health/connect';
import { useSettings } from '../hooks/useData';
import { makeStyles, useTheme } from '../theme';
import { popup } from './Popup';
import { ToggleRow } from './ToggleRow';
import { Button, Text } from './ui';

/**
 * The "Read health data" switch, in Settings, Health data: asks Health Connect for access when
 * turned on, shows what Sabr is allowed to read, and forgets what it read when turned off.
 */
export function HealthConnectSetup() {
  const c = useTheme();
  const s = useStyles();
  const settings = useSettings();
  const on = settings.healthConnect;
  const [status, setStatus] = useState<HealthStatus>(() => healthStatus());
  const [granted, setGranted] = useState<HealthKind[] | null>(null);

  const load = useCallback(() => {
    const st = healthStatus();
    setStatus(st);
    if (!repo.getSettings().healthConnect || st !== 'ready') {
      setGranted(null);
      return;
    }
    grantedKinds().then(setGranted);
  }, []);

  // Again when coming back from Health Connect or the Play Store.
  useFocusEffect(
    useCallback(() => {
      load();
      const sub = AppState.addEventListener('change', (a) => a === 'active' && load());
      return () => sub.remove();
    }, [load]),
  );

  const setOn = (v: boolean) => repo.saveSettings({ ...repo.getSettings(), healthConnect: v });

  const toggle = async (v: boolean) => {
    if (!v) {
      setOn(false);
      clearHealthCache();
      load();
      return;
    }
    const st = healthStatus();
    if (st === 'unavailable') {
      popup('Not available on this phone', 'Health Connect needs Android 8 or newer.');
      return;
    }
    if (st === 'needsInstall') {
      popup(
        'Get Health Connect first',
        'Samsung Health shares your steps, sleep and heart rate through the Health Connect app from Google. Install or update it, then come back here.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Play Store', onPress: installHealthConnect },
        ],
      );
      return;
    }
    setOn(true);
    try {
      const kinds = await requestHealthAccess();
      setGranted(kinds);
      if (kinds.length === 0) {
        popup('Nothing allowed yet', 'Sabr can only read what you allow in Health Connect. Tap "Choose what Sabr reads" whenever you want to change it.');
      }
    } catch {
      // The screen couldn't open; the buttons below can try again.
    }
    load();
  };

  return (
    <View>
      <ToggleRow
        label="Read health data"
        hint={
          on
            ? 'On. Steps, sleep and heart rate show on the Health tab. Health Connect decides what Sabr can see, and you can take it back there at any time.'
            : "Off. Sabr doesn't read anything from Health Connect. Turn on to see steps, sleep and heart rate on the Health tab."
        }
        value={on && status === 'ready'}
        onChange={toggle}
      />

      {on && status === 'ready' ? (
        <View style={{ marginTop: 6 }}>
          <Text style={s.head}>What Sabr can read</Text>
          {HEALTH_KINDS.map((k) => {
            const ok = granted?.includes(k.kind) ?? false;
            return (
              <View key={k.kind} style={s.row}>
                <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={ok ? c.good : c.faint} />
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{k.label}</Text>
                  <Text style={s.hint}>{ok ? k.hint : 'Not allowed'}</Text>
                </View>
              </View>
            );
          })}
          <View style={s.buttons}>
            <Button
              title="Choose what Sabr reads"
              small
              onPress={() =>
                requestHealthAccess()
                  .then(setGranted)
                  .then(load)
                  .catch(() => openHealthConnect())
              }
              style={{ flexGrow: 1 }}
            />
            <Button title="Open Health Connect" small kind="secondary" onPress={openHealthConnect} style={{ flexGrow: 1 }} />
          </View>
        </View>
      ) : null}

      {status === 'needsInstall' ? (
        <View style={{ marginTop: 8 }}>
          <Text style={s.label}>Health Connect is needed</Text>
          <Text style={s.hint}>It's a free app from Google that keeps health data on your phone and lets you choose which apps can read it.</Text>
          <Button title="Get Health Connect" small onPress={installHealthConnect} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
        </View>
      ) : status === 'unavailable' ? (
        <Text style={[s.hint, { marginTop: 6 }]}>Health Connect isn't available on this device.</Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  head: { fontSize: 13, color: c.muted, fontWeight: '800', marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  label: { fontSize: 15, color: c.text, fontWeight: '800' },
  hint: { fontSize: 13, color: c.muted, marginTop: 2, fontWeight: '600', lineHeight: 18 },
}));
