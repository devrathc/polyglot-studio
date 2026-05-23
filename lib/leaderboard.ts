// Scaffolding for an opt-in, anonymized public leaderboard.
//
// IMPORTANT: there is no deployed backend. The /api/leaderboard route returns
// deterministic placeholder rows so the UI can be built and tested end-to-end.
// When a real backend is deployed, the contribution path here is the only piece
// that needs to start actually transmitting data.

import type { CallRecord, BlindVote } from '@/lib/stats';

const OPT_IN_KEY = 'openrouter-studio:leaderboard:opt-in';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function getLeaderboardOptIn(): boolean {
  if (!isBrowser()) return false;
  return window.localStorage.getItem(OPT_IN_KEY) === 'true';
}

export function setLeaderboardOptIn(on: boolean): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(OPT_IN_KEY, on ? 'true' : 'false');
}

// A single row that *would* be submitted to the public dataset. Critical:
// no prompts, no responses, no timestamps fine-grained enough to fingerprint,
// no account / IP info. Just the comparative signal — which model got the
// user's 👍, the model that competed and lost, and the cost.
//
// Truncate timestamps to UTC date so a row can't be matched back to a session.
export type LeaderboardContribution = {
  kind: 'rating' | 'blind';
  date: string; // YYYY-MM-DD UTC
  model: string;
  // For ratings:
  rating?: 'up' | 'down';
  cost?: number;
  // For blind votes — the model the user picked as winner and the field it beat.
  winner?: string;
  candidates?: string[];
};

function toDate(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

export function sanitizeForLeaderboard(args: {
  records: CallRecord[];
  votes: BlindVote[];
}): LeaderboardContribution[] {
  const out: LeaderboardContribution[] = [];
  for (const r of args.records) {
    if (!r.rating) continue;
    out.push({
      kind: 'rating',
      date: toDate(r.at),
      model: r.resolvedModel || r.model,
      rating: r.rating,
      cost: r.cost,
    });
  }
  for (const v of args.votes) {
    out.push({
      kind: 'blind',
      date: toDate(v.at),
      model: v.winner,
      winner: v.winner,
      candidates: v.candidates,
    });
  }
  return out;
}

export type LeaderboardRow = {
  model: string;
  totalRatings: number;
  upvoteRate: number;
  blindWins: number;
  blindAppearances: number;
  costPerUpvote: number | null;
};
