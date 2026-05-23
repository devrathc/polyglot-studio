// First-run detection. The Chat page redirects to /about on the very first
// visit so a brand-new user lands on positioning + use-cases before being
// dropped into the empty chat. After that the flag stays set forever
// (cleared only when localStorage is wiped).

const KEY = 'polyglot-studio:onboarded:v1';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function hasOnboarded(): boolean {
  if (!isBrowser()) return true; // SSR: don't redirect from server render
  return window.localStorage.getItem(KEY) === 'true';
}

export function markOnboarded(): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(KEY, 'true');
}

// Sample prompt used by the About → "Try a sample Blind compare" CTA. Short
// enough to keep costs low, evocative enough to actually differentiate models.
export const SAMPLE_BLIND_PROMPT =
  "In 200 words, explain why distributed consensus (like Raft) is hard to get right. Keep it concrete — name at least one specific failure mode that's easy to overlook.";

export const SAMPLE_COMPARE_DEMO_FLAG = 'polyglot-studio:demo:blind-compare';

/** Drop a one-shot demo payload that CompareView picks up on next mount. */
export function stageBlindDemo(): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(SAMPLE_COMPARE_DEMO_FLAG, '1');
}

export function consumeBlindDemo(): boolean {
  if (!isBrowser()) return false;
  const v = window.localStorage.getItem(SAMPLE_COMPARE_DEMO_FLAG);
  if (v === '1') {
    window.localStorage.removeItem(SAMPLE_COMPARE_DEMO_FLAG);
    return true;
  }
  return false;
}
