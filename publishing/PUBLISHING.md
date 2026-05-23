# Publishing Polyglot Studio to GitHub

End-to-end guide for taking this working copy to a public GitHub repo without leaking secrets. Follow it once for the initial publish; after that the `CHECKLIST.md` is enough for re-publishes.

Read this whole document once before running any of the commands. Most of the steps are fast; one or two need a browser tab open.

---

## 0. What "publishing" means here

You will:
1. Rotate your live OpenRouter API key (defense in depth).
2. Confirm nothing in the working tree contains secrets or personal info.
3. `git init` this directory.
4. Create a new GitHub repo.
5. Push.
6. Verify a stranger could clone and run it.

Total time: 10–15 minutes. Most of it is the verification step at the end, which you should not skip.

---

## 1. Rotate the OpenRouter API key (before anything else)

Even though `.env.local` is gitignored and the scanner will catch leaks, the key has lived on disk in a directory about to become a git repo. Treat it as compromised and rotate.

1. Open https://openrouter.ai/settings/keys.
2. Find your current key (the one in `.env.local`). Click **Delete** or **Revoke**.
3. Click **Create Key**. Set a **monthly limit** (`$5` is fine for personal use). Copy the new key.
4. Paste it into `.env.local`, replacing the old value:

   ```
   OPENROUTER_API_KEY=sk-or-v1-<your-new-key>
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

5. Test that the new key works:

   ```bash
   curl -sS https://openrouter.ai/api/v1/auth/key \
     -H "Authorization: Bearer $(grep OPENROUTER_API_KEY .env.local | cut -d= -f2)" \
     | head -c 200
   ```

   You should see a JSON blob with your account info, not a `401`.

---

## 2. Run the secret scan

```bash
chmod +x publishing/secret-scan.sh
./publishing/secret-scan.sh
```

Expected output:

```
secret-scan: no secrets detected in N files.
```

If it finds anything, **stop**. Investigate each finding:
- A real key in a source file → remove it, rotate the provider key, re-run.
- A documentation string that just *looks* like a key → qualify it (`sk-ant-…` with an ellipsis usually trips no scanner, but yours may need editing).

The scanner respects `.gitignore`, so `.env.local` will not be scanned. That is intentional — the point is to catch what would push, not what's already excluded.

---

## 3. Verify .gitignore covers everything personal

```bash
cat .gitignore
```

Should at minimum exclude: `.env`, `.env.*`, `.env*.local`, `node_modules`, `.next`, `.app-logs`, `.claude/`, `.idea/`, `.cursor/`. The one shipped with this repo already does.

Spot-check that the sensitive files are individually ignored:

```bash
git init -q 2>/dev/null || true
git check-ignore -v .env.local .app-logs .claude 2>&1
```

You should see each path matched against a `.gitignore` rule. If `git check-ignore` says one of them is *not* ignored, fix `.gitignore` before continuing.

---

## 4. Final personal-info sweep

Search for your home directory path and name in tracked-ish files:

```bash
grep -rE "$(whoami)" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git \
  --exclude-dir=.app-logs --exclude-dir=.claude --exclude-dir=.idea \
  --exclude=package-lock.json .
