"use server";

// Os dados societários da ficha e o quadro societário por data (27/11/2026,
// melhoria-892). Arquivo próprio, ao lado das actions dos sócios, com as mesmas
// regras de acesso: escrever é de quem edita cadastros (canWrite) com a empresa
// no escopo; excluir uma foto do quadro é do administrador (podeExcluir).

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite, podeExcluir } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { logAudit } from "@/lib/audit";
import { nomeDeQuemFez } from "@/lib/honorarios/acesso";
import { lerDataDoCampo } from "@/lib/societario/datas";
import { lerDadosSocietarios } from "@/lib/societario/quadro";
import { ErroDoQuadro, excluirQuadro, guardarQuadro, salvarDadosSocietarios } from "@/lib/societario/quadroServidor";

type Resultado = { ok: true } | { ok: false; erro: string };

async function empresaNoEscopo(companyId: unknown) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ctx, empresa: null };
  if (typeof companyId !== "string" || !companyId) return { ctx, empresa: null };
  const empresa = await getPrisma().company.findFirst({ where: { id: companyId, ...(await scopedCompanyWhere(ctx)) }, select: { id: true, name: true } });
  return { ctx, empresa };
}

async function tentar(fazer: () => Promise<Resultado>): Promise<Resultado> {
  try {
    return await fazer();
  } catch (err) {
    if (err instanceof ErroDoQuadro) return { ok: false, erro: err.message };
    throw err;
  }
}

/** Grava o NIRE, a data do registro, o objeto social, o capital e o responsável legal. */
export async function salvarDadosSocietariosDaEmpresa(form: FormData): Promise<Resultado> {
  const { ctx, empresa } = await empresaNoEscopo(form.get("companyId"));
  if (!empresa) return { ok: false, erro: "Empresa não encontrada ou fora do seu escopo." };
  if (!canWrite(ctx.role)) return { ok: false, erro: "Sem permissão para editar a empresa." };
  const lido = lerDadosSocietarios(form);
  if (!lido.ok) return lido;
  return tentar(async () => {
    await salvarDadosSocietarios(ctx.tenantId, empresa.id, lido.dados);
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "empresa.dados_societarios", entityType: "Company", entityId: empresa.id, metadata: { nome: empresa.name } });
    revalidatePath(`/empresas/${empresa.id}/socios`);
    revalidatePath(`/empresas/${empresa.id}`);
    return { ok: true };
  });
}

/** Guarda a foto dos sócios de agora, com a data do ato. */
export async function guardarQuadroSocietario(companyId: string, dataDoCampo: string): Promise<Resultado> {
  const { ctx, empresa } = await empresaNoEscopo(companyId);
  if (!empresa) return { ok: false, erro: "Empresa não encontrada ou fora do seu escopo." };
  if (!canWrite(ctx.role)) return { ok: false, erro: "Sem permissão para editar a empresa." };
  const data = lerDataDoCampo(dataDoCampo);
  if (!data.ok || !data.data) return { ok: false, erro: "Informe a data do ato." };
  const quando = data.data;
  return tentar(async () => {
    const r = await guardarQuadro({ tenantId: ctx.tenantId, companyId: empresa.id, data: quando, origem: "MANUAL", processId: null, registradoPor: await nomeDeQuemFez(ctx) });
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "empresa.quadro_societario.guardado",
      entityType: "Company",
      entityId: empresa.id,
      metadata: { nome: empresa.name, data: dataDoCampo, socios: r.socios },
    });
    revalidatePath(`/empresas/${empresa.id}/socios`);
    return { ok: true };
  });
}

export async function excluirQuadroSocietario(companyId: string, id: string): Promise<Resultado> {
  const { ctx, empresa } = await empresaNoEscopo(companyId);
  if (!empresa) return { ok: false, erro: "Empresa não encontrada ou fora do seu escopo." };
  if (!podeExcluir(ctx) || !canWrite(ctx.role)) return { ok: false, erro: "Só o administrador exclui um quadro guardado." };
  if (typeof id !== "string" || !id) return { ok: false, erro: "Pedido inválido." };
  return tentar(async () => {
    const data = await excluirQuadro(ctx.tenantId, empresa.id, id);
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "empresa.quadro_societario.excluido",
      entityType: "Company",
      entityId: empresa.id,
      metadata: { nome: empresa.name, data: data.toISOString().slice(0, 10) },
    });
    revalidatePath(`/empresas/${empresa.id}/socios`);
    return { ok: true };
  });
}
