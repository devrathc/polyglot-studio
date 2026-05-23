import type { CatalogModel } from '@/app/api/models/route';

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export type CostEstimate = {
  promptTokens: number;
  completionTokens: number;
  promptCost: number;
  completionCost: number;
  total: number;
};

export function estimateCost(
  prompt: string,
  model: CatalogModel | undefined,
  expectedOutputTokens = 500,
): CostEstimate {
  const promptTokens = estimateTokens(prompt);
  if (!model) {
    return {
      promptTokens,
      completionTokens: expectedOutputTokens,
      promptCost: 0,
      completionCost: 0,
      total: 0,
    };
  }
  const promptCost = promptTokens * model.pricing.prompt;
  const completionCost = expectedOutputTokens * model.pricing.completion;
  return {
    promptTokens,
    completionTokens: expectedOutputTokens,
    promptCost,
    completionCost,
    total: promptCost + completionCost,
  };
}

export function formatUSD(n: number): string {
  if (!isFinite(n) || n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(5)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(3)}`;
}

export function formatPricePerM(perToken: number): string {
  const perM = perToken * 1_000_000;
  if (perM === 0) return 'free';
  if (perM < 0.01) return `$${perM.toFixed(4)}/M`;
  if (perM < 1) return `$${perM.toFixed(3)}/M`;
  return `$${perM.toFixed(2)}/M`;
}

let catalogCache: { at: number; data: CatalogModel[] } | null = null;
const CLIENT_TTL_MS = 5 * 60 * 1000;

export async function fetchCatalog(): Promise<CatalogModel[]> {
  if (catalogCache && Date.now() - catalogCache.at < CLIENT_TTL_MS) {
    return catalogCache.data;
  }
  const res = await fetch('/api/models');
  if (!res.ok) throw new Error(`Failed to load models: ${res.status}`);
  const json = (await res.json()) as { models: CatalogModel[] };
  catalogCache = { at: Date.now(), data: json.models };
  return json.models;
}

export function findModel(catalog: CatalogModel[], id: string): CatalogModel | undefined {
  return catalog.find((m) => m.id === id);
}

export type UsageBreakdown = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  reasoning_tokens?: number;
  cached_tokens?: number;
};

export type CostBreakdown = {
  inputCost: number;
  outputCost: number;
  reasoningCost: number;
  cachedDelta: number;
  total: number;
  reliable: boolean;
};

export function computeCostBreakdown(
  model: CatalogModel | undefined,
  usage: UsageBreakdown | undefined,
): CostBreakdown | null {
  if (!model || !usage) return null;
  const promptPrice = model.pricing.prompt;
  const completionPrice = model.pricing.completion;
  const reasoningPrice = model.pricing.internal_reasoning;
  const cachedPrice = model.pricing.input_cache_read;

  if (promptPrice <= 0 && completionPrice <= 0) return null;

  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const reasoningTokens = usage.reasoning_tokens ?? 0;
  const cachedTokens = usage.cached_tokens ?? 0;

  const inputCost = promptTokens * promptPrice;
  const outputCost = completionTokens * completionPrice;
  const reasoningCost =
    reasoningPrice && reasoningTokens > 0 ? reasoningTokens * reasoningPrice : 0;
  const cachedDelta =
    cachedPrice != null && cachedTokens > 0
      ? cachedTokens * (cachedPrice - promptPrice)
      : 0;

  return {
    inputCost,
    outputCost,
    reasoningCost,
    cachedDelta,
    total: inputCost + outputCost + reasoningCost + cachedDelta,
    reliable: true,
  };
}
