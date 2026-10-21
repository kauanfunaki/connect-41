import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { NotaDeFonte } from "@/components/shared/NotaDeFonte";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { CampoMes } from "@/components/ui/CampoMes";
import { Button } from "@/components/ui/Button";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { saoPauloParts } from "@/lib/agenda";
import { CartoesNoCelular, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { getAuthContext } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { acessoAsAutorizacoes } from "@/lib/autorizacoes/servidor";
import { configuracaoDoSerpro, consumoDoMes, prontidaoDoSerpro } from "@/lib/serpro/cliente";
import { reais, ROTULO_DO_TIPO, TIPOS_DE_COBRANCA } from "@/lib/serpro/regras";
import { formatCnpj, formatCpf, formatInstantDateTime, formatarNumero } from "@/lib/format";
import { hojeIso } from "@/lib/datas/calendario";
import { Gauge, Receipt, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeDoMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;

/**
 * Quanto o Serpro já custou no mês: chamadas cobradas por tipo, a faixa
 * atingida, o custo estimado e o teto. A fatura de verdade é a do Serpro;
 * aqui é a conta pela tabela da Loja, com a faixa valendo para o mês inteiro.
 */
export default async function ConsumoDoSerproPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const acesso = await acessoAsAutorizacoes(await getAuthContext());
  if (!acesso) notFound();
  const cfg = await configuracaoDoSerpro(acesso.tenantId);
  if (!cfg) notFound();

  const params = await searchParams;
  const atual = hojeIso().slice(0, 7);
  const mes = params.mes && /^\d{4}-\d{2}$/.test(params.mes) && params.mes <= atual ? params.mes : atual;
  const [consumo, chamadas] = await Promise.all([
    consumoDoMes(acesso.tenantId, mes),
    getPrisma().serproCall.findMany({
      where: { tenantId: acesso.tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, createdAt: true, caminho: true, idServico: true, contribuinte: true, httpStatus: true, cobrada: true, mensagens: true, origem: true, ambiente: true },
    }),
  ]);
  const teto = cfg.tetoCentavos;
  const usado = teto ? Math.round((consumo.custo.totalCentavos / teto) * 100) : null;
  const pronta = prontidaoDoSerpro(cfg);
  // A demonstração (20/10/2026) não entra no custo nem no teto: as chamadas dela aparecem na lista, marcadas.
  const cobranca = (c: { cobrada: boolean; ambiente: string }) =>
    c.ambiente === "DEMONSTRACAO" ? <Selo tom="marca">Demonstração</Selo> : c.cobrada ? <Selo tom="atencao">Cobrada</Selo> : <Selo tom="neutro">Grátis</Selo>;

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Autorizações de acesso", href: "/autorizacoes" }, { label: "Consumo do Serpro" }]} />
      <PageHeader
        title="Consumo do Serpro"
        subtitle="As chamadas cobradas do mês e o custo estimado pela tabela da Loja do Serpro. A fatura que vale é a do Serpro."
        meta={
          cfg.ambiente === "demonstracao" ? (
            <>
              <Selo tom="atencao">Demonstração</Selo>
              <span>A conexão está no ambiente de testes do Serpro: as chamadas dele não entram no custo nem no teto.</span>
            </>
          ) : undefined
        }
      />

      {!pronta.pronta && (
        <Aviso tom="atencao" className="mb-4">
          {pronta.motivo}
        </Aviso>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-section font-semibold text-fg first-letter:uppercase">{nomeDoMes(mes)}</h2>
        {/* O seletor de mês do Connect, por GET como o `FiltroDePeriodo`
            (15/10/2026): eram "‹ Mês anterior" e "Este mês ›" em links de texto. */}
        <form method="get" action="/autorizacoes/consumo" className="flex items-center gap-2">
          <CampoMes compact name="mes" defaultValue={mes} max={atual} className="w-40" aria-label="Mês" />
          <Button type="submit" variant="secondary" size="sm">
            Aplicar
          </Button>
        </form>
      </div>

      {/* A faixa de totais, com o custo estimado no cartão azul de número
          principal (15/10/2026): eram MetricCard soltos numa grade própria. */}
      <FaixaDeTotais
        className="mb-6"
        itens={[
          { rotulo: "Custo estimado", valor: reais(consumo.custo.totalCentavos), icone: <Receipt /> },
          {
            rotulo: "Teto do mês",
            valor: teto ? reais(teto) : "—",
            detalhe: usado !== null ? `${usado}% usado` : undefined,
            tom: usado !== null && usado >= 100 ? "text-danger" : usado !== null && usado >= 80 ? "text-warning-fg" : undefined,
            icone: <Gauge />,
          },
          {
            rotulo: "Chamadas cobradas",
            valor: formatarNumero(TIPOS_DE_COBRANCA.reduce((n, t) => n + consumo.contagem[t], 0), 0),
            icone: <ShieldCheck />,
          },
        ]}
      />

      <Card className="p-5 mb-6">
        <h2 className="text-section font-semibold text-fg mb-3">Por tipo</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-ui">
            <thead>
              <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border text-left">
                <th className="py-2 pr-3 font-medium">Tipo</th>
                <th className="py-2 pr-3 font-medium text-right">Chamadas</th>
                <th className="py-2 pr-3 font-medium text-right">Faixa</th>
                <th className="py-2 pr-3 font-medium text-right">Preço</th>
                <th className="py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {TIPOS_DE_COBRANCA.map((t) => {
                const c = consumo.custo.porTipo[t];
                return (
                  <tr key={t} className="border-b border-border-soft tabular-nums">
                    <td className="py-2 pr-3">{ROTULO_DO_TIPO[t]}</td>
                    <td className="py-2 pr-3 text-right">{c.quantidade}</td>
                    <td className="py-2 pr-3 text-right">{c.faixa}</td>
                    <td className="py-2 pr-3 text-right">{reais(c.centavos)}</td>
                    <td className="py-2 text-right font-medium">{reais(c.totalCentavos)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <NotaDeFonte>
          Cobradas são as respostas 200, 202 e 403 de consultas, emissões e declarações — inclusive o 403 de cliente sem autorização. A faixa
          atingida no mês vale para todas as chamadas daquele tipo (regra a confirmar no contrato).
        </NotaDeFonte>
      </Card>

      <h2 className="text-section font-semibold text-fg mb-3">Últimas chamadas</h2>
      {/* No casco, na tabela padrão e com funil no Serviço e na Resposta, que
          repetem valor (15/10/2026): era uma tabela à mão, de cabeçalho cinza. */}
      <CascoDaTabela contagem={contarItens(chamadas.length, "chamada", "chamadas")}>
        {chamadas.length === 0 ? (
          <EmptyState title="Nenhuma chamada ainda" description="As chamadas ao Serpro aparecem aqui, cobradas ou não." icon={<ShieldCheck />} />
        ) : (
          <>
            {/* No celular, um cartão por chamada (15/10/2026): a tabela de 820px
                rolava de lado. */}
            <CartoesNoCelular>
              {chamadas.map((c) => (
                <Cartao key={c.id}>
                  <TopoDoCartao nome={c.idServico} valor={<span className="font-normal text-fg-muted">{c.httpStatus ?? "—"}</span>} />
                  <InfoDoCartao>
                    {c.caminho} · {c.origem}
                  </InfoDoCartao>
                  <InfoDoCartao className="tabular-nums">
                    {formatInstantDateTime(c.createdAt)} · {c.contribuinte.length === 11 ? formatCpf(c.contribuinte) : formatCnpj(c.contribuinte)}
                  </InfoDoCartao>
                  {c.mensagens && <InfoDoCartao className="mt-1">{c.mensagens}</InfoDoCartao>}
                  <PeDoCartao>{cobranca(c)}</PeDoCartao>
                </Cartao>
              ))}
            </CartoesNoCelular>
            <TabelaFiltravel
              linhas={chamadas.map((c) => ({
                id: c.id,
                valores: {
                  quando: saoPauloParts(c.createdAt).dateKey,
                  servico: c.idServico,
                  origem: c.origem,
                  resposta: c.httpStatus === null ? "" : String(c.httpStatus),
                  cobranca: c.ambiente === "DEMONSTRACAO" ? "Demonstração" : c.cobrada ? "Cobrada" : "Grátis",
                },
              }))}
            >
              <div className="c41-tabela scroll-x overflow-x-auto bg-surface border border-border rounded-lg hidden md:block">
                <table className="w-full min-w-[820px]">
                  <thead>
                    <tr>
                      <th className="px-3">
                        <FiltroDaColuna rotulo="Quando" chave="quando" tipo="data" />
                      </th>
                      <th className="px-3">
                        <FiltroDaColuna
                          rotulo="Serviço"
                          campos={[
                            { chave: "servico", rotulo: "Serviço" },
                            { chave: "origem", rotulo: "Origem" },
                          ]}
                        />
                      </th>
                      <th className="px-3">Contribuinte</th>
                      <th className="px-3">
                        <FiltroDaColuna
                          rotulo="Resposta"
                          campos={[
                            { chave: "resposta", rotulo: "Resposta" },
                            { chave: "cobranca", rotulo: "Cobrança" },
                          ]}
                        />
                      </th>
                      <th className="px-3">Mensagens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chamadas.map((c) => (
                      <LinhaFiltravel key={c.id} id={c.id} className="border-b border-border-soft align-top">
                        <td className="px-3 tabular-nums whitespace-nowrap">{formatInstantDateTime(c.createdAt)}</td>
                        <td className="px-3">
                          {c.idServico}
                          <span className="block text-micro text-fg-muted">
                            {c.caminho} · {c.origem}
                          </span>
                        </td>
                        <td className="px-3 tabular-nums text-fg-secondary">{c.contribuinte.length === 11 ? formatCpf(c.contribuinte) : formatCnpj(c.contribuinte)}</td>
                        <td className="px-3">
                          <span className="tabular-nums">{c.httpStatus ?? "—"}</span>{" "}
                          {cobranca(c)}
                        </td>
                        <td className="px-3 text-fg-muted break-words">{c.mensagens ?? "—"}</td>
                      </LinhaFiltravel>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabelaFiltravel>
          </>
        )}
      </CascoDaTabela>
    </PageContainer>
  );
}
