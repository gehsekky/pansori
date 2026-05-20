// Thin wrapper around the rpg-awesome CSS icon font.
//
// Usage: <RaIcon name="sword" aria-label="Attack" />
// Renders: <i class="ra ra-sword" aria-label="Attack" />
//
// rpg-awesome ships ~495 fantasy-domain glyphs (weapons, spells, damage
// types, creatures, conditions) that fill gaps Phosphor leaves open. The
// icon library is loaded globally via main.tsx; this component just keeps
// the className convention out of every call site.
//
// License: font under SIL OFL 1.1, CSS under MIT (per the header in
// rpg-awesome/css/rpg-awesome.css). No attribution required at runtime —
// see README Credits.

interface Props {
  name: string;
  // Most consumers should set aria-label so screen readers announce the
  // semantic meaning; the glyph itself is visual.
  'aria-label'?: string;
  // Forwarded to the underlying <i> for sizing/color via CSS variables.
  className?: string;
  // Optional rotation in degrees (rpg-awesome ships ra-rotate-{90,180,270}
  // but exposing arbitrary degrees here is cheap).
  rotate?: number;
  style?: React.CSSProperties;
}

function RaIcon({ name, className, rotate, style, ...rest }: Props) {
  const ariaLabel = rest['aria-label'];
  const composedStyle: React.CSSProperties = {
    ...(rotate ? { transform: `rotate(${rotate}deg)`, display: 'inline-block' } : {}),
    ...style,
  };
  return (
    <i
      className={`ra ra-${name}${className ? ` ${className}` : ''}`}
      style={composedStyle}
      // If no aria-label, hide from assistive tech — the caller is using
      // this purely as visual flavor (e.g. inside a button whose own text
      // carries the semantics).
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    />
  );
}

export default RaIcon;
