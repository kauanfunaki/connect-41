"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatarNumero, formatarReaisDeCentavos } from "@/lib/format";
import type { LinhaDaTabela, Tabela } from "@/lib/relatorios/tabelaDinamica";

// O recuo do rótulo em cada nível (16/11/2026, melhoria-719: as linhas vão até
// três níveis). A linha que abre tem a seta antes do texto; a que não abre
// começa onde começaria o texto da de cima.
const RECUO = ["pl-3", "pl-9", "pl-[60px]"] as const;
const SEPARADOR = "\u0000";

/** As chaves de todas as linhas que abrem, em qualquer nível — o "Abrir todas". */
function chavesQueAbrem(linhas: readonly LinhaDaTabela[], acima = ""): string[] {
  return linhas.flatMap((l) => {
    if (!l.filhas || l.filhas.length === 0) return [];
    const caminho = `${acima}${SEPARADOR}${l.chave}`;
    return [caminho, ...chavesQueAbrem(l.filhas, caminho)];
  });
}

/**
 * A tabela dinâmica montada no servidor (`montarTabela`). Com mais de um nível
 * de linha, o detalhe começa fechado — o resumo na linha, como os blocos
 * recolhíveis do Connect — e abre no clique, um nível por vez.
 */
export function TabelaDinamica({
  tabela,
  contagem,
  rotuloDasLinhas,
  comColunas,
}: {
  tabela: Tabela;
  /** A medida conta (quantidade), em vez de somar reais. */
  contagem: boolean;
  rotuloDasLinhas: string;
  comColunas: boolean;
}) {
  // A chave é o caminho da linha (o grupo, o detalhe…): o mesmo nome em dois
  // grupos são duas linhas, e cada uma abre sozinha.
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const comFilhas = tabela.linhas.some((l) => l.filhas && l.filhas.length > 0);
  const numero = (v: number) => {
    if (v === 0) return <span className="text-fg-muted">–</span>;
    const texto = contagem ? formatarNumero(v, 0) : formatarReaisDeCentavos(v);
    return v < 0 ? <span className="text-danger">{texto}</span> : texto;
  };
  const alternar = (chave: string) =>
    setAbertas((atual) => {
      const nova = new Set(atual);
      if (nova.has(chave)) nova.delete(chave);
      else nova.add(chave);
      return nova;
    });

  const celulas = (l: Pick<LinhaDaTabela, "valores" | "total">, forte = false) => (
    <>
      {comColunas &&
        l.valores.map((v, i) => (
          <td key={i} className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${forte ? "font-semibold" : ""}`}>
            {numero(v)}
          </td>
        ))}
      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold">{numero(l.total)}</td>
    </>
  );

  const linhasDoNivel = (linhas: readonly LinhaDaTabela[], nivel: number, acima: string): React.ReactNode[] =>
    linhas.flatMap((l) => {
      const caminho = `${acima}${SEPARADOR}${l.chave}`;
      const aberta = abertas.has(caminho);
      const temFilhas = !!l.filhas && l.filhas.length > 0;
      const primeiro = nivel === 0;
      const recuo = RECUO[Math.min(nivel, RECUO.length - 1)];
      return [
        <tr
          key={caminho}
          className={`group border-b border-border-soft hover:bg-surface-hover ${primeiro ? "" : "text-fg-secondary"}`}
        >
          <td
            className={`sticky left-0 z-10 bg-surface pr-3 group-hover:bg-surface-hover ${recuo} ${
              primeiro ? "py-2 font-medium text-fg" : `py-1.5 ${temFilhas ? "font-medium" : ""}`
            }`}
          >
            {temFilhas ? (
              <button
                type="button"
                onClick={() => alternar(caminho)}
                aria-expanded={aberta}
                className="inline-flex items-center gap-1.5 text-left hover:text-brand"
              >
                {aberta ? <ChevronDown size={14} className="flex-shrink-0" /> : <ChevronRight size={14} className="flex-shrink-0" />}
                <span>{l.rotulo}</span>
                <span className="text-micro font-normal text-fg-muted">({l.filhas!.length})</span>
              </button>
            ) : (
              l.rotulo
            )}
          </td>
          {celulas(l, temFilhas)}
        </tr>,
        ...(aberta ? linhasDoNivel(l.filhas!, nivel + 1, caminho) : []),
      ];
    });

  return (
    <div className="flex flex-col gap-2">
      {comFilhas && (
        <div className="flex justify-end gap-3">
          <Button type="button" variant="linkMuted" className="text-helper" onClick={() => setAbertas(new Set(chavesQueAbrem(tabela.linhas)))}>
            Abrir todas
          </Button>
          <Button type="button" variant="linkMuted" className="text-helper" onClick={() => setAbertas(new Set())}>
            Fechar todas
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-ui">
          <thead>
            <tr className="border-b border-border bg-table-header-bg text-micro font-medium uppercase tracking-wide text-table-header-fg">
              <th className="sticky left-0 z-10 bg-table-header-bg px-3 py-2 text-left">{rotuloDasLinhas}</th>
              {comColunas &&
                tabela.colunas.map((c) => (
                  <th key={c.chave} className="px-3 py-2 text-right whitespace-nowrap">
                    {c.rotulo}
                  </th>
                ))}
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>{linhasDoNivel(tabela.linhas, 0, "")}</tbody>
          <tfoot>
            <tr className="border-t border-border bg-surface-subtle font-semibold text-fg">
              <td className="sticky left-0 z-10 bg-surface-subtle px-3 py-2">Total</td>
              {celulas({ valores: tabela.totalPorColuna, total: tabela.total }, true)}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
