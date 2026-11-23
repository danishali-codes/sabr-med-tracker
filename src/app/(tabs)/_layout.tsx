import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import { type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT, tabBarBottom } from '../../components/Screen';
import { useSettings } from '../../hooks/useData';
import { FONT, useTheme } from '../../theme';

type IconName = keyof typeof Ionicons.glyphMap;

const icon =
  (on: IconName, off: IconName) =>
  ({ color, focused }: { color: ColorValue; focused: boolean }) => <Ionicons name={focused ? on : off} color={color as string} size={24} />;

export default function TabsLayout() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  // First run, or the first open after updating to a version with features: setup comes first.
  if (!settings.setupDone) return <Redirect href="/setup" />;
  const tabs = settings.tabs;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: 'shift',
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarLabelStyle: { fontFamily: FONT.bold, fontSize: 11 },
        tabBarAllowFontScaling: false,
        tabBarStyle: {
          position: 'absolute',
          marginHorizontal: 16,
          bottom: tabBarBottom(insets.bottom),
          height: TAB_BAR_HEIGHT,
          paddingTop: 8,
          paddingBottom: 10,
          borderRadius: 30,
          borderTopWidth: 0,
          backgroundColor: c.tabBar,
          shadowColor: c.shadow,
          shadowOpacity: c.dark ? 0.6 : 0.14,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 8 },
          elevation: 12,
        },
        tabBarItemStyle: { borderRadius: 22 },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('sunny', 'sunny-outline') }} />
      <Tabs.Screen name="meds" options={{ title: 'Medicine', tabBarIcon: icon('medkit', 'medkit-outline'), href: tabs.meds ? undefined : null }} />
      <Tabs.Screen name="wellbeing" options={{ title: 'Health', tabBarIcon: icon('heart', 'heart-outline'), href: tabs.health ? undefined : null }} />
      <Tabs.Screen name="calendar" options={{ title: 'History', tabBarIcon: icon('calendar', 'calendar-outline'), href: tabs.history ? undefined : null }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: icon('trophy', 'trophy-outline'), href: tabs.progress ? undefined : null }} />
    </Tabs>
  );
}
