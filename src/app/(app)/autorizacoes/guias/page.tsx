import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileText, Send } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { NotaDeFonte } from "@/components/shared/NotaDeFonte";
import { EmptyState } from "@/components/ui/EmptyState";
import { CampoMes } from "@/components/ui/CampoMes";
import { Button } from "@/components/ui/Button";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { GuiaPaga } from "@/components/autorizacoes/GuiaPaga";
import { getAuthContext } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { acessoAsAutorizacoes } from "@/lib/autorizacoes/servidor";
import { guiasDoMes } from "@/lib/guias/servidor";
import { contarPorSituacao, ROTULO_DA_SITUACAO, type SituacaoDaGuia } from "@/lib/guias/situacao";
import { rotaDeEnviarOArquivo, rotaDoEnvio } from "@/lib/envios/regras";
import { hojeIso, dataBR } from "@/lib/datas/calendario";
import { moeda } from "@/lib/financeiro/formato";
import { formatarCompetencia } from "@/lib/format";

export const dynamic = "force-dynamic";

const TOM: Record<SituacaoDaGuia, TomDoSelo> = { VENCIDA: "perigo", EMITIDA: "atencao", ENVIADA: "marca", ABERTA: "marca", PAGA: "sucesso" };

/**
 * As guias do mês (Guias pelo Connect, 28/10/2026): as guias emitidas pelo
 * Connect que vencem no mês, com a situação de cada uma — emitida, enviada,
 * aberta pelo cliente, paga ou vencida — e o que fazer com ela.
 */
export default async function GuiasDoMesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getAuthContext();
  const acesso = await acessoAsAutorizacoes(ctx);
  if (!acesso) notFound();

  const params = await searchParams;
  const hoje = hojeIso();
  const mes = params.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes) ? params.mes : hoje.slice(0, 7);
  const guias = await guiasDoMes(acesso.tenantId, mes, hoje, await scopedCompanyWhere(ctx));
  const conta = contarPorSituacao(guias.map((g) => g.situacao));
  const aPagar = guias.filter((g) => g.situacao !== "PAGA").reduce((s, g) => s + (g.valorCentavos ?? 0), 0);
  // As vencidas primeiro; depois a ordem do vencimento, que já vem do banco.
  const ordenadas = [...guias].sort((a, b) => Number(b.situacao === "VENCIDA") - Number(a.situacao === "VENCIDA"));

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Autorizações de acesso", href: "/autorizacoes" }, { label: "Guias do mês" }]} />
      <PageHeader
        title="Guias do mês"
        subtitle="As guias emitidas pelo Connect que vencem no mês, e onde cada uma está: emitida, enviada, aberta pelo cliente, paga ou vencida."
        action={
          <form method="get" action="/autorizacoes/guias" className="flex items-center gap-2">
            <CampoMes compact name="mes" defaultValue={mes} className="w-40" aria-label="Mês" />
            <Button type="submit" variant="secondary" size="sm">
              Aplicar
            </Button>
          </form>
        }
      />

      <FaixaDeTotais
        className="mb-6"
        itens={[
          { rotulo: "A pagar no mês", valor: moeda(aPagar), detalhe: `${guias.length - conta.PAGA} de ${guias.length} guias`, icone: <FileText /> },
          { rotulo: "Vencidas", valor: String(conta.VENCIDA), tom: conta.VENCIDA > 0 ? "text-danger" : undefined, icone: <AlertTriangle /> },
          { rotulo: "Sem envio ao cliente", valor: String(conta.EMITIDA), icone: <Send /> },
          { rotulo: "Pagas", valor: String(conta.PAGA), detalhe: `${conta.ABERTA} abertas e ${conta.ENVIADA} só enviadas`, icone: <CheckCircle2 /> },
        ]}
      />

      {guias.length === 0 ? (
        <EmptyState
          title="Nenhuma guia neste mês"
          description="As guias entram aqui quando são emitidas pelo Connect, em Emitir guia na ficha da empresa."
          icon={<FileText />}
        />
      ) : (
        <div className="c41-tabela overflow-x-auto bg-surface border border-border rounded-lg">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border">
                <th className="py-2 pr-3 font-medium">Vencimento</th>
                <th className="py-2 pr-3 font-medium">Empresa</th>
                <th className="py-2 pr-3 font-medium">Guia</th>
                <th className="py-2 pr-3 font-medium">Valor</th>
                <th className="py-2 pr-3 font-medium">Situação</th>
                <th className="py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((g) => (
                <tr key={g.id} className="border-b border-border-soft">
                  <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                    {g.vencimento ? dataBR(g.vencimento) : "—"}
                    {g.validoAte && g.validoAte !== g.vencimento && <span className="block text-micro text-fg-muted">pagável até {dataBR(g.validoAte)}</span>}
                  </td>
                  <td className="py-2 pr-3">{g.empresa}</td>
                  <td className="py-2 pr-3">
                    {g.descricao}
                    {g.competencia && <span className="block text-micro text-fg-muted">competência {formatarCompetencia(g.competencia)}</span>}
                  </td>
                  <td className="py-2 pr-3 tabular-nums whitespace-nowrap">{g.valorCentavos === null ? "—" : moeda(g.valorCentavos)}</td>
                  <td className="py-2 pr-3">
                    <Selo tom={TOM[g.situacao]}>{ROTULO_DA_SITUACAO[g.situacao]}</Selo>
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {g.arquivoId && (
                        <a href={`/api/arquivos/${g.arquivoId}?ver=1`} target="_blank" rel="noreferrer" className="text-ui text-brand underline">
                          PDF
                        </a>
                      )}
                      {g.envioId ? (
                        <a href={rotaDoEnvio(g.envioId)} className="text-ui text-brand underline">
                          Ver envio
                        </a>
                      ) : (
                        g.arquivoId &&
                        acesso.podeEditar &&
                        g.situacao !== "PAGA" && (
                          <a href={rotaDeEnviarOArquivo(g.companyId, g.arquivoId)} className="text-ui text-brand underline">
                            Enviar ao cliente
                          </a>
                        )
                      )}
                      {acesso.podeEditar && <GuiaPaga guiaId={g.id} paga={g.situacao === "PAGA"} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NotaDeFonte>
        Entram as guias emitidas pelo Connect a partir de 28/10/2026 (DAS, DAS do MEI, DCTFWeb, DARF e parcela), no mês do vencimento; a
        DCTFWeb e a parcela, que o Serpro não devolve com vencimento, entram no mês da competência. &quot;Enviada&quot; é o envio ao cliente
        publicado, e &quot;aberta&quot;, quando alguém do cliente abriu pelo portal ou pelo link do e-mail. Vencida é a que passou do último dia
        em que o banco aceita a guia. O pagamento é marcado à mão: o Connect ainda não lê o pagamento no extrato. As guias que o Serpro não
        gera (FGTS, ICMS, ISS) ainda não entram.
      </NotaDeFonte>
    </PageContainer>
  );
}
