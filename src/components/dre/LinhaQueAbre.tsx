"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { TODAS_AS_LINHAS } from "@/lib/dre/estrutura";

// A linha de grupo da DRE que abre nas categorias (13/10/2026, do teste da
// Amanda, do BPO): "CMV" sozinho não diz de onde veio o número, e a resposta
// estava na planilha do Omie. Começa fechada; o rótulo vira botão com
// `aria-expanded`, que o teclado alcança e o Enter e o Espaço abrem.
//
// Um lugar só para as três tabelas que a mostram — a DRE do mês (na equipe e
// no portal do cliente, `TabelaDaDre`) e a do ano (`RelatorioAnual`): o estado,
// o botão e o recuo das categorias.

/** O grupo de uma linha do relatório, quando ela é linha de grupo — de qualquer modelo. */
const GRUPO_DA_LINHA = new Map(TODAS_AS_LINHAS.flatMap((l) => (l.tipo === "grupo" ? [[l.code, l.grupo] as const] : [])));

export function grupoDaLinha(code: string): string | null {
  return GRUPO_DA_LINHA.get(code) ?? null;
}

/** Quais linhas estão abertas. Todas começam fechadas. */
export function useLinhasAbertas() {
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(() => new Set());
  return {
    aberta: (code: string) => abertas.has(code),
    alternar: (code: string) =>
      setAbertas((atual) => {
        const proximo = new Set(atual);
        if (proximo.has(code)) proximo.delete(code);
        else proximo.add(code);
        return proximo;
      }),
  };
}

/**
 * O rótulo da linha de grupo. Com categorias, é o botão que abre; sem
 * nenhuma (grupo zerado no período), é texto — com o mesmo recuo da seta,
 * para os rótulos seguirem alinhados.
 */
export function RotuloDaLinha({
  rotulo,
  categorias,
  aberta,
  onAlternar,
}: {
  rotulo: string;
  /** Quantas categorias a linha abre. Zero: não abre. */
  categorias: number;
  aberta: boolean;
  onAlternar: () => void;
}) {
  if (categorias === 0) return <span className="block pl-[18px]">{rotulo}</span>;
  return (
    <button
      type="button"
      aria-expanded={aberta}
      onClick={onAlternar}
      title={aberta ? "Esconder as categorias" : "Ver as categorias desta linha"}
      className="inline-flex items-start gap-1 text-left rounded-sm cursor-pointer hover:text-fg transition-colors"
    >
      <ChevronRight
        size={14}
        aria-hidden
        className={`mt-[3px] shrink-0 text-fg-muted transition-transform ${aberta ? "rotate-90" : ""}`}
      />
      <span>
        {rotulo}
        <span className="sr-only">
          {" "}
          ({categorias === 1 ? "1 categoria" : `${categorias} categorias`})
        </span>
      </span>
    </button>
  );
}

/** O rótulo de uma categoria aberta: recuado sob o texto do grupo, e quebra em vez de cortar. */
export function RotuloDaCategoria({ nome }: { nome: string }) {
  return <span className="block pl-[18px] text-fs-2 text-fg-secondary whitespace-normal break-words">{nome}</span>;
}
