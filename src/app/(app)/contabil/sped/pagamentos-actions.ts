"use server";

// As ações dos Pagamentos sem nota (03/11/2026): a conferência dos documentos
// lidos, as regras por categoria e por nome e as contas-modelo. Tudo grava na
// empresa base (a matriz), como o de-para das notas. Mesmas travas de
// `actions.ts`: módulo no nível `agir`, empresa do escritório, 404 de fora.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, type AuthContext } from "@/lib/auth/context";
import { podeExcluir, SO_ADMIN_EXCLUI } from "@/lib/auth/papeis";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import { empresaContabilVisivel, type EmpresaDoContabil } from "@/lib/contabil/servidor";
import { chaveDoNome } from "@/lib/contabil/lancamentos";
import { CATEGORIAS, CONTAS_DO_MOTOR, TIPOS_DE_PAGAMENTO, type ContasDosPagamentos } from "@/lib/contabil/pagamentos";
import { armazenamentoDosPagamentos } from "@/lib/contabil/importacaoDePagamentos";

const MODULO = "contabil_sped";
const CAMINHO = "/contabil/sped";

export type ResultadoDosPagamentos = { ok: true; mensagem: string } | { ok: false; erro: string };
const falha = (erro: string): ResultadoDosPagamentos => ({ ok: false, erro });

async function abrir(companyId: unknown): Promise<{ ctx: AuthContext & { userId: string }; empresa: EmpresaDoContabil } | ResultadoDosPagamentos> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return falha("Não autenticado.");
  if (!(await podeNoModulo(ctx, MODULO, "agir"))) return falha("Seu perfil não permite esta ação.");
  const id = z.string().uuid().safeParse(companyId);
  const empresa = id.success ? await empresaContabilVisivel(ctx, id.data) : null;
  if (!empresa) return falha("Empresa não encontrada.");
  return { ctx: { ...ctx, userId: ctx.userId }, empresa };
}
const recusou = (a: Awaited<ReturnType<typeof abrir>>): a is ResultadoDosPagamentos => "ok" in a;

const conta = z.string().trim().regex(/^\d{0,10}$/, "A conta é o código reduzido da Domínio, só números.");
const historico = z.string().trim().regex(/^\d{0,10}$/, "O histórico é o código da Domínio, só números.");
const competencia = z.string().trim().regex(/^(\d{4}-(0[1-9]|1[0-2]))?$/, "A competência é AAAA-MM.");
const data = z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, "A data é AAAA-MM-DD.");
const documento = z.string().transform((v) => v.replace(/\D/g, "")).pipe(z.string().regex(/^(\d{11}|\d{14})?$/, "O CPF tem 11 dígitos e o CNPJ, 14."));
/** "1.234,56" ou "1234.56" → "1234.56"; vazio → null. */
const valor = z.string().trim().transform((v, c) => {
  if (!v) return null;
  const normal = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(normal)) { c.addIssue({ code: "custom", message: "Valor inválido. Use 1.234,56." }); return z.NEVER; }
  return Number(normal).toFixed(2);
});
const categoria = z.enum(CATEGORIAS.map(([c]) => c) as [string, ...string[]]);

async function doPagamento(a: { ctx: AuthContext; empresa: EmpresaDoContabil }, id: string) {
  return getPrisma().contabilPagamento.findFirst({ where: { id, tenantId: a.ctx.tenantId, companyId: a.empresa.baseId }, select: { id: true, nome: true, arquivoId: true } });
}

const correcaoSchema = z.object({
  empresa: z.string(), id: z.string().uuid(),
  nome: z.string().trim().max(200), documento, valor, competencia, dataPagamento: data,
  tipo: z.union([z.literal(""), z.enum(TIPOS_DE_PAGAMENTO)]), categoria: z.union([z.literal(""), categoria]),
});

/** Corrige o que a leitura achou. Campo vazio volta a valer o lido; a leitura original não se perde. */
export async function corrigirPagamento(entrada: unknown): Promise<ResultadoDosPagamentos> {
  const e = correcaoSchema.safeParse(entrada);
  if (!e.success) return falha(e.error.issues[0]?.message ?? "Confira os dados.");
  const a = await abrir(e.data.empresa);
  if (recusou(a)) return a;
  const p = await doPagamento(a, e.data.id);
  if (!p) return falha("Pagamento não encontrado.");
  const dados = {
    nomeCorrigido: e.data.nome, documentoCorrigido: e.data.documento, valorCorrigido: e.data.valor, competenciaCorrigida: e.data.competencia,
    dataPagamentoCorrigida: e.data.dataPagamento, tipoCorrigido: e.data.tipo, categoriaCorrigida: e.data.categoria,
  };
  await getPrisma().contabilPagamento.update({ where: { id: p.id }, data: { ...dados, corrigidoPorId: a.ctx.userId, corrigidoEm: new Date() } });
  await logAudit({ tenantId: a.ctx.tenantId, userId: a.ctx.userId, action: "contabil.pagamento.corrigido", entityType: "ContabilPagamento", entityId: p.id, metadata: { nome: e.data.nome || p.nome, ...dados } });
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Correção gravada. Os lançamentos já foram refeitos." };
}

