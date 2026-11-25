import { useEffect, useState } from 'react';
import { Text } from '../../components/ui';
import { WatchStatus } from '../../components/WatchStatus';
import { clearWatch, pushToWatchNow } from '../../wear/sync';
import { toggle, useSettingStyles } from '../rows';
import type { SettingsGroup } from '../types';

function Info({ children }: { children: string }) {
  const st = useSettingStyles();
  return <Text style={[st.hint, { marginBottom: 4 }]}>{children}</Text>;
}

export const devicesGroup: SettingsGroup = {
  id: 'devices',
  title: 'Watch and widgets',
  icon: 'watch-outline',
  blurb: 'Home screen widgets and your smartwatch',
  androidOnly: true,
  summary: (s) =>
    [s.watchTile ? 'Watch tile on' : null, s.widgetShowNames ? 'Names on widget' : null].filter(Boolean).join(' · ') ||
    null,
  sections: [
    {
      title: 'Home screen widget',
      items: [
        {
          id: 'widgetHowTo',
          title: 'Adding a widget',
          hint: 'Long-press your home screen, tap Widgets, and find Sabr.',
          keywords: ['widget', 'home screen', 'add', 'resize'],
          androidOnly: true,
          Component: () => (
            <Info>
              Long-press your home screen, tap Widgets, and find Sabr. There are three: Next dose (small, with Taken and Snooze), Today (your rings and next dose)
              and Today's list (every dose). Resize any of them and it changes to fit. It turns green when the day is done, and gold when every dose was on time.
            </Info>
          ),
        },
        toggle({
          id: 'widgetShowNames',
          title: 'Show medicine names on the widget',
          hint: 'Show names on the home screen widget.',
          keywords: ['widget', 'names', 'home screen', 'private'],
          androidOnly: true,
          get: (s) => s.widgetShowNames,
          set: (widgetShowNames) => ({ widgetShowNames }),
          liveHint: (s) =>
            s.widgetShowNames
              ? 'On. Anyone who sees your home screen can read the names.'
              : 'Off. The widget shows the time, the dose and a drawing of the pill, but not the name.',
        }),
      ],
    },
    {
      title: 'Smartwatch',
      items: [
        {
          id: 'watchNotifications',
          title: 'Reminders on your watch',
          hint: 'Turn on Sabr in the Galaxy Wearable app to get reminders with buttons on your watch.',
          keywords: ['watch', 'galaxy watch', 'wear os', 'wearable', 'notifications', 'buzz'],
          androidOnly: true,
          Component: () => (
            <Info>
              Reminders show on your watch with the Taken, Snooze and Skip buttons once the watch is allowed to show this app. On a Galaxy Watch, open the Galaxy
              Wearable app, go to Watch settings, then Notifications, then App notifications, and turn on Sabr. The watch only buzzes while the phone screen is
              off.
            </Info>
          ),
        },
        toggle({
          id: 'watchTile',
          feature: 'watch',
          title: 'Watch tile',
          hint: "Today's ring, your next dose and Taken and Snooze buttons on a Wear OS tile.",
          keywords: ['watch', 'tile', 'wear os', 'galaxy watch', 'wearable'],
          androidOnly: true,
          get: (s) => s.watchTile,
          set: (watchTile) => ({ watchTile }),
          afterChange: (v) => {
            if (v) pushToWatchNow().catch(() => {});
            else clearWatch().catch(() => {});
          },
          liveHint: (s) =>
            s.watchTile
              ? `On. Today's ring, your next dose time and Taken and Snooze buttons show on a Wear OS watch tile. It goes to your paired watch over Bluetooth; if that's off, Google's watch connection may pass it through its servers, end-to-end encrypted. ${s.showMedNames ? 'Medicine names are included because names are on in Privacy.' : 'Medicine names are left out.'}`
              : "Off. Nothing is sent to your watch apart from reminders. Turn on to see today's progress on a Wear OS tile, such as on a Galaxy Watch.",
          after: ({ settings }) => (settings.watchTile ? <WatchStatus /> : null),
        }),
      ],
    },
  ],
};
