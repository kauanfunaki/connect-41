// Leads do Comercial — o que toca o banco: o escritório que recebe a ficha
// pública do portal e o aviso no sino quando um lead chega (05/10/2026).

import { cache } from "react";
import { getPrisma } from "@/lib/prisma";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { notifyUser } from "@/lib/notifications";
import { MODULO_LEADS, quemAvisarDoLead, slugDoEscritorioDaFicha, textoDoAvisoDeLead } from "./regras";

/**
 * O escritório que recebe a ficha "Quero ser cliente", ou `null` quando a ficha
 * está fora do ar.
 *
 * Fora do ar quando falta `PORTAL_ESCRITORIO_SLUG`, quando o slug não é de um
 * escritório ativo, ou quando o escritório desligou o módulo Leads — lead
 * gravado num módulo desligado ficaria guardado sem ninguém ver nem ser avisado.
 * O login do portal só mostra o botão da ficha quando ela está no ar.
 */
export const escritorioDaFicha = cache(async (): Promise<{ tenantId: string; nome: string } | null> => {
  const slug = slugDoEscritorioDaFicha();
  if (!slug) return null;
  const tenant = await getPrisma().tenant.findUnique({ where: { slug }, select: { id: true, name: true, active: true } });
  if (!tenant || !tenant.active) return null;
  if (!(await isModuleEnabled(tenant.id, MODULO_LEADS))) return null;
  return { tenantId: tenant.id, nome: tenant.name };
});

/**
 * Avisa no sino (e por push) quem precisa saber do lead novo. Best-effort,
 * como os outros avisos: o lead já está gravado quando o aviso sai, e uma falha
 * aqui não pode virar erro para quem preencheu a ficha.
 *
 * O setor é o que opera o módulo neste escritório — o Comercial, a não ser que
 * o módulo tenha sido transferido em /admin/modulos.
 */
export async function avisarEquipeDoLead(lead: {
  tenantId: string;
  id: string;
  nome: string;
  empresa: string | null;
  origem: string;
}): Promise<void> {
  try {
    const prisma = getPrisma();
    const setor = (await setorDoModulo(lead.tenantId, MODULO_LEADS)) ?? "comercial";
    const doSetor = await prisma.user.findMany({
      where: { tenantId: lead.tenantId, active: true, sectors: { some: { sectorCode: setor } } },
      select: { id: true },
    });
    const administradores =
      doSetor.length > 0
        ? []
        : await prisma.user.findMany({
            where: { tenantId: lead.tenantId, active: true, role: { in: ["ADMIN", "SUPER_ADMIN"] } },
            select: { id: true },
          });
    const ids = quemAvisarDoLead({ doSetor: doSetor.map((u) => u.id), administradores: administradores.map((u) => u.id) });
    const aviso = {
      tenantId: lead.tenantId,
      type: "LEAD_NOVO",
      message: textoDoAvisoDeLead(lead),
      entityId: lead.id,
    };
    await Promise.all(ids.map((id) => notifyUser(id, aviso)));
  } catch (err) {
    console.error("[avisarEquipeDoLead]", err);
  }
}
