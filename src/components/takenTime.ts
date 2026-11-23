import { setTakenAt } from '../actions';
import { formatTime, timeFromDate, type DateKey, type TimeOfDay } from '../domain/dates';
import { takenAtFor } from '../domain/sets';
import { pickTime } from './Pickers';
import { popup } from './Popup';

type Dose = { slot: string; medId: string; date: DateKey; time: TimeOfDay };

/**
 * Asks when these doses were really taken and saves it: for a dose you took but forgot to
 * tick, or one ticked later than you took it. Starts at `initial` (the logged time or the dose time).
 */
export async function askTakenTime(doses: Dose[], initial?: Date | null): Promise<boolean> {
  if (doses.length === 0) return false;
  const first = doses[0];
  const picked = await pickTime(initial ? timeFromDate(initial) : first.time);
  if (!picked) return false;
  const at = takenAtFor(first, picked, new Date());
  if (!at) {
    popup('That time is still to come', `Pick a time before now. For a dose you are about to take, tap it when you take it.`);
    return false;
  }
  try {
    await setTakenAt(doses, at);
  } catch {
    popup('Not saved', 'Please try again.');
    return false;
  }
  return true;
}

export const takenAtLabel = (t: TimeOfDay) => `Taken at ${formatTime(t)}`;