```

Expected: nothing, or only matches in `.gitignore`d files. (`.claude/settings.local.json` and `.app-logs/*` may match; they will not be pushed.)

Also visually skim:
- `README.md` — clone command uses `<YOUR_GITHUB_USER>` placeholder (update it to your real GitHub username if you prefer baking it in).
- `package.json` — `name` field reflects this project.
- `next.config.ts` — `allowedDevOrigins` does not contain your real LAN IP unless you intend to share it.

---

## 5. Build and smoke-test once locally

```bash
npx tsc --noEmit         # zero output = pass
npm run build            # full prod build (catches type errors next dev doesn't)
```

Then run the dev server and try one request from each main tab:

```bash
npm run dev              # opens http://localhost:3000
```

- Chat: send "hello".
- Compare: run a 2-model compare with cheap models.
- Free: send "hello" through `openrouter/free`.

If anything errors here it will also error for whoever clones; fix before publishing.

---

## 6. Initialize git

```bash
git init
git branch -M main
git add -A
git status                  # READ THIS CAREFULLY
```

The `git status` should list things like `README.md`, `app/`, `components/`, `lib/`, `package.json`, etc. It should **NOT** list:
- `.env.local`
- `.env`
- `node_modules/`
- `.next/`
- `.app-logs/`
- `.claude/`
- Any path containing your home directory or username

If anything sensitive shows up, `git rm --cached <file>` it and fix `.gitignore`, then `git add -A` and re-check.

When `git status` looks clean:

```bash
git commit -m "Initial public commit"
```

---

## 7. Create the GitHub repo

Pick one method.

### Option A: GitHub CLI (fastest)

```bash
brew install gh             # macOS, if not already installed
gh auth login               # interactive: pick GitHub.com, HTTPS, browser auth
gh repo create polyglot-studio --public --source=. --remote=origin --description "Local-first Next.js studio for OpenRouter — chat, compare, free, multimodal."
```

This creates the GitHub repo *and* sets the remote in one step. Skip to step 8.

### Option B: Web UI

1. Go to https://github.com/new.
2. Repository name: `polyglot-studio` (or whatever you prefer).
3. Visibility: **Public**.
4. **Do not** check "Add a README", "Add .gitignore", or "Add license" — you already have all three locally and double-init causes merge headaches.
5. Click **Create repository**.
6. Wire your local repo to it:

   ```bash
   git remote add origin https://github.com/<YOUR_GITHUB_USER>/polyglot-studio.git
   ```

---

## 8. Push

```bash
git push -u origin main
```

If it asks for credentials, paste a Personal Access Token (Settings → Developer settings → Personal access tokens) — GitHub deprecated password auth.

After it pushes, open the repo URL. You should see your README rendered.

---

## 9. Post-upload verification (do not skip)

### 9a. The most important test: clone into a clean directory

```bash
cd /tmp
rm -rf polyglot-studio-test
git clone https://github.com/<YOUR_GITHUB_USER>/polyglot-studio.git polyglot-studio-test
cd polyglot-studio-test
ls -la
```

Confirm:
- `.env.local` is **not** there.
- `.app-logs/`, `.claude/`, `.idea/` are **not** there.
- `node_modules/` is **not** there.
- `README.md` is there.

Now try the install path a stranger would follow:

```bash
cp .env.example .env.local
# Open .env.local and paste your NEW OpenRouter key (the one from step 1)
npm install
npm run dev
```

It should open and work. If it doesn't, fix it, push the fix, re-clone, re-test. Repeat until clean.

### 9b. Search the rendered README on GitHub

Open the repo in the browser. Click around — Issues, Settings, the file tree. Scan the rendered README and SECURITY.md for any leftover references to your local paths or accounts.

### 9c. Search the repo for your API key (paranoid mode)

```bash
git log --all -p | grep -E 'sk-or-v1-[A-Fa-f0-9]+' && echo LEAK || echo OK
```

If it prints `LEAK`, the key is in git history — you need to scrub it. The simplest fix: delete the GitHub repo, run `rm -rf .git`, redo from step 6 (you've already rotated the key, so the worst-case is the *old* key in history pointing at a dead account).

---

## 10. Polish (optional, post-publish)

Once the repo is up and verified, these make it look more inviting:

- **Topics**: Repo home page → ⚙ next to `About` → Topics → add: `openrouter`, `nextjs`, `llm`, `claude`, `gpt`, `gemini`, `multimodal`, `byok`.
- **Description**: same gear icon → one-line summary (steal the first sentence of the README).
- **Pinned**: Profile → Pinned → add the repo.
- **Screenshots**: capture each tab and add to README. Stick them under `docs/img/` so the repo root stays clean.
- **GitHub Actions CI** (optional): add `.github/workflows/ci.yml` that runs `npm ci && npx tsc --noEmit && npm run build` on every PR.
- **Issue templates**: `.github/ISSUE_TEMPLATE/bug_report.md` and `feature_request.md`.

---

## 11. If something leaks despite all this

You pushed something you shouldn't have. Don't panic.

1. **Rotate the key immediately** at the provider. The key is now public; assume bots will start using it within minutes.
2. **Delete the GitHub repo**: Settings → Danger Zone → Delete this repository. Caching means the data may still be retrievable for hours; that's why step 1 came first.
3. Locally: `rm -rf .git`, redo from step 6 after fixing the source of the leak.
4. If you want history-preserving scrubbing instead of a full reset: use `git filter-repo` (https://github.com/newren/git-filter-repo). It is non-trivial; the reset-and-republish path above is safer for a small project.

---

## 12. Subsequent updates

For day-to-day pushes after the initial publish:

```bash
./publishing/secret-scan.sh    # must pass
git status                     # sanity-check
git add -p                     # stage interactively, easy to spot surprises
git commit -m "your message"
git push
```

That's it. The `CHECKLIST.md` in this folder is a one-screen reminder of these steps.
