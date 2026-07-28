"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ListFilter, Search, UserCheck, Gauge } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";

const STATUS_OPTIONS = [
  { value: "", label: "Todo status" },
  { value: "open", label: "Abertas" },
  { value: "pending", label: "Pendentes" },
  { value: "resolved", label: "Resolvidas" },
  { value: "snoozed", label: "Adiadas" },
];

type Props = {
  search: string;
  status: string;
  atendente: string;
  de: string;
  ate: string;
  assignees: string[];
};

type FilterKey = "periodo" | "atendente" | "status";

// Mesmo padrão do botão "Filtros" (BoardView.tsx, lista de tarefas por
// setor): categorias colapsadas dentro de um Modal, em vez de um formulário
// sempre visível com um campo por filtro. /conversas é renderizado no
// servidor com os filtros na URL — aqui só a interação muda (popover em vez
// de formulário inline), a navegação continua sendo uma troca de querystring.
export function ConversasFilterBar({ search: initialSearch, status, atendente, de, ate, assignees }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<FilterKey | null>(null);
  const [deValue, setDeValue] = useState(de);
  const [ateValue, setAteValue] = useState(ate);

  const activeFilterCount = [status, atendente, de, ate].filter(Boolean).length;

  function buildUrl(extra: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { search, status, atendente, de, ate, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `/conversas?${q.toString()}`;
  }

  function apply(extra: Record<string, string | undefined>) {
    router.push(buildUrl({ page: undefined, ...extra }));
    setOpen(false);
    setActiveKey(null);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(buildUrl({ page: undefined }));
  }

  const filterDefs: { key: FilterKey; label: string; icon: React.ReactNode; active: boolean }[] = [
    { key: "periodo", label: "Período", icon: <CalendarClock size={13} />, active: Boolean(de || ate) },
    { key: "atendente", label: "Atendente", icon: <UserCheck size={13} />, active: Boolean(atendente) },
    { key: "status", label: "Status", icon: <Gauge size={13} />, active: Boolean(status) },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <form onSubmit={handleSearchSubmit} className="flex-1 min-w-[220px] max-w-xs">
        <Input
          compact
          icon={<Search size={14} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Contato, empresa ou mensagem…"
        />
      </form>

      <button
        type="button"
        onClick={() => { setActiveKey(null); setOpen(true); }}
        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-[12.5px] font-medium transition-colors flex-shrink-0 ${
          activeFilterCount > 0 ? "border-brand/40 bg-brand/[0.06] text-fg" : "border-border text-fg-secondary hover:text-fg hover:bg-surface-hover"
        }`}
      >
        <ListFilter size={14} /> Filtros
        {activeFilterCount > 0 && <span className="tnum">({activeFilterCount})</span>}
      </button>

      {activeFilterCount > 0 && (
        <button
          type="button"
          onClick={() => apply({ status: undefined, atendente: undefined, de: undefined, ate: undefined })}
          className="text-[12.5px] text-fg-muted hover:text-fg transition-colors"
        >
          Limpar filtros
        </button>
      )}

      <Modal open={open} onClose={() => { setOpen(false); setActiveKey(null); }} title="Filtros" maxWidth="max-w-sm">
        <div className="flex items-center gap-1 mb-3 flex-wrap">
          {filterDefs.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setActiveKey((k) => (k === f.key ? null : f.key))}
              className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-[12px] font-medium transition-colors ${
                f.active || activeKey === f.key
                  ? "border-brand/40 bg-brand/[0.06] text-fg"
                  : "border-border text-fg-secondary hover:text-fg hover:bg-surface-hover"
              }`}
            >
              {f.icon}
              {f.label}
            </button>
          ))}
        </div>

        {activeKey === "periodo" && (
          <div className="space-y-2">
            <div>
              <p className="text-[11px] font-medium text-fg-muted mb-1">De</p>
              <Input type="date" autoFocus value={deValue} onChange={(e) => setDeValue(e.target.value)} />
            </div>
            <div>
              <p className="text-[11px] font-medium text-fg-muted mb-1">Até</p>
              <Input type="date" value={ateValue} onChange={(e) => setAteValue(e.target.value)} />
            </div>
            <button
              type="button"
              onClick={() => apply({ de: deValue || undefined, ate: ateValue || undefined })}
              className="h-8 px-3 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover transition-colors"
            >
              Aplicar
            </button>
          </div>
        )}

        {activeKey === "atendente" && (
          <div>
            <p className="text-[11px] font-medium text-fg-muted mb-1">Atendente</p>
            <Select autoFocus value={atendente} onChange={(e) => apply({ atendente: e.target.value || undefined })}>
              <option value="">Todos</option>
              {assignees.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </Select>
          </div>
        )}

        {activeKey === "status" && (
          <div>
            <p className="text-[11px] font-medium text-fg-muted mb-1">Status</p>
            <Select autoFocus value={status} onChange={(e) => apply({ status: e.target.value || undefined })}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </div>
        )}
      </Modal>
    </div>
  );
}
