'use client';

import { useEffect, useMemo, useState } from 'react';

import { formatUSD } from '@/lib/pricing';
import {
  loadRecords,
  loadVotes,
  rateRecord,
  rollupBlindVotes,
  rollupByModel,
  spendInWindow,
  SUBSCRIPTIONS,
  type BlindRollup,
  type CallRecord,
  type ModelStats,
  type Rating,
  type Subscription,
  type WindowSpend,
} from '@/lib/stats';
import { Tip } from '@/components/Tip';
import type { LeaderboardRow } from '@/lib/leaderboard';

export function InsightsView() {
  const [records, setRecords] = useState<CallRecord[]>([]);
  const [votes, setVotes] = useState<ReturnType<typeof loadVotes>>([]);

  useEffect(() => {
    setRecords(loadRecords());
    setVotes(loadVotes());
  }, []);

  const perModel = useMemo(() => rollupByModel(records), [records]);
  const last30 = useMemo(() => spendInWindow(records, 30), [records]);
  const blindRollup = useMemo(() => rollupBlindVotes(votes), [votes]);

  const recentUnrated = useMemo(() => {
    const cutoff = Date.now() - 7 * 86_400_000;
    return records
      .filter((r) => r.at >= cutoff && !r.rating)
      .sort((a, b) => b.at - a.at);
  }, [records]);

  function handleRate(id: string, rating: Rating) {
    rateRecord(id, rating);
    setRecords((curr) => curr.map((r) => (r.id === id ? { ...r, rating } : r)));
  }

  if (records.length === 0 && votes.length === 0) {
    return <Empty />;
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-lg font-semibold text-neutral-100">Insights</h1>
        <p className="mt-1 text-[12.5px] leading-relaxed text-neutral-400">
          Computed from your local history (no data leaves this machine). Updates as you chat,
          compare, and rate.
        </p>
      </header>

      {recentUnrated.length >= 5 ? (
        <RateNudge unrated={recentUnrated} onRate={handleRate} />
      ) : null}

      <CostPerGoodAnswer stats={perModel} />
      <SubscriptionArbitrage spend={last30} />
      <BlindPreferences rollup={blindRollup} totalVotes={votes.length} />
      <PublicLeaderboard />
    </div>
  );
}

