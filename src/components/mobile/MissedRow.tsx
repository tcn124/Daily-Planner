import { usePlanner } from '../../store/plannerStore';
import { missedItems } from '../../lib/missed';
import { todayISO } from '../../lib/dates';
import { ChevronRight } from '../icons';
import { useSheets } from './sheets';

/**
 * One tappable row under the Week and List headers when anything is overdue:
 * a count, the word, and the oldest title (frames 4a–4d). It replaces the old
 * badge-plus-toggle row, and opens the Missed sheet rather than switching tab.
 */
export function MissedRow() {
  const { state } = usePlanner();
  const { openMissed } = useSheets();
  const missed = missedItems(state.items, todayISO());
  if (missed.length === 0) return null;

  return (
    <button type="button" className="m-missedbar" onClick={openMissed}>
      <span className="m-missedbar__count">{missed.length}</span>
      <span className="m-missedbar__label">Missed</span>
      <span className="m-missedbar__first">{missed[0].description || 'Untitled'}</span>
      <ChevronRight strokeWidth={1.3} />
    </button>
  );
}
