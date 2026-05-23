'use client';

import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

type TriggerEvents = {
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
  onFocus?: (e: React.FocusEvent) => void;
  onBlur?: (e: React.FocusEvent) => void;
};

type Props = {
  /** Tooltip content. Pass a short string; long copy stays under ~2 lines. */
  content: ReactNode;
  /** A single element to wrap. Tip clones it and attaches hover/focus handlers. */
  children: ReactElement<TriggerEvents>;
  /** Show delay in ms. Default 120 — fast enough to feel responsive, slow enough to ignore casual sweeps. */
  delay?: number;
  /** Preferred side. Tip flips automatically when it would clip the viewport. */
  side?: 'top' | 'bottom';
  /** Max width in px. Default 280. */
  maxWidth?: number;
};

export function Tip({
  content,
  children,
  delay = 120,
  side = 'top',
  maxWidth = 280,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; place: 'top' | 'bottom' } | null>(
    null,
  );
  const timer = useRef<number | null>(null);
  const triggerRect = useRef<DOMRect | null>(null);

  const compute = useCallback(() => {
    const r = triggerRect.current;
    if (!r) return null;
    const vh = window.innerHeight;
    const wantTop = side === 'top';
    const spaceAbove = r.top;
    const spaceBelow = vh - r.bottom;
    const place: 'top' | 'bottom' =
      wantTop && spaceAbove < 60 && spaceBelow > spaceAbove
        ? 'bottom'
        : !wantTop && spaceBelow < 60 && spaceAbove > spaceBelow
          ? 'top'
          : side;
    return {
      left: r.left + r.width / 2,
      top: place === 'top' ? r.top - 8 : r.bottom + 8,
      place,
    };
  }, [side]);

  const show = useCallback(
    (e: SyntheticEvent) => {
      triggerRect.current = (e.currentTarget as HTMLElement).getBoundingClientRect();
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const next = compute();
        if (next) {
          setPos(next);
          setOpen(true);
        }
      }, delay);
    },
    [compute, delay],
  );

  const hide = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setOpen(false);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  // Close on scroll/resize so the tooltip doesn't drift away from its trigger.
  useEffect(() => {
    if (!open) return;
    const close = () => hide();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, hide]);

  if (!isValidElement(children)) return children;

  const childProps = children.props;
  const trigger = cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent) => {
      childProps.onMouseEnter?.(e);
      show(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      childProps.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      childProps.onFocus?.(e);
      show(e);
    },
    onBlur: (e: React.FocusEvent) => {
      childProps.onBlur?.(e);
      hide();
    },
  });

  return (
    <>
      {trigger}
      {open && pos && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="tooltip"
              style={{
                position: 'fixed',
                left: pos.left,
                top: pos.top,
                transform:
                  pos.place === 'top'
                    ? 'translate(-50%, -100%)'
                    : 'translate(-50%, 0)',
                maxWidth,
                pointerEvents: 'none',
                zIndex: 9999,
              }}
              className="rounded-md border border-neutral-700 bg-neutral-900/95 px-2.5 py-1.5 text-[11.5px] leading-snug text-neutral-100 shadow-xl shadow-black/40 backdrop-blur"
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
