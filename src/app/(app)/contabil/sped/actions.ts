"use server";

// As ações do SPED do Contábil (29/10/2026). De-para, plano e contas-modelo
// gravam no Connect, na empresa base (a matriz); o SPED Contribuições só
// enfileira no motor, que gera. Cada ação confere o módulo no nível `agir` e
// que a empresa é do escritório — 404 de fora, nunca 403.

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, type AuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import { parseCsv } from "@/lib/csv";
import { empresaDoContabil, type EmpresaDoContabil } from "@/lib/contabil/servidor";
import { lerPlanoDeContas } from "@/lib/contabil/plano";
import { chaveSchema, doErro, prepararEscrita, recusa, recusado, type ResultadoDoMotor } from "@/lib/fiscal/motor/acoes";
import { estabelecimentosDaRaiz } from "@/lib/fiscal/motor/servidor";
import { corpoDeExecucao } from "@/lib/fiscal/previa/doMotor";
import { parametrosIniciais } from "@/lib/fiscal/previa/execucao";
import type { ExecucaoDoMotor } from "@/lib/sped/motor";

const MODULO = "contabil_sped";
const CAMINHO = "/contabil/sped";

export type ResultadoDoContabil = { ok: true; mensagem: string } | { ok: false; erro: string };
const falha = (erro: string): ResultadoDoContabil => ({ ok: false, erro });

async function abrir(companyId: unknown): Promise<{ ctx: AuthContext; empresa: EmpresaDoContabil } | ResultadoDoContabil> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return falha("Não autenticado.");
  if (!(await podeNoModulo(ctx, MODULO, "agir"))) return falha("Seu perfil não permite esta ação.");
  const id = z.string().uuid().safeParse(companyId);
  const empresa = id.success ? await empresaDoContabil(ctx.tenantId, id.data) : null;
  if (!empresa) return falha("Empresa não encontrada.");
  return { ctx, empresa };
}
const recusou = (a: Awaited<ReturnType<typeof abrir>>): a is ResultadoDoContabil => "ok" in a;

const conta = z.string().trim().regex(/^\d{0,10}$/, "A conta é o código reduzido da Domínio, só números.");
const regraSchema = z.object({
  empresa: z.string(),
  cnpjFornecedor: z.string().regex(/^(\d{11}|\d{14})?$/, "CNPJ ou CPF do fornecedor inválido."),
  cfop: z.string().regex(/^(\d{4})?$/, "O CFOP tem quatro dígitos."),
  nomeFornecedor: z.string().trim().max(180).default(""),
  contaDebito: conta.default(""),
  contaCredito: conta.default(""),
  codigoHistorico: z.string().trim().regex(/^\d{0,10}$/, "O código do histórico é só números.").default(""),
  historico: z.string().trim().max(255).default(""),
});

/** Grava (ou corrige) a regra de um fornecedor — a mesma pendência volta várias vezes, então é upsert. */
export async function salvarRegra(entrada: unknown): Promise<ResultadoDoContabil> {
  const e = regraSchema.safeParse(entrada);
  if (!e.success) return falha(e.error.issues[0]?.message ?? "Confira os dados da regra.");
  const a = await abrir(e.data.empresa);
  if (recusou(a)) return a;
  const { cnpjFornecedor, cfop, nomeFornecedor, contaDebito, contaCredito, codigoHistorico, historico } = e.data;
  const dados = { cnpjFornecedor, cfop, nomeFornecedor, contaDebito, contaCredito, codigoHistorico, historico };
  if (!dados.cnpjFornecedor) return falha("Informe o fornecedor. Regra de CFOP para qualquer fornecedor só serve para deixar de fora.");
  if (!dados.contaCredito) return falha("Informe a conta de crédito.");
  const regra = await getPrisma().contabilRegra.upsert({
    where: { companyId_cnpjFornecedor_cfop: { companyId: a.empresa.baseId, cnpjFornecedor: dados.cnpjFornecedor, cfop: dados.cfop } },
    create: { tenantId: a.ctx.tenantId, companyId: a.empresa.baseId, ...dados, updatedById: a.ctx.userId },
    update: { ...dados, desconsiderar: false, updatedById: a.ctx.userId },
  });
  await logAudit({
    tenantId: a.ctx.tenantId,
    userId: a.ctx.userId,
    action: "contabil.regra.salva",
    entityType: "ContabilRegra",
    entityId: regra.id,
    metadata: { nome: dados.nomeFornecedor || dados.cnpjFornecedor, ...dados },
  });
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Regra salva. Os lançamentos já foram refeitos." };
}

const foraSchema = z.object({
  empresa: z.string(),
  cnpjFornecedor: z.string().regex(/^(\d{11}|\d{14})?$/),
  cfop: z.string().regex(/^(\d{4})?$/),
  nomeFornecedor: z.string().trim().max(180).default(""),
});

