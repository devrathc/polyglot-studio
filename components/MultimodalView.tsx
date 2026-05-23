'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogModel } from '@/app/api/models/route';
import { ChatPanel } from '@/components/ChatPanel';
import { CostMeter } from '@/components/CostMeter';
import { HistoryDrawer } from '@/components/HistoryDrawer';
import { PricingNote } from '@/components/PricingNote';
import { TabHeader } from '@/components/TabHeader';
import {
  estimateCost,
  fetchCatalog,
  findModel,
  type UsageBreakdown,
} from '@/lib/pricing';
import { readChatStream } from '@/lib/sse';
import {
  deriveTitle,
  loadActiveId,
  loadSessionList,
  newSessionId,
  saveActiveId,
  saveSessionList,
  type StoredMessage,
} from '@/lib/storage';

const DEFAULT_MODEL = 'openrouter/auto';
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB per image

// Router meta-models (not in catalog) shown at the top of the picker.
const ROUTER_OPTIONS: Array<{ id: string; label: string; hint: string }> = [
  { id: 'openrouter/auto', label: 'Auto-router', hint: 'OpenRouter picks the best vision-capable model per request' },
  { id: 'openrouter/free', label: 'Free router', hint: 'Picks a free model that supports the request (incl. vision)' },
];
const ROUTER_IDS = new Set(ROUTER_OPTIONS.map((o) => o.id));

type MultimodalSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
  model: string;
  usage: UsageBreakdown | null;
};

