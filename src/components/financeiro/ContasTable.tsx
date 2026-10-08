import Link from "next/link";
import { FileText, AlertCircle } from "lucide-react";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { Badge, type VarianteDoBadge } from "@/components/ui/Badge";
import { TOM_DA_SITUACAO, tomDoFechamento } from "./tomDaSituacao";
import { EmptyState } from "@/components/ui/EmptyState";
// Dinheiro e competência pelos helpers de `lib/format` (08/10/2026): a
// competência era "09/2026" só aqui, e "Out/26" na DRE, no fluxo e no portal.
import { formatInstantDate, formatarCompetencia, formatarReaisDeCentavos } from "@/lib/format";
import type { SituacaoDaConta } from "@/lib/financeiro/contas";
import type { LinhaDaConta, TipoDeConta } from "@/lib/financeiro/data";
import { AcoesDaConta } from "./AcoesDaConta";
import { conferirConta, marcarComoPago, desfazerPagamento } from "@/lib/financeiro/acoes";
import { enviarParaAprovacao } from "@/app/(app)/aprovacoes/actions";
import { SeloDaAprovacao } from "@/components/aprovacoes/HistoricoDaAprovacao";
import { motivoDoBloqueioDeBaixa, podeEnviarParaAprovacao, seloDeAprovacaoVisivel } from "@/lib/financeiro/aprovacao/regras";
import { SeloDaCobranca } from "@/components/cobranca/SeloDaCobranca";
import type { SituacaoDeCobranca } from "@/lib/financeiro/cobranca/regras";
import { Checkbox } from "@/components/ui/Checkbox";
// Constante de módulo comum, e não do componente de cliente: importada de um
// arquivo "use client", chegaria aqui como referência de cliente, não string.
import { FORM_DO_CENTRO } from "@/lib/financeiro/centroDeCusto";
import { MarcarTodasAsContas } from "./DefinirCentroDasContas";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";

export const SITUACAO_LABEL: Record<SituacaoDaConta, string> = {
  VENCIDA: "Vencida",
  VENCE_HOJE: "Vence hoje",
  A_VENCER: "A vencer",
  PAGA: "Paga",
  CANCELADA: "Cancelada",
};

// Vencida é `danger` e vence-hoje é `warning`: a diferença entre "já custa" e
// "ainda dá para resolver" precisa ser lida sem ninguém comparar datas. As
// cores vêm do mapa único do BPO (08/10/2026): a cancelada era `info`, o
// mesmo azul de "A vencer" na mesma coluna.
const SITUACAO_VARIANTE: Record<SituacaoDaConta, VarianteDoBadge> = {
  VENCIDA: TOM_DA_SITUACAO.VENCIDA,
  VENCE_HOJE: TOM_DA_SITUACAO.VENCE_HOJE,
  A_VENCER: TOM_DA_SITUACAO.A_VENCER,
  PAGA: TOM_DA_SITUACAO.PAGA,
  CANCELADA: TOM_DA_SITUACAO.CANCELADA,
};

type Props = {
  linhas: LinhaDaConta[];
  kind: TipoDeConta;
  /** Existem contas deste tipo, mas nenhuma passou pelo recorte. */
  filtrado: boolean;
  /** Hoje em São Paulo, do servidor — o relógio do navegador pode estar noutro fuso. */
  hojeISO: string;
  /** Módulo de aprovações ligado e a pessoa atua nele: mostra "Enviar p/ aprovação". */
  podeEnviarParaAprovacao?: boolean;
  /** Módulo de pendências ligado e a pessoa atua nele: mostra "abrir pendência". */
  podeAbrirPendencia?: boolean;
  /**
   * Situação de cobrança por lançamento, quando o módulo de cobrança está ligado
   * e a pessoa atua nele (só a receber). O selo leva ao título na cobrança.
   */
  cobranca?: Map<string, SituacaoDeCobranca | null> | null;
  /** Mostra a coluna do centro de custo — só quando a empresa usa centro. */
  mostrarCentro?: boolean;
  /** Caixa de seleção por linha, ligada à barra `DefinirCentroDasContas`. */
  selecionarCentro?: boolean;
};

