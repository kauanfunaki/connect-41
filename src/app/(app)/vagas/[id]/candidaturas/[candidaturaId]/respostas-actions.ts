"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { scopedVagaWhere } from "@/lib/auth/scope";
import { logAudit } from "@/lib/audit";
import { aplicarRespostas, CAMPOS_DE_RESPOSTA, lerFonte, validarRespostas, type Respostas } from "@/lib/recrutamento/respostas";

/**
 * O recrutador corrige ou preenche as respostas do candidato. O que ele grava
 * fica marcado como dele e **o bot do WhatsApp não sobrescreve depois**. Campo
 * apagado na tela volta a ficar vazio — e o bot pode perguntar de novo.
 */
export async function salvarRespostasDoCandidato(
  vagaId: string,
  candidaturaId: string,
  dados: { pretensaoSalarial: string; disponibilidade: string; deslocamentoMinutos: string }
): Promise<{ error: string } | { ok: true }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
  const prisma = getPrisma();
  const c = await prisma.candidatura.findFirst({
    where: { id: candidaturaId, vagaId, tenantId: ctx.tenantId, vaga: { ...scopedVagaWhere(ctx) } },
    select: { id: true, respostasFonte: true, vaga: { select: { sectorCode: true } } },
  });
  if (!c) return { error: "Candidatura não encontrada ou fora do seu escopo." };
  if (!canActOnSector(ctx, c.vaga.sectorCode)) return { error: "Sem permissão nesta vaga." };

  const numero = (s: string) => (s.trim() === "" ? null : s.replace(/\./g, "").replace(",", "."));
  const { valores, descartados } = validarRespostas({
    pretensaoSalarial: numero(dados.pretensaoSalarial),
    disponibilidade: dados.disponibilidade,
    deslocamentoMinutos: numero(dados.deslocamentoMinutos),
  });
  if (descartados.length) return { error: "Pretensão ou deslocamento fora do esperado." };

  // Campo vazio na tela = apagar. Apagado não tem origem: volta a ser pergunta em aberto.
  const vazios = CAMPOS_DE_RESPOSTA.filter((k) => !(k in valores));
  const r = aplicarRespostas(lerFonte(c.respostasFonte), valores, "RECRUTADOR", new Date());
  const fonte = { ...r.fonte };
  const limpar: Partial<Record<keyof Respostas, null>> = {};
  for (const k of vazios) {
    delete fonte[k];
    limpar[k] = null;
  }

  await prisma.candidatura.update({ where: { id: c.id }, data: { ...r.dados, ...limpar, respostasFonte: fonte } });
  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "candidatura.respostas", entityType: "Candidatura", entityId: c.id });
  revalidatePath(`/vagas/${vagaId}/candidaturas/${candidaturaId}`);
  return { ok: true };
}
