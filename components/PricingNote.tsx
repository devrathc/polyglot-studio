'use client';

import { useState } from 'react';

type Tone = 'default' | 'free' | 'browse';

type Props = {
  wallet: string;
  when: string;
  byok: string;
  /** Optional one-line extra note (e.g., rate limits, model-specific gotchas). */
  note?: string;
  tone?: Tone;
};

const TONE_STYLES: Record<Tone, { border: string; bg: string; label: string }> = {
  default: {
    border: 'border-emerald-500/25',
    bg: 'bg-emerald-500/[0.04]',
    label: 'text-emerald-300',
  },
  free: {
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/[0.05]',
    label: 'text-emerald-300',
  },
  browse: {
    border: 'border-neutral-800',
    bg: 'bg-neutral-900/30',
    label: 'text-neutral-400',
  },
};

export function PricingNote({ wallet, when, byok, note, tone = 'default' }: Props) {
  const [open, setOpen] = useState(false);
  const styles = TONE_STYLES[tone];
  return (
    <div className={`mt-2 rounded-md border ${styles.border} ${styles.bg} px-2.5 py-1.5`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Expand to see who gets billed, when, and how BYOK changes the picture"
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className={`font-mono text-[10px] uppercase tracking-wider ${styles.label}`}
          >
            Pricing
          </span>
          <span className="truncate text-[11px] text-neutral-300">{wallet}</span>
        </div>
        <span className="shrink-0 text-[10px] text-neutral-500">
          {open ? 'hide' : 'details'}
        </span>
      </button>
      {open && (
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10.5px] leading-snug">
          <dt className="font-mono uppercase tracking-wider text-neutral-500">Wallet</dt>
          <dd className="text-neutral-300">{wallet}</dd>
          <dt className="font-mono uppercase tracking-wider text-neutral-500">When</dt>
          <dd className="text-neutral-300">{when}</dd>
          <dt className="font-mono uppercase tracking-wider text-neutral-500">BYOK</dt>
          <dd className="text-neutral-300">{byok}</dd>
          {note ? (
            <>
              <dt className="font-mono uppercase tracking-wider text-neutral-500">Note</dt>
              <dd className="text-neutral-400">{note}</dd>
            </>
          ) : null}
        </dl>
      )}
    </div>
  );
}
