"use server";

// Lançamento manual, cancelamento e importação por CSV.
//
// O setor não é constante: é o que opera o módulo neste tenant (`setorDoModulo`),
// para as telas acompanharem o módulo se ele for movido de setor num cliente.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { logAudit } from "@/lib/audit";
import { saoPauloParts } from "@/lib/agenda";
import { chaveDaCategoria } from "@/lib/dre/calculo";
import {
  validarCamposDoLancamento,
  statusInicialDoManual,
  podeCancelarManual,
  decimalDeCentavos,
  digitosDoDocumento,
} from "@/lib/financeiro/manual";
import { prepararImportacao, chaveDeDuplicidade, type PreviaDaImportacao } from "@/lib/financeiro/importacaoCsv";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { instanteDaData } from "@/lib/financeiro/periodo";
import { contextoDeEntrada, registrarEnvios, avisarAprovadores } from "@/lib/financeiro/aprovacao/servidor";
import { centroDoLancamento, type CentroConhecido } from "@/lib/financeiro/centroDeCusto";
import { centroNaCriacao } from "@/lib/financeiro/centroDeCustoServidor";
import { categoriaDaEmpresa, ondeDaEmpresa } from "@/lib/financeiro/planoDeContas";
import { projetoInformado } from "@/lib/financeiro/projetoServidor";
import { contaPrevistaInformada } from "@/lib/financeiro/contaPrevistaServidor";
import { quitarConta } from "@/lib/financeiro/baixa/servidor";
import { fichaOpcional, leitorDaFicha } from "@/lib/financeiro/fichaDaContraparte";
import { lerEmail } from "@/lib/financeiro/cobranca/regua";
import { arquivosDoFormulario, type AnexoGravado } from "@/lib/financeiro/pendencias/armazenamento";
import { armazenamentoDosAnexos } from "@/lib/financeiro/anexos";
import { AGENTE_DO_BOLETO } from "@/lib/financeiro/leituraDoBoleto";
import { ocorrenciasDaRepeticao, validarRepeticao } from "@/lib/financeiro/repeticao";
import { randomUUID } from "crypto";

const MODULE = "bpo_lancamentos";

async function contexto(companyId: string) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false as const, erro: "Não autenticado." };
  if (!canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? getModuleDef(MODULE)!.sectorCode)) return { ok: false as const, erro: "Sem permissão para lançar." };
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return { ok: false as const, erro: "Módulo não habilitado." };

  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({ where: { id: companyId, tenantId: ctx.tenantId }, select: { id: true } });
  if (!empresa) return { ok: false as const, erro: "Empresa não encontrada." };
  return { ok: true as const, ctx, tenantId: ctx.tenantId, prisma };
}

function revalidar() {
  for (const p of ["/lancamentos", "/pagar", "/receber", "/fluxo-de-caixa", "/dre", "/dre/economica", "/dre/analises"]) {
    revalidatePath(p);
  }
}

export type ResultadoDoManual = { error: string } | { ok: true; aguardandoAprovacao?: boolean; /** Quantas próximas da série nasceram junto. */ repetidas?: number };

/**
 * Cria o lançamento manual.
 *
 * Numa transação, como o lançamento por nota: contraparte nova e lançamento
 * nascem juntos ou não nascem. Contraparte com documento já cadastrado na
 * empresa é **reaproveitada** em vez de recusada — é a mesma pessoa, e o unique
 * (tenant, empresa, documento) recusaria a segunda ficha de qualquer jeito.
 */
