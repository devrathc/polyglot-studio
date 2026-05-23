'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CatalogModel } from '@/app/api/models/route';
import { Tip } from '@/components/Tip';
import { fetchCatalog, formatPricePerM } from '@/lib/pricing';
import { isFreeModel } from '@/lib/routing';
import { setChatMode, setSelectedModel } from '@/lib/storage';

type SortKey = 'id' | 'context' | 'in' | 'out';

export function ModelBrowser() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState('all');
  const [modality, setModality] = useState<'all' | 'text' | 'vision'>('all');
  const [maxIn, setMaxIn] = useState<number | ''>('');
  const [minCtx, setMinCtx] = useState<number | ''>('');

  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'id', dir: 'asc' });

  useEffect(() => {
    fetchCatalog()
      .then((data) => setCatalog(data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const providers = useMemo(() => {
    const set = new Set(catalog.map((m) => m.provider));
    return ['all', ...Array.from(set).sort()];
  }, [catalog]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = catalog.filter((m) => {
      if (q && !m.id.toLowerCase().includes(q) && !m.name.toLowerCase().includes(q)) return false;
      if (provider !== 'all' && m.provider !== provider) return false;
      if (modality === 'vision' && !m.modalities.some((x) => /image|vision/i.test(x))) return false;
      if (modality === 'text' && m.modalities.some((x) => /image|vision/i.test(x))) return false;
      if (typeof maxIn === 'number' && m.pricing.prompt * 1_000_000 > maxIn) return false;
      if (typeof minCtx === 'number' && m.context_length < minCtx * 1000) return false;
      return true;
    });
    rows = rows.sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1;
      switch (sort.key) {
        case 'context':
          return (a.context_length - b.context_length) * dir;
        case 'in':
          return (a.pricing.prompt - b.pricing.prompt) * dir;
        case 'out':
          return (a.pricing.completion - b.pricing.completion) * dir;
        case 'id':
        default:
          return a.id.localeCompare(b.id) * dir;
      }
    });
    return rows;
  }, [catalog, search, provider, modality, maxIn, minCtx, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  function useThisModel(id: string) {
    setSelectedModel(id);
    setChatMode(isFreeModel(id) ? 'free' : 'default');
    router.push('/');
  }

  const freeRows = useMemo(() => filtered.filter((m) => isFreeModel(m.id)), [filtered]);
  const paidRows = useMemo(() => filtered.filter((m) => !isFreeModel(m.id)), [filtered]);

  return (
    <div className="mx-auto flex h-full max-w-[1400px] flex-col gap-4 p-6">
      <div className="rounded-2xl border border-neutral-900 bg-[#0d0d10] p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Field label="Search">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="claude, gpt, deepseek…"
              className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs outline-none focus:border-neutral-600"
            />
          </Field>
          <Field label="Provider">
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs outline-none focus:border-neutral-600"
            >
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Modality">
            <select
              value={modality}
              onChange={(e) => setModality(e.target.value as 'all' | 'text' | 'vision')}
              className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs outline-none focus:border-neutral-600"
            >
              <option value="all">all</option>
              <option value="text">text only</option>
              <option value="vision">vision</option>
            </select>
          </Field>
          <Field label="Max input $/M">
            <input
              type="number"
              step="0.1"
              min="0"
              value={maxIn}
              onChange={(e) => setMaxIn(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="any"
              className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs outline-none focus:border-neutral-600"
            />
          </Field>
          <Field label="Min context (k)">
            <input
              type="number"
              step="1"
              min="0"
              value={minCtx}
              onChange={(e) => setMinCtx(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="any"
              className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs outline-none focus:border-neutral-600"
            />
          </Field>
        </div>
        <div className="mt-2 text-[11px] text-neutral-500">
          {loading ? 'Loading catalog…' : error ? `Error: ${error}` : `${filtered.length} of ${catalog.length} models`}
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-auto">
        <Section
          label="Free pool"
          accent="emerald"
          subtitle="$0 per token, rate-capped (20 RPM, 50–1000 RPD)"
          count={freeRows.length}
          rows={freeRows}
          sort={sort}
          toggleSort={toggleSort}
          useModel={useThisModel}
          loading={loading}
          emptyMessage="No free models match these filters."
        />
        <Section
          label="Paid catalog"
          accent="neutral"
          subtitle="Billed per token to OpenRouter credits (or provider account if BYOK)"
          count={paidRows.length}
          rows={paidRows}
          sort={sort}
          toggleSort={toggleSort}
          useModel={useThisModel}
          loading={loading}
          emptyMessage="No paid models match these filters."
        />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] uppercase tracking-wider text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

function Section({
  label,
  accent,
  subtitle,
  count,
  rows,
  sort,
  toggleSort,
  useModel,
  loading,
  emptyMessage,
}: {
  label: string;
  accent: 'emerald' | 'neutral';
  subtitle: string;
  count: number;
  rows: CatalogModel[];
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  toggleSort: (k: SortKey) => void;
  useModel: (id: string) => void;
  loading: boolean;
  emptyMessage: string;
}) {
  const headerBg =
    accent === 'emerald'
      ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
      : 'border-neutral-900 bg-[#0d0d10]';
  const badgeColor =
    accent === 'emerald'
      ? 'bg-emerald-500/20 text-emerald-300'
      : 'bg-neutral-800 text-neutral-300';
  return (
    <section className={`rounded-2xl border ${headerBg}`}>
      <header className="flex items-center justify-between border-b border-neutral-900 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-neutral-100">{label}</span>
          <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${badgeColor}`}>
            {count}
          </span>
        </div>
        <span className="text-[10.5px] text-neutral-500">{subtitle}</span>
      </header>
      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[#0d0d10]">
            <tr className="border-b border-neutral-900 text-left text-[11px] uppercase tracking-wider text-neutral-500">
              <Th onClick={() => toggleSort('id')} active={sort.key === 'id'} dir={sort.dir}>Model</Th>
              <Th onClick={() => toggleSort('context')} active={sort.key === 'context'} dir={sort.dir} right>Context</Th>
              <Th onClick={() => toggleSort('in')} active={sort.key === 'in'} dir={sort.dir} right>Input</Th>
              <Th onClick={() => toggleSort('out')} active={sort.key === 'out'} dir={sort.dir} right>Output</Th>
              <th className="px-3 py-2 text-right">Modalities</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-b border-neutral-900/60 hover:bg-neutral-900/40">
                <td className="px-3 py-2">
                  <div className="font-mono text-[12px] text-neutral-100">{m.id}</div>
                  <div className="text-[10.5px] text-neutral-500">{m.name}</div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-[11px] text-neutral-300">
                  {m.context_length ? `${Math.round(m.context_length / 1000)}k` : '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono text-[11px] text-neutral-300">
                  {formatPricePerM(m.pricing.prompt)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-[11px] text-neutral-300">
                  {formatPricePerM(m.pricing.completion)}
                </td>
                <td className="px-3 py-2 text-right text-[10.5px] text-neutral-500">
                  {m.modalities.join(', ')}
                </td>
                <td className="px-3 py-2 text-right">
                  <Tip
                    content={
                      isFreeModel(m.id)
                        ? 'Open this model in Chat. Free Only mode activates automatically (this is a :free model).'
                        : 'Open this model in Chat. Default mode activates (paid models, billed to OpenRouter credits).'
                    }
                  >
                    <button
                      onClick={() => useModel(m.id)}
                      className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-200 hover:bg-neutral-800"
                    >
                      Use in Chat →
                    </button>
                  </Tip>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-xs text-neutral-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
  right,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: 'asc' | 'desc';
  right?: boolean;
}) {
  return (
    <Tip content="Click to sort by this column. Click again to reverse direction.">
      <th
        className={`cursor-pointer select-none px-3 py-2 ${right ? 'text-right' : ''} ${active ? 'text-neutral-200' : ''}`}
        onClick={onClick}
      >
        {children}
        {active ? <span className="ml-1">{dir === 'asc' ? '↑' : '↓'}</span> : null}
      </th>
    </Tip>
  );
}
