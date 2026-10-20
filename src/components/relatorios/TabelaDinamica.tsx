"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatarNumero, formatarReaisDeCentavos } from "@/lib/format";
import type { LinhaDaTabela, Tabela } from "@/lib/relatorios/tabelaDinamica";

/**
 * A tabela dinâmica montada no servidor (`montarTabela`). Com dois níveis de
 * linha, o detalhe começa fechado — o resumo na linha, como os blocos
 * recolhíveis do Connect — e abre no clique.
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

  return (
    <div className="flex flex-col gap-2">
      {comFilhas && (
        <div className="flex justify-end gap-3">
          <Button type="button" variant="linkMuted" className="text-helper" onClick={() => setAbertas(new Set(tabela.linhas.map((l) => l.chave)))}>
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
            <tr className="border-b border-border bg-surface-subtle text-micro font-medium uppercase tracking-wide text-fg-muted">
              <th className="sticky left-0 z-10 bg-surface-subtle px-3 py-2 text-left">{rotuloDasLinhas}</th>
              {comColunas &&
                tabela.colunas.map((c) => (
                  <th key={c.chave} className="px-3 py-2 text-right whitespace-nowrap">
                    {c.rotulo}
                  </th>
                ))}
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {tabela.linhas.map((l) => {
              const aberta = abertas.has(l.chave);
              const temFilhas = !!l.filhas && l.filhas.length > 0;
              return (
                <Fragment key={l.chave}>
                  <tr className="border-b border-border-soft hover:bg-surface-hover">
                    <td className="sticky left-0 z-10 bg-surface px-3 py-2 font-medium text-fg">
                      {temFilhas ? (
                        <button
                          type="button"
                          onClick={() => alternar(l.chave)}
                          aria-expanded={aberta}
                          className="inline-flex items-center gap-1.5 text-left hover:text-brand"
                        >
                          {aberta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <span>{l.rotulo}</span>
                          <span className="text-micro font-normal text-fg-muted">({l.filhas!.length})</span>
                        </button>
                      ) : (
                        l.rotulo
                      )}
                    </td>
                    {celulas(l, temFilhas)}
                  </tr>
                  {aberta &&
                    l.filhas!.map((f) => (
                      <tr key={`${l.chave}\u0000${f.chave}`} className="border-b border-border-soft text-fg-secondary">
                        <td className="sticky left-0 z-10 bg-surface px-3 py-1.5 pl-9">{f.rotulo}</td>
                        {celulas(f)}
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
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
