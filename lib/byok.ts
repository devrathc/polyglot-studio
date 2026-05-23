// Local registry of which providers the user has BYOK configured for on
// openrouter.ai/settings/integrations. OpenRouter does not expose a public API
// to read or toggle integration keys, so this is a user-maintained local
// truth that the app uses to label wallets correctly in the UI.

export type ByokProviderSlug =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'x-ai'
  | 'deepseek'
  | 'mistralai'
  | 'cohere'
  | 'groq';

export type ByokProvider = {
  slug: ByokProviderSlug;
  label: string;
  consoleUrl: string;
  modelPrefix: string;
};

export const BYOK_PROVIDERS: ByokProvider[] = [
  {
    slug: 'anthropic',
    label: 'Anthropic',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    modelPrefix: 'anthropic/',
  },
  {
    slug: 'openai',
    label: 'OpenAI',
    consoleUrl: 'https://platform.openai.com/api-keys',
    modelPrefix: 'openai/',
  },
  {
    slug: 'google',
    label: 'Google (AI Studio / Vertex)',
    consoleUrl: 'https://aistudio.google.com/app/apikey',
    modelPrefix: 'google/',
  },
  {
    slug: 'x-ai',
    label: 'xAI',
    consoleUrl: 'https://console.x.ai/',
    modelPrefix: 'x-ai/',
  },
  {
    slug: 'deepseek',
    label: 'DeepSeek',
    consoleUrl: 'https://platform.deepseek.com/api_keys',
    modelPrefix: 'deepseek/',
  },
  {
    slug: 'mistralai',
    label: 'Mistral',
    consoleUrl: 'https://console.mistral.ai/api-keys/',
    modelPrefix: 'mistralai/',
  },
  {
    slug: 'cohere',
    label: 'Cohere',
    consoleUrl: 'https://dashboard.cohere.com/api-keys',
    modelPrefix: 'cohere/',
  },
  {
    slug: 'groq',
    label: 'Groq',
    consoleUrl: 'https://console.groq.com/keys',
    modelPrefix: 'groq/',
  },
];

export const OPENROUTER_INTEGRATIONS_URL =
  'https://openrouter.ai/settings/integrations';

export type ByokState = Partial<Record<ByokProviderSlug, boolean>>;

const STORAGE_KEY = 'openrouter-studio:byok:v1';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function loadByokState(): ByokState {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as ByokState) : {};
  } catch {
    return {};
  }
}

export function saveByokState(state: ByokState): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota — ignore
  }
}

export function isByokEnabledForModel(state: ByokState, modelId: string): boolean {
  const provider = BYOK_PROVIDERS.find((p) => modelId.startsWith(p.modelPrefix));
  return provider ? !!state[provider.slug] : false;
}