export async function criarLancamentoManual(formData: FormData): Promise<ResultadoDoManual> {
  const texto = (k: string) => String(formData.get(k) ?? "").trim();
  const companyId = texto("companyId");
  const c = await contexto(companyId);
  if (!c.ok) return { error: c.erro };

  const hojeKey = saoPauloParts(new Date()).dateKey;
  const categoryId = texto("categoryId") || null;
  const v = validarCamposDoLancamento(
    {
      kind: texto("kind"),
      competencia: texto("competencia"),
      vencimento: texto("vencimento"),
      valor: texto("valor"),
      descricao: texto("descricao"),
      pagoEm: texto("pagoEm"),
      emissao: texto("emissao"),
      numeroDocumento: texto("numeroDocumento"),
      categoryId,
    },
    hojeKey
  );
  if (!v.ok) return { error: v.erro };
  const d = v.dados;
  const rep = validarRepeticao({ frequencia: texto("repetirFrequencia"), vezes: texto("repetirVezes"), ajuste: texto("repetirAjuste") });
  if (!rep.ok) return { error: rep.erro };

  if (d.categoryId) {
    const categoria = await c.prisma.financeCategory.findFirst({
      where: categoriaDaEmpresa(c.tenantId, companyId, d.categoryId, d.kind),
      select: { id: true },
    });
    // Tipo entra no `where`: categoria de receita num lançamento a pagar sairia
    // do DRE pelo filtro de origem e cairia no não classificado sem aviso.
    if (!categoria) return { error: "Categoria não encontrada para este tipo de lançamento." };
  }

  const counterpartyId = texto("counterpartyId");
  const novoNome = texto("contraparteNome");
  const novoDocumento = digitosDoDocumento(texto("contraparteDocumento"));
  if (!counterpartyId && !novoNome) return { error: "Escolha a contraparte ou cadastre uma nova." };
  if (!counterpartyId && novoDocumento && novoDocumento.length !== 11 && novoDocumento.length !== 14) {
    return { error: "Documento não é CPF (11 dígitos) nem CNPJ (14)." };
  }

  const existente = counterpartyId
    ? await c.prisma.financeCounterparty.findFirst({
        where: { id: counterpartyId, tenantId: c.tenantId, companyId },
        select: { id: true, defaultCategoryId: true, defaultCostCenterId: true },
      })
    : novoDocumento
      ? await c.prisma.financeCounterparty.findFirst({
          where: { tenantId: c.tenantId, companyId, document: novoDocumento },
          select: { id: true, defaultCategoryId: true, defaultCostCenterId: true },
        })
      : null;
  if (counterpartyId && !existente) return { error: "Contraparte não encontrada nesta empresa." };

  // Centro informado vence; sem ele, o padrão da contraparte (mesma empresa e
  // ativo). Contraparte nova não tem padrão.
  const centro = await centroNaCriacao({
    tenantId: c.tenantId,
    companyId,
    informadoId: texto("costCenterId") || null,
    padraoDaContraparteId: existente?.defaultCostCenterId ?? null,
  });
  if (!centro.ok) return { error: centro.erro };
  const projeto = await projetoInformado({ tenantId: c.tenantId, companyId, informadoId: texto("projectId") || null });
  if (!projeto.ok) return { error: projeto.erro };
  // A conta corrente prevista (lote D, 20/10): com "já pago em", é dela que a baixa sai.
  const contaPrevista = await contaPrevistaInformada({ tenantId: c.tenantId, companyId, informadoId: texto("bankAccountId") || null });
  if (!contaPrevista.ok) return { error: contaPrevista.erro };

  const status = statusInicialDoManual(d.pagoEmKey);
  // Aprovação por alçada: conta a pagar em aberto numa empresa com alçada nasce
  // aguardando. A que já veio com a data da baixa nasce PAGO e não entra.
  const entrada = await contextoDeEntrada(c.tenantId, [companyId]);
  const approvalStatus = entrada.statusInicial(companyId, d.kind, status);

  // A repetição (lote D, 19/10): as próximas nascem agora, em aberto, cada uma
  // com a aprovação dela. Os feriados são os do escritório (Administração ›
  // Feriados), em dia de calendário.
  const proximas = rep.repeticao
    ? ocorrenciasDaRepeticao(
        { vencimentoKey: d.vencimentoKey, competencia: d.competencia },
        rep.repeticao,
        new Set((await c.prisma.holiday.findMany({ where: { tenantId: c.tenantId }, select: { date: true } })).map((h) => h.date.toISOString().slice(0, 10)))
      ).slice(1)
    : [];
  const serie = rep.repeticao ? { recurrenceId: randomUUID(), recurrenceTotal: rep.repeticao.vezes } : null;
  const statusDasProximas = statusInicialDoManual(null);
  const aprovacaoDasProximas = entrada.statusInicial(companyId, d.kind, statusDasProximas);

  // A leitura do boleto pela IA que preencheu esta tela, quando houve (lote H2).
  // Vai só para a auditoria — é o que permite medir, depois, quanto a pessoa
  // corrigiu do que a IA leu. Id que não é deste escritório nem do leitor é ignorado.
  const leituraRunId = texto("leituraRunId").slice(0, 64);
  const leitura = leituraRunId
    ? await c.prisma.agentRun.findFirst({ where: { id: leituraRunId, tenantId: c.tenantId, agentCode: AGENTE_DO_BOLETO }, select: { id: true } })
    : null;

  // Os anexos (lote H2) vão para o disco antes da transação, já conferidos; se
  // a gravação no banco falhar, saem do disco — nada fica órfão.
  const arquivos = arquivosDoFormulario(formData, "anexos");
  let anexos: AnexoGravado[] = [];
  if (arquivos.length > 0) {
    const gravacao = await armazenamentoDosAnexos.gravarAnexos(c.tenantId, arquivos);
    if (!gravacao.ok) return { error: gravacao.erro };
    anexos = gravacao.anexos;
  }

  let entry: { id: string; amount: { toString(): string } };
  try {
    entry = await c.prisma.$transaction(async (tx) => {
      const contraparte =
        existente ??
        (await tx.financeCounterparty.create({
          data: {
            tenantId: c.tenantId,
            companyId,
            name: novoNome.slice(0, 180),
            document: novoDocumento,
            // A ficha que a Receita devolveu na busca pelo CNPJ (campos ocultos).
            email: lerEmail(texto("ficha_email")) || null,
            ...fichaOpcional(leitorDaFicha(formData, "ficha_")),
          },
          select: { id: true, defaultCategoryId: true },
        }));
  
      // Nasce conferido; o "já pago em" vira a baixa logo abaixo (lote C), que
      // é quem deixa a conta paga.
      const criado = await tx.financeEntry.create({
        data: {
          tenantId: c.tenantId,
          companyId,
          kind: d.kind,
          status: status === "PAGO" ? "CONFERIDO" : status,
          approvalStatus,
          counterpartyId: contraparte.id,
          categoryId: d.categoryId,
          costCenterId: centro.centroId,
          projectId: projeto.projetoId,
          bankAccountId: contaPrevista.contaId,
          issueDate: d.emissaoKey ? instanteDaData(d.emissaoKey) : null,
          documentNumber: d.numeroDocumento,
          competence: d.competencia,
          dueDate: instanteDaData(d.vencimentoKey),
          amount: decimalDeCentavos(d.centavos),
          description: d.descricao,
          createdById: c.ctx.userId || null,
          // Quem digitou conferiu — ver `statusInicialDoManual`.
          reviewedById: c.ctx.userId || null,
          reviewedAt: new Date(),
          ...(serie ? { ...serie, recurrenceIndex: 1 } : {}),
        },
        select: { id: true, amount: true },
      });
      // As próximas da série: a mesma conta em outro vencimento — sem emissão,
      // número, baixa nem anexo, que são desta.
      const idsDasProximas = proximas.map(() => randomUUID());
      if (serie && proximas.length > 0) {
        await tx.financeEntry.createMany({
          data: proximas.map((o, i) => ({
            id: idsDasProximas[i]!,
            tenantId: c.tenantId,
            companyId,
            kind: d.kind,
            status: statusDasProximas,
            approvalStatus: aprovacaoDasProximas,
            counterpartyId: contraparte.id,
            categoryId: d.categoryId,
            costCenterId: centro.centroId,
            projectId: projeto.projetoId,
            competence: o.competencia,
            dueDate: instanteDaData(o.vencimentoKey),
            amount: decimalDeCentavos(d.centavos),
            description: d.descricao,
            createdById: c.ctx.userId || null,
            reviewedById: c.ctx.userId || null,
            reviewedAt: new Date(),
            ...serie,
            recurrenceIndex: o.indice,
          })),
        });
        if (aprovacaoDasProximas === "AGUARDANDO") await registrarEnvios(tx, idsDasProximas, c.ctx.userId || null);
      }
      if (d.pagoEmKey) {
        await quitarConta(tx, {
          tenantId: c.tenantId,
          entryId: criado.id,
          paidAt: instanteDaData(d.pagoEmKey),
          bankAccountId: contaPrevista.contaId,
          origin: "LANCAMENTO",
          userId: c.ctx.userId || null,
        });
      }
      if (approvalStatus === "AGUARDANDO") await registrarEnvios(tx, [criado.id], c.ctx.userId || null);
  
      // A mesma herança do lançamento por nota: a primeira conta classifica o
      // fornecedor, as próximas já nascem classificadas.
      if (d.kind === "PAGAR" && d.categoryId && !contraparte.defaultCategoryId) {
        await tx.financeCounterparty.update({ where: { id: contraparte.id }, data: { defaultCategoryId: d.categoryId } });
      }
      if (anexos.length > 0) {
        await tx.financeEntryAttachment.createMany({
          data: anexos.map((a) => ({ ...a, tenantId: c.tenantId, entryId: criado.id, uploadedByUserId: c.ctx.userId || null })),
        });
      }
      return criado;
    });
  } catch (err) {
    await armazenamentoDosAnexos.apagarAnexosGravados(anexos);
    throw err;
  }

  const aguardando = (approvalStatus === "AGUARDANDO" ? 1 : 0) + (aprovacaoDasProximas === "AGUARDANDO" ? proximas.length : 0);
  const aviso = aguardando > 0 ? await avisarAprovadores(c.tenantId, Array.from({ length: aguardando }, () => ({ companyId, amount: entry.amount }))) : null;

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.entry.created_manual",
    entityType: "FinanceEntry",
    entityId: entry.id,
    metadata: {
      companyId,
      kind: d.kind,
      valor: decimalDeCentavos(d.centavos),
      competencia: d.competencia,
      approvalStatus,
      centroDeCusto: centro.centroId,
      projeto: projeto.projetoId,
      ...(anexos.length > 0 ? { anexos: anexos.map((a) => a.fileName) } : {}),
      ...(leitura ? { lidoPorIa: leitura.id } : {}),
      ...(aviso ? { emailsDeAprovacao: aviso.enviados, semSmtp: aviso.semSmtp } : {}),
      ...(rep.repeticao && serie
        ? { repeticao: `${rep.repeticao.frequencia} × ${rep.repeticao.vezes}`, ajusteDoDia: rep.repeticao.ajuste, serie: serie.recurrenceId }
        : {}),
    },
  });

  revalidar();
  return { ok: true, aguardandoAprovacao: approvalStatus === "AGUARDANDO", repetidas: proximas.length };
}

