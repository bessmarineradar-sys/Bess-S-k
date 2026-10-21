const hullPath =
  "M24 7h16a4 4 0 0 1 4 4v8l8 5 5 18-25 14L7 42l5-18 8-5v-8a4 4 0 0 1 4-4Z";
const windowsPath = "M22 13h7v5h-7zm13 0h7v5h-7z";
const wavesPath =
  "M9 48c4 0 4-4 8-4s4 4 8 4 4-4 8-4 4 4 8 4 4-4 8-4 4 4 8 4";

export function getVesselIconMarkup() {
  return `<svg class="ship-glyph" viewBox="0 0 64 64" aria-hidden="true"><path d="${hullPath}" fill="currentColor"/><path d="${windowsPath}" fill="var(--vessel-icon-cutout, #0b1926)"/><path d="${wavesPath}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="4"/></svg>`;
}

interface VesselIconProps {
  className?: string;
}

export function VesselIcon({ className }: VesselIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 64 64"
    >
      <path d={hullPath} fill="currentColor" />
      <path
        d={windowsPath}
        fill="var(--vessel-icon-cutout, #0b1926)"
      />
      <path
        d={wavesPath}
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="4"
      />
    </svg>
  );
}
