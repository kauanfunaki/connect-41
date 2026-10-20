"use server";

// Editar um lançamento — as duas actions da janela "Editar" de Contas a pagar,
// Contas a receber e Lançamentos (19/10). A regra de cada campo é pura e mora
// em `edicao.ts`; aqui, a leitura, a conferência e a gravação.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { getAuthContext } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { saoPauloParts } from "@/lib/agenda";
import { nomeExibicao } from "@/lib/companyName";
import { travasDaEdicao, aprovacaoDepoisDaEdicao, type Travas, type CampoEditavel } from "./edicao";
import { categoriaObrigatoria } from "./lancamento";
import { categoriaDaEmpresa, ondeDaEmpresa } from "./planoDeContas";
import { centavosDeTexto, decimalDeCentavos, TAMANHO_MAXIMO_DO_NUMERO_DO_DOCUMENTO } from "./manual";
import { centavosDeDecimal } from "./contas";
import { competenciaValida, dataValida, instanteDaData } from "./periodo";
import { projetoInformado } from "./projetoServidor";
import { contaPrevistaInformada, contasBancariasDaEmpresa } from "./contaPrevistaServidor";
import { contextoDeEntrada, registrarEnvios, avisarAprovadores } from "./aprovacao/servidor";
import { podeEditarOTipo } from "./acessoDaConta";
import { anexosDaConta, type AnexoDaConta } from "./anexos";

/** Teto do `Decimal(12,2)`, o mesmo do lançamento manual. */
const MAIOR_VALOR_EM_CENTAVOS = 9_999_999_999_99;

type Opcao = { id: string; nome: string };

export type DadosDaEdicao =
  | {
      ok: true;
      conta: {
        id: string;
        kind: "PAGAR" | "RECEBER";
        empresaId: string;
        empresaNome: string;
        contraparteId: string;
        categoriaId: string | null;
        centroId: string | null;
        projetoId: string | null;
        /** A conta corrente prevista (lote D, 20/10). */
        contaId: string | null;
        competencia: string;
        emissaoKey: string | null;
        numeroDocumento: string | null;
        vencimentoKey: string;
        /** "1.234,56" — como o campo de valor recebe. */
        valor: string;
        descricao: string | null;
        pagoEmKey: string | null;
        /** De onde veio, para a janela dizer: "da nota NF-e nº 123", "do Omie". */
        origem: "manual" | "nota" | "omie";
        aprovada: boolean;
        /** O `updatedAt` lido — volta no envio, e a gravação recusa se a conta mudou desde então. */
        versao: string;
      };
      travas: Travas;
      opcoes: { contrapartes: (Opcao & { documento: string | null })[]; categorias: Opcao[]; centros: Opcao[]; projetos: Opcao[]; contas: Opcao[] };
      /** Os anexos da conta (lote H2). Não têm trava: guardar o boleto não mexe no dinheiro. */
      anexos: AnexoDaConta[];
    }
  | { ok: false; erro: string };

const CAMPOS_DA_CONTA = {
  id: true,
  tenantId: true,
  companyId: true,
  kind: true,
  status: true,
  paidAt: true,
  closeReason: true,
  fiscalDocumentId: true,
  agreementId: true,
  omieTitleId: true,
  omieMovementId: true,
  omieReconciledAt: true,
  approvalStatus: true,
  counterpartyId: true,
  categoryId: true,
  costCenterId: true,
  projectId: true,
  bankAccountId: true,
  competence: true,
  issueDate: true,
  documentNumber: true,
  dueDate: true,
  amount: true,
  description: true,
  updatedAt: true,
  paidPrincipal: true,
  bankMatches: { select: { id: true }, take: 1 },
  company: { select: { name: true, displayName: true } },
} as const;

async function lerConta(entryId: string, tenantId: string) {
  return getPrisma().financeEntry.findFirst({ where: { id: entryId, tenantId }, select: CAMPOS_DA_CONTA });
}

function travasDa(conta: NonNullable<Awaited<ReturnType<typeof lerConta>>>) {
  return travasDaEdicao({
    status: conta.status,
    paidAt: conta.paidAt,
    closeReason: conta.closeReason,
    fiscalDocumentId: conta.fiscalDocumentId,
    agreementId: conta.agreementId,
    doOmie: conta.omieTitleId !== null || conta.omieMovementId !== null,
    conciliada: conta.bankMatches.length > 0 || conta.omieReconciledAt !== null,
    temBaixa: Number(conta.paidPrincipal.toString()) > 0,
  });
}

