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

export type ResultadoDoManual = { error: string } | { ok: true; aguardandoAprovacao?: boolean };

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
      categoryId,
    },
    hojeKey
  );
  if (!v.ok) return { error: v.erro };
  const d = v.dados;

  if (d.categoryId) {
    const categoria = await c.prisma.financeCategory.findFirst({
      where: { id: d.categoryId, tenantId: c.tenantId, kind: d.kind },
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
        select: { id: true, defaultCategoryId: true },
      })
    : novoDocumento
      ? await c.prisma.financeCounterparty.findFirst({
          where: { tenantId: c.tenantId, companyId, document: novoDocumento },
          select: { id: true, defaultCategoryId: true },
        })
      : null;
  if (counterpartyId && !existente) return { error: "Contraparte não encontrada nesta empresa." };

  const status = statusInicialDoManual(d.pagoEmKey);
  // Aprovação por alçada: conta a pagar em aberto numa empresa com alçada nasce
  // aguardando. A que já veio com a data da baixa nasce PAGO e não entra.
  const approvalStatus = (await contextoDeEntrada(c.tenantId, [companyId])).statusInicial(companyId, d.kind, status);

  const entry = await c.prisma.$transaction(async (tx) => {
    const contraparte =
      existente ??
      (await tx.financeCounterparty.create({
        data: { tenantId: c.tenantId, companyId, name: novoNome.slice(0, 180), document: novoDocumento },
        select: { id: true, defaultCategoryId: true },
      }));

    const criado = await tx.financeEntry.create({
      data: {
        tenantId: c.tenantId,
        companyId,
        kind: d.kind,
        status,
        approvalStatus,
        counterpartyId: contraparte.id,
        categoryId: d.categoryId,
        competence: d.competencia,
        dueDate: instanteDaData(d.vencimentoKey),
        paidAt: d.pagoEmKey ? instanteDaData(d.pagoEmKey) : null,
        amount: decimalDeCentavos(d.centavos),
        description: d.descricao,
        createdById: c.ctx.userId || null,
        // Quem digitou conferiu — ver `statusInicialDoManual`.
        reviewedById: c.ctx.userId || null,
        reviewedAt: new Date(),
      },
      select: { id: true, amount: true },
    });
    if (approvalStatus === "AGUARDANDO") await registrarEnvios(tx, [criado.id], c.ctx.userId || null);

    // A mesma herança do lançamento por nota: a primeira conta classifica o
    // fornecedor, as próximas já nascem classificadas.
    if (d.kind === "PAGAR" && d.categoryId && !contraparte.defaultCategoryId) {
      await tx.financeCounterparty.update({ where: { id: contraparte.id }, data: { defaultCategoryId: d.categoryId } });
    }
    return criado;
  });

  const aviso = approvalStatus === "AGUARDANDO" ? await avisarAprovadores(c.tenantId, [{ companyId, amount: entry.amount }]) : null;

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
      ...(aviso ? { emailsDeAprovacao: aviso.enviados, semSmtp: aviso.semSmtp } : {}),
    },
  });

  revalidar();
  return { ok: true, aguardandoAprovacao: approvalStatus === "AGUARDANDO" };
}

/** Cancela um lançamento manual em aberto. Nunca apaga. */
export async function cancelarLancamentoManual(entryId: string): Promise<ResultadoDoManual> {
  const prisma = getPrisma();
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado." };
  const conta = await prisma.financeEntry.findFirst({
    where: { id: entryId, tenantId: ctx.tenantId },
    select: { id: true, companyId: true, status: true, paidAt: true, fiscalDocumentId: true, agreementId: true },
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
    where: { id: entryId, tenantId: c.tenantId, status: conta.status, paidAt: null, agreementId: null },
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

// ─── Importação por CSV ─────────────────────────────────────────────────────

/** Teto do texto recebido. O limite do corpo da action é 10 MB; o CSV de 2.000 linhas cabe em muito menos. */
const MAXIMO_DE_BYTES = 2 * 1024 * 1024;

async function prepararParaEmpresa(tenantId: string, companyId: string, texto: string): Promise<PreviaDaImportacao> {
  const prisma = getPrisma();
  const hojeKey = saoPauloParts(new Date()).dateKey;
  const categorias = await prisma.financeCategory.findMany({
    where: { tenantId, active: true },
    select: { id: true, name: true, kind: true },
  });
  const casaveis = categorias.map((c) => ({ id: c.id, nome: c.name, kind: c.kind }));

  // Primeira passada só para saber quais competências o arquivo toca — a
  // consulta de duplicidade não precisa do histórico inteiro da empresa.
  const rascunho = prepararImportacao(texto, hojeKey, casaveis, new Set());
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
  return prepararImportacao(texto, hojeKey, casaveis, chaves);
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

  const contrapartes = await c.prisma.financeCounterparty.findMany({
    where: { tenantId: c.tenantId, companyId },
    select: { id: true, name: true, document: true, defaultCategoryId: true },
  });
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
            select: { id: true, name: true, document: true, defaultCategoryId: true },
          });
          if (contraparte.document) porDocumento.set(contraparte.document, contraparte);
          else porNome.set(chaveDaCategoria(contraparte.name), contraparte);
        }

        const status = statusInicialDoManual(d.pagoEmKey);
        const approvalStatus = entrada.statusInicial(companyId, d.kind, status);
        const criado = await tx.financeEntry.create({
          data: {
            tenantId: c.tenantId,
            companyId,
            kind: d.kind,
            status,
            approvalStatus,
            counterpartyId: contraparte.id,
            categoryId: d.categoryId,
            competence: d.competencia,
            dueDate: instanteDaData(d.vencimentoKey),
            paidAt: d.pagoEmKey ? instanteDaData(d.pagoEmKey) : null,
            amount: decimalDeCentavos(d.centavos),
            description: d.descricao,
            createdById: c.ctx.userId || null,
            reviewedById: c.ctx.userId || null,
            reviewedAt: hoje,
          },
          select: { id: true, amount: true },
        });
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
