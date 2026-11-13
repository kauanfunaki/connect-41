"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MOTIVO_DO_OMIE } from "@/lib/integracoes/omie/virada";
import { FileText, AlertCircle } from "lucide-react";
import { FiltroDaColunaNaUrl, type CampoDoFunilNaUrl, type CarregarValoresDoFunil } from "@/components/shared/FiltroDeColunas";
import type { VarianteDoBadge } from "@/components/ui/Badge";
import { Selo, tomDaVariante } from "@/components/ui/Selo";
import { TOM_DA_SITUACAO, tomDoFechamento } from "./tomDaSituacao";
import { EmptyState } from "@/components/ui/EmptyState";
// Dinheiro e competência pelos helpers de `lib/format` (08/10/2026): a
// competência era "09/2026" só aqui, e "Out/26" na DRE, no fluxo e no portal.
import { formatarCompetencia, formatarReaisDeCentavos } from "@/lib/format";
import type { SituacaoDaConta } from "@/lib/financeiro/contas";
import type { TipoDeConta } from "@/lib/financeiro/data";
import type { LinhaDaTela } from "@/lib/financeiro/linhaDaTela";
import { diaDaChave } from "@/lib/financeiro/paginaDeContas";
import { valoresDoFunilDasContas } from "@/lib/financeiro/funilDasContas";
import { AcoesDaConta } from "./AcoesDaConta";
import { conferirConta } from "@/lib/financeiro/acoes";
import { enviarParaAprovacao } from "@/app/(app)/aprovacoes/actions";
import { SeloDaAprovacao } from "@/components/aprovacoes/HistoricoDaAprovacao";
import { motivoDoBloqueioDeBaixa, podeEnviarParaAprovacao, seloDeAprovacaoVisivel } from "@/lib/financeiro/aprovacao/regras";
import { SeloDaCobranca } from "@/components/cobranca/SeloDaCobranca";
import { Checkbox } from "@/components/ui/Checkbox";
import { FORM_DAS_CONTAS } from "@/lib/financeiro/contas";
import { MarcarTodasAsContas } from "./AcoesEmLoteDasContas";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";

const SITUACAO_LABEL: Record<SituacaoDaConta, string> = {
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
  linhas: LinhaDaTela[];
  kind: TipoDeConta;
  /** Existem contas deste tipo, mas nenhuma passou pelo recorte e pelos funis. */
  filtrado: boolean;
  /** Hoje em São Paulo, do servidor — o relógio do navegador pode estar noutro fuso. */
  hojeISO: string;
  /**
   * A empresa da tela como vai na URL ("todas" ou o id) — o funil pede os
   * valores dela. Sem ela (a tela ainda pede para escolher), não há funil.
   */
  empresa: string | null;
  /** Módulo de aprovações ligado e a pessoa atua nele: mostra "Enviar p/ aprovação". */
  podeEnviarParaAprovacao?: boolean;
  /** Módulo de pendências ligado e a pessoa atua nele: mostra "abrir pendência". */
  podeAbrirPendencia?: boolean;
  /** Mostra o centro de custo — só quando a empresa usa centro. */
  mostrarCentro?: boolean;
  /** O funil de Categoria oferece o projeto — só quando alguma conta tem um. */
  comProjeto?: boolean;
  /** Caixa de seleção por linha, ligada à barra `AcoesEmLoteDasContas`. */
  selecionar?: boolean;
  /**
   * A empresa embaixo da contraparte. Só na lista de todas as empresas: com
   * uma escolhida no topo, repetia o nome dela em toda linha (escolha 12A,
   * 20/10/2026).
   */
  mostrarEmpresa?: boolean;
};

/**
 * A lista de contas, uma página por vez (13/11/2026).
 *
 * Componente de cliente desde a paginação: recebe as contas como dado
 * (`LinhaDaTela`) e desenha as duas formas aqui — o cartão do celular e a
 * linha da tabela. Desenhadas no servidor, as duas iam por extenso no RSC,
 * com as classes e as props das ações repetidas em cada conta.
 *
 * Os funis das colunas filtram pela URL, no servidor (`FiltroDaColunaNaUrl`):
 * numa lista paginada, filtrar só a página engana.
 */
