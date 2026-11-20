/** Nucleus mark: a ring with an off-centre dot. The cell keeps its core inside. */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="100" height="100" rx="23" fill="var(--accent)" />
      <circle
        cx="50"
        cy="50"
        r="24"
        fill="none"
        stroke="var(--accent-ink)"
        strokeWidth="8"
      />
      <circle cx="56" cy="56" r="8" fill="var(--accent-ink)" />
    </svg>
  );
}

/** Large mark without the tile, for the welcome screen. */
export function Mark({ size = 180 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="50"
        cy="50"
        r="34"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="9"
      />
      <circle cx="58" cy="58" r="11" fill="var(--accent)" />
    </svg>
  );
}
