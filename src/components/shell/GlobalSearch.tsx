"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

type DocumentEntityType = "PERSON" | "COMPANY" | "VAGA" | "PIPELINE_ITEM";

type SearchResults = {
  companies: { id: string; name: string }[];
  people: { id: string; name: string }[];
  candidatos: { id: string; name: string }[];
  pipelines: { id: string; name: string }[];
  vagas: { id: string; name: string }[];
  documentos: { id: string; name: string; entityType: DocumentEntityType; entityId: string }[];
};

const EMPTY: SearchResults = { companies: [], people: [], candidatos: [], pipelines: [], vagas: [], documentos: [] };

// Documento não tem página própria — o resultado leva pra ficha de quem é
// dono dele. Item de Kanban não tem link direto sem saber o pipelineId
// (custaria uma query extra só pra isso) — cai na listagem geral.
function documentHref(entityType: DocumentEntityType, entityId: string): string {
  switch (entityType) {
    case "PERSON": return `/pessoas/${entityId}`;
    case "COMPANY": return `/empresas/${entityId}`;
    case "VAGA": return `/vagas/${entityId}`;
    case "PIPELINE_ITEM": return "/kanban";
  }
}

// Abaixo de sm, o input inline não cabe na topbar (some espremido pelos
// ícones de tema/notificação/perfil) — vira um botão de lupa que abre um
// campo em overlay cobrindo a topbar inteira, com foco automático.
export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [open, setOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
    if (mobileExpanded) inputRef.current?.focus();
  }, [mobileExpanded]);

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
    results.companies.length +
      results.people.length +
      results.candidatos.length +
      results.pipelines.length +
      results.vagas.length +
      results.documentos.length >
    0;

  function go(href: string) {
    setOpen(false);
    setMobileExpanded(false);
    setQuery("");
    router.push(href);
  }

  function closeMobile() {
    setMobileExpanded(false);
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileExpanded(true)}
        className="sm:hidden flex-shrink-0 text-fg-secondary hover:text-fg transition-colors"
        aria-label="Buscar"
      >
        <Search size={19} />
      </button>

      <div
        ref={rootRef}
        className={
          mobileExpanded
            ? "fixed inset-x-0 top-0 z-50 h-[60px] flex items-center px-4 bg-topbar-bg sm:static sm:h-auto sm:px-0 sm:bg-transparent sm:w-full sm:max-w-md"
            : "hidden sm:block relative w-full max-w-md"
        }
      >
        <div className="relative w-full">
          <div className="flex items-center gap-2.5 h-[38px] px-3.5 rounded-[10px] border border-border bg-input-bg focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--c41-focus-ring)] transition-colors">
            <Search size={16} className="text-fg-muted flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="Buscar empresas, pessoas, kanban…"
              className="w-full h-full bg-transparent text-[15px] text-fg placeholder:text-fg-muted outline-none border-none"
            />
            {mobileExpanded && (
              <button
                type="button"
                onClick={closeMobile}
                className="sm:hidden flex-shrink-0 text-fg-muted hover:text-fg transition-colors"
                aria-label="Fechar busca"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {open && query.trim().length >= 2 && (
            <div className="scroll-y absolute left-0 top-[calc(100%+10px)] w-full bg-surface-elevated border border-border-strong rounded-2xl shadow-[var(--c41-shadow-lg)] py-2 z-20 max-h-[360px] overflow-y-auto">
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
                  <ResultGroup label="Vagas" items={results.vagas} onSelect={(id) => go(`/vagas/${id}`)} />
                  <ResultGroup
                    label="Documentos"
                    items={results.documentos}
                    onSelect={(id) => {
                      const doc = results.documentos.find((d) => d.id === id);
                      if (doc) go(documentHref(doc.entityType, doc.entityId));
                    }}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
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
