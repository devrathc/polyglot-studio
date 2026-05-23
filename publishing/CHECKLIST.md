# Pre-push checklist

One screen. Run through it every time before you push to a public repo.

## Secrets

- [ ] `.env.local` contains only your OpenRouter key, nothing else sensitive.
- [ ] `git check-ignore -v .env.local` prints a match (i.e. it's ignored).
- [ ] `./publishing/secret-scan.sh` exits clean.
- [ ] You have rotated the OpenRouter API key at https://openrouter.ai/settings/keys at least once since this folder was last on a shared machine. (Or: rotate it now.)

## Personal info

- [ ] `grep -rE "$(whoami)|$(id -F 2>/dev/null || true)" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude=package-lock.json .` finds nothing in tracked files. (macOS only; Linux: `grep -rE "$(whoami)|$(getent passwd $(whoami) | cut -d: -f5 | cut -d, -f1)" ...`.)
- [ ] No personal email addresses, phone numbers, or absolute home paths (`/Users/yourname/...`, `/home/yourname/...`) in tracked files.

## Repo hygiene

- [ ] `npx tsc --noEmit` passes.
- [ ] `git status` shows no surprise files (no `.env`, no `.app-logs/`, no `.claude/`, no `.idea/`).
- [ ] `LICENSE` is present and correct.
- [ ] `README.md` clone command uses `<YOUR_GITHUB_USER>` placeholder *or* the real repo URL — not a stale fork path.
- [ ] If you renamed the project: `package.json` `name` field reflects it.

## Build & smoke test

- [ ] `npm run build` succeeds (catches type errors `tsc --noEmit` would miss in `next dev`).
- [ ] `npm run dev`, open http://localhost:3000, try one Chat and one Compare request — both stream output.

## GitHub side

- [ ] Repo visibility is the one you intended (public vs private).
- [ ] Repo description and topics set (`openrouter`, `nextjs`, `llm`, etc.).
- [ ] Once pushed: clone into a temp directory and `npm install && npm run dev` from scratch — confirms a stranger can run it.

If any box is unchecked, **don't push**.
