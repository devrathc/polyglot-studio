export type StreamUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  reasoning_tokens?: number;
  cached_tokens?: number;
};

export type StreamHandlers = {
  onDelta: (text: string) => void;
  onModel?: (model: string) => void;
  onUsage?: (usage: StreamUsage) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
};

type ChunkShape = {
  model?: string;
  choices?: { delta?: { content?: string } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  error?: string;
};

export async function readChatStream(
  res: Response,
  handlers: StreamHandlers,
): Promise<void> {
  if (!res.ok || !res.body) {
    const text = res.body ? await res.text() : `HTTP ${res.status}`;
    handlers.onError?.(text);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const evt of events) {
        const line = evt.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          handlers.onDone?.();
          return;
        }
        try {
          const parsed = JSON.parse(data) as ChunkShape;
          if (parsed.error) {
            handlers.onError?.(parsed.error);
            continue;
          }
          if (parsed.model) handlers.onModel?.(parsed.model);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) handlers.onDelta(delta);
          if (parsed.usage) {
            handlers.onUsage?.({
              prompt_tokens: parsed.usage.prompt_tokens,
              completion_tokens: parsed.usage.completion_tokens,
              total_tokens: parsed.usage.total_tokens,
              reasoning_tokens: parsed.usage.completion_tokens_details?.reasoning_tokens,
              cached_tokens: parsed.usage.prompt_tokens_details?.cached_tokens,
            });
          }
        } catch {
          // skip malformed chunk
        }
      }
    }
    handlers.onDone?.();
  } catch (err) {
    handlers.onError?.(err instanceof Error ? err.message : 'Stream error');
  }
}
