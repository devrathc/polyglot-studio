import OpenAI from 'openai';

declare global {
  // eslint-disable-next-line no-var
  var __openrouter: OpenAI | undefined;
}

function build(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set. Copy .env.example to .env.local and set it.');
  }
  return new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
      'X-Title': 'Polyglot Studio',
    },
  });
}

export const openrouter: OpenAI = globalThis.__openrouter ?? (globalThis.__openrouter = build());