/** Tira um fornecedor (ou um CFOP de todos) da contabilidade: as notas saem contadas, sem lançamento. */
export async function deixarDeFora(entrada: unknown): Promise<ResultadoDoContabil> {
  const e = foraSchema.safeParse(entrada);
  if (!e.success) return falha("Confira o fornecedor e o CFOP.");
  const a = await abrir(e.data.empresa);
  if (recusou(a)) return a;
  const { cnpjFornecedor, cfop, nomeFornecedor } = e.data;
  if (!cnpjFornecedor && !cfop) return falha("Escolha o fornecedor ou o CFOP.");
  const regra = await getPrisma().contabilRegra.upsert({
    where: { companyId_cnpjFornecedor_cfop: { companyId: a.empresa.baseId, cnpjFornecedor, cfop } },
    create: { tenantId: a.ctx.tenantId, companyId: a.empresa.baseId, cnpjFornecedor, cfop, nomeFornecedor, desconsiderar: true, updatedById: a.ctx.userId },
    update: { desconsiderar: true, updatedById: a.ctx.userId },
  });
  await logAudit({
    tenantId: a.ctx.tenantId,
    userId: a.ctx.userId,
    action: "contabil.regra.desconsiderada",
    entityType: "ContabilRegra",
    entityId: regra.id,
    metadata: { nome: nomeFornecedor || cnpjFornecedor || `CFOP ${cfop}`, cnpjFornecedor, cfop },
  });
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Deixado de fora da contabilidade." };
}

/** Desfaz uma regra — volta a pendência, ou volta a lançar o que estava de fora. */
export async function removerRegra(entrada: unknown): Promise<ResultadoDoContabil> {
  const e = z.object({ empresa: z.string(), id: z.string().uuid() }).safeParse(entrada);
  if (!e.success) return falha("Regra não encontrada.");
  const a = await abrir(e.data.empresa);
  if (recusou(a)) return a;
  const prisma = getPrisma();
  const regra = await prisma.contabilRegra.findFirst({ where: { id: e.data.id, tenantId: a.ctx.tenantId, companyId: a.empresa.baseId } });
  if (!regra) return falha("Regra não encontrada.");
  await prisma.contabilRegra.delete({ where: { id: regra.id } });
  await logAudit({
    tenantId: a.ctx.tenantId,
    userId: a.ctx.userId,
    action: "contabil.regra.removida",
    entityType: "ContabilRegra",
    entityId: regra.id,
    metadata: { nome: regra.nomeFornecedor || regra.cnpjFornecedor || `CFOP ${regra.cfop}`, cnpjFornecedor: regra.cnpjFornecedor, cfop: regra.cfop },
  });
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: regra.desconsiderar ? "Voltou a entrar nos lançamentos." : "Regra removida." };
}

const modelosSchema = z.object({
  empresa: z.string(),
  debitoCte: conta.default(""),
  debitoNfse: conta.default(""),
  contaImobilizado: conta.default(""),
  historicoImobilizado: z.string().trim().regex(/^\d{0,10}$/, "O código do histórico é só números.").default(""),
  prefixoFornecedores: z.string().trim().regex(/^[\d.]{0,40}$/, "O prefixo é a classificação, como 2.1.3.01.").default(""),
  codigoFilial: z.string().trim().regex(/^\d{0,10}$/, "O código da filial é só números.").default(""),
});

/** As contas fixas da empresa: débito do frete, do serviço tomado e do imobilizado. */
export async function salvarModelos(entrada: unknown): Promise<ResultadoDoContabil> {
  const e = modelosSchema.safeParse(entrada);
  if (!e.success) return falha(e.error.issues[0]?.message ?? "Confira as contas.");
  const a = await abrir(e.data.empresa);
  if (recusou(a)) return a;
  const { debitoCte, debitoNfse, contaImobilizado, historicoImobilizado, prefixoFornecedores, codigoFilial } = e.data;
  const dados = { debitoCte, debitoNfse, contaImobilizado, historicoImobilizado, prefixoFornecedores, codigoFilial };
  await getPrisma().contabilModelo.upsert({
    where: { companyId: a.empresa.baseId },
    create: { tenantId: a.ctx.tenantId, companyId: a.empresa.baseId, ...dados, updatedById: a.ctx.userId },
    update: { ...dados, updatedById: a.ctx.userId },
  });
  await logAudit({
    tenantId: a.ctx.tenantId,
    userId: a.ctx.userId,
    action: "contabil.modelos.salvos",
    entityType: "ContabilModelo",
    entityId: a.empresa.baseId,
    metadata: dados,
  });
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Contas da empresa salvas." };
}

const LIMITE_DO_PLANO = 5 * 1024 * 1024;

async function linhasDoArquivo(arquivo: File): Promise<string[][]> {
  const bytes = Buffer.from(await arquivo.arrayBuffer());
  if (/\.csv$|\.txt$/i.test(arquivo.name)) {
    // A Domínio exporta em Windows-1252; UTF-8 inválido cai para Latin-1.
    const utf8 = bytes.toString("utf8");
    const { headers, rows } = parseCsv(utf8.includes("�") ? bytes.toString("latin1") : utf8);
    return [headers, ...rows];
  }
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.load(bytes as unknown as ArrayBuffer);
  const aba = livro.worksheets[0];
  const linhas: string[][] = [];
  aba?.eachRow({ includeEmpty: false }, (linha) => {
    linhas.push((linha.values as unknown[]).slice(1).map((v) => {
      if (v === null || v === undefined) return "";
      if (typeof v === "object" && "result" in (v as object)) return String((v as { result: unknown }).result ?? "");
      if (typeof v === "object" && "richText" in (v as object)) return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
      return String(v);
    }));
  });
  return linhas;
}

