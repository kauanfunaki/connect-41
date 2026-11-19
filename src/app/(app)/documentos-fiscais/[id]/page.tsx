import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { Selo, tomDaVariante } from "@/components/ui/Selo";
import { InfoRow } from "@/components/empresas/InfoRow";
import { getAuthContext, canActOnSector, canManageSector, podeExcluir } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { obterDocumento, documentosPorChave } from "@/lib/fiscal/data";
import { Badge } from "@/components/ui/Badge";
import {
  FINALIDADE_LABEL,
  FINALIDADE_VARIANTE,
  ajustaSoIbsCbs,
  chaveFormatada,
  chavesReferenciadasDaColuna,
  ehFinalidade,
  finalidadeEmDestaque,
  motivoDoAjuste,
} from "@/lib/fiscal/finalidade";
import { alcanceDaEquipe } from "../alcance";
import { definirDestino } from "./actions";
import { DestinoControl } from "@/components/fiscal/DestinoControl";
import { LancamentoCard } from "@/components/fiscal/LancamentoCard";
import { EditarDocumentoCard } from "@/components/fiscal/EditarDocumentoCard";
import { editarDocumento, excluirDocumento } from "./editar";
import { lancarDocumento, estornarLancamento } from "./lancar";
import { podeLancar, vencimentoPresumido } from "@/lib/financeiro/lancamento";
import { getPrisma } from "@/lib/prisma";
import { centrosAtivosDaEmpresa } from "@/lib/financeiro/centroDeCustoServidor";
import { direcaoDoLancamento, precisaDeEstorno } from "@/lib/fiscal/documentos";
import { documentoDaEmpresa } from "@/lib/companyTaxId";
import { nomeExibicao } from "@/lib/companyName";
import { formatCalendarDate, formatInstantDate, formatCnpj, formatCpf, formatarReais, formatarCompetencia, formatarReaisDeCentavos } from "@/lib/format";
import {
  TIPO_LABEL,
  ORIGEM_LABEL,
  SITUACAO_LABEL,
  SITUACAO_VARIANTE,
  DESTINO_LABEL,
  DESTINO_VARIANTE,
  DIRECAO_LABEL,
} from "@/lib/fiscal/rotulos";
import { ondeDaEmpresa } from "@/lib/financeiro/planoDeContas";
import { resumoDasRetencoes, retencoesDaNota } from "@/lib/financeiro/retencoes";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { Aviso } from "@/components/ui/Aviso";
import { planoDaNota } from "@/lib/financeiro/parcelasDaNota";

// `SECTOR` é a chave do dado (onde o módulo nasce) e o padrão do gate; o
// acesso segue o setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = "fiscal";
const MODULE = "fiscal_documentos";

/** CNPJ tem 14 dígitos, CPF tem 11 — o próprio dado diz como se formata. */
function documentoLegivel(valor: string | null): string {
  if (!valor) return "—";
  return valor.length === 11 ? formatCpf(valor) : formatCnpj(valor);
}

