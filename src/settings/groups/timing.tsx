import { toDateKey } from '../../domain/dates';
import { choice, link, toggle } from '../rows';
import type { SettingsGroup } from '../types';

export const timingGroup: SettingsGroup = {
  id: 'timing',
  title: 'Timing and routines',
  icon: 'time-outline',
  blurb: 'Routines, Ramadan, travel, on-time window',
  summary: (s) =>
    [s.routines.length ? `${s.routines.length} routine${s.routines.length > 1 ? 's' : ''}` : null, s.ramadan.enabled ? 'Ramadan on' : null, s.travelMode ? 'Keeping home time' : null]
      .filter(Boolean)
      .join(' · ') || null,
  sections: [
    {
      items: [
        link({
          id: 'routines',
          title: 'Routines',
          hint: 'Move several reminders to one time, like "Breakfast" at 8:00, with one reminder for all of them.',
          keywords: ['group', 'breakfast', 'dinner', 'bedtime', 'morning', 'together'],
          icon: 'albums-outline',
          href: '/routines',
          summary: (s) => (s.routines.length ? s.routines.map((r) => r.name).join(', ') : null),
        }),
        link({
          id: 'doseSets',
          title: 'Schedules',
          hint: 'Medicines you take together on some days, like 7:00 on work days, marked with one tap on Today.',
          keywords: ['schedule', 'set', 'bulk', 'take all', 'together', 'work days', 'weekdays', 'monday'],
          icon: 'checkmark-done-outline',
          href: '/sets',
          summary: (s) => (s.doseSets.length ? s.doseSets.map((r) => r.name).join(', ') : null),
        }),
        link({
          id: 'timeChanges',
          title: 'Ramadan, travel and time changes',
          hint: 'Move reminders for Ramadan, trips or a busy week.',
          keywords: ['ramadan', 'fasting', 'suhoor', 'iftar', 'prayer', 'travel', 'time zone', 'home time', 'trip', 'holiday', 'move'],
          icon: 'moon-outline',
          href: '/times',
          summary: (s) => {
            const today = toDateKey(new Date());
            const planned = s.timeChanges.filter((x) => x.to >= today).length;
            return (
              [s.ramadan.enabled ? 'Ramadan on' : null, s.travelMode ? 'Keeping home time' : null, planned ? `${planned} change${planned > 1 ? 's' : ''} planned` : null]
                .filter(Boolean)
                .join(' · ') || null
            );
          },
        }),
      ],
    },
    {
      title: 'Timing',
      items: [
        choice({
          id: 'onTimeWindowMinutes',
          title: 'Counts as on time within',
          hint: 'How close to its time a dose has to be taken to count as on time. Taken earlier than this counts as early.',
          keywords: ['on time', 'late', 'early', 'window', 'gold', 'perfect day', 'streak'],
          advanced: true,
          options: [30, 60, 120, 180],
          suffix: 'min',
          note: 'Late doses still count for your streak. Only doses never taken that day break it.',
          get: (s) => s.onTimeWindowMinutes,
          set: (onTimeWindowMinutes) => ({ onTimeWindowMinutes }),
        }),
        toggle({
          id: 'smartTiming',
          title: 'Learn my timing',
          hint: 'When you usually take a dose well before or after its reminder, Sabr offers to move the reminder.',
          keywords: ['learn', 'suggest', 'smart', 'habit', 'move reminder'],
          advanced: true,
          get: (s) => s.smartTiming,
          set: (smartTiming) => ({ smartTiming }),
        }),
        toggle({
          id: 'foodTimers',
          title: 'Food timers',
          hint: 'After a medicine taken on an empty stomach, a notice tells you when you can eat.',
          keywords: ['food', 'eat', 'empty stomach', 'meal', 'wait'],
          advanced: true,
          get: (s) => s.foodTimers,
          set: (foodTimers) => ({ foodTimers }),
        }),
      ],
    },
  ],
};
