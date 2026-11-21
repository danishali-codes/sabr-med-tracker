import { describeCheck } from './checks';
import { describeMachine } from './machines';
import type { Medication, MedForm } from './types';

/** How one unit of each form is counted. */
export const FORM_UNITS: Record<MedForm, { label: string; one: string; many: string }> = {
  pill: { label: 'Tablet', one: 'tablet', many: 'tablets' },
  capsule: { label: 'Capsule', one: 'capsule', many: 'capsules' },
  liquid: { label: 'Liquid', one: 'ml', many: 'ml' },
  injection: { label: 'Injection', one: 'injection', many: 'injections' },
  drops: { label: 'Drops', one: 'drop', many: 'drops' },
  inhaler: { label: 'Inhaler', one: 'puff', many: 'puffs' },
  spray: { label: 'Spray', one: 'spray', many: 'sprays' },
  patch: { label: 'Patch', one: 'patch', many: 'patches' },
  cream: { label: 'Cream', one: 'application', many: 'applications' },
  sachet: { label: 'Sachet', one: 'sachet', many: 'sachets' },
  other: { label: 'Other', one: 'unit', many: 'units' },
};

export function formatAmount(n: number, fractions = true): string {
  if (Number.isInteger(n)) return String(n);
  if (!fractions) return String(Math.round(n * 100) / 100);
  const whole = Math.floor(n);
  const frac = n - whole;
  const glyph = Math.abs(frac - 0.5) < 1e-9 ? '½' : Math.abs(frac - 0.25) < 1e-9 ? '¼' : Math.abs(frac - 0.75) < 1e-9 ? '¾' : null;
  if (glyph) return whole ? `${whole}${glyph}` : glyph;
  return String(Math.round(n * 100) / 100);
}

export function units(form: MedForm, n: number): string {
  const u = FORM_UNITS[form] ?? FORM_UNITS.other;
  // Measured amounts (ml) read better as decimals; counted ones as ½ tablet.
  return `${formatAmount(n, form !== 'liquid')} ${n > 0 && n <= 1 ? u.one : u.many}`;
}

/** "500 mg · 3 tablets", or "Nightly check-in" for a machine. */
export function describeDose(med: Pick<Medication, 'strength' | 'amount' | 'form'> & Partial<Pick<Medication, 'machine' | 'schedule' | 'check'>>): string {
  if (med.check && med.schedule) return describeCheck({ check: med.check, schedule: med.schedule });
  if (med.machine && med.schedule) return describeMachine({ machine: med.machine, schedule: med.schedule });
  return [med.strength?.trim() || null, units(med.form, med.amount)].filter(Boolean).join(' · ');
}

/** Parses "1.5", "1,5", "½" or "1/2" into a number; null when it isn't a positive amount. */
export function parseAmount(s: string): number | null {
  const t = s.trim().replace(',', '.').replace('½', '.5').replace('¼', '.25').replace('¾', '.75');
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
  const n = frac ? Number(frac[1]) / Number(frac[2]) : Number(t.startsWith('.') ? `0${t}` : t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 1000 : null;
}

/** Units the schedule uses on an average day (as-needed meds count as 0). */
export function unitsPerDay(med: Medication): number {
  const p = med.schedule.pattern;
  const perDay = med.schedule.times.length * med.amount;
  switch (p.kind) {
    case 'daily':
      return perDay;
    case 'weekdays':
      return (perDay * p.days.length) / 7;
    case 'interval':
      return perDay / (p.every * (p.unit === 'week' ? 7 : 1));
    case 'cycle':
      return (perDay * p.onDays) / Math.max(1, p.onDays + p.offDays);
    case 'monthly':
      return perDay / 30.4;
    case 'asNeeded':
      return 0;
  }
}

/** Roughly how many days the current stock lasts, or null when unknown. */
export function daysOfSupply(med: Medication): number | null {
  if (med.stock == null) return null;
  const per = unitsPerDay(med);
  return per > 0 ? Math.floor(med.stock / per) : null;
}

/** True when stock can't cover the next dose or has reached the refill level. */
export function isLowStock(med: Medication): boolean {
  if (med.stock == null) return false;
  return med.stock < med.amount || (med.refillAt != null && med.stock <= med.refillAt);
}

/**
 * Brings meds saved by older versions up to date: v0.1 had a free-text `dose`
 * and a `perDose` count instead of `strength` and `amount`.
 */
export function normalizeMed(raw: Medication & { dose?: string; perDose?: number }): Medication {
  const { dose, perDose, ...rest } = raw;
  return {
    ...rest,
    strength: raw.strength ?? dose ?? '',
    amount: raw.amount ?? (perDose && perDose > 0 ? perDose : 1),
    generic: raw.generic ?? null,
    rxcui: raw.rxcui ?? null,
  };
}
