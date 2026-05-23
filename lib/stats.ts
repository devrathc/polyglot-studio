// Persistent log of every model call the user runs, plus the user's
// thumbs-up/down rating where given, and Compare's blind-test votes.
// Backed by localStorage so it survives reloads; capped to MAX_RECORDS
// (FIFO) so the store stays bounded.

import type { ChatMode } from '@/lib/storage';

export type Rating = 'up' | 'down';

export type CallRecord = {
  id: string;
  /** Unix ms. */
  at: number;
  tab: 'chat' | 'compare' | 'multimodal';
  /** Model id sent in the request (may be openrouter/auto or openrouter/free). */
  model: string;
  /** The concrete model OpenRouter actually ran, when different from `model`. */
  resolvedModel?: string;
  mode: ChatMode;
  prompt_tokens?: number;
  completion_tokens?: number;
  reasoning_tokens?: number;
  cached_tokens?: number;
  /** Total cost in USD computed from usage × catalog rates. 0 for free models. */
  cost: number;
  /** Whether the openrouter:web_search / web_fetch tools were sent. */
  webSearch?: boolean;
  rating?: Rating;
  /** Optional free-text note the user attached when rating. */
  comment?: string;
};

export type BlindVote = {
  id: string;
  at: number;
  /** Truncated prompt, for context only. */
  prompt: string;
  /** All model ids that competed in this blind round. */
  candidates: string[];
  /** The model the user picked, after labels were revealed. */
  winner: string;
};

const RECORDS_KEY = 'polyglot-studio:stats:records:v1';
const VOTES_KEY = 'polyglot-studio:stats:votes:v1';
const MAX_RECORDS = 1000;
const MAX_VOTES = 500;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function loadRecords(): CallRecord[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(RECORDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CallRecord[]) : [];
  } catch {
    return [];
  }
}

function saveRecords(records: CallRecord[]): void {
  if (!isBrowser()) return;
  try {
    const trimmed =
      records.length > MAX_RECORDS ? records.slice(records.length - MAX_RECORDS) : records;
    window.localStorage.setItem(RECORDS_KEY, JSON.stringify(trimmed));
  } catch {
    // quota — ignore
  }
}

export function appendRecord(record: CallRecord): void {
  const all = loadRecords();
  all.push(record);
  saveRecords(all);
}

export function rateRecord(id: string, rating: Rating | null): void {
  const all = loadRecords();
  const idx = all.findIndex((r) => r.id === id);
  if (idx < 0) return;
  if (rating === null) {
    delete all[idx].rating;
  } else {
    all[idx] = { ...all[idx], rating };
  }
  saveRecords(all);
}

export function commentRecord(id: string, comment: string | null): void {
  const all = loadRecords();
  const idx = all.findIndex((r) => r.id === id);
  if (idx < 0) return;
  if (!comment || !comment.trim()) {
    delete all[idx].comment;
  } else {
    all[idx] = { ...all[idx], comment: comment.trim().slice(0, 1000) };
  }
  saveRecords(all);
}

export function newRecordId(): string {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function loadVotes(): BlindVote[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(VOTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BlindVote[]) : [];
  } catch {
    return [];
  }
}

