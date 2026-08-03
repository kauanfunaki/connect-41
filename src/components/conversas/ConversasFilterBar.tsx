"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { FilterButton, FilterButtonSection } from "@/components/ui/FilterButton";

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

// Usa o FilterButton compartilhado — o mesmo de /empresas, /pessoas e
// /candidatos. Antes esta tela tinha um botão próprio que abria um Modal com
// as categorias em duas etapas (escolher "Período"/"Atendente"/"Status" e só
// então ver o campo): mesma palavra, outra mecânica, e um diálogo em cima da
// tela pra três campos. O painel ancorado mostra os três de uma vez.
//
// A busca por texto fica fora do painel de propósito (é "ao vivo", não combina
// com o padrão aplicar/fechar do filtro estruturado), igual às outras telas.
export function ConversasFilterBar({ search: initialSearch, status, atendente, de, ate, assignees }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  // Rascunho local: só vira URL no "Aplicar". As datas não têm um momento
  // óbvio de "terminei de digitar", então aplicar a cada tecla recarregaria a
  // lista no meio de uma data pela metade.
  const [draftStatus, setDraftStatus] = useState(status);
  const [draftAtendente, setDraftAtendente] = useState(atendente);
  const [draftDe, setDraftDe] = useState(de);
  const [draftAte, setDraftAte] = useState(ate);

  const activeFilterCount = [status, atendente, de, ate].filter(Boolean).length;

  function buildUrl(extra: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { search, status, atendente, de, ate, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `/conversas?${q.toString()}`;
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(buildUrl({ page: undefined }));
  }

  function applyDraft(close: () => void) {
    close();
    router.push(
      buildUrl({
        page: undefined,
        status: draftStatus || undefined,
        atendente: draftAtendente || undefined,
        de: draftDe || undefined,
        ate: draftAte || undefined,
      }),
    );
  }

  function clearAll() {
    setDraftStatus("");
    setDraftAtendente("");
    setDraftDe("");
    setDraftAte("");
    router.push(buildUrl({ page: undefined, status: undefined, atendente: undefined, de: undefined, ate: undefined }));
  }

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

      <FilterButton activeCount={activeFilterCount} width={280}>
        {({ close }) => (
          <div className="space-y-3">
            <FilterButtonSection label="Período">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  compact
                  type="date"
                  aria-label="De"
                  value={draftDe}
                  onChange={(e) => setDraftDe(e.target.value)}
                />
                <Input
                  compact
                  type="date"
                  aria-label="Até"
                  value={draftAte}
                  onChange={(e) => setDraftAte(e.target.value)}
                />
              </div>
            </FilterButtonSection>

            <FilterButtonSection label="Atendente">
              <Select
                compact
                aria-label="Atendente"
                value={draftAtendente}
                onChange={(e) => setDraftAtendente(e.target.value)}
              >
                <option value="">Todos</option>
                {assignees.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </Select>
            </FilterButtonSection>

            <FilterButtonSection label="Status">
              <Select
                compact
                aria-label="Status"
                value={draftStatus}
                onChange={(e) => setDraftStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </FilterButtonSection>

            <div className="flex items-center gap-2 pt-1">
              <Button type="button" size="sm" onClick={() => applyDraft(close)}>
                Aplicar
              </Button>
              {activeFilterCount > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => { close(); clearAll(); }}
                >
                  Limpar
                </Button>
              )}
            </div>
          </div>
        )}
      </FilterButton>
    </div>
  );
}