const decisaoSchema = z.object({ empresa: z.string(), id: z.string().uuid(), decisao: z.enum(["", "aceito", "descartado"]), motivo: z.string().trim().max(300).default("") });

/** Aceita (conta mesmo que a leitura peça conferência), descarta ou desfaz a decisão. */
export async function decidirPagamento(entrada: unknown): Promise<ResultadoDosPagamentos> {
  const e = decisaoSchema.safeParse(entrada);
  if (!e.success) return falha("Decisão inválida.");
  const a = await abrir(e.data.empresa);
  if (recusou(a)) return a;
  const p = await doPagamento(a, e.data.id);
  if (!p) return falha("Pagamento não encontrado.");
  await getPrisma().contabilPagamento.update({ where: { id: p.id }, data: { decisao: e.data.decisao, motivoDecisao: e.data.motivo, decididoPorId: e.data.decisao ? a.ctx.userId : null, decididoEm: e.data.decisao ? new Date() : null } });
  await logAudit({ tenantId: a.ctx.tenantId, userId: a.ctx.userId, action: "contabil.pagamento.decidido", entityType: "ContabilPagamento", entityId: p.id, metadata: { nome: p.nome, decisao: e.data.decisao || "desfeita", motivo: e.data.motivo } });
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: e.data.decisao === "aceito" ? "Pagamento aceito: ele entra nos lançamentos." : e.data.decisao === "descartado" ? "Pagamento descartado: ele sai dos lançamentos." : "Decisão desfeita: vale o que a leitura disse." };
}

const preenchimentoSchema = z.object({
  empresa: z.string(), arquivoId: z.string().uuid(), pagina: z.coerce.number().int().min(1).max(10000),
  nome: z.string().trim().min(1, "Informe o nome de quem recebeu.").max(200), documento, numero: z.string().trim().max(30).default(""),
  valor: valor.refine((v) => v !== null, "Informe o valor."), competencia: competencia.refine(Boolean, "Informe a competência."), dataPagamento: data,
});

/**
 * O pagamento de uma página sem texto, digitado por quem conferiu o documento.
 * O Connect não faz OCR (decisão de 03/11/2026): a linha entra aceita, com o
 * nome de quem preencheu, e a lápide do arquivo ilegível sai da conferência.
 */
export async function preencherPagina(entrada: unknown): Promise<ResultadoDosPagamentos> {
  const e = preenchimentoSchema.safeParse(entrada);
  if (!e.success) return falha(e.error.issues[0]?.message ?? "Confira os dados.");
  const a = await abrir(e.data.empresa);
  if (recusou(a)) return a;
  const prisma = getPrisma();
  const arquivo = await prisma.contabilDocumentoPagamento.findFirst({ where: { id: e.data.arquivoId, tenantId: a.ctx.tenantId, companyId: a.empresa.baseId }, select: { id: true, tipo: true, nome: true, paginas: true } });
  if (!arquivo || arquivo.tipo === "planilha_bpo" || arquivo.tipo === "fatura") return falha("Documento não encontrado.");
  if (arquivo.paginas && e.data.pagina > arquivo.paginas) return falha(`O documento tem ${arquivo.paginas} página(s).`);
  const ultima = await prisma.contabilPagamento.findFirst({ where: { arquivoId: arquivo.id, pagina: e.data.pagina }, orderBy: { ordem: "desc" }, select: { ordem: true } });
  const criado = await prisma.$transaction(async (tx) => {
    const p = await tx.contabilPagamento.create({
      data: {
        tenantId: a.ctx.tenantId, companyId: a.empresa.baseId, arquivoId: arquivo.id, pagina: e.data.pagina, ordem: (ultima?.ordem ?? 0) + 1, tipo: arquivo.tipo,
        nome: e.data.nome, documento: e.data.documento, numero: e.data.numero, bruto: e.data.valor, liquido: e.data.valor, competencia: e.data.competencia, dataPagamento: e.data.dataPagamento,
        situacao: "conferir", observacao: "página sem texto: valores preenchidos à mão", decisao: "aceito", motivoDecisao: "preenchido à mão a partir do documento", decididoPorId: a.ctx.userId, decididoEm: new Date(),
      },
    });
    await tx.contabilPagamento.updateMany({ where: { arquivoId: arquivo.id, pagina: 0, situacao: "invalido", decisao: "" }, data: { decisao: "descartado", motivoDecisao: "substituída pelo preenchimento à mão", decididoPorId: a.ctx.userId, decididoEm: new Date() } });
    return p;
  });
  await logAudit({ tenantId: a.ctx.tenantId, userId: a.ctx.userId, action: "contabil.pagamento.preenchido", entityType: "ContabilPagamento", entityId: criado.id, metadata: { nome: e.data.nome, arquivo: arquivo.nome, pagina: e.data.pagina, valor: e.data.valor, competencia: e.data.competencia } });
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Pagamento preenchido. Ele já entra nos lançamentos." };
}

