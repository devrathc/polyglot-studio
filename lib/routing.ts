export type Preset = 'auto' | 'quality' | 'balanced' | 'speed' | 'cost';

export const PRESET_LABEL: Record<Preset, string> = {
  auto: 'Auto',
  quality: 'Quality',
  balanced: 'Balanced',
  speed: 'Speed',
  cost: 'Cost',
};

export const PRESET_DESCRIPTION: Record<Preset, string> = {
  auto: 'OpenRouter picks per request',
  quality: 'Top frontier model',
  balanced: 'Mid-tier capable model',
  speed: 'Smallest fast model',
  cost: 'Cheapest reasonable model',
};

export const DEFAULT_PRESET_MODEL: Record<Preset, string> = {
  auto: 'openrouter/auto',
  quality: 'anthropic/claude-opus-4.5',
  balanced: 'anthropic/claude-sonnet-4.6',
  speed: 'openai/gpt-4o-mini',
  cost: 'deepseek/deepseek-chat',
};

import type { CatalogModel } from '@/app/api/models/route';

export function isFreeModel(id: string): boolean {
  return id.endsWith(':free');
}

export function freeModelIds(catalog: CatalogModel[]): string[] {
  return catalog.filter((m) => isFreeModel(m.id)).map((m) => m.id);
}

// Curated default 5-model lineup for Compare's Free Only mode. Picked to
// show variety (a thinking model, a frontier Llama-derivative, a large
// Nvidia, a Qwen, and OSS GPT). Falls through to the first available free
// model when an id has rotated out of the free pool.
export const FREE_COMPARE_DEFAULTS = [
  'arcee-ai/trinity-large-thinking:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'openai/gpt-oss-120b:free',
];

// Curated default 5-model lineup for Compare's default (paid) mode. Mixed
// across the big frontier providers. Each entry is a vendor "family" hint —
// if the exact id has rolled forward (e.g. `x-ai/grok-4` → `x-ai/grok-4.20`),
// resolveCuratedDefaults will swap in the newest live variant from the same
// vendor instead of leaving a dead id in the dropdown.
export const DEFAULT_COMPARE_DEFAULTS = [
  'anthropic/claude-opus-4.5',
  'anthropic/claude-sonnet-4.6',
  'openai/gpt-5',
  'google/gemini-2.5-pro',
  'x-ai/grok-4',
];

/** Pick the newest live id from a vendor that shares a stem with `desired`.
 *  Example: `x-ai/grok-4` is gone, catalog has `x-ai/grok-4.20`,
 *  `x-ai/grok-4.3`, `x-ai/grok-4.20-multi-agent` → returns `x-ai/grok-4.20`
 *  (numerically highest version, preferring the bare variant over suffixed
 *  ones like `-multi-agent`). Returns undefined if no plausible sibling. */