/** Substitui o plano de contas da empresa base pelo da planilha exportada da Domínio. */
export async function carregarPlano(formData: FormData): Promise<ResultadoDoContabil> {
  const a = await abrir(formData.get("empresa"));
  if (recusou(a)) return a;
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || !arquivo.size) return falha("Escolha a planilha do plano de contas.");
  if (arquivo.size > LIMITE_DO_PLANO) return falha("A planilha deve ter até 5 MB.");
  if (/\.xls$/i.test(arquivo.name)) return falha("Abra o .xls da Domínio no Excel e salve como .xlsx ou .csv antes de enviar.");
  if (!/\.(xlsx|csv|txt)$/i.test(arquivo.name)) return falha("Envie o plano em .xlsx ou .csv.");
  let leitura;
  try {
    leitura = lerPlanoDeContas(await linhasDoArquivo(arquivo));
  } catch {
    return falha("Não foi possível ler a planilha. Confira se o arquivo abre no Excel.");
  }
  if (!leitura.ok) return falha(leitura.erro);
  const { tenantId, userId } = a.ctx;
  const companyId = a.empresa.baseId;
  const contas = leitura.contas;
  await getPrisma().$transaction([
    getPrisma().contabilConta.deleteMany({ where: { tenantId, companyId } }),
    getPrisma().contabilConta.createMany({ data: contas.map((c) => ({ tenantId, companyId, ...c })) }),
    getPrisma().contabilModelo.upsert({
      where: { companyId },
      create: { tenantId, companyId, planoCarregadoEm: new Date(), updatedById: userId },
      update: { planoCarregadoEm: new Date(), updatedById: userId },
    }),
  ]);
  await logAudit({ tenantId, userId, action: "contabil.plano.carregado", entityType: "ContabilModelo", entityId: companyId, metadata: { arquivo: arquivo.name, contas: contas.length, ignoradas: leitura.ignoradas } });
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: `${contas.length} contas carregadas${leitura.ignoradas ? `; ${leitura.ignoradas} linhas sem código ficaram de fora` : ""}.` };
}

const contribuicoesSchema = z.object({
  empresa: z.string().uuid(),
  competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Escolha a competência."),
  tipoSped: z.enum(["0", "1"]),
  confirmarDuplicado: z.boolean().default(false),
  chave: chaveSchema,
});

/**
 * Pede ao motor o EFD Contribuições da raiz da empresa. Não gera aqui: enfileira,
 * e o agente do motor gera — o mesmo pedido do Fiscal (`solicitarExecucaoNoMotor`),
 * com a permissão do módulo do Contábil. O arquivo é por raiz e quem assina é a matriz.
 */
export async function gerarContribuicoes(entrada: unknown): Promise<ResultadoDoMotor<ExecucaoDoMotor>> {
  const e = contribuicoesSchema.safeParse(entrada);
  if (!e.success) return recusa(e.error.issues[0]?.message ?? "Pedido inválido.");
  const ctx = await getAuthContext();
  const empresa = ctx.tenantId ? await empresaDoContabil(ctx.tenantId, e.data.empresa) : null;
  if (!empresa?.cnpj || empresa.cnpj.length !== 14) return recusa("A empresa precisa de CNPJ para o SPED Contribuições.");
  const raiz = empresa.cnpj.slice(0, 8);
  const p = await prepararEscrita(raiz, MODULO, "agir");
  if (recusado(p)) return p;
  const matriz = (await estabelecimentosDaRaiz(p.ctx.tenantId, raiz)).visiveis.find((x) => x.matriz);
  if (!matriz) return recusa("A matriz desta raiz não está cadastrada no motor, ou não está entre as empresas que você acessa.");
  const parametros = { ...parametrosIniciais(e.data.competencia, "sped_contribuicoes"), tipoSped: e.data.tipoSped };
  try {
    const execucao = await p.motor.cliente.criarExecucao(raiz, corpoDeExecucao(parametros, matriz.id, e.data.confirmarDuplicado), { ator: p.ator, chave: e.data.chave });
    await logAudit({
      tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: "contabil.sped.contribuicoes.solicitada", entityType: "SpedExecucao", entityId: String(execucao.id),
      metadata: { nome: `#${execucao.id} sped_contribuicoes`, raiz, competencia: e.data.competencia, tipo: e.data.tipoSped === "1" ? "retificadora" : "original", chave: e.data.chave },
    });
    revalidatePath(CAMINHO);
    return { ok: true, mensagem: "Pedido enviado ao motor. O agente gera o arquivo assim que estiver livre.", dados: execucao };
  } catch (err) {
    return doErro(err);
  }
}
