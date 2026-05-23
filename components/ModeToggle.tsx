'use client';

import { Tip } from '@/components/Tip';
import type { ChatMode } from '@/lib/storage';

const MODES: { value: ChatMode; label: string; desc: string; tip: string }[] = [
  {
    value: 'default',
    label: 'Default',
    desc: 'All models, free + paid',
    tip: 'Full catalog. Paid models bill OpenRouter credits (or your provider account when BYOK is configured).',
  },
  {
    value: 'free',
    label: 'Free Only',
    desc: '$0 per token, free pool only',
    tip: "Restrict to OpenRouter's free pool. $0 per token, but rate-capped: 20 RPM / 50–1000 RPD depending on whether you've ever funded $10. Web search is disabled in this mode since each search bills OpenRouter credits regardless.",
  },
];

type Props = {
  mode: ChatMode;
  onChange: (m: ChatMode) => void;
  /** Optional label override (e.g., "Compare mode"). */
  title?: string;
};

export function ModeToggle({ mode, onChange, title = 'Mode' }: Props) {
  const isFree = mode === 'free';
  return (
    <section
      className={`rounded-xl border p-3 transition-colors ${
        isFree
          ? 'border-emerald-500/50 bg-emerald-500/[0.06]'
          : 'border-neutral-900 bg-[#0d0d10]'
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          {title}
        </h3>
        {isFree && (
          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-emerald-300">
            $0 / token
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {MODES.map((m) => {
          const active = m.value === mode;
          const activeClass =
            m.value === 'free'
              ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-100'
              : 'border-neutral-600 bg-neutral-800 text-white';
          return (
            <Tip key={m.value} content={m.tip}>
              <button
                type="button"
                onClick={() => onChange(m.value)}
                aria-pressed={active}
                className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-all ${
                  active
                    ? activeClass
                    : 'border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:bg-neutral-900 hover:text-neutral-200'
                }`}
              >
                <span className="text-[13px] font-semibold leading-tight">{m.label}</span>
                <span className="text-[10.5px] leading-snug opacity-80">{m.desc}</span>
              </button>
            </Tip>
          );
        })}
      </div>
    </section>
  );
}
