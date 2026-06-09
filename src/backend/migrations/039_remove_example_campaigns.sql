-- Remove the formerly-seeded example campaigns from any database that still
-- carries them (dev/prod DBs seeded by the original migration 032). Fresh
-- databases never seeded them, so this is a no-op there.
--
-- Deleting the campaigns row cascades to all per-campaign content via the
-- `... REFERENCES campaigns(id) ON DELETE CASCADE` foreign keys (regions, towns,
-- rooms, region_sites, town_venues, custom items/monsters, narratives, members,
-- and the resolved item/monster catalogs). Idempotent: a second apply finds
-- nothing to delete.
--
-- Note: campaign_states (user playthrough saves) are deliberately left alone —
-- they carry campaign_id as a plain string (no FK), are user data, and resolve
-- gracefully to "campaign no longer exists" in the UI.

DELETE FROM campaigns WHERE id IN ('malgovia', 'sandbox');
