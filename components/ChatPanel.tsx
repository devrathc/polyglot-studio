'use client';

import { useEffect, useRef, useState } from 'react';
import type { StoredMessage } from '@/lib/storage';
import type { Rating } from '@/lib/stats';
import { Markdown } from '@/components/Markdown';
import { Tip } from '@/components/Tip';

type Props = {
  messages: StoredMessage[];
  streaming?: { content: string; model?: string } | null;
  liveModel?: string | null;
  ratings?: Record<string, Rating | undefined>;
  comments?: Record<string, string | undefined>;
  onRate?: (recordId: string, rating: Rating | null) => void;
  onComment?: (recordId: string, comment: string | null) => void;
};

export function ChatPanel({
  messages,
  streaming,
  liveModel,
  ratings,
  comments,
  onRate,
  onComment,
}: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming?.content]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {messages.length === 0 && !streaming ? (
          <Empty />
        ) : (
          messages.map((m, i) => (
            <Message
              key={i}
              m={m}
              rating={m.recordId ? ratings?.[m.recordId] : undefined}
              comment={m.recordId ? comments?.[m.recordId] : undefined}
              onRate={onRate}
              onComment={onComment}
            />
          ))
        )}
        {streaming ? (
          <Message
            m={{ role: 'assistant', content: streaming.content, model: streaming.model ?? liveModel ?? undefined }}
            streaming
          />
        ) : null}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="mt-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Start a conversation</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Type a prompt below. The right panel suggests a routing preset, estimates cost,
        and lints your prompt as you type.
      </p>
    </div>
  );
}

function Message({
  m,
  streaming,
  rating,
  comment,
  onRate,
  onComment,
}: {
  m: StoredMessage;
  streaming?: boolean;
  rating?: Rating;
  comment?: string;
  onRate?: (recordId: string, r: Rating | null) => void;
  onComment?: (recordId: string, c: string | null) => void;
}) {
  if (m.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-2">
        {m.images && m.images.length > 0 ? (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
            {m.images.map((src, i) => (
              <a
                key={i}
                href={src}
                target="_blank"
                rel="noreferrer noopener"
                className="block overflow-hidden rounded-lg border border-blue-500/30"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="max-h-48 max-w-full object-contain" />
              </a>
            ))}
          </div>
        ) : null}
        {m.content ? (
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-blue-600/90 px-4 py-2.5 text-sm text-white">
            {m.content}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-neutral-500">
        <span>Assistant</span>
        {m.model ? (
          <span className="rounded-md bg-neutral-800/80 px-1.5 py-0.5 font-mono text-[10px] normal-case tracking-normal text-neutral-300">
            {m.model}
          </span>
        ) : null}
        {streaming ? <span className="text-emerald-400">streaming…</span> : null}
      </div>
      <div className="text-[14.5px] leading-relaxed text-neutral-100">
        {m.content ? (
          <Markdown source={m.content} />
        ) : streaming ? (
          <span className="text-neutral-500">…</span>
        ) : null}
      </div>
      {m.recordId && onRate && !streaming ? (
        <RatingRow
          recordId={m.recordId}
          rating={rating}
          comment={comment}
          onRate={onRate}
          onComment={onComment}
        />
      ) : null}
    </div>
  );
}

function RatingRow({
  recordId,
  rating,
  comment,
  onRate,
  onComment,
}: {
  recordId: string;
  rating?: Rating;
  comment?: string;
  onRate: (recordId: string, r: Rating | null) => void;
  onComment?: (recordId: string, c: string | null) => void;
}) {
  const [open, setOpen] = useState(!!comment);
  const [draft, setDraft] = useState(comment ?? '');

  useEffect(() => {
    setDraft(comment ?? '');
    if (comment) setOpen(true);
  }, [comment]);

  function flip(next: Rating) {
    onRate(recordId, rating === next ? null : next);
  }
  function save() {
    onComment?.(recordId, draft.trim() ? draft : null);
  }
  const up = rating === 'up';
  const down = rating === 'down';
  return (
    <div className="mt-1 flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <Tip content="Mark this response as good. Feeds the per-model 'cost per good answer' stat in Insights.">
          <button
            type="button"
            onClick={() => flip('up')}
            aria-pressed={up}
            aria-label="Good answer"
            className={`rounded-md border px-1.5 py-0.5 text-[11px] transition-colors ${
              up
                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                : 'border-neutral-800 text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300'
            }`}
          >
            👍
          </button>
        </Tip>
        <Tip content="Mark this response as bad. Lowers this model's quality-per-dollar score for your prompts.">
          <button
            type="button"
            onClick={() => flip('down')}
            aria-pressed={down}
            aria-label="Bad answer"
            className={`rounded-md border px-1.5 py-0.5 text-[11px] transition-colors ${
              down
                ? 'border-red-500/50 bg-red-500/15 text-red-200'
                : 'border-neutral-800 text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300'
            }`}
          >
            👎
          </button>
        </Tip>
        {onComment ? (
          <Tip content="Add a short note about WHY this answer was good or bad. Stays local; later usable for semantic summary across many responses.">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className={`rounded-md border px-1.5 py-0.5 text-[10.5px] transition-colors ${
                comment
                  ? 'border-blue-500/40 bg-blue-500/10 text-blue-200'
                  : 'border-neutral-800 text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300'
              }`}
            >
              {comment ? '✎ note' : '+ note'}
            </button>
          </Tip>
        ) : null}
      </div>
      {open && onComment ? (
        <div className="flex flex-col gap-1">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            placeholder="Optional note — what made this answer good/bad? Stays local."
            rows={2}
            maxLength={1000}
            className="w-full resize-y rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11.5px] text-neutral-200 outline-none focus:border-neutral-600"
          />
          {comment && comment !== draft.trim() ? (
            <div className="text-[10px] text-neutral-500">Unsaved — click outside to save.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
