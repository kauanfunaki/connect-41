"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { lerFormularioDeLicenca } from "@/lib/societario/licenca-form";

// `SECTOR` é o setor de origem, usado só como padrão: acesso e equipe seguem o
// setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = "societario";
const MODULE = "societario_licencas";

export type LicencaState = { error: string } | { success: true } | null;

async function contexto() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { erro: "Não autenticado", ctx: null };
  if (!canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) return { erro: "Sem permissão no Societário.", ctx: null };
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return { erro: "O módulo de licenças não está ligado.", ctx: null };
  return { erro: null, ctx };
}

/**
 * Cria ou edita uma licença.
 *
 * O tenant é conferido nas três pontas — empresa, órgão e a própria licença —,
 * porque os três ids chegam pelo formulário.
 */
export async function salvarLicenca(_prev: LicencaState, form: FormData): Promise<LicencaState> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };
  const tenantId = ctx.tenantId;

  const id = String(form.get("id") ?? "").trim() || null;
  const lido = lerFormularioDeLicenca({
    companyId: form.get("companyId"),
    kind: form.get("kind"),
    organId: form.get("organId"),
    number: form.get("number"),
    issuedAt: form.get("issuedAt"),
    expiresAt: form.get("expiresAt"),
    notes: form.get("notes"),
  });
  if (!lido.ok) return { error: lido.erro };
  const { dados } = lido;

  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({
    where: { id: dados.companyId, tenantId },
    select: { id: true },
  });
  if (!empresa) return { error: "Empresa não encontrada." };

  if (dados.organId) {
    const orgao = await prisma.processOrgan.findFirst({
      where: { id: dados.organId, tenantId },
      select: { id: true },
    });
    if (!orgao) return { error: "Órgão não encontrado." };
  }

  try {
    if (id) {
      const atual = await prisma.license.findFirst({
        where: { id, tenantId },
        select: { id: true, companyId: true },
      });
      if (!atual) return { error: "Licença não encontrada." };
      // A empresa não muda na edição: licença de outra empresa é outra licença,
      // e mover esta levaria junto o histórico de renovação da primeira.
      if (atual.companyId !== dados.companyId) {
        return { error: "A empresa de uma licença não muda — cadastre uma nova." };
      }
      await prisma.license.update({
        where: { id },
        data: {
          kind: dados.kind,
          organId: dados.organId,
          number: dados.number,
          issuedAt: dados.issuedAt,
          expiresAt: dados.expiresAt,
          notes: dados.notes,
        },
      });
      await logAudit({
        tenantId,
        userId: ctx.userId,
        action: "license.update",
        entityType: "License",
        entityId: id,
        metadata: { kind: dados.kind },
      });
    } else {
      const criada = await prisma.license.create({
        data: { tenantId, ...dados },
        select: { id: true },
      });
      await logAudit({
        tenantId,
        userId: ctx.userId,
        action: "license.create",
        entityType: "License",
        entityId: criada.id,
        metadata: { kind: dados.kind, companyId: dados.companyId },
      });
    }
  } catch (err) {
    console.error("[salvarLicenca]", err);
    return { error: "Erro ao salvar a licença." };
  }

  revalidatePath("/licencas");
  revalidatePath(`/empresas/${dados.companyId}`);
  return { success: true };
}

async function mudarRevogacao(id: string, revogar: boolean): Promise<LicencaState> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };

  const prisma = getPrisma();
  const licenca = await prisma.license.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true, companyId: true, revokedAt: true },
  });
  if (!licenca) return { error: "Licença não encontrada." };
  if (revogar && licenca.revokedAt) return { error: "Esta licença já está revogada." };
  if (!revogar && !licenca.revokedAt) return { error: "Esta licença não está revogada." };

  await prisma.license.update({
    where: { id },
    data: { revokedAt: revogar ? new Date() : null },
  });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: revogar ? "license.revoke" : "license.reactivate",
    entityType: "License",
    entityId: id,
  });

  revalidatePath("/licencas");
  revalidatePath(`/empresas/${licenca.companyId}`);
  return { success: true };
}

/**
 * Revoga: cassada, substituída ou deixou de valer.
 *
 * Não apaga — a licença sai da fila de renovação e fica no histórico da empresa.
 * Apagar faria sumir a prova de que ela existiu, e é essa prova que se procura
 * quando o cliente é fiscalizado.
 */
export async function revogarLicenca(id: string): Promise<LicencaState> {
  return mudarRevogacao(id, true);
}

/** Desfaz a revogação — quando foi marcada por engano. */
export async function reativarLicenca(id: string): Promise<LicencaState> {
  return mudarRevogacao(id, false);
}
