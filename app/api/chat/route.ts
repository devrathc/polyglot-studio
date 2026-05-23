import { NextRequest } from 'next/server';
import { openrouter } from '@/lib/openrouter';
import {
  defaultMaxTokens,
  parseAffordableTokens,
  RETRY_SAFETY_MARGIN,
} from '@/lib/budget';

export const runtime = 'nodejs';

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type Body = {
  model: string;
  messages: {
    role: 'system' | 'user' | 'assistant';
    content: string | ContentBlock[];
  }[];
  allowedModels?: string[];
  maxTokens?: number;
  reasoning?: { effort?: 'low' | 'medium' | 'high'; max_tokens?: number };
  webAccess?: boolean;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  if (!body.model || !Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response('Missing model or messages', { status: 400 });
  }

  const useAutoPlugin = body.model === 'openrouter/auto'
    && Array.isArray(body.allowedModels)
    && body.allowedModels.length > 0;

  // OpenRouter server tools — the model can agentically call them; OpenRouter
  // executes them and feeds results back. Each call bills separately against
  // OpenRouter credits (web_search ≈ $0.005–$0.02, web_fetch passes through).
  // The Chat page only sends webAccess=true when chatMode='default' to keep
  // Free Only mode genuinely $0.
  const tools = body.webAccess
    ? [
        { type: 'openrouter:web_search' },
        { type: 'openrouter:web_fetch' },
      ]
    : undefined;

  const buildParams = (cap: number): Record<string, unknown> => {
    const p: Record<string, unknown> = {
      model: body.model,
      messages: body.messages,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: cap,
    };
    if (useAutoPlugin) {
      p.plugins = [{ id: 'auto-router', allowed_models: body.allowedModels }];
    }
    if (body.reasoning) {
      p.reasoning = body.reasoning;
    }
    if (tools) {
      p.tools = tools;
    }
    return p;
  };

  let cap = body.maxTokens ?? defaultMaxTokens(body.model);
  let stream: AsyncIterable<unknown> | null = null;
  for (let attempt = 0; attempt < 2 && !stream; attempt++) {
    try {
      const result = await openrouter.chat.completions.create(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        buildParams(cap) as any,
      );
      stream = result as unknown as AsyncIterable<unknown>;
    } catch (err) {
      const affordable = parseAffordableTokens(err);
      if (attempt === 0 && affordable && affordable > RETRY_SAFETY_MARGIN) {
        cap = Math.max(1, affordable - RETRY_SAFETY_MARGIN);
        continue;
      }
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return new Response(`OpenRouter error: ${msg}`, { status: 502 });
    }
  }
  if (!stream) return new Response('OpenRouter error: retry failed', { status: 502 });
  const finalStream = stream;

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of finalStream) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`),
        );
      } finally {
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
