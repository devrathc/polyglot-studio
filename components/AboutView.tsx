'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { markOnboarded, stageBlindDemo } from '@/lib/onboarding';

type UseCase = {
  title: string;
  who: string;
  steps: string[];
  cta: { href: string; label: string };
};

const USE_CASES: UseCase[] = [
  {
    title: 'Decide whether to subscribe to ChatGPT, Claude, or Gemini',
    who: 'You\'re paying $20/mo for one of these and wondering if it\'s worth it — or you\'re about to.',
    steps: [
      'Use Chat for a week on your real questions; rate responses 👍 / 👎.',
      'Check Insights → Subscription arbitrage. See whether your actual API spend at this rate would beat $20/mo.',
      'If the API is cheaper, stay here. If the sub is cheaper, switch — and you\'ll know which one based on which provider you used most.',
    ],
    cta: { href: '/', label: 'Start in Chat →' },
  },
  {
    title: 'Run one important question across the best models',
    who: 'A high-stakes question where you don\'t trust a single model. Could be code review, contract reading, medical research, business strategy.',
    steps: [
      'Open Compare. Default lineup is 5 flagship paid models (Opus, Sonnet, GPT-5, Gemini Pro, Grok).',
      'Paste your prompt. One click. Five answers in parallel — typically $0.05–$0.20 total.',
      'Optional: turn on Blind mode first to defeat brand bias. Pick the answer you actually prefer, then reveal which model wrote it.',
    ],
    cta: { href: '/compare', label: 'Open Compare →' },
  },
  {
    title: 'Get help without paying anything',
    who: 'You don\'t want to spend a dime, and you don\'t need a frontier model.',
    steps: [
      'In Chat, flip the Mode toggle to Free Only. The model surface narrows to OpenRouter\'s free pool.',
      'Auto preset still routes per request (constrained to free); Quality / Speed presets pick the best free model for that intent.',
      'Rate-limited globally (~20 RPM / 50–1000 RPD), but tokens themselves are $0.',
    ],
    cta: { href: '/', label: 'Try Free Only →' },
  },
  {
    title: 'See exactly what a question costs before sending',
    who: 'You\'re used to chat-UI subscriptions and have no idea what individual messages actually cost.',
    steps: [
      'In Chat, the right sidebar shows a Cost preview as you type: input tokens × prompt rate + expected output × completion rate.',
      'Send the message. After it completes, the same panel shows actual usage — input, output, cached, reasoning tokens — and the real dollar amount.',
      'Insights shows your running totals across all calls and projects monthly spend at this rate.',
    ],
    cta: { href: '/models', label: 'Browse model prices →' },
  },
  {
    title: 'Look at an image and ask a vision model about it',
    who: 'You have a screenshot, photo, diagram, or chart and want a model to reason about it.',
    steps: [
      'Open Multimodal. Drop, paste, or click to upload up to 4 images (5 MB each).',
      'Default Auto-router lets OpenRouter pick a vision-capable model per request. Switch to Free router for $0 vision routing.',
      'Type the question. Cost preview shows the image-token impact before you send.',
    ],
    cta: { href: '/multimodal', label: 'Open Multimodal →' },
  },
];

const COMPARISON_ROWS: { feature: string; here: string; chatuis: string; rawor: string }[] = [
  {
    feature: 'Per-call cost shown before & after',
    here: 'Yes — input/output/cached/reasoning, $ to four decimals',
    chatuis: 'Hidden behind monthly subscription',
    rawor: 'Aggregated, not per-call',
  },
  {
    feature: '5-model side-by-side comparison',
    here: 'Yes, one prompt → 5 cards in parallel',
    chatuis: 'No',
    rawor: 'No native UI',
  },
  {
    feature: 'Blind taste test',
    here: 'Yes — hide labels, vote, reveal',
    chatuis: 'No',
    rawor: 'No',
  },
  {
    feature: 'Free-only mode with smart routing',
    here: 'Yes — auto-router plugin scoped to :free models',
    chatuis: 'N/A',
    rawor: 'Yes (raw)',
  },
  {
    feature: 'Pay-per-question (no subscription)',
    here: 'Yes — OpenRouter credits',
    chatuis: 'No — fixed monthly',
    rawor: 'Yes',
  },
  {
    feature: 'Codebase context / multi-file edits',
    here: 'No (out of scope)',
    chatuis: 'Some (ChatGPT Projects, Claude Projects)',
    rawor: 'No',
  },
  {
    feature: 'Long-running agents / task automation',
    here: 'No (out of scope)',
    chatuis: 'Yes (ChatGPT Tasks)',
    rawor: 'No',
  },
];

