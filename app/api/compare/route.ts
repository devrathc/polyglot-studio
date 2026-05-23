import { NextRequest } from 'next/server';
import { openrouter } from '@/lib/openrouter';
import {
  ABSOLUTE_MAX_TOKENS,
  defaultMaxTokens,
  parseAffordableTokens,
  RETRY_SAFETY_MARGIN,
} from '@/lib/budget';
import { classifyError, type StructuredError } from '@/lib/errors';

export const runtime = 'nodejs';

type Body = {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  models: string[];
  /** Optional pool the server may swap in when a card hits 429 after its
   *  one in-place retry. Client decides what's eligible (e.g. free-pool ids
   *  in Free Only mode). The server walks the pool in order, skipping ids
   *  that are already in flight on another card. */
  alternates?: string[];
  maxTokens?: number;
  webAccess?: boolean;
};

export type CompareUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  reasoning_tokens?: number;
  cached_tokens?: number;
};

const MAX_MODELS = 5;

type RawUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
};

function extractUsage(u: RawUsage | null | undefined): CompareUsage | undefined {
  if (!u) return undefined;
  return {
    prompt_tokens: u.prompt_tokens,
    completion_tokens: u.completion_tokens,
    total_tokens: u.total_tokens,
    reasoning_tokens: u.completion_tokens_details?.reasoning_tokens,
    cached_tokens: u.prompt_tokens_details?.cached_tokens,
  };
}

