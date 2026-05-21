import type { CampaignMeta, Faction, GameState, Seed } from '../types.ts';
import { formatClassLabel } from '../lib/characterFmt.ts';
import styles from '../styles.module.css';
import { useState } from 'react';

interface Props {
  history: Array<{ content: string; [key: string]: unknown }>;
  // Optional metadata for the copy-to-clipboard header. The on-screen
  // panel still renders the same reverse-chronological list of last 20
  // assistant turns; the copy export covers the full log + this header.
  worldName?: string;
  state?: GameState;
  seed?: Seed;
  // Campaign-meta enables quest titles + faction names + threshold
  // labels in the export. Without it the snapshot falls back to raw
  // questId / factionId so the log still works in non-campaign sessions.
  campaignMeta?: CampaignMeta | null;
}

// Reverse-chronological adventure narrative — pulls every other entry from the
// `history` stream (assistant/user are interleaved) and renders the last 20.
// A "Copy log" button at the top serializes the FULL chronological log
// (oldest first) to the clipboard with a rich state-snapshot header —
// formatted for pasting into a chat with the engine's author for analysis.
//
// The copy export deliberately includes more state than the on-screen
// panel — round counter, world day, active character, location id,
// per-PC conditions + concentrating_on (with rounds_left), death saves,
// key class resources, position, equipped gear; per-enemy HP/AC/
// conditions/position; quest progress with step state; faction reputation
// with attitudes; grid features (obstacles + difficult terrain) in
// combat. These fields have been repeatedly needed to debug recent
// issues (Divine Spark HP, Bless-flipped 0-damage, flanking adjacency,
// concentration duration, stale NPC choices after travel, hostile-in-room
// egress, etc.).

function factionAttitudeLabel(rep: number, faction: Faction): string {
  const t = faction.thresholds;
  if (rep >= t.exalted) return 'exalted';
  if (rep >= t.friendly) return 'friendly';
  if (rep >= t.neutral) return 'neutral';
  if (rep >= t.unfriendly) return 'unfriendly';
  return 'hostile';
}

