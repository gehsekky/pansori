// Monster catalog + per-campaign custom monsters, mirroring itemCatalog.ts.
//
// The catalog is AMBIENT: every campaign automatically gets the full SRD
// bestiary — the engine only ever looks templates up by name (region
// encounter tables, placements), never samples the pool. `monsters` is
// code-canonical, startup-synced from SRD_MONSTERS.
//
// `campaign_custom_monsters` is a campaign's own content: bosses and
// rethemes ({...SRD_MONSTERS.skeleton, name: 'Skeleton Warrior'}). Identity
// is the template NAME (EnemyTemplate has no id field) — a custom sharing a
// catalog monster's name shadows it. The effective bestiary composes as
// DB customs → code campaign entries → full catalog (dedup by name,
// earlier wins). Custom rows are keyed by a name-derived slug.

import type { EnemyTemplate } from '../types.js';
import type { Pool } from 'pg';
import { SRD_MONSTERS } from '../campaignData/srd/index.js';

export interface MonsterCatalogEntry {
  id: string;
  definition: EnemyTemplate;
}

// Mapping key for a custom template ('Skeleton Warrior' → 'skeleton-warrior').
// Uniqueness within one PUT is enforced with numeric suffixes.
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
  // The catalog is code-canonical: prune rows whose id left SRD_MONSTERS
  // (e.g. the Orc, which SRD 5.2.1 carries only as a species — it moved to
  // a campaign-local template). Without this, a removed entry would stay
  // ambient in every campaign forever.
  const { rowCount: pruned } = await pool.query(
    `DELETE FROM monsters WHERE id <> ALL($1::text[])`,
    [entries.map(([id]) => id)]
  );
  console.log(
    `[monsterCatalog] Synced ${entries.length} catalog monster(s)` +
      (pruned ? `, pruned ${pruned} stale` : '')
  );
}

// The full bestiary with catalog ids, ordered for display (CR ascending,
// name within).
export async function getMonsterCatalog(pool: Pool): Promise<MonsterCatalogEntry[]> {
  const { rows } = await pool.query<MonsterCatalogEntry>(
    'SELECT id, definition FROM monsters ORDER BY cr, name'
  );
  return rows;
}

// A campaign's custom monsters in authored order.
export async function getCampaignCustomMonsters(
  pool: Pool,
  campaignId: string
): Promise<EnemyTemplate[]> {
  const { rows } = await pool.query<{ definition: EnemyTemplate }>(
    `SELECT definition
       FROM campaign_custom_monsters
      WHERE campaign_id = $1
      ORDER BY sort_order, monster_id`,
    [campaignId]
  );
  return rows.map((r) => r.definition);
}

// Replace-all write. Rows are keyed by a slug of the template name,
// suffixed for duplicates within the posted list.
export async function putCampaignCustomMonsters(
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
    const usedIds = new Set<string>();
    const uniqueId = (base: string): string => {
      let id = base;
      let n = 2;
      while (usedIds.has(id)) id = `${base}-${n++}`;
      usedIds.add(id);
      return id;
    };
    await client.query('DELETE FROM campaign_custom_monsters WHERE campaign_id = $1', [campaignId]);
    for (let i = 0; i < templates.length; i++) {
      await client.query(
        `INSERT INTO campaign_custom_monsters (campaign_id, monster_id, sort_order, definition)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [campaignId, uniqueId(slugify(templates[i].name)), i, JSON.stringify(templates[i])]
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

export async function deleteCampaignCustomMonsters(
  pool: Pool,
  campaignId: string
): Promise<boolean> {
  const { rowCount } = await pool.query('SELECT 1 FROM campaigns WHERE id = $1', [campaignId]);
  if (!rowCount) return false;
  await pool.query('DELETE FROM campaign_custom_monsters WHERE campaign_id = $1', [campaignId]);
  return true;
}

// Effective bestiary: DB customs → code campaign entries → full catalog,
// deduped by NAME (earlier wins, preserving each source's internal order).
export function composeEnemyTemplates(
  customs: EnemyTemplate[],
  codeTemplates: EnemyTemplate[],
  catalog: EnemyTemplate[]
): EnemyTemplate[] {
  const seen = new Set<string>();
  const out: EnemyTemplate[] = [];
  for (const list of [customs, codeTemplates, catalog]) {
    for (const template of list) {
      if (seen.has(template.name)) continue;
      seen.add(template.name);
      out.push(template);
    }
  }
  return out;
}
