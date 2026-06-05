import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import AboutModal from './AboutModal';

describe('AboutModal', () => {
  it('renders the project background and the required attributions', () => {
    const { getByText, getByTestId } = render(<AboutModal onClose={vi.fn()} />);
    expect(getByText(/About Pansori/)).toBeTruthy();
    expect(getByText(/traditional Korean musical storytelling/)).toBeTruthy();
    // Each license/attribution the project owes is surfaced.
    expect(getByText(/System Reference Document 5\.2\.1/)).toBeTruthy();
    expect(getByText(/CC BY 4\.0/)).toBeTruthy();
    expect(getByText(/GNU GPL v3\.0/)).toBeTruthy();
    expect(
      getByText(/GitHub/)
        .closest('a')!
        .getAttribute('href')
    ).toBe('https://github.com/gehsekky/pansori');
    expect(getByText(/Game-icons\.net/)).toBeTruthy();
    expect(getByText(/CC BY 3\.0/)).toBeTruthy();
    expect(getByText(/RPG Awesome/)).toBeTruthy();
    expect(getByText(/Phosphor Icons/)).toBeTruthy();
    expect(getByText(/David Baumgart/)).toBeTruthy(); // terrain tile art
    expect(getByText(/Tiny Swords/)).toBeTruthy(); // party sprite
    expect(getByText(/Pixel Frog/)).toBeTruthy();
    // Attribution links open safely in a new tab.
    const srd = getByText(/System Reference Document 5\.2\.1/).closest('a')!;
    expect(srd.getAttribute('target')).toBe('_blank');
    expect(srd.getAttribute('rel')).toContain('noopener');
    expect(getByTestId('about-modal')).toBeTruthy();
  });

  it('closes on Escape via the Dialog shell', () => {
    const onClose = vi.fn();
    const { getByTestId } = render(<AboutModal onClose={onClose} />);
    fireEvent.keyDown(getByTestId('about-modal'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
