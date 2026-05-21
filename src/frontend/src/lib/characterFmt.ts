// Character display helpers shared across the PartyRail, InventoryModal,
// and AdventureLogPanel. Kept tiny on purpose — these only deal with
// human-presentation of class/subclass identifiers (which the engine
// stores as lowercase snake_case ids).

// Format a subclass id for display. Splits on '_' and title-cases each
// part — 'battle_master' → 'Battle Master', 'champion' → 'Champion'.
export function formatSubclass(id: string): string {
  return id
    .split('_')
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// Format the class label used in party tiles and similar surfaces.
// With no subclass set: 'Fighter'.
// With subclass set:    'Fighter / Champion'.
export function formatClassLabel(characterClass: string, subclass?: string | null): string {
  if (!subclass) return characterClass;
  return `${characterClass} / ${formatSubclass(subclass)}`;
}
