# Contributing

Thanks for considering a contribution. This is a small project; the bar for changes is "does this make the app more useful or more correct without adding meaningful complexity?"

## Quick start for contributors

```bash
git clone https://github.com/devrathc/polyglot-studio.git
cd polyglot-studio
cp .env.example .env.local        # add your OpenRouter API key
npm install
npm run dev                       # opens http://localhost:3000
```

Before opening a PR:

```bash
npx tsc --noEmit                  # must pass
./publishing/secret-scan.sh       # must report "no secrets detected"
```

## What kinds of changes are welcome

- **Bug fixes** with a reproduction in the PR description.
- **New OpenRouter features** that map cleanly to a tab or a per-card affordance.
- **Cost-transparency improvements** — better pricing math, clearer breakdowns, surfacing hidden charges.
- **Provider/model coverage** — the catalog rotates fast; resolvers in `lib/routing.ts` should keep working as ids move.

## What probably won't land

- Multi-tenant features (auth, user accounts, shared history). This is a local-first app by design.
- Heavy state-management rewrites. The existing `useState` + `localStorage` approach is intentional.
- New external dependencies for things doable in ~50 LOC.

## Code style

- TypeScript everywhere. Run `npx tsc --noEmit` before pushing.
- Default to **no comments** — the code should read clearly on its own. Add a comment only when the *why* is non-obvious (an upstream bug workaround, an invariant a future reader would otherwise miss).
- Match the surrounding file's conventions for component structure, Tailwind class ordering, and naming.
- No new top-level dependencies without discussing in an issue first.

## Reporting bugs

Open an issue with:
- What you did, what happened, what you expected.
- Node version (`node -v`), browser, and OS.
- Whether the bug reproduces in a fresh clone (rules out stale `localStorage`).
- The relevant snippet of `.app-logs/stderr.log` or browser console output.

## Security issues

Do **not** file public issues for security problems. See [SECURITY.md](./SECURITY.md) for the private-reporting flow.