export function ContasTable({
  linhas,
  kind,
  filtrado,
  hojeISO,
  podeEnviarParaAprovacao: moduloDeAprovacao = false,
  podeAbrirPendencia = false,
  cobranca = null,
  mostrarCentro = false,
  selecionarCentro = false,
}: Props) {
  if (linhas.length === 0) {
    return filtrado ? (
      <EmptyState
        title="Nada neste recorte"
        description="Troque o filtro acima para ver as outras."
        icon={<FileText />}
      />
    ) : (
      <EmptyState
        title={kind === "PAGAR" ? "Nenhuma conta a pagar" : "Nenhuma conta a receber"}
        description="As contas nascem do documento fiscal, na ficha dele. Lance um documento para vê-lo aqui."
        icon={<FileText />}
      />
    );
  }

  // Cancelada por renegociação ou perda diz o nome: "cancelada" esconderia que
  // a dívida continua num acordo, ou que alguém decidiu dar por perdida.
  const rotuloDaSituacao = (l: LinhaDaConta) =>
    l.closeReason === "RENEGOCIADO" ? "Renegociada" : l.closeReason === "PERDA" ? "Perda" : SITUACAO_LABEL[l.situacao];

  // Os selos e as ações são os mesmos nas duas formas; ficam em função para a
  // tabela e o cartão não descolarem um do outro com o tempo.
  const selos = (l: LinhaDaConta) => (
    <>
      <Badge variant={l.situacao === "CANCELADA" ? tomDoFechamento(l.closeReason) : SITUACAO_VARIANTE[l.situacao]}>{rotuloDaSituacao(l)}</Badge>
      {cobranca && cobranca.get(l.id) && cobranca.get(l.id) !== "EM_DIA" && l.closeReason !== "PERDA" && (
        <Link href={`/cobranca/${l.id}`} className="inline-flex" title="Abrir na cobrança">
          <SeloDaCobranca situacao={cobranca.get(l.id) ?? null} />
        </Link>
      )}
      {l.parcelaDeAcordo && !cobranca?.get(l.id) && <span className="text-[11px] text-fg-muted whitespace-nowrap">parcela de acordo</span>}
      {/* Selo só enquanto pesa sobre a conta, ou aprovada ainda em aberto:
          depois de paga ou cancelada, a aprovação é histórico. */}
      {seloDeAprovacaoVisivel(l) && <SeloDaAprovacao status={l.approvalStatus} />}
    </>
  );

  // "Ver nota" e "abrir pendência" eram texto azul embaixo dos botões; desde
  // a conferência de 30/09 vão no menu "⋯" das ações da linha.
  const acoes = (l: LinhaDaConta, emColunas = false) => (
    <AcoesDaConta
      emColunas={emColunas}
      entryId={l.id}
      situacao={l.situacao}
      status={l.status}
      hojeISO={hojeISO}
      aPagar={kind === "PAGAR"}
      bloqueioDeBaixa={motivoDoBloqueioDeBaixa(l)}
      podeEnviar={moduloDeAprovacao && podeEnviarParaAprovacao({ ...l, kind, paidAt: l.pagoEm }).pode}
      notaHref={l.documentoId ? `/documentos-fiscais/${l.documentoId}` : null}
      pendenciaHref={podeAbrirPendencia ? `/pendencias?nova=1&lancamento=${l.id}` : null}
      acoes={{
        conferir: conferirConta,
        pagar: marcarComoPago,
        desfazer: desfazerPagamento,
        enviarParaAprovacao: moduloDeAprovacao ? enviarParaAprovacao : undefined,
      }}
    />
  );

  // O que cada coluna oferece no funil — calculado aqui, no servidor, porque é
  // o mesmo dado que a célula mostra.
  const valoresDasLinhas = linhas.map((l) => ({
    id: l.id,
    valores: {
      vencimento: l.vencimentoKey,
      contraparte: l.contraparteNome,
      empresa: l.empresaNome,
      categoria: l.categoriaNome ?? "",
      centro: l.centroDeCustoNome ?? "",
      competencia: formatarCompetencia(l.competencia),
      situacao: rotuloDaSituacao(l),
    },
  }));

  return (
    <>
      {/* Abaixo de md, cartões; de md para cima, a tabela. São nove colunas e
          880px: no celular, rolar de lado para ver o valor da conta é pior que
          não ter a coluna. O cartão põe contraparte e valor na mesma linha, que
          é o par que se lê primeiro. */}
      <CartoesNoCelular>
        {linhas.map((l) => (
          <Cartao key={l.id}>
            <div className="flex items-start gap-2.5">
              {selecionarCentro && (
                <Checkbox
                  name="entryIds"
                  value={l.id}
                  form={FORM_DO_CENTRO}
                  aria-label={`Selecionar ${l.contraparteNome}`}
                  className="mt-1"
                />
              )}
              <div className="min-w-0 flex-1">
                <TopoDoCartao nome={l.contraparteNome} valor={formatarReaisDeCentavos(l.valorCentavos)} />
                {l.descricao && <InfoDoCartao className="break-words">{l.descricao}</InfoDoCartao>}
                <InfoDoCartao className="mt-1 tabular-nums">
                  vence {formatInstantDate(l.vencimento)}
                  {l.pagoEm && ` · pago em ${formatInstantDate(l.pagoEm)}`} · comp. {formatarCompetencia(l.competencia)}
                </InfoDoCartao>
                <InfoDoCartao className="break-words">
                  {l.empresaNome}
                  {l.categoriaNome ? ` · ${l.categoriaNome}` : ""}
                  {mostrarCentro && l.centroDeCustoNome ? ` · ${l.centroDeCustoNome}` : ""}
                </InfoDoCartao>
                {!l.categoriaNome && (
                  <span className="inline-flex items-center gap-1 text-warning text-[11.5px] mt-0.5">
                    <AlertCircle size={12} /> sem categoria
                  </span>
                )}
                <PeDoCartao>{selos(l)}</PeDoCartao>
                <div className="mt-2 flex">{acoes(l)}</div>
              </div>
            </div>
          </Cartao>
        ))}
      </CartoesNoCelular>

      {/* No padrão das tabelas do Connect (a de Empresas): casco com borda,
          colunas de largura fixa e cabeçalho com fundo. Até 30/09 eram nove
          colunas soltas — empresa, categoria e centro quebravam em três linhas
          e as ações saíam da tela. Empresa vai embaixo da contraparte e centro
          embaixo da categoria: são o contexto da linha, não o que se compara.
          Centralizada, com funil em cada coluna — conferência de 30/09. */}
      <TabelaFiltravel linhas={valoresDasLinhas}>
      <TabelaNoDesktop padrao>
        <table className="w-full table-fixed min-w-[1100px] text-[length:var(--fs-ui)]">
          <colgroup>
            {selecionarCentro && <col className="w-11" />}
            <col className="w-[116px]" />
            <col />
            <col className="w-[172px]" />
            <col className="w-[116px]" />
            <col className="w-[120px]" />
            <col className="w-[160px]" />
            {/* 256px (08/10/2026): "Conferir" + "Receber" + "⋯" pediam ~246px
                com o recuo, e o "⋯" encostava na borda nos 216px de antes. */}
            <col className="w-[256px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-table-header-bg text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted">
              {selecionarCentro && (
                <th className="pl-4 pr-1 py-3">
                  <MarcarTodasAsContas />
                </th>
              )}
              <th className="px-4 py-3">
                <FiltroDaColuna rotulo="Vencimento" chave="vencimento" tipo="data" />
              </th>
              <th className="px-4 py-3">
                <FiltroDaColuna
                  rotulo={kind === "PAGAR" ? "Fornecedor" : "Cliente"}
                  campos={[
                    { chave: "contraparte", rotulo: kind === "PAGAR" ? "Fornecedor" : "Cliente" },
                    { chave: "empresa", rotulo: "Empresa" },
                  ]}
                />
              </th>
              <th className="px-4 py-3">
                <FiltroDaColuna
                  rotulo="Categoria"
                  campos={[
                    { chave: "categoria", rotulo: "Categoria" },
                    ...(mostrarCentro ? [{ chave: "centro", rotulo: "Centro de custo" }] : []),
                  ]}
                />
              </th>
              <th className="px-4 py-3">
                <FiltroDaColuna rotulo="Competência" chave="competencia" />
              </th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">
                <FiltroDaColuna rotulo="Situação" chave="situacao" align="right" />
              </th>
              <th className="px-4 py-3">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <LinhaFiltravel key={l.id} id={l.id} className="border-b border-border last:border-b-0 align-top hover:bg-surface-hover transition-colors">
                {selecionarCentro && (
                  <td className="pl-4 pr-1 py-3">
                    <Checkbox name="entryIds" value={l.id} form={FORM_DO_CENTRO} aria-label={`Selecionar ${l.contraparteNome}`} />
                  </td>
                )}
                <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                  {formatInstantDate(l.vencimento)}
                  {l.pagoEm && (
                    <span className="block text-[length:var(--fs-micro)] text-fg-muted">pago em {formatInstantDate(l.pagoEm)}</span>
                  )}
                </td>
                <td className="px-4 py-3 min-w-0">
                  <span className="block font-medium truncate" title={l.contraparteNome}>
                    {l.contraparteNome}
                  </span>
                  {l.descricao && (
                    <span className="block text-[length:var(--fs-micro)] text-fg-muted truncate" title={l.descricao}>
                      {l.descricao}
                    </span>
                  )}
                  <span className="block text-[length:var(--fs-micro)] text-fg-muted truncate" title={l.empresaNome}>
                    {l.empresaNome}
                  </span>
                </td>
                <td className="px-4 py-3 min-w-0">
                  {l.categoriaNome ? (
                    <span className="block truncate" title={l.categoriaNome}>
                      {l.categoriaNome}
                    </span>
                  ) : (
                    // Categoria é obrigatória em PAGAR (`categoriaObrigatoria`), então
                    // a ausência aqui é pendência de classificação, não campo vazio.
                    <span className="inline-flex items-center gap-1 text-warning">
                      <AlertCircle size={12} /> sem categoria
                    </span>
                  )}
                  {mostrarCentro && (
                    <span className="block text-[length:var(--fs-micro)] text-fg-muted truncate">
                      {l.centroDeCustoNome ?? "sem centro de custo"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-fg-muted tabular-nums">{formatarCompetencia(l.competencia)}</td>
                <td className="px-4 py-3 tabular-nums font-medium whitespace-nowrap">{formatarReaisDeCentavos(l.valorCentavos)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">{selos(l)}</div>
                </td>
                <td className="px-4 py-3">{acoes(l, true)}</td>
              </LinhaFiltravel>
            ))}
          </tbody>
        </table>
      </TabelaNoDesktop>
      </TabelaFiltravel>
    </>
  );
}