function makeSession(model: string = DEFAULT_MODEL): MultimodalSession {
  const now = Date.now();
  return {
    id: newSessionId(),
    title: 'New conversation',
    createdAt: now,
    updatedAt: now,
    messages: [],
    model,
    usage: null,
  };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function MultimodalView() {
  const initialSessions = useMemo<MultimodalSession[]>(() => {
    const loaded = loadSessionList<MultimodalSession>('multimodal');
    return loaded.length > 0 ? loaded : [makeSession()];
  }, []);
  const initialActive = useMemo(
    () => loadActiveId('multimodal') ?? initialSessions[0]?.id ?? null,
    [initialSessions],
  );

  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [sessions, setSessions] = useState<MultimodalSession[]>(initialSessions);
  const [activeId, setActiveId] = useState<string | null>(initialActive);

  const active = useMemo(
    () => (activeId ? sessions.find((s) => s.id === activeId) ?? null : null),
    [sessions, activeId],
  );
  const messages = active?.messages ?? [];
  const model = active?.model ?? DEFAULT_MODEL;
  const usage = active?.usage ?? null;

  const [input, setInput] = useState('');
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [streaming, setStreaming] = useState<{ content: string; model?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchCatalog().then(setCatalog).catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    try {
      saveSessionList('multimodal', sessions);
    } catch {
      setError('Saving conversation failed (storage full). Older messages may be lost on reload.');
    }
  }, [sessions]);

  useEffect(() => {
    saveActiveId('multimodal', activeId);
  }, [activeId]);

  function patchActive(patch: Partial<MultimodalSession>) {
    if (!activeId) return;
    setSessions((curr) =>
      curr.map((s) => (s.id === activeId ? { ...s, ...patch, updatedAt: Date.now() } : s)),
    );
  }

  function ensureActiveSession(): string {
    if (activeId) return activeId;
    const fresh = makeSession(model);
    setSessions((curr) => [fresh, ...curr]);
    setActiveId(fresh.id);
    return fresh.id;
  }

  function newConversation() {
    abortRef.current?.abort();
    const fresh = makeSession(model);
    setSessions((curr) => [fresh, ...curr]);
    setActiveId(fresh.id);
    setInput('');
    setPendingImages([]);
    setStreaming(null);
    setError(null);
  }

  function selectSession(id: string) {
    abortRef.current?.abort();
    setActiveId(id);
    setInput('');
    setPendingImages([]);
    setStreaming(null);
    setError(null);
  }

  function deleteSession(id: string) {
    setSessions((curr) => {
      const next = curr.filter((s) => s.id !== id);
      if (id === activeId) {
        if (next.length > 0) setActiveId(next[0].id);
        else {
          const fresh = makeSession(model);
          setActiveId(fresh.id);
          return [fresh];
        }
      }
      return next;
    });
  }

  function setModel(id: string) {
    patchActive({ model: id });
  }

  const visionModels = useMemo(
    () =>
      catalog
        .filter((m) => m.modalities.includes('image'))
        .sort((a, b) => a.id.localeCompare(b.id)),
    [catalog],
  );

  const groupedVisionModels = useMemo(() => {
    const byProvider = new Map<string, CatalogModel[]>();
    for (const m of visionModels) {
      const list = byProvider.get(m.provider) ?? [];
      list.push(m);
      byProvider.set(m.provider, list);
    }
    return [...byProvider.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([provider, list]) => [provider, list.sort((a, b) => a.name.localeCompare(b.name))] as const);
  }, [visionModels]);

  const activeModel = useMemo(() => findModel(catalog, model), [catalog, model]);
  const costEstimate = estimateCost(input, activeModel);

  async function addFiles(files: FileList | File[]) {
    setError(null);
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    const slotsLeft = MAX_IMAGES - pendingImages.length;
    if (slotsLeft <= 0) {
      setError(`Max ${MAX_IMAGES} images per message.`);
      return;
    }
    const accepted = arr.slice(0, slotsLeft);
    if (arr.length > slotsLeft) {
      setError(`Only ${slotsLeft} more image(s) allowed.`);
    }
    const next: string[] = [];
    for (const f of accepted) {
      if (f.size > MAX_IMAGE_BYTES) {
        setError(`"${f.name}" exceeds ${MAX_IMAGE_BYTES / 1024 / 1024}MB. Skipped.`);
        continue;
      }
      try {
        next.push(await fileToDataUrl(f));
      } catch {
        setError(`Failed to read "${f.name}".`);
      }
    }
    if (next.length) setPendingImages((cur) => [...cur, ...next]);
  }

  function removeImage(idx: number) {
    setPendingImages((cur) => cur.filter((_, i) => i !== idx));
  }

  async function send() {
    const text = input.trim();
    if ((!text && pendingImages.length === 0) || busy) return;
    if (!model) {
      setError('Pick a model first.');
      return;
    }

    const sessionId = ensureActiveSession();
    const userMsg: StoredMessage = {
      role: 'user',
      content: text,
      images: pendingImages.length ? pendingImages : undefined,
    };
    const currentMessages = sessions.find((s) => s.id === sessionId)?.messages ?? [];
    const baseMessages = [...currentMessages, userMsg];

    setSessions((curr) =>
      curr.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              messages: baseMessages,
              title: s.messages.length === 0 ? deriveTitle([userMsg]) : s.title,
              usage: null,
              updatedAt: Date.now(),
            }
          : s,
      ),
    );
    setInput('');
    setPendingImages([]);
    setBusy(true);
    setStreaming({ content: '' });
    setError(null);

    const apiMessages = baseMessages.map((m) => {
      if (m.images && m.images.length > 0) {
        const blocks: Array<
          { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
        > = [];
        if (m.content) blocks.push({ type: 'text', text: m.content });
        for (const url of m.images) blocks.push({ type: 'image_url', image_url: { url } });
        return { role: m.role, content: blocks };
      }
      return { role: m.role, content: m.content };
    });

    const controller = new AbortController();
    abortRef.current = controller;

    let acc = '';
    let liveModel: string | undefined;
    let liveUsage: UsageBreakdown | undefined;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ model, messages: apiMessages }),
      });

      await readChatStream(res, {
        onDelta: (t) => {
          acc += t;
          setStreaming({ content: acc, model: liveModel });
        },
        onModel: (m) => {
          liveModel = m;
          setStreaming({ content: acc, model: m });
        },
        onUsage: (u) => {
          liveUsage = u;
        },
        onError: (msg) => {
          acc += `\n\n[error: ${msg}]`;
          setStreaming({ content: acc, model: liveModel });
        },
      });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        acc += `\n\n[error: ${(err as Error).message}]`;
      }
    } finally {
      const assistantMsg: StoredMessage = {
        role: 'assistant',
        content: acc,
        model: liveModel,
      };
      setSessions((curr) =>
        curr.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                messages: [...baseMessages, assistantMsg],
                usage: liveUsage ?? s.usage,
                updatedAt: Date.now(),
              }
            : s,
        ),
      );
      setStreaming(null);
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const it of items) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      void addFiles(files);
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <HistoryDrawer
        items={sessions.map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt }))}
        activeId={activeId}
        onSelect={selectSession}
        onNew={newConversation}
        onDelete={deleteSession}
        newLabel="+ New conversation"
      />
      <main className="flex flex-1 flex-col overflow-hidden">
        <TabHeader
          title="Multimodal"
          badge={{ text: 'vision', color: 'purple' }}
          description="Drop, paste, or upload images and ask a vision-capable model about them. Default 'Auto-router' lets OpenRouter pick a vision model per request — switch to 'Free router' for $0 vision routing, or pin a specific model for consistent results."
          techNote="POST /api/v1/chat/completions · content blocks: text + image_url (data URL) · model: openrouter/auto | openrouter/free | <vision model>"
          pricing={
            <PricingNote
              wallet="OpenRouter credits (default and Auto-router) — or the provider account if BYOK matches the routed model. Free router mode is $0 per token."
              when="Charged after the response completes. Image tokens count toward input cost at the model's image-pricing rate, which is usually higher per token than text."
              byok="Per-model. If Auto-router lands on an Anthropic vision model and you have an Anthropic key configured, that call bills Anthropic — otherwise it bills your OpenRouter credits."
              note="Image-heavy prompts can be surprisingly expensive on premium vision models (Opus, GPT-5). Switch to Free router or pin a cheap model when prototyping."
            />
          }
        />

        <ChatPanel
          messages={messages}
          streaming={streaming}
          liveModel={streaming?.model ?? model}
        />

        <div
          className={`border-t border-neutral-900 bg-[#0a0a0b] p-3 ${
            dragOver ? 'ring-2 ring-emerald-500/40' : ''
          }`}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
          }}
        >
          <div className="mx-auto max-w-3xl">
            {error && (
              <div className="mb-2 rounded-md bg-red-500/10 px-2 py-1 text-[11px] text-red-300">{error}</div>
            )}
            {pendingImages.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {pendingImages.map((src, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      className="h-16 w-16 rounded-md border border-neutral-800 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      aria-label="Remove image"
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-800 text-[10px] text-neutral-200 hover:bg-red-700"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-2xl border border-neutral-800 bg-[#101013] p-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach images"
                title={`Attach images (also accepts drag-and-drop and paste). Up to ${MAX_IMAGES}, max 5 MB each.`}
                disabled={pendingImages.length >= MAX_IMAGES}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200 disabled:opacity-40"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="3" width="14" height="12" rx="2" />
                  <circle cx="6.5" cy="7.5" r="1.25" />
                  <path d="M2.5 13l4-4 3 3 2-2 4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) void addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                placeholder={
                  pendingImages.length > 0
                    ? 'Ask about the image(s)…'
                    : 'Attach image(s) (drop / paste / click) and write a prompt…'
                }
                rows={1}
                className="flex-1 resize-none bg-transparent py-1.5 text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={busy || (!input.trim() && pendingImages.length === 0)}
                className="rounded-md bg-emerald-500 px-4 py-1.5 text-sm font-medium text-black hover:bg-emerald-400 disabled:opacity-40"
              >
                {busy ? '…' : 'Send'}
              </button>
            </div>
            <div className="mt-1.5 px-1 text-[10px] text-neutral-600">
              Enter to send · Shift+Enter for newline · paste / drag / click to add up to {MAX_IMAGES} images
            </div>
          </div>
        </div>
      </main>

      <aside className="flex w-80 flex-col gap-3 overflow-y-auto border-l border-neutral-900 bg-[#0a0a0b] p-3">
        <section className="rounded-xl border border-neutral-900 bg-[#0d0d10] p-3">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            Vision model
          </h3>
          {visionModels.length === 0 ? (
            <div className="text-[11px] text-neutral-500">Loading catalog…</div>
          ) : (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              title="Auto-router lets OpenRouter pick a vision model per request. Free router restricts to the free vision pool ($0, rate-capped). Or pin a specific vision model for consistent results."
              className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 font-mono text-[11px] text-neutral-200 outline-none"
            >
              <optgroup label="auto-routers">
                {ROUTER_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label} ({o.id})
                  </option>
                ))}
              </optgroup>
              {groupedVisionModels.map(([provider, list]) => (
                <optgroup key={provider} label={provider}>
                  {list.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          {ROUTER_IDS.has(model) ? (
            <div className="mt-2 text-[10px] text-neutral-500">
              {ROUTER_OPTIONS.find((o) => o.id === model)?.hint}
            </div>
          ) : activeModel ? (
            <div className="mt-2 text-[10px] text-neutral-500">
              ctx {Math.round(activeModel.context_length / 1000)}k ·{' '}
              in ${(activeModel.pricing.prompt * 1_000_000).toFixed(2)}/M ·{' '}
              out ${(activeModel.pricing.completion * 1_000_000).toFixed(2)}/M
            </div>
          ) : null}
        </section>

        <CostMeter
          estimate={costEstimate}
          modelId={model}
          model={activeModel}
          actual={usage}
        />
      </aside>
    </div>
  );
}
