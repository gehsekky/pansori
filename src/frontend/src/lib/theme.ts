import type { Theme } from '../types.ts';

// Apply a context's theme by writing CSS custom properties on
// document.documentElement. Lives in its own module so App.tsx can
// export only its component — Fast Refresh's `only-export-components`
// rule trips when a component file also exports utilities.
export function applyTheme(theme: Theme): void {
  const r = document.documentElement.style;
  r.setProperty('--t-bg', theme.pageBg);
  r.setProperty('--t-card', theme.cardBg);
  r.setProperty('--t-font', theme.font);
  r.setProperty('--t-primary', theme.primary);
  r.setProperty('--t-mid', theme.mid);
  r.setProperty('--t-dim', theme.dim);
  r.setProperty('--t-dim-dark', theme.dimDark);
  r.setProperty('--t-border', theme.border);
  r.setProperty('--t-separator', theme.separator);
  r.setProperty('--t-item', theme.itemColor);
  r.setProperty('--t-hp-high', theme.hpHigh);
  r.setProperty('--t-hp-mid', theme.hpMid);
  r.setProperty('--t-hp-low', theme.hpLow);
}
