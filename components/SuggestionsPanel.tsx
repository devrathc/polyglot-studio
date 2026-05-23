'use client';

import type { Suggestion } from '@/lib/suggestions';

type Props = { items: Suggestion[] };

export function SuggestionsPanel({ items }: Props) {
  return (
    <section className="rounded-xl border border-neutral-900 bg-[#0d0d10] p-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
        Prompt tips
      </h3>
      {items.length === 0 ? (
        <p className="text-[11.5px] text-neutral-500">No suggestions — looks good.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((s, i) => (
            <li
              key={i}
              className={`flex gap-2 rounded-md p-2 text-[11.5px] leading-snug ${
                s.kind === 'warn'
                  ? 'bg-amber-500/10 text-amber-200'
                  : 'bg-neutral-900 text-neutral-300'
              }`}
            >
              <span className="mt-0.5 flex-shrink-0">{s.kind === 'warn' ? '!' : '·'}</span>
              <span>{s.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
