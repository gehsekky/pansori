import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import HoverTooltip from './HoverTooltip';

// Reusable hover tooltip — portals to <body>, opens on hover AND focus,
// closes on leave/blur. delayMs={0} keeps the specs synchronous-ish
// (the timer still fires on the macrotask queue → findBy*).

function renderTip() {
  return render(
    <HoverTooltip content={<div>Tip body</div>} delayMs={0}>
      <button>anchor</button>
    </HoverTooltip>
  );
}

describe('HoverTooltip', () => {
  it('is closed until hovered, then shows the content in a role=tooltip portal', async () => {
    renderTip();
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(screen.getByText('anchor'));
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain('Tip body');
    // Portaled to body — not a child of the anchor's wrapper.
    expect(tip.parentElement).toBe(document.body);
  });

  it('closes on mouse leave', async () => {
    renderTip();
    const anchor = screen.getByText('anchor');
    fireEvent.mouseEnter(anchor);
    await screen.findByRole('tooltip');
    fireEvent.mouseLeave(anchor);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens on keyboard focus and closes on blur (a11y parity with hover)', async () => {
    renderTip();
    const anchor = screen.getByText('anchor');
    fireEvent.focus(anchor);
    await screen.findByRole('tooltip');
    fireEvent.blur(anchor);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('wires aria-describedby from the anchor wrapper to the tooltip id', async () => {
    renderTip();
    const anchor = screen.getByText('anchor');
    fireEvent.mouseEnter(anchor);
    const tip = await screen.findByRole('tooltip');
    expect(anchor.parentElement?.getAttribute('aria-describedby')).toBe(tip.id);
  });
});
