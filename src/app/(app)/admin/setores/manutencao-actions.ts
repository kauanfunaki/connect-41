"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { getModuleDef } from "@/lib/module-catalog";
import { isModuleEnabled } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { parseSaoPauloDateTimeLocal } from "@/lib/datetime";
import { MOTIVO_MAXIMO } from "@/lib/manutencao/regras";
import { gravarManutencao, lerTelasEmManutencao, liberarTela } from "@/lib/manutencao/leitura";

// Telas em manutenção (13/11/2026): colocar, mudar o aviso e liberar. Mesma
// porta das outras ações de módulo da tela Setores e módulos — só o
// administrador grava —, e devolvem `{ error }` para a janela ficar aberta com
// o motivo, em vez de fechar como se tivesse dado certo.

type Recusa = { error: string } | void;

const FALTA_MIGRATION = "Ainda não dá para salvar: falta atualizar o banco (migration).";

/** "AAAA-MM-DDTHH:mm" do campo de data e hora; vazio é sem previsão. */
function lerPrevisao(valor: string, agora: Date): { previsao: Date | null } | { error: string } {
  const limpo = valor.trim();
  if (!limpo) return { previsao: null };
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(limpo)) return { error: "A previsão de volta precisa de data e hora." };
  const previsao = parseSaoPauloDateTimeLocal(limpo);
  if (Number.isNaN(previsao.getTime())) return { error: "A previsão de volta precisa de data e hora." };
  if (previsao.getTime() <= agora.getTime()) return { error: "A previsão de volta já passou. Escolha uma data e hora à frente, ou deixe em branco." };
  return { previsao };
}

/**
 * Põe a tela em manutenção, ou muda o motivo e a previsão de uma que já está.
 * A tela precisa estar ligada: desligada, ela já não abre para ninguém.
 */
export async function colocarEmManutencao(code: string, dados: { motivo: string; previsao: string }): Promise<Recusa> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return { error: "Só o administrador coloca uma tela em manutenção." };
  const def = getModuleDef(code);
  if (!def) return { error: "Essa tela não existe mais." };
  if (!(await isModuleEnabled(ctx.tenantId, code))) return { error: "A tela está desligada: ela já não abre para ninguém." };

  const motivo = dados.motivo.trim();
  if (motivo.length > MOTIVO_MAXIMO) return { error: `O aviso cabe em ${MOTIVO_MAXIMO} caracteres.` };
  const lida = lerPrevisao(dados.previsao, new Date());
  if ("error" in lida) return lida;

  const { telas, disponivel } = await lerTelasEmManutencao(ctx.tenantId);
  if (!disponivel) return { error: FALTA_MIGRATION };
  const jaEstava = telas.some((t) => t.moduleCode === code);

  const eu = ctx.userId
    ? await getPrisma().user.findUnique({ where: { id: ctx.userId }, select: { name: true } })
    : null;
  try {
    await gravarManutencao(ctx.tenantId, code, { motivo: motivo || null, previsao: lida.previsao, porNome: eu?.name ?? "Administrador" });
  } catch (err) {
    console.error("[manutencao] gravar", err);
    return { error: FALTA_MIGRATION };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: jaEstava ? "module.maintenance.update" : "module.maintenance.start",
    entityType: "TenantModule",
    entityId: code,
    metadata: { motivo: motivo || null, previsao: lida.previsao?.toISOString() ?? null },
  });
  // O layout inteiro: o selo de manutenção aparece no menu de todos os setores.
  revalidatePath("/", "layout");
}

/** Libera a tela: ela volta a abrir para todo mundo. */
export async function tirarDaManutencao(code: string): Promise<Recusa> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return { error: "Só o administrador libera uma tela da manutenção." };
  if (!getModuleDef(code)) return { error: "Essa tela não existe mais." };

  try {
    await liberarTela(ctx.tenantId, code);
  } catch (err) {
    console.error("[manutencao] liberar", err);
    return { error: FALTA_MIGRATION };
  }
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "module.maintenance.end",
    entityType: "TenantModule",
    entityId: code,
  });
  revalidatePath("/", "layout");
}
