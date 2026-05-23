'use client';

import { Tip } from '@/components/Tip';

type Props = {
  on: boolean;
  onChange: (next: boolean) => void;
  /** When true, the toggle is locked off and an explanation is shown. */
  lockedReason?: string;
};

export function WebAccessToggle({ on, onChange, lockedReason }: Props) {
  const locked = !!lockedReason;
  const enabled = on && !locked;

  return (
    <section
      className={`rounded-xl border p-3 transition-colors ${
        enabled
          ? 'border-blue-500/40 bg-blue-500/[0.06]'
          : 'border-neutral-900 bg-[#0d0d10]'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <h3
            className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400"
            title="Sends tools: [{type: 'openrouter:web_search'}, {type: 'openrouter:web_fetch'}] with the request. The model decides when to call them (0–N times per turn); OpenRouter executes the searches/fetches server-side and feeds results back."
          >
            Web access
          </h3>
          <p className="mt-0.5 text-[10.5px] leading-snug text-neutral-500">
            {locked
              ? lockedReason
              : enabled
                ? 'Model can call openrouter:web_search and web_fetch on its own.'
                : 'Off — model answers from training data only.'}
          </p>
        </div>
        <Tip
          content={
            locked
              ? (lockedReason ?? 'Disabled')
              : enabled
                ? "Off → on: removes web tools. Tap to flip."
                : "Adds openrouter:web_search and openrouter:web_fetch to the request. ~$0.005–$0.02 per search call, billed to OpenRouter credits."
          }
        >
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={locked}
            onClick={() => onChange(!on)}
            className={`relative ml-3 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              locked
                ? 'cursor-not-allowed bg-neutral-900 opacity-50'
                : enabled
                  ? 'bg-blue-500/70'
                  : 'bg-neutral-800'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </Tip>
      </div>
      {enabled && (
        <p className="mt-2 text-[10px] leading-snug text-blue-300/80">
          Each search call bills ~$0.005–$0.02 to OpenRouter credits, separate from token cost.
        </p>
      )}
    </section>
  );
}
