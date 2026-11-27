"use server";

// O cadastro fiscal da empresa (27/11/2026, funcionalidade-899): atualizar do
// acervo, editar produtos (um ou em lote), editar participantes e o vínculo do
// NCM com o cClassTrib. Quem pode: quem age no setor que opera os Documentos
// fiscais, como as outras telas do módulo.

import { revalidatePath } from "next/cache";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";
import { nomeDeQuemFez } from "@/lib/honorarios/acesso";
import { lerEdicaoDoParticipante, lerEdicaoDoProduto, lerVinculoDoNcm } from "@/lib/fiscal/cadastro/regras";
import {
  ErroDoCadastroFiscal,
  editarParticipante,
  editarProduto,
  editarProdutosEmLote,
  excluirVinculo,
  salvarVinculo,
  sincronizarDoAcervo,
  type ResultadoDaSincronizacao,
} from "@/lib/fiscal/cadastro/servidor";

const SECTOR = "fiscal";
const MODULE = "fiscal_documentos";
const ROTA = "/documentos-fiscais/cadastro";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

async function contexto() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return null;
  if (!canActOnSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) return null;
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return null;
  return ctx;
}

async function empresaDoPedido(ctx: NonNullable<Awaited<ReturnType<typeof contexto>>>, companyId: unknown) {
  if (typeof companyId !== "string" || !companyId) return null;
  return getPrisma().company.findFirst({ where: { id: companyId, ...(await scopedCompanyWhere(ctx)) }, select: { id: true, name: true } });
}

async function tentar<T>(fazer: () => Promise<Resultado<T>>): Promise<Resultado<T>> {
  try {
    return await fazer();
  } catch (err) {
    if (err instanceof ErroDoCadastroFiscal) return { ok: false, erro: err.message };
    throw err;
  }
}

const SEM_PERMISSAO = "Você não tem permissão para mexer no cadastro fiscal.";
const SEM_EMPRESA = "Empresa não encontrada ou fora do seu escopo.";

export async function atualizarCadastroDoAcervo(companyId: string): Promise<Resultado<ResultadoDaSincronizacao>> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: SEM_PERMISSAO };
  const empresa = await empresaDoPedido(ctx, companyId);
  if (!empresa) return { ok: false, erro: SEM_EMPRESA };
  return tentar(async () => {
    const r = await sincronizarDoAcervo(ctx.tenantId, empresa.id);
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "fiscal.cadastro.atualizado", entityType: "Company", entityId: empresa.id, metadata: { nome: empresa.name, ...r } });
    revalidatePath(ROTA);
    return { ok: true, ...r };
  });
}

export async function salvarProdutoFiscal(form: FormData): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: SEM_PERMISSAO };
  const empresa = await empresaDoPedido(ctx, form.get("companyId"));
  if (!empresa) return { ok: false, erro: SEM_EMPRESA };
  const id = String(form.get("id") ?? "").slice(0, 64);
  const lido = lerEdicaoDoProduto(form, false);
  if (!lido.ok) return lido;
  return tentar(async () => {
    const codigo = await editarProduto(ctx.tenantId, empresa.id, id, lido.valor);
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "fiscal.produto.editado", entityType: "Company", entityId: empresa.id, metadata: { nome: empresa.name, codigo } });
    revalidatePath(ROTA);
    return { ok: true };
  });
}

export async function salvarProdutosEmLote(form: FormData): Promise<Resultado<{ alterados: number }>> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: SEM_PERMISSAO };
  const empresa = await empresaDoPedido(ctx, form.get("companyId"));
  if (!empresa) return { ok: false, erro: SEM_EMPRESA };
  const ids = form
    .getAll("ids")
    .map((x) => String(x).slice(0, 64))
    .filter(Boolean);
  const lido = lerEdicaoDoProduto(form, true);
  if (!lido.ok) return lido;
  return tentar(async () => {
    const alterados = await editarProdutosEmLote(ctx.tenantId, empresa.id, ids, lido.valor);
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "fiscal.produto.lote",
      entityType: "Company",
      entityId: empresa.id,
      metadata: { nome: empresa.name, produtos: alterados, campos: Object.keys(lido.valor) },
    });
    revalidatePath(ROTA);
    return { ok: true, alterados };
  });
}

export async function salvarParticipanteFiscal(form: FormData): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: SEM_PERMISSAO };
  const empresa = await empresaDoPedido(ctx, form.get("companyId"));
  if (!empresa) return { ok: false, erro: SEM_EMPRESA };
  const id = String(form.get("id") ?? "").slice(0, 64);
  const lido = lerEdicaoDoParticipante(form);
  if (!lido.ok) return lido;
  return tentar(async () => {
    await editarParticipante(ctx.tenantId, empresa.id, id, lido.valor);
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "fiscal.participante.editado", entityType: "Company", entityId: empresa.id, metadata: { nome: empresa.name, participante: lido.valor.nome } });
    revalidatePath(ROTA);
    return { ok: true };
  });
}

export async function salvarVinculoDoNcm(form: FormData): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: SEM_PERMISSAO };
  const lido = lerVinculoDoNcm(form);
  if (!lido.ok) return lido;
  await salvarVinculo(ctx.tenantId, lido.valor, await nomeDeQuemFez(ctx));
  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "fiscal.vinculo_ncm.salvo", entityType: "Tenant", entityId: ctx.tenantId, metadata: { ncm: lido.valor.ncm, cClassTrib: lido.valor.cClassTrib } });
  revalidatePath(ROTA);
  return { ok: true };
}

export async function excluirVinculoDoNcm(id: string): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: SEM_PERMISSAO };
  if (typeof id !== "string" || !id) return { ok: false, erro: "Pedido inválido." };
  return tentar(async () => {
    const ncm = await excluirVinculo(ctx.tenantId, id);
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "fiscal.vinculo_ncm.excluido", entityType: "Tenant", entityId: ctx.tenantId, metadata: { ncm } });
    revalidatePath(ROTA);
    return { ok: true };
  });
}
