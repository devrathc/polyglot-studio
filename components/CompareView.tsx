'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogModel } from '@/app/api/models/route';
import { computeCostBreakdown, fetchCatalog, findModel, formatUSD } from '@/lib/pricing';
import { HistoryDrawer } from '@/components/HistoryDrawer';
import { Markdown } from '@/components/Markdown';
import { ModeToggle } from '@/components/ModeToggle';
import { PricingNote } from '@/components/PricingNote';
import { TabHeader } from '@/components/TabHeader';
import { Tip } from '@/components/Tip';
import { WebAccessToggle } from '@/components/WebAccessToggle';
import type { StructuredError } from '@/lib/errors';
import {
  appendRecord,
  appendVote,
  commentRecord,
  loadRecords,
  newRecordId,
  rateRecord,
  type Rating,
} from '@/lib/stats';
import { consumeBlindDemo, SAMPLE_BLIND_PROMPT } from '@/lib/onboarding';
import {
  DEFAULT_COMPARE_DEFAULTS,
  FREE_COMPARE_DEFAULTS,
  isFreeModel,
  resolveCuratedDefaults,
  resolveCuratedFree,
} from '@/lib/routing';
import {
  type ChatMode,
  getCompareMode,
  loadActiveId,
  loadCompareDefaults,
  loadSessionList,
  newSessionId,
  saveActiveId,
  saveCompareDefaults,
  saveSessionList,
  setCompareMode,
} from '@/lib/storage';

type CompareUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  reasoning_tokens?: number;
  cached_tokens?: number;
};

type CompareResult = {
  model: string;
  resolvedModel?: string;
  content?: string;
  latencyMs: number;
  usage?: CompareUsage;
  error?: string;
  errorInfo?: StructuredError;
  truncatedTo?: number;
  finishReason?: string;
  refusal?: string;
  retriedAfterRateLimit?: boolean;
  /** True while the card is still streaming tokens. */
  streaming?: boolean;
  /** Id this slot was originally launched with, if a swap replaced it. */
  swappedFrom?: string;
  /** Stable id assigned at run time so ratings persist with the result. */
  recordId?: string;
};

type CompareSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  prompt: string;
  models: string[];
  results: CompareResult[] | null;
  /** Mode the session was created in. Older sessions default to 'default'. */
  mode?: ChatMode;
  /** Whether OpenRouter server tools (web_search / web_fetch) were enabled. */
  webAccess?: boolean;
};

const DEFAULT_MODELS = DEFAULT_COMPARE_DEFAULTS;

const MAX_SLOTS = 5;

type CompareStreamEvent =
  | { type: 'start'; i: number; model: string }
  | { type: 'swap'; i: number; fromModel: string; toModel: string; reason: string }
  | { type: 'model'; i: number; resolvedModel: string }
  | { type: 'delta'; i: number; text: string }
  | { type: 'usage'; i: number; usage: CompareUsage }
  | {
      type: 'done';
      i: number;
      model: string;
      resolvedModel?: string;
      latencyMs: number;
      finishReason?: string;
      refusal?: string;
      retriedAfterRateLimit?: boolean;
      truncatedTo?: number;
    }
  | {
      type: 'error';
      i: number;
      model: string;
      latencyMs: number;
      error: string;
      errorInfo: StructuredError;
      retriedAfterRateLimit?: boolean;
    };

function applyCompareEvent(
  evt: CompareStreamEvent,
  patch: (i: number, fn: (r: CompareResult) => CompareResult) => void,
): void {
  switch (evt.type) {
    case 'start':
      patch(evt.i, (r) => ({ ...r, model: evt.model, streaming: true, content: r.content ?? '' }));
      return;
    case 'swap':
      patch(evt.i, (r) => ({
        ...r,
        swappedFrom: evt.fromModel,
        model: evt.toModel,
        // Clear the previous attempt's transient state — the new model
        // gets a fresh slot.
        content: '',
        error: undefined,
        errorInfo: undefined,
        resolvedModel: undefined,
        usage: undefined,
        finishReason: undefined,
        refusal: undefined,
        retriedAfterRateLimit: undefined,
        streaming: true,
      }));
      return;
    case 'model':
      patch(evt.i, (r) => ({ ...r, resolvedModel: evt.resolvedModel }));
      return;
    case 'delta':
      patch(evt.i, (r) => ({ ...r, content: (r.content ?? '') + evt.text }));
      return;
    case 'usage':
      patch(evt.i, (r) => ({ ...r, usage: evt.usage }));
      return;
    case 'done':
      patch(evt.i, (r) => ({
        ...r,
        latencyMs: evt.latencyMs,
        resolvedModel: evt.resolvedModel ?? r.resolvedModel,
        finishReason: evt.finishReason,
        refusal: evt.refusal,
        retriedAfterRateLimit: evt.retriedAfterRateLimit,
        truncatedTo: evt.truncatedTo,
        streaming: false,
      }));
      return;
    case 'error':
      patch(evt.i, (r) => ({
        ...r,
        model: evt.model,
        latencyMs: evt.latencyMs,
        error: evt.error,
        errorInfo: evt.errorInfo,
        retriedAfterRateLimit: evt.retriedAfterRateLimit,
        streaming: false,
      }));
      return;
  }
}

const GRID_COLS: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-2 xl:grid-cols-4',
  5: 'md:grid-cols-2 xl:grid-cols-5',
};

