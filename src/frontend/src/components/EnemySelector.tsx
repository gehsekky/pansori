import type { GameState, Seed } from '../types.ts';
import styles from '../styles.module.css';

// Single-target picker for combat enemies. Instead of the choice list
// emitting one "Attack X" / "Cast Y → X" button per enemy (which scales
// poorly past 2-3 hostiles), the player keeps a "current target" set
// here and clicks a single Attack / Cast / Grapple / Shove button that
// resolves against the selection.
//
// The control is driven by `state.entities` for HP and `seed.enemies`
// for names. Dead enemies (hp <= 0) are excluded — they're not valid
// targets and would only clutter the list. Hidden when there's no
// combat or no living enemies (one less thing competing for the
// player's attention on a non-combat turn).

interface Props {
  state: GameState;
  seed: Seed | null;
  selectedId: string | null;
  onSelect: (enemyId: string) => void;
}

interface EnemyView {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  ac?: number;
}

function buildEnemyViews(state: GameState, seed: Seed | null): EnemyView[] {
  if (!state.entities || !seed) return [];
  // Cross-reference grid entities with the seed's enemy catalogue to
  // resolve display names. Multiple enemies can share a name (two
  // "Bandit Ruffian"s); we let the consumer disambiguate via `#N`.
  const enemyMeta = new Map<string, { name: string; ac: number }>();
  for (const list of Object.values(seed.enemies ?? {})) {
    for (const e of list) {
      enemyMeta.set(e.id, { name: e.name, ac: e.ac });
    }
  }
  const out: EnemyView[] = [];
  for (const ent of state.entities) {
    if (!ent.isEnemy || ent.hp <= 0) continue;
    const meta = enemyMeta.get(ent.id);
    out.push({
      id: ent.id,
      name: meta?.name ?? 'Enemy',
      hp: ent.hp,
      maxHp: ent.maxHp,
      ac: ent.ac ?? meta?.ac,
    });
  }
  return out;
}

// Suffix duplicate names with "#1"/"#2" so the player can tell two
// "Bandit Ruffian"s apart in the selector. Mirrors the engine's
// disambiguation pattern in the Attack/per-target spell choice gen.
function disambiguatedLabel(view: EnemyView, all: EnemyView[]): string {
  const sameName = all.filter((e) => e.name === view.name);
  if (sameName.length <= 1) return view.name;
  const idx = sameName.findIndex((e) => e.id === view.id) + 1;
  return `${view.name} #${idx}`;
}

function EnemySelector({ state, seed, selectedId, onSelect }: Props) {
  const enemies = buildEnemyViews(state, seed);
  if (!state.combat_active || enemies.length === 0) return null;
  return (
    <div
      data-testid="enemy-selector"
      className={styles.enemySelector}
      role="radiogroup"
      aria-label="Target enemy"
    >
      <span className={styles.enemySelectorLabel} aria-hidden="true">
        TARGET:
      </span>
      {enemies.map((en) => {
        const label = disambiguatedLabel(en, enemies);
        const isSelected = en.id === selectedId;
        return (
          <button
            key={en.id}
            type="button"
            className={`${styles.enemySelectorBtn} ${isSelected ? styles.enemySelectorBtnActive : ''}`}
            role="radio"
            aria-checked={isSelected}
            data-testid={`enemy-selector-${en.id}`}
            data-selected={isSelected ? 'true' : 'false'}
            onClick={() => onSelect(en.id)}
          >
            <span>{label}</span>
            <span className={styles.enemySelectorHp}>
              {en.hp}/{en.maxHp}
              {en.ac != null ? ` AC ${en.ac}` : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default EnemySelector;