function PublicLeaderboard() {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'ok'; deployed: boolean; note?: string; rows: LeaderboardRow[] }
  >({ kind: 'loading' });

  useEffect(() => {
    fetch('/api/leaderboard')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as {
          deployed: boolean;
          note?: string;
          rows: LeaderboardRow[];
        };
        setState({ kind: 'ok', ...json });
      })
      .catch((err) =>
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        }),
      );
  }, []);

  return (
    <Section
      title="Public leaderboard (preview)"
      subtitle="What a community-wide cost-per-good-answer table would look like. Powered by opt-in contributions (toggle in Settings). Today these rows are illustrative placeholders — see notice."
    >
      {state.kind === 'loading' ? (
        <p className="text-[12px] text-neutral-500">Loading…</p>
      ) : state.kind === 'error' ? (
        <p className="text-[12px] text-red-300">{state.message}</p>
      ) : (
        <>
          {!state.deployed ? (
            <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/[0.05] px-3 py-2 text-[11.5px] text-amber-200">
              <strong className="text-amber-100">Backend not deployed.</strong>{' '}
              {state.note ?? 'These rows are illustrative.'}
            </div>
          ) : null}
          <div className="overflow-auto rounded-lg border border-neutral-900">
            <table className="w-full text-[12px]">
              <thead className="bg-[#0a0a0c] text-[10.5px] uppercase tracking-wider text-neutral-500">
                <tr className="border-b border-neutral-900">
                  <th className="px-3 py-2 text-left">Model</th>
                  <th className="px-3 py-2 text-right">Ratings</th>
                  <th className="px-3 py-2 text-right">👍 rate</th>
                  <th className="px-3 py-2 text-right">Blind wins</th>
                  <th className="px-3 py-2 text-right">Win rate</th>
                  <th className="px-3 py-2 text-right">$ / 👍</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((r) => (
                  <tr key={r.model} className="border-b border-neutral-900/60">
                    <td className="px-3 py-1.5 font-mono text-[11.5px] text-neutral-200">{r.model}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-neutral-300">{r.totalRatings.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-neutral-300">
                      {Math.round(r.upvoteRate * 100)}%
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-purple-300">{r.blindWins.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-neutral-300">
                      {r.blindAppearances > 0
                        ? `${Math.round((r.blindWins / r.blindAppearances) * 100)}%`
                        : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-emerald-300">
                      {r.costPerUpvote != null ? formatUSD(r.costPerUpvote) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10.5px] text-neutral-500">
            Why this matters as a feature: a single user's ratings are too sparse to rank models
            reliably. A community-wide aggregate, filtered to your prompt type, gives a sharp
            cost-per-good-answer ranking that no provider has an incentive to ship.
          </p>
        </>
      )}
    </Section>
  );
}

function RateNudge({
  unrated,
  onRate,
}: {
  unrated: CallRecord[];
  onRate: (id: string, r: Rating) => void;
}) {
  const visible = unrated.slice(0, 3);
  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold text-amber-200">
            {unrated.length} unrated {unrated.length === 1 ? 'response' : 'responses'} in the last 7 days
          </h2>
          <p className="mt-1 text-[12px] leading-snug text-neutral-400">
            The cost-per-good-answer ranking sharpens once you rate consistently. A few seconds of
            input here makes the rest of this page actually useful.
          </p>
        </div>
      </div>
      <ul className="mt-3 flex flex-col gap-1.5">
        {visible.map((r) => {
          const when = new Date(r.at);
          const ago = formatAgo(when);
          const model = r.resolvedModel || r.model;
          return (
            <li
              key={r.id}
              className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-[#0d0d10] px-2.5 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-[11px] text-neutral-200">{model}</span>
                  <span className="font-mono text-[10px] text-neutral-500">{ago}</span>
                  <span className="font-mono text-[10px] text-neutral-500">
                    {formatUSD(r.cost ?? 0)}
                  </span>
                </div>
                <div className="mt-0.5 text-[10.5px] text-neutral-500">
                  {r.tab === 'compare' ? 'Compare card' : 'Chat reply'}
                  {r.mode === 'free' ? ' · free mode' : ''}
                  {r.webSearch ? ' · web access' : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Tip content="Mark this response as good.">
                  <button
                    type="button"
                    onClick={() => onRate(r.id, 'up')}
                    aria-label="Good answer"
                    className="rounded-md border border-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-400 hover:border-emerald-500/50 hover:bg-emerald-500/15 hover:text-emerald-200"
                  >
                    👍
                  </button>
                </Tip>
                <Tip content="Mark this response as bad.">
                  <button
                    type="button"
                    onClick={() => onRate(r.id, 'down')}
                    aria-label="Bad answer"
                    className="rounded-md border border-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-400 hover:border-red-500/50 hover:bg-red-500/15 hover:text-red-200"
                  >
                    👎
                  </button>
                </Tip>
              </div>
            </li>
          );
        })}
      </ul>
      {unrated.length > visible.length ? (
        <p className="mt-2 text-[10.5px] text-neutral-500">
          + {unrated.length - visible.length} more unrated in the last 7 days. The rest live inside
          their original Chat or Compare sessions — open one and rate inline.
        </p>
      ) : null}
    </section>
  );
}

function formatAgo(at: Date): string {
  const sec = Math.max(0, (Date.now() - at.getTime()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86_400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86_400)}d ago`;
}

function CostPerGoodAnswer({ stats }: { stats: ModelStats[] }) {
  if (stats.length === 0) {
    return (
      <Section
        title="Cost per good answer"
        subtitle="Per-model rollup of your 👍 / 👎 ratings vs. what each call actually cost."
      >
        <p className="text-[12.5px] text-neutral-500">
          No call history yet. Run a Chat or Compare prompt and rate the answers to populate this.
        </p>
      </Section>
    );
  }
  const ranked = [...stats].sort((a, b) => {
    if (a.costPerUpvote === b.costPerUpvote) return b.upvoteRate - a.upvoteRate;
    return a.costPerUpvote - b.costPerUpvote;
  });
  return (
    <Section
      title="Cost per good answer"
      subtitle="Lower = better value. Cost-per-👍 = total spent on this model ÷ how many of its responses you upvoted. Lots of unrated calls dilute the signal; rate aggressively for a few days to get a sharper picture."
    >
      <div className="overflow-auto rounded-lg border border-neutral-900">
        <table className="w-full text-[12px]">
          <thead className="bg-[#0a0a0c] text-[10.5px] uppercase tracking-wider text-neutral-500">
            <tr className="border-b border-neutral-900">
              <th className="px-3 py-2 text-left">Model</th>
              <th className="px-3 py-2 text-right">Calls</th>
              <th className="px-3 py-2 text-right">👍 / 👎</th>
              <th className="px-3 py-2 text-right">👍 rate</th>
              <th className="px-3 py-2 text-right">Total spent</th>
              <th className="px-3 py-2 text-right">Avg / call</th>
              <th className="px-3 py-2 text-right">$ / 👍</th>
              <th className="px-3 py-2 text-right">Notes</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((s) => (
              <ModelStatRow key={s.model} s={s} />
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function ModelStatRow({ s }: { s: ModelStats }) {
  const [openNotes, setOpenNotes] = useState(false);
  const hasNotes = s.notes > 0;
  return (
    <>
      <tr className="border-b border-neutral-900/60">
        <td className="px-3 py-1.5 font-mono text-[11.5px] text-neutral-200">{s.model}</td>
        <td className="px-3 py-1.5 text-right font-mono text-neutral-300">{s.calls}</td>
        <td className="px-3 py-1.5 text-right font-mono">
          <span className="text-emerald-300">{s.upvotes}</span>
          <span className="text-neutral-700"> / </span>
          <span className="text-red-300">{s.downvotes}</span>
        </td>
        <td className="px-3 py-1.5 text-right font-mono text-neutral-300">
          {s.upvotes + s.downvotes > 0 ? `${Math.round(s.upvoteRate * 100)}%` : '—'}
        </td>
        <td className="px-3 py-1.5 text-right font-mono text-neutral-300">{formatUSD(s.totalCost)}</td>
        <td className="px-3 py-1.5 text-right font-mono text-neutral-400">{formatUSD(s.avgCost)}</td>
        <td className="px-3 py-1.5 text-right font-mono">
          {s.upvotes > 0 ? (
            <span className="text-emerald-300">{formatUSD(s.costPerUpvote)}</span>
          ) : (
            <span className="text-neutral-700">—</span>
          )}
        </td>
        <td className="px-3 py-1.5 text-right font-mono">
          {hasNotes ? (
            <button
              type="button"
              onClick={() => setOpenNotes((v) => !v)}
              className="rounded-md border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10.5px] text-blue-200 hover:bg-blue-500/15"
            >
              {s.notes} {openNotes ? '▴' : '▾'}
            </button>
          ) : (
            <span className="text-neutral-700">—</span>
          )}
        </td>
      </tr>
      {openNotes && hasNotes ? (
        <tr className="border-b border-neutral-900/60 bg-[#0a0a0c]">
          <td colSpan={8} className="px-3 py-2">
            <div className="text-[10.5px] uppercase tracking-wider text-neutral-500">
              Recent notes ({Math.min(s.notes, s.recentNotes.length)} of {s.notes})
            </div>
            <ul className="mt-1 flex flex-col gap-1">
              {s.recentNotes.map((n, i) => (
                <li
                  key={i}
                  className="rounded-md border border-blue-500/20 bg-blue-500/[0.04] px-2 py-1.5 text-[11.5px] leading-snug text-neutral-300"
                >
                  &ldquo;{n}&rdquo;
                </li>
              ))}
            </ul>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function SubscriptionArbitrage({ spend }: { spend: WindowSpend }) {
  return (
    <Section
      title="Subscription arbitrage"
      subtitle="Compare what you actually spent on the API to what a flat-rate subscription would cost. Subscriptions are chat-UI access (not API); the math assumes you'd switch your usage from this app to the consumer chat product."
    >
      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Spent in last 30 days" value={formatUSD(spend.totalCost)} sub={`${spend.callCount} calls`} />
        <Stat
          label="Monthly projection"
          value={formatUSD(spend.monthlyProjection)}
          sub="Linear extrapolation of last 30 days."
        />
        <Stat
          label="Top provider"
          value={spend.byProvider[0]?.provider ?? '—'}
          sub={
            spend.byProvider[0]
              ? `${formatUSD(spend.byProvider[0].cost)} (${Math.round(
                  (spend.byProvider[0].cost / Math.max(spend.totalCost, 1e-9)) * 100,
                )}% of spend)`
              : 'No spend recorded yet.'
          }
        />
      </div>
      <h3 className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
        Subscription comparison
      </h3>
      <div className="overflow-auto rounded-lg border border-neutral-900">
        <table className="w-full text-[12px]">
          <thead className="bg-[#0a0a0c] text-[10.5px] uppercase tracking-wider text-neutral-500">
            <tr className="border-b border-neutral-900">
              <th className="px-3 py-2 text-left">Subscription</th>
              <th className="px-3 py-2 text-right">Monthly</th>
              <th className="px-3 py-2 text-right">Your projected spend (relevant provider)</th>
              <th className="px-3 py-2 text-right">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {SUBSCRIPTIONS.map((sub) => (
              <SubscriptionRow key={sub.name} sub={sub} spend={spend} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10.5px] text-neutral-500">
        Caveats: subscriptions include things the API doesn&apos;t (Drive, custom GPTs, longer rate caps,
        priority access during peaks). The math here is a one-axis comparison — your money — not a
        full product comparison.
      </p>
    </Section>
  );
}

function SubscriptionRow({ sub, spend }: { sub: Subscription; spend: WindowSpend }) {
  const providerSpend =
    sub.scope === '*'
      ? spend.byProvider.reduce((s, p) => s + p.cost, 0)
      : spend.byProvider.find((p) => p.provider === sub.scope)?.cost ?? 0;
  const providerMonthly = spend.windowDays > 0 ? (providerSpend / spend.windowDays) * 30 : 0;
  const delta = providerMonthly - sub.monthly;
  const subscribeWins = delta > 0;
  const verdict =
    Math.abs(delta) < 1
      ? 'Roughly break-even'
      : subscribeWins
        ? `Sub saves ${formatUSD(delta)}/mo`
        : `API saves ${formatUSD(-delta)}/mo`;
  return (
    <tr className="border-b border-neutral-900/60">
      <td className="px-3 py-1.5">
        <div className="text-[12px] text-neutral-100">{sub.name}</div>
        <div className="text-[10.5px] text-neutral-500">{sub.notes}</div>
      </td>
      <td className="px-3 py-1.5 text-right font-mono text-neutral-300">{formatUSD(sub.monthly)}</td>
      <td className="px-3 py-1.5 text-right font-mono text-neutral-300">
        {formatUSD(providerMonthly)}
        <div className="text-[10px] text-neutral-600">{sub.scope === '*' ? 'all providers' : sub.scope}</div>
      </td>
      <td className="px-3 py-1.5 text-right">
        <span
          className={`rounded px-1.5 py-0.5 text-[10.5px] font-medium ${
            subscribeWins
              ? 'bg-amber-500/15 text-amber-300'
              : Math.abs(delta) < 1
                ? 'bg-neutral-800 text-neutral-300'
                : 'bg-emerald-500/15 text-emerald-300'
          }`}
        >
          {verdict}
        </span>
      </td>
    </tr>
  );
}

function BlindPreferences({ rollup, totalVotes }: { rollup: BlindRollup[]; totalVotes: number }) {
  return (
    <Section
      title="Blind preferences"
      subtitle="When you used Compare's Blind mode and picked a winner without seeing model identities. Removes brand bias and gives you a private preference profile."
    >
      {rollup.length === 0 ? (
        <p className="text-[12.5px] text-neutral-500">
          No blind votes yet. Turn on Blind mode in Compare, run a prompt, then pick the answer you
          like best — the vote saves here automatically.
        </p>
      ) : (
        <>
          <p className="mb-2 text-[12px] text-neutral-400">
            {totalVotes} blind {totalVotes === 1 ? 'vote' : 'votes'} so far. Sorted by win rate.
          </p>
          <div className="overflow-auto rounded-lg border border-neutral-900">
            <table className="w-full text-[12px]">
              <thead className="bg-[#0a0a0c] text-[10.5px] uppercase tracking-wider text-neutral-500">
                <tr className="border-b border-neutral-900">
                  <th className="px-3 py-2 text-left">Model</th>
                  <th className="px-3 py-2 text-right">Appearances</th>
                  <th className="px-3 py-2 text-right">Wins</th>
                  <th className="px-3 py-2 text-right">Win rate</th>
                </tr>
              </thead>
              <tbody>
                {rollup.map((r) => (
                  <tr key={r.model} className="border-b border-neutral-900/60">
                    <td className="px-3 py-1.5 font-mono text-[11.5px] text-neutral-200">{r.model}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-neutral-300">{r.appearances}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-purple-300">{r.wins}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-neutral-300">
                      {Math.round(r.winRate * 100)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Section>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-neutral-900 bg-[#0d0d10] p-4">
      <h2 className="text-[13px] font-semibold text-neutral-100">{title}</h2>
      <p className="mt-1 text-[11.5px] leading-snug text-neutral-500">{subtitle}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-neutral-900 bg-[#0a0a0c] p-3">
      <div className="text-[10.5px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="mt-1 font-mono text-[18px] text-neutral-100">{value}</div>
      <div className="mt-1 text-[10.5px] text-neutral-500">{sub}</div>
    </div>
  );
}

function Empty() {
  return (
    <div className="mx-auto max-w-2xl p-10 text-center">
      <h1 className="text-xl font-semibold text-neutral-100">No insights yet</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">
        This tab fills in as you use the app. Three streams of data feed it:
      </p>
      <ul className="mx-auto mt-3 max-w-md text-left text-[12.5px] leading-relaxed text-neutral-400">
        <li>
          <strong className="text-neutral-200">Cost per good answer</strong> — run a Chat or Compare
          prompt, then click 👍 or 👎 on each response. Builds a per-model quality / dollar score.
        </li>
        <li className="mt-1.5">
          <strong className="text-neutral-200">Subscription arbitrage</strong> — every call adds to
          a 30-day spend log. After a few days you can see whether a $20/mo subscription would be
          cheaper than your API usage.
        </li>
        <li className="mt-1.5">
          <strong className="text-neutral-200">Blind preferences</strong> — turn on Blind mode in
          Compare, run a prompt, pick the answer you like best. Your preference profile builds up
          without brand bias.
        </li>
      </ul>
    </div>
  );
}