function defaultsFor(mode: ChatMode, catalog: CatalogModel[]): string[] {
  const stored = loadCompareDefaults(mode);
  if (stored && stored.length > 0) {
    if (catalog.length === 0) return stored;
    return mode === 'free'
      ? resolveCuratedFree(stored, catalog)
      : resolveCuratedDefaults(stored, catalog);
  }
  if (mode === 'free') {
    return catalog.length > 0
      ? resolveCuratedFree(FREE_COMPARE_DEFAULTS, catalog)
      : FREE_COMPARE_DEFAULTS;
  }
  return catalog.length > 0
    ? resolveCuratedDefaults(DEFAULT_MODELS, catalog)
    : DEFAULT_MODELS;
}

function makeSession(mode: ChatMode, catalog: CatalogModel[]): CompareSession {
  const now = Date.now();
  return {
    id: newSessionId(),
    title: 'New compare',
    createdAt: now,
    updatedAt: now,
    prompt: '',
    models: defaultsFor(mode, catalog),
    results: null,
    mode,
  };
}

function deriveCompareTitle(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) return 'New compare';
  return trimmed.slice(0, 60).split('\n')[0] || 'New compare';
}

export function CompareView() {
  // SSR-safe: start with empty/neutral state so the server and the first
  // client render produce identical HTML. The real values from localStorage
  // are loaded in the hydration effect below, after which `hydrated` flips
  // and the sync-back effects unblock.
  const [hydrated, setHydrated] = useState(false);
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [sessions, setSessions] = useState<CompareSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<ChatMode>('default');

  const active = useMemo(
    () => (activeId ? sessions.find((s) => s.id === activeId) ?? null : null),
    [sessions, activeId],
  );

  const [prompt, setPrompt] = useState<string>('');
  const [models, setModels] = useState<string[]>(DEFAULT_MODELS);
  const [results, setResults] = useState<CompareResult[] | null>(null);
  const [webAccess, setWebAccess] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
  const [ratings, setRatings] = useState<Record<string, Rating | undefined>>({});
  const [comments, setComments] = useState<Record<string, string | undefined>>({});
  const [blind, setBlind] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [blindWinner, setBlindWinner] = useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // Hydrate from localStorage after mount. Runs once; subsequent edits flow
  // through the sync-back effects below.
  useEffect(() => {
    const initialMode: ChatMode = getCompareMode() ?? 'default';
    const loaded = loadSessionList<CompareSession>('compare');
    const initialSessions =
      loaded.length > 0 ? loaded : [makeSession(initialMode, [])];
    const initialActive =
      loadActiveId('compare') ?? initialSessions[0]?.id ?? null;
    const initialSession = initialActive
      ? initialSessions.find((s) => s.id === initialActive) ?? null
      : null;

    setMode(initialMode);
    setSessions(initialSessions);
    setActiveId(initialActive);
    if (initialSession) {
      setPrompt(initialSession.prompt);
      setModels(initialSession.models);
      setResults(initialSession.results);
      setWebAccess(
        initialSession.mode === 'free' ? false : !!initialSession.webAccess,
      );
    }

    const map: Record<string, Rating | undefined> = {};
    const cmap: Record<string, string | undefined> = {};
    for (const r of loadRecords()) {
      if (r.rating) map[r.id] = r.rating;
      if (r.comment) cmap[r.id] = r.comment;
    }
    setRatings(map);
    setComments(cmap);

    // First-run demo: when About staged a Blind demo, start a fresh session
    // with a sample prompt, blind mode on, and the active mode's lineup.
    if (consumeBlindDemo()) {
      const fresh = makeSession(initialMode, []);
      fresh.prompt = SAMPLE_BLIND_PROMPT;
      setSessions((curr) => [fresh, ...curr]);
      setActiveId(fresh.id);
      setPrompt(SAMPLE_BLIND_PROMPT);
      setModels(fresh.models);
      setResults(null);
      setBlind(true);
      setRevealed(false);
      setBlindWinner(null);
    }

    setHydrated(true);
  }, []);

  function handleRate(recordId: string, rating: Rating | null) {
    rateRecord(recordId, rating);
    setRatings((curr) => {
      const next = { ...curr };
      if (rating === null) delete next[recordId];
      else next[recordId] = rating;
      return next;
    });
  }

  function handleComment(recordId: string, comment: string | null) {
    commentRecord(recordId, comment);
    setComments((curr) => {
      const next = { ...curr };
      if (!comment) delete next[recordId];
      else next[recordId] = comment;
      return next;
    });
  }

  useEffect(() => {
    fetchCatalog().then(setCatalog).catch(() => setCatalog([]));
  }, []);

  // Once the catalog arrives, scrub any dead ids out of the current lineup
  // (e.g. `x-ai/grok-4` rolled forward to `x-ai/grok-4.20`). Without this the
  // dropdown shows "not in OpenRouter catalog" for persisted sessions until
  // the user manually swaps the slot.
  useEffect(() => {
    if (catalog.length === 0) return;
    const live = new Set(catalog.map((m) => m.id));
    const hasDead = models.some((m) => m && !live.has(m));
    if (!hasDead) return;
    const resolved = mode === 'free'
      ? resolveCuratedFree(models, catalog)
      : resolveCuratedDefaults(models, catalog);
    if (resolved.length > 0 && resolved.join('|') !== models.join('|')) {
      setModels(resolved);
      saveCompareDefaults(mode, resolved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  // Sync local prompt/models/results/mode/webAccess into the active session
  useEffect(() => {
    if (!hydrated || !activeId) return;
    setSessions((curr) =>
      curr.map((s) =>
        s.id === activeId
          ? {
              ...s,
              prompt,
              models,
              results,
              mode,
              webAccess: mode === 'free' ? false : webAccess,
              title: deriveCompareTitle(prompt) || s.title,
              updatedAt: Date.now(),
            }
          : s,
      ),
    );
  }, [prompt, models, results, mode, webAccess, activeId, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveSessionList('compare', sessions);
  }, [sessions, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveActiveId('compare', activeId);
  }, [activeId, hydrated]);

  function newCompare() {
    const fresh = makeSession(mode, catalog);
    setSessions((curr) => [fresh, ...curr]);
    setActiveId(fresh.id);
    setPrompt('');
    setModels(fresh.models);
    setResults(null);
  }

  function selectSession(id: string) {
    const s = sessions.find((x) => x.id === id);
    if (!s) return;
    const sessionMode: ChatMode = s.mode === 'free' ? 'free' : 'default';
    setActiveId(id);
    setPrompt(s.prompt);
    setModels(s.models);
    setResults(s.results);
    setWebAccess(sessionMode === 'free' ? false : !!s.webAccess);
    if (sessionMode !== mode) {
      setMode(sessionMode);
      setCompareMode(sessionMode);
    }
  }

  function deleteSession(id: string) {
    setSessions((curr) => {
      const next = curr.filter((s) => s.id !== id);
      if (id === activeId) {
        if (next.length > 0) {
          const fallback = next[0];
          const fallbackMode: ChatMode = fallback.mode === 'free' ? 'free' : 'default';
          setActiveId(fallback.id);
          setPrompt(fallback.prompt);
          setModels(fallback.models);
          setResults(fallback.results);
          if (fallbackMode !== mode) {
            setMode(fallbackMode);
            setCompareMode(fallbackMode);
          }
        } else {
          // No sessions left — bootstrap a fresh one
          const fresh = makeSession(mode, catalog);
          setActiveId(fresh.id);
          setPrompt('');
          setModels(fresh.models);
          setResults(null);
          return [fresh];
        }
      }
      return next;
    });
  }

  function pickBlindWinner(modelId: string) {
    if (!results || revealed || !blind) return;
    const candidates = results.map((r) => r.model);
    setBlindWinner(modelId);
    setRevealed(true);
    appendVote({
      id: newRecordId(),
      at: Date.now(),
      prompt: prompt.slice(0, 200),
      candidates,
      winner: modelId,
    });
  }

  function handleModeChange(next: ChatMode) {
    if (next === mode) return;
    setMode(next);
    setCompareMode(next);
    // Swap the current session's lineup to that mode's saved defaults so the
    // toggle feels like a real mode switch, not just a label change.
    const lineup = defaultsFor(next, catalog);
    setModels(lineup);
    setResults(null);
  }

  // Keep a synchronous ref to the in-flight results so per-card stream
  // events don't race when several deltas land in the same tick. React state
  // setters batch and would otherwise overwrite each other in a `setState((c)
  // => …)` chain across N concurrent streams.
  const streamingRef = useRef<CompareResult[] | null>(null);

  async function run() {
    const text = prompt.trim();
    if (!text || busy) return;

    if (catalog.length > 0) {
      const validIds = new Set(catalog.map((m) => m.id));
      const invalid = models.filter((m) => m && !validIds.has(m));
      if (invalid.length > 0) {
        setResults(
          models.map((m) => ({
            model: m,
            latencyMs: 0,
            error: validIds.has(m)
              ? undefined
              : `Not in OpenRouter catalog. Pick a valid model from the dropdown.`,
          })),
        );
        return;
      }
    }

    setBusy(true);
    setRevealed(false);
    setBlindWinner(null);
    const useWebAccess = mode !== 'free' && webAccess;

    const launched = models.filter(Boolean);
    // Seed one streaming-result row per launched slot so the cards render
    // immediately (instead of "Waiting…" placeholders).
    const initial: CompareResult[] = launched.map((m) => ({
      model: m,
      latencyMs: 0,
      content: '',
      streaming: true,
    }));
    streamingRef.current = initial;
    setResults(initial);

    // Build the alternates pool from the active mode's catalog, excluding
    // ids already in the lineup. Free mode draws from :free ids; default
    // mode draws from everything else (paid). Capped to keep the request
    // small.
    const inLineup = new Set(launched);
    const altPool = mode === 'free'
      ? catalog.filter((m) => isFreeModel(m.id) && !inLineup.has(m.id)).map((m) => m.id)
      : catalog.filter((m) => !isFreeModel(m.id) && !inLineup.has(m.id)).map((m) => m.id);
    // Bound it — sending a 200-item array per request is wasteful, and the
    // server only needs one alternate per swap (we allow one swap per slot).
    const alternates = altPool.slice(0, Math.max(10, launched.length * 3));

    const patch = (i: number, fn: (r: CompareResult) => CompareResult) => {
      const curr = streamingRef.current;
      if (!curr) return;
      const next = curr.slice();
      if (!next[i]) return;
      next[i] = fn(next[i]);
      streamingRef.current = next;
      setResults(next);
    };

    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          models: launched,
          messages: [{ role: 'user', content: text }],
          alternates,
          webAccess: useWebAccess,
        }),
      });

      if (!res.ok || !res.body) {
        let errMsg = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          if (j?.error) errMsg = j.error;
        } catch {}
        const failed: CompareResult[] = launched.map((m) => ({
          model: m,
          latencyMs: 0,
          error: errMsg,
        }));
        streamingRef.current = failed;
        setResults(failed);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const evt of events) {
          const line = evt.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          let parsed: CompareStreamEvent;
          try {
            parsed = JSON.parse(data) as CompareStreamEvent;
          } catch {
            continue;
          }
          applyCompareEvent(parsed, patch);
        }
      }

      // Finalize: stamp record ids, clear streaming flag, log to stats.
      const finalized = (streamingRef.current ?? []).map((r) => {
        if (r.error || (!r.content && !r.finishReason)) return { ...r, streaming: false };
        const recordId = r.recordId ?? newRecordId();
        return { ...r, recordId, streaming: false };
      });
      streamingRef.current = finalized;
      setResults(finalized);
      for (const r of finalized) {
        if (r.error || !r.recordId) continue;
        const m = findModel(catalog, r.resolvedModel || r.model);
        const cost = computeCostBreakdown(m, r.usage)?.total ?? 0;
        appendRecord({
          id: r.recordId,
          at: Date.now(),
          tab: 'compare',
          model: r.model,
          resolvedModel: r.resolvedModel,
          mode,
          prompt_tokens: r.usage?.prompt_tokens,
          completion_tokens: r.usage?.completion_tokens,
          reasoning_tokens: r.usage?.reasoning_tokens,
          cached_tokens: r.usage?.cached_tokens,
          cost,
          webSearch: useWebAccess,
        });
      }
    } catch (err) {
      const failed: CompareResult[] = (streamingRef.current ?? []).map((r) => ({
        ...r,
        streaming: false,
        error: r.error ?? (err as Error).message,
      }));
      streamingRef.current = failed;
      setResults(failed);
    } finally {
      setBusy(false);
    }
  }

  function updateModel(idx: number, id: string) {
    const next = [...models];
    next[idx] = id;
    setModels(next);
    // Persist this lineup as the mode's saved default — future sessions
    // and mode-switches will use it.
    saveCompareDefaults(mode, next);
  }

  function addModel() {
    if (models.length >= MAX_SLOTS) return;
    const used = new Set(models);
    const pool =
      mode === 'free'
        ? defaultsFor('free', catalog)
        : DEFAULT_MODELS;
    const fallback = pool.find((m) => !used.has(m)) ?? '';
    const next = [...models, fallback];
    setModels(next);
    saveCompareDefaults(mode, next);
  }

  function removeModel(idx: number) {
    if (models.length <= 1) return;
    const next = models.filter((_, i) => i !== idx);
    setModels(next);
    saveCompareDefaults(mode, next);
  }

  const gridCols = GRID_COLS[models.length] ?? GRID_COLS[3];

  return (
    <div className="flex flex-1 overflow-hidden">
      <HistoryDrawer
        items={sessions.map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt }))}
        activeId={activeId}
        onSelect={selectSession}
        onNew={newCompare}
        onDelete={deleteSession}
        newLabel="+ New compare"
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        <TabHeader
          title="Compare"
          description="Run the same prompt against up to 5 models in parallel and inspect outputs side-by-side. Each card shows the response, token breakdown, and dollar cost."
          techNote="POST /api/v1/chat/completions (non-streaming) per model · fan-out via Promise.all"
          centered={false}
          pricing={
            <PricingNote
              wallet="OpenRouter credits — one billed call per model card. Cards with a BYOK-eligible model bill the provider account for that model instead. Free Only mode is $0 per token across all 5 cards."
              when="Each card is charged independently the moment its response returns. A 500-token comparison across 5 flagship models typically lands at $0.05–$0.20; in Free Only mode the total stays at $0 (subject to free-pool rate caps)."
              byok="BYOK applies per provider, so a Compare run can mix wallets: an Anthropic key sends Claude cards to your Anthropic console; everything else stays on OpenRouter credits."
              note="Premium models (Opus, GPT-5) cost 10–100× more per token than budget models — watch the Cost preview before you hit run."
            />
          }
        />
        <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 overflow-hidden p-6">
        <div className="grid gap-3 md:grid-cols-3">
          <ModeToggle mode={mode} onChange={handleModeChange} title="Compare mode" />
          <WebAccessToggle
            on={webAccess}
            onChange={(next) => mode !== 'free' && setWebAccess(next)}
            lockedReason={
              mode === 'free'
                ? 'Disabled in Free Only mode — each search costs ~$0.005–$0.02 in OpenRouter credits even when the model is free.'
                : undefined
            }
          />
          <section
            className={`rounded-xl border p-3 transition-colors ${
              blind
                ? 'border-purple-500/40 bg-purple-500/[0.06]'
                : 'border-neutral-900 bg-[#0d0d10]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  Blind mode
                </h3>
                <p className="mt-0.5 text-[10.5px] leading-snug text-neutral-500">
                  {blind
                    ? revealed
                      ? 'Models revealed. Vote saved.'
                      : 'Models hidden. Pick a favorite to reveal.'
                    : 'Reveals model identity after you pick your favorite — defeats brand bias.'}
                </p>
              </div>
              <Tip content="Hide model identities in each result card. After you click 'Pick this one' on the answer you like best, labels are revealed and the vote is saved to your blind-test history in Insights.">
                <button
                  type="button"
                  role="switch"
                  aria-checked={blind}
                  onClick={() => {
                    setBlind((b) => !b);
                    setRevealed(false);
                    setBlindWinner(null);
                  }}
                  className={`relative ml-3 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    blind ? 'bg-purple-500/70' : 'bg-neutral-800'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      blind ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </Tip>
            </div>
          </section>
        </div>
        <div className="rounded-2xl border border-neutral-900 bg-[#0d0d10] p-4">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Paste a prompt to run against multiple models in parallel…"
          rows={3}
          className="w-full resize-none rounded-md border border-neutral-800 bg-[#101013] p-3 text-sm outline-none focus:border-neutral-600"
        />
        {blind && !revealed ? (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-purple-500/30 bg-purple-500/[0.04] px-3 py-2 text-[11.5px] text-purple-200">
            <span aria-hidden>👁‍🗨</span>
            <span>
              <strong className="text-purple-100">{models.filter(Boolean).length} models loaded</strong> —
              identities hidden in Blind mode. Turn Blind off to edit the lineup or wait until you reveal.
            </span>
          </div>
        ) : (
          <div className={`mt-3 grid grid-cols-1 gap-2 ${gridCols}`}>
            {models.map((m, i) => (
              <ModelPicker
                key={i}
                catalog={catalog}
                value={m}
                canRemove={models.length > 1}
                onChange={(id) => updateModel(i, id)}
                onRemove={() => removeModel(i)}
                freeOnly={mode === 'free'}
              />
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between">
          {blind && !revealed ? (
            <span className="text-[11px] text-neutral-500">Lineup locked while blind run pending.</span>
          ) : (
          <Tip content={`Add another slot (max ${MAX_SLOTS}). Each slot runs an independent /chat/completions call.`}>
            <button
              type="button"
              onClick={addModel}
              disabled={models.length >= MAX_SLOTS}
              className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-900 disabled:opacity-40"
            >
              + Add model {models.length >= MAX_SLOTS ? `(max ${MAX_SLOTS})` : ''}
            </button>
          </Tip>
          )}
          <Tip content="Fans the prompt out to every selected model in parallel via Promise.all. Each card is billed independently against its model's wallet.">
            <button
              type="button"
              onClick={run}
              disabled={busy || !prompt.trim()}
              className="rounded-md bg-emerald-500 px-4 py-1.5 text-sm font-medium text-black hover:bg-emerald-400 disabled:opacity-40"
            >
              {busy ? 'Running…' : 'Compare'}
            </button>
          </Tip>
        </div>
      </div>

      <div className={`grid flex-1 grid-cols-1 gap-3 overflow-y-auto ${gridCols}`}>
        {(results ?? models.map((m) => ({ model: m, latencyMs: 0 }) as CompareResult)).map(
          (r, i) => (
            <ResultCard
              key={i}
              result={r}
              catalog={catalog}
              pending={busy && !results}
              rating={r.recordId ? ratings[r.recordId] : undefined}
              comment={r.recordId ? comments[r.recordId] : undefined}
              onRate={handleRate}
              onComment={handleComment}
              anonymousLabel={blind && !revealed ? letter(i) : undefined}
              blindActive={blind && !!results && !revealed}
              blindWinner={blindWinner}
              onPickBlind={pickBlindWinner}
              onExpand={() => setExpandedIdx(i)}
            />
          ),
        )}
      </div>

      {expandedIdx != null && results?.[expandedIdx] ? (
        <ExpandedCardModal
          result={results[expandedIdx]}
          catalog={catalog}
          rating={results[expandedIdx].recordId ? ratings[results[expandedIdx].recordId!] : undefined}
          comment={results[expandedIdx].recordId ? comments[results[expandedIdx].recordId!] : undefined}
          onRate={handleRate}
          onComment={handleComment}
          anonymousLabel={blind && !revealed ? letter(expandedIdx) : undefined}
          onClose={() => setExpandedIdx(null)}
        />
      ) : null}
        </div>
      </main>
    </div>
  );
}

function ModelPicker({
  catalog,
  value,
  canRemove,
  onChange,
  onRemove,
  freeOnly = false,
}: {
  catalog: CatalogModel[];
  value: string;
  canRemove: boolean;
  onChange: (id: string) => void;
  onRemove: () => void;
  freeOnly?: boolean;
}) {
  const grouped = useMemo(() => {
    const visible = freeOnly ? catalog.filter((m) => isFreeModel(m.id)) : catalog;
    const byProvider = new Map<string, CatalogModel[]>();
    for (const m of visible) {
      const list = byProvider.get(m.provider) ?? [];
      list.push(m);
      byProvider.set(m.provider, list);
    }
    return [...byProvider.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([provider, list]) => [provider, list.sort((a, b) => a.name.localeCompare(b.name))] as const);
  }, [catalog, freeOnly]);

  const inCatalog = catalog.some(
    (m) => m.id === value && (!freeOnly || isFreeModel(m.id)),
  );

  return (
    <div
      className={`flex items-center gap-1 rounded-md border px-2 py-1 ${
        freeOnly
          ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
          : 'border-neutral-800 bg-neutral-900'
      }`}
    >
      <select
        value={inCatalog ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent font-mono text-xs text-neutral-200 outline-none"
      >
        {!inCatalog && (
          <option value="" disabled>
            {value || (freeOnly ? 'Select a free model…' : 'Select a model…')}
          </option>
        )}
        {grouped.map(([provider, list]) => (
          <optgroup key={provider} label={provider}>
            {list.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove model"
          title="Remove this model slot"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-red-950/60 hover:text-red-300"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M1 1l8 8M9 1L1 9" />
          </svg>
        </button>
      )}
    </div>
  );
}

function letter(i: number): string {
  return `Model ${String.fromCharCode(65 + i)}`;
}

function ResultCard({
  result,
  catalog,
  pending,
  rating,
  comment,
  onRate,
  onComment,
  anonymousLabel,
  blindActive,
  blindWinner,
  onPickBlind,
  onExpand,
}: {
  result: CompareResult;
  catalog: CatalogModel[];
  pending: boolean;
  rating?: Rating;
  comment?: string;
  onRate?: (recordId: string, r: Rating | null) => void;
  onComment?: (recordId: string, c: string | null) => void;
  anonymousLabel?: string;
  blindActive?: boolean;
  blindWinner?: string | null;
  onPickBlind?: (modelId: string) => void;
  onExpand?: () => void;
}) {
  const [noteOpen, setNoteOpen] = useState(!!comment);
  const [noteDraft, setNoteDraft] = useState(comment ?? '');
  useEffect(() => {
    setNoteDraft(comment ?? '');
    if (comment) setNoteOpen(true);
  }, [comment]);
  const model = useMemo(() => findModel(catalog, result.model), [catalog, result.model]);
  const cost = useMemo(() => computeCostBreakdown(model, result.usage), [model, result.usage]);

  const usage = result.usage;
  const promptTokens = usage?.prompt_tokens;
  const completionTokens = usage?.completion_tokens;
  const reasoningTokens = usage?.reasoning_tokens;
  const cachedTokens = usage?.cached_tokens;
  const totalTokens =
    usage?.total_tokens
    ?? ((promptTokens ?? 0) + (completionTokens ?? 0) || undefined);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-neutral-900 bg-[#0d0d10]">
      <div className="flex items-center justify-between border-b border-neutral-900 px-3 py-2">
        <span
          className={`truncate font-mono text-[11px] ${
            anonymousLabel ? 'text-purple-300' : 'text-neutral-300'
          }`}
          title={anonymousLabel ? 'Identity hidden by Blind mode' : result.model}
        >
          {anonymousLabel ?? result.model}
          {blindWinner === result.model && !anonymousLabel ? (
            <span className="ml-2 rounded bg-purple-500/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-purple-200">
              your pick
            </span>
          ) : null}
        </span>
        <div className="flex shrink-0 items-center gap-2 text-[10px] text-neutral-500">
          {result.streaming ? (
            <Tip content="The card is streaming tokens as they arrive from the provider.">
              <span className="flex items-center gap-1 rounded bg-emerald-500/15 px-1 py-0.5 font-mono text-[9px] uppercase tracking-wide text-emerald-200">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
                streaming
              </span>
            </Tip>
          ) : null}
          {result.swappedFrom && !anonymousLabel ? (
            <Tip content={`Original slot was ${result.swappedFrom}, but it was rate-limited. Swapped in this model from the alternates pool so the comparison still has 5 answers.`}>
              <span className="rounded bg-blue-500/15 px-1 py-0.5 font-mono text-[9px] uppercase tracking-wide text-blue-200">
                swapped
              </span>
            </Tip>
          ) : null}
          {result.retriedAfterRateLimit ? (
            <Tip content="This card hit a 429 and recovered after a 2s back-off. The card succeeded, but it cost you extra latency.">
              <span className="rounded bg-amber-500/15 px-1 py-0.5 font-mono text-[9px] uppercase tracking-wide text-amber-200">
                retried
              </span>
            </Tip>
          ) : null}
          {result.latencyMs > 0 ? <span title="End-to-end latency for this card (request start → final byte)">{result.latencyMs}ms</span> : null}
          {cost && !anonymousLabel ? (
            <span className="text-emerald-300" title="Total cost for this card (input + output + reasoning + cached, per the model's published rates)">{formatUSD(cost.total)}</span>
          ) : null}
          {onExpand ? (
            <Tip content="Open this card in a large modal for easier reading and side-by-side comparison.">
              <button
                type="button"
                onClick={onExpand}
                aria-label="Expand card"
                className="flex h-5 w-5 items-center justify-center rounded text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7.5 1.5h3v3M10.5 1.5L7 5M4.5 10.5h-3v-3M1.5 10.5L5 7" />
                </svg>
              </button>
            </Tip>
          ) : null}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 text-[13px] leading-relaxed text-neutral-200">
        {result.error ? (
          <ErrorCard error={result.error} info={result.errorInfo} />
        ) : (pending || result.streaming) && !result.content ? (
          <div className="flex items-center gap-1.5 text-neutral-500">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-500" />
            <span>Waiting for first token…</span>
          </div>
        ) : result.refusal ? (
          <div className="rounded-md bg-amber-500/10 p-2 text-[12px] text-amber-200">
            <div className="mb-1 font-semibold">Refused</div>
            {result.refusal}
          </div>
        ) : result.content ? (
          <>
            <Markdown source={result.content} />
            {result.streaming ? (
              <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-emerald-300 align-text-bottom" aria-hidden />
            ) : null}
          </>
        ) : result.finishReason ? (
          <div className="rounded-md bg-neutral-900 p-2 text-[12px] text-neutral-400">
            <div className="mb-1 font-semibold text-neutral-300">No content returned</div>
            finish_reason: <span className="font-mono">{result.finishReason}</span>
            {result.finishReason === 'length' && (result.usage?.reasoning_tokens ?? 0) > 0 ? (
              <div className="mt-2 text-[11px] text-amber-200/90">
                The model used all <span className="font-mono">{result.usage?.reasoning_tokens?.toLocaleString()}</span>{' '}
                tokens of its budget on internal reasoning before producing visible output.
                The server already auto-retried with a higher cap; this model may need even
                more headroom (try lowering reasoning effort, or pinning to a non-reasoning
                variant like <span className="font-mono">openai/gpt-5-mini</span>).
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-neutral-600">—</div>
        )}
      </div>
      {usage && (
        <div className="border-t border-neutral-900 bg-[#0a0a0c] px-3 py-2 text-[10px] text-neutral-400">
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {promptTokens != null && (
              <UsageRow
                label="Input"
                tokens={promptTokens}
                cost={cost?.inputCost}
                reliable={!!cost?.reliable}
              />
            )}
            {cachedTokens != null && cachedTokens > 0 && (
              <UsageRow
                label="Cached"
                tokens={cachedTokens}
                cost={cost?.cachedDelta}
                reliable={!!cost?.reliable && model?.pricing.input_cache_read != null}
                muted
              />
            )}
            {completionTokens != null && (
              <UsageRow
                label="Output"
                tokens={completionTokens}
                cost={cost?.outputCost}
                reliable={!!cost?.reliable}
              />
            )}
            {reasoningTokens != null && reasoningTokens > 0 && (
              <UsageRow
                label="Reasoning"
                tokens={reasoningTokens}
                cost={cost?.reasoningCost}
                reliable={!!cost?.reliable && model?.pricing.internal_reasoning != null}
                muted
              />
            )}
            {totalTokens != null && (
              <div className="col-span-2 mt-1 flex justify-between border-t border-neutral-900 pt-1 text-neutral-300">
                <span>Total</span>
                <span className="flex gap-2 font-mono">
                  <span>{totalTokens.toLocaleString()} tok</span>
                  {cost ? (
                    <span className="text-emerald-300">{formatUSD(cost.total)}</span>
                  ) : (
                    <span className="text-neutral-600">no price</span>
                  )}
                </span>
              </div>
            )}
          </div>
          {reasoningTokens != null && reasoningTokens > 0 && model?.pricing.internal_reasoning == null && (
            <div className="mt-1 text-[9px] text-neutral-600">
              reasoning billed at output rate (no separate price published)
            </div>
          )}
        </div>
      )}
      {result.resolvedModel && result.resolvedModel !== result.model && !anonymousLabel ? (
        <div className="border-t border-neutral-900 px-3 py-1.5 text-[10px] text-neutral-500">
          resolved → <span className="font-mono">{result.resolvedModel}</span>
        </div>
      ) : null}
      {blindActive && onPickBlind && result.content && !result.error ? (
        <div className="border-t border-purple-500/30 bg-purple-500/[0.04] px-3 py-1.5">
          <Tip content="Pick this answer as your favorite. Identities reveal after the click; the vote is saved to your blind-test history.">
            <button
              type="button"
              onClick={() => onPickBlind(result.model)}
              className="w-full rounded-md border border-purple-500/40 bg-purple-500/10 px-2 py-1 text-[11px] font-medium text-purple-200 hover:bg-purple-500/20"
            >
              Pick this one →
            </button>
          </Tip>
        </div>
      ) : null}
      {result.recordId && onRate && result.content && !result.error ? (
        <div className="flex flex-col gap-1.5 border-t border-neutral-900 px-3 py-1.5">
          <div className="flex items-center gap-1">
            <Tip content="Mark this card's answer as good for your prompt. Feeds the per-model cost-per-good-answer stat.">
              <button
                type="button"
                onClick={() => onRate(result.recordId!, rating === 'up' ? null : 'up')}
                aria-pressed={rating === 'up'}
                aria-label="Good answer"
                className={`rounded-md border px-1.5 py-0.5 text-[11px] transition-colors ${
                  rating === 'up'
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                    : 'border-neutral-800 text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300'
                }`}
              >
                👍
              </button>
            </Tip>
            <Tip content="Mark this card's answer as bad. Lowers this model's quality-per-dollar score for your prompts.">
              <button
                type="button"
                onClick={() => onRate(result.recordId!, rating === 'down' ? null : 'down')}
                aria-pressed={rating === 'down'}
                aria-label="Bad answer"
                className={`rounded-md border px-1.5 py-0.5 text-[11px] transition-colors ${
                  rating === 'down'
                    ? 'border-red-500/50 bg-red-500/15 text-red-200'
                    : 'border-neutral-800 text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300'
                }`}
              >
                👎
              </button>
            </Tip>
            {onComment ? (
              <Tip content="Add a short note about why this answer was good or bad. Stays local; later usable for semantic summary across many responses.">
                <button
                  type="button"
                  onClick={() => setNoteOpen((v) => !v)}
                  aria-expanded={noteOpen}
                  className={`rounded-md border px-1.5 py-0.5 text-[10.5px] transition-colors ${
                    comment
                      ? 'border-blue-500/40 bg-blue-500/10 text-blue-200'
                      : 'border-neutral-800 text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300'
                  }`}
                >
                  {comment ? '✎ note' : '+ note'}
                </button>
              </Tip>
            ) : null}
          </div>
          {noteOpen && onComment ? (
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={() => onComment(result.recordId!, noteDraft.trim() ? noteDraft : null)}
              placeholder="Optional note — what made this answer good/bad?"
              rows={2}
              maxLength={1000}
              className="w-full resize-y rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11.5px] text-neutral-200 outline-none focus:border-neutral-600"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ErrorCard({ error, info }: { error: string; info?: StructuredError }) {
  const [showRaw, setShowRaw] = useState(false);
  const toneByKind: Record<string, string> = {
    'rate-limit': 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    'no-credits': 'border-red-500/30 bg-red-500/10 text-red-200',
    'invalid-model': 'border-neutral-700 bg-neutral-900 text-neutral-300',
    auth: 'border-red-500/30 bg-red-500/10 text-red-200',
    'bad-request': 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    timeout: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    'provider-down': 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    'content-filter': 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    unknown: 'border-red-500/30 bg-red-500/10 text-red-200',
  };
  const tone = info ? toneByKind[info.kind] ?? toneByKind.unknown : toneByKind.unknown;
  const title = info?.title ?? error;
  const hint = info?.hint;
  const status = info?.status;
  return (
    <div className={`rounded-md border p-2.5 text-[12px] ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">
          {title}
          {status ? <span className="ml-1 font-mono text-[10.5px] opacity-70">{status}</span> : null}
        </span>
        {info ? (
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="text-[10.5px] underline-offset-2 opacity-70 hover:underline"
          >
            {showRaw ? 'hide raw' : 'show raw'}
          </button>
        ) : null}
      </div>
      {hint ? <p className="mt-1 text-[11.5px] leading-snug opacity-90">{hint}</p> : null}
      {showRaw && info ? (
        <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-black/40 p-2 font-mono text-[10.5px] leading-snug opacity-80">
          {info.raw}
        </pre>
      ) : null}
    </div>
  );
}

function ExpandedCardModal({
  result,
  catalog,
  rating,
  comment,
  onRate,
  onComment,
  anonymousLabel,
  onClose,
}: {
  result: CompareResult;
  catalog: CatalogModel[];
  rating?: Rating;
  comment?: string;
  onRate?: (recordId: string, r: Rating | null) => void;
  onComment?: (recordId: string, c: string | null) => void;
  anonymousLabel?: string;
  onClose: () => void;
}) {
  const model = useMemo(() => findModel(catalog, result.model), [catalog, result.model]);
  const cost = useMemo(() => computeCostBreakdown(model, result.usage), [model, result.usage]);
  const [noteDraft, setNoteDraft] = useState(comment ?? '');
  useEffect(() => {
    setNoteDraft(comment ?? '');
  }, [comment]);

  // Lock body scroll and bind Esc-to-close while the modal is open. Wired
  // via useEffect so React tears it down cleanly when the modal closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-[#0d0d10] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-900 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={`truncate font-mono text-[13px] ${
                anonymousLabel ? 'text-purple-300' : 'text-neutral-200'
              }`}
              title={anonymousLabel ? 'Identity hidden by Blind mode' : result.model}
            >
              {anonymousLabel ?? result.model}
            </span>
            {result.swappedFrom && !anonymousLabel ? (
              <span
                className="rounded bg-blue-500/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-blue-200"
                title={`Original slot was ${result.swappedFrom}`}
              >
                swapped from {result.swappedFrom}
              </span>
            ) : null}
            {result.streaming ? (
              <span className="flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-emerald-200">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
                streaming
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-neutral-400">
            {result.latencyMs > 0 ? <span>{result.latencyMs}ms</span> : null}
            {cost && !anonymousLabel ? (
              <span className="text-emerald-300">{formatUSD(cost.total)}</span>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M1.5 1.5l11 11M12.5 1.5l-11 11" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 text-[14.5px] leading-relaxed text-neutral-100">
          {result.error ? (
            <ErrorCard error={result.error} info={result.errorInfo} />
          ) : result.refusal ? (
            <div className="rounded-md bg-amber-500/10 p-3 text-[13px] text-amber-200">
              <div className="mb-1 font-semibold">Refused</div>
              {result.refusal}
            </div>
          ) : result.content ? (
            <>
              <Markdown source={result.content} />
              {result.streaming ? (
                <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-emerald-300 align-text-bottom" aria-hidden />
              ) : null}
            </>
          ) : (
            <div className="text-neutral-500">No content.</div>
          )}
        </div>
        {result.recordId && onRate && result.content && !result.error ? (
          <div className="flex flex-col gap-2 border-t border-neutral-900 px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onRate(result.recordId!, rating === 'up' ? null : 'up')}
                aria-pressed={rating === 'up'}
                aria-label="Good answer"
                className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                  rating === 'up'
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                    : 'border-neutral-800 text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                }`}
              >
                👍 Good
              </button>
              <button
                type="button"
                onClick={() => onRate(result.recordId!, rating === 'down' ? null : 'down')}
                aria-pressed={rating === 'down'}
                aria-label="Bad answer"
                className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                  rating === 'down'
                    ? 'border-red-500/50 bg-red-500/15 text-red-200'
                    : 'border-neutral-800 text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                }`}
              >
                👎 Bad
              </button>
            </div>
            {onComment ? (
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onBlur={() => onComment(result.recordId!, noteDraft.trim() ? noteDraft : null)}
                placeholder="Optional note — what made this answer good/bad?"
                rows={2}
                maxLength={1000}
                className="w-full resize-y rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-[12.5px] text-neutral-200 outline-none focus:border-neutral-600"
              />
            ) : null}
          </div>
        ) : null}
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