export function appendVote(vote: BlindVote): void {
  if (!isBrowser()) return;
  try {
    const all = loadVotes();
    all.push(vote);
    const trimmed = all.length > MAX_VOTES ? all.slice(all.length - MAX_VOTES) : all;
    window.localStorage.setItem(VOTES_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
}

// ---- Aggregations ---------------------------------------------------------

export type ModelStats = {
  model: string;
  calls: number;
  upvotes: number;
  downvotes: number;
  unrated: number;
  notes: number;
  totalCost: number;
  avgCost: number;
  /** USD per upvote. Infinity when there are no upvotes yet. */
  costPerUpvote: number;
  /** upvotes / (upvotes + downvotes). 0 when no ratings. */
  upvoteRate: number;
  /** Most recent 1–2 notes attached to a call against this model. */
  recentNotes: string[];
};

export function rollupByModel(records: CallRecord[]): ModelStats[] {
  const map = new Map<string, ModelStats>();
  // Track newest comments per model so we can surface a peek.
  const noteBuckets = new Map<string, { at: number; comment: string }[]>();
  for (const r of records) {
    const key = r.resolvedModel || r.model;
    const cur =
      map.get(key) ?? {
        model: key,
        calls: 0,
        upvotes: 0,
        downvotes: 0,
        unrated: 0,
        notes: 0,
        totalCost: 0,
        avgCost: 0,
        costPerUpvote: Infinity,
        upvoteRate: 0,
        recentNotes: [],
      };
    cur.calls += 1;
    cur.totalCost += r.cost || 0;
    if (r.rating === 'up') cur.upvotes += 1;
    else if (r.rating === 'down') cur.downvotes += 1;
    else cur.unrated += 1;
    if (r.comment) {
      cur.notes += 1;
      const bucket = noteBuckets.get(key) ?? [];
      bucket.push({ at: r.at, comment: r.comment });
      noteBuckets.set(key, bucket);
    }
    map.set(key, cur);
  }
  for (const [model, s] of map.entries()) {
    s.avgCost = s.calls > 0 ? s.totalCost / s.calls : 0;
    s.costPerUpvote = s.upvotes > 0 ? s.totalCost / s.upvotes : Infinity;
    const rated = s.upvotes + s.downvotes;
    s.upvoteRate = rated > 0 ? s.upvotes / rated : 0;
    const bucket = noteBuckets.get(model);
    if (bucket) {
      s.recentNotes = bucket
        .sort((a, b) => b.at - a.at)
        .slice(0, 2)
        .map((n) => n.comment);
    }
  }
  return [...map.values()].sort((a, b) => b.calls - a.calls);
}

export type WindowSpend = {
  windowDays: number;
  totalCost: number;
  callCount: number;
  monthlyProjection: number;
  byProvider: { provider: string; cost: number }[];
};

export function spendInWindow(records: CallRecord[], days: number): WindowSpend {
  const cutoff = Date.now() - days * 86_400_000;
  const recent = records.filter((r) => r.at >= cutoff);
  const totalCost = recent.reduce((s, r) => s + (r.cost || 0), 0);
  const perProvider = new Map<string, number>();
  for (const r of recent) {
    const provider = (r.resolvedModel || r.model).split('/')[0] ?? 'unknown';
    perProvider.set(provider, (perProvider.get(provider) ?? 0) + (r.cost || 0));
  }
  return {
    windowDays: days,
    totalCost,
    callCount: recent.length,
    monthlyProjection: days > 0 ? (totalCost / days) * 30 : 0,
    byProvider: [...perProvider.entries()]
      .map(([provider, cost]) => ({ provider, cost }))
      .sort((a, b) => b.cost - a.cost),
  };
}

export type BlindRollup = {
  model: string;
  wins: number;
  appearances: number;
  winRate: number;
};

export function rollupBlindVotes(votes: BlindVote[]): BlindRollup[] {
  const appearances = new Map<string, number>();
  const wins = new Map<string, number>();
  for (const v of votes) {
    for (const c of v.candidates) {
      appearances.set(c, (appearances.get(c) ?? 0) + 1);
    }
    wins.set(v.winner, (wins.get(v.winner) ?? 0) + 1);
  }
  const out: BlindRollup[] = [];
  for (const [model, app] of appearances.entries()) {
    const w = wins.get(model) ?? 0;
    out.push({
      model,
      wins: w,
      appearances: app,
      winRate: app > 0 ? w / app : 0,
    });
  }
  return out.sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
}

// ---- Subscriptions reference --------------------------------------------

export type Subscription = {
  name: string;
  monthly: number;
  /** Provider prefix (matches model id), or '*' for any. */
  scope: '*' | 'anthropic' | 'openai' | 'google';
  notes: string;
};

export const SUBSCRIPTIONS: Subscription[] = [
  {
    name: 'ChatGPT Plus',
    monthly: 20,
    scope: 'openai',
    notes: 'Unlocks GPT-5 and reasoning models in chat.openai.com. Not API access.',
  },
  {
    name: 'Claude Pro',
    monthly: 20,
    scope: 'anthropic',
    notes: 'Higher Claude.ai message caps. Not API access.',
  },
  {
    name: 'Gemini Advanced',
    monthly: 19.99,
    scope: 'google',
    notes: '2 TB Drive + Gemini in Workspace. Not API access.',
  },
  {
    name: 'Claude Max (5×)',
    monthly: 100,
    scope: 'anthropic',
    notes: '5× the Pro caps. Still not API.',
  },
];
