// Per-provider default output caps. Anthropic output is the most expensive,
// so it gets the smallest default to avoid 402s on low balances.
const PROVIDER_CAPS: Record<string, number> = {
  anthropic: 1024,
  openai: 4096,
  google: 4096,
};

const FALLBACK_CAP = 2048;

// Reasoning models bake their internal CoT tokens into max_tokens, so a small
// cap (4k) often gets fully consumed by reasoning, leaving no room for visible
// content (finish_reason=length, content=''). Bump these to 16k by default.
const REASONING_MODEL_CAP = 16384;
const REASONING_PATTERNS: RegExp[] = [
  /^openai\/gpt-5/i,                  // gpt-5, gpt-5-mini, gpt-5-codex, etc.
  /^openai\/o\d/i,                     // o1, o3, o4
  /^openai\/(o-)?\d-(mini|preview)/i,  // o1-mini, o3-mini, etc.
];

export function isReasoningModel(model: string): boolean {
  return REASONING_PATTERNS.some((p) => p.test(model));
}

export function defaultMaxTokens(model: string): number {
  if (isReasoningModel(model)) return REASONING_MODEL_CAP;
  const provider = model.split('/')[0]?.toLowerCase();
  return (provider && PROVIDER_CAPS[provider]) || FALLBACK_CAP;
}

// Maximum cap we'll ever auto-bump to (e.g. on a length-finish retry).
export const ABSOLUTE_MAX_TOKENS = 32768;

// OpenRouter 402 message looks like:
//   "402 This request requires more credits, or fewer max_tokens. You requested
//    up to 2048 tokens, but can only afford 1589."
// Returns the affordable token count, or null if the error isn't a parseable 402.
export function parseAffordableTokens(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (!/402/.test(msg) && !/more credits/i.test(msg)) return null;
  const m = msg.match(/can only afford\s+(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Small safety margin so we don't toe the credit line on the retry.
export const RETRY_SAFETY_MARGIN = 50;
