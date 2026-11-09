"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/actionState";
import { MODULE_CATALOG, ORDEM_DOS_GRUPOS } from "@/lib/module-catalog";
import { lerOrdemDoMenu } from "@/lib/menuDoSetor";
import { CHAVES_DO_GERAL } from "@/lib/organizarMenu";

// Organizar menu (05/11/2026, pedido do Kauan): o super admin ordena os grupos
// e as telas do menu de cada setor. Só a ordem: quem vê cada tela continua
// decidido pelo módulo e pela permissão. Regras em `src/lib/menuDoSetor.ts`.
//
// Desde 09/11/2026 dá para organizar no próprio menu lateral, que conhece o
// setor pelo código (as funções `...PeloCodigo`), e esconder telas do menu
// (`ocultas`). Admin › Setores segue usando o id.

const SO_SUPER_ADMIN = "Só o Super Admin organiza o menu dos setores.";
const GRUPOS = new Set<string>(ORDEM_DOS_GRUPOS);
const TELAS = new Set(MODULE_CATALOG.map((m) => m.code));
const GERAL = new Set<string>(CHAVES_DO_GERAL);

type Setor = { id: string; code: string; label: string };
type Ctx = { tenantId: string; userId: string };

/** Quem pode organizar, e o setor deste escritório (pelo id ou pelo código). */
async function preparar(onde: { id: string } | { code: string }): Promise<{ ctx: Ctx; setor: Setor } | { error: string }> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { error: "Não autenticado" };
  if (ctx.role !== "SUPER_ADMIN" || ctx.subscriptionReadOnly) return { error: SO_SUPER_ADMIN };
  const valor = "id" in onde ? onde.id : onde.code;
  const setor = valor
    ? await getPrisma().sector.findFirst({ where: { ...onde, tenantId: ctx.tenantId }, select: { id: true, code: true, label: true } })
    : null;
  if (!setor) return { error: "Setor não encontrado neste escritório." };
  return { ctx: { tenantId: ctx.tenantId, userId: ctx.userId }, setor };
}

async function gravar({ ctx, setor }: { ctx: Ctx; setor: Setor }, json: string): Promise<ActionState> {
  const lida = lerOrdemDoMenu(json);
  const ocultas = (lida.ocultas ?? []).filter((t) => TELAS.has(t));
  const geral = (lida.geral ?? []).filter((c) => GERAL.has(c));
  // Dentro de cada menu: só menus que existem (uma tela do catálogo, ou o Apoio
  // do Geral), e chaves curtas — são posições, não dados.
  const porMenu = (x: Record<string, string[]> | undefined) =>
    Object.fromEntries(
      Object.entries(x ?? {})
        .filter(([mae]) => TELAS.has(mae) || mae === "apoio")
        .map(([mae, l]) => [mae, l.filter((c) => c.length <= 120).slice(0, 40)] as const)
        .filter(([, l]) => l.length > 0),
    );
  const dentro = porMenu(lida.dentro);
  const ocultasDentro = porMenu(lida.ocultasDentro);
  const ocultasGeral = (lida.ocultasGeral ?? []).filter((c) => GERAL.has(c));
  const ordem = {
    grupos: lida.grupos.filter((g) => GRUPOS.has(g)),
    telas: lida.telas.filter((t) => TELAS.has(t)),
    ...(ocultas.length ? { ocultas } : {}),
    ...(geral.length ? { geral } : {}),
    ...(Object.keys(dentro).length ? { dentro } : {}),
    ...(ocultasGeral.length ? { ocultasGeral } : {}),
    ...(Object.keys(ocultasDentro).length ? { ocultasDentro } : {}),
  };
  const chave = { tenantId_sectorCode: { tenantId: ctx.tenantId, sectorCode: setor.code } };
  try {
    await getPrisma().sectorMenuOrder.upsert({
      where: chave,
      create: { tenantId: ctx.tenantId, sectorCode: setor.code, ordem: JSON.stringify(ordem), updatedById: ctx.userId },
      update: { ordem: JSON.stringify(ordem), updatedById: ctx.userId },
    });
  } catch (err) {
    console.error("[salvarOrdemDoMenu]", err);
    return { error: "Não foi possível salvar a ordem do menu. Tente de novo." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "sector.menu.ordem",
    entityType: "Sector",
    entityId: setor.id,
    metadata: { setor: setor.code, grupos: ordem.grupos, telas: ordem.telas, ocultas, geral, dentro, ocultasGeral, ocultasDentro },
  });
  revalidatePath("/", "layout");
  return null;
}

async function apagar({ ctx, setor }: { ctx: Ctx; setor: Setor }): Promise<ActionState> {
  try {
    await getPrisma().sectorMenuOrder.deleteMany({ where: { tenantId: ctx.tenantId, sectorCode: setor.code } });
  } catch (err) {
    console.error("[restaurarOrdemDoMenu]", err);
    return { error: "Não foi possível voltar à ordem padrão. Tente de novo." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "sector.menu.ordem_padrao",
    entityType: "Sector",
    entityId: setor.id,
    metadata: { setor: setor.code },
  });
  revalidatePath("/", "layout");
  return null;
}

/** Grava a ordem do menu do setor. `json`: { grupos, telas, ocultas? } — o que não for grupo ou tela do catálogo é descartado. */
export async function salvarOrdemDoMenu(sectorId: string, json: string): Promise<ActionState> {
  const p = await preparar({ id: sectorId });
  return "error" in p ? { error: p.error } : gravar(p, json);
}

/** Volta o menu do setor à ordem padrão (a do catálogo, sem tela escondida). */
export async function restaurarOrdemDoMenu(sectorId: string): Promise<ActionState> {
  const p = await preparar({ id: sectorId });
  return "error" in p ? { error: p.error } : apagar(p);
}

/** O mesmo `salvarOrdemDoMenu`, pelo código do setor — o do menu lateral. */
export async function salvarOrdemDoMenuPeloCodigo(sectorCode: string, json: string): Promise<ActionState> {
  const p = await preparar({ code: sectorCode });
  return "error" in p ? { error: p.error } : gravar(p, json);
}

/** O mesmo `restaurarOrdemDoMenu`, pelo código do setor — o do menu lateral. */
export async function restaurarOrdemDoMenuPeloCodigo(sectorCode: string): Promise<ActionState> {
  const p = await preparar({ code: sectorCode });
  return "error" in p ? { error: p.error } : apagar(p);
}