/** Cancela um lançamento manual em aberto. Nunca apaga. */
export async function cancelarLancamentoManual(entryId: string): Promise<ResultadoDoManual> {
  const prisma = getPrisma();
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado." };
  const conta = await prisma.financeEntry.findFirst({
    where: { id: entryId, tenantId: ctx.tenantId },
    select: { id: true, companyId: true, status: true, paidAt: true, fiscalDocumentId: true, agreementId: true, paidPrincipal: true },
  });
  if (!conta) return { error: "Lançamento não encontrado." };

  const c = await contexto(conta.companyId);
  if (!c.ok) return { error: c.erro };

  const veredito = podeCancelarManual(conta);
  if (!veredito.pode) return { error: veredito.motivo };

  // Motivo explícito desde a cobrança: `CANCELADO` com motivo nulo é só o
  // cancelado de antes da coluna. Condicionado ao estado lido — uma baixa ou um
  // acordo que chegou antes não é cancelado por cima.
  const cancelado = await prisma.financeEntry.updateMany({
    where: { id: entryId, tenantId: c.tenantId, status: conta.status, paidAt: null, paidPrincipal: 0, agreementId: null, payments: { none: {} } },
    data: { status: "CANCELADO", closeReason: "CANCELADO" },
  });
  if (cancelado.count !== 1) return { error: "O lançamento acabou de mudar — atualize a tela." };
  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.entry.cancelled_manual",
    entityType: "FinanceEntry",
    entityId: entryId,
  });
  revalidar();
  return { ok: true };
}

