import { MAX_DAYS, MIN_DAYS } from '../store/defaults';

interface Props {
  value: number;
  onChange: (days: number) => void;
}

/** `[−] 7 days [+]` — the one control for how many day columns the week shows. */
export function DaysStepper({ value, onChange }: Props) {
  return (
    <div className="stepper" role="group" aria-label="Days shown">
      <button
        type="button"
        className="stepper__btn"
        aria-label="Show one fewer day"
        disabled={value <= MIN_DAYS}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <span className="stepper__value">
        {value} day{value === 1 ? '' : 's'}
      </span>
      <button
        type="button"
        className="stepper__btn"
        aria-label="Show one more day"
        disabled={value >= MAX_DAYS}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}
