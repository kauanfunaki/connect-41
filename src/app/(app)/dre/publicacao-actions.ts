"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { podeAbrirADre } from "@/lib/dre/acesso";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";
import { competenciaValida } from "@/lib/financeiro/periodo";
import { diferencasDaDre, fotoTemMovimento } from "@/lib/dre/publicacao";
import { fotoAtualDoMes, garantirFotoInicial, publicacoesDaEmpresa, publicarMes } from "@/lib/dre/publicacaoServidor";

export type ResultadoDaPublicacao = { error: string } | { success: true };

/**
 * "Publicar para o cliente" (05/11/2026, decisão D4 do Kauan): grava a foto de
 * agora da DRE de um mês da empresa, e é ela que o portal passa a mostrar.
 * Publica quem trabalha na DRE (a mesma régua da tela); a opção de a
 * coordenação aprovar antes (D4-B) não foi a escolhida.
 */
export async function publicarDreDoMes(companyId: string, competencia: string): Promise<ResultadoDaPublicacao> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!(await podeAbrirADre(ctx))) return { error: "Sem permissão no DRE." };
  const tenantId = ctx.tenantId;

  const mes = competenciaValida(competencia);
  if (!mes) return { error: "Mês inválido." };

  const empresa = await getPrisma().company.findFirst({ where: { id: companyId, tenantId }, select: { id: true } });
  if (!empresa) return { error: "Empresa não encontrada." };
  // Uma empresa por vez no BPO (21/10/2026): com foco, só publica nele.
  const foraDoFoco = await recusaDoFoco(ctx, [companyId]);
  if (foraDoFoco) return { error: foraDoFoco };

  // A foto inicial antes: sem ela, publicar este mês faria a empresa pular a
  // foto dos outros meses que o cliente já via.
  await garantirFotoInicial(tenantId, companyId);
  const [atual, publicadas] = await Promise.all([fotoAtualDoMes(tenantId, companyId, mes), publicacoesDaEmpresa(tenantId, companyId, [mes])]);
  const anterior = publicadas.get(mes) ?? null;
  const diferencas = diferencasDaDre(anterior?.foto ?? null, atual);
  if (!anterior && !fotoTemMovimento(atual)) return { error: "Este mês não tem movimento para publicar." };
  if (anterior && diferencas.length === 0) return { error: "O portal já mostra esta versão." };

  const ator = ctx.userId ? await getPrisma().user.findUnique({ where: { id: ctx.userId }, select: { name: true } }) : null;
  await publicarMes({ tenantId, companyId, competencia: mes, foto: atual, userId: ctx.userId || null, nome: ator?.name ?? null });

  await logAudit({
    tenantId,
    userId: ctx.userId,
    action: "dre.publicar",
    entityType: "Company",
    entityId: companyId,
    metadata: {
      competencia: mes,
      mudancas: diferencas.length,
      substituiu: anterior ? { publicadoEm: anterior.publicadoEm.toISOString(), inicial: anterior.inicial } : null,
    },
  });

  for (const p of ["/dre", "/dre/economica", "/portal/dre"]) revalidatePath(p);
  return { success: true };
}
