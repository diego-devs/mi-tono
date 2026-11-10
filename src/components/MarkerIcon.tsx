interface Props {
  kind: 'a' | 'b';
  size?: number;
}

/** Marcador (bookmark) con la letra A (inicio) o B (final) dentro; B va relleno para distinguirlo. */
export function MarkerIcon({ kind, size = 22 }: Props) {
  const filled = kind === 'b';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M6 2.5h12a1 1 0 0 1 1 1V21l-7-4.5L5 21V3.5a1 1 0 0 1 1-1z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <text
        x="12"
        y="12.5"
        textAnchor="middle"
        fontSize="8.5"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
        fill={filled ? '#1a1203' : 'currentColor'}
      >
        {kind === 'a' ? 'A' : 'B'}
      </text>
    </svg>
  );
}
