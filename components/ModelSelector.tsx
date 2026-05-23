'use client';

import { useMemo, useState } from 'react';
import type { CatalogModel } from '@/app/api/models/route';
import { Tip } from '@/components/Tip';
import { isFreeModel, type Preset, PRESET_LABEL, PRESET_DESCRIPTION } from '@/lib/routing';
import type { ChatMode } from '@/lib/storage';

const PRESET_TIPS: Record<Preset, string> = {
  auto: 'model: openrouter/auto — OpenRouter routes per request based on prompt content. In Free Only mode this is constrained to the free pool via the auto-router plugin.',
  quality: 'Top frontier model with reasoning.effort=medium. Hidden reasoning tokens bill at the output rate, so this preset can be 3–10× the cost of Balanced.',
  balanced: 'Mid-tier capable model. Good cost/quality trade-off for most prompts.',
  speed: 'Smallest fast model. Best for short, simple tasks where latency matters more than depth.',
  cost: 'Cheapest reasonable model. Use for routine / high-volume tasks. In Free Only mode this maps to openrouter/free (random pick across free pool).',
};

type Mode = 'preset' | 'manual';

type Props = {
  catalog: CatalogModel[];
  preset: Preset;
  onPresetChange: (p: Preset) => void;
  manualModel: string;
  onManualModelChange: (id: string) => void;
  presetModels: Record<Preset, string>;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  chatMode: ChatMode;
};

const PRESETS: Preset[] = ['auto', 'quality', 'balanced', 'speed', 'cost'];

export function ModelSelector({
  catalog,
  preset,
  onPresetChange,
  manualModel,
  onManualModelChange,
  presetModels,
  mode,
  onModeChange,
  chatMode,
}: Props) {
  const [search, setSearch] = useState('');

  const visibleCatalog = useMemo(
    () => (chatMode === 'free' ? catalog.filter((m) => isFreeModel(m.id)) : catalog),
    [catalog, chatMode],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visibleCatalog.slice(0, 60);
    return visibleCatalog
      .filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      .slice(0, 60);
  }, [visibleCatalog, search]);

  const activeId = mode === 'preset' ? presetModels[preset] : manualModel;
  const thinkingOn = mode === 'preset' && preset === 'quality';
  const freeOn = chatMode === 'free';

  return (
    <Card title="Model">
      <div className="mb-2 flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">Active</span>
        <span className="flex items-center gap-1.5">
          {freeOn && (
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-emerald-300">
              $0
            </span>
          )}
          {thinkingOn && (
            <span
              title="reasoning.effort=medium — sent to provider"
              className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-emerald-300"
            >
              thinking
            </span>
          )}
          <span className="truncate font-mono text-[10px] text-neutral-200">{activeId}</span>
        </span>
      </div>

      <div className="flex gap-1 rounded-lg bg-neutral-900 p-0.5 text-xs">
        <Tip content="Pick by intent (Auto, Quality, Balanced, Speed, Cost). The app maps each intent to a concrete model id.">
          <button
            onClick={() => onModeChange('preset')}
            className={`flex-1 rounded-md py-1 ${mode === 'preset' ? 'bg-neutral-700 text-white' : 'text-neutral-400'}`}
          >
            Preset
          </button>
        </Tip>
        <Tip content="Pick a specific model id from the catalog. In Free Only mode the catalog is filtered to :free models.">
          <button
            onClick={() => onModeChange('manual')}
            className={`flex-1 rounded-md py-1 ${mode === 'manual' ? 'bg-neutral-700 text-white' : 'text-neutral-400'}`}
          >
            Manual
          </button>
        </Tip>
      </div>

      {freeOn && (
        <p className="mb-2 text-[10.5px] leading-snug text-emerald-300/80">
          Presets and the manual picker are constrained to the free pool. Auto routes via
          the auto-router plugin with an <code className="font-mono text-[10px]">allowed_models</code>{' '}
          whitelist; Cost uses <code className="font-mono text-[10px]">openrouter/free</code>.
          Free-pool rate caps apply (20 RPM, 50–1000 RPD).
        </p>
      )}

      {mode === 'preset' ? (
        <div className="mt-3 flex flex-col gap-1">
          {PRESETS.map((p) => {
            const active = p === preset;
            return (
              <Tip key={p} content={PRESET_TIPS[p]}>
              <button
                onClick={() => onPresetChange(p)}
                className={`flex flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition-colors ${
                  active
                    ? 'border-emerald-500/50 bg-emerald-500/10'
                    : 'border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-neutral-100">
                    {PRESET_LABEL[p]}
                    {p === 'quality' && (
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-emerald-300">
                        thinking
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[10px] text-neutral-500">{presetModels[p]}</span>
                </div>
                <span className="text-[11px] text-neutral-500">
                  {p === 'quality'
                    ? 'Top frontier model with extended reasoning (effort: medium)'
                    : PRESET_DESCRIPTION[p]}
                </span>
              </button>
              </Tip>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <input
            type="text"
            placeholder="Search models…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs outline-none focus:border-neutral-600"
          />
          <div className="max-h-72 overflow-y-auto rounded-md border border-neutral-800">
            {filtered.length === 0 ? (
              <div className="p-3 text-xs text-neutral-500">No models match.</div>
            ) : (
              filtered.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onManualModelChange(m.id)}
                  className={`flex w-full flex-col gap-0.5 border-b border-neutral-900 px-3 py-1.5 text-left text-xs last:border-b-0 hover:bg-neutral-900 ${
                    m.id === manualModel ? 'bg-neutral-900' : ''
                  }`}
                >
                  <span className="font-mono text-[11px] text-neutral-200">{m.id}</span>
                  <span className="text-[10px] text-neutral-500">
                    ctx {Math.round(m.context_length / 1000)}k · in $
                    {(m.pricing.prompt * 1_000_000).toFixed(2)}/M · out $
                    {(m.pricing.completion * 1_000_000).toFixed(2)}/M
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-900 bg-[#0d0d10] p-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
        {title}
      </h3>
      {children}
    </section>
  );
}
