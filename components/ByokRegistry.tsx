'use client';

import { useEffect, useMemo, useState } from 'react';

import { Tip } from '@/components/Tip';
import {
  BYOK_PROVIDERS,
  OPENROUTER_INTEGRATIONS_URL,
  loadByokState,
  saveByokState,
  type ByokProviderSlug,
  type ByokState,
} from '@/lib/byok';
import {
  getLeaderboardOptIn,
  sanitizeForLeaderboard,
  setLeaderboardOptIn,
} from '@/lib/leaderboard';
import { loadRecords, loadVotes } from '@/lib/stats';

export function ByokRegistry() {
  const [state, setState] = useState<ByokState>(() => loadByokState());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(loadByokState());
    setHydrated(true);
  }, []);

  const enabledCount = useMemo(
    () => BYOK_PROVIDERS.filter((p) => state[p.slug]).length,
    [state],
  );

  function toggle(slug: ByokProviderSlug) {
    setState((prev) => {
      const next = { ...prev, [slug]: !prev[slug] };
      saveByokState(next);
      return next;
    });
  }

  function clearAll() {
    if (!confirm('Reset all BYOK toggles in this app? This does not change anything on OpenRouter.')) {
      return;
    }
    saveByokState({});
    setState({});
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-lg font-semibold text-neutral-100">BYOK registry</h1>
        <p className="mt-1 text-[12.5px] leading-relaxed text-neutral-400">
          Record which providers you&apos;ve configured BYOK for on OpenRouter. The app uses
          this to label which wallet each model bills — the toggles below are{' '}
          <strong className="text-neutral-200">local-only</strong> and do{' '}
          <strong className="text-neutral-200">not</strong> change anything on
          openrouter.ai. To actually add, remove, or disable a provider key, use
          OpenRouter&apos;s integrations page.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={OPENROUTER_INTEGRATIONS_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="OpenRouter has no public API for this. The actual on/off lives in their dashboard — this link opens it in a new tab."
          className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[12px] text-emerald-300 hover:bg-emerald-500/15"
        >
          Manage BYOK on openrouter.ai &rarr;
        </a>
        {hydrated && enabledCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="rounded-md border border-neutral-800 px-3 py-1.5 text-[12px] text-neutral-400 hover:bg-neutral-900"
          >
            Reset all
          </button>
        )}
        {hydrated && (
          <span className="ml-auto text-[11px] text-neutral-500">
            {enabledCount} of {BYOK_PROVIDERS.length} marked configured
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-1.5">
        {BYOK_PROVIDERS.map((p) => {
          const on = !!state[p.slug];
          return (
            <li
              key={p.slug}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-900 bg-[#0d0d10] px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-neutral-100">{p.label}</span>
                  <span className="font-mono text-[10px] text-neutral-600">{p.modelPrefix}*</span>
                </div>
                <a
                  href={p.consoleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 text-[10.5px] text-neutral-500 hover:text-neutral-300"
                >
                  Provider console &rarr;
                </a>
              </div>
              <Tip
                content={`Local flag — tells the app whether you've added a ${p.label} key on openrouter.ai/settings/integrations. Does not enable/disable BYOK on OpenRouter itself.`}
              >
              <button
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => toggle(p.slug)}
                disabled={!hydrated}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  on ? 'bg-emerald-500/70' : 'bg-neutral-800'
                } disabled:opacity-50`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    on ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              </Tip>
            </li>
          );
        })}
      </ul>

      <LeaderboardOptIn />

      <section className="rounded-lg border border-neutral-900 bg-[#0a0a0b] p-4 text-[12px] leading-relaxed text-neutral-400">
        <h2 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-neutral-300">
          What this changes in the app
        </h2>
        <ul className="list-inside list-disc space-y-1">
          <li>Models whose provider you marked as configured will show a &ldquo;bills {`{provider}`}&rdquo; hint instead of the default &ldquo;bills OpenRouter credits&rdquo;.</li>
          <li>Cost estimates remain identical — BYOK doesn&apos;t usually change list prices; OpenRouter still skims ~5% from your OpenRouter credit balance for the gateway.</li>
          <li>The free tab and <code className="font-mono text-[11px] text-neutral-300">openrouter/free</code> ignore BYOK entirely.</li>
        </ul>
        <p className="mt-2 text-[11.5px] text-neutral-500">
          Why no API toggle? OpenRouter does not expose endpoints to programmatically list or
          enable/disable integrations, and there is no per-request body parameter to skip BYOK
          for a single call. The only real on/off lives in their dashboard.
        </p>
      </section>
    </div>
  );
}

function LeaderboardOptIn() {
  const [on, setOn] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [contributionCount, setContributionCount] = useState(0);

  useEffect(() => {
    setOn(getLeaderboardOptIn());
    const contribs = sanitizeForLeaderboard({
      records: loadRecords(),
      votes: loadVotes(),
    });
    setContributionCount(contribs.length);
    setHydrated(true);
  }, []);

  function toggle() {
    const next = !on;
    setOn(next);
    setLeaderboardOptIn(next);
  }

  return (
    <section className="rounded-xl border border-neutral-900 bg-[#0d0d10] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold text-neutral-100">
            Public leaderboard (opt-in)
          </h2>
          <p className="mt-1 text-[12px] leading-snug text-neutral-400">
            Contribute your sanitized 👍 / 👎 and blind votes to a shared model leaderboard.{' '}
            <strong className="text-neutral-300">No prompts, no responses, no timestamps</strong>{' '}
            (only UTC date) are transmitted — just which model got which signal and the dollar cost.
          </p>
        </div>
        <Tip content="Local opt-in flag. Even when enabled, no data is transmitted until a backend is deployed — see notice below.">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          disabled={!hydrated}
          onClick={toggle}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            on ? 'bg-emerald-500/70' : 'bg-neutral-800'
          } disabled:opacity-50`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              on ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
        </Tip>
      </div>
      <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/[0.05] px-3 py-2 text-[11.5px] text-amber-200">
        <strong className="text-amber-100">No backend is deployed.</strong> Even with opt-in on,
        nothing leaves this machine — the contribution endpoint accepts and discards. The Insights
        leaderboard view shows illustrative placeholders so the UI is testable. When the backend
        ships, contributions begin transmitting from this opt-in flag.
      </div>
      {hydrated && on ? (
        <p className="mt-2 text-[11px] text-neutral-500">
          You currently have{' '}
          <strong className="text-neutral-300">{contributionCount}</strong>{' '}
          {contributionCount === 1 ? 'row' : 'rows'} that would be contributed.
        </p>
      ) : null}
    </section>
  );
}
