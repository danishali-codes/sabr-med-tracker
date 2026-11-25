import { Redirect } from 'expo-router';

/**
 * Health data moved: the switch and what Sabr can read are in Settings, Health data, and the
 * data itself is on the Health tab. Old links (and Health Connect's "why Sabr reads this"
 * screen, which opens medtracker://health) land on the settings page.
 */
export default function HealthRedirect() {
  return <Redirect href="/settings/health" />;
}
