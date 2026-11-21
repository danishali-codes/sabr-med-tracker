import { router } from 'expo-router';
import { popup } from '../components/Popup';
import * as repo from '../db/repo';
import { featureInfo, featurePatch, type FeatureId } from '../domain/features';
import { clearWatch, pushToWatchNow } from '../wear/sync';
import { updateSettings } from './rows';

/**
 * Turns a feature on or off. Off hides it and stops anything it was doing in the background
 * (watch updates, Health Connect reads, Ramadan times); what it saved is kept.
 */
export function setFeature(id: FeatureId, on: boolean) {
  const s = repo.getSettings();
  if (!on && id === 'caregiving' && s.sync.share) {
    popup(
      'Stop sharing first',
      'People you shared your doses with can still see them. Turn off sharing in Sync and sharing, then turn this off.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open sharing', onPress: () => router.push('/sync') },
      ],
    );
    return;
  }
  updateSettings(featurePatch(s, id, on));
  // Turning on checks with none set up yet: go straight to choosing a plan.
  if (on && (id === 'sugarChecks' || id === 'bpChecks')) {
    const type = id === 'sugarChecks' ? 'sugar' : 'bp';
    if (!repo.getMeds().some((m) => !m.archived && m.check?.type === type)) router.push({ pathname: '/check/[id]', params: { id: 'new', type } });
  }
  if (id === 'watch') (on ? pushToWatchNow() : clearWatch()).catch(() => {});
}

export function featureTitle(id: FeatureId): string {
  return featureInfo(id).title;
}
