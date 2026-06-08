import type { FrontendContext, GameChoice } from '../types';
import { ItemIcon } from '../lib/itemIcons.tsx';
import styles from '../styles.module.css';

interface Props {
  npcName: string;
  // The active PC's gold (the buyer). Buy buttons disable when a ware costs more.
  gold: number;
  // The vendor choices (kind === 'vendor'): a `buy` row per ware, then the
  // `exit_shop` Back control.
  choices: GameChoice[];
  // Item icons / descriptions, keyed by item id (from the campaign context).
  ctx: Pick<FrontendContext, 'itemDescs'>;
  onChoose: (c: GameChoice) => void;
}

/**
 * The vendor pane. Shown (in place of the conversation pane) while a shop is
 * open — a nested sub-state of the conversation. Lists the NPC's wares with a
 * Buy button each, the player's gold, and a Back control that returns to the
 * dialogue. Buying only for now; a sell section is a planned follow-up.
 */
function VendorPanel({ npcName, gold, choices, ctx, onChoose }: Props) {
  const wares = choices.filter((c) => c.action.type === 'buy');
  const back = choices.find((c) => c.action.type === 'exit_shop');

  return (
    <div className={styles.vendorPanel} data-testid="vendor-panel">
      <div className={styles.vendorHeader}>
        <span>Trading with {npcName.toUpperCase()}</span>
        <span className={styles.vendorGold}>{gold}cr</span>
      </div>
      <p className={styles.vendorSubhead}>Buying</p>
      <ul className={styles.vendorList} aria-label={`${npcName}'s wares`}>
        {wares.length === 0 && <li className={styles.vendorEmpty}>Nothing for sale right now.</li>}
        {wares.map((c, i) => {
          // Narrow to the buy action for itemId/price; label already reads
          // "Buy <name> — <price>cr[ note]", so strip the leading verb for the row.
          const buy = c.action as { type: 'buy'; itemId: string; price: number };
          const name = c.label.replace(/^Buy /, '');
          const desc = ctx.itemDescs[buy.itemId];
          const tooDear = gold < buy.price;
          return (
            <li key={`w${i}`} className={styles.vendorItem}>
              <div className={styles.vendorItemMain}>
                <span className={styles.vendorItemName}>
                  <ItemIcon item={{ id: buy.itemId }} size={18} /> {name}
                </span>
                {desc && <span className={styles.vendorItemDesc}>{desc}</span>}
              </div>
              <button
                data-testid="vendor-buy"
                data-item-id={buy.itemId}
                className={styles.invBtn}
                disabled={tooDear}
                title={tooDear ? "You can't afford this" : undefined}
                onClick={() => onChoose(c)}
              >
                Buy
              </button>
            </li>
          );
        })}
      </ul>
      {back && (
        <div className={styles.conversationControls}>
          <button
            data-testid="vendor-back"
            className={styles.conversationControlBtn}
            onClick={() => onChoose(back)}
          >
            {back.label}
          </button>
        </div>
      )}
    </div>
  );
}

export default VendorPanel;
