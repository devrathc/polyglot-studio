'use client';

import { useCallback, useEffect, useState } from 'react';

import type { CreditsInfo } from '@/app/api/credits/route';

const REFRESH_MS = 30_000;

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; info: CreditsInfo };

function format(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  if (abs < 0.01) return `${sign}$0.00`;
  if (abs < 1) return `${sign}$${abs.toFixed(3)}`;
  if (abs < 100) return `${sign}$${abs.toFixed(2)}`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function CreditsBadge() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/credits', { signal });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setState({ kind: 'error', message: body.error ?? `HTTP ${res.status}` });
        return;
      }
      const info = (await res.json()) as CreditsInfo;
      setState({ kind: 'ok', info });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    const interval = setInterval(() => refresh(), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      controller.abort();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const url = 'https://openrouter.ai/settings/credits';

  if (state.kind === 'loading') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md border border-neutral-800 px-2 py-1 font-mono text-[10.5px] text-neutral-500 hover:bg-neutral-900"
        title="Loading OpenRouter credits…"
      >
        … credits
      </a>
    );
  }

  if (state.kind === 'error') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md border border-neutral-800 px-2 py-1 font-mono text-[10.5px] text-neutral-500 hover:bg-neutral-900"
        title={`Credits fetch failed: ${state.message}`}
      >
        credits ?
      </a>
    );
  }

  const { balance, unfunded } = state.info;
  const empty = balance <= 0;
  const low = balance > 0 && balance < 1;

  const tone = unfunded || empty
    ? 'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/15'
    : low
      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15'
      : 'border-neutral-800 text-neutral-300 hover:bg-neutral-900';

  const label = unfunded
    ? 'Fund OpenRouter'
    : empty
      ? `${format(balance)} · fund`
      : format(balance);

  const title = unfunded
    ? 'OpenRouter account has never been funded. Paid models and web search will 402. Click to add credits.'
    : empty
      ? 'OpenRouter balance is at or below $0. Paid models and web search will 402. Click to add credits.'
      : low
        ? `OpenRouter balance: ${format(balance)} — running low.`
        : `OpenRouter balance: ${format(balance)} (used ${format(state.info.totalUsage)} of ${format(state.info.totalCredits)}).`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`rounded-md border px-2 py-1 font-mono text-[10.5px] transition-colors ${tone}`}
      title={title}
    >
      {label}
    </a>
  );
}
