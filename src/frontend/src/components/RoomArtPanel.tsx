import type { FrontendContext } from '../types';
import styles from '../styles.module.css';
import manifest from '../art-manifest.json';

const artManifest = manifest as Record<string, Record<string, string>>;

function RoomArtPanel({ roomId, ctx }: { roomId: string | null; ctx: FrontendContext }) {
  const art = roomId ? ctx.art[roomId] : null;
  const ext = roomId ? (artManifest[ctx.id]?.[roomId] ?? null) : null;

  if (!ext && !art) return null;

  return (
    <div className={styles.artPanel}>
      {ext ? (
        <img
          src={`/art/${ctx.id}/${roomId}.${ext}`}
          alt={roomId ?? ''}
          className={styles.artImg}
        />
      ) : (
        <pre className={styles.artAscii}>{art}</pre>
      )}
    </div>
  );
}

export default RoomArtPanel;
