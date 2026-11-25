import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
  useFonts,
} from '@expo-google-fonts/nunito';
import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { Appearance, AppState, useColorScheme } from 'react-native';
import { popup, PopupHost } from '../components/Popup';
import { phoneTimeZone } from '../domain/schedule';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSettings } from '../hooks/useData';
import { registerBackgroundTasks } from '../notifications/background';
import { pushToWatchNow } from '../wear/sync';
import { handleReminderAction, rescheduleAll, setupNotifications } from '../notifications/reminders';
import { black, dark, FONT, light, ThemeContext } from '../theme';
import { refreshWidget } from '../widget/update';
import * as repo from '../db/repo';
import { startSync, syncNow } from '../sync/engine';
import { AppLockGate } from '../components/AppLock';
import { autoBackupIfDue } from '../backup/backup';

// Show reminders even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black });
  const settings = useSettings();
  const system = useColorScheme();

  // Native pieces (date pickers) follow the chosen appearance too.
  useEffect(() => {
    Appearance.setColorScheme(settings.appearance === 'system' ? 'unspecified' : settings.appearance);
  }, [settings.appearance]);

  const isDark = settings.appearance === 'system' ? system === 'dark' : settings.appearance === 'dark';
  const c = isDark ? (settings.trueBlack ? black : dark) : light;
  const navTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, background: c.bg, card: c.bg, text: c.text, primary: c.primary, border: c.border } };
  }, [isDark, c]);

  useEffect(() => {
    setupNotifications()
      .then(() => rescheduleAll())
      .catch((e) => console.warn('notification setup failed', e));
    registerBackgroundTasks();
    refreshWidget();
    pushToWatchNow().catch(() => {});
    // Optional sync: does nothing unless turned on in Settings.
    startSync();
    syncNow().catch(() => {});
    autoBackupIfDue().catch(() => {});

    // Buttons pressed while the app is open (Android also runs the background task; handling is idempotent).
    const responses = Notifications.addNotificationResponseReceivedListener((r) => {
      const data = r.notification.request.content.data as { check?: boolean; medIds?: string[]; slots?: string[]; date?: string } | undefined;
      // Tapping a check reminder opens the reading form for it.
      if (r.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER && data?.check && data.medIds?.[0]) {
        router.push({ pathname: '/check/log', params: { id: data.medIds[0], slot: data.slots?.[0] ?? '', date: data.date ?? '' } });
        return;
      }
      handleReminderAction(r.actionIdentifier, r.notification.request.content.data).catch((e) => console.warn(e));
    });
    checkTimeZone();
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        checkTimeZone();
        rescheduleAll().catch(() => {});
        syncNow().catch(() => {});
        autoBackupIfDue().catch(() => {});
      }
    });
    return () => {
      responses.remove();
      appState.remove();
    };
  }, []);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeContext.Provider value={c}>
        <ThemeProvider value={navTheme}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <AppLockGate>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: c.bg },
              headerShadowVisible: false,
              headerTintColor: c.text,
              headerTitleStyle: { fontFamily: FONT.extrabold },
              contentStyle: { backgroundColor: c.bg },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="med/[id]" options={{ title: 'Medication', presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="machine/[id]" options={{ title: 'Machine', presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="machine/night" options={{ title: 'How was the night?' }} />
            <Stack.Screen name="check/[id]" options={{ title: 'Check', presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="check/log" options={{ title: 'Log a reading' }} />
            <Stack.Screen name="readings" options={{ title: 'Readings' }} />
            <Stack.Screen name="interactions" options={{ title: 'Interactions' }} />
            <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
            <Stack.Screen name="settings/[group]" options={{ title: 'Settings' }} />
            <Stack.Screen name="times" options={{ title: 'Ramadan, travel and changes' }} />
            <Stack.Screen name="report" options={{ title: 'Doctor report' }} />
            <Stack.Screen name="sync" options={{ title: 'Sync and sharing' }} />
            <Stack.Screen name="care" options={{ title: 'People I look after' }} />
            <Stack.Screen name="backup" options={{ title: 'Backup and restore' }} />
            <Stack.Screen name="routines" options={{ title: 'Routines' }} />
            <Stack.Screen name="sets" options={{ title: 'Schedules' }} />
            <Stack.Screen name="review" options={{ title: 'In review' }} />
            <Stack.Screen name="patterns" options={{ title: 'Patterns' }} />
            <Stack.Screen name="health" options={{ title: 'Health data' }} />
            <Stack.Screen name="metric/[id]" options={{ title: 'Health' }} />
            <Stack.Screen name="mood" options={{ title: 'Mood trend' }} />
            <Stack.Screen name="setup" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
            <Stack.Screen name="profile" options={{ title: 'Health profile' }} />
          </Stack>
          <PopupHost />
          </AppLockGate>
        </ThemeProvider>
      </ThemeContext.Provider>
    </SafeAreaProvider>
  );
}

/**
 * Tells you once when the phone's time zone changes (e.g. after a flight), and how
 * reminders will behave. Reminders are rescheduled for the new zone either way.
 */
function checkTimeZone() {
  const now = phoneTimeZone();
  if (!now) return;
  const last = repo.getKv('last_time_zone');
  if (last === now) return;
  repo.setKv('last_time_zone', now);
  if (!last) return;
  const s = repo.getSettings();
  const msg = s.travelMode
    ? `Reminders stay on your home time (${s.homeTimeZone}). You can change this under Settings, Timing and routines.`
    : 'Reminders now follow the local time here, so an 8:00 AM dose rings at 8:00 AM local time. To keep your home time instead, turn on "Keep home time" in Settings, Timing and routines.';
  popup(`Time zone changed to ${now}`, msg);
}
