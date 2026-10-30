"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { lerSetoresLigados, setModuleEnabled, setModuleSector, setModuleSharedSectors, setorDoModulo } from "@/lib/modules";
import { MODULOS_DO_MENU_GERAL, MODULOS_NAS_SOLICITACOES, getModuleDef } from "@/lib/module-catalog";
import { setorParaGravar, setoresParaLigar } from "@/lib/modulo-setor";
import { getActiveSectors } from "@/lib/sectors";
import { logAudit } from "@/lib/audit";

/**
 * Muda o setor que opera o módulo neste tenant.
 *
 * O setor tem de ser um setor **ativo** do tenant: o valor vem do navegador, e
 * um código inventado esconderia o módulo de todo mundo que não é admin, sem
 * nenhum setor na tela para desfazer.
 */
// As três devolvem `{ error }` quando recusam (30/10/2026): a confirmação que as
// chama fica aberta com o motivo, em vez de fechar como se tivesse mudado.
type Recusa = { error: string } | void;

export async function transferirModulo(code: string, sectorCode: string): Promise<Recusa> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return { error: "Só o administrador muda o setor de uma tela." };
  const def = getModuleDef(code);
  if (!def) return { error: "Essa tela não existe mais." };
  if (def.fixedSector && sectorCode !== def.sectorCode) return { error: "Essa tela é fixa do setor dela e não muda de dono." };

  const ativos = await getActiveSectors(ctx.tenantId);
  if (!ativos.some((s) => s.code === sectorCode)) return { error: "Esse setor está inativo. Ative-o antes de mover a tela para ele." };

  await setModuleSector(ctx.tenantId, code, setorParaGravar(def.sectorCode, sectorCode));
  // O novo dono sai da lista de "Também em…" (21/10/2026): se ficasse, a tela
  // movida de novo depois deixaria o setor com acesso sem ninguém ter pedido.
  const ligados = await lerSetoresLigados(ctx.tenantId, code);
  const atuais = ligados.porModulo.get(code) ?? [];
  if (ligados.disponivel && atuais.includes(sectorCode)) {
    await setModuleSharedSectors(ctx.tenantId, code, atuais.filter((s) => s !== sectorCode));
  }
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "module.transfer",
    entityType: "TenantModule",
    entityId: code,
    metadata: { to: sectorCode, catalog: def.sectorCode },
  });
  // O layout inteiro: a sidebar de todos os setores muda.
  revalidatePath("/", "layout");
}

/**
 * Liga ou tira um setor a mais de uma tela ("Também em…", 21/10/2026). O dono
 * não muda; a tela passa a aparecer também no menu do setor ligado, e quem é
 * dele abre com a mesma permissão que tem no setor.
 *
 * Como em `transferirModulo`, só setor ativo do tenant entra — o valor vem do
 * navegador.
 */
export async function ligarModuloAoSetor(code: string, sectorCode: string, ligar: boolean): Promise<Recusa> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return { error: "Só o administrador compartilha uma tela com outro setor." };
  if (!getModuleDef(code) || getModuleDef(code)?.fixedSector || MODULOS_DO_MENU_GERAL.has(code) || MODULOS_NAS_SOLICITACOES.has(code)) {
    return { error: "Essa tela não pode ser compartilhada com outro setor." };
  }

  const [dono, ligados, ativos] = await Promise.all([
    setorDoModulo(ctx.tenantId, code),
    lerSetoresLigados(ctx.tenantId, code),
    getActiveSectors(ctx.tenantId),
  ]);
  if (!dono) return { error: "Essa tela não tem setor dono definido." };
  if (!ligados.disponivel) return { error: "Ainda não dá para salvar: falta atualizar o banco (migration)." };
  const atuais = ligados.porModulo.get(code) ?? [];
  const marcados = ligar ? [...atuais, sectorCode] : atuais.filter((s) => s !== sectorCode);
  // Na hora de tirar, os já gravados de setores inativos ficam de fora junto —
  // eles não aparecem para marcar de novo.
  const novos = setoresParaLigar(dono, marcados, ativos.map((s) => s.code));
  if (ligar && !novos.includes(sectorCode)) return { error: "Esse setor está inativo ou já é o dono da tela." };

  await setModuleSharedSectors(ctx.tenantId, code, novos);
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: ligar ? "module.share" : "module.unshare",
    entityType: "TenantModule",
    entityId: code,
    metadata: { sector: sectorCode, owner: dono },
  });
  // O layout inteiro, como ao mover: o menu de outro setor muda.
  revalidatePath("/", "layout");
}

export async function alternarModulo(code: string, enabled: boolean): Promise<Recusa> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return { error: "Só o administrador ativa ou desativa uma tela." };
  if (!getModuleDef(code)) return { error: "Essa tela não existe mais." };

  await setModuleEnabled(ctx.tenantId, code, enabled);
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: enabled ? "module.enable" : "module.disable",
    entityType: "TenantModule",
    entityId: code,
  });
  revalidatePath("/admin/setores");
}
