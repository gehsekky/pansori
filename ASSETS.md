# Art assets — the free tier and the painted overlay

pansori renders in two tiers. The **free tier** uses only redistributable art
(the game-icons.net font — CC BY 3.0 — for glyphs, plus per-terrain color tints)
and is what a fresh clone runs by default. The **painted tier** layers on the
licensed raster packs for the richer look.

## Free tier (default — no setup)

With no env set, every map/inventory surface falls back to a glyph + color
rendering and is fully playable:

- **Overland/combat terrain** → the cell's terrain tint (`lib/terrainStyle.ts`)
  plus a game-icons glyph for features/impassables.
- **Site & town markers** → a game-icons glyph per location family (`lib/art.ts`
  `MARKER_GLYPH`).
- **Party & NPC tokens** → game-icons glyphs.
- **Inventory icons** → a game-icons glyph per item bucket (`lib/itemIcons.tsx`).

Floors (CC0 — Screaming Brain Studios + original procgen) and per-campaign room
art render in both tiers.

## Painted tier (licensed overlay)

The painted packs live **outside the public repo** (separately licensed — see
`LEGAL.md`): Baumgart terrain/markers/arms, Vivid Motion icons, Tiny Swords
sprites, under `src/frontend/public/art/{tiles,markers,icons,sprites}`. To run
the painted tier you must have those files, then:

- `VITE_PAINTED_ART=1` — enable the painted tier.
- `VITE_ASSET_BASE_URL` *(optional)* — prefix painted URLs (e.g. a CDN);
  default is same-origin `/art`.

Vite inlines `import.meta.env` at build time, so:

- **Dev:** put `VITE_PAINTED_ART=1` in your `.env` (gitignored); the dev
  `docker-compose` frontend passes it through. Unset ⇒ free tier. `npm run dev`
  auto-runs `sync-assets` (via `predev`), so a sibling `../pansori-assets`
  checkout is overlaid automatically; run `npm run sync-assets` manually otherwise.
- **Production:** the image bakes the tier at build — pass
  `--build-arg VITE_PAINTED_ART=1` (and bundle the painted overlay into the
  image, or set `VITE_ASSET_BASE_URL` to a CDN) in your build/CI. The public
  Dockerfile defaults to the free tier.

## Adding the overlay

Drop the licensed packs into `src/frontend/public/art/{tiles,markers,icons,
sprites}` (matching the file names in each folder's `CREDITS.txt`), set
`VITE_PAINTED_ART=1`, and rebuild. Nothing else is required — the resolver in
`src/frontend/src/lib/art.ts` routes every painted URL through the tier flag and
the optional base prefix.