function AdventureLogPanel({ history, worldName, state, seed, campaignMeta }: Props) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  // The interleaved history stream:
  //   [user_0, assistant_0, user_1, assistant_1, ...]
  // Odd indices are engine output (used for the on-screen panel).
  // Both sides are interleaved in the copy export so the reader can
  // see "user clicked X → engine said Y" without flipping between
  // panels.
  const assistantEntries = history.filter((_, i) => i % 2 === 1);

  function partySnapshot(): string[] {
    if (!state?.characters?.length) return [];
    const lines: string[] = ['Party:'];
    for (const c of state.characters) {
      const classLabel = formatClassLabel(c.character_class, c.subclass);
      const head = `  ${c.name} (${classLabel} L${c.level}) HP ${c.hp}/${c.max_hp}  AC ${c.ac}  STR ${c.str} DEX ${c.dex} CON ${c.con}`;
      lines.push(head);
      // Conditions + sources
      const conds = c.conditions ?? [];
      if (conds.length > 0) {
        const condText = conds
          .map((cond) => {
            const src = c.condition_sources?.[cond];
            return src ? `${cond} (by ${src})` : cond;
          })
          .join(', ');
        lines.push(`    Conditions: ${condText}`);
      }
      // Exhaustion — surfaced separately because it stacks numerically
      // (0 = none, 6 = death) rather than as a binary condition.
      if ((c.exhaustion_level ?? 0) > 0) {
        lines.push(`    Exhaustion: level ${c.exhaustion_level}`);
      }
      // Concentration
      if (c.concentrating_on?.spellId) {
        const rl = c.concentrating_on.rounds_left;
        lines.push(
          `    Concentrating: ${c.concentrating_on.spellId}${rl != null ? ` (rounds_left: ${rl})` : ''}`
        );
      }
      // Death saves — only show when in play
      const ds = c.death_saves;
      if (ds && (ds.successes > 0 || ds.failures > 0)) {
        lines.push(`    Death Saves: ${ds.successes}/3 successes, ${ds.failures}/3 failures`);
      }
      if (c.dead) lines.push('    DEAD');
      // Equipped
      const eq: string[] = [];
      if (c.equipped_weapon) {
        const w = c.inventory?.find((i) => i.instance_id === c.equipped_weapon);
        if (w) eq.push(`weapon: ${w.name}`);
      }
      if (c.equipped_armor) {
        const a = c.inventory?.find((i) => i.instance_id === c.equipped_armor);
        if (a) eq.push(`armor: ${a.name}`);
      }
      if (c.equipped_shield) {
        const s = c.inventory?.find((i) => i.instance_id === c.equipped_shield);
        if (s) eq.push(`shield: ${s.name}`);
      }
      if (eq.length > 0) lines.push(`    Equipped: ${eq.join(', ')}`);
      // Class resources (non-zero only)
      const resources = Object.entries(c.class_resource_uses ?? {})
        .filter(([, v]) => v !== 0)
        .map(([k, v]) => `${k}=${v}`);
      if (resources.length > 0) lines.push(`    Resources: ${resources.join(', ')}`);
      // Spell slots used (non-zero only)
      const slotsUsed = Object.entries(c.spell_slots_used ?? {})
        .filter(([, v]) => v > 0)
        .map(([lvl, used]) => `L${lvl}:${used}/${c.spell_slots_max?.[Number(lvl)] ?? 0}`);
      if (slotsUsed.length > 0) lines.push(`    Slots used: ${slotsUsed.join(', ')}`);
      // Position (when on grid)
      const ent = state.entities?.find((e) => e.id === c.id);
      if (ent) lines.push(`    Position: (${ent.pos.x},${ent.pos.y})`);
    }
    return lines;
  }

  function enemySnapshot(): string[] {
    if (!state?.entities || !seed?.enemies) return [];
    const livingEnemies = state.entities.filter((e) => e.isEnemy && e.hp > 0);
    if (livingEnemies.length === 0) return [];
    const lines: string[] = ['Active enemies:'];
    for (const e of livingEnemies) {
      // Find the seed enemy for name + base AC
      let seedEnemy: { name: string; ac?: number; maxHp?: number } | undefined;
      for (const list of Object.values(seed.enemies ?? {})) {
        const found = (
          list as Array<{ id: string; name: string; ac?: number; maxHp?: number }>
        ).find((x) => x.id === e.id);
        if (found) {
          seedEnemy = found;
          break;
        }
      }
      const name = seedEnemy?.name ?? e.id;
      const ac = e.ac ?? seedEnemy?.ac ?? '?';
      const max = e.maxHp ?? seedEnemy?.maxHp ?? '?';
      const conds = e.conditions ?? [];
      const condText = conds.length > 0 ? `  Conditions: ${conds.join(', ')}` : '';
      lines.push(`  ${name} (HP ${e.hp}/${max}, AC ${ac}) at (${e.pos.x},${e.pos.y})${condText}`);
    }
    return lines;
  }

  function initiativeSnapshot(): string[] {
    if (!state?.combat_active || !state.initiative_order?.length) return [];
    const idx = state.initiative_idx ?? 0;
    const order = state.initiative_order.map((entry, i) => {
      const marker = i === idx ? '▶ ' : '  ';
      // Resolve display name from characters or enemy seed
      let name = entry.id;
      if (!entry.is_enemy) {
        const ch = state.characters.find((c) => c.id === entry.id);
        if (ch) name = ch.name;
      } else if (seed?.enemies) {
        for (const list of Object.values(seed.enemies ?? {})) {
          const found = (list as Array<{ id: string; name: string }>).find(
            (x) => x.id === entry.id
          );
          if (found) {
            name = found.name;
            break;
          }
        }
      }
      return `${marker}${name}(${entry.roll})`;
    });
    return ['Initiative:', ...order.map((s) => `  ${s}`)];
  }

  // Quest state snapshot — surfaces quest_progress with human-readable
  // step state. Without campaignMeta, falls back to questId + step ids.
  function questSnapshot(): string[] {
    const progress = state?.quest_progress ?? [];
    if (progress.length === 0) return [];
    const lines: string[] = ['Quests:'];
    for (const qp of progress) {
      const def = campaignMeta?.quests?.find((q) => q.id === qp.questId);
      const title = def?.title ?? qp.questId;
      const stepCount = def?.steps?.length ?? 0;
      const doneCount = qp.completedSteps.length;
      const stepSummary = stepCount > 0 ? `[${doneCount}/${stepCount} steps]` : '';
      lines.push(`  ${title} — ${qp.status} ${stepSummary}`);
      // List step status with a ✓ / · marker so the reader can pinpoint
      // which step a quest is hung on.
      if (def?.steps?.length) {
        for (const step of def.steps) {
          const marker = qp.completedSteps.includes(step.id) ? '✓' : '·';
          lines.push(`      ${marker} ${step.id} — ${step.desc}`);
        }
      }
    }
    return lines;
  }

  // Faction reputation snapshot — numeric rep + threshold-classified
  // attitude when campaignMeta provides the thresholds. Without meta,
  // shows raw values only.
  function factionSnapshot(): string[] {
    const rep = state?.faction_rep ?? {};
    const entries = Object.entries(rep);
    if (entries.length === 0) return [];
    const lines: string[] = ['Faction reputation:'];
    for (const [factionId, score] of entries) {
      const def = campaignMeta?.factions?.find((f) => f.id === factionId);
      const name = def?.name ?? factionId;
      const attitude = def ? ` (${factionAttitudeLabel(score, def)})` : '';
      const sign = score >= 0 ? '+' : '';
      lines.push(`  ${name}  ${sign}${score}${attitude}`);
    }
    return lines;
  }

  // Grid features snapshot — static obstacles + difficult terrain on the
  // current room. Only emits in combat (when the player can see/interact
  // with them) and when something exists on the room.
  function gridFeaturesSnapshot(): string[] {
    if (!state?.combat_active || !state.current_room) return [];
    const room = seed?.rooms?.find((r) => r.id === state.current_room);
    if (!room) return [];
    const obstacles = room.obstacles ?? [];
    const difficult = room.difficultTerrain ?? [];
    if (obstacles.length === 0 && difficult.length === 0) return [];
    const lines: string[] = [`Grid features (${state.current_room}):`];
    if (obstacles.length > 0) {
      const cells = obstacles.map((p) => `(${p.x},${p.y})`).join(', ');
      lines.push(`  Obstacles: ${cells}`);
    }
    if (difficult.length > 0) {
      const cells = difficult.map((p) => `(${p.x},${p.y})`).join(', ');
      lines.push(`  Difficult terrain: ${cells}`);
    }
    return lines;
  }

  function buildCopyText(): string {
    const sections: string[][] = [];
    // Top header — campaign, location-pointer triple, world day, lead
    // PC, room, combat status, round counter.
    const header = ['=== Pansori Adventure Log ==='];
    if (worldName) header.push(`Campaign: ${worldName}`);
    if (state?.current_location_id) header.push(`Location: ${state.current_location_id}`);
    if (state?.current_district_id) header.push(`District: ${state.current_district_id}`);
    if (state?.world_day != null) header.push(`World day: ${state.world_day}`);
    const activeChar = state?.characters?.find((c) => c.id === state.active_character_id);
    if (activeChar) header.push(`Active: ${activeChar.name} (lead)`);
    if (state?.round != null) header.push(`Round: ${state.round}`);
    if (state?.current_room) header.push(`Current room: ${state.current_room}`);
    if (state?.combat_active != null) {
      header.push(`In combat: ${state.combat_active ? 'yes' : 'no'}`);
    }
    sections.push(header);
    // Initiative (combat only)
    const init = initiativeSnapshot();
    if (init.length) sections.push(init);
    // Party
    const party = partySnapshot();
    if (party.length) sections.push(party);
    // Enemies
    const enemies = enemySnapshot();
    if (enemies.length) sections.push(enemies);
    // Grid features (combat only)
    const gridFeatures = gridFeaturesSnapshot();
    if (gridFeatures.length) sections.push(gridFeatures);
    // Quests
    const quests = questSnapshot();
    if (quests.length) sections.push(quests);
    // Factions
    const factions = factionSnapshot();
    if (factions.length) sections.push(factions);
    // Per-turn log — interleave user click + engine response so the
    // reader can correlate input → outcome without flipping panels.
    const turnLines: string[] = [];
    const pairs = Math.max(Math.ceil(history.length / 2), 0);
    for (let i = 0; i < pairs; i++) {
      const userIdx = i * 2;
      const asstIdx = i * 2 + 1;
      const user = history[userIdx];
      const asst = history[asstIdx];
      turnLines.push(`--- Turn ${i + 1} ---`);
      if (user) turnLines.push(`USER: ${user.content}`);
      if (asst) turnLines.push(`ENGINE: ${asst.content}`);
    }
    // Join sections with blank-line separators
    return [...sections.map((s) => s.join('\n')), '', turnLines.join('\n\n')].join('\n');
  }

  async function handleCopy() {
    const text = buildCopyText();
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 1500);
    } catch {
      setCopyStatus('error');
      setTimeout(() => setCopyStatus('idle'), 2500);
    }
  }

  if (history.length === 0) {
    return <p className={styles.campaignEmpty}>No actions taken yet.</p>;
  }
  const entries = [...assistantEntries].reverse().slice(0, 20);
  const label =
    copyStatus === 'copied' ? 'Copied!' : copyStatus === 'error' ? 'Copy failed' : 'Copy log';
  return (
    <>
      <div className={styles.adventureLogToolbar}>
        <button
          type="button"
          className={styles.adventureLogCopyBtn}
          onClick={handleCopy}
          aria-label="Copy full adventure log to clipboard"
          data-testid="adventure-log-copy-btn"
        >
          {label}
        </button>
      </div>
      {entries.map((m, i) => (
        <p key={i} className={styles.logEntry}>
          <span aria-hidden="true">› </span>
          {m.content}
        </p>
      ))}
    </>
  );
}

export default AdventureLogPanel;
