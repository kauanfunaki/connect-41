"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { logAudit } from "@/lib/audit";
import { digitosDoDocumento } from "@/lib/financeiro/manual";
import { lerEmail } from "@/lib/financeiro/cobranca/regua";
import { chaveDaCategoria } from "@/lib/dre/calculo";
import { validarCentroDeCusto } from "@/lib/financeiro/centroDeCusto";

const MODULE = "bpo_cadastros";

export type ResultadoDoCadastro = { error: string } | { ok: true };

async function contexto(companyId: string) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false as const, erro: "Não autenticado." };
  if (!canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? getModuleDef(MODULE)!.sectorCode)) return { ok: false as const, erro: "Sem permissão." };
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return { ok: false as const, erro: "Módulo não habilitado." };
  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({ where: { id: companyId, tenantId: ctx.tenantId }, select: { id: true } });
  if (!empresa) return { ok: false as const, erro: "Empresa não encontrada." };
  return { ok: true as const, ctx, tenantId: ctx.tenantId, prisma };
}

function documentoValido(doc: string | null): boolean {
  return doc === null || doc.length === 11 || doc.length === 14;
}

/** Categoria padrão só de despesa: a herança é regra de contas a pagar. */
async function categoriaDePagar(prisma: ReturnType<typeof getPrisma>, tenantId: string, id: string | null) {
  if (!id) return true;
  return !!(await prisma.financeCategory.findFirst({ where: { id, tenantId, kind: "PAGAR" }, select: { id: true } }));
}

/**
 * Centro padrão da contraparte: da mesma empresa, e ativo quando muda. A ficha
 * que já apontava para um centro depois inativado pode ser salva sem obrigar a
 * trocar na mesma hora — a herança já ignora centro inativo.
 */
async function centroPadraoValido(
  prisma: ReturnType<typeof getPrisma>,
  tenantId: string,
  companyId: string,
  id: string | null,
  atual: string | null = null
) {
  if (!id) return true;
  const centro = await prisma.costCenter.findFirst({ where: { id, tenantId, companyId }, select: { active: true } });
  return !!centro && (centro.active || id === atual);
}

export async function criarContraparte(formData: FormData): Promise<ResultadoDoCadastro> {
  const texto = (k: string) => String(formData.get(k) ?? "").trim();
  const companyId = texto("companyId");
  const c = await contexto(companyId);
  if (!c.ok) return { error: c.erro };

  const nome = texto("nome");
  const documento = digitosDoDocumento(texto("documento"));
  const categoriaId = texto("defaultCategoryId") || null;
  const centroId = texto("defaultCostCenterId") || null;
  const email = lerEmail(texto("email"));
  if (email === false) return { error: "E-mail inválido." };
  if (!nome) return { error: "Informe o nome." };
  if (nome.length > 180) return { error: "Nome com mais de 180 caracteres." };
  if (!documentoValido(documento)) return { error: "Documento não é CPF (11 dígitos) nem CNPJ (14)." };
  if (!(await categoriaDePagar(c.prisma, c.tenantId, categoriaId))) return { error: "Categoria não encontrada." };
  if (!(await centroPadraoValido(c.prisma, c.tenantId, companyId, centroId))) {
    return { error: "Centro de custo não encontrado ou inativo nesta empresa." };
  }

  // Conferido antes, e não pego no unique: a mensagem do banco não diz qual
  // ficha já usa o documento, e é isso que a pessoa precisa saber.
  if (documento) {
    const existente = await c.prisma.financeCounterparty.findFirst({
      where: { tenantId: c.tenantId, companyId, document: documento },
      select: { name: true },
    });
    if (existente) return { error: `Este documento já é de "${existente.name}" nesta empresa.` };
  }

  const criada = await c.prisma.financeCounterparty.create({
    data: {
      tenantId: c.tenantId,
      companyId,
      name: nome,
      document: documento,
      email,
      defaultCategoryId: categoriaId,
      defaultCostCenterId: centroId,
    },
    select: { id: true },
  });
  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.counterparty.created",
    entityType: "FinanceCounterparty",
    entityId: criada.id,
    metadata: { companyId, centroPadrao: centroId },
  });
  revalidatePath("/cadastros-financeiros");
  return { ok: true };
}

