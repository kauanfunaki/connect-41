"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector, canManageSector } from "@/lib/auth/context";
import { scopedVagaWhere } from "@/lib/auth/scope";
import { isAiConfigured } from "@/lib/ai";
import { logAudit } from "@/lib/audit";
import { filaDoLote, pontuarCandidatura, requisitosAtuais, salvarRequisitos } from "@/lib/recrutamento/triagemServidor";

/**
 * Candidaturas por chamada do lote. Cada uma são até duas chamadas de IA
 * (perfil + pontuação); poucas por vez mantêm a requisição curta, e o
 * navegador chama de novo até a fila acabar — sem fila nem cron novos.
 */
const POR_CHAMADA = 3;

async function vagaDoContexto(vagaId: string) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return null;
  const vaga = await getPrisma().vaga.findFirst({
    where: { id: vagaId, ...scopedVagaWhere(ctx) },
    select: { id: true, sectorCode: true, title: true },
  });
  return vaga ? { ctx, tenantId: ctx.tenantId, vaga } : null;
}

export async function salvarRequisitosDaVaga(vagaId: string, dados: unknown): Promise<{ error: string } | { ok: true; versao: number; igual: boolean }> {
  const v = await vagaDoContexto(vagaId);
  if (!v) return { error: "Vaga não encontrada." };
  if (!canManageSector(v.ctx, v.vaga.sectorCode)) return { error: "Sem permissão para editar os requisitos desta vaga." };
  const r = await salvarRequisitos(v.tenantId, vagaId, v.ctx.userId, dados);
  if ("erro" in r) return { error: r.erro };
  if (!r.igual) {
    await logAudit({ tenantId: v.tenantId, userId: v.ctx.userId, action: "vaga.requisitos", entityType: "Vaga", entityId: vagaId, metadata: { versao: r.versao } });
    revalidatePath(`/vagas/${vagaId}`);
  }
  return { ok: true, versao: r.versao, igual: r.igual };
}

export type PassoDoLote = {
  processadas: { id: string; nome: string; score: number; faixa: string }[];
  falhas: { id: string; nome: string; erro: string }[];
  restantes: number;
};

/**
 * Um passo do lote. `pular` são as candidaturas que já falharam nesta rodada
 * (sem currículo, PDF ilegível): sem isso o modo "pendentes" as devolveria
 * para sempre.
 */
export async function pontuarPassoDoLote(vagaId: string, modo: "pendentes" | "todas", pular: string[], feitas: string[]): Promise<{ error: string } | PassoDoLote> {
  const v = await vagaDoContexto(vagaId);
  if (!v) return { error: "Vaga não encontrada." };
  if (!canActOnSector(v.ctx, v.vaga.sectorCode)) return { error: "Sem permissão para pontuar candidatos desta vaga." };
  if (!(await isAiConfigured(v.tenantId))) return { error: "IA não configurada neste workspace." };
  const requisitos = await requisitosAtuais(v.tenantId, vagaId);
  if (!requisitos) return { error: "Cadastre os requisitos da vaga antes de pontuar." };

  // Em "todas", as já feitas nesta rodada saem da fila pelo navegador; em
  // "pendentes", saem sozinhas porque ganharam nota na versão atual.
  const ignorar = new Set([...pular, ...feitas]);
  const fila = (await filaDoLote(v.tenantId, vagaId, requisitos.id, modo)).filter((c) => !ignorar.has(c.id));
  const agora = fila.slice(0, POR_CHAMADA);

  const passo: PassoDoLote = { processadas: [], falhas: [], restantes: fila.length - agora.length };
  for (const c of agora) {
    const r = await pontuarCandidatura({ tenantId: v.tenantId, candidaturaId: c.id, requisitos, userId: v.ctx.userId, origem: "LOTE" });
    if (r.ok) passo.processadas.push({ id: c.id, nome: c.nome, score: r.score, faixa: r.faixa });
    else {
      passo.falhas.push({ id: c.id, nome: c.nome, erro: r.erro });
      // Teto de gasto ou agente desligado não melhora na próxima candidatura: para o lote.
      if (/teto|desligado|chave de IA/i.test(r.erro)) return { ...passo, restantes: 0 };
    }
  }
  if (passo.restantes === 0) revalidatePath(`/vagas/${vagaId}`);
  return passo;
}

/** Pontua uma candidatura só (botão na página da candidatura). */
export async function pontuarUmaCandidatura(vagaId: string, candidaturaId: string): Promise<{ error: string } | { ok: true }> {
  const v = await vagaDoContexto(vagaId);
  if (!v) return { error: "Vaga não encontrada." };
  if (!canActOnSector(v.ctx, v.vaga.sectorCode)) return { error: "Sem permissão." };
  if (!(await isAiConfigured(v.tenantId))) return { error: "IA não configurada neste workspace." };
  const requisitos = await requisitosAtuais(v.tenantId, vagaId);
  if (!requisitos) return { error: "Cadastre os requisitos da vaga antes de pontuar." };
  const c = await getPrisma().candidatura.findFirst({ where: { id: candidaturaId, vagaId, tenantId: v.tenantId }, select: { id: true } });
  if (!c) return { error: "Candidatura não encontrada." };
  const r = await pontuarCandidatura({ tenantId: v.tenantId, candidaturaId, requisitos, userId: v.ctx.userId, origem: "USUARIO" });
  if (!r.ok) return { error: r.erro };
  revalidatePath(`/vagas/${vagaId}`);
  revalidatePath(`/vagas/${vagaId}/candidaturas/${candidaturaId}`);
  return { ok: true };
}
