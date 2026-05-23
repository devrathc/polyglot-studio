'use client';

import type { ReactNode } from 'react';

type BadgeColor = 'emerald' | 'purple' | 'blue' | 'amber';

const BADGE_COLORS: Record<BadgeColor, string> = {
  emerald: 'bg-emerald-500/15 text-emerald-300',
  purple: 'bg-purple-500/15 text-purple-300',
  blue: 'bg-blue-500/15 text-blue-300',
  amber: 'bg-amber-500/15 text-amber-300',
};

type Props = {
  title: string;
  badge?: { text: string; color: BadgeColor };
  description: string;
  techNote: string;
  pricing?: ReactNode;
  rightAction?: ReactNode;
  /** Use false on tabs with side panels so the header content fills the column. */
  centered?: boolean;
};

export function TabHeader({
  title,
  badge,
  description,
  techNote,
  pricing,
  rightAction,
  centered = true,
}: Props) {
  const inner = (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-neutral-100">{title}</span>
          {badge && (
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${BADGE_COLORS[badge.color]}`}
            >
              {badge.text}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[11.5px] text-neutral-400">{description}</div>
        <div className="mt-1 font-mono text-[10px] text-neutral-500">
          <span className="text-neutral-600">tech · </span>
          {techNote}
        </div>
        {pricing}
      </div>
      {rightAction ? <div className="shrink-0">{rightAction}</div> : null}
    </div>
  );

  return (
    <div className="border-b border-neutral-900 bg-[#0a0a0b] px-6 py-3">
      {centered ? <div className="mx-auto max-w-3xl">{inner}</div> : inner}
    </div>
  );
}
