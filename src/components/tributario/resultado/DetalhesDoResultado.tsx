"use client";

// Os detalhes do resultado (o `StudyResultDetails` do Connect Tributário): a
// transição 2027–2033 com exportação em CSV e, quando os quatro cenários têm
// dados, o consumo, a memória de cálculo e encargos e a sensibilidade aos créditos.

import { useMemo } from "react";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { assess } from "@/lib/tributario/avaliacao/assessment";
import type { Study } from "@/lib/tributario/avaliacao/model";
import { brl, years } from "@/lib/tributario/motor/fiscal";
import { linhasDaTransicao, nomeDoArquivoDaTransicao } from "@/lib/tributario/relatorio";
import { baixarCsv } from "../baixarArquivo";
import { NOTA, PAINEL } from "../estilos";
import { MemoriaDetalhada, Sensibilidade } from "../premissas/ControlesDoSimples";
import { MemoriaDaFolha } from "../premissas/ControlesDaFolha";
import { MemoriaDasAtividades } from "../premissas/AtividadesDaAvaliacao";
import { GraficoDaTransicao } from "./GraficoDaTransicao";
import { ResumoDoConsumo } from "./ResumoDoConsumo";

export function DetalhesDoResultado({ estudo, ano, onAno }: { estudo: Study; ano: number; onAno: (ano: number) => void }) {
  const atual = useMemo(() => assess(estudo, [], ano), [estudo, ano]);
  const todos = useMemo(() => years.map((y) => ({ year: y, assessment: assess(estudo, [], y) })), [estudo]);
  const completo = atual.cards.every((c) => c.value !== null);
  const dados = atual.legacyData;

  return (
    <div className="space-y-4">
      <GraficoDaTransicao
        rows={todos.map((x) => ({ year: x.year, values: x.assessment.cards.map((c) => c.value) }))}
        labels={atual.cards.map((c) => c.name)}
        exclusions={[null, null, null, null]}
        year={ano}
        onYear={(v) => onAno(Number(v))}
        valid
        includesPayroll
        onExport={() => baixarCsv(nomeDoArquivoDaTransicao(estudo), linhasDaTransicao(estudo))}
      />
      {completo ? (
        <>
          <ResumoDoConsumo d={dados} year={ano} valid />
          <BlocoRecolhivel titulo="Memória de cálculo e encargos" className={PAINEL} classeDoConteudo="space-y-4 px-4 pb-4">
            <p className={NOTA}>
              Esta memória usa os mesmos dados e o mesmo ano do comparativo acima.
              {atual.manualPayroll > 0 ? ` Encargos manuais de ${brl(atual.manualPayroll)} estão incluídos em cada regime.` : ""}
            </p>
            <MemoriaDetalhada d={dados} year={ano} />
            <MemoriaDaFolha d={dados} year={ano} />
            {dados.activities.enabled && <MemoriaDasAtividades d={dados} year={ano} />}
          </BlocoRecolhivel>
          <BlocoRecolhivel titulo="Sensibilidade aos créditos" className={PAINEL} classeDoConteudo="px-4 pb-4">
            <Sensibilidade d={dados} year={ano} />
          </BlocoRecolhivel>
        </>
      ) : (
        <p className={NOTA}>
          A memória completa e a sensibilidade serão liberadas quando os quatro cenários tiverem dados suficientes. A tabela da
          transição identifica as pendências por ano no CSV.
        </p>
      )}
    </div>
  );
}
