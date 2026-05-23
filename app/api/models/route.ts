import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export type CatalogModel = {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    prompt: number;
    completion: number;
    internal_reasoning?: number;
    input_cache_read?: number;
  };
  modalities: string[];
  provider: string;
};

type CacheShape = { at: number; data: CatalogModel[] };
const TTL_MS = 10 * 60 * 1000;

declare global {
  // eslint-disable-next-line no-var
  var __modelsCache: CacheShape | undefined;
}

async function fetchCatalog(): Promise<CatalogModel[]> {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ''}` },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new Error(`OpenRouter /models returned ${res.status}`);
  }
  const json = (await res.json()) as { data: RawModel[] };
  return json.data
    .map(trim)
    .filter((m): m is CatalogModel => m !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

type RawModel = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
    internal_reasoning?: string;
    input_cache_read?: string;
  };
  architecture?: { input_modalities?: string[]; modality?: string };
};

function parseOptionalPrice(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function trim(m: RawModel): CatalogModel | null {
  if (!m.id) return null;
  const provider = m.id.split('/')[0] ?? 'unknown';
  const promptPrice = parseFloat(m.pricing?.prompt ?? '0');
  const completionPrice = parseFloat(m.pricing?.completion ?? '0');
  const modalities = m.architecture?.input_modalities
    ?? (m.architecture?.modality ? [m.architecture.modality] : ['text']);
  return {
    id: m.id,
    name: m.name ?? m.id,
    context_length: m.context_length ?? 0,
    pricing: {
      prompt: promptPrice,
      completion: completionPrice,
      internal_reasoning: parseOptionalPrice(m.pricing?.internal_reasoning),
      input_cache_read: parseOptionalPrice(m.pricing?.input_cache_read),
    },
    modalities,
    provider,
  };
}

export async function GET() {
  const now = Date.now();
  if (!globalThis.__modelsCache || now - globalThis.__modelsCache.at > TTL_MS) {
    try {
      const data = await fetchCatalog();
      globalThis.__modelsCache = { at: now, data };
    } catch (err) {
      if (!globalThis.__modelsCache) {
        return NextResponse.json(
          { error: (err as Error).message },
          { status: 502 },
        );
      }
    }
  }
  return NextResponse.json({ models: globalThis.__modelsCache.data });
}