/**
 * Edita nome, categoria padrão, centro padrão e situação.
 *
 * O documento só pode ser **preenchido**, nunca trocado: é por ele que a nota
 * fiscal casa com a ficha. Trocar o CNPJ de uma ficha com histórico faria as
 * próximas notas do fornecedor antigo criarem outra ficha, e as antigas ficarem
 * penduradas num CNPJ que não é o delas.
 */
export async function atualizarContraparte(formData: FormData): Promise<ResultadoDoCadastro> {
  const texto = (k: string) => String(formData.get(k) ?? "").trim();
  const id = texto("id");
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado." };
  const prisma = getPrisma();
  const atual = await prisma.financeCounterparty.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true, companyId: true, document: true, defaultCostCenterId: true },
  });
  if (!atual) return { error: "Cadastro não encontrado." };

  const c = await contexto(atual.companyId);
  if (!c.ok) return { error: c.erro };

  const nome = texto("nome");
  const categoriaId = texto("defaultCategoryId") || null;
  const centroId = texto("defaultCostCenterId") || null;
  const ativo = texto("ativo") === "1";
  // Diferente do documento, o e-mail troca livremente: não casa com nada, só
  // diz para onde vai o lembrete da régua de cobrança.
  const email = lerEmail(texto("email"));
  if (email === false) return { error: "E-mail inválido." };
  const novoDocumento = atual.document ? null : digitosDoDocumento(texto("documento"));
  if (!nome || nome.length > 180) return { error: "Nome obrigatório, até 180 caracteres." };
  if (!documentoValido(novoDocumento)) return { error: "Documento não é CPF (11 dígitos) nem CNPJ (14)." };
  if (!(await categoriaDePagar(prisma, c.tenantId, categoriaId))) return { error: "Categoria não encontrada." };
  if (!(await centroPadraoValido(prisma, c.tenantId, atual.companyId, centroId, atual.defaultCostCenterId))) {
    return { error: "Centro de custo não encontrado ou inativo nesta empresa." };
  }
  if (novoDocumento) {
    const dono = await prisma.financeCounterparty.findFirst({
      where: { tenantId: c.tenantId, companyId: atual.companyId, document: novoDocumento, NOT: { id } },
      select: { name: true },
    });
    if (dono) return { error: `Este documento já é de "${dono.name}" nesta empresa.` };
  }

  await prisma.financeCounterparty.update({
    where: { id },
    data: {
      name: nome,
      email,
      defaultCategoryId: categoriaId,
      defaultCostCenterId: centroId,
      active: ativo,
      ...(novoDocumento ? { document: novoDocumento } : {}),
    },
  });
  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.counterparty.updated",
    entityType: "FinanceCounterparty",
    entityId: id,
    metadata: {
      ativo,
      documentoPreenchido: !!novoDocumento,
      comEmail: email !== null,
      ...(centroId !== atual.defaultCostCenterId ? { centroPadrao: { de: atual.defaultCostCenterId, para: centroId } } : {}),
    },
  });
  revalidatePath("/cadastros-financeiros");
  return { ok: true };
}

// ─── Centros de custo ───────────────────────────────────────────────────────

// O centro aparece nos seletores do lançamento e das contas, e na DRE por centro.
function revalidarCentros() {
  for (const p of ["/cadastros-financeiros", "/lancamentos", "/pagar", "/receber", "/conciliacao", "/dre/economica"]) {
    revalidatePath(p);
  }
}

