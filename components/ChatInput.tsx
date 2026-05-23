'use client';

import { useEffect, useRef } from 'react';

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
};

export function ChatInput({ value, onChange, onSend, disabled }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = `${Math.min(ref.current.scrollHeight, 280)}px`;
  }, [value]);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSend();
    }
  }

  return (
    <div className="border-t border-neutral-900 bg-[#0a0a0b] px-6 py-4">
      <div className="mx-auto flex max-w-3xl items-end gap-3">
        <div className="flex flex-1 flex-col rounded-2xl border border-neutral-800 bg-[#101013] px-4 py-3 focus-within:border-neutral-700">
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask anything…  (⌘/Ctrl + Enter to send)"
            rows={1}
            disabled={disabled}
            className="resize-none bg-transparent text-[14.5px] text-neutral-100 outline-none placeholder:text-neutral-600 disabled:opacity-60"
          />
        </div>
        <button
          onClick={onSend}
          disabled={disabled || !value.trim()}
          title="Send the message (⌘/Ctrl + Enter)"
          className="h-10 rounded-xl bg-emerald-500 px-4 text-sm font-medium text-black transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {disabled ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
