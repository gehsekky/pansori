import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import NarrativeModal from './NarrativeModal';

// Reusable narrative modal — first used for the game-start narration. It
// composes the shared Dialog primitive (focus trap / Escape / backdrop) and
// NarrativeText (token pills), and closes via a single CONTINUE button.

const TEXT = 'Storm light over the marsh.\n\n✦ Quest: First Steps — find the road.';

describe('NarrativeModal', () => {
  it('renders the title and the narrative text', () => {
    render(<NarrativeModal title="Utgard" text={TEXT} onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Utgard')).toBeDefined();
    expect(screen.getByText(/Storm light over the marsh/)).toBeDefined();
    expect(screen.getByText(/Quest: First Steps/)).toBeDefined();
  });

  it('CONTINUE closes the modal', () => {
    const onClose = vi.fn();
    render(<NarrativeModal title="Utgard" text={TEXT} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('narrative-modal-continue'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape closes the modal (Dialog primitive)', () => {
    const onClose = vi.fn();
    render(<NarrativeModal title="Utgard" text={TEXT} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders narrative token markup as pills, not raw {{…}}', () => {
    const { container } = render(
      <NarrativeModal title="Utgard" text="You take {{dmg|3}} damage." onClose={() => {}} />
    );
    expect(container.textContent).not.toMatch(/\{\{dmg/);
    expect(screen.getByText('3')).toBeDefined();
  });

  it('honors a custom continue label', () => {
    render(<NarrativeModal title="Act II" text={TEXT} onClose={() => {}} continueLabel="ONWARD" />);
    expect(screen.getByText('ONWARD')).toBeDefined();
  });
});
