import { DEFAULT_MARKER_GLYPH, artUrl, markerGlyph, paintedArt } from './art';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The test env defaults VITE_PAINTED_ART='1' (vite.config) so the rest of the
// suite renders painted; here we flip it per-case.
afterEach(() => vi.unstubAllEnvs());

describe('paintedArt', () => {
  it('is true only for an explicit on value', () => {
    vi.stubEnv('VITE_PAINTED_ART', '1');
    expect(paintedArt()).toBe(true);
    vi.stubEnv('VITE_PAINTED_ART', 'true');
    expect(paintedArt()).toBe(true);
    vi.stubEnv('VITE_PAINTED_ART', '');
    expect(paintedArt()).toBe(false);
    vi.stubEnv('VITE_PAINTED_ART', '0');
    expect(paintedArt()).toBe(false);
  });
});

describe('artUrl', () => {
  it('returns the bare path when no base is set', () => {
    vi.stubEnv('VITE_ASSET_BASE_URL', '');
    expect(artUrl('/art/tiles/plains_1.png')).toBe('/art/tiles/plains_1.png');
  });
  it('prefixes a CDN base (trailing slash trimmed)', () => {
    vi.stubEnv('VITE_ASSET_BASE_URL', 'https://cdn.example.com/');
    expect(artUrl('/art/tiles/plains_1.png')).toBe(
      'https://cdn.example.com/art/tiles/plains_1.png'
    );
  });
});

describe('markerGlyph', () => {
  it('maps a known family and defaults the rest', () => {
    expect(markerGlyph('village')).toBe('village');
    expect(markerGlyph('barrow')).toBe('tombstone');
    expect(markerGlyph('nonexistent')).toBe(DEFAULT_MARKER_GLYPH);
    expect(markerGlyph(undefined)).toBe(DEFAULT_MARKER_GLYPH);
  });
});
