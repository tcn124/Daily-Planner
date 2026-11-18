import type { ReactNode } from 'react';

/*
 * The design's line icons: 10-unit grids, 1.2–1.3 stroke, drawn in the text
 * colour. Shared by both shells so a chevron is the same chevron everywhere.
 */

interface IconProps {
  size?: number;
  strokeWidth?: number;
}

function Svg({ size = 10, strokeWidth = 1.2, children }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export function ChevronLeft(p: IconProps) {
  return <Svg {...p}><path d="M6.5 2L3.5 5l3 3" /></Svg>;
}

export function ChevronRight(p: IconProps) {
  return <Svg {...p}><path d="M3.5 2l3 3-3 3" /></Svg>;
}

export function ChevronDown(p: IconProps) {
  return <Svg {...p}><path d="M2 3.5l3 3 3-3" /></Svg>;
}

export function Plus(p: IconProps) {
  return <Svg {...p}><path d="M5 1v8M1 5h8" /></Svg>;
}

export function Check(p: IconProps) {
  return <Svg {...p}><path d="M2 5.2l2 2 4-4.4" /></Svg>;
}

export function Close({ size = 12, strokeWidth = 1.3 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} aria-hidden="true" focusable="false">
      <path d="M2 2l8 8M10 2l-8 8" />
    </svg>
  );
}