export function AboutView() {
  const router = useRouter();
  function startBlindDemo() {
    markOnboarded();
    stageBlindDemo();
    router.push('/compare');
  }
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 p-6">
      <header>
        <div className="inline-block rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-emerald-300">
          About
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-100">
          A studio for trying AI models before you commit to one.
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-neutral-400">
          Most AI products ask you to pick a model and a subscription up front. This one starts the
          other way around: <strong className="text-neutral-200">try your real questions on every
          model, see what each actually costs, then decide</strong>. Built on{' '}
          <a
            href="https://openrouter.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-300 underline-offset-2 hover:underline"
          >
            OpenRouter
          </a>{' '}
          so the same API key reaches every major model.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={startBlindDemo}
            className="rounded-md bg-emerald-500 px-4 py-2 text-[13px] font-medium text-black hover:bg-emerald-400"
          >
            Try a sample Blind compare →
          </button>
          <span className="text-[11px] text-neutral-500">
            Prefills Compare with a real prompt, hides model identities, and lets you pick the
            answer you like best before reveal.
          </span>
        </div>
      </header>

      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-neutral-400">
          When this app helps you
        </h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {USE_CASES.map((u) => (
            <article
              key={u.title}
              className="flex flex-col gap-2 rounded-xl border border-neutral-900 bg-[#0d0d10] p-4"
            >
              <h3 className="text-[13.5px] font-semibold text-neutral-100">{u.title}</h3>
              <p className="text-[11.5px] leading-snug text-neutral-500">{u.who}</p>
              <ol className="ml-4 list-decimal text-[12px] leading-relaxed text-neutral-300 marker:text-neutral-600">
                {u.steps.map((s, i) => (
                  <li key={i} className="mt-1">
                    {s}
                  </li>
                ))}
              </ol>
              <Link
                href={u.cta.href}
                className="mt-auto self-start rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11.5px] font-medium text-emerald-300 hover:bg-emerald-500/15"
              >
                {u.cta.label}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-neutral-400">
          How this compares to alternatives
        </h2>
        <div className="mt-3 overflow-auto rounded-xl border border-neutral-900">
          <table className="w-full text-[12px]">
            <thead className="bg-[#0a0a0c] text-[10.5px] uppercase tracking-wider text-neutral-500">
              <tr className="border-b border-neutral-900">
                <th className="px-3 py-2 text-left">Capability</th>
                <th className="px-3 py-2 text-left">This app</th>
                <th className="px-3 py-2 text-left">ChatGPT / Claude.ai / Gemini</th>
                <th className="px-3 py-2 text-left">Raw OpenRouter / API</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((r) => (
                <tr key={r.feature} className="border-b border-neutral-900/60">
                  <td className="px-3 py-1.5 text-neutral-200">{r.feature}</td>
                  <td className="px-3 py-1.5 text-emerald-300">{r.here}</td>
                  <td className="px-3 py-1.5 text-neutral-400">{r.chatuis}</td>
                  <td className="px-3 py-1.5 text-neutral-400">{r.rawor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-amber-300">
          When this app is the wrong tool
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-neutral-300">
          Be honest about scope. This is a <strong>trial-run and decision-support</strong> tool, not
          a workspace. Don&apos;t bring:
        </p>
        <ul className="mt-2 ml-4 list-disc space-y-1 text-[12px] leading-relaxed text-neutral-400 marker:text-neutral-600">
          <li>
            <strong className="text-neutral-200">A whole codebase.</strong> No file tree, no
            indexed context. Use Cursor, Claude Code, or Cline for that.
          </li>
          <li>
            <strong className="text-neutral-200">A long iterative project.</strong> Chats persist
            but there&apos;s no document workspace, no shared state between conversations.
          </li>
          <li>
            <strong className="text-neutral-200">A team.</strong> Local-only, single-user. No
            auth, no sharing, no permissions.
          </li>
        </ul>
      </section>

      <section className="rounded-xl border border-neutral-900 bg-[#0d0d10] p-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-neutral-400">
          What it costs to run
        </h2>
        <ul className="mt-2 ml-4 list-disc space-y-1 text-[12px] leading-relaxed text-neutral-300 marker:text-neutral-600">
          <li>
            <strong className="text-neutral-200">Free Only mode:</strong> $0 per token; rate-limited
            to ~20 RPM and 50–1000 RPD depending on whether you&apos;ve ever funded the OpenRouter
            account.
          </li>
          <li>
            <strong className="text-neutral-200">Default mode:</strong> OpenRouter passes through
            provider rates at-cost (no markup per token). They make money on a 5.5% fee at credit
            deposit time. A typical 5-model Compare run on flagship paid models is $0.05–$0.20.
          </li>
          <li>
            <strong className="text-neutral-200">Web access:</strong> ~$0.005–$0.02 per search call,
            billed to OpenRouter credits separately from token cost. Disabled in Free Only mode to
            preserve the $0 guarantee.
          </li>
          <li>
            <strong className="text-neutral-200">BYOK:</strong> If you have your own provider API
            key (Anthropic, OpenAI, etc.) you can plug it into OpenRouter to route those models
            through your provider account. OpenRouter takes ~5% of inference cost as a gateway fee.
          </li>
        </ul>
        <p className="mt-3 text-[11.5px] text-neutral-500">
          For the full mental model — wallets, the four-layer cost stack, failure modes, the precise
          way OpenRouter computes the bill — see{' '}
          <a
            href="https://github.com/anthropics/openrouter-studio/blob/main/LEARNING.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-300 underline-offset-2 hover:underline"
          >
            LEARNING.md
          </a>{' '}
          in the repo.
        </p>
      </section>
    </div>
  );
}
