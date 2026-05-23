// Classifies an OpenRouter / provider error string into a small structured
// shape that the UI can render with an actionable hint. The mapping is by
// HTTP status (parsed out of the message) with a few content sniffers for
// the common cases (credits, BYOK, content filters).
//
// We deliberately keep this small: each code maps to (title, hint, retriable).
// The hint is what the user should *do* — not what happened.

export type ErrorKind =
  | 'rate-limit'       // 429 — free-pool or provider rate-limit
  | 'no-credits'       // 402
  | 'invalid-model'    // 400 with model-id hints, or 404
  | 'auth'             // 401 / 403 — bad key, BYOK required, region gate
  | 'bad-request'      // 400 generic
  | 'timeout'          // 408 / 504 / network
  | 'provider-down'    // 503 / 502 / 500
  | 'content-filter'   // refusal or content policy
  | 'unknown';

export type StructuredError = {
  kind: ErrorKind;
  status?: number;
  title: string;
  hint: string;
  retriable: boolean;
  /** Raw message preserved for the user to expand if they want details. */
  raw: string;
};

const STATUS_RE = /\b(4\d\d|5\d\d)\b/;

function parseStatus(msg: string): number | undefined {
  const m = msg.match(STATUS_RE);
  return m ? Number(m[1]) : undefined;
}

export function classifyError(err: unknown): StructuredError {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const status = parseStatus(raw);
  const lower = raw.toLowerCase();

  // Sniff the most common cases first, before falling back to status code.
  if (status === 429 || /rate[- ]?limit/i.test(raw) || /too many requests/i.test(raw)) {
    return {
      kind: 'rate-limit',
      status: status ?? 429,
      title: 'Rate-limited',
      hint:
        "This model is currently rate-limited. Free models share a global per-minute cap (~20 RPM) and individual free providers have their own; paid providers have per-tier limits too. Wait ~30s or swap this card to a different model.",
      retriable: true,
      raw,
    };
  }
  if (status === 402 || /insufficient credits/i.test(raw) || /more credits/i.test(raw)) {
    return {
      kind: 'no-credits',
      status: status ?? 402,
      title: 'Insufficient credits',
      hint:
        'OpenRouter balance can\'t cover this call (or its worst-case max_tokens reservation). Add credits at openrouter.ai/settings/credits, or switch the card to a :free model.',
      retriable: false,
      raw,
    };
  }
  if (status === 404 || /not in catalog/i.test(raw) || /unknown model/i.test(raw)) {
    return {
      kind: 'invalid-model',
      status: status ?? 404,
      title: 'Model not found',
      hint:
        'The model id isn\'t in OpenRouter\'s live catalog. It may have been renamed, removed, or you typed it manually. Pick a different model from the dropdown.',
      retriable: false,
      raw,
    };
  }
  if (status === 401 || /unauthor/i.test(raw) || /invalid api key/i.test(raw)) {
    return {
      kind: 'auth',
      status: status ?? 401,
      title: 'Unauthorized',
      hint:
        'OpenRouter rejected the API key. Check OPENROUTER_API_KEY in .env.local and restart the dev server.',
      retriable: false,
      raw,
    };
  }
  if (status === 403 || /forbidden/i.test(raw) || /requires_byok/i.test(raw)) {
    return {
      kind: 'auth',
      status: status ?? 403,
      title: 'Access denied',
      hint:
        'This model is gated. Common reasons: BYOK required for this provider (set it at openrouter.ai/settings/integrations), regional restriction, or the model is on a waitlist.',
      retriable: false,
      raw,
    };
  }
  if (status === 400 || /invalid/i.test(lower)) {
    return {
      kind: 'bad-request',
      status: status ?? 400,
      title: 'Bad request',
      hint:
        'OpenRouter rejected the request shape. Common cause: invalid parameter for this model (e.g., reasoning effort on a non-reasoning model, tools on a model without tool support). Try another model.',
      retriable: false,
      raw,
    };
  }
  if (status === 408 || status === 504 || /timeout/i.test(lower) || /etimedout/i.test(lower)) {
    return {
      kind: 'timeout',
      status,
      title: 'Timed out',
      hint:
        'The model took longer than the gateway allows. Reasoning models on hard prompts are the usual cause. Try again, lower reasoning effort, or pick a faster model.',
      retriable: true,
      raw,
    };
  }
  if (status === 503 || status === 502 || status === 500 || /unavailable/i.test(lower)) {
    return {
      kind: 'provider-down',
      status,
      title: 'Provider unavailable',
      hint:
        "The underlying provider is having issues. OpenRouter usually fails over automatically; if this card still failed, try again in a minute or swap to a different model.",
      retriable: true,
      raw,
    };
  }
  if (/refusal/i.test(lower) || /content.*polic/i.test(lower) || /safety/i.test(lower)) {
    return {
      kind: 'content-filter',
      status,
      title: 'Content policy refusal',
      hint:
        'The provider refused the prompt under its content policy. Rephrase or pick a model with looser policies.',
      retriable: false,
      raw,
    };
  }
  return {
    kind: 'unknown',
    status,
    title: 'Request failed',
    hint: 'No automatic remediation — see raw error.',
    retriable: false,
    raw,
  };
}
