-- Campaign rename support. The boot-time registry sync propagates code
-- renames (world_name) into campaigns.name for the built-ins; a rename
-- made through the API must survive that, so it sets name_overridden and
-- the sync skips overridden rows.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS name_overridden BOOLEAN NOT NULL DEFAULT FALSE;

-- displayNoun is no longer an editable section — the new-game picker now
-- shows campaigns.name (which the rename flow edits) instead of the old
-- UI-noun. Clear any stored section values; the Context field itself
-- lives on in code (inert) until the type is next reworked.
UPDATE campaigns SET data = data - 'displayNoun' WHERE data ? 'displayNoun';
