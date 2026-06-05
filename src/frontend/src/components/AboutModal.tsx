import Dialog from './Dialog';
import styles from '../styles.module.css';

// A small external link that opens in a new tab with safe rel.
function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={styles.aboutLink}>
      {children}
    </a>
  );
}

// The About page — project background + the third-party attributions the
// project's licenses require (SRD, iconography, and — once the new terrain
// tiles are wired in — the map art). Reachable from the login + sessions
// screens; the canonical legal text lives in LEGAL.md.
function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="About Pansori" onClose={onClose} width="640px" testId="about-modal">
      <div className={styles.aboutBody}>
        <section>
          <p>
            <strong>Pansori</strong> is a traditional Korean musical storytelling art performed by a
            single vocalist and one drummer. Using only a fan, a drum, and their voice, the singer
            embodies multiple characters — blending dramatic song, rhythmic speech, and physical
            gesture to carry an epic story.
          </p>
          <p>
            That&apos;s the aim of this project: with a script, some dice rolls, and a rules engine,
            the narrative weaves an adventure you star in. Pansori is a browser RPG engine that runs
            adventure scripts — from small roguelikes to full campaigns.
          </p>
        </section>

        <section>
          <h3 className={styles.aboutHeading}>Game rules</h3>
          <p>
            Pansori is a <strong>strict SRD 5.2.1</strong> build. It includes material from the{' '}
            <Ext href="https://dnd.wizards.com/resources/systems-reference-document">
              System Reference Document 5.2.1
            </Ext>{' '}
            by Wizards of the Coast LLC, licensed under{' '}
            <Ext href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Ext>. Any
            modifications or adaptations are Pansori&apos;s own. Pansori is not published, endorsed,
            or specifically approved by Wizards of the Coast.
          </p>
        </section>

        <section>
          <h3 className={styles.aboutHeading}>Code</h3>
          <p>
            The Pansori engine and all original code, narrative, and non-SRD content are licensed
            under the <Ext href="https://www.gnu.org/licenses/gpl-3.0.html">GNU GPL v3.0</Ext>.
          </p>
        </section>

        <section>
          <h3 className={styles.aboutHeading}>Iconography</h3>
          <ul className={styles.aboutList}>
            <li>
              <Ext href="https://phosphoricons.com/">Phosphor Icons</Ext> — MIT. UI chrome.
            </li>
            <li>
              <Ext href="https://nagoshiashumari.github.io/Rpg-Awesome/">RPG Awesome</Ext> by
              Daniela Howe &amp; Ivan Montiel — fantasy glyphs (font{' '}
              <Ext href="https://scripts.sil.org/OFL">SIL OFL 1.1</Ext>; CSS MIT).
            </li>
            <li>
              <Ext href="https://game-icons.net/">Game-icons.net</Ext> — a broad fantasy/RPG glyph
              set, licensed <Ext href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</Ext>{' '}
              by its contributors (Lorc, Delapouite, and others).
            </li>
          </ul>
        </section>

        <p className={styles.aboutFoot}>Full legal notices live in the project&apos;s LEGAL.md.</p>
      </div>
    </Dialog>
  );
}

export default AboutModal;
