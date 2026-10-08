import { Card } from "@/components/ui/Card";
import { Selo } from "@/components/ui/Selo";
import { formatInstantDate, formatarReaisDeCentavos } from "@/lib/format";
import { saoPauloParts } from "@/lib/agenda";
import type { TaxaNaTela } from "@/lib/societario/licencas-data";
import type { CustoDoProcesso } from "@/lib/societario/licencas";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { EnviarTaxaAoCliente } from "./EnviarTaxaAoCliente";
import { Aviso } from "@/components/ui/Aviso";


type Props = { taxas: TaxaNaTela[]; custo: CustoDoProcesso };

export function TaxasDoProcesso({ taxas, custo }: Props) {
  if (taxas.length === 0) return null;

  const aPagar = custo.totalCentavos - custo.pagoCentavos;

  return (
    <Card as="section" className="p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg">Taxas</h2>
        <p className="text-[length:var(--fs-ui)] tabular-nums text-fg">
          <strong>{formatarReaisDeCentavos(custo.totalCentavos)}</strong>
          {aPagar > 0 && <span className="text-warning"> · {formatarReaisDeCentavos(aPagar)} a pagar</span>}
        </p>
      </div>

      {/* O número que dá causa ao prazo: "trinta dias" sozinho não conta a
          história que "trinta dias e duas guias a mais" conta. */}
      {custo.custoDasVoltasCentavos > 0 && (
        <Aviso tom="atencao">
          <strong>{formatarReaisDeCentavos(custo.custoDasVoltasCentavos)}</strong> vieram de reapresentação — guia
          paga de novo porque o processo voltou.
        </Aviso>
      )}

      {/* Casco padrão, com funil (02/10/2026) — era uma tabela solta, à esquerda. */}
      <TabelaFiltravel
        linhas={taxas.map((t) => ({
          id: t.id,
          valores: {
            taxa: t.description,
            orgao: t.orgaoNome ?? "",
            vencimento: t.dueDate ? saoPauloParts(t.dueDate).dateKey : "",
            // "Paga" (a taxa), como na visão societária — o funil dizia "Pago".
            situacao: t.paidAt ? "Paga" : "Em aberto",
          },
        }))}
      >
      <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[560px] text-[length:var(--fs-ui)]">
          <thead>
            <tr className="text-[length:var(--fs-micro)] uppercase tracking-wide text-fg-muted border-b border-border">
              <th className="py-2 pr-3 font-medium"><FiltroDaColuna rotulo="Taxa" chave="taxa" /></th>
              <th className="py-2 pr-3 font-medium"><FiltroDaColuna rotulo="Órgão" chave="orgao" /></th>
              <th className="py-2 pr-3 font-medium"><FiltroDaColuna rotulo="Vencimento" chave="vencimento" tipo="data" /></th>
              <th className="py-2 pr-3 font-medium">Valor</th>
              <th className="py-2 font-medium"><FiltroDaColuna rotulo="Situação" chave="situacao" align="right" /></th>
            </tr>
          </thead>
          <tbody>
            {taxas.map((t) => (
              <LinhaFiltravel key={t.id} id={t.id} className="border-b border-border-soft">
                <td className="py-2.5 pr-3">
                  <span className="text-fg">{t.description}</span>
                  {/* Primeira via é o caminho normal; da segunda em diante é
                      volta, e é isso que o rótulo diz. */}
                  {t.attempt !== null && t.attempt >= 2 && (
                    <span className="block text-[length:var(--fs-micro)] text-warning">{t.attempt}ª apresentação</span>
                  )}
                  {t.envio && (
                    <div className="mt-2">
                      <EnviarTaxaAoCliente taxaId={t.id} descricao={t.description} envio={t.envio} />
                    </div>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-fg-muted">{t.orgaoNome ?? "—"}</td>
                <td className="py-2.5 pr-3 tabular-nums text-fg-secondary whitespace-nowrap">
                  {t.dueDate ? formatInstantDate(t.dueDate) : "—"}
                </td>
                <td className="py-2.5 pr-3 tabular-nums">{formatarReaisDeCentavos(t.amountCents)}</td>
                {/* A mesma leitura da visão societária (07/10/2026): Selo "Paga" /
                    "Em aberto", e o dia do pagamento embaixo. Era texto colorido
                    em minúscula aqui e Badge lá. */}
                <td className="py-2.5">
                  {t.paidAt ? (
                    <>
                      <Selo tom="sucesso">Paga</Selo>
                      <span className="block mt-1 text-[length:var(--fs-micro)] text-fg-muted">em {formatInstantDate(t.paidAt)}</span>
                    </>
                  ) : (
                    <Selo tom="atencao">Em aberto</Selo>
                  )}
                </td>
              </LinhaFiltravel>
            ))}
          </tbody>
        </table>
      </div>
      </TabelaFiltravel>
    </Card>
  );
}
