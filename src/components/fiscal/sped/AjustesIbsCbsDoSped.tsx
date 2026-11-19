"use client";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Button } from "@/components/ui/Button";
import { reaisExatos, somar } from "@/lib/fiscal/sped/local/dominio";
import type { AjusteIbsCbs } from "@/lib/fiscal/sped/local/calculo";
import { FINALIDADE_LABEL, chaveFormatada } from "@/lib/fiscal/finalidade";

/**
 * As notas de crédito e de débito da reforma (finNFe 5/6, 19/11/2026) na aba de
 * faturamento do SPED: ajustam só IBS/CBS da nota referenciada, e por isso ficam
 * fora do faturamento e da apuração de ICMS/IPI/PIS/COFINS. Aqui aparecem à
 * parte, para ninguém achar que sumiram. Recolhível que começa fechado, com a
 * contagem e os valores na linha (regra do Kauan, 08/10/2026). Sem nenhuma, não
 * aparece: o bloco vazio só ocuparia lugar na aba.
 */
export function AjustesIbsCbsDoSped({ ajustes, onAbrir }: { ajustes: AjusteIbsCbs[]; onAbrir: (documentoId: string) => void }) {
  if (!ajustes.length) return null;
  const soma = (valores: (string | null)[]) => {
    const lidos = valores.filter((v): v is string => v !== null);
    return lidos.length ? somar(lidos) : null;
  };
  const credito = ajustes.filter(a => a.finalidade === "5").length, debito = ajustes.length - credito;
  const contagem = [credito ? `${credito} de crédito` : null, debito ? `${debito} de débito` : null].filter(Boolean).join(" · ");
  const ibs = soma(ajustes.map(a => a.valorIbs)), cbs = soma(ajustes.map(a => a.valorCbs));
  return <BlocoRecolhivel
    titulo="Notas de crédito e de débito (IBS/CBS)"
    // No celular, só a contagem: a linha não cabe os dois valores, e eles estão na tabela.
    resumo={<span className="tnum">{contagem}<span className="hidden sm:inline"> · IBS {reaisExatos(ibs)} · CBS {reaisExatos(cbs)}</span></span>}
    className="bg-surface"
  >
    <div className="space-y-3 pb-1">
      <p className="text-ui text-fg-secondary">Ajustam só o IBS e a CBS da nota referenciada. Ficam fora do faturamento acima e da apuração de ICMS, IPI, PIS e COFINS, e não viram conta a pagar nem a receber.</p>
      <div className="c41-tabela overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full">
          <thead><tr>{["Nota", "Finalidade", "Motivo", "Valor", "IBS", "CBS", "Notas referenciadas", ""].map((c, i) => <th key={i} scope="col" className="px-3">{c}</th>)}</tr></thead>
          <tbody>{ajustes.map(a => <tr key={a.documentoId} className="border-b border-border-soft">
            <td className="px-3 align-top tnum">{a.numero}<span className="block text-helper text-fg-muted">{a.competencia}</span></td>
            <td className="px-3 align-top">{FINALIDADE_LABEL[a.finalidade]}</td>
            <td className="px-3 align-top">{a.motivo ?? <span className="text-fg-muted">Não informado</span>}</td>
            <td className="px-3 align-top tnum whitespace-nowrap">{reaisExatos(a.valor)}</td>
            <td className="px-3 align-top tnum whitespace-nowrap">{reaisExatos(a.valorIbs)}</td>
            <td className="px-3 align-top tnum whitespace-nowrap">{reaisExatos(a.valorCbs)}</td>
            <td className="px-3 align-top">{a.referenciadas.length ? <ul className="space-y-0.5">{a.referenciadas.map(c => <li key={c} className="max-w-[16rem] truncate font-mono text-helper" title={chaveFormatada(c)}>{chaveFormatada(c)}</li>)}</ul> : <span className="text-fg-muted">Nenhuma</span>}</td>
            <td className="px-3 align-top"><Button size="xs" variant="ghost" onClick={() => onAbrir(a.documentoId)} aria-label={`Detalhes da nota ${a.numero}`}>Detalhes</Button></td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  </BlocoRecolhivel>;
}
