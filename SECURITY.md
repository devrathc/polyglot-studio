# Security

## How your API key is handled

OpenRouter Studio is a single-tenant local app. Your `OPENROUTER_API_KEY` is read **server-side only** from `.env.local`:

- The Next.js API routes under `app/api/*` use it to call `https://openrouter.ai/api/v1/...`.
- It is never embedded in client bundles, never returned in any response, and never written to disk by the app.
- `.env.local` is gitignored. Verify with `git check-ignore -v .env.local` before any push.

## BYOK (Bring Your Own Key) keys

The BYOK registry (`components/ByokRegistry.tsx`) stores provider keys in **`localStorage` on your machine only**. They never leave the browser; the app does not transmit them to the Next.js server or anywhere else. To clear them, use the Registry UI's delete buttons or clear site data for the app's origin.

## What the app sends to OpenRouter

Each request to OpenRouter includes:
- The model id, messages, and tuning params you chose.
- An `HTTP-Referer` header set to `NEXT_PUBLIC_SITE_URL` (default `http://localhost:3000`) — shown on OpenRouter's analytics dashboard so you can tell traffic apart.
- An `X-Title: OpenRouter Studio` header for the same reason.

Nothing else. There is no analytics endpoint, no telemetry, no crash reporter.

## Reporting a vulnerability

If you find a security issue, please **do not open a public issue**. Instead open a GitHub Security Advisory on the repo (`Security` tab → `Report a vulnerability`), or contact the maintainer privately through whatever channel they've made public.

Please include:
- Affected file(s) and line numbers.
- A minimal reproduction.
- The impact you observed (e.g. key exfiltration path, command injection, etc.).

I'll respond within a few days for most reports.

## Things you should do as an operator

- **Set a monthly cap** on your OpenRouter key at https://openrouter.ai/settings/keys.
- **Rotate the key** if `.env.local` ever lands somewhere it shouldn't (cloud backup, screenshot, shared screen).
- **Don't expose the dev server to the public internet.** It has no auth. If you must access it from another LAN device, treat that LAN as trusted and add the device's IP to `allowedDevOrigins` in `next.config.ts`.
- If you fork this project, run `publishing/secret-scan.sh` before pushing — it catches accidentally-committed API keys.