export function ContasTable({
  linhas,
  kind,
  filtrado,
  hojeISO,
  empresa,
  podeEnviarParaAprovacao: moduloDeAprovacao = false,
  podeAbrirPendencia = false,
  mostrarCentro = false,
  comProjeto = false,
  selecionar = false,
  mostrarEmpresa = true,
}: Props) {
  const params = useSearchParams();
  const aPagar = kind === "PAGAR";
  const nomeDaContraparte = aPagar ? "Fornecedor" : "Cliente";

  if (linhas.length === 0) {
    return filtrado ? (
      <EmptyState
        title="Nada neste recorte"
        description="Troque a situação ou a competência em Filtros, ou tire o filtro das colunas, para ver as outras."
        icon={<FileText />}
      />
    ) : (
      <EmptyState
        title={aPagar ? "Nenhuma conta a pagar" : "Nenhuma conta a receber"}
        description="As contas nascem do documento fiscal, na ficha dele. Lance um documento para vê-lo aqui."
        icon={<FileText />}
      />
    );
  }

  // O funil pede ao servidor os valores da coluna no recorte da tela inteira,
  // não da página (ver `valoresDoFunilDasContas`).
  const carregar: CarregarValoresDoFunil = (chave) => valoresDoFunilDasContas(kind, chave, empresa, params.toString());
  const camposDaCategoria: CampoDoFunilNaUrl[] = [
    { chave: "categoria", rotulo: "Categoria" },
    ...(mostrarCentro ? [{ chave: "centro", rotulo: "Centro" }] : []),
    ...(comProjeto ? [{ chave: "projeto", rotulo: "Projeto" }] : []),
  ];

  // Cancelada por renegociação ou perda diz o nome: "cancelada" esconderia que
  // a dívida continua num acordo, ou que alguém decidiu dar por perdida.
  const rotuloDaSituacao = (l: LinhaDaTela) =>
    l.fechamento === "RENEGOCIADO" ? "Renegociada" : l.fechamento === "PERDA" ? "Perda" : SITUACAO_LABEL[l.situacao];

  const approvalStatus = (l: LinhaDaTela) => l.aprovacao ?? "NAO_REQUER";

  /** Baixa parcial: em aberto, com parte já paga. */
  const parcial = (l: LinhaDaTela) =>
    !!l.baixadoCentavos && l.baixadoCentavos < l.valorCentavos && l.situacao !== "PAGA" && l.situacao !== "CANCELADA";

  /** Provisória em aberto: falta a conferência. */
  const aConferir = (l: LinhaDaTela) => l.status === "PROVISORIO" && l.situacao !== "PAGA" && l.situacao !== "CANCELADA";

  // Os selos e as ações são os mesmos nas duas formas; ficam em função para a
  // tabela e o cartão não descolarem um do outro com o tempo. Situação da
  // linha no `Selo` miúdo, e não no `Badge` (escolha 2A, 08/10/2026): a linha
  // de /receber empilhava dois Badges de 24px.
  const selos = (l: LinhaDaTela) => (
    <>
      <Selo tom={tomDaVariante(l.situacao === "CANCELADA" ? tomDoFechamento(l.fechamento ?? null) : SITUACAO_VARIANTE[l.situacao])}>
        {rotuloDaSituacao(l)}
      </Selo>
      {l.cobranca && l.cobranca !== "EM_DIA" && l.fechamento !== "PERDA" && (
        <Link href={`/cobranca/${l.id}`} className="inline-flex" title="Abrir na cobrança">
          <SeloDaCobranca situacao={l.cobranca} />
        </Link>
      )}
      {l.parcelaDeAcordo && !l.cobranca && <span className="text-micro text-fg-muted whitespace-nowrap">parcela de acordo</span>}
      {parcial(l) && <Selo tom={tomDaVariante("info")}>Parcial</Selo>}
      {/* O "Conferir" saiu da coluna de ações para o "⋯" (escolha 12A,
          20/10/2026); o que falta conferir é dito aqui. */}
      {aConferir(l) && <Selo tom="atencao">A conferir</Selo>}
      {/* Selo só enquanto pesa sobre a conta, ou aprovada ainda em aberto:
          depois de paga ou cancelada, a aprovação é histórico. */}
      {seloDeAprovacaoVisivel({ approvalStatus: approvalStatus(l), status: l.status }) && (
        <SeloDaAprovacao status={approvalStatus(l)} />
      )}
    </>
  );

  // "Ver nota" e "abrir pendência" eram texto azul embaixo dos botões; desde
  // a conferência de 30/09 vão no menu "⋯" das ações da linha.
  const acoes = (l: LinhaDaTela, emColunas = false) => (
    <AcoesDaConta
      emColunas={emColunas}
      entryId={l.id}
      situacao={l.situacao}
      status={l.status}
      hojeISO={hojeISO}
      aPagar={aPagar}
      // A do Omie, até a virada da empresa, paga-se no Omie (lote E).
      bloqueioDeBaixa={l.presaAoOmie ? MOTIVO_DO_OMIE.baixa : motivoDoBloqueioDeBaixa({ approvalStatus: approvalStatus(l) })}
      podeEnviar={
        moduloDeAprovacao &&
        podeEnviarParaAprovacao({
          kind,
          status: l.status,
          // A regra só pergunta se houve baixa; o dia não importa.
          paidAt: l.pagoEm ? new Date(`${l.pagoEm}T12:00:00-03:00`) : null,
          approvalStatus: approvalStatus(l),
        }).pode
      }
      notaHref={l.documentoId ? `/documentos-fiscais/${l.documentoId}` : null}
      // Quem vê a tela atua no setor (ver ContasPage); a janela confere o resto.
      podeEditar
      pendenciaHref={podeAbrirPendencia ? `/pendencias?nova=1&lancamento=${l.id}` : null}
      temBaixas={!!l.baixadoCentavos}
      acoes={{
        conferir: conferirConta,
        enviarParaAprovacao: moduloDeAprovacao ? enviarParaAprovacao : undefined,
      }}
    />
  );

  // A linha do documento embaixo da contraparte: número, emissão e descrição
  // (19/10) — é por eles que o setor procura a conta no papel.
  // A série da repetição na frente (lote D): "3/12 · nº 4512 · aluguel".
  const linhaDoDocumento = (l: LinhaDaTela) =>
    [l.serie, l.numeroDocumento && `nº ${l.numeroDocumento}`, l.emissao && `emitida em ${diaDaChave(l.emissao)}`, l.descricao]
      .filter(Boolean)
      .join(" · ");

  const caixa = (l: LinhaDaTela, className?: string) => (
    <Checkbox name="entryIds" value={l.id} form={FORM_DAS_CONTAS} aria-label={`Selecionar ${l.contraparte}`} className={className} />
  );

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
              {selecionar && caixa(l, "mt-1")}
              <div className="min-w-0 flex-1">
                <TopoDoCartao nome={l.contraparte} valor={formatarReaisDeCentavos(l.valorCentavos)} />
                {parcial(l) && (
                  <InfoDoCartao className="tabular-nums">saldo {formatarReaisDeCentavos(l.valorCentavos - (l.baixadoCentavos ?? 0))}</InfoDoCartao>
                )}
                {l.retidoCentavos ? <InfoDoCartao className="tabular-nums">líquido · {formatarReaisDeCentavos(l.retidoCentavos)} retidos</InfoDoCartao> : null}
                {linhaDoDocumento(l) && <InfoDoCartao className="break-words">{linhaDoDocumento(l)}</InfoDoCartao>}
                <InfoDoCartao className="mt-1 tabular-nums">
                  vence {diaDaChave(l.vencimento)}
                  {l.previsao && ` · prev. ${diaDaChave(l.previsao)}`}
                  {l.pagoEm && ` · pago em ${diaDaChave(l.pagoEm)}`} · comp. {formatarCompetencia(l.competencia)}
                </InfoDoCartao>
                <InfoDoCartao className="break-words">
                  {[
                    mostrarEmpresa && l.empresa,
                    l.categoria && (l.rateio ? `${l.categoria} (rateada em ${l.rateio})` : l.categoria),
                    mostrarCentro && l.centro,
                    l.projeto && `projeto ${l.projeto}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </InfoDoCartao>
                {!l.categoria && (
                  <span className="inline-flex items-center gap-1 text-warning-fg text-micro mt-0.5">
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
          Centralizada, com funil em cada coluna — conferência de 30/09. A
          competência não tem funil: é o filtro "Competência", no Filtros. */}
      <TabelaNoDesktop padrao>
        <table className="w-full table-fixed min-w-[1100px]">
          <colgroup>
            {selecionar && <col className="w-11" />}
            <col className="w-[116px]" />
            <col />
            <col className="w-[172px]" />
            {/* 140px (Ajustes 15/10): em 116, "COMPETÊNCIA" e o funil não cabiam, e o funil saía cortado. */}
            <col className="w-[140px]" />
            <col className="w-[120px]" />
            <col className="w-[160px]" />
            {/* 164px (escolha 12A, 20/10/2026): só "Receber" e o "⋯" numa
                linha — eram 256px para Conferir, Receber e o "⋯" em duas, e a
                largura que sobra vai para a contraparte. */}
            <col className="w-[164px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-table-header-bg text-micro font-semibold uppercase tracking-wide text-fg-muted">
              {selecionar && (
                <th className="pl-4 pr-1 py-3">
                  <MarcarTodasAsContas />
                </th>
              )}
              <th className="px-4 py-3">
                {empresa ? (
                  <FiltroDaColunaNaUrl rotulo="Vencimento" campos={[{ chave: "vencimento", rotulo: "Vencimento" }]} carregar={carregar} />
                ) : (
                  "Vencimento"
                )}
              </th>
              <th className="px-4 py-3">
                {empresa ? (
                  <FiltroDaColunaNaUrl rotulo={nomeDaContraparte} campos={[{ chave: "contraparte", rotulo: nomeDaContraparte }]} carregar={carregar} />
                ) : (
                  nomeDaContraparte
                )}
              </th>
              <th className="px-4 py-3">
                {empresa ? <FiltroDaColunaNaUrl rotulo="Categoria" campos={camposDaCategoria} carregar={carregar} /> : "Categoria"}
              </th>
              <th className="px-4 py-3">Competência</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">
                {empresa ? (
                  <FiltroDaColunaNaUrl rotulo="Situação" campos={[{ chave: "situacao", rotulo: "Situação" }]} carregar={carregar} align="right" />
                ) : (
                  "Situação"
                )}
              </th>
              <th className="px-4 py-3">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-border last:border-b-0 align-top hover:bg-surface-hover transition-colors">
                {selecionar && <td className="pl-4 pr-1 py-3">{caixa(l)}</td>}
                <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                  {diaDaChave(l.vencimento)}
                  {l.previsao && (
                    <span className="block text-micro text-fg-muted" title="Data de previsão: quando deve ser paga de fato">
                      prev. {diaDaChave(l.previsao)}
                    </span>
                  )}
                  {l.pagoEm && <span className="block text-micro text-fg-muted">pago em {diaDaChave(l.pagoEm)}</span>}
                </td>
                <td className="px-4 py-3 min-w-0">
                  <span className="block font-medium truncate" title={l.contraparte}>
                    {l.contraparte}
                  </span>
                  {linhaDoDocumento(l) && (
                    <span className="block text-micro text-fg-muted truncate" title={linhaDoDocumento(l)}>
                      {linhaDoDocumento(l)}
                    </span>
                  )}
                  {mostrarEmpresa && l.empresa && (
                    <span className="block text-micro text-fg-muted truncate" title={l.empresa}>
                      {l.empresa}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 min-w-0">
                  {l.categoria ? (
                    <span className="block truncate" title={l.categoria}>
                      {l.categoria}
                    </span>
                  ) : (
                    // Categoria é obrigatória em PAGAR (`categoriaObrigatoria`), então
                    // a ausência aqui é pendência de classificação, não campo vazio.
                    <span className="inline-flex items-center gap-1 text-warning-fg">
                      <AlertCircle size={12} /> sem categoria
                    </span>
                  )}
                  {l.rateio ? (
                    <span className="block text-micro text-fg-muted" title="A conta é dividida em linhas de categoria, centro e projeto; a categoria mostrada é a da linha maior.">
                      rateada em {l.rateio}
                    </span>
                  ) : null}
                  {mostrarCentro && (
                    <span className="block text-micro text-fg-muted truncate">
                      {l.centro ?? (l.rateio ? "centros no rateio" : "sem centro de custo")}
                    </span>
                  )}
                  {l.projeto && (
                    <span className="block text-micro text-fg-muted truncate" title={l.projeto}>
                      projeto {l.projeto}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-fg-muted tabular-nums">{formatarCompetencia(l.competencia)}</td>
                <td className="px-4 py-3 tabular-nums font-medium whitespace-nowrap">
                  {formatarReaisDeCentavos(l.valorCentavos)}
                  {/* Baixa parcial (lote C): o que falta, embaixo do valor. */}
                  {parcial(l) && (
                    <span className="block text-micro font-normal text-fg-muted">
                      saldo {formatarReaisDeCentavos(l.valorCentavos - (l.baixadoCentavos ?? 0))}
                    </span>
                  )}
                  {/* Retenção na fonte (lote D, 20/10): o valor é o líquido; o imposto tem a conta dele. */}
                  {l.retidoCentavos ? (
                    <span className="block text-micro font-normal text-fg-muted" title="O valor da conta é o líquido. Cada imposto retido tem a conta dele, a pagar à Receita ou à prefeitura.">
                      {formatarReaisDeCentavos(l.retidoCentavos)} retidos
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">{selos(l)}</div>
                </td>
                <td className="px-4 py-3">{acoes(l, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabelaNoDesktop>
    </>
  );
}
