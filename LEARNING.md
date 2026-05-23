# Learning notes — Polyglot Studio

A personal write-up of what this project does, the OpenRouter surfaces it touches, and the parts of the platform that took me a while to internalize. Written as my own reference, not user docs (those live in [README.md](./README.md)).

The shape of this file:

1. [Elevator pitch](#elevator-pitch)
2. [OpenRouter in 90 seconds](#openrouter-in-90-seconds) — wallets, rate card, free pool
3. [Per-tab guide with examples](#per-tab-guide-with-examples) — what each tab is for, a real prompt, the bill you'd see
4. [Free Only mode: how it actually constrains the gateway](#free-only-mode-how-it-actually-constrains-the-gateway)
5. [Web access: server tools and why they're locked in Free Only](#web-access-server-tools-and-why-theyre-locked-in-free-only)
6. [Where limits and costs really come from](#where-limits-and-costs-really-come-from) — the four-layer cost stack
7. [Engineering decisions worth defending](#engineering-decisions-worth-defending)
8. [Failure modes I learned to recognize](#failure-modes-i-learned-to-recognize)
9. [Cost intuition](#cost-intuition)
10. [What I'd do differently](#what-id-do-differently)

## Elevator pitch

A local-first, single-user Next.js 16 / React 19 studio for **OpenRouter** that exposes its routing surface area as a usable UI. Four workflow tabs (Chat, Compare, Multimodal, Models) plus Settings demonstrate distinct OpenRouter routing modes — manual model selection, intelligent auto-routing, free-pool routing, vision routing — with a unified UX layer (markdown rendering, token + dollar cost breakdowns, persistent history, lazy-loaded catalog, server-tool web access, live OpenRouter credits display).

The OpenRouter API key lives only on the server; the browser talks to local `/api/*` routes which proxy to OpenRouter so the key is never exposed to client bundles, devtools, or screenshots.

**The Free tab has been removed** (was: a dedicated `openrouter/free` chat). Free-pool access is now a first-class **mode** inside Chat and Compare, not a separate tab — see [Free Only mode](#free-only-mode-how-it-actually-constrains-the-gateway).

## OpenRouter in 90 seconds

Three rules cover most of what surprised me:

1. **OpenRouter credits and provider credits are separate balances.** OpenRouter credits (USD on `openrouter.ai/settings/credits`) fund the gateway and, in the default flow, the underlying tokens too. Provider credits (at `console.anthropic.com`, `platform.openai.com`, etc.) fund tokens *only when BYOK is configured for that provider on OpenRouter*.

2. **BYOK is a routing override, not a billing replacement.** Adding an Anthropic API key at `openrouter.ai/settings/integrations` makes Claude calls route through your Anthropic console (where you pay tokens), but OpenRouter still skims a ~5% platform fee from your OpenRouter credit balance. Both wallets have to be funded — a request will not run with $0 OpenRouter credit even when BYOK is set up.

3. **Subscriptions are not API access.** Claude.ai Pro/Max, ChatGPT Plus, and Gemini Advanced are chat-UI subscriptions and grant zero programmatic tokens. BYOK requires a real provider API key from the provider's *developer console* (e.g., `sk-ant-…` from `console.anthropic.com`), with its own pay-per-token credit.

### Who pays, when

```
                       ┌────────────────────────────────────────────────────┐
                       │  Your machine: Polyglot Studio                     │
                       │  (the browser talks only to /api/* on localhost)   │
                       └────────────────────────────────────────────────────┘
                                              │
                                              ▼
                       ┌────────────────────────────────────────────────────┐
                       │  OpenRouter gateway                                │
                       │  • Reserves max_tokens × output_rate at call start │
                       │  • Releases the unused portion at call end         │
                       │  • Charges the real usage to your wallet           │
                       └────────────────────────────────────────────────────┘
                          │                       │                   │
                  default flow              BYOK configured       free pool
                          ▼                       ▼                   ▼
              OpenRouter credits      Provider account billed     no charge
              (pays for tokens +      for tokens; OpenRouter      (rate-limited)
              gateway markup)         takes ~5% from your
                                      OpenRouter credits

```

### The free pool, specifically

`:free`-suffixed models and `openrouter/free` route via OpenRouter's own provider arrangements — no user key required, no token charge.

| Account state | Per-minute | Per-day |
|---|---|---|
| Never funded | 20 RPM | **50 RPD** |
| Funded ≥ $10 lifetime | 20 RPM | **1000 RPD** |

The $10 unlock is a *lifetime* gate — once you've ever deposited $10, the higher daily cap sticks even after you spend it down. The 20 RPM per-minute cap stays the same in both states.

### How the actual bill is computed

There's no per-model "tier" or "plan." Every model has one rate card from `GET /models`, and OpenRouter sums these components from the `usage` block the provider returns (math lives in [`lib/pricing.ts`](./lib/pricing.ts)):

| Component | Source | Rate |
|---|---|---|
| Input (uncached) | `usage.prompt_tokens` | `pricing.prompt` |
| Cached input | `usage.prompt_tokens_details.cached_tokens` | `pricing.input_cache_read` (a discount: `cached × (cache_read − prompt)`) |
| Output (visible) | `usage.completion_tokens` | `pricing.completion` |
| Reasoning (hidden) | `usage.completion_tokens_details.reasoning_tokens` | `pricing.internal_reasoning` (often equals `pricing.completion`) |

**`reasoning: { effort: 'low' | 'medium' | 'high' }` does not change the per-token rate.** It only changes how many reasoning tokens the model burns. A high-effort Opus answer can silently spend 3–8k thinking tokens at the output rate before producing any visible content.

## Per-tab guide with examples

Each tab below follows the same shape: **what it's for**, **what it sends**, **a sample prompt with a realistic bill**, and **when BYOK changes the picture**.

### Chat — single-conversation, single-model

**Use this when** you want a normal chat with one model at a time and you care about response quality more than comparison. Presets let you trade speed vs. quality vs. cost without picking a model id. **Mode toggle** (Default / Free Only) at the top of the sidebar constrains the model surface; **Web access** toggle below it grants `openrouter:web_search` + `openrouter:web_fetch` to the model (Default mode only — see [Web access](#web-access-server-tools-and-why-theyre-locked-in-free-only)).

**What it sends:** `POST /chat/completions` (streaming). Model is the preset's currently-mapped id, your manual override, or `openrouter/auto` (the auto-router). When Free Only is on and the preset is Auto, the request additionally carries the `auto-router` plugin with `allowed_models = <every :free model id in the live catalog>` so OpenRouter constrains its routing to the free pool. When Web access is on (Default mode only), the request adds `tools: [{type: 'openrouter:web_search'}, {type: 'openrouter:web_fetch'}]`.

**Example.**
- Preset: **Quality** (Opus 4.7 with `reasoning.effort=medium`).
- Prompt: *"Explain the difference between B-trees and LSM trees for a database storage layer, and when you'd pick one over the other."* (~25 tokens)
- Reply: ~700 visible tokens + ~2,400 reasoning tokens (medium effort burns these silently before answering).
- Bill, default flow: ~$0.06 (input) + ~$0.05 (visible output) + ~$0.18 (reasoning, billed at the output rate) ≈ **$0.29**.
- Same prompt on the **Cost** preset (DeepSeek V3): ≈ **$0.001**.

**With BYOK (Anthropic):** the same Quality preset bills Anthropic for the ~3,100 output + reasoning tokens; OpenRouter takes ~5% of that as a gateway fee from your OpenRouter credit balance. You still need both wallets non-zero.

### Compare — same prompt, up to 5 models

**Use this when** you don't know which model is best for the task and want to A/B/C/D/E them on the same input. Each card shows the response, token breakdown, and dollar cost so you can pick the winner on quality-per-dollar. Same **Mode** (Default / Free Only) and **Web access** toggles as Chat, sitting at the top of the workspace.

**What it sends:** `POST /chat/completions` (non-streaming) fanned out via `Promise.all`, one call per model card. Each card is billed independently — if one model 402s, the others still complete. Web access adds `tools: […]` to every card's request.

**Per-mode default model lineup** is persisted globally per user: editing a slot in any session updates the saved lineup for that mode, so future sessions inherit your latest 5. Free Only ships with a curated lineup (`arcee/trinity-large-thinking`, `nvidia/nemotron-3-super-120b`, `nousresearch/hermes-3-llama-3.1-405b`, `qwen/qwen3-next-80b`, `openai/gpt-oss-120b` — all `:free`) and falls through gracefully when a curated id rotates out of the free pool.

**Example.**
- Prompt: *"Write a Zod schema in TypeScript for a Stripe `checkout.session.completed` webhook payload. Include only the fields you actually need for fulfillment."* (~30 tokens)
- Models (the default Compare slate): Opus 4.7, Sonnet 4.6, GPT-5, Gemini 2.5 Pro, Grok 4.
- Sample bills, default flow (one ~600-token answer each):
  - Opus 4.7: ~$0.09
  - Sonnet 4.6: ~$0.018
  - GPT-5: ~$0.05 (plus ~1k reasoning at output rate)
  - Gemini 2.5 Pro: ~$0.012
  - Grok 4: ~$0.020
  - **Total ≈ $0.19**

**With BYOK (per-provider):** Compare runs can mix wallets. An Anthropic key sends Opus + Sonnet cards to your Anthropic console; everything else stays on OpenRouter credits. The `CostMeter` per-card numbers don't change — that's just what each provider would have billed regardless.

### Multimodal — drop in images, ask a vision model

**Use this when** you have a screenshot, photo, or diagram and want a vision-capable model to reason about it. Default is `openrouter/auto` so OpenRouter picks a vision model per-request based on the image content.

**What it sends:** `POST /chat/completions` with content blocks of form `[{type:'text', text}, {type:'image_url', image_url:{url}}]`. The `url` can be `http(s)://` or a `data:` URL (the app inlines drag-and-drop / pasted images as data URLs). Cap: 4 images @ 5 MB each.

**Example.**
- Image: screenshot of a Postgres error log (200 KB).
- Prompt: *"What is this error log telling me and what's the most likely root cause?"*
- Auto-router lands on: `openai/gpt-5` (it's vision-capable, reasoning-capable).
- Image is processed as ~800 input tokens (image tokenization is model-specific and usually higher per visual element than text tokens).
- Reply: ~400 visible tokens + ~1,200 reasoning tokens.
- Bill, default flow: ~$0.02 (input incl. image) + ~$0.012 (visible) + ~$0.036 (reasoning) ≈ **$0.07**.

**Switch to Free router mode** (top-right of the tab) to route through `openrouter/free` instead — same UI, same upload flow, **$0.00** bill, lower-quality vision models.

**With BYOK (OpenAI):** the same call bills your OpenAI account for the GPT-5 tokens; OpenRouter takes ~5% from your OpenRouter credits.

### Models — searchable catalog, no billing

**Use this when** you want to know what's available before composing a Compare run, look up a model's context window, or check pricing in `$/M tokens` form. The list is **split into two sections**: *Free pool* (emerald-accented, count badge) on top, *Paid catalog* (neutral) below. Each row's **Use in Chat →** button sends you to the Chat tab with that model pinned as a manual override and the chat mode auto-switched (Free Only for `:free` models, Default for everything else).

**What it sends:** `GET /models`, server-cached for 10 minutes. No chat calls, no billing here — the numbers in the table are reference rates for the call you'd make from another tab.

### Settings — local BYOK registry

**Use this when** you've configured a provider integration at `openrouter.ai/settings/integrations` and want the app to know about it. Toggling here doesn't change anything on OpenRouter (they don't expose an integrations API); it just lets the app accurately label which wallet a given model bills, and deep-links you to the OpenRouter page where the real on/off lives.

## Free Only mode: how it actually constrains the gateway

A toggle in Chat and Compare. Same control across both tabs (`components/ModeToggle.tsx`), persisted globally and per-session — switching sessions restores the mode that session was created in.

When Free Only is **on**, the app constrains the gateway differently for each preset/model selection:

| Selection | What goes on the wire |
|---|---|
| Auto preset | `model: openrouter/auto` + `plugins: [{id:'auto-router', allowed_models: [<every :free model id>]}]` — the auto-router does real prompt-aware routing, just constrained to the free pool. |
| Quality preset | App-side mapping to a curated free model (e.g., `arcee-ai/trinity-large-thinking:free`), falling through to the first available in `FREE_QUALITY_PREFERENCES` when ids rotate out. `reasoning.effort=medium` is still sent — supported free models will use it; others ignore it. |
| Balanced / Speed preset | Same idea, different curated list per `lib/routing.ts`. |
| Cost preset | `model: openrouter/free` — random pick across the free pool. Cost preset becomes "any free model" since they're all $0. |
| Manual mode | Catalog dropdown is filtered to `:free`-suffixed ids only. |

Per-session persistence: each `StoredSession` (Chat) and `CompareSession` (Compare) carries a `mode?: 'default' | 'free'` field. When you click an old session, the active mode and (in Chat) web-access state restore to whatever they were when the session last ran. This is in `app/page.tsx` (`selectSession`) and `components/CompareView.tsx` (`selectSession`).

Why this matters: `openrouter/auto` by itself routes across **all** models. To "free-only auto" without the plugin you'd be doing client-side filtering of the response, which is too late — you've already been routed somewhere paid. The plugin pushes the constraint into OpenRouter's router itself.

## Web access: server tools and why they're locked in Free Only

A toggle in Chat and Compare's sidebars (`components/WebAccessToggle.tsx`). When on, the request adds:

```js
tools: [
  { type: 'openrouter:web_search' },
  { type: 'openrouter:web_fetch' },
]
```

These are **OpenRouter server tools**, not native function calling. OpenRouter operates them — the model decides when to call (0–N times per turn), OpenRouter runs the search/fetch, the result is fed back into the same response. No multi-turn loop on our side; the streamed response includes the final answer after any tool round-trips. This replaces the deprecated `web` plugin and `:online` model variant.

**The wallet trap:** the search itself is billed *separately* from the model. Even when the model is a free `:free` variant, each search bills OpenRouter credits — typically:

| Engine | Per-call cost |
|---|---|
| Exa (default) | ~$0.02 (5 results × $4/1,000) |
| Parallel | $0.005 (+$0.001/extra result past 10) |
| Firecrawl | passes through to user's Firecrawl account |
| Native (OpenAI/Anthropic/Perplexity/xAI built-ins) | provider's published rate |

That means **enabling web search in Free Only mode would silently tick down the OpenRouter balance** even when the model itself is $0. To preserve Free Only's "$0 per token" guarantee, the toggle is **locked off** when `chatMode === 'free'` and shows an inline explanation. Switch back to Default to re-enable.

A second compounding reason for the lock: when `tools` is present in the request, OpenRouter only routes to providers that advertise tool support. Many `:free` models don't, so enabling tools in Free Only would shrink the routable pool to a small tool-capable subset — worse routing, worse quality, plus the per-call charge.

In Compare the toggle behaves identically: web access is available only in Default mode and applies to every card in a run. Tool-incapable models in the lineup will 4xx on that card; the other cards still complete.

**No public API for listing or toggling integrations.** OpenRouter has `/api/v1/keys` for managing your OpenRouter API keys (creation, rate limits, "Include BYOK in spend limit"), but no endpoint to list or enable/disable your provider keys. That's why the Settings tab is a local registry + a deep link to `openrouter.ai/settings/integrations`, not a real management surface.

## Where limits and costs really come from

A four-layer mental model. When something fails, the *kind* of failure tells you which layer to blame:

| Layer | Controls |
|---|---|
| **Model architecture** | Hard max input context (e.g., 200K for Claude Opus 4.7); hard max output (e.g., 65,536 for some Anthropic models); refusal / safety baked into weights; reasoning capability. |
| **Provider** (Anthropic, OpenAI, Google, …) | Per-token prices (input / cached / output / reasoning); per-tier rate limits (e.g., Anthropic Tier 1 ≈ 50 RPM / 50K TPM); regional availability. |
| **OpenRouter (gateway)** | Markup (default flow) or ~5% BYOK fee; free-pool rate caps; 402 credit reservation; auto-router model selection; streaming format; plugin system; failover. |
| **This app** | `max_tokens` defaults per provider ([`lib/budget.ts`](./lib/budget.ts)); auto-retry on 402 and on `finish_reason='length'`; UI caps (5 Compare slots, 4 Multimodal images @ 5 MB). |

Quick error-to-layer cheat sheet:

- `400 invalid model id` → app or gateway (model id is wrong / not in catalog).
- `402` credit error → gateway (pre-reservation).
- `429` → gateway (free-pool cap) or provider (BYOK rate limit).
- `200` + empty content + `finish_reason='length'` → model layer (reasoning consumed all of `max_tokens` before producing visible output).
- `200` + `refusal` set → provider safety layer.

### The 402 reservation, concretely

OpenRouter holds `max_tokens × pricing.completion` against your balance the moment the call starts. It's a *hold*, not a charge — the actual cost is deducted at the end and the unused hold is released.

If you don't set `max_tokens`, OpenRouter uses the model's hard ceiling, which is 65,536 on most Anthropic and Gemini models. That's why a "small" prompt to Opus with no explicit `max_tokens` will 402 on a low balance: at $75/M output, the hold alone is ~$4.92 even if the answer ends up being 200 tokens.

The app sidesteps this with per-provider defaults in [`lib/budget.ts`](./lib/budget.ts) and parses the 402 message to retry once with the affordable cap minus a 50-token safety margin.

## Engineering decisions worth defending

1. **API key strictly server-side.** Browser only ever talks to our own `/api/*` routes; we proxy to OpenRouter. Avoids leaking the key into HMR bundles, devtools, or shared screenshots.
2. **Per-provider `max_tokens` defaults** ([`lib/budget.ts`](./lib/budget.ts)). Anthropic output is ~$15–75/M so we cap small (1024); reasoning models (gpt-5, o-series) cap large (16384) because internal CoT consumes the same budget as visible output.
3. **Two-tier auto-retry on `chat/completions`:**
   - **402 (credits):** parse "can only afford N", retry once with `N − 50`.
   - **`finish_reason='length'` + empty content:** symptom of reasoning models exhausting their budget on CoT; retry once with cap doubled (capped at 32768).
4. **Lazy-init persistence pattern.** Read `localStorage` synchronously inside `useMemo(() => loadPersisted(), [])` and feed `useState`'s initial value, instead of a load-effect. Eliminates the hydration race where a save-effect would overwrite storage with the empty initial state before the load lands.
5. **Catalog-validated dropdowns.** The Compare tab refuses to call OpenRouter with model ids that aren't in the live catalog — closes a footgun where stale free-text input (e.g., a hallucinated `openai/gpt-latest`) would silently fail with HTTP 400.
6. **HMR cross-origin fix.** Next 16's `allowedDevOrigins` blocks the HMR websocket when accessed from a non-localhost origin (LAN IP). When the WS fails, the browser fallback path full-reloads the page on a tight cycle — manifested as "textbox keeps resetting" + repeated `GET /<page>` in the dev log.
7. **Prod-as-an-app via launchd, not Electron/Tauri.** A LaunchAgent runs `next dev` (or `next start`) on port 3030; Safari's "Add to Dock" wraps the URL in a standalone window. Zero new toolchain, ~40 lines of bash, real Mac-app behavior in the dock and Cmd+Tab.
8. **Surface the routing layer in the UI.** Each tab's `TabHeader` names the OpenRouter endpoint and model id it sends, including `openrouter/auto` and `openrouter/free` distinctly, plus a per-tab `PricingNote` that explains which wallet gets charged and when. Hides nothing — debugging "why didn't this model respond?" doesn't require opening the network tab.
9. **Local BYOK registry, honest about its limits.** OpenRouter doesn't expose an API to list or toggle integration keys, so the Settings panel records BYOK state locally and deep-links to `openrouter.ai/settings/integrations` for the real on/off. Better to admit the constraint than to fake a control that doesn't do anything.
10. **Free Only is a mode, not a tab.** The earlier dedicated `Free` tab was a strict subset of what Chat in Free-Only-Auto mode now does (auto-router plugin with `allowed_models` whitelist gives prompt-aware routing across the free pool, which random-pick `openrouter/free` doesn't). Deleting the tab removed two ways to do one thing without losing any capability — the Cost preset still gives the random-pick behavior in one click.
11. **Web access is gated by the cost guarantee, not by capability.** Server tools work on free models *in principle*, but charging OpenRouter credits per search would silently break the "$0 per token" promise of Free Only mode. The toggle is locked off in Free Only and explains why inline — preferable to a warning the user might miss.
12. **Per-mode persistence with auto-update.** Compare's per-mode model lineup updates the saved global default the moment you edit a slot, so future sessions inherit your latest preference. This matches "remember my choices" rather than "remember per-session" — sessions still keep their own snapshot of what was run, but the lineup that powers new sessions tracks your latest edits.
13. **Credits badge in Nav.** Server-cached `/api/credits` proxy (TTL 30s) avoids hammering OpenRouter and keeps the key off the wire to the browser. Surfaces balance with traffic-light coloring (red for unfunded / ≤$0, amber for low, neutral otherwise) and refreshes on tab focus so coming back from buying credits is reflected immediately. Tooltip exposes total deposited vs. used so you can sanity-check provider dashboard math.
14. **Dev wrapper handles port-clearing in Node, not via an npm shell hook.** The `predev` shell pipeline (`lsof | xargs kill`) printed itself before every run and triggered "allow this command?" gating in some terminals. Moving the kill into `scripts/dev.mjs` (SIGTERM, escalate to SIGKILL, poll until socket releases) made `npm run dev` silent and quirk-free across Cursor's integrated terminal and standalone shells.

## Failure modes I learned to recognize

- **Empty content + length finish on reasoning models** → `max_tokens` consumed by CoT. Bump cap or lower `reasoning.effort`.
- **Empty content + 200 OK with no error** → invalid model id treated as a synthetic router target by some providers, or content filter on the response side; `finish_reason` is the diagnostic.
- **Repeated `GET /<page>` + textbox resets** → HMR websocket rejected for cross-origin in Next 16; fix with `allowedDevOrigins`.
- **`402 You requested up to 65536 tokens, but can only afford X`** → no `max_tokens` set; OpenRouter reserves at the model's default ceiling. Always set `max_tokens` explicitly.
- **Process lingers after closing the IDE** → `npm run dev`'s child `next-server` becomes an orphan when the parent dies; `predev` hook + a `lsof | xargs kill` script cleans it up.
- **Pasting a Claude.ai Pro account into BYOK does nothing useful.** Pro is a chat-UI subscription, not an API key; you need an `sk-ant-…` key from `console.anthropic.com` with separate funding.

## Cost intuition

- A typical 500-token Compare run across 5 flagship models lands at **$0.05–$0.20** in OpenRouter credits. Opus and GPT-5 dominate; Gemini 2.5 Pro and Sonnet 4.6 are moderate; DeepSeek / Grok cost a fraction.
- Reasoning models (gpt-5, o-series) bill `reasoning_tokens` at the *output* rate even though they're invisible. A "short" gpt-5 answer with medium effort can spend 2k+ reasoning tokens silently.
- BYOK to Anthropic only saves money if your Anthropic console price is lower than OpenRouter's pass-through; in practice it's usually a wash (OpenRouter mostly mirrors provider pricing). The real benefit is using existing API balance or not commingling spend across projects.
- **For a single-user local studio: fund OpenRouter with $10–20 and skip BYOK.** One bill, one dashboard, all 360+ models reachable, plus the higher free-pool daily cap. BYOK only earns its keep if you already have an active provider account you want to consolidate onto.
- **Unfunded accounts (`total_credits === 0`) can't run anything except `:free` models.** Paid models 402 immediately on the worst-case reservation. Web search 402s too because the search itself bills OpenRouter credits. The credits badge in the nav reads red `Fund OpenRouter` in this state to make it visible at a glance — that's the most common "why did everything 402?" cause.

## What I'd do differently

- Replace the per-tab session-management duplication with a tiny generic hook (`useSessionList<T>(tab)`).
- Add an integration test against `openrouter/auto` with a known prompt — would have caught the empty-content cases earlier.
- Move pricing math into a single source of truth on the server route — the client currently re-derives breakdown from `usage` + catalog pricing; one off-by-zero fix has to be made in two places.
- Use `next start` + a watch-and-rebuild loop for the dock app instead of `next dev` if I cared about prod parity; not worth it for this use case.
- Add image attachment to the Compare tab so vision models can be compared side-by-side without a separate Multimodal-compare mode.
- Wire the new BYOK registry into per-model wallet badges in Chat / Compare / Multimodal cards so the "bills X" hint is correct at-a-glance, not just in the static PricingNote.
