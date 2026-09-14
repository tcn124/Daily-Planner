import { BandResizer } from './BandResizer';

interface Props {
  label: string;
  count: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Omitted on the first band, which has nothing above it to resize against. */
  resizer?: {
    index: number;
    bandWeights: [number, number, number];
    onBands: (weights: [number, number, number]) => void;
    onReset: () => void;
  };
}

export function BandHeader({
  label,
  count,
  collapsed,
  onToggleCollapsed,
  resizer,
}: Props) {
  return (
    <div className="bandhead">
      {resizer && (
        <BandResizer
          index={resizer.index}
          bandWeights={resizer.bandWeights}
          onBands={resizer.onBands}
          onReset={resizer.onReset}
        />
      )}
      <button
        type="button"
        className="bandhead__toggle"
        aria-expanded={!collapsed}
        onClick={onToggleCollapsed}
      >
        <span className="bandhead__label">{label}</span>
        <span className="bandhead__count">{count}</span>
        <span className="bandhead__caret" data-collapsed={collapsed} aria-hidden="true">
          ▾
        </span>
      </button>
    </div>
  );
}
