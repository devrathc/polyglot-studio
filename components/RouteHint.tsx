'use client';

import { type Preset, PRESET_LABEL } from '@/lib/routing';

type Props = {
  suggestion: { preset: Preset; reason: string };
  current: Preset;
  onApply: () => void;
};

export function RouteHint({ suggestion, current, onApply }: Props) {
  const matches = suggestion.preset === current;
  return (
    <section className="rounded-xl border border-neutral-900 bg-[#0d0d10] p-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
        Auto-route hint
      </h3>
      <div className="flex items-center gap-2">
        <span
          className={`rounded-md px-2 py-0.5 text-xs font-medium ${
            matches
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-amber-500/15 text-amber-300'
          }`}
        >
          {PRESET_LABEL[suggestion.preset]}
        </span>
        <span className="text-[11px] text-neutral-500">{matches ? 'matches your choice' : 'differs from your choice'}</span>
      </div>
      <p className="mt-2 text-[11.5px] text-neutral-400">{suggestion.reason}</p>
      {!matches ? (
        <button
          onClick={onApply}
          title="Heuristic match based on your prompt text (looks for code keywords, reasoning verbs, short-task patterns). Click to apply."
          className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-900 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
        >
          Switch to {PRESET_LABEL[suggestion.preset]}
        </button>
      ) : null}
    </section>
  );
}
