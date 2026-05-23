import { NextResponse } from 'next/server';

import type { LeaderboardRow } from '@/lib/leaderboard';

export const runtime = 'nodejs';

// PLACEHOLDER. No real backend exists. These rows are illustrative so the UI
// can be built end-to-end. When a backend is deployed (e.g., a Cloudflare KV
// or Postgres table that aggregates sanitized contributions), replace this
// handler with a real fetch from that store.
//
// The contribution endpoint (POST below) intentionally responds 202 without
// persisting anything — your contributions are accepted but discarded until
// a real backend is wired up.

const PLACEHOLDER: LeaderboardRow[] = [
  {
    model: 'anthropic/claude-sonnet-4.6',
    totalRatings: 2410,
    upvoteRate: 0.78,
    blindWins: 612,
    blindAppearances: 1240,
    costPerUpvote: 0.018,
  },
  {
    model: 'openai/gpt-5',
    totalRatings: 2102,
    upvoteRate: 0.73,
    blindWins: 488,
    blindAppearances: 1187,
    costPerUpvote: 0.061,
  },
  {
    model: 'anthropic/claude-opus-4.5',
    totalRatings: 1843,
    upvoteRate: 0.81,
    blindWins: 471,
    blindAppearances: 1102,
    costPerUpvote: 0.115,
  },
  {
    model: 'google/gemini-2.5-pro',
    totalRatings: 1521,
    upvoteRate: 0.71,
    blindWins: 312,
    blindAppearances: 998,
    costPerUpvote: 0.012,
  },
  {
    model: 'deepseek/deepseek-chat',
    totalRatings: 1402,
    upvoteRate: 0.66,
    blindWins: 198,
    blindAppearances: 921,
    costPerUpvote: 0.0014,
  },
  {
    model: 'x-ai/grok-4',
    totalRatings: 887,
    upvoteRate: 0.62,
    blindWins: 117,
    blindAppearances: 612,
    costPerUpvote: 0.024,
  },
];

export async function GET() {
  return NextResponse.json({
    deployed: false,
    note: 'No backend is deployed. These rows are illustrative placeholders so the UI is testable end-to-end.',
    rows: PLACEHOLDER,
  });
}

export async function POST() {
  // Accept-and-discard. When a real backend is deployed, parse the JSON body
  // (an array of LeaderboardContribution) and write to the aggregation store.
  return NextResponse.json({ accepted: true, persisted: false }, { status: 202 });
}
