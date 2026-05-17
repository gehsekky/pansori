import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect } from 'vitest';

import RoomArtPanel from './RoomArtPanel';
import { mockCtx } from './test-fixtures';

describe('RoomArtPanel', () => {
  it('renders an img element when roomId is set', () => {
    render(<RoomArtPanel roomId="room-1" ctx={mockCtx} />);
    const img = screen.getByRole('img');
    expect(img).toBeTruthy();
  });

  it('img src starts with the correct art path', () => {
    render(<RoomArtPanel roomId="room-1" ctx={mockCtx} />);
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.src).toContain('/art/scifi-terror/room-1.');
  });

  it('img has pixelated imageRendering style', () => {
    render(<RoomArtPanel roomId="room-1" ctx={mockCtx} />);
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.style.imageRendering).toBe('pixelated');
  });

  it('renders null after all image extensions fail when no ASCII art is defined', () => {
    const { container } = render(<RoomArtPanel roomId={null} ctx={mockCtx} />);
    // Exhaust all 4 extension probes
    for (let i = 0; i < 4; i++) {
      const img = container.querySelector('img');
      if (img) fireEvent.error(img);
    }
    expect(container.firstChild).toBeNull();
  });

  it('falls back to ASCII art after all image extensions fail', () => {
    const ctxWithArt = { ...mockCtx, art: { 'room-1': 'ASCII_ART_HERE' } };
    render(<RoomArtPanel roomId="room-1" ctx={ctxWithArt} />);

    // Trigger error for all 4 extensions (webp, png, jpg, jpeg)
    for (let i = 0; i < 4; i++) {
      const img = screen.queryByRole('img');
      if (img) fireEvent.error(img);
    }

    expect(screen.getByText('ASCII_ART_HERE')).toBeTruthy();
  });

  it('renders null when all extensions fail and no ASCII art is defined', () => {
    render(<RoomArtPanel roomId="room-1" ctx={mockCtx} />);

    for (let i = 0; i < 4; i++) {
      const img = screen.queryByRole('img');
      if (img) fireEvent.error(img);
    }

    const { container } = render(<RoomArtPanel roomId="room-1" ctx={mockCtx} />);
    // After all errors, no img and no pre
    for (let i = 0; i < 4; i++) {
      const img = container.querySelector('img');
      if (img) fireEvent.error(img);
    }
    expect(container.firstChild).toBeNull();
  });
});
