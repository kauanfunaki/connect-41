"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

type SearchResults = {
  companies: { id: string; name: string }[];
  people: { id: string; name: string }[];
  candidatos: { id: string; name: string }[];
  pipelines: { id: string; name: string }[];
};

const EMPTY: SearchResults = { companies: [], people: [], candidatos: [], pipelines: [] };

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

  const hasResults =
    results.companies.length + results.people.length + results.candidatos.length + results.pipelines.length > 0;

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <div ref={rootRef} className="relative w-full max-w-[360px]">
      <div className="flex items-center gap-2.5 h-[38px] px-3.5 rounded-[10px] border border-border bg-input-bg focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--c41-focus-ring)] transition-colors">
        <Search size={16} className="text-fg-muted flex-shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar empresas, pessoas, candidatos, kanban…"
          className="w-full h-full bg-transparent text-[15px] text-fg placeholder:text-fg-muted outline-none border-none"
        />
      </div>

      {open && query.trim().length >= 2 && (
        <div className="scroll-y absolute left-0 top-[calc(100%+10px)] w-[360px] bg-surface-elevated border border-border-strong rounded-2xl shadow-[var(--c41-shadow-lg)] py-2 z-20 max-h-[360px] overflow-y-auto">
          {!hasResults ? (
            <p className="px-3.5 py-3 text-[13px] text-fg-muted">Nenhum resultado para &quot;{query}&quot;.</p>
          ) : (
            <>
              <ResultGroup
                label="Empresas"
                items={results.companies}
                onSelect={(id) => go(`/empresas/${id}`)}
              />
              <ResultGroup label="Pessoas" items={results.people} onSelect={(id) => go(`/pessoas/${id}`)} />
              <ResultGroup label="Candidatos" items={results.candidatos} onSelect={(id) => go(`/candidatos/${id}`)} />
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
    <div className="py-1 px-1">
      <p className="px-2.5 pb-1 text-[11px] font-semibold text-fg-muted uppercase tracking-wider">{label}</p>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          className="w-full text-left px-2.5 py-2 rounded-lg text-[14px] text-fg hover:bg-surface-hover transition-colors truncate"
        >
          {item.name}
        </button>
      ))}
    </div>
  );
}
