"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SearchResults = {
  companies: { id: string; name: string }[];
  people: { id: string; name: string }[];
  pipelines: { id: string; name: string }[];
};

const EMPTY: SearchResults = { companies: [], people: [], pipelines: [] };

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((data: SearchResults) => setResults(data))
        .catch(() => {});
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const hasResults = results.companies.length + results.people.length + results.pipelines.length > 0;

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <div ref={rootRef} className="relative w-full max-w-[320px]">
      <div className="flex items-center gap-2 h-8 px-3 rounded-md border border-border bg-canvas focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 transition-colors">
        <span className="text-fg-muted text-[13px] leading-none flex-shrink-0">⌕</span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar empresas, pessoas, kanban…"
          className="w-full h-full bg-transparent text-[12px] text-fg placeholder:text-fg-muted outline-none border-none"
        />
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 top-[calc(100%+6px)] w-[320px] bg-surface border border-border rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.1)] py-1.5 z-20 max-h-[360px] overflow-y-auto">
          {!hasResults ? (
            <p className="px-3 py-2.5 text-[12px] text-fg-muted">Nenhum resultado para &quot;{query}&quot;.</p>
          ) : (
            <>
              <ResultGroup
                label="Empresas"
                items={results.companies}
                onSelect={(id) => go(`/empresas/${id}`)}
              />
              <ResultGroup label="Pessoas" items={results.people} onSelect={(id) => go(`/pessoas/${id}`)} />
              <ResultGroup label="Kanban" items={results.pipelines} onSelect={(id) => go(`/kanban/${id}`)} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ResultGroup({
  label,
  items,
  onSelect,
}: {
  label: string;
  items: { id: string; name: string }[];
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="py-1">
      <p className="px-3 pb-1 text-[10px] font-medium text-fg-muted uppercase tracking-wider">{label}</p>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          className="w-full text-left px-3 py-1.5 text-[12px] text-fg hover:bg-surface-2 transition-colors truncate"
        >
          {item.name}
        </button>
      ))}
    </div>
  );
}