export type ResultadoDaSerie = { error: string } | { ok: true; canceladas: number; ficaram: number };

/**
 * Cancela esta conta e as próximas da série da repetição (lote D): a mesma
 * série, desta posição em diante. Cada uma passa pela regra do cancelamento
 * manual (`podeCancelarManual`) e pela mesma trava de estado; a paga, a com
 * baixa parcial ou a parcela de acordo fica como está e conta nas que
 * ficaram. As anteriores não são tocadas.
 */
export async function cancelarProximasDaSerie(entryId: string): Promise<ResultadoDaSerie> {
  const prisma = getPrisma();
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado." };
  const conta = await prisma.financeEntry.findFirst({
    where: { id: entryId, tenantId: ctx.tenantId },
    select: { id: true, companyId: true, recurrenceId: true, recurrenceIndex: true },
  });
  if (!conta) return { error: "Lançamento não encontrado." };
  if (!conta.recurrenceId || !conta.recurrenceIndex) return { error: "Este lançamento não faz parte de uma repetição." };

  const c = await contexto(conta.companyId);
  if (!c.ok) return { error: c.erro };

  const daSerie = await prisma.financeEntry.findMany({
    where: { tenantId: c.tenantId, companyId: conta.companyId, recurrenceId: conta.recurrenceId, recurrenceIndex: { gte: conta.recurrenceIndex } },
    select: { id: true, status: true, paidAt: true, fiscalDocumentId: true, agreementId: true, paidPrincipal: true },
  });
  const cancelaveis = daSerie.filter((e) => podeCancelarManual(e).pode);
  let canceladas = 0;
  for (const e of cancelaveis) {
    // A mesma trava do cancelamento de uma: a baixa ou o acordo que chegou
    // antes não é cancelado por cima.
    const r = await prisma.financeEntry.updateMany({
      where: { id: e.id, tenantId: c.tenantId, status: e.status, paidAt: null, paidPrincipal: 0, agreementId: null, payments: { none: {} } },
      data: { status: "CANCELADO", closeReason: "CANCELADO" },
    });
    canceladas += r.count;
  }
  if (canceladas === 0) return { error: "Nenhuma conta desta posição em diante pode ser cancelada." };

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.entry.cancelled_manual",
    entityType: "FinanceEntry",
    entityId: entryId,
    metadata: { serie: conta.recurrenceId, aPartirDe: conta.recurrenceIndex, canceladas },
  });
  revalidar();
  return { ok: true, canceladas, ficaram: daSerie.length - canceladas };
}