const regraDaCategoriaSchema = z.object({ empresa: z.string(), categoria, codigoDebito: conta, contaCredito: conta, observacao: z.string().trim().max(500).default("") });

/** O débito (e o crédito padrão) de uma categoria: um cadastro resolve todos os documentos dela. */
export async function salvarRegraDaCategoria(entrada: unknown): Promise<ResultadoDosPagamentos> {
  const e = regraDaCategoriaSchema.safeParse(entrada);
  if (!e.success) return falha(e.error.issues[0]?.message ?? "Confira os dados da regra.");
  const a = await abrir(e.data.empresa);
  if (recusou(a)) return a;
  const { categoria: c, codigoDebito, contaCredito, observacao } = e.data;
  const r = await getPrisma().contabilPagamentoCategoria.upsert({
    where: { companyId_categoria: { companyId: a.empresa.baseId, categoria: c } },
    create: { tenantId: a.ctx.tenantId, companyId: a.empresa.baseId, categoria: c, codigoDebito, contaCredito, observacao, updatedById: a.ctx.userId },
    update: { codigoDebito, contaCredito, observacao, updatedById: a.ctx.userId },
  });
  await logAudit({ tenantId: a.ctx.tenantId, userId: a.ctx.userId, action: "contabil.pagamento.categoria.salva", entityType: "ContabilPagamentoCategoria", entityId: r.id, metadata: { nome: CATEGORIAS.find(([k]) => k === c)?.[1] ?? c, codigoDebito, contaCredito, observacao } });
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Regra da categoria salva. Os lançamentos já foram refeitos." };
}

const nomeSchema = z.object({ empresa: z.string(), nome: z.string().trim().min(1, "O nome do fornecedor está vazio.").max(200), contaCredito: conta.refine(Boolean, "Informe a conta de crédito.") });

/**
 * Confirma a conta de crédito de um fornecedor que vem sem CPF/CNPJ. Responde
 * o que gravou, com a conta como o plano a conhece, ou que ela não está no
 * plano carregado (20/10/2026: sem isso a linha sumia e ninguém via nada).
 */
export async function salvarContaPorNome(entrada: unknown): Promise<ResultadoDosPagamentos & { chaveNome?: string; contaNoPlano?: boolean }> {
  const e = nomeSchema.safeParse(entrada);
  if (!e.success) return falha(e.error.issues[0]?.message ?? "Confira os dados.");
  const a = await abrir(e.data.empresa);
  if (recusou(a)) return a;
  const chaveNome = chaveDoNome(e.data.nome);
  if (!chaveNome) return falha("O nome do fornecedor está vazio.");
  const prisma = getPrisma();
  const daConta = await prisma.contabilConta.findFirst({ where: { tenantId: a.ctx.tenantId, companyId: a.empresa.baseId, reduzido: e.data.contaCredito }, select: { classificacao: true, nome: true, analitica: true } });
  if (daConta && !daConta.analitica) return falha("A conta de crédito é sintética: escolha uma analítica.");
  const r = await prisma.contabilPagamentoNome.upsert({
    where: { companyId_chaveNome: { companyId: a.empresa.baseId, chaveNome } },
    create: { tenantId: a.ctx.tenantId, companyId: a.empresa.baseId, chaveNome, nome: e.data.nome, contaCredito: e.data.contaCredito, updatedById: a.ctx.userId },
    update: { nome: e.data.nome, contaCredito: e.data.contaCredito, updatedById: a.ctx.userId },
  });
  await logAudit({ tenantId: a.ctx.tenantId, userId: a.ctx.userId, action: "contabil.pagamento.nome.salvo", entityType: "ContabilPagamentoNome", entityId: r.id, metadata: { nome: e.data.nome, chaveNome, contaCredito: e.data.contaCredito } });
  revalidatePath(CAMINHO);
  const conhecida = daConta ? `${e.data.contaCredito} — ${daConta.classificacao} — ${daConta.nome}` : `${e.data.contaCredito}, que não está no plano carregado`;
  return { ok: true, mensagem: `${e.data.nome}: crédito na conta ${conhecida}.`, chaveNome, contaNoPlano: !!daConta };
}

