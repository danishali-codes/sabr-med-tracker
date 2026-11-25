import type { SettingsGroup } from '../types';
import { backupGroup } from './backup';
import { devicesGroup } from './devices';
import { featuresGroup } from './features';
import { healthGroup } from './health';
import { lookGroup } from './look';
import { privacyGroup } from './privacy';
import { remindersGroup } from './reminders';
import { timingGroup } from './timing';

/**
 * Every settings page, in the order the Settings list shows them.
 *
 * To add a setting, add an item to the right group's file (toggle, choice and link in
 * ../rows.tsx cover most). Give it keywords so search finds it, and mark it advanced if most
 * people never need it. A new group gets its own file here and shows up in the list and in
 * search automatically, at /settings/<id>.
 */
export const SETTINGS_GROUPS: SettingsGroup[] = [featuresGroup, lookGroup, remindersGroup, timingGroup, healthGroup, privacyGroup, backupGroup, devicesGroup];