// ─── Importação por CSV ─────────────────────────────────────────────────────

/** Teto do texto recebido. O limite do corpo da action é 10 MB; o CSV de 2.000 linhas cabe em muito menos. */
const MAXIMO_DE_BYTES = 2 * 1024 * 1024;

async function prepararParaEmpresa(tenantId: string, companyId: string, texto: string): Promise<PreviaDaImportacao> {
  const prisma = getPrisma();
  const hojeKey = saoPauloParts(new Date()).dateKey;
  const categorias = await prisma.financeCategory.findMany({
    where: ondeDaEmpresa(tenantId, companyId),
    select: { id: true, name: true, kind: true },
  });
  const casaveis = categorias.map((c) => ({ id: c.id, nome: c.name, kind: c.kind }));
  // Só centro ativo casa: inativo não recebe lançamento novo.
  const centros = (
    await prisma.costCenter.findMany({ where: { tenantId, companyId, active: true }, select: { id: true, name: true, code: true } })
  ).map((c) => ({ id: c.id, nome: c.name, codigo: c.code }));
  const projetos = (
    await prisma.financeProject.findMany({ where: { tenantId, companyId, active: true }, select: { id: true, name: true } })
  ).map((p) => ({ id: p.id, nome: p.name }));

  // Primeira passada só para saber quais competências o arquivo toca — a
  // consulta de duplicidade não precisa do histórico inteiro da empresa.
  const rascunho = prepararImportacao(texto, hojeKey, casaveis, new Set(), centros, projetos);
  if (!rascunho.ok) return rascunho;
  const competencias = [
    ...new Set(rascunho.linhas.flatMap((l) => (l.situacao === "erro" ? [] : [l.dados.competencia]))),
  ];

  const existentes = competencias.length
    ? await prisma.financeEntry.findMany({
        // Renegociado e perdido contam como existentes: o título continua sendo
        // um fato daquela competência, e reimportar a planilha que o trouxe não
        // pode recriá-lo em aberto por cima do acordo ou da perda.
        where: {
          tenantId,
          companyId,
          competence: { in: competencias },
          OR: [{ status: { not: "CANCELADO" } }, { closeReason: { in: ["RENEGOCIADO", "PERDA"] } }],
        },
        select: {
          kind: true,
          competence: true,
          dueDate: true,
          amount: true,
          counterparty: { select: { name: true, document: true } },
        },
      })
    : [];
  const chaves = new Set(
    existentes.map((e) =>
      chaveDeDuplicidade({
        kind: e.kind,
        contraparteDocumento: e.counterparty.document,
        contraparteNome: e.counterparty.name,
        competencia: e.competence,
        vencimentoKey: saoPauloParts(e.dueDate).dateKey,
        centavos: centavosDeDecimal(e.amount),
      })
    )
  );
  return prepararImportacao(texto, hojeKey, casaveis, chaves, centros, projetos);
}

