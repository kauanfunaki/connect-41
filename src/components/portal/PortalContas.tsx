import Link from "next/link";
import { notFound } from "next/navigation";
import { Wallet } from "lucide-react";
import { SeloDaAprovacao } from "@/components/aprovacoes/HistoricoDaAprovacao";
import { PageContainer } from "@/components/shared/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { PortalCabecalho } from "./PortalCabecalho";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { contasDoEscopo } from "@/lib/financeiro/consultas";
import { totalizar, type SituacaoDaConta } from "@/lib/financeiro/contas";
import { saoPauloParts } from "@/lib/agenda";
import { formatInstantDate } from "@/lib/format";
import { moeda } from "@/lib/financeiro/formato";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";

const SITUACAO: Record<SituacaoDaConta, { rotulo: string; variante: "danger" | "warning" | "info" | "success" }> = {
  VENCIDA: { rotulo: "Vencida", variante: "danger" },
  VENCE_HOJE: { rotulo: "Vence hoje", variante: "warning" },
  A_VENCER: { rotulo: "A vencer", variante: "info" },
  PAGA: { rotulo: "Liquidada", variante: "success" },
  CANCELADA: { rotulo: "Cancelada", variante: "info" },
};

/**
 * Contas a pagar ou a receber vistas pelo cliente.
 *
 * **Só leitura por construção**: não importa `AcoesDaConta` nem as actions de
 * baixa. As mesmas regras de situação e total da tela interna
 * (`situacaoDaConta`, `totalizar`), para o cliente e a equipe lerem o mesmo
 * "vencido".
 */