const chaveDoDia = (d: Date | null) => (d ? saoPauloParts(d).dateKey : null);

function valorNoCampo(amount: { toString(): string }): string {
  return Number(centavosDeDecimal(amount) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** A conta, o que está travado e as listas dos seletores — o que a janela precisa para abrir. */
export async function dadosParaEditar(entryId: string): Promise<DadosDaEdicao> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Não autenticado." };
  const conta = await lerConta(entryId, ctx.tenantId);
  if (!conta) return { ok: false, erro: "Lançamento não encontrado." };
  const acesso = await podeEditarOTipo(conta.kind);
  if (!acesso.ctx) return { ok: false, erro: acesso.erro ?? "Sem permissão." };

  const veredito = travasDa(conta);
  if (!veredito.pode) return { ok: false, erro: veredito.motivo };

  const prisma = getPrisma();
  const { tenantId, companyId } = conta;
  // O valor atual entra na lista mesmo inativo: abrir a janela para mudar a
  // descrição não pode obrigar a trocar um centro que foi inativado depois.
  const [contrapartes, categorias, centros, projetos, anexos, contas] = await Promise.all([
    prisma.financeCounterparty.findMany({
      where: { tenantId, companyId, OR: [{ active: true }, { id: conta.counterpartyId }] },
      select: { id: true, name: true, document: true, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.financeCategory.findMany({
      where: {
        OR: [ondeDaEmpresa(tenantId, companyId, { kind: conta.kind }), ...(conta.categoryId ? [{ id: conta.categoryId, tenantId }] : [])],
      },
      select: { id: true, name: true, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.costCenter.findMany({
      where: { tenantId, companyId, OR: [{ active: true }, ...(conta.costCenterId ? [{ id: conta.costCenterId }] : [])] },
      select: { id: true, name: true, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.financeProject.findMany({
      where: { tenantId, companyId, OR: [{ active: true }, ...(conta.projectId ? [{ id: conta.projectId }] : [])] },
      select: { id: true, name: true, active: true },
      orderBy: { name: "asc" },
    }),
    anexosDaConta(tenantId, conta.id),
    contasBancariasDaEmpresa(tenantId, companyId, conta.bankAccountId),
  ]);
  const comInativo = (o: { id: string; name: string; active: boolean }) => ({ id: o.id, nome: o.active ? o.name : `${o.name} (inativo)` });

  return {
    ok: true,
    conta: {
      id: conta.id,
      kind: conta.kind,
      empresaId: conta.companyId,
      empresaNome: nomeExibicao(conta.company),
      contraparteId: conta.counterpartyId,
      categoriaId: conta.categoryId,
      centroId: conta.costCenterId,
      projetoId: conta.projectId,
      contaId: conta.bankAccountId,
      competencia: conta.competence,
      emissaoKey: chaveDoDia(conta.issueDate),
      numeroDocumento: conta.documentNumber,
      vencimentoKey: saoPauloParts(conta.dueDate).dateKey,
      valor: valorNoCampo(conta.amount),
      descricao: conta.description,
      pagoEmKey: chaveDoDia(conta.paidAt),
      origem: conta.fiscalDocumentId ? "nota" : conta.omieTitleId || conta.omieMovementId ? "omie" : "manual",
      aprovada: conta.approvalStatus === "APROVADO",
      versao: conta.updatedAt.toISOString(),
    },
    travas: veredito.travas,
    opcoes: {
      contrapartes: contrapartes.map((c) => ({ ...comInativo(c), documento: c.document })),
      categorias: categorias.map(comInativo),
      centros: centros.map(comInativo),
      projetos: projetos.map(comInativo),
      contas,
    },
    anexos,
  };
}

export type ResultadoDaEdicao = { error: string } | { ok: true; aviso?: string | null };

/**
 * Grava a edição — **só o que mudou** e só o que não está travado. Campo
 * travado que chega no formulário (desabilitado não é enviado, mas um POST à
 * mão poderia) é ignorado, não gravado.
 *
 * Condicionada ao `updatedAt` lido: se outra pessoa pagou, conciliou ou editou
 * a conta entre abrir a janela e salvar, nada muda e a tela pede para atualizar.
 * A auditoria guarda o antes e o depois de cada campo que mudou.
 */
export async function editarLancamento(formData: FormData): Promise<ResultadoDaEdicao> {
  const texto = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const veio = (k: string) => formData.has(k);

  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado." };
  const conta = await lerConta(texto("entryId"), ctx.tenantId);
  if (!conta) return { error: "Lançamento não encontrado." };
  const acesso = await podeEditarOTipo(conta.kind);
  if (!acesso.ctx) return { error: acesso.erro ?? "Sem permissão." };
  // A janela leva o `updatedAt` com que abriu: o que mudou desde então não é
  // sobrescrito por quem estava olhando a versão velha.
  if (texto("versao") !== conta.updatedAt.toISOString()) return { error: "A conta mudou desde que a janela abriu — feche e abra de novo." };

  const veredito = travasDa(conta);
  if (!veredito.pode) return { error: veredito.motivo };
  const livre = (c: CampoEditavel, campoDoForm: string) => !veredito.travas[c] && veio(campoDoForm);

  const { tenantId, companyId, kind } = conta;
  const prisma = getPrisma();
  const data: Prisma.FinanceEntryUncheckedUpdateManyInput = {};
  // Para a auditoria, tudo como texto: data como o dia, valor como o decimal.
  const comoTexto = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? chaveDoDia(v) : String(v));
  const antes: Record<string, string | null> = {};
  const depois: Record<string, string | null> = {};
  const mudar = (coluna: keyof Prisma.FinanceEntryUncheckedUpdateManyInput, de: unknown, para: unknown) => {
    const igual = de instanceof Date && para instanceof Date ? de.getTime() === para.getTime() : de === para;
    if (igual) return;
    (data as Record<string, unknown>)[coluna] = para;
    antes[coluna] = comoTexto(de);
    depois[coluna] = comoTexto(para);
  };

  if (livre("contraparte", "counterpartyId")) {
    const id = texto("counterpartyId");
    if (!id) return { error: kind === "PAGAR" ? "Escolha o fornecedor." : "Escolha o cliente." };
    if (id !== conta.counterpartyId) {
      const existe = await prisma.financeCounterparty.findFirst({ where: { id, tenantId, companyId, active: true }, select: { id: true } });
      if (!existe) return { error: "Contraparte não encontrada (ou inativa) nesta empresa." };
    }
    mudar("counterpartyId", conta.counterpartyId, id);
  }

  if (livre("categoria", "categoryId")) {
    const id = texto("categoryId") || null;
    if (!id && categoriaObrigatoria(kind)) return { error: "Conta a pagar precisa de categoria — despesa sem classificação não fecha o DRE." };
    if (id && id !== conta.categoryId) {
      const existe = await prisma.financeCategory.findFirst({ where: { ...categoriaDaEmpresa(tenantId, companyId, id, kind), active: true }, select: { id: true } });
      if (!existe) return { error: "Categoria não encontrada no plano desta empresa para este tipo de conta." };
    }
    mudar("categoryId", conta.categoryId, id);
  }

  if (livre("centro", "costCenterId")) {
    const id = texto("costCenterId") || null;
    if (id && id !== conta.costCenterId) {
      const centro = await prisma.costCenter.findFirst({ where: { id, tenantId, companyId }, select: { active: true } });
      if (!centro) return { error: "Centro de custo não encontrado nesta empresa." };
      if (!centro.active) return { error: "Centro de custo inativo — escolha outro ou reative no cadastro." };
    }
    mudar("costCenterId", conta.costCenterId, id);
  }

  if (livre("projeto", "projectId")) {
    const p = await projetoInformado({ tenantId, companyId, informadoId: texto("projectId") || null, atualId: conta.projectId });
    if (!p.ok) return { error: p.erro };
    mudar("projectId", conta.projectId, p.projetoId);
  }

  if (livre("conta", "bankAccountId")) {
    const cc = await contaPrevistaInformada({ tenantId, companyId, informadoId: texto("bankAccountId") || null, atualId: conta.bankAccountId });
    if (!cc.ok) return { error: cc.erro };
    mudar("bankAccountId", conta.bankAccountId, cc.contaId);
  }

  if (livre("competencia", "competencia")) {
    const c = competenciaValida(texto("competencia"));
    if (!c) return { error: "Competência inválida — use o formato AAAA-MM." };
    mudar("competence", conta.competence, c);
  }

  const hojeKey = saoPauloParts(new Date()).dateKey;
  if (livre("emissao", "emissao")) {
    const bruto = texto("emissao");
    let emissao: Date | null = null;
    if (bruto) {
      const key = dataValida(bruto);
      if (!key) return { error: "Data de emissão inválida." };
      if (key > hojeKey) return { error: "A data de emissão não pode ser futura." };
      emissao = instanteDaData(key);
    }
    // Compara o dia, não o instante: a emissão do Omie e a da nota não foram
    // gravadas ao meio-dia, e "não mexi" não pode virar "mudou".
    if (chaveDoDia(emissao) !== chaveDoDia(conta.issueDate)) mudar("issueDate", conta.issueDate, emissao);
  }

  if (livre("numeroDocumento", "numeroDocumento")) {
    const n = texto("numeroDocumento").replace(/\s+/g, " ");
    if (n.length > TAMANHO_MAXIMO_DO_NUMERO_DO_DOCUMENTO) return { error: `Número do documento com mais de ${TAMANHO_MAXIMO_DO_NUMERO_DO_DOCUMENTO} caracteres.` };
    mudar("documentNumber", conta.documentNumber, n || null);
  }

  if (livre("descricao", "descricao")) {
    const d = texto("descricao");
    if (d.length > 255) return { error: "Descrição com mais de 255 caracteres." };
    mudar("description", conta.description, d || null);
  }

  if (livre("vencimento", "vencimento")) {
    const key = dataValida(texto("vencimento"));
    if (!key) return { error: "Informe um vencimento válido." };
    if (key !== saoPauloParts(conta.dueDate).dateKey) mudar("dueDate", conta.dueDate, instanteDaData(key));
  }

  if (livre("valor", "valor")) {
    const centavos = centavosDeTexto(texto("valor"));
    if (centavos === null) return { error: "Valor ilegível. Use, por exemplo, 1.234,56." };
    if (centavos === 0) return { error: "O valor não pode ser zero." };
    if (centavos > MAIOR_VALOR_EM_CENTAVOS) return { error: "Valor acima do limite do financeiro." };
    if (centavos !== centavosDeDecimal(conta.amount)) mudar("amount", conta.amount.toString(), decimalDeCentavos(centavos));
  }

  if (Object.keys(data).length === 0) return { ok: true, aviso: null };

  const mudouValor = "amount" in data;
  const mudouContraparte = "counterpartyId" in data;
  const entraria =
    kind === "PAGAR" && conta.approvalStatus === "APROVADO" && (mudouValor || mudouContraparte)
      ? (await contextoDeEntrada(tenantId, [companyId])).statusInicial(companyId, kind, conta.status) === "AGUARDANDO"
      : false;
  const reenviar =
    aprovacaoDepoisDaEdicao({ kind, approvalStatus: conta.approvalStatus, mudouValor, mudouContraparte, entraria }) === "REENVIAR";
  if (reenviar) {
    data.approvalStatus = "AGUARDANDO";
    data.approvedAt = null;
  }

  const gravou = await prisma.$transaction(async (tx) => {
    const r = await tx.financeEntry.updateMany({ where: { id: conta.id, tenantId, updatedAt: conta.updatedAt }, data });
    if (r.count !== 1) return false;
    if (reenviar) await registrarEnvios(tx, [conta.id], ctx.userId || null);
    return true;
  });
  if (!gravou) return { error: "A conta acabou de mudar (baixa, conciliação ou outra edição) — feche e abra de novo." };

  const valorFinal = typeof data.amount === "string" ? data.amount : conta.amount.toString();
  const avisos = reenviar ? await avisarAprovadores(tenantId, [{ companyId, amount: valorFinal }]) : null;

  await logAudit({
    tenantId,
    userId: ctx.userId,
    action: "finance.edit",
    entityType: "FinanceEntry",
    entityId: conta.id,
    metadata: {
      kind,
      antes,
      depois,
      ...(reenviar ? { reenviadaParaAprovacao: true, emailsDeAprovacao: avisos?.enviados ?? 0 } : {}),
    },
  });

  for (const p of ["/pagar", "/receber", "/lancamentos", "/fluxo-de-caixa", "/dre", "/dre/economica", "/dre/analises", "/conciliacao", "/aprovacoes"]) {
    revalidatePath(p);
  }
  revalidatePath("/cobranca", "layout");
  return {
    ok: true,
    aviso: reenviar ? "A conta estava aprovada e mudou de valor ou de fornecedor — voltou para a aprovação." : null,
  };
}