/**
 * Nome e código já usados nesta empresa, conferidos antes do unique para a
 * mensagem dizer qual centro os usa. Código igual ao **nome** de outro centro
 * também é recusado: a importação por CSV casa pelos dois, e o texto ficaria
 * ambíguo para sempre.
 */
async function conflitoDeCentro(
  prisma: ReturnType<typeof getPrisma>,
  tenantId: string,
  companyId: string,
  dados: { nome: string; codigo: string | null },
  ignorarId?: string
): Promise<string | null> {
  const outros = await prisma.costCenter.findMany({
    where: { tenantId, companyId, ...(ignorarId ? { NOT: { id: ignorarId } } : {}) },
    select: { name: true, code: true },
  });
  const nome = chaveDaCategoria(dados.nome);
  const codigo = dados.codigo ? chaveDaCategoria(dados.codigo) : null;
  for (const o of outros) {
    const outroNome = chaveDaCategoria(o.name);
    const outroCodigo = o.code ? chaveDaCategoria(o.code) : null;
    if (outroNome === nome) return `Já existe o centro "${o.name}" nesta empresa.`;
    if (outroCodigo && outroCodigo === nome) return `"${dados.nome}" já é o código do centro "${o.name}".`;
    if (codigo && outroCodigo === codigo) return `O código ${dados.codigo} já é do centro "${o.name}".`;
    if (codigo && outroNome === codigo) return `O código ${dados.codigo} é o nome do centro "${o.name}".`;
  }
  return null;
}

export async function criarCentroDeCusto(formData: FormData): Promise<ResultadoDoCadastro> {
  const texto = (k: string) => String(formData.get(k) ?? "").trim();
  const companyId = texto("companyId");
  const c = await contexto(companyId);
  if (!c.ok) return { error: c.erro };

  const v = validarCentroDeCusto({ nome: texto("nome"), codigo: texto("codigo") });
  if (!v.ok) return { error: v.erro };
  const conflito = await conflitoDeCentro(c.prisma, c.tenantId, companyId, v.dados);
  if (conflito) return { error: conflito };

  const criado = await c.prisma.costCenter.create({
    data: { tenantId: c.tenantId, companyId, name: v.dados.nome, code: v.dados.codigo },
    select: { id: true },
  });
  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.cost_center.created",
    entityType: "CostCenter",
    entityId: criado.id,
    metadata: { companyId, nome: v.dados.nome, codigo: v.dados.codigo },
  });
  revalidarCentros();
  return { ok: true };
}

/**
 * Edita nome, código e situação. **Nunca apaga**: inativar tira o centro dos
 * seletores e da herança, e mantém o que já foi lançado nele nos relatórios.
 */
export async function atualizarCentroDeCusto(formData: FormData): Promise<ResultadoDoCadastro> {
  const texto = (k: string) => String(formData.get(k) ?? "").trim();
  const id = texto("id");
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado." };
  const prisma = getPrisma();
  const atual = await prisma.costCenter.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true, companyId: true, name: true, code: true, active: true },
  });
  if (!atual) return { error: "Centro de custo não encontrado." };

  const c = await contexto(atual.companyId);
  if (!c.ok) return { error: c.erro };

  const v = validarCentroDeCusto({ nome: texto("nome"), codigo: texto("codigo") });
  if (!v.ok) return { error: v.erro };
  const ativo = texto("ativo") === "1";
  const conflito = await conflitoDeCentro(prisma, c.tenantId, atual.companyId, v.dados, id);
  if (conflito) return { error: conflito };

  await prisma.costCenter.update({
    where: { id },
    data: { name: v.dados.nome, code: v.dados.codigo, active: ativo },
  });
  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.cost_center.updated",
    entityType: "CostCenter",
    entityId: id,
    metadata: {
      antes: { nome: atual.name, codigo: atual.code, ativo: atual.active },
      depois: { nome: v.dados.nome, codigo: v.dados.codigo, ativo },
    },
  });
  revalidarCentros();
  return { ok: true };
}
