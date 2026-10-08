import Link from "next/link";
import { notFound } from "next/navigation";
import { Wallet } from "lucide-react";
import { SeloDaAprovacao } from "@/components/aprovacoes/HistoricoDaAprovacao";
import { PageContainer } from "@/components/shared/PageContainer";
import { Badge, type VarianteDoBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { PortalCabecalho } from "./PortalCabecalho";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { contasDoEscopo, totaisDoEscopo } from "@/lib/financeiro/consultas";
import type { SituacaoDaConta } from "@/lib/financeiro/contas";
import { saoPauloParts } from "@/lib/agenda";
import { formatInstantDate } from "@/lib/format";
import { moeda } from "@/lib/financeiro/formato";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";

// Os nomes da equipe (`ContasTable`), para o cliente e o escritório falarem
// da mesma conta com a mesma palavra (07/10/2026): era "Liquidada", ao lado do
// cartão "Pago"/"Recebido" da própria tela. A conta a receber é "Recebida".
// Cancelada no selo neutro: no azul do `info`, era a mesma cor de "A vencer"
// na mesma coluna. O mapa é daqui, e não importado de `ContasTable`, que traz
// as ações de baixa — esta tela é só leitura por construção.
const SITUACAO: Record<SituacaoDaConta, { rotulo: string; variante: VarianteDoBadge }> = {
  VENCIDA: { rotulo: "Vencida", variante: "danger" },
  VENCE_HOJE: { rotulo: "Vence hoje", variante: "warning" },
  A_VENCER: { rotulo: "A vencer", variante: "info" },
  PAGA: { rotulo: "Paga", variante: "success" },
  CANCELADA: { rotulo: "Cancelada", variante: "neutral" },
};

/** O limite da consulta (`contasDoEscopo`): as 500 de vencimento mais recente. */
const LIMITE = 500;

/**
 * Contas a pagar ou a receber vistas pelo cliente.
 *
 * **Só leitura por construção**: não importa `AcoesDaConta` nem as actions de
 * baixa. As mesmas regras de situação e total da tela interna
 * (`situacaoDaConta`, `totalizar`), para o cliente e a equipe lerem o mesmo
 * "vencido".
 *
 * Os totais do topo são somados no banco, sobre todas as contas do escopo
 * (07/10) — eram a soma da lista, que para nas 500 de vencimento mais recente.
 */
export async function PortalContas({ kind }: { kind: "PAGAR" | "RECEBER" }) {
  const { escopo, modulos } = await contextoFinanceiroDoPortal();
  const modulo = kind === "PAGAR" ? "bpo_contas_pagar" : "bpo_contas_receber";
  if (!modulos.has(modulo)) notFound();

  const hojeKey = saoPauloParts(new Date()).dateKey;
  const [contas, totais] = await Promise.all([contasDoEscopo(escopo, kind, hojeKey), totaisDoEscopo(escopo, kind, hojeKey)]);
  // A empresa do cliente só aparece quando o acesso cobre mais de uma — ele
  // sabe quem é; repetir o próprio nome em toda linha só empurrava o resto.
  const variasEmpresas = new Set(contas.map((c) => c.empresaNome)).size > 1;
  const aPagar = kind === "PAGAR";
  // A aprovação é de conta a pagar; o link só existe se a tela de aprovações existir para este cliente.
  const linkDaAprovacao = aPagar && modulos.has("bpo_aprovacoes");
  const rotuloDa = (s: SituacaoDaConta) => (s === "PAGA" && !aPagar ? "Recebida" : SITUACAO[s].rotulo);
  const quitadaEm = aPagar ? "pago em" : "recebido em";

  return (
    <PageContainer>
      <PortalCabecalho
        titulo={aPagar ? "Contas a pagar" : "Contas a receber"}
        descricao={aPagar ? "O que suas empresas têm a pagar." : "O que suas empresas têm a receber."}
      />

      {/* O tom de cada cartão é o da tela da equipe (07/10): vencido e o que
          vence hoje só ganham cor acima de zero; o pago é neutro e diz desde
          quando soma — sem isso, "Pago R$ 10.483,00" não dizia de quando. */}
      <FaixaDeTotais
        itens={[
          { rotulo: "Em aberto", valor: moeda(totais.emAberto) },
          { rotulo: "Vencido", valor: moeda(totais.vencido), tom: totais.vencido > 0 ? "text-danger" : undefined },
          { rotulo: "Vence hoje", valor: moeda(totais.venceHoje), tom: totais.venceHoje > 0 ? "text-warning" : undefined },
          {
            rotulo: aPagar ? "Pago" : "Recebido",
            valor: moeda(totais.pago),
            tom: "text-fg-muted",
            detalhe: totais.pagoDesde ? `desde ${formatInstantDate(totais.pagoDesde, { month: "2-digit", year: "numeric" })}` : undefined,
          },
        ]}
      />

      {/* No casco da tabela (07/10/2026), como Pendências do portal e a tela da
          equipe: a contagem na barra e a lista vazia dentro dele. */}
      <CascoDaTabela contagem={contarItens(contas.length, "conta", "contas", contas.length >= LIMITE)}>
      {contas.length === 0 ? (
        <EmptyState
          icon={<Wallet />}
          title={aPagar ? "Nenhuma conta a pagar" : "Nenhuma conta a receber"}
          description={
            aPagar
              ? "Quando a equipe lançar as contas da sua empresa, elas aparecem aqui com o vencimento e a situação."
              : "Quando a equipe lançar o que sua empresa tem a receber, aparece aqui com o vencimento e a situação."
          }
        />
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
                {c.pagoEm && ` · ${quitadaEm} ${formatInstantDate(c.pagoEm)}`}
              </InfoDoCartao>
              {(variasEmpresas || c.categoriaNome) && (
                <InfoDoCartao className="break-words">
                  {[variasEmpresas ? c.empresaNome : null, c.categoriaNome].filter(Boolean).join(" · ")}
                </InfoDoCartao>
              )}
              <PeDoCartao>
                <Badge variant={SITUACAO[c.situacao].variante}>{rotuloDa(c.situacao)}</Badge>
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
              situacao: rotuloDa(c.situacao),
            },
          }))}
        >
        <TabelaNoDesktop padrao>
          <table className="w-full min-w-[720px] text-ui">
            <thead>
              <tr>
                <th className="py-2 pr-3">
                  <FiltroDaColuna rotulo="Vencimento" chave="vencimento" tipo="data" />
                </th>
                <th className="py-2 pr-3">
                  <FiltroDaColuna
                    rotulo={aPagar ? "Fornecedor" : "Cliente"}
                    campos={[
                      { chave: "contraparte", rotulo: aPagar ? "Fornecedor" : "Cliente" },
                      ...(variasEmpresas ? [{ chave: "empresa", rotulo: "Empresa" }] : []),
                    ]}
                  />
                </th>
                <th className="py-2 pr-3">
                  <FiltroDaColuna rotulo="Categoria" chave="categoria" />
                </th>
                <th className="py-2 pr-3">Valor</th>
                <th className="py-2">
                  <FiltroDaColuna rotulo="Situação" chave="situacao" align="right" />
                </th>
              </tr>
            </thead>
            <tbody>
              {contas.map((c) => (
                <LinhaFiltravel key={c.id} id={c.id} className="border-b border-border-soft">
                  <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap">
                    {formatInstantDate(c.vencimento)}
                    {c.pagoEm && <span className="block text-micro text-fg-muted">{quitadaEm} {formatInstantDate(c.pagoEm)}</span>}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="font-medium">{c.contraparteNome}</span>
                    {c.descricao && <span className="block text-micro text-fg-muted truncate max-w-[240px]">{c.descricao}</span>}
                    {variasEmpresas && <span className="block text-micro text-fg-muted truncate max-w-[240px]">{c.empresaNome}</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-fg-secondary">{c.categoriaNome ?? "—"}</td>
                  <td className="py-2.5 pr-3 tabular-nums font-medium">{moeda(c.valorCentavos)}</td>
                  <td className="py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={SITUACAO[c.situacao].variante}>{rotuloDa(c.situacao)}</Badge>
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

        {/* Filho direto do casco: no computador vira o pé do cartão. */}
        {contas.length >= LIMITE && (
          <p className="text-helper text-fg-muted mt-3">
            Mostrando as {LIMITE} contas de vencimento mais recente. Os totais do topo somam todas.
          </p>
        )}
        </>
      )}
      </CascoDaTabela>
    </PageContainer>
  );
}
