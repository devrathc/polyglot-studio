export type StoredMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  // Data URLs or http URLs of attached images, when this is a multimodal user message.
  images?: string[];
  /** Links this assistant message to its CallRecord in stats.ts so ratings persist. */
  recordId?: string;
};

export type StoredSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
  /** Which chat mode (default | free) the session was created/last used in. */
  chatMode?: 'default' | 'free';
  /** Whether OpenRouter server tools (web_search / web_fetch) were enabled. */
  webAccess?: boolean;
};

const KEY = 'openrouter-studio:sessions:v1';
const SELECTED_MODEL_KEY = 'openrouter-studio:selected-model';
const SELECTED_PRESET_KEY = 'openrouter-studio:selected-preset';
const CHAT_MODE_KEY = 'openrouter-studio:chat-mode';

export type ChatMode = 'default' | 'free';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function loadSessions(): StoredSession[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: StoredSession[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(sessions));
  } catch {
    // ignore quota errors
  }
}

export function upsertSession(session: StoredSession): StoredSession[] {
  const all = loadSessions();
  const idx = all.findIndex((s) => s.id === session.id);
  if (idx >= 0) all[idx] = session;
  else all.unshift(session);
  saveSessions(all);
  return all;
}

export function deleteSession(id: string): StoredSession[] {
  const all = loadSessions().filter((s) => s.id !== id);
  saveSessions(all);
  return all;
}

export function newSessionId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function deriveTitle(messages: StoredMessage[]): string {
  const first = messages.find((m) => m.role === 'user')?.content ?? '';
  const trimmed = first.trim().split('\n')[0]?.slice(0, 60) ?? '';
  return trimmed || 'New chat';
}

export function getSelectedModel(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(SELECTED_MODEL_KEY);
}

export function setSelectedModel(id: string): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(SELECTED_MODEL_KEY, id);
}

export function getSelectedPreset(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(SELECTED_PRESET_KEY);
}

export function setSelectedPreset(p: string): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(SELECTED_PRESET_KEY, p);
}

export function getChatMode(): ChatMode | null {
  if (!isBrowser()) return null;
  const v = window.localStorage.getItem(CHAT_MODE_KEY);
  return v === 'default' || v === 'free' ? v : null;
}

export function setChatMode(mode: ChatMode): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(CHAT_MODE_KEY, mode);
}

const WEB_ACCESS_KEY = 'openrouter-studio:chat-web-access';

export function getChatWebAccess(): boolean | null {
  if (!isBrowser()) return null;
  const v = window.localStorage.getItem(WEB_ACCESS_KEY);
  return v === 'true' ? true : v === 'false' ? false : null;
}

export function setChatWebAccess(on: boolean): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(WEB_ACCESS_KEY, on ? 'true' : 'false');
}

// ---- Generic per-tab session lists (Free / Multimodal / Compare) ----
// The Chat tab keeps its own keys above for backward compatibility.

export type SessionListKey = 'free' | 'multimodal' | 'compare';

const SESSION_KEYS: Record<SessionListKey, string> = {
  free: 'openrouter-studio:sessions:free:v1',
  multimodal: 'openrouter-studio:sessions:multimodal:v1',
  compare: 'openrouter-studio:sessions:compare:v1',
};

export function loadSessionList<T>(tab: SessionListKey): T[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(SESSION_KEYS[tab]);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function saveSessionList<T>(tab: SessionListKey, items: T[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(SESSION_KEYS[tab], JSON.stringify(items));
  } catch {
    // quota — ignore
  }
}

export function loadActiveId(tab: SessionListKey): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(`${SESSION_KEYS[tab]}:active`);
}

export function saveActiveId(tab: SessionListKey, id: string | null): void {
  if (!isBrowser()) return;
  const k = `${SESSION_KEYS[tab]}:active`;
  if (id) window.localStorage.setItem(k, id);
  else window.localStorage.removeItem(k);
}

// ---- Compare per-mode global default model lineups -----------------------
// Sessions store their own models[]; these globals are what NEW sessions
// inherit, and they're updated whenever the user edits a slot in any
// session for that mode.

const COMPARE_DEFAULTS_KEY: Record<ChatMode, string> = {
  default: 'openrouter-studio:compare:defaults:v1',
  free: 'openrouter-studio:compare:defaults:free:v1',
};

export function loadCompareDefaults(mode: ChatMode): string[] | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(COMPARE_DEFAULTS_KEY[mode]);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')
      ? (parsed as string[])
      : null;
  } catch {
    return null;
  }
}

export function saveCompareDefaults(mode: ChatMode, models: string[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(COMPARE_DEFAULTS_KEY[mode], JSON.stringify(models));
  } catch {
    // quota — ignore
  }
}

const COMPARE_MODE_KEY = 'openrouter-studio:compare:mode';

export function getCompareMode(): ChatMode | null {
  if (!isBrowser()) return null;
  const v = window.localStorage.getItem(COMPARE_MODE_KEY);
  return v === 'default' || v === 'free' ? v : null;
}

export function setCompareMode(mode: ChatMode): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(COMPARE_MODE_KEY, mode);
}
