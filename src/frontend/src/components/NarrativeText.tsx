import { type NarrativeTokenKind, parseNarrativeTokens } from '../lib/narrativeFmt.ts';
import styles from '../styles.module.css';

const TOKEN_CLASS: Record<NarrativeTokenKind, string> = {
  dmg: styles.tokDmg,
  hp: styles.tokHp,
  roll: styles.tokRoll,
  dc: styles.tokDc,
  ac: styles.tokAc,
  save: styles.tokSave,
  note: styles.tokNote,
};

// Screen-reader labels — without these, a damage pill reads as just "5"
// and loses context. We give the assistive layer the same information a
// sighted reader gets from the surrounding prose.
const TOKEN_ARIA: Record<NarrativeTokenKind, string> = {
  dmg: 'damage',
  hp: 'hit points',
  roll: 'roll',
  dc: 'difficulty class',
  ac: 'armor class',
  save: 'saving throw',
  note: 'mechanical note',
};

interface Props {
  text: string;
}

function NarrativeText({ text }: Props) {
  const parts = parseNarrativeTokens(text);
  // `whiteSpace: 'pre-line'` collapses runs of spaces (so the engine's
  // joined narrative stays compact) but PRESERVES \n line breaks. Used to
  // split each enemy turn into its own paragraph when the engine emits
  // `\n\n[X's turn]` between turns.
  return (
    <span style={{ whiteSpace: 'pre-line' }}>
      {parts.map((part, i) => {
        if (part.type === 'text') return <span key={i}>{part.text}</span>;
        return (
          <span
            key={i}
            className={`${styles.tok} ${TOKEN_CLASS[part.kind]}`}
            data-token-kind={part.kind}
            aria-label={`${TOKEN_ARIA[part.kind]}: ${part.display}`}
          >
            {part.display}
          </span>
        );
      })}
    </span>
  );
}

export default NarrativeText;