export async function removerContaPorNome(entrada: unknown): Promise<ResultadoDosPagamentos> {
  const e = z.object({ empresa: z.string(), id: z.string().uuid() }).safeParse(entrada);
  if (!e.success) return falha("Regra inválida.");
  const a = await abrir(e.data.empresa);
  if (recusou(a)) return a;
  const prisma = getPrisma();
  const r = await prisma.contabilPagamentoNome.findFirst({ where: { id: e.data.id, tenantId: a.ctx.tenantId, companyId: a.empresa.baseId } });
  if (!r) return falha("Regra não encontrada.");
  await prisma.contabilPagamentoNome.delete({ where: { id: r.id } });
  await logAudit({ tenantId: a.ctx.tenantId, userId: a.ctx.userId, action: "contabil.pagamento.nome.removido", entityType: "ContabilPagamentoNome", entityId: r.id, metadata: { nome: r.nome, contaCredito: r.contaCredito } });
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Conta do nome removida." };
}

const CHAVES = Object.keys(CONTAS_DO_MOTOR) as (keyof ContasDosPagamentos)[];
const contasSchema = z.object({
  empresa: z.string(),
  restaurar: z.boolean().default(false),
  contas: z.object(Object.fromEntries(CHAVES.map((k) => [k, k.endsWith("Historico") ? historico : conta])) as Record<keyof ContasDosPagamentos, typeof conta>).partial().default({}),
});

/** As contas dos lançamentos-modelo da empresa. `restaurar` volta aos códigos do motor. */
export async function salvarContasDosPagamentos(entrada: unknown): Promise<ResultadoDosPagamentos> {
  const e = contasSchema.safeParse(entrada);
  if (!e.success) return falha(e.error.issues[0]?.message ?? "Confira as contas.");
  const a = await abrir(e.data.empresa);
  if (recusou(a)) return a;
  const prisma = getPrisma();
  if (e.data.restaurar) await prisma.contabilContaPagamento.deleteMany({ where: { tenantId: a.ctx.tenantId, companyId: a.empresa.baseId } });
  else {
    await prisma.$transaction(CHAVES.filter((k) => e.data.contas[k] !== undefined).map((chave) => prisma.contabilContaPagamento.upsert({
      where: { companyId_chave: { companyId: a.empresa.baseId, chave } },
      create: { tenantId: a.ctx.tenantId, companyId: a.empresa.baseId, chave, conta: e.data.contas[chave]!, updatedById: a.ctx.userId },
      update: { conta: e.data.contas[chave]!, updatedById: a.ctx.userId },
    })));
  }
  await logAudit({ tenantId: a.ctx.tenantId, userId: a.ctx.userId, action: "contabil.pagamento.contas.salvas", entityType: "ContabilContaPagamento", entityId: a.empresa.baseId, metadata: e.data.restaurar ? { restaurou: "códigos do motor" } : e.data.contas });
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: e.data.restaurar ? "Contas dos pagamentos de volta aos códigos do motor." : "Contas dos pagamentos salvas. Os lançamentos já foram refeitos." };
}

/** Remove um envio e tudo o que foi lido dele, correções inclusive. */
export async function removerDocumentoDePagamento(entrada: unknown): Promise<ResultadoDosPagamentos> {
  const e = z.object({ empresa: z.string(), id: z.string().uuid() }).safeParse(entrada);
  if (!e.success) return falha("Documento inválido.");
  const a = await abrir(e.data.empresa);
  if (recusou(a)) return a;
  if (!podeExcluir(a.ctx)) return falha(SO_ADMIN_EXCLUI);
  const prisma = getPrisma();
  const doc = await prisma.contabilDocumentoPagamento.findFirst({ where: { id: e.data.id, tenantId: a.ctx.tenantId, companyId: a.empresa.baseId }, select: { id: true, nome: true, tipo: true, fileUrl: true, _count: { select: { pagamentos: true } } } });
  if (!doc) return falha("Documento não encontrado.");
  await prisma.$transaction([
    prisma.contabilPagamento.updateMany({ where: { tenantId: a.ctx.tenantId, companyId: a.empresa.baseId, comprovanteId: doc.id }, data: { comprovanteId: null } }),
    prisma.contabilDocumentoPagamento.delete({ where: { id: doc.id } }),
  ]);
  await armazenamentoDosPagamentos.apagarArquivos([doc.fileUrl]);
  await logAudit({ tenantId: a.ctx.tenantId, userId: a.ctx.userId, action: "contabil.pagamento.documento.removido", entityType: "ContabilDocumentoPagamento", entityId: doc.id, metadata: { nome: doc.nome, tipo: doc.tipo, linhas: doc._count.pagamentos } });
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: `${doc.nome} removido, com ${doc._count.pagamentos} linha(s) lida(s).` };
}
