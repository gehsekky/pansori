// Thin wrapper around the self-hosted game-icons.net icon font (gameicons-font).
//
// Usage: <GameIcon name="broadsword" aria-label="Attack" />
// Renders: <i class="game-icon game-icon-broadsword" aria-label="Attack" />
//
// ~4100 fantasy/RPG glyphs (weapons, armor, potions, spells, creatures,
// conditions) — a much larger set than rpg-awesome, used alongside it. The font
// is vendored under src/vendor/game-icons and loaded globally via main.tsx;
// this component just keeps the className convention out of every call site.
// Mirrors RaIcon's API exactly.
//
// Icons: https://game-icons.net (CC BY 3.0 — attribution in LEGAL.md).
// Font build: https://github.com/seiyria/gameicons-font (vendored dist/).

interface Props {
  // The game-icons name in kebab-case, e.g. 'broadsword', 'health-potion'.
  // Renders `game-icon game-icon-<name>`.
  name: string;
  // Most consumers should set aria-label so screen readers announce the
  // semantic meaning; the glyph itself is visual.
  'aria-label'?: string;
  // Forwarded to the underlying <i> for sizing/color via CSS variables.
  className?: string;
  // Optional rotation in degrees.
  rotate?: number;
  style?: React.CSSProperties;
}

function GameIcon({ name, className, rotate, style, ...rest }: Props) {
  const ariaLabel = rest['aria-label'];
  const composedStyle: React.CSSProperties = {
    ...(rotate ? { transform: `rotate(${rotate}deg)`, display: 'inline-block' } : {}),
    ...style,
  };
  return (
    <i
      className={`game-icon game-icon-${name}${className ? ` ${className}` : ''}`}
      style={composedStyle}
      // If no aria-label, hide from assistive tech — the caller is using this
      // purely as visual flavor (e.g. inside a button whose own text carries
      // the semantics).
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    />
  );
}

export default GameIcon;
