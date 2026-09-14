import { useState } from 'react';
import { subjectAccent } from '../lib/color';

interface Props {
  hue: number | null;
  onChange: (hue: number | null) => void;
}

/**
 * Hues chosen so `subjectAccent` reproduces the eight dots in the design's
 * edit-planner panel. The last is `null` — the neutral grey subject.
 */
export const SWATCH_HUES: (number | null)[] = [0, 29, 51, 139, 182, 225, 266, null];

/**
 * The design offers a fixed row of swatches, but subjects store an arbitrary
 * hue (0–359). "Custom" reveals the full hue bar so no existing subject's
 * colour becomes unreachable.
 */
export function SwatchPicker({ hue, onChange }: Props) {
  const isPreset = SWATCH_HUES.includes(hue);
  const [custom, setCustom] = useState(!isPreset);

  return (
    <div className="swatches">
      <div className="swatches__row">
        {SWATCH_HUES.map((h) => (
          <button
            key={h ?? 'none'}
            type="button"
            className="swatches__dot"
            data-selected={hue === h}
            style={{ background: subjectAccent(h) }}
            aria-label={h === null ? 'Neutral grey' : `Hue ${h}`}
            aria-pressed={hue === h}
            onClick={() => {
              onChange(h);
              setCustom(false);
            }}
          />
        ))}
        <button
          type="button"
          className="swatches__custom"
          data-selected={custom}
          aria-pressed={custom}
          onClick={() => setCustom((c) => !c)}
        >
          Custom
        </button>
      </div>

      {custom && (
        <input
          type="range"
          className="swatches__bar"
          min={0}
          max={359}
          value={hue ?? 210}
          aria-label="Subject hue"
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )}
    </div>
  );
}
