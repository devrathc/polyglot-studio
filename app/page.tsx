'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CatalogModel } from '@/app/api/models/route';
import { ChatInput } from '@/components/ChatInput';
import { ChatPanel } from '@/components/ChatPanel';
import { CostMeter } from '@/components/CostMeter';
import { HistoryDrawer } from '@/components/HistoryDrawer';
import { ModeToggle } from '@/components/ModeToggle';
import { ModelSelector } from '@/components/ModelSelector';
import { Nav } from '@/components/Nav';
import { RouteHint } from '@/components/RouteHint';
import { SuggestionsPanel } from '@/components/SuggestionsPanel';
import { PricingNote } from '@/components/PricingNote';
import { TabHeader } from '@/components/TabHeader';
import { WebAccessToggle } from '@/components/WebAccessToggle';
import {
  computeCostBreakdown,
  estimateCost,
  fetchCatalog,
  findModel,
  type UsageBreakdown,
} from '@/lib/pricing';
import {
  appendRecord,
  commentRecord,
  loadRecords,
  newRecordId,
  rateRecord,
  type Rating,
} from '@/lib/stats';
import { hasOnboarded, markOnboarded } from '@/lib/onboarding';
import {
  DEFAULT_PRESET_MODEL,
  freeModelIds,
  isFreeModel,
  type Preset,
  resolvePresets,
  suggestPreset,
} from '@/lib/routing';
import {
  type ChatMode,
  deleteSession,
  deriveTitle,
  getChatMode,
  getChatWebAccess,
  getSelectedModel,
  getSelectedPreset,
  loadSessions,
  newSessionId,
  setChatMode,
  setChatWebAccess,
  setSelectedModel,
  setSelectedPreset,
  type StoredMessage,
  type StoredSession,
  upsertSession,
} from '@/lib/storage';
import { lintPrompt } from '@/lib/suggestions';
import { readChatStream } from '@/lib/sse';

type Mode = 'preset' | 'manual';

