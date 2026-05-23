#!/usr/bin/env bash
# Scans the working tree for API-key-shaped strings that would leak if pushed.
# Designed to run before `git push`. Exits 0 if clean, 1 if anything found.
#
# What it catches:
#   - OpenRouter keys     sk-or-v1-<hex>
#   - Anthropic keys      sk-ant-<base64>
#   - OpenAI keys         sk-<long>            (with a length guard)
#   - Google API keys     AIza<35 chars>
#   - GitHub tokens       ghp_<36>, gho_<36>, ghu_<36>, ghs_<36>, ghr_<36>
#
# What it skips (intentionally):
#   - .gitignored files (so .env.local won't trip it — that's not what we're checking).
#   - node_modules, .next, .git, .app-logs, package-lock.json.
#   - This script itself (the regexes inside it look like keys).
#   - .env.example (the placeholder OPENROUTER_API_KEY= line is fine).
#
# Portable to macOS /bin/bash 3.2 — no mapfile, no associative arrays.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

red()    { printf '\033[31m%s\033[0m\n' "$*" >&2; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

# Combined ERE pattern.
PATTERN='sk-or-v1-[A-Fa-f0-9]{32,}|sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{40,}|AIza[A-Za-z0-9_-]{35}|gh[pousr]_[A-Za-z0-9]{36,}'

# Per-line exclusion regex (matches against `path:lineno:content`).
# - publishing/secret-scan.sh: the pattern lives inside this file.
# - .env.example: documented placeholder line.
EXCLUDE_RE='^(publishing/secret-scan\.sh|\.env\.example):'

TMP_FILES="$(mktemp)"
TMP_HITS="$(mktemp)"
trap 'rm -f "$TMP_FILES" "$TMP_HITS"' EXIT

# Pick the file source: git (respects .gitignore) or filesystem walk.
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  # All files git would care about: tracked + untracked-but-not-ignored.
  git ls-files -co --exclude-standard \
    | grep -v -E '^(node_modules/|\.next/|\.app-logs/|\.git/|package-lock\.json$)' \
    > "$TMP_FILES" || true
else
  yellow "Not a git repo yet — falling back to filesystem walk (less reliable)."
  find . -type f \
    ! -path './node_modules/*' \
    ! -path './.next/*' \
    ! -path './.app-logs/*' \
    ! -path './.git/*' \
    ! -path './.claude/*' \
    ! -path './.idea/*' \
    ! -path './.cursor/*' \
    ! -name '.env' \
    ! -name '.env.local' \
    ! -name '.env.development.local' \
    ! -name '.env.production.local' \
    ! -name '.env.test.local' \
    ! -name 'package-lock.json' \
    | sed 's|^\./||' \
    > "$TMP_FILES"
fi

FILE_COUNT=$(wc -l < "$TMP_FILES" | tr -d ' ')
if [ "$FILE_COUNT" -eq 0 ]; then
  yellow "No files to scan. (Empty tree?)"
  exit 0
fi

# Scan each file. Skip binaries (rare here but defensive).
while IFS= read -r f; do
  [ -z "$f" ] && continue
  [ -f "$f" ] || continue
  if ! file "$f" 2>/dev/null | grep -q text; then
    continue
  fi
  grep -E -nH "$PATTERN" "$f" 2>/dev/null \
    | grep -v -E "$EXCLUDE_RE" \
    >> "$TMP_HITS" || true
done < "$TMP_FILES"

if [ ! -s "$TMP_HITS" ]; then
  green "secret-scan: no secrets detected in $FILE_COUNT files."
  exit 0
fi

red "secret-scan: POTENTIAL SECRETS FOUND."
red "Review each match. If real → rotate the key NOW at the provider, then remove from working tree."
red "If a documentation/example string → either move it into .env.example or qualify it (e.g. 'sk-ant-…')."
echo >&2
cat "$TMP_HITS" >&2
echo >&2
exit 1
