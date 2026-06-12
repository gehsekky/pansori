// Reusable hover tooltip — rich content anchored to any inline trigger.
// Portals to <body> so it escapes modal overflow/scroll clipping, positions
// below the anchor (centered) and flips above / clamps when it would leave
// the viewport. Shows on hover AND focus (keyboard users get it too), with a
// small open delay so a cursor sweeping across a grid doesn't strobe.
// First consumer: the inventory icon grid's item details.

import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from '../styles.module.css';

interface Props {
  content: ReactNode;
  children: ReactNode;
  delayMs?: number;
  testId?: string;
  // Class for the inline trigger wrapper (not the tooltip box).
  className?: string;
}

function HoverTooltip({ content, children, delayMs = 150, testId, className }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const tipId = useId();

  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), delayMs);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
    setPos(null); // re-measure on the next open
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Measure AFTER the box renders (it mounts hidden), then place it:
  // below-center of the anchor, flipped above when it would run off the
  // bottom, clamped to the viewport horizontally.
  useLayoutEffect(() => {
    if (!open) return;
    const a = anchorRef.current?.getBoundingClientRect();
    const b = boxRef.current?.getBoundingClientRect();
    if (!a || !b) return;
    const margin = 8;
    let left = a.left + a.width / 2 - b.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - b.width - margin));
    let top = a.bottom + margin;
    if (top + b.height > window.innerHeight - margin) top = a.top - b.height - margin;
    top = Math.max(margin, top);
    setPos({ left, top });
  }, [open]);

  return (
    <span
      ref={anchorRef}
      // Default inline-block via the class; a caller's className (declared
      // later in the stylesheet) can override display/size for layout use
      // (the inventory grid stretches the anchor to fill its cell).
      className={`${styles.tooltipAnchor} ${className ?? ''}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={open ? tipId : undefined}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={boxRef}
            id={tipId}
            role="tooltip"
            data-testid={testId ?? 'hover-tooltip'}
            className={styles.tooltipBox}
            style={{
              left: pos?.left ?? -9999,
              top: pos?.top ?? -9999,
              visibility: pos ? 'visible' : 'hidden',
            }}
          >
            {content}
          </div>,
          document.body
        )}
    </span>
  );
}

export default HoverTooltip;