export default function ChatPage() {
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);

  const [mode, setMode] = useState<Mode>('preset');
  const [preset, setPreset] = useState<Preset>('auto');
  const [manualModel, setManualModel] = useState<string>('anthropic/claude-sonnet-4.6');
  const [chatMode, setChatModeState] = useState<ChatMode>('default');
  const [webAccess, setWebAccessState] = useState<boolean>(false);

  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);

  const [input, setInput] = useState('');
  const [debouncedInput, setDebouncedInput] = useState('');
  const [streaming, setStreaming] = useState<{ content: string; model?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actualUsage, setActualUsage] = useState<UsageBreakdown | null>(null);
  const [ratings, setRatings] = useState<Record<string, Rating | undefined>>({});
  const [comments, setComments] = useState<Record<string, string | undefined>>({});

  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();

  useEffect(() => {
    // First-run: if there's no chat history AND we've never marked onboarded,
    // send the user to /about so they land on positioning before an empty box.
    if (!hasOnboarded() && loadSessions().length === 0) {
      markOnboarded();
      router.replace('/about');
      return;
    }
    fetchCatalog()
      .then((data) => setCatalog(data))
      .catch(() => {
        // catalog failed — presets fall back to defaults
      });

    const stored = loadSessions();
    setSessions(stored);

    const savedMode = getChatMode();
    if (savedMode) setChatModeState(savedMode);

    const savedWeb = getChatWebAccess();
    if (savedWeb !== null) setWebAccessState(savedWeb);

    const initialRatings: Record<string, Rating | undefined> = {};
    const initialComments: Record<string, string | undefined> = {};
    for (const r of loadRecords()) {
      if (r.rating) initialRatings[r.id] = r.rating;
      if (r.comment) initialComments[r.id] = r.comment;
    }
    setRatings(initialRatings);
    setComments(initialComments);

    const savedPreset = getSelectedPreset() as Preset | null;
    if (savedPreset) setPreset(savedPreset);

    const savedModel = getSelectedModel();
    if (savedModel) {
      setManualModel(savedModel);
      setMode('manual');
    }
  }, []);

  const presetModels = useMemo(
    () =>
      catalog.length > 0
        ? resolvePresets(catalog, { freeOnly: chatMode === 'free' })
        : DEFAULT_PRESET_MODEL,
    [catalog, chatMode],
  );

  function handleChatModeChange(next: ChatMode) {
    setChatModeState(next);
    setChatMode(next);
    if (next === 'free' && mode === 'manual' && manualModel && !isFreeModel(manualModel)) {
      const fallback = catalog.find((m) => isFreeModel(m.id))?.id;
      if (fallback) {
        setManualModel(fallback);
        setSelectedModel(fallback);
      } else {
        setMode('preset');
      }
    }
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedInput(input), 150);
    return () => clearTimeout(t);
  }, [input]);

  const activeModelId = useMemo(() => {
    if (mode === 'manual') return manualModel;
    return presetModels[preset];
  }, [mode, manualModel, preset, presetModels]);

  const activeModel = useMemo(
    () => findModel(catalog, activeModelId),
    [catalog, activeModelId],
  );

  const costEstimate = useMemo(
    () => estimateCost(debouncedInput, activeModel),
    [debouncedInput, activeModel],
  );

  const suggestions = useMemo(() => lintPrompt(debouncedInput), [debouncedInput]);
  const routeSuggestion = useMemo(() => suggestPreset(debouncedInput), [debouncedInput]);

  function handlePresetChange(p: Preset) {
    setPreset(p);
    setSelectedPreset(p);
  }

  function handleManualChange(id: string) {
    setManualModel(id);
    setSelectedModel(id);
  }

  function newChat() {
    abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setInput('');
    setStreaming(null);
    setActualUsage(null);
  }

  function selectSession(id: string) {
    const s = sessions.find((x) => x.id === id);
    if (!s) return;
    abortRef.current?.abort();
    setActiveId(id);
    setMessages(s.messages);
    setStreaming(null);
    setActualUsage(null);
    const sessionMode: ChatMode = s.chatMode === 'free' ? 'free' : 'default';
    if (sessionMode !== chatMode) {
      setChatModeState(sessionMode);
      setChatMode(sessionMode);
    }
    const sessionWeb = sessionMode === 'free' ? false : !!s.webAccess;
    if (sessionWeb !== webAccess) {
      setWebAccessState(sessionWeb);
      setChatWebAccess(sessionWeb);
    }
  }

  function handleWebAccessChange(next: boolean) {
    if (chatMode === 'free') return;
    setWebAccessState(next);
    setChatWebAccess(next);
  }

  function removeSession(id: string) {
    const next = deleteSession(id);
    setSessions(next);
    if (id === activeId) newChat();
  }

  function handleRate(recordId: string, rating: Rating | null) {
    rateRecord(recordId, rating);
    setRatings((curr) => {
      const next = { ...curr };
      if (rating === null) delete next[recordId];
      else next[recordId] = rating;
      return next;
    });
  }

  function handleComment(recordId: string, comment: string | null) {
    commentRecord(recordId, comment);
    setComments((curr) => {
      const next = { ...curr };
      if (!comment) delete next[recordId];
      else next[recordId] = comment;
      return next;
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    const userMsg: StoredMessage = { role: 'user', content: text };
    const baseMessages = [...messages, userMsg];
    setMessages(baseMessages);
    setInput('');
    setBusy(true);
    setActualUsage(null);
    setStreaming({ content: '' });

    const controller = new AbortController();
    abortRef.current = controller;

    let acc = '';
    let resolvedModel: string | undefined;
    let usage: UsageBreakdown | undefined;
    const recordId = newRecordId();
    const useWebAccess = chatMode !== 'free' && webAccess;

    try {
      const reasoning =
        mode === 'preset' && preset === 'quality'
          ? { effort: 'medium' as const }
          : undefined;

      const allowedModels =
        chatMode === 'free' && activeModelId === 'openrouter/auto'
          ? freeModelIds(catalog)
          : undefined;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: activeModelId,
          messages: baseMessages.map((m) => ({ role: m.role, content: m.content })),
          reasoning,
          allowedModels,
          webAccess: useWebAccess,
        }),
      });

      await readChatStream(res, {
        onDelta: (t) => {
          acc += t;
          setStreaming({ content: acc, model: resolvedModel });
        },
        onModel: (m) => {
          resolvedModel = m;
          setStreaming({ content: acc, model: m });
        },
        onUsage: (u) => {
          usage = u;
        },
        onError: (msg) => {
          acc += `\n\n[error: ${msg}]`;
          setStreaming({ content: acc, model: resolvedModel });
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
        model: resolvedModel,
        recordId,
      };
      const finalMessages = [...baseMessages, assistantMsg];
      setMessages(finalMessages);
      setStreaming(null);
      setBusy(false);

      if (usage) {
        setActualUsage(usage);
      }

      const resolvedCatalogModel = resolvedModel ? findModel(catalog, resolvedModel) : undefined;
      const cost = computeCostBreakdown(resolvedCatalogModel ?? activeModel, usage)?.total ?? 0;
      appendRecord({
        id: recordId,
        at: Date.now(),
        tab: 'chat',
        model: activeModelId,
        resolvedModel,
        mode: chatMode,
        prompt_tokens: usage?.prompt_tokens,
        completion_tokens: usage?.completion_tokens,
        reasoning_tokens: usage?.reasoning_tokens,
        cached_tokens: usage?.cached_tokens,
        cost,
        webSearch: useWebAccess,
      });

      const sessionId = activeId ?? newSessionId();
      const now = Date.now();
      const session: StoredSession = {
        id: sessionId,
        title: deriveTitle(finalMessages),
        createdAt: activeId
          ? sessions.find((s) => s.id === activeId)?.createdAt ?? now
          : now,
        updatedAt: now,
        messages: finalMessages,
        chatMode,
        webAccess: chatMode === 'free' ? false : webAccess,
      };
      const next = upsertSession(session);
      setSessions(next);
      setActiveId(sessionId);
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <Nav />
      <div className="flex flex-1 overflow-hidden">
        <HistoryDrawer
          items={sessions.map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt }))}
          activeId={activeId}
          onSelect={selectSession}
          onNew={newChat}
          onDelete={removeSession}
          newLabel="+ New chat"
        />

        <main className="flex flex-1 flex-col overflow-hidden">
          <TabHeader
            title="Chat"
            description="Single-conversation chat with model presets, manual model picker, prompt suggestions, and live cost preview."
            techNote="POST /api/v1/chat/completions (streaming) · model: <preset> | manual | openrouter/auto"
            pricing={
              <PricingNote
                wallet="OpenRouter credits (default) — or your provider account if BYOK is configured for the chosen model."
                when="Charged once the response finishes streaming. OpenRouter pre-reserves the worst case (max_tokens × output price) at call start and releases the unused portion afterward."
                byok="Add a provider key at openrouter.ai/settings/integrations. That provider then bills the tokens directly to its own account at generation time; OpenRouter still takes ~5% from your OpenRouter credit balance, so you need a non-zero balance there too."
                note="The Quality preset turns on reasoning.effort=medium — reasoning tokens bill at the output rate even when hidden."
              />
            }
          />
          <ChatPanel
            messages={messages}
            streaming={streaming}
            liveModel={streaming?.model}
            ratings={ratings}
            comments={comments}
            onRate={handleRate}
            onComment={handleComment}
          />
          <ChatInput value={input} onChange={setInput} onSend={send} disabled={busy} />
        </main>

        <aside className="flex w-80 flex-col gap-3 overflow-y-auto border-l border-neutral-900 bg-[#0a0a0b] p-3">
          <ModeToggle mode={chatMode} onChange={handleChatModeChange} />
          <WebAccessToggle
            on={webAccess}
            onChange={handleWebAccessChange}
            lockedReason={
              chatMode === 'free'
                ? 'Disabled in Free Only mode — each search costs ~$0.005–$0.02 in OpenRouter credits even when the model is free.'
                : undefined
            }
          />
          <ModelSelector
            catalog={catalog}
            preset={preset}
            onPresetChange={handlePresetChange}
            manualModel={manualModel}
            onManualModelChange={handleManualChange}
            presetModels={presetModels}
            mode={mode}
            onModeChange={setMode}
            chatMode={chatMode}
          />
          <RouteHint
            suggestion={routeSuggestion}
            current={mode === 'preset' ? preset : 'auto'}
            onApply={() => {
              setMode('preset');
              handlePresetChange(routeSuggestion.preset);
            }}
          />
          <CostMeter
            estimate={costEstimate}
            modelId={activeModelId}
            model={activeModel}
            actual={actualUsage}
          />
          <SuggestionsPanel items={suggestions} />
        </aside>
      </div>
    </div>
  );
}