export async function previsualizarImportacao(companyId: string, texto: string): Promise<PreviaDaImportacao> {
  const c = await contexto(companyId);
  if (!c.ok) return { ok: false, erro: c.erro };
  if (texto.length > MAXIMO_DE_BYTES) return { ok: false, erro: "Arquivo maior que 2 MB." };
  return prepararParaEmpresa(c.tenantId, companyId, texto);
}

export type ResultadoDaImportacaoCsv =
  | { error: string }
  | { ok: true; criados: number; duplicadas: number; comErro: number; aguardandoAprovacao: number };

/**
 * Grava as linhas válidas.
 *
 * Relê o arquivo inteiro em vez de confiar na prévia do navegador, e grava
 * **tudo ou nada** numa transação: importação pela metade deixa a pessoa sem
 * saber de onde recomeçar, e recomeçar do zero duplicaria a metade que entrou.
 */
export async function confirmarImportacao(companyId: string, texto: string): Promise<ResultadoDaImportacaoCsv> {
  const c = await contexto(companyId);
  if (!c.ok) return { error: c.erro };
  if (texto.length > MAXIMO_DE_BYTES) return { error: "Arquivo maior que 2 MB." };

  const previa = await prepararParaEmpresa(c.tenantId, companyId, texto);
  if (!previa.ok) return { error: previa.erro };

  const validas = previa.linhas.flatMap((l) => (l.situacao === "valida" ? [l.dados] : []));
  if (validas.length === 0) return { error: "Nenhuma linha válida para importar." };

  const [contrapartes, centrosDaEmpresa, projetosAtivos] = await Promise.all([
    c.prisma.financeCounterparty.findMany({
      where: { tenantId: c.tenantId, companyId },
      select: { id: true, name: true, document: true, defaultCategoryId: true, defaultCostCenterId: true },
    }),
    c.prisma.costCenter.findMany({ where: { tenantId: c.tenantId, companyId }, select: { id: true, companyId: true, active: true } }),
    c.prisma.financeProject.findMany({ where: { tenantId: c.tenantId, companyId, active: true }, select: { id: true } }),
  ]);
  const centros = new Map<string, CentroConhecido>(centrosDaEmpresa.map((x) => [x.id, x]));
  // Um centro inativado entre a leitura do arquivo e aqui recusa a importação
  // inteira, antes da transação — tudo ou nada, como o resto.
  for (const d of validas) {
    if (d.centroDeCustoId && !centros.get(d.centroDeCustoId)?.active) {
      return { error: "Um centro de custo do arquivo acabou de ser inativado — leia o arquivo de novo." };
    }
  }
  const ativos = new Set(projetosAtivos.map((p) => p.id));
  if (validas.some((d) => d.projetoId && !ativos.has(d.projetoId))) {
    return { error: "Um projeto do arquivo acabou de ser inativado — leia o arquivo de novo." };
  }
  const porDocumento = new Map(contrapartes.filter((p) => p.document).map((p) => [p.document!, p]));
  // Sem documento, casa pelo nome normalizado — a mesma chave da duplicidade.
  const porNome = new Map(contrapartes.map((p) => [chaveDaCategoria(p.name), p]));

  const hoje = new Date();
  const entrada = await contextoDeEntrada(c.tenantId, [companyId]);
  // O que entrou em aprovação, para um aviso por aprovador no fim — e não um
  // e-mail por linha da planilha.
  const aguardando: { id: string; companyId: string; amount: { toString(): string } }[] = [];
  await c.prisma.$transaction(
    async (tx) => {
      for (const d of validas) {
        let contraparte =
          (d.contraparteDocumento ? porDocumento.get(d.contraparteDocumento) : undefined) ??
          (d.contraparteDocumento ? undefined : porNome.get(chaveDaCategoria(d.contraparteNome)));
        if (!contraparte) {
          contraparte = await tx.financeCounterparty.create({
            data: { tenantId: c.tenantId, companyId, name: d.contraparteNome, document: d.contraparteDocumento },
            select: { id: true, name: true, document: true, defaultCategoryId: true, defaultCostCenterId: true },
          });
          if (contraparte.document) porDocumento.set(contraparte.document, contraparte);
          else porNome.set(chaveDaCategoria(contraparte.name), contraparte);
        }

        // A coluna do CSV já foi casada com centro ativo (e conferida acima);
        // vazia, herda o padrão da contraparte.
        const centro = centroDoLancamento({
          companyId,
          informadoId: d.centroDeCustoId,
          padraoDaContraparteId: contraparte.defaultCostCenterId,
          centros,
        });
        const status = statusInicialDoManual(d.pagoEmKey);
        const approvalStatus = entrada.statusInicial(companyId, d.kind, status);
        const criado = await tx.financeEntry.create({
          data: {
            tenantId: c.tenantId,
            companyId,
            kind: d.kind,
            status: status === "PAGO" ? "CONFERIDO" : status,
            approvalStatus,
            counterpartyId: contraparte.id,
            categoryId: d.categoryId,
            costCenterId: centro.ok ? centro.centroId : null,
            projectId: d.projetoId,
            issueDate: d.emissaoKey ? instanteDaData(d.emissaoKey) : null,
            documentNumber: d.numeroDocumento,
            competence: d.competencia,
            dueDate: instanteDaData(d.vencimentoKey),
            amount: decimalDeCentavos(d.centavos),
            description: d.descricao,
            createdById: c.ctx.userId || null,
            reviewedById: c.ctx.userId || null,
            reviewedAt: hoje,
          },
          select: { id: true, amount: true },
        });
        // A coluna "pago em" vira a baixa cheia (lote C).
        if (d.pagoEmKey) {
          await quitarConta(tx, { tenantId: c.tenantId, entryId: criado.id, paidAt: instanteDaData(d.pagoEmKey), origin: "LANCAMENTO", userId: c.ctx.userId || null });
        }
        if (approvalStatus === "AGUARDANDO") aguardando.push({ id: criado.id, companyId, amount: criado.amount });

        if (d.kind === "PAGAR" && d.categoryId && !contraparte.defaultCategoryId) {
          await tx.financeCounterparty.update({ where: { id: contraparte.id }, data: { defaultCategoryId: d.categoryId } });
          contraparte.defaultCategoryId = d.categoryId;
        }
      }
      await registrarEnvios(
        tx,
        aguardando.map((a) => a.id),
        c.ctx.userId || null
      );
    },
    // 2.000 linhas em série passam do timeout padrão de 5 s da transação.
    { timeout: 120_000, maxWait: 10_000 }
  );

  const duplicadas = previa.linhas.filter((l) => l.situacao === "duplicada").length;
  const comErro = previa.linhas.filter((l) => l.situacao === "erro").length;
  const aviso = aguardando.length > 0 ? await avisarAprovadores(c.tenantId, aguardando) : null;

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.entry.imported_csv",
    entityType: "Company",
    entityId: companyId,
    metadata: {
      criados: validas.length,
      duplicadas,
      comErro,
      aguardandoAprovacao: aguardando.length,
      ...(aviso ? { emailsDeAprovacao: aviso.enviados, semSmtp: aviso.semSmtp } : {}),
    },
  });

  revalidar();
  return { ok: true, criados: validas.length, duplicadas, comErro, aguardandoAprovacao: aguardando.length };
}