export default async function DocumentoFiscalPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const { id } = await params;
  const doc = await obterDocumento(alcanceDaEquipe(ctx.tenantId), id);
  // `notFound` cobre "não existe" e "fora do alcance" com a mesma resposta: a
  // diferença entre as duas já é informação sobre o que existe no tenant.
  if (!doc) notFound();
  // O retido de cada tributo (lote D, 20/10), quando a nota declarou: "IRRF R$ 15,00 · PIS R$ 6,50".
  const retidoPorTributo = resumoDasRetencoes(
    retencoesDaNota(doc.retentionsByTax, {
      brutoCentavos: doc.amount === null ? null : centavosDeDecimal(doc.amount),
      liquidoCentavos: doc.netAmount === null ? null : centavosDeDecimal(doc.netAmount),
    })
  );

  const empresaDoc = documentoDaEmpresa(doc.company);
  const direcao = direcaoDoLancamento(empresaDoc?.digitos ?? null, {
    emitenteDocumento: doc.issuerDocument,
    destinatarioDocumento: doc.recipientDocument,
  });
  const estorno = precisaDeEstorno({ situacao: doc.situation, destino: doc.destination });
  // As contas da nota (1:N desde 23/10): a única, ou as parcelas das
  // duplicatas, na ordem da nota. A ficha mostra a 1ª e lista as outras.
  const contasDaNota = doc.financeEntries;
  const primeiraConta = contasDaNota[0] ?? null;

  // O veredito é calculado aqui, no servidor, e não no componente: a mesma
  // função que a action usa para recusar é a que a tela usa para explicar. Duas
  // cópias da regra é como a tela oferece um botão que a action nega.
  const veredito = podeLancar({
    situacao: doc.situation,
    destino: doc.destination,
    removidoNaOrigem: doc.removedAtOrigin,
    jaTemLancamento: primeiraConta !== null,
    valor: doc.amount === null ? null : String(doc.amount),
    direcao,
  });

  // Empresas do tenant para o seletor de correção: reatribuir o documento é a
  // correção mais comum quando a importação casou com a empresa errada.
  const empresas = await getPrisma().company.findMany({
    where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROSPECT"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, displayName: true, logoUrl: true, cnpj: true, parentCompanyId: true },
  });

  const categorias =
    veredito.pode && !primeiraConta
      ? await getPrisma().financeCategory.findMany({
          where: ondeDaEmpresa(ctx.tenantId, doc.companyId, { kind: direcao === "RECEBER" ? "RECEBER" : "PAGAR" }),
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [];
  const centros = veredito.pode && !primeiraConta ? await centrosAtivosDaEmpresa(ctx.tenantId, doc.companyId) : [];

  // As duplicatas da nota (23/10): a mesma função que a action usa para
  // parcelar monta a prévia — a tela mostra exatamente as contas que nascem.
  const planoDasDuplicatas =
    veredito.pode && !primeiraConta
      ? planoDaNota({
          duplicatas: doc.installments,
          totalCentavos: (doc.netAmount ?? doc.amount) === null ? null : centavosDeDecimal((doc.netAmount ?? doc.amount)!),
          kind: veredito.kind,
          // A nota que retém nasce inteira, na compra e na venda (23/10).
          comRetencoes: retidoPorTributo !== null,
        })
      : null;
  const duplicatas =
    planoDasDuplicatas?.tipo === "PARCELAS"
      ? {
          tipo: "PARCELAS" as const,
          parcelas: planoDasDuplicatas.parcelas.map((p) => ({
            indice: p.indice,
            numero: p.numero,
            vencimentoLabel: formatCalendarDate(new Date(`${p.vencimentoKey}T00:00:00Z`)),
            valorLabel: formatarReaisDeCentavos(p.centavos),
          })),
        }
      : planoDasDuplicatas?.tipo === "VENCIMENTO"
        ? { tipo: "VENCIMENTO" as const, numero: planoDasDuplicatas.numero }
        : planoDasDuplicatas?.tipo === "RECUSADO"
          ? { tipo: "RECUSADO" as const, motivo: planoDasDuplicatas.motivo }
          : null;

  const titulo = `${TIPO_LABEL[doc.type]} nº ${doc.number}${doc.series ? `/${doc.series}` : ""}`;

  // Finalidade, notas referenciadas e IBS/CBS (19/11/2026). A referenciada que
  // está no acervo vira link para a ficha dela; a que não está, a chave formatada.
  const finalidade = ehFinalidade(doc.finalidade) ? doc.finalidade : null;
  const emDestaque = finalidadeEmDestaque(finalidade);
  const ajusteIbsCbs = ajustaSoIbsCbs(finalidade);
  const motivo = motivoDoAjuste(finalidade, doc.tipoAjuste);
  const chavesReferenciadas = chavesReferenciadasDaColuna(doc.chavesReferenciadas);
  const noAcervo = new Map(
    (await documentosPorChave(alcanceDaEquipe(ctx.tenantId), chavesReferenciadas)).map((r) => [r.accessKey, r])
  );

  return (
    <PageContainer>
      {/* Trilha no lugar do "← Voltar" (P04, 15/10/2026): o pai é sempre a lista
          de Documentos fiscais, aberta na empresa do documento. */}
      <Breadcrumb
        items={[
          { label: "Documentos fiscais", href: `/documentos-fiscais?empresa=${doc.companyId}` },
          { label: titulo, truncate: true },
        ]}
      />

      {/* Empresa e competência no subtítulo do próprio cabeçalho, e os selos no
          `meta`, embaixo do título (15/10/2026): estavam no lugar das ações. */}
      <PageHeader
        title={titulo}
        subtitle={`${nomeExibicao(doc.company)} · ${formatarCompetencia(doc.competence)}`}
        meta={
          <>
            <Selo tom={tomDaVariante(SITUACAO_VARIANTE[doc.situation])}>{SITUACAO_LABEL[doc.situation]}</Selo>
            <Selo tom={tomDaVariante(DESTINO_VARIANTE[doc.destination])}>{DESTINO_LABEL[doc.destination]}</Selo>
            {emDestaque && <Badge variant={FINALIDADE_VARIANTE[emDestaque]}>{FINALIDADE_LABEL[emDestaque]}</Badge>}
          </>
        }
      />

      {doc.removedAtOrigin && (
        <Aviso icone={<AlertTriangle />} className="mb-4">
          <p className="font-semibold">Removido na origem</p>
              <p className="text-helper text-fg-secondary mt-0.5">
                O índice do SPED deixou de ter este documento — em geral porque o Portal Nacional
                passou a mostrá-lo como cancelado ou substituído. Ele saiu da listagem, mas a linha
                fica aqui: se já tiver virado lançamento, alguém precisa decidir o estorno.
                {doc.removedAtOriginAt ? ` Detectado em ${formatInstantDate(doc.removedAtOriginAt)}.` : ""}
              </p>
        </Aviso>
      )}

      {/* Nota de crédito/débito (finNFe 5/6): diz por que está fora do faturamento
          e do financeiro antes de alguém mudar o destino e lançar em dobro. */}
      {ajusteIbsCbs && (
        <Aviso tom="info" icone={<Info />} className="mb-4">
          <p className="font-semibold">{finalidade === "5" ? "Nota de crédito" : "Nota de débito"} da reforma tributária</p>
          <p className="text-helper text-fg-secondary mt-0.5">
            Ajusta só o IBS e a CBS da nota referenciada. Fica fora do faturamento e da apuração de ICMS, IPI,
            PIS e COFINS, e entrou ignorada no financeiro: os juros e as reduções já estão nas duplicatas da
            nota original, e lançar esta também contaria o valor duas vezes.
          </p>
        </Aviso>
      )}

      {estorno && (
        <Aviso icone={<AlertTriangle />} className="mb-4">
          <p className="font-semibold">Cancelada depois de lançada</p>
              <p className="text-helper text-fg-secondary mt-0.5">
                O emissor cancelou este documento e ele já tinha virado lançamento. O dinheiro está
                lançado contra uma nota que não existe mais — o estorno é manual, no financeiro.
              </p>
        </Aviso>
      )}

      <Card className="p-5 mb-4">
        <h2 className="text-section font-semibold text-fg mb-4">Documento</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          <InfoRow label="Tipo" value={TIPO_LABEL[doc.type]} />
          <InfoRow label="Emissão" value={formatCalendarDate(doc.issuedAt, { day: "2-digit", month: "long", year: "numeric" })} />
          <InfoRow
            label="Valor total"
            value={doc.amount === null ? "Não veio do índice" : formatarReais(Number(doc.amount))}
          />
          {/* Só aparece quando há o que subtrair. Sem esta linha, a conta a
              pagar sairia por um número que não está em lugar nenhum da ficha —
              e "1.000 virou 888,50" viraria pergunta sem resposta. */}
          {doc.netAmount !== null && (
            <InfoRow
              label="Líquido a pagar"
              value={`${formatarReais(Number(doc.netAmount))} — retido ${formatarReais(Number(doc.retentionsTotal ?? 0))}${
                retidoPorTributo ? ` (${retidoPorTributo})` : ""
              }`}
            />
          )}
          <InfoRow label="Competência" value={formatarCompetencia(doc.competence)} />
          {finalidade && <InfoRow label="Finalidade" value={FINALIDADE_LABEL[finalidade]} />}
          {ajusteIbsCbs && <InfoRow label={finalidade === "5" ? "Motivo do crédito" : "Motivo do débito"} value={motivo ?? "Não informado no XML"} />}
          {doc.valorIbs !== null && <InfoRow label="IBS" value={formatarReais(Number(doc.valorIbs))} />}
          {doc.valorCbs !== null && <InfoRow label="CBS" value={formatarReais(Number(doc.valorCbs))} />}
          <InfoRow label="Chave de acesso" value={doc.accessKey} mono />
          <InfoRow
            label="Origem"
            value={
              doc.origin === "SPED" && doc.completude === "PARCIAL"
                ? `${ORIGEM_LABEL[doc.origin]} · linha parcial`
                : ORIGEM_LABEL[doc.origin]
            }
          />
        </div>
        {chavesReferenciadas.length > 0 && (
          <div className="mt-4 border-t border-border-soft pt-4">
            <h3 className="text-helper text-fg-muted mb-2">
              {chavesReferenciadas.length === 1 ? "Nota referenciada" : `Notas referenciadas (${chavesReferenciadas.length})`}
            </h3>
            <ul className="space-y-1.5">
              {chavesReferenciadas.map((chave) => {
                const r = noAcervo.get(chave);
                return (
                  <li key={chave} className="min-w-0 text-body">
                    {r ? (
                      <Link
                        href={`/documentos-fiscais/${r.id}`}
                        className="text-brand hover:underline focus-visible:underline rounded-sm"
                      >
                        {TIPO_LABEL[r.type]} nº {r.number}
                        {r.series ? `/${r.series}` : ""}
                      </Link>
                    ) : (
                      <span className="text-fg-secondary">Fora do acervo</span>
                    )}
                    <span className="block tnum text-helper text-fg-muted break-all">{chaveFormatada(chave)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Card>

      <Card className="p-5 mb-4">
        <h2 className="text-section font-semibold text-fg mb-1">Partes</h2>
        {/* A direção é calculada, não guardada: é função do documento da empresa
            contra as duas pontas, e gravá-la criaria um campo que passa a mentir
            se o CNPJ do cadastro for corrigido. */}
        <p className="text-helper text-fg-muted mb-4">
          Direção: <span className="font-medium text-fg">{DIRECAO_LABEL[direcao]}</span>
          {direcao === "INDEFINIDA" && " — a empresa está nas duas pontas, ou em nenhuma"}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          <InfoRow label="Emitente" value={doc.issuerName} />
          <InfoRow label="CNPJ/CPF do emitente" value={documentoLegivel(doc.issuerDocument)} mono />
          <InfoRow label="Destinatário" value={doc.recipientName} />
          <InfoRow label="CNPJ/CPF do destinatário" value={documentoLegivel(doc.recipientDocument)} mono />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-section font-semibold text-fg mb-4">Destino</h2>
        <DestinoControl
          documentoId={doc.id}
          destinoAtual={doc.destination}
          motivoAtual={doc.ignoredReason}
          podeDecidir={canManageSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)}
          action={definirDestino}
        />
      </Card>

      <LancamentoCard
        documentoId={doc.id}
        direcao={direcao === "RECEBER" ? "RECEBER" : "PAGAR"}
        podeDecidir={canManageSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)}
        categorias={categorias}
        centros={centros}
        vencimentoPresumidoIso={
          planoDasDuplicatas?.tipo === "VENCIMENTO"
            ? planoDasDuplicatas.vencimentoKey
            : vencimentoPresumido(doc.issuedAt).toISOString().slice(0, 10)
        }
        duplicatas={duplicatas}
        impedimento={veredito.pode || primeiraConta ? null : veredito.explicacao}
        lancamento={
          primeiraConta
            ? {
                id: primeiraConta.id,
                kind: primeiraConta.kind,
                status: primeiraConta.status,
                dueDateLabel: formatCalendarDate(primeiraConta.dueDate),
                amountLabel: formatarReais(Number(primeiraConta.amount)),
                categoria: primeiraConta.category?.name ?? null,
                contraparte: primeiraConta.counterparty.name,
                centroDeCusto: primeiraConta.costCenter?.name ?? null,
                parcelas: contasDaNota.length > 1 ? contasDaNota.length : null,
                parcelasLancadas:
                  contasDaNota.length > 1
                    ? contasDaNota.map((c) => ({
                        id: c.id,
                        indice: c.fiscalDocumentInstallment,
                        status: c.status,
                        vencimentoLabel: formatCalendarDate(c.dueDate),
                        valorLabel: formatarReais(Number(c.amount)),
                      }))
                    : null,
              }
            : null
        }
        lancarAction={lancarDocumento}
        estornarAction={estornarLancamento}
      />

      <EditarDocumentoCard
        documentoId={doc.id}
        acao={editarDocumento}
        excluir={podeExcluir(ctx) ? excluirDocumento.bind(null, doc.id) : undefined}
        empresas={empresas.map((e) => ({
          id: e.id,
          nome: nomeExibicao(e),
          logoUrl: e.logoUrl,
          cnpj: e.cnpj,
          matrizId: e.parentCompanyId,
        }))}
        bloqueado={primeiraConta !== null}
        editadoEm={doc.editedAt ? formatInstantDate(doc.editedAt) : null}
        valores={{
          companyId: doc.companyId,
          number: doc.number,
          series: doc.series,
          issuerName: doc.issuerName,
          recipientName: doc.recipientName,
          amount: doc.amount === null ? null : String(doc.amount),
          issuedAt: doc.issuedAt.toISOString().slice(0, 10),
          competence: doc.competence,
        }}
      />

      {/* Só com o que dizer: sem quem subiu, o cartão ficava só com o título.
          O texto vinha 24px abaixo dele (mb-2 + mt-4) e em 11px; agora segue
          o espaçamento e o tamanho dos outros cartões da ficha. */}
      {doc.uploadedBy && (
        <Card className="p-5 mt-4">
          <h2 className="text-section font-semibold text-fg mb-1">Registro</h2>
          <p className="text-helper text-fg-muted">
            Subido por {doc.uploadedBy.name} em {formatInstantDate(doc.createdAt)}.
          </p>
        </Card>
      )}
    </PageContainer>
  );
}
