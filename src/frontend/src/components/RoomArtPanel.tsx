import { useState, useEffect } from 'react';
import { S } from '../App';
import type { FrontendContext } from '../types';

const IMG_EXTS = ['webp', 'png', 'jpg', 'jpeg'];

function RoomArtPanel({ roomId, ctx }: { roomId: string | null; ctx: FrontendContext }) {
  const [extIdx, setExtIdx] = useState(0);
  const art = roomId ? ctx.art[roomId] : null;

  useEffect(() => { setExtIdx(0); }, [roomId, ctx.id]);

  const allFailed = extIdx >= IMG_EXTS.length;
  if (!art && allFailed) return null;

  return (
    <div
      style={{
        ...S.card,
        flex: '0 0 20%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0.75rem',
        overflow: 'hidden',
      }}
    >
      {!allFailed ? (
        <img
          src={`/art/${ctx.id}/${roomId}.${IMG_EXTS[extIdx]}`}
          alt={roomId ?? ''}
          onError={() => setExtIdx(i => i + 1)}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
        />
      ) : (
        <pre
          style={{
            margin: 0,
            fontSize: '0.78rem',
            lineHeight: 1.4,
            color: 'var(--t-mid)',
            textShadow: '0 0 4px var(--t-border)',
            fontFamily: 'var(--t-font)',
            userSelect: 'none',
          }}
        >
          {art}
        </pre>
      )}
    </div>
  );
}

export default RoomArtPanel;
