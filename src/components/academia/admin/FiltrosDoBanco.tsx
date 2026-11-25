"use client";

import { useState, useTransition } from "react";
import { FilterButton, FilterButtonSection } from "@/components/ui/FilterButton";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { NIVEIS, ROTULO_DO_NIVEL, ehNivel, type Nivel } from "@/lib/academia/regras";

// O banco de textos e de questões da administração (melhoria-823, 25/11/2026):
// a lista ficou mais curta de ler e de mexer — filtro de nível e situação no
// painel do Filtros, quantos ativos há em cada nível na barra, e o liga/desliga
// na própria linha, sem abrir o formulário. A regra não mudou: não se exclui
// texto nem questão, desliga (o histórico de quem já fez fica de pé).

export type Situacao = "" | "ativos" | "desligados";
export type FiltroDoBanco = { nivel: Nivel | ""; situacao: Situacao };
export const SEM_FILTRO: FiltroDoBanco = { nivel: "", situacao: "" };

export function filtrar<T extends { nivel: Nivel; ativo: boolean }>(itens: readonly T[], f: FiltroDoBanco): T[] {
  return itens.filter(
    (i) => (!f.nivel || i.nivel === f.nivel) && (!f.situacao || (f.situacao === "ativos" ? i.ativo : !i.ativo)),
  );
}

/** "Ativos: Fácil 4 · Médio 6 · Difícil 3" — onde falta cadastrar, de relance. */
export function AtivosPorNivel({ itens }: { itens: readonly { nivel: Nivel; ativo: boolean }[] }) {
  return (
    <span className="text-fg-muted tabular-nums">
      Ativos: {NIVEIS.map((n) => `${ROTULO_DO_NIVEL[n]} ${itens.filter((i) => i.ativo && i.nivel === n).length}`).join(" · ")}
    </span>
  );
}

/** O botão Filtros da lista: nível e situação, um seletor cada. */
export function FiltrosDoBanco({ filtro, onChange, feminino = false }: { filtro: FiltroDoBanco; onChange: (f: FiltroDoBanco) => void; feminino?: boolean }) {
  const ativos = (filtro.nivel ? 1 : 0) + (filtro.situacao ? 1 : 0);
  return (
    <FilterButton activeCount={ativos} width={260}>
      <div className="space-y-3">
        <FilterButtonSection label="Nível">
          <Select compact aria-label="Nível" value={filtro.nivel} onChange={(e) => onChange({ ...filtro, nivel: ehNivel(e.target.value) ? e.target.value : "" })} className="w-full">
            <option value="">Todos os níveis</option>
            {NIVEIS.map((n) => (
              <option key={n} value={n}>{ROTULO_DO_NIVEL[n]}</option>
            ))}
          </Select>
        </FilterButtonSection>
        <FilterButtonSection label="Situação">
          <Select
            compact
            aria-label="Situação"
            value={filtro.situacao}
            onChange={(e) => onChange({ ...filtro, situacao: e.target.value === "ativos" || e.target.value === "desligados" ? e.target.value : "" })}
            className="w-full"
          >
            <option value="">{feminino ? "Todas" : "Todos"}</option>
            <option value="ativos">{feminino ? "Ativas" : "Ativos"}</option>
            <option value="desligados">{feminino ? "Desligadas" : "Desligados"}</option>
          </Select>
        </FilterButtonSection>
      </div>
    </FilterButton>
  );
}

/**
 * O liga/desliga na linha: grava pelo mesmo `salvar` do formulário, com o
 * item inteiro e só o `ativo` trocado. Muda na hora e volta se o servidor recusar.
 */
export function AtivoNaLinha({
  ativo,
  rotulo,
  salvar,
  aoSalvar,
}: {
  ativo: boolean;
  /** "Texto Médio: Lorem ipsum…" — o que o leitor de tela diz do interruptor. */
  rotulo: string;
  salvar: (ativo: boolean) => Promise<{ ok: true } | { erro: string }>;
  aoSalvar: () => void;
}) {
  const [ligado, setLigado] = useState(ativo);
  const [gravando, iniciar] = useTransition();
  const toast = useToast();
  function trocar(novo: boolean) {
    setLigado(novo);
    iniciar(async () => {
      const r = await salvar(novo);
      if ("erro" in r) {
        setLigado(!novo);
        toast.error(r.erro);
        return;
      }
      toast.success(novo ? "Ligado: volta ao sorteio das rodadas." : "Desligado: sai do sorteio das rodadas.");
      aoSalvar();
    });
  }
  return <Switch size="sm" checked={ligado} onCheckedChange={trocar} disabled={gravando} aria-label={`${rotulo} — ativo`} />;
}