type SseEvent =
  | { type: 'start'; i: number; model: string }
  | { type: 'swap'; i: number; fromModel: string; toModel: string; reason: 'rate-limit' }
  | { type: 'model'; i: number; resolvedModel: string }
  | { type: 'delta'; i: number; text: string }
  | { type: 'usage'; i: number; usage: CompareUsage }
  | {
      type: 'done';
      i: number;
      model: string;
      resolvedModel?: string;
      latencyMs: number;
      finishReason?: string;
      refusal?: string;
      retriedAfterRateLimit?: boolean;
      truncatedTo?: number;
    }
  | {
      type: 'error';
      i: number;
      model: string;
      latencyMs: number;
      error: string;
      errorInfo: StructuredError;
      retriedAfterRateLimit?: boolean;
    };

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (
    !Array.isArray(body.models)
    || body.models.length === 0
    || body.models.length > MAX_MODELS
  ) {
    return new Response(
      JSON.stringify({ error: `Provide 1-${MAX_MODELS} models` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const tools = body.webAccess
    ? [
        { type: 'openrouter:web_search' },
        { type: 'openrouter:web_fetch' },
      ]
    : undefined;

  // Stagger dispatches so a 5-card burst against the free pool doesn't trip
  // the global 20-RPM cap on the first second.
  const STAGGER_MS = 150;
  const RATE_LIMIT_RETRY_MS = 2000;

  const encoder = new TextEncoder();
  // Track ids that are *currently* in flight (or already locked in) across
  // all cards so the alternates-pool can't pick a duplicate.
  const inFlight = new Set<string>(body.models);
  // Tail of the alternates pool the swap logic walks through.
  const alternatesQueue: string[] = (body.alternates ?? []).filter(
    (id) => id && !inFlight.has(id),
  );

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (evt: SseEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
      };

      const pickAlternate = (): string | undefined => {
        while (alternatesQueue.length > 0) {
          const next = alternatesQueue.shift()!;
          if (!inFlight.has(next)) {
            inFlight.add(next);
            return next;
          }
        }
        return undefined;
      };

      const tasks = body.models.map((model, idx) =>
        runOneCard({
          slot: idx,
          model,
          body,
          tools,
          dispatchDelayMs: idx * STAGGER_MS,
          rateLimitRetryMs: RATE_LIMIT_RETRY_MS,
          send,
          pickAlternate,
        }),
      );

      try {
        await Promise.all(tasks);
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

async function runOneCard(args: {
  slot: number;
  model: string;
  body: Body;
  tools: { type: string }[] | undefined;
  dispatchDelayMs: number;
  rateLimitRetryMs: number;
  send: (evt: SseEvent) => void;
  pickAlternate: () => string | undefined;
}): Promise<void> {
  const {
    slot,
    body,
    tools,
    dispatchDelayMs,
    rateLimitRetryMs,
    send,
    pickAlternate,
  } = args;

  if (dispatchDelayMs > 0) {
    await new Promise((r) => setTimeout(r, dispatchDelayMs));
  }

  let model = args.model;
  let didRateLimitRetry = false;
  let didSwap = false;
  send({ type: 'start', i: slot, model });

  // Outer loop lets a card swap to an alternate after a rate-limit + retry
  // exhaustion.
  while (true) {
    const start = Date.now();
    const initialCap = body.maxTokens ?? defaultMaxTokens(model);
    let cap = initialCap;
    let truncatedTo: number | undefined;
    const MAX_ATTEMPTS = 4;
    let lastErrorInfo: StructuredError | undefined;
    let succeeded = false;
    let needSwap = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS && !succeeded && !needSwap; attempt++) {
      try {
        const payload: Record<string, unknown> = {
          model,
          messages: body.messages,
          stream: true,
          stream_options: { include_usage: true },
          max_tokens: cap,
        };
        if (tools) payload.tools = tools;

        const result = await openrouter.chat.completions.create(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payload as any,
        );
        const stream = result as unknown as AsyncIterable<unknown>;

        let content = '';
        let resolvedModel: string | undefined;
        let finishReason: string | undefined;
        let refusal: string | undefined;
        let usage: CompareUsage | undefined;
        let sentResolvedModel = false;

        type StreamChunk = {
          model?: string;
          choices?: {
            delta?: { content?: string; refusal?: string };
            finish_reason?: string;
          }[];
          usage?: RawUsage;
        };

        for await (const raw of stream) {
          const chunk = raw as StreamChunk;
          if (!sentResolvedModel && chunk.model) {
            resolvedModel = chunk.model;
            sentResolvedModel = true;
            send({ type: 'model', i: slot, resolvedModel });
          }
          const choice = chunk.choices?.[0];
          const delta = choice?.delta?.content;
          if (delta) {
            content += delta;
            send({ type: 'delta', i: slot, text: delta });
          }
          if (choice?.delta?.refusal) {
            refusal = (refusal ?? '') + choice.delta.refusal;
          }
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          if (chunk.usage) {
            const u = extractUsage(chunk.usage);
            if (u) usage = u;
          }
        }

        // Empty-body + finish_reason=length means the model burned its
        // budget on hidden reasoning before producing any visible output.
        // Bump the cap once and try again, mirroring the chat retry policy.
        const exhaustedByReasoning =
          finishReason === 'length' && content === '' && !refusal;
        const canBumpCap = cap < ABSOLUTE_MAX_TOKENS;
        if (exhaustedByReasoning && canBumpCap && attempt < MAX_ATTEMPTS - 1) {
          cap = Math.min(ABSOLUTE_MAX_TOKENS, cap * 2);
          truncatedTo = undefined;
          continue;
        }

        if (usage) send({ type: 'usage', i: slot, usage });
        send({
          type: 'done',
          i: slot,
          model,
          resolvedModel,
          latencyMs: Date.now() - start,
          finishReason,
          refusal,
          retriedAfterRateLimit: didRateLimitRetry || undefined,
          truncatedTo,
        });
        succeeded = true;
      } catch (err) {
        const info = classifyError(err);
        lastErrorInfo = info;

        const affordable = parseAffordableTokens(err);
        if (
          info.kind === 'no-credits'
          && attempt < MAX_ATTEMPTS - 1
          && affordable
          && affordable > RETRY_SAFETY_MARGIN
        ) {
          cap = Math.max(1, affordable - RETRY_SAFETY_MARGIN);
          truncatedTo = cap;
          continue;
        }

        if (info.kind === 'rate-limit' && !didRateLimitRetry && attempt < MAX_ATTEMPTS - 1) {
          didRateLimitRetry = true;
          await new Promise((r) => setTimeout(r, rateLimitRetryMs));
          continue;
        }

        // Already retried once on this model and still rate-limited — try a
        // swap to a fresh alternate, if any. Only one swap per card to keep
        // the contract bounded.
        if (info.kind === 'rate-limit' && !didSwap) {
          const next = pickAlternate();
          if (next) {
            send({ type: 'swap', i: slot, fromModel: model, toModel: next, reason: 'rate-limit' });
            didSwap = true;
            model = next;
            // Reset the per-model rate-limit retry budget for the new id
            // (it's a fresh provider) but keep the global swap latch.
            didRateLimitRetry = false;
            needSwap = true;
            break;
          }
        }

        send({
          type: 'error',
          i: slot,
          model,
          latencyMs: Date.now() - start,
          error: info.title,
          errorInfo: info,
          retriedAfterRateLimit: didRateLimitRetry || undefined,
        });
        return;
      }
    }

    if (succeeded) return;
    if (needSwap) continue;
    // Loop exited without success or swap — emit the last error we saw.
    send({
      type: 'error',
      i: slot,
      model,
      latencyMs: 0,
      error: lastErrorInfo?.title ?? 'Retry failed',
      errorInfo: lastErrorInfo ?? classifyError(new Error('Exhausted retry attempts')),
      retriedAfterRateLimit: didRateLimitRetry || undefined,
    });
    return;
  }
}
