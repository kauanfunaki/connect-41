// A meta pessoal no banco (Academia, Fase 2, 11/11/2026). A regra mora em
// `metas.ts`; aqui se lê, confere e grava. A meta é da própria pessoa, como a
// preferência do ranking: ninguém mais vê.

import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { somarDias } from "@/lib/datas/calendario";
import { PRAZO_MAXIMO_DIAS, metaEmTexto, metaSchema, prazoValido, progressoDaMeta } from "./metas";
import { diaDoInstante, ehNivel, ehTeste, mesDoInstante } from "./regras";
import type { MetaNaTela } from "./tipos";

type Quem = Pick<AuthContext, "userId" | "tenantId" | "homeTenantId" | "subscriptionReadOnly">;

/** A meta de quem olha, com o progresso (o melhor valendo desde que ela foi definida). */
export async function metaDaPessoa(ctx: Pick<Quem, "userId">, agora: Date = new Date()): Promise<MetaNaTela | null> {
  const db = getPrisma();
  const meta = await db.academiaMeta.findUnique({ where: { userId: ctx.userId }, select: { teste: true, nivel: true, alvo: true, prazo: true, createdAt: true } });
  if (!meta || !ehTeste(meta.teste)) return null;
  const nivel = ehNivel(meta.nivel) ? meta.nivel : null;
  const resultados = await db.academiaResultado.findMany({
    where: {
      userId: ctx.userId, teste: meta.teste, valendo: true,
      // O índice (userId, teste, mes) faz o recorte; o `createdAt` acerta o dia.
      mes: { gte: mesDoInstante(meta.createdAt) },
      createdAt: { gte: meta.createdAt },
      ...(nivel ? { nivel } : {}),
    },
    select: { ppm: true, acertos: true },
    take: 2000,
  });
  const dados = { teste: meta.teste, nivel, alvo: meta.alvo, prazo: meta.prazo };
  return { ...dados, texto: metaEmTexto(dados), progresso: progressoDaMeta(dados, resultados, diaDoInstante(agora)) };
}

/** Grava (ou troca) a meta de quem pede. */
export async function gravarMeta(ctx: Quem, raw: unknown): Promise<{ ok: true } | { erro: string }> {
  if (ctx.subscriptionReadOnly) return { erro: "O escritório está em modo somente leitura." };
  const parsed = metaSchema.safeParse(raw);
  if (!parsed.success) return { erro: parsed.error.issues[0].message };
  const hoje = diaDoInstante();
  if (!prazoValido(parsed.data.prazo, hoje, somarDias(hoje, PRAZO_MAXIMO_DIAS))) return { erro: "Escolha um prazo de hoje até um ano à frente." };
  const dados = { teste: parsed.data.teste, nivel: parsed.data.nivel, alvo: parsed.data.alvo, prazo: parsed.data.prazo };
  // Trocar a meta recomeça a contagem: o progresso é desde a meta nova.
  await getPrisma().academiaMeta.upsert({
    where: { userId: ctx.userId },
    create: { tenantId: ctx.homeTenantId, userId: ctx.userId, ...dados },
    update: { ...dados, createdAt: new Date() },
  });
  return { ok: true };
}

export async function tirarMeta(ctx: Quem): Promise<{ ok: true } | { erro: string }> {
  if (ctx.subscriptionReadOnly) return { erro: "O escritório está em modo somente leitura." };
  await getPrisma().academiaMeta.deleteMany({ where: { userId: ctx.userId } });
  return { ok: true };
}
