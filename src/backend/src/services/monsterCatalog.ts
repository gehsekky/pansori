// Monster catalog + per-campaign enemy templates (monsters /
// campaign_monsters), mirroring itemCatalog.ts with one twist:
// EnemyTemplate has no id field, so mapping resolution is by DEEP
// EQUALITY. A posted template identical to a catalog definition stores as
// a bare mapping (and keeps tracking the code-canonical entry); anything
// else — campaign rethemes ({...SRD_MONSTERS.skeleton, name: 'Skeleton
// Warrior'}) and bosses — stores its full definition as an override under
// a slug derived from its name.

import type { EnemyTemplate } from '../types.js';
import type { Pool } from 'pg';
import { SRD_MONSTERS } from '../campaignData/srd/index.js';
import { sameDefinition } from './itemCatalog.js';

export interface MonsterCatalogEntry {
  id: string;
  definition: EnemyTemplate;
}

// Slug for a custom template's mapping key, derived from its display name
// ('Skeleton Warrior' → 'skeleton-warrior'). Uniqueness within one PUT is
// enforced with numeric suffixes; collisions across writes are fine — the
// write is replace-all.
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'template';
}

export async function syncMonsterCatalog(pool: Pool): Promise<void> {
  const entries = Object.entries(SRD_MONSTERS);
  for (const [id, def] of entries) {
    await pool.query(
      `INSERT INTO monsters (id, name, cr, definition)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             cr = EXCLUDED.cr,
             definition = EXCLUDED.definition,
             updated_at = NOW()`,
      [id, def.name, def.cr, JSON.stringify(def)]
    );
  }
  console.log(`[monsterCatalog] Synced ${entries.length} catalog monster(s)`);
}

// The full bestiary with catalog ids, ordered for display (CR ascending,
// name within) — feeds the creator UI's badge picker.
export async function getMonsterCatalog(pool: Pool): Promise<MonsterCatalogEntry[]> {
  const { rows } = await pool.query<MonsterCatalogEntry>(
    'SELECT id, definition FROM monsters ORDER BY cr, name'
  );
  return rows;
}

export async function getCampaignEnemyTemplates(
  pool: Pool,
  campaignId: string
): Promise<EnemyTemplate[]> {
  const { rows } = await pool.query<{
    monster_id: string;
    override: EnemyTemplate | null;
    definition: EnemyTemplate | null;
  }>(
    `SELECT cm.monster_id, cm.override, m.definition
       FROM campaign_monsters cm
       LEFT JOIN monsters m ON m.id = cm.monster_id
      WHERE cm.campaign_id = $1
      ORDER BY cm.sort_order, cm.monster_id`,
    [campaignId]
  );
  const out: EnemyTemplate[] = [];
  for (const row of rows) {
    const def = row.override ?? row.definition;
    if (!def) {
      console.warn(
        `[monsterCatalog] ${campaignId}: mapping for "${row.monster_id}" has no catalog row and no override — skipping`
      );
      continue;
    }
    out.push(def);
  }
  return out;
}

// Replace-all write. Each posted template is matched against the catalog
// by deep equality: identical → bare mapping under the catalog id; else →
// override under a name-derived slug (suffixed to stay unique in the list).
export async function putCampaignEnemyTemplates(
  pool: Pool,
  campaignId: string,
  templates: EnemyTemplate[]
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query('SELECT 1 FROM campaigns WHERE id = $1', [campaignId]);
    if (!rowCount) {
      await client.query('ROLLBACK');
      return false;
    }
    const { rows: catalogRows } = await client.query<MonsterCatalogEntry>(
      'SELECT id, definition FROM monsters'
    );

    const usedIds = new Set<string>();
    const uniqueId = (base: string): string => {
      let id = base;
      let n = 2;
      while (usedIds.has(id)) id = `${base}-${n++}`;
      usedIds.add(id);
      return id;
    };

    await client.query('DELETE FROM campaign_monsters WHERE campaign_id = $1', [campaignId]);
    for (let i = 0; i < templates.length; i++) {
      const template = templates[i];
      const catalogMatch = catalogRows.find((c) => sameDefinition(c.definition, template));
      const monsterId = uniqueId(catalogMatch ? catalogMatch.id : slugify(template.name));
      // A bare mapping is only valid when the row's id still points at the
      // catalog row — a suffixed duplicate must carry its own definition.
      const override = catalogMatch && monsterId === catalogMatch.id ? null : template;
      await client.query(
        `INSERT INTO campaign_monsters (campaign_id, monster_id, sort_order, override)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [campaignId, monsterId, i, override === null ? null : JSON.stringify(override)]
      );
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteCampaignEnemyTemplates(
  pool: Pool,
  campaignId: string
): Promise<boolean> {
  const { rowCount } = await pool.query('SELECT 1 FROM campaigns WHERE id = $1', [campaignId]);
  if (!rowCount) return false;
  await pool.query('DELETE FROM campaign_monsters WHERE campaign_id = $1', [campaignId]);
  return true;
}
