import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export type CreditsInfo = {
  totalCredits: number;
  totalUsage: number;
  balance: number;
  /** True when no credits have ever been deposited (total_credits === 0). */
  unfunded: boolean;
};

type Cache = { at: number; data: CreditsInfo };
const TTL_MS = 30_000;

declare global {
  // eslint-disable-next-line no-var
  var __creditsCache: Cache | undefined;
}

export async function GET() {
  const now = Date.now();
  if (globalThis.__creditsCache && now - globalThis.__creditsCache.at < TTL_MS) {
    return NextResponse.json(globalThis.__creditsCache.data);
  }
  try {
    const res = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ''}` },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `OpenRouter /credits returned ${res.status}` },
        { status: 502 },
      );
    }
    const json = (await res.json()) as {
      data?: { total_credits?: number; total_usage?: number };
    };
    const totalCredits = Number(json.data?.total_credits ?? 0);
    const totalUsage = Number(json.data?.total_usage ?? 0);
    const info: CreditsInfo = {
      totalCredits,
      totalUsage,
      balance: totalCredits - totalUsage,
      unfunded: totalCredits === 0,
    };
    globalThis.__creditsCache = { at: now, data: info };
    return NextResponse.json(info);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 502 },
    );
  }
}
