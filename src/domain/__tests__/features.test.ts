import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FEATURES,
  featurePatch,
  featuresHere,
  featuresInUse,
  featuresPatch,
  normalizeFeatures,
  normalizeProfile,
  routinesFor,
  suggestedFeatures,
} from '../features';
import { DEFAULT_SETTINGS, type Settings } from '../types';

const none = {
  hasSupplements: false,
  hasMachines: false,
  hasMoodNotes: false,
  healthConnect: false,
  ramadan: false,
  sharing: false,
  following: false,
  watchTile: false,
  celebrate: true,
};

describe('features', () => {
  it('start off for a new install, except rewards', () => {
    const on = Object.entries(DEFAULT_SETTINGS.features).filter(([, v]) => v);
    expect(on.map(([k]) => k)).toEqual(['rewards']);
    expect(DEFAULT_SETTINGS.setupDone).toBe(false);
    expect(DEFAULT_SETTINGS.profile.conditions).toEqual([]);
  });

  it('fill in flags missing from older settings as off', () => {
    expect(normalizeFeatures(undefined)).toEqual(DEFAULT_FEATURES);
    expect(normalizeFeatures({ mood: true }).mood).toBe(true);
    expect(normalizeFeatures({ mood: true }).supplements).toBe(false);
  });

  it('keep everything an existing install already uses', () => {
    const f = featuresInUse({ ...none, hasSupplements: true, healthConnect: true, following: true, celebrate: false });
    expect(f.supplements).toBe(true);
    expect(f.healthData).toBe(true);
    expect(f.caregiving).toBe(true);
    expect(f.rewards).toBe(false);
    expect(f.mood).toBe(false);
  });

  it('suggest checks and machines from conditions', () => {
    expect(suggestedFeatures(['diabetes'])).toEqual(['sugarChecks']);
    expect(suggestedFeatures(['prediabetes', 'highBp']).sort()).toEqual(['bpChecks', 'sugarChecks']);
    expect(suggestedFeatures(['sleepApnea'])).toEqual(['machines']);
    expect(suggestedFeatures(['thyroid'])).toEqual([]);
  });

  it('drop diabetes details when diabetes is not ticked, and unknown conditions', () => {
    const p = normalizeProfile({ conditions: ['highBp', 'bogus' as never, 'highBp'], diabetesType: 'type2', insulin: true });
    expect(p.conditions).toEqual(['highBp']);
    expect(p.diabetesType).toBeNull();
    expect(p.insulin).toBeNull();
  });

  it('stop background work when a feature goes off', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, healthConnect: true, watchTile: true, ramadan: { ...DEFAULT_SETTINGS.ramadan, enabled: true } };
    expect(featurePatch(s, 'healthData', false).healthConnect).toBe(false);
    expect(featurePatch(s, 'watch', false).watchTile).toBe(false);
    expect(featurePatch(s, 'fasting', false).ramadan?.enabled).toBe(false);
    expect(featurePatch(s, 'watch', true).watchTile).toBe(true);
  });

  it('never turn caregiving off underneath an active share', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, features: { ...DEFAULT_FEATURES, caregiving: true }, sync: { ...DEFAULT_SETTINGS.sync, share: true } };
    expect(featuresPatch(s, { ...s.features, caregiving: false }).features?.caregiving).toBe(true);
  });

  it('hide Android-only features where they do not apply', () => {
    expect(featuresHere(true).some((f) => f.id === 'sugarChecks')).toBe(true);
    expect(featuresHere(true).some((f) => f.id === 'bpChecks')).toBe(true);
    expect(featuresHere(false).some((f) => f.id === 'watch')).toBe(false);
  });

  it('make routines from times a day', () => {
    expect(routinesFor(1).map((r) => r.time)).toEqual(['08:00']);
    expect(routinesFor(2).map((r) => r.name)).toEqual(['Morning', 'Evening']);
    expect(routinesFor(4)).toHaveLength(4);
  });
});

describe('features from before 0.16', () => {
  it('switch off what was on even when the stored flag was already off', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, healthConnect: true, watchTile: true, ramadan: { ...DEFAULT_SETTINGS.ramadan, enabled: true } };
    const p = featuresPatch(s, { ...DEFAULT_FEATURES });
    expect(p.healthConnect).toBe(false);
    expect(p.watchTile).toBe(false);
    expect(p.ramadan?.enabled).toBe(false);
  });
});
