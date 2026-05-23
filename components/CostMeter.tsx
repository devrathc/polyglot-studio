'use client';

import {
  type CatalogModel,
} from '@/app/api/models/route';
import {
  type CostBreakdown,
  type CostEstimate,
  type UsageBreakdown,
  computeCostBreakdown,
  formatUSD,
} from '@/lib/pricing';

type Props = {
  estimate: CostEstimate;
  modelId: string;
  model?: CatalogModel;
  actual?: UsageBreakdown | null;
};

export function CostMeter({ estimate, modelId, model, actual }: Props) {
  const breakdown = actual ? computeCostBreakdown(model, actual) : null;
  return (
    <section className="rounded-xl border border-neutral-900 bg-[#0d0d10] p-3">
      <h3
        className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500"
        title="Estimate is computed before sending (input tokens × prompt rate + expected output × completion rate). Actual values appear after the response completes, with reasoning and cached-token costs broken out."
      >
        Cost preview
      </h3>
      <div className="font-mono text-[11px] text-neutral-500">{modelId}</div>
      <Row label="Prompt tokens" value={estimate.promptTokens.toLocaleString()} />
      <Row label="Completion (est.)" value={`~${estimate.completionTokens.toLocaleString()}`} />
      <Row label="Estimated cost" value={formatUSD(estimate.total)} accent />
      {actual ? <ActualPanel usage={actual} cost={breakdown} hasModel={!!model} /> : null}
    </section>
  );
}

function ActualPanel({
  usage,
  cost,
  hasModel,
}: {
  usage: UsageBreakdown;
  cost: CostBreakdown | null;
  hasModel: boolean;
}) {
  const totalTokens =
    usage.total_tokens
    ?? ((usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0) || undefined);

  return (
    <div className="mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-emerald-300">
        Last call (actual)
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10.5px] text-neutral-400">
        {usage.prompt_tokens != null && (
          <UsageRow label="Input" tokens={usage.prompt_tokens} cost={cost?.inputCost} reliable={!!cost?.reliable} />
        )}
        {usage.cached_tokens != null && usage.cached_tokens > 0 && (
          <UsageRow
            label="Cached"
            tokens={usage.cached_tokens}
            cost={cost?.cachedDelta}
            reliable={!!cost?.reliable}
            muted
          />
        )}
        {usage.completion_tokens != null && (
          <UsageRow
            label="Output"
            tokens={usage.completion_tokens}
            cost={cost?.outputCost}
            reliable={!!cost?.reliable}
          />
        )}
        {usage.reasoning_tokens != null && usage.reasoning_tokens > 0 && (
          <UsageRow
            label="Reasoning"
            tokens={usage.reasoning_tokens}
            cost={cost?.reasoningCost}
            reliable={!!cost?.reliable}
            muted
          />
        )}
        {totalTokens != null && (
          <div className="col-span-2 mt-1 flex justify-between border-t border-emerald-500/20 pt-1 text-neutral-200">
            <span>Total</span>
            <span className="flex gap-2 font-mono">
              <span>{totalTokens.toLocaleString()} tok</span>
              {cost ? (
                <span className="text-emerald-300">{formatUSD(cost.total)}</span>
              ) : (
                <span className="text-neutral-500">{hasModel ? 'free' : 'no price'}</span>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function UsageRow({
  label,
  tokens,
  cost,
  reliable,
  muted,
}: {
  label: string;
  tokens: number;
  cost: number | undefined;
  reliable: boolean;
  muted?: boolean;
}) {
  return (
    <div className={`flex justify-between ${muted ? 'text-neutral-500' : ''}`}>
      <span>{label}</span>
      <span className="flex gap-2 font-mono">
        <span>{tokens.toLocaleString()}</span>
        {reliable && cost != null ? (
          <span className={cost < 0 ? 'text-amber-300' : 'text-emerald-300/80'}>
            {cost < 0 ? `-${formatUSD(-cost)}` : formatUSD(cost)}
          </span>
        ) : (
          <span className="text-neutral-700">—</span>
        )}
      </span>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="mt-1.5 flex items-baseline justify-between">
      <span className="text-[11.5px] text-neutral-400">{label}</span>
      <span className={`text-xs font-mono ${accent ? 'text-emerald-300' : 'text-neutral-100'}`}>
        {value}
      </span>
    </div>
  );
}
