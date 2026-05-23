'use client';

export type HistoryItem = {
  id: string;
  title: string;
  updatedAt?: number;
};

type Props = {
  items: HistoryItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  newLabel?: string;
  emptyLabel?: string;
};

export function HistoryDrawer({
  items,
  activeId,
  onSelect,
  onNew,
  onDelete,
  newLabel = '+ New',
  emptyLabel = 'No history yet.',
}: Props) {
  return (
    <aside className="flex h-full w-64 flex-col border-r border-neutral-900 bg-[#0a0a0b]">
      <div className="border-b border-neutral-900 p-3">
        <button
          type="button"
          onClick={onNew}
          title="Start a fresh entry. Your current entry remains in the list."
          className="w-full rounded-md border border-neutral-800 bg-neutral-900 py-1.5 text-xs text-neutral-200 transition-colors hover:bg-neutral-800"
        >
          {newLabel}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          <p className="px-2 py-4 text-center text-[11.5px] text-neutral-500">{emptyLabel}</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {items.map((s) => {
              const active = s.id === activeId;
              return (
                <li key={s.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelect(s.id)}
                    className={`w-full truncate rounded-md px-2 py-1.5 pr-7 text-left text-[12px] transition-colors ${
                      active ? 'bg-neutral-800 text-white' : 'text-neutral-300 hover:bg-neutral-900'
                    }`}
                    title={s.title}
                  >
                    {s.title}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(s.id);
                    }}
                    title="Delete this entry from history (not recoverable)"
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-[10px] text-neutral-500 opacity-0 transition-opacity hover:bg-neutral-700 hover:text-neutral-200 group-hover:opacity-100"
                    aria-label="Delete entry"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
