"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/actionState";
import {
  TELAS_DO_GERAL,
  alternarTelaOculta,
  ehTelaDoGeral,
  gravarTelasOcultas,
  lerTelasOcultas,
  podeConfigurarMenuGeral,
} from "@/lib/menuGeral";

// O menu Geral por setor (14/10/2026): esconder e mostrar as telas do grupo
// "Geral" para quem é do setor. Regras em `src/lib/menuGeral.ts`.
//
// As actions recebem o id do setor (o da tela de edição), e não o código: o
// setor é conferido no escritório de quem pede, e o código sai do cadastro.

const SEM_PERMISSAO = "Só o Administrador ou o Super Admin configura o menu dos setores.";
const ERRO_AO_SALVAR = "Não foi possível salvar o menu do setor. Tente de novo.";

async function setorDoEscritorio(tenantId: string, sectorId: string) {
  if (!sectorId) return null;
  return getPrisma().sector.findFirst({ where: { id: sectorId, tenantId }, select: { id: true, code: true, label: true } });
}

/** Mostra (`visivel`) ou esconde uma tela do Geral para o setor. */
export async function alternarTelaDoGeral(sectorId: string, tela: string, visivel: boolean): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { error: "Não autenticado" };
  if (!podeConfigurarMenuGeral(ctx)) return { error: SEM_PERMISSAO };
  if (!ehTelaDoGeral(tela)) return { error: "Tela desconhecida." };

  const setor = await setorDoEscritorio(ctx.tenantId, sectorId);
  if (!setor) return { error: "Setor não encontrado neste escritório." };

  const prisma = getPrisma();
  const chave = { tenantId_sectorCode: { tenantId: ctx.tenantId, sectorCode: setor.code } };
  let ocultas: string;
  try {
    const atual = await prisma.sectorMenuView.findUnique({ where: chave, select: { hiddenScreens: true } });
    ocultas = gravarTelasOcultas(alternarTelaOculta(lerTelasOcultas(atual?.hiddenScreens), tela, visivel));
    await prisma.sectorMenuView.upsert({
      where: chave,
      create: { tenantId: ctx.tenantId, sectorCode: setor.code, hiddenScreens: ocultas },
      update: { hiddenScreens: ocultas },
    });
  } catch (err) {
    console.error("[alternarTelaDoGeral]", err);
    return { error: ERRO_AO_SALVAR };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: visivel ? "sector.menu.show" : "sector.menu.hide",
    entityType: "Sector",
    entityId: setor.id,
    metadata: { setor: setor.label, tela: TELAS_DO_GERAL.find((t) => t.chave === tela)?.rotulo ?? tela },
  });

  // O layout inteiro: a lateral de todo mundo do setor muda.
  revalidatePath("/", "layout");
  return null;
}

/**
 * Volta o setor ao padrão — todas as telas aparecem — apagando a linha. Sem
 * linha, tela nova que entrar no Geral também aparece.
 */
export async function restaurarMenuGeral(sectorId: string): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { error: "Não autenticado" };
  if (!podeConfigurarMenuGeral(ctx)) return { error: SEM_PERMISSAO };

  const setor = await setorDoEscritorio(ctx.tenantId, sectorId);
  if (!setor) return { error: "Setor não encontrado neste escritório." };

  try {
    await getPrisma().sectorMenuView.deleteMany({ where: { tenantId: ctx.tenantId, sectorCode: setor.code } });
  } catch (err) {
    console.error("[restaurarMenuGeral]", err);
    return { error: ERRO_AO_SALVAR };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "sector.menu.reset",
    entityType: "Sector",
    entityId: setor.id,
    metadata: { setor: setor.label },
  });

  revalidatePath("/", "layout");
  return null;
}
