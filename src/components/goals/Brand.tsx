/* eslint-disable i18next/no-literal-string -- the "anans" + "ı" wordmark glyphs ARE the brand identity (visual asset, not user copy); never translated */
// Brand assets — the mark + wordmark + their lockup. Inline so the SVG
// inherits currentColor and stays crisp at any pixel size.

type MarkProps = {
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
};

// 8 spokes + 2 nested octagons + a clay drop at the center. The drop is
// the brand's signature element — it appears here AND on the wordmark's
// dotless 'i'.
export function AnansiMark({ size = 22, strokeWidth = 2, className, style }: MarkProps) {
  return (
    <svg
      className={["anansi-mark", className].filter(Boolean).join(" ")}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={style}
      aria-hidden
    >
      <g className="am-web" strokeWidth={strokeWidth}>
        <line x1="50" y1="50" x2="50" y2="10" />
        <line x1="50" y1="50" x2="78.3" y2="21.7" />
        <line x1="50" y1="50" x2="90" y2="50" />
        <line x1="50" y1="50" x2="78.3" y2="78.3" />
        <line x1="50" y1="50" x2="50" y2="90" />
        <line x1="50" y1="50" x2="21.7" y2="78.3" />
        <line x1="50" y1="50" x2="10" y2="50" />
        <line x1="50" y1="50" x2="21.7" y2="21.7" />
        <polygon points="50,10 78.3,21.7 90,50 78.3,78.3 50,90 21.7,78.3 10,50 21.7,21.7" />
        <polygon points="50,26 67,33 74,50 67,67 50,74 33,67 26,50 33,33" />
      </g>
      <circle className="am-drop" cx="50" cy="50" r="4.2" />
    </svg>
  );
}

// Lowercase italic "anansi" in Cormorant Garamond. The last letter is a
// dotless 'ı' (U+0131) so the font doesn't render its own tittle on top
// of our absolutely-positioned clay drop.
export function Wordmark({
  size = 22,
  withDrop = true,
  className,
  style,
}: {
  size?: number;
  withDrop?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={["wordmark", size < 18 ? "wm-sm" : "", className].filter(Boolean).join(" ")}
      style={{ fontSize: size, ...style }}
    >
      <span className="wm-text">
        anans
        <span className="wm-i">ı{withDrop && <span className="wm-drop" />}</span>
      </span>
    </span>
  );
}

// Full lockup — the mark + wordmark with a 12px gap. The wordmark
// renders one size up from the mark to balance visually.
export function BrandLockup({
  size = 22,
  className,
  style,
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={["brand-lockup", className].filter(Boolean).join(" ")} style={style}>
      <span className="brand-mark">
        <AnansiMark size={size} />
      </span>
      <Wordmark size={size + 2} />
    </span>
  );
}
