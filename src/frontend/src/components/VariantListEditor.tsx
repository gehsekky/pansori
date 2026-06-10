import styles from '../styles.module.css';

// A small list-of-textareas editor for a variant POOL (e.g. the game-start
// opening — one variant is picked per playthrough). One textarea per variant,
// with per-row remove (disabled at the last row) and an add button. Always
// renders at least one row. `onChange` receives the next variant list.
function VariantListEditor({
  variants,
  onChange,
  ariaPrefix = 'Variant',
  rows = 3,
}: {
  variants: string[];
  onChange: (next: string[]) => void;
  ariaPrefix?: string;
  rows?: number;
}) {
  const list = variants.length > 0 ? variants : [''];
  return (
    <div data-testid="variant-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {list.map((v, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <textarea
            aria-label={`${ariaPrefix} ${i + 1}`}
            className={styles.formInp}
            value={v}
            rows={rows}
            onChange={(e) => onChange(list.map((x, j) => (j === i ? e.target.value : x)))}
            style={{ flex: 1, fontFamily: 'inherit', fontSize: '0.75rem', resize: 'vertical' }}
          />
          <button
            className={styles.ghostBtn}
            title="Remove this variant"
            aria-label={`Remove ${ariaPrefix.toLowerCase()} ${i + 1}`}
            disabled={list.length === 1}
            style={{ padding: '0.2rem 0.5rem' }}
            onClick={() => onChange(list.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className={styles.ghostBtn}
        style={{ alignSelf: 'flex-start', fontSize: '0.75rem' }}
        onClick={() => onChange([...list, ''])}
      >
        + ADD VARIANT
      </button>
    </div>
  );
}

export default VariantListEditor;