export async function PortalContas({ kind }: { kind: "PAGAR" | "RECEBER" }) {
  const { escopo, modulos } = await contextoFinanceiroDoPortal();
  const modulo = kind === "PAGAR" ? "bpo_contas_pagar" : "bpo_contas_receber";
  if (!modulos.has(modulo)) notFound();

  const hojeKey = saoPauloParts(new Date()).dateKey;
  const contas = await contasDoEscopo(escopo, kind, hojeKey);
  // A empresa do cliente só aparece quando o acesso cobre mais de uma — ele
  // sabe quem é; repetir o próprio nome em toda linha só empurrava o resto.
  const variasEmpresas = new Set(contas.map((c) => c.empresaNome)).size > 1;
  const totais = totalizar(contas);
  const aPagar = kind === "PAGAR";
  // A aprovação é de conta a pagar; o link só existe se a tela de aprovações existir para este cliente.
  const linkDaAprovacao = aPagar && modulos.has("bpo_aprovacoes");

  return (
    <PageContainer>
      <PortalCabecalho
        titulo={aPagar ? "Contas a pagar" : "Contas a receber"}
        descricao={aPagar ? "O que suas empresas têm a pagar." : "O que suas empresas têm a receber."}
      />

      <FaixaDeTotais
        itens={[
          { rotulo: "Em aberto", valor: moeda(totais.emAberto) },
          { rotulo: "Vencido", valor: moeda(totais.vencido), tom: totais.vencido > 0 ? "text-danger" : "" },
          { rotulo: "Vence hoje", valor: moeda(totais.venceHoje) },
          { rotulo: aPagar ? "Pago" : "Recebido", valor: moeda(totais.pago), tom: "text-fg-muted" },
        ]}
      />

      {contas.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Wallet />}
            title={aPagar ? "Nenhuma conta a pagar" : "Nenhuma conta a receber"}
            description={
              aPagar
                ? "Quando a equipe lançar as contas da sua empresa, elas aparecem aqui com o vencimento e a situação."
                : "Quando a equipe lançar o que sua empresa tem a receber, aparece aqui com o vencimento e a situação."
            }
          />
        </Card>
      ) : (
        <>
        {/* Abaixo de md, cartões. O portal é a tela que o cliente abre no
            celular — a tabela de 760px obrigava a rolar de lado para chegar ao
            valor, que é o que ele veio ver. */}
        <CartoesNoCelular>
          {contas.map((c) => (
            <Cartao key={c.id}>
              <TopoDoCartao nome={c.contraparteNome} valor={moeda(c.valorCentavos)} />
              {c.descricao && <InfoDoCartao className="break-words">{c.descricao}</InfoDoCartao>}
              <InfoDoCartao className="mt-1 tabular-nums">
                vence {formatInstantDate(c.vencimento)}
                {c.pagoEm && ` · liquidada em ${formatInstantDate(c.pagoEm)}`}
              </InfoDoCartao>
              {(variasEmpresas || c.categoriaNome) && (
                <InfoDoCartao className="break-words">
                  {[variasEmpresas ? c.empresaNome : null, c.categoriaNome].filter(Boolean).join(" · ")}
                </InfoDoCartao>
              )}
              <PeDoCartao>
                <Badge variant={SITUACAO[c.situacao].variante}>{SITUACAO[c.situacao].rotulo}</Badge>
                {c.aprovacao &&
                  (c.aprovacao === "AGUARDANDO" && linkDaAprovacao ? (
                    <Link href="/portal/aprovacoes" className="inline-flex" title="Abrir as aprovações">
                      <SeloDaAprovacao status={c.aprovacao} />
                    </Link>
                  ) : (
                    <SeloDaAprovacao status={c.aprovacao} />
                  ))}
              </PeDoCartao>
            </Cartao>
          ))}
        </CartoesNoCelular>

        {/* Funil nas colunas (02/10), como na tela da equipe: a lista vem
            inteira (até 500), então filtra no navegador. A empresa entra no
            funil da contraparte só quando aparece na célula. */}
        <TabelaFiltravel
          linhas={contas.map((c) => ({
            id: c.id,
            valores: {
              vencimento: c.vencimentoKey,
              contraparte: c.contraparteNome,
              empresa: c.empresaNome,
              categoria: c.categoriaNome ?? "",
              situacao: SITUACAO[c.situacao].rotulo,
            },
          }))}
        >
        <TabelaNoDesktop padrao>
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                <th className="py-2 pr-3 font-medium">
                  <FiltroDaColuna rotulo="Vencimento" chave="vencimento" tipo="data" />
                </th>
                <th className="py-2 pr-3 font-medium">
                  <FiltroDaColuna
                    rotulo={aPagar ? "Fornecedor" : "Cliente"}
                    campos={[
                      { chave: "contraparte", rotulo: aPagar ? "Fornecedor" : "Cliente" },
                      ...(variasEmpresas ? [{ chave: "empresa", rotulo: "Empresa" }] : []),
                    ]}
                  />
                </th>
                <th className="py-2 pr-3 font-medium">
                  <FiltroDaColuna rotulo="Categoria" chave="categoria" />
                </th>
                <th className="py-2 pr-3 font-medium">Valor</th>
                <th className="py-2 font-medium">
                  <FiltroDaColuna rotulo="Situação" chave="situacao" align="right" />
                </th>
              </tr>
            </thead>
            <tbody>
              {contas.map((c) => (
                <LinhaFiltravel key={c.id} id={c.id} className="border-b border-border-soft">
                  <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap">
                    {formatInstantDate(c.vencimento)}
                    {c.pagoEm && <span className="block text-[11px] text-fg-muted">liquidada em {formatInstantDate(c.pagoEm)}</span>}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="font-medium">{c.contraparteNome}</span>
                    {c.descricao && <span className="block text-[11px] text-fg-muted truncate max-w-[240px]">{c.descricao}</span>}
                    {variasEmpresas && <span className="block text-[11px] text-fg-muted truncate max-w-[240px]">{c.empresaNome}</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-fg-secondary">{c.categoriaNome ?? "—"}</td>
                  <td className="py-2.5 pr-3 tabular-nums font-medium">{moeda(c.valorCentavos)}</td>
                  <td className="py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={SITUACAO[c.situacao].variante}>{SITUACAO[c.situacao].rotulo}</Badge>
                      {/* O mesmo selo que a equipe vê: "vencida" sem ele parece descuido do
                          escritório, quando a conta está esperando a aprovação do próprio cliente. */}
                      {c.aprovacao &&
                        (c.aprovacao === "AGUARDANDO" && linkDaAprovacao ? (
                          <Link href="/portal/aprovacoes" className="inline-flex" title="Abrir as aprovações">
                            <SeloDaAprovacao status={c.aprovacao} />
                          </Link>
                        ) : (
                          <SeloDaAprovacao status={c.aprovacao} />
                        ))}
                    </div>
                  </td>
                </LinhaFiltravel>
              ))}
            </tbody>
          </table>
        </TabelaNoDesktop>
        </TabelaFiltravel>

        {contas.length >= 500 && (
          <p className="text-[11px] text-fg-muted mt-3">Mostrando as 500 contas de vencimento mais recente.</p>
        )}
        </>
      )}
    </PageContainer>
  );
}