function findVendorSuccessor(
  desired: string,
  catalog: CatalogModel[],
): string | undefined {
  const slash = desired.indexOf('/');
  if (slash < 0) return undefined;
  const vendor = desired.slice(0, slash);
  const rest = desired.slice(slash + 1);
  // Strip a trailing version (numbers + dots) and any :free suffix to get a
  // family stem. "grok-4" → "grok", "claude-opus-4.5" → "claude-opus".
  const stem = rest
    .replace(/:free$/, '')
    .replace(/-?\d+(?:\.\d+)*$/, '')
    .replace(/-$/, '');
  if (!stem) return undefined;

  const family = catalog.filter((m) => {
    if (!m.id.startsWith(`${vendor}/`)) return false;
    const tail = m.id.slice(vendor.length + 1);
    return tail === stem || tail.startsWith(`${stem}-`) || tail.startsWith(`${stem}.`);
  });
  if (family.length === 0) return undefined;

  // Score: higher version wins; prefer bare variants over suffixed ones
  // (`grok-4.20` over `grok-4.20-multi-agent`).
  const score = (id: string): [number[], number] => {
    const tail = id.slice(vendor.length + 1).replace(/:free$/, '');
    const versionMatch = tail.match(/(\d+(?:\.\d+)*)/);
    const parts = versionMatch ? versionMatch[1].split('.').map(Number) : [0];
    // Penalty for anything after the version number (e.g. `-multi-agent`).
    const afterVersionIdx = versionMatch
      ? (versionMatch.index ?? 0) + versionMatch[1].length
      : tail.length;
    const hasSuffix = tail.length > afterVersionIdx ? 1 : 0;
    return [parts, hasSuffix];
  };
  return [...family].sort((a, b) => {
    const [av, asuf] = score(a.id);
    const [bv, bsuf] = score(b.id);
    const maxLen = Math.max(av.length, bv.length);
    for (let i = 0; i < maxLen; i++) {
      const diff = (bv[i] ?? 0) - (av[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return asuf - bsuf;
  })[0].id;
}

/** Resolve a curated list of paid defaults against the live catalog.
 *  Missing ids are replaced with the newest sibling from the same vendor
 *  (see findVendorSuccessor); if no sibling exists, the slot is dropped.
 *  Deduped. */
export function resolveCuratedDefaults(
  desired: string[],
  catalog: CatalogModel[],
): string[] {
  if (catalog.length === 0) return desired;
  const live = new Set(catalog.map((m) => m.id));
  const used = new Set<string>();
  const out: string[] = [];
  for (const id of desired) {
    if (live.has(id)) {
      if (!used.has(id)) {
        out.push(id);
        used.add(id);
      }
      continue;
    }
    const successor = findVendorSuccessor(id, catalog);
    if (successor && !used.has(successor)) {
      out.push(successor);
      used.add(successor);
    }
  }
  return out;
}

/** Resolve a curated list against the live catalog, replacing rotated-out
 *  ids with whatever free models are available (deduped). Returns exactly
 *  `desired.length` ids when possible. */
export function resolveCuratedFree(
  desired: string[],
  catalog: CatalogModel[],
): string[] {
  const freeIds = catalog.filter((m) => isFreeModel(m.id)).map((m) => m.id);
  const available = new Set(freeIds);
  const used = new Set<string>();
  const out: string[] = [];
  for (const id of desired) {
    if (available.has(id) && !used.has(id)) {
      out.push(id);
      used.add(id);
    }
  }
  for (const id of freeIds) {
    if (out.length >= desired.length) break;
    if (!used.has(id)) {
      out.push(id);
      used.add(id);
    }
  }
  return out;
}

// Curated preferences for free-pool presets. Best-effort: if a preferred id
// isn't in the live catalog (the free pool rotates frequently), we fall
// through to the next candidate, then to whatever free model is available.
const FREE_QUALITY_PREFERENCES = [
  'arcee-ai/trinity-large-thinking:free',
  'inclusionai/ring-2.6-1t:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'openai/gpt-oss-120b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
];

const FREE_BALANCED_PREFERENCES = [
  'z-ai/glm-4.5-air:free',
  'deepseek/deepseek-v4-flash:free',
  'qwen/qwen3-coder:free',
  'minimax/minimax-m2.5:free',
  'openai/gpt-oss-20b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
];

const FREE_SPEED_PREFERENCES = [
  'meta-llama/llama-3.2-3b-instruct:free',
  'nvidia/nemotron-nano-9b-v2:free',
  'liquid/lfm-2.5-1.2b-instruct:free',
  'poolside/laguna-xs.2:free',
];

export type ResolveOptions = { freeOnly?: boolean };

export function resolvePresets(
  catalog: CatalogModel[],
  opts: ResolveOptions = {},
): Record<Preset, string> {
  if (opts.freeOnly) return resolveFreePresets(catalog);

  const ids = new Set(catalog.map((m) => m.id));
  const out = { ...DEFAULT_PRESET_MODEL };

  if (!ids.has(out.quality)) {
    const top = [...catalog].sort((a, b) => b.pricing.completion - a.pricing.completion)[0];
    if (top) out.quality = top.id;
  }
  if (!ids.has(out.balanced)) {
    const sorted = [...catalog].sort((a, b) => a.pricing.completion - b.pricing.completion);
    const mid = sorted[Math.floor(sorted.length / 2)];
    if (mid) out.balanced = mid.id;
  }
  if (!ids.has(out.speed)) {
    const fast = catalog
      .filter((m) => m.pricing.completion > 0 && m.pricing.completion < 1e-6)
      .sort((a, b) => a.pricing.completion - b.pricing.completion)[0];
    if (fast) out.speed = fast.id;
  }
  if (!ids.has(out.cost)) {
    const cheap = catalog
      .filter((m) => m.pricing.completion > 0)
      .sort((a, b) => a.pricing.completion - b.pricing.completion)[0];
    if (cheap) out.cost = cheap.id;
  }
  return out;
}

function resolveFreePresets(catalog: CatalogModel[]): Record<Preset, string> {
  const free = catalog.filter((m) => isFreeModel(m.id));
  const freeIds = new Set(free.map((m) => m.id));
  const firstFree = free[0]?.id ?? 'openrouter/free';

  const pick = (preferences: string[]): string => {
    for (const id of preferences) {
      if (freeIds.has(id)) return id;
    }
    return firstFree;
  };

  return {
    // Auto uses openrouter/auto, but the Chat page passes allowedModels =
    // freeModelIds(catalog) so the auto-router plugin constrains routing to
    // the free pool. The model id stays openrouter/auto so the UI is honest
    // about which OpenRouter surface is being invoked.
    auto: 'openrouter/auto',
    quality: pick(FREE_QUALITY_PREFERENCES),
    balanced: pick(FREE_BALANCED_PREFERENCES),
    speed: pick(FREE_SPEED_PREFERENCES),
    // Everything in the free pool is $0, so "cheapest" collapses to "any
    // capability-matching free model" — that's exactly what openrouter/free
    // does.
    cost: 'openrouter/free',
  };
}

export type RouteSuggestion = { preset: Preset; reason: string };

const CODE_HINTS = /\b(function|class|def |async |await |SQL|regex|stack ?trace|Exception|Traceback|import |const |let |var |interface |struct |```)\b/i;
const REASONING_HINTS = /\b(prove|derive|design|architect|trade-?off|why does|explain in detail|step by step)\b/i;
const SHORT_TASK_HINTS = /^(summarize|translate|extract|classify|tag|rewrite|paraphrase|tldr)\b/i;

export function suggestPreset(text: string): RouteSuggestion {
  const t = text.trim();
  if (!t) return { preset: 'auto', reason: 'No prompt yet' };
  if (SHORT_TASK_HINTS.test(t)) {
    return { preset: 'cost', reason: 'Looks like a routine task — cheap models do this well' };
  }
  if (REASONING_HINTS.test(t) || (CODE_HINTS.test(t) && t.length > 200)) {
    return { preset: 'quality', reason: 'Complex reasoning or large code — use a frontier model' };
  }
  if (CODE_HINTS.test(t)) {
    return { preset: 'balanced', reason: 'Code-related — balanced model handles this' };
  }
  if (t.length < 80 && !t.includes('?')) {
    return { preset: 'speed', reason: 'Short and simple — speed-tier is enough' };
  }
  return { preset: 'auto', reason: 'No strong signal — let OpenRouter route it' };
}
