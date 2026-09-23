"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector, canManageSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { logAudit } from "@/lib/audit";
import { MODULO_VALORA, configDoValora } from "@/lib/valora/servidor";
import { calcular, MODELO_41, normalizarAjustes, normalizarParametros, normalizarPerfil } from "@/lib/valora/motor";

export type ResultadoDoValora = { error: string } | { ok: true; id?: string };

const STATUS = ["ABERTA", "GANHA", "PERDIDA"] as const;

/** `gerir` = mexer em custo e margem, que são confidenciais: só administrador do setor. */
async function contexto(gerir: boolean) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false as const, erro: "Não autenticado." };
  const setor = (await setorDoModulo(ctx.tenantId, MODULO_VALORA)) ?? getModuleDef(MODULO_VALORA)!.sectorCode;
  const pode = gerir ? canManageSector(ctx, setor) : canActOnSector(ctx, setor);
  if (!pode) return { ok: false as const, erro: "Sem permissão." };
  if (!(await isModuleEnabled(ctx.tenantId, MODULO_VALORA))) return { ok: false as const, erro: "Módulo não habilitado." };
  return { ok: true as const, ctx, tenantId: ctx.tenantId };
}

const valor = (x: unknown): number | null => {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(String(x).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n < 100_000_000 ? Math.round(n * 100) / 100 : null;
};

export async function salvarParametros(dados: { ajustes: unknown; parametros: unknown }): Promise<ResultadoDoValora> {
  const c = await contexto(true);
  if (!c.ok) return { error: c.erro };
  const ajustes = normalizarAjustes(dados.ajustes, MODELO_41);
  if (!ajustes) return { error: "Custos dos setores inválidos." };
  const parametros = normalizarParametros(dados.parametros);
  if (!parametros) return { error: "Parâmetros inválidos: variáveis + margem alvo têm de ficar abaixo de 100%, e o piso abaixo do alvo." };

  const prisma = getPrisma();
  await prisma.valoraConfig.upsert({
    where: { tenantId: c.tenantId },
    create: { tenantId: c.tenantId, ajustes, parametros },
    update: { ajustes, parametros },
  });
  // Sem valores no log: custo de equipe é confidencial, o log diz só que mudou.
  await logAudit({ tenantId: c.tenantId, userId: c.ctx.userId, action: "valora.parametros", entityType: "ValoraConfig", entityId: c.tenantId });
  revalidatePath("/valora", "layout");
  return { ok: true };
}

/** O resultado é recalculado aqui: o que o navegador mostrou não é confiável como registro. */
export async function salvarProposta(dados: { cliente: unknown; perfil: unknown; precoOferecido: unknown }): Promise<ResultadoDoValora> {
  const c = await contexto(false);
  if (!c.ok) return { error: c.erro };
  const cliente = String(dados.cliente ?? "").trim().slice(0, 160);
  if (!cliente) return { error: "Informe o nome do cliente." };
  const { catalogo, parametros } = await configDoValora(c.tenantId);
  const perfil = normalizarPerfil(dados.perfil, catalogo);
  if (!perfil) return { error: "Perfil do cliente incompleto: escolha o regime e ao menos um setor." };
  const resultado = calcular(catalogo, perfil, parametros);

  const prisma = getPrisma();
  const p = await prisma.valoraProposta.create({
    data: {
      tenantId: c.tenantId,
      cliente,
      perfil,
      resultado: { ...resultado, parametros },
      precoAlvo: resultado.mensal.alvo,
      precoOferecido: valor(dados.precoOferecido),
      createdById: c.ctx.userId,
    },
    select: { id: true },
  });
  await logAudit({ tenantId: c.tenantId, userId: c.ctx.userId, action: "valora.proposta.criar", entityType: "ValoraProposta", entityId: p.id });
  revalidatePath("/valora");
  return { ok: true, id: p.id };
}

export async function atualizarProposta(dados: {
  id: unknown;
  status: unknown;
  motivo: unknown;
  precoOferecido: unknown;
  precoConcorrente: unknown;
}): Promise<ResultadoDoValora> {
  const c = await contexto(false);
  if (!c.ok) return { error: c.erro };
  const id = String(dados.id ?? "");
  const status = STATUS.find((s) => s === dados.status);
  if (!status) return { error: "Situação inválida." };
  const prisma = getPrisma();
  const atual = await prisma.valoraProposta.findFirst({ where: { id, tenantId: c.tenantId }, select: { id: true } });
  if (!atual) return { error: "Proposta não encontrada." };
  const motivo = String(dados.motivo ?? "").trim().slice(0, 500) || null;
  await prisma.valoraProposta.update({
    where: { id },
    data: { status, motivo, precoOferecido: valor(dados.precoOferecido), precoConcorrente: valor(dados.precoConcorrente) },
  });
  await logAudit({ tenantId: c.tenantId, userId: c.ctx.userId, action: "valora.proposta.atualizar", entityType: "ValoraProposta", entityId: id, metadata: { status } });
  revalidatePath("/valora");
  return { ok: true };
}
