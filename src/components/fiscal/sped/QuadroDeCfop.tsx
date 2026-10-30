"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { GRUPOS_DA_APURACAO, type GrupoDaApuracao, type LinhaCfop } from "@/lib/fiscal/sped/arquivoIcms";
import { aliquotaDeCentesimos, contagem, reaisDeCentavos } from "@/lib/fiscal/sped/formato";

/**
 * As operações por CFOP, CST e alíquota (C190 e D190), um grupo por vez: no
 * painel eram quatro tabelas empilhadas, e a de CT-e de saída empurrava as
 * outras para fora da tela.
 */
export function QuadroDeCfop({ grupos }: { grupos: Record<GrupoDaApuracao, LinhaCfop[]> }) {
  const inicial = GRUPOS_DA_APURACAO.find((g) => grupos[g.chave].length > 0)?.chave ?? "saidasCte";
  const [grupo, setGrupo] = useState<GrupoDaApuracao>(inicial);
  const linhas = grupos[grupo];
  const total = linhas.reduce((s, l) => ({ op: s.op + l.valorOperacao, bc: s.bc + l.valorBc, icms: s.icms + l.valorIcms }), { op: 0, bc: 0, icms: 0 });
  return <div className="space-y-3">
    <SegmentedControl<GrupoDaApuracao> label="Grupo de operações" active={grupo} onChange={setGrupo}
      items={GRUPOS_DA_APURACAO.map((g) => ({ key: g.chave, label: g.rotulo, contagem: grupos[g.chave].length }))} />
    <div className="c41-tabela overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full">
        <thead>
          <tr>
            <th className="px-3">CFOP</th>
            <th className="px-3">CST</th>
            <th className="px-3">Alíquota</th>
            <th className="px-3">Registros</th>
            <th className="px-3">Valor da operação</th>
            <th className="px-3">Base de cálculo</th>
            <th className="px-3">ICMS</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {linhas.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-fg-muted">Nenhuma operação neste grupo.</td></tr>}
          {linhas.map((l) => <tr key={`${l.cfop}-${l.cst}-${l.aliquota}`} className="border-b border-border-soft">
            <td className="px-3 font-medium text-fg">{l.cfop}</td>
            <td className="px-3 text-fg-secondary">{l.cst || "—"}</td>
            <td className="px-3">{aliquotaDeCentesimos(l.aliquota)}</td>
            <td className="px-3">{contagem(l.qtd)}</td>
            <td className="px-3">{reaisDeCentavos(l.valorOperacao)}</td>
            <td className="px-3">{reaisDeCentavos(l.valorBc)}</td>
            <td className="px-3">{reaisDeCentavos(l.valorIcms)}</td>
          </tr>)}
        </tbody>
        {linhas.length > 0 && <tfoot className="tabular-nums">
          <tr className="border-t border-border-strong font-semibold text-fg">
            <td className="px-3 py-3" colSpan={4}>Total</td>
            <td className="px-3">{reaisDeCentavos(total.op)}</td>
            <td className="px-3">{reaisDeCentavos(total.bc)}</td>
            <td className="px-3">{reaisDeCentavos(total.icms)}</td>
          </tr>
        </tfoot>}
      </table>
    </div>
  </div>;
}
