'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { CreditsBadge } from '@/components/CreditsBadge';
import { Tip } from '@/components/Tip';

const TABS = [
  { href: '/', label: 'Chat', tip: 'Single-conversation chat with presets, manual model picker, and per-call cost tracking.' },
  { href: '/compare', label: 'Compare', tip: 'Run the same prompt across up to 5 models in parallel and compare answers side-by-side. Includes Blind mode for unbiased preferences.' },
  { href: '/multimodal', label: 'Multimodal', tip: 'Drop / paste / upload images and ask a vision-capable model about them.' },
  { href: '/models', label: 'Models', tip: 'Browse every model OpenRouter exposes — context windows, prices, modalities. Split into Free pool and Paid catalog.' },
  { href: '/insights', label: 'Insights', tip: 'Your personal stats: cost per good answer (👍 / 👎), subscription arbitrage (API vs $20/mo plans), and blind preferences from Compare.' },
  { href: '/about', label: 'About', tip: 'What this app is for, when to use it, and how it compares to ChatGPT / Claude.ai / Gemini.' },
  { href: '/settings', label: 'Settings', tip: 'BYOK registry — record which providers you have configured BYOK for at openrouter.ai/settings/integrations.' },
];

const isDev = process.env.NODE_ENV !== 'production';

async function quitApp() {
  if (!confirm('Stop the OpenRouter Studio dev server?')) return;
  try {
    await fetch('/api/exit', { method: 'POST' });
  } catch {
    // Server is gone before the response — that's the point.
  }
  window.close();
  document.body.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font:14px system-ui;color:#888;background:#0a0a0b">Server stopped. You can close this tab.</div>';
}

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-neutral-900 bg-[#0a0a0b]/90 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-[1400px] items-center gap-6 px-5">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
          OpenRouter Studio
        </div>
        <nav className="flex items-center gap-1 text-sm">
          {TABS.map((t) => {
            const active = path === t.href || (t.href !== '/' && path?.startsWith(t.href));
            return (
              <Tip key={t.href} content={t.tip} side="bottom">
                <Link
                  href={t.href}
                  className={`rounded-md px-3 py-1.5 transition-colors ${
                    active
                      ? 'bg-neutral-800 text-white'
                      : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                  }`}
                >
                  {t.label}
                </Link>
              </Tip>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <CreditsBadge />
          {isDev && (
            <button
              onClick={quitApp}
              title="Stop the dev server"
              aria-label="Stop the dev server"
              className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-red-950/60 hover:text-red-300"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                <path d="M2 2l10 10M12 2L2 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
