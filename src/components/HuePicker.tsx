import { subjectDesc, subjectFill, subjectLabel } from '../lib/color';

interface Props {
  hue: number | null;
  onChange: (hue: number) => void;
  /** Shows a miniature of the real card so the choice is previewed in context. */
  showPreview?: boolean;
}

/**
 * The only colour control in the app: a hue bar. The card fill, label tone and
 * description tone are all derived from the chosen hue.
 */
export function HuePicker({ hue, onChange, showPreview = true }: Props) {
  return (
    <div className="hue-picker">
      <input
        type="range"
        className="hue-picker__bar"
        min={0}
        max={359}
        value={hue ?? 210}
        aria-label="Subject hue"
        onChange={(e) => onChange(Number(e.target.value))}
        onClick={(e) => e.stopPropagation()}
      />
      {showPreview && (
        <span
          className="hue-picker__preview"
          style={{ background: subjectFill(hue) }}
          aria-hidden="true"
        >
          <span
            className="hue-picker__bar-mark"
            style={{ background: subjectLabel(hue) }}
          />
          <span
            className="hue-picker__line hue-picker__line--label"
            style={{ background: subjectLabel(hue) }}
          />
          <span
            className="hue-picker__line hue-picker__line--desc"
            style={{ background: subjectDesc(hue) }}
          />
        </span>
      )}
    </div>
  );
}
