// A meta pessoal da Academia (Fase 2, 11/11/2026 — Controle interno
// funcionalidade-594, escolhas do Kauan em 10/11): a pessoa escolhe o teste,
// o nível (ou qualquer um), o alvo e o prazo — "60 PPM na digitação, nível
// médio, até 30/11". O progresso é o melhor resultado valendo desde que a meta
// foi definida contra o alvo. Uma meta por pessoa: trocar substitui. Puro.

import { z } from "zod";
import { NIVEIS, QUESTOES_POR_RODADA, ROTULO_DO_NIVEL, ROTULO_DO_TESTE, TESTES, ehDeDigitar, type Nivel, type Teste } from "./regras";

/** O que a meta mede em cada teste: PPM na digitação e nos números, acertos na lógica e nos atalhos. */
export const UNIDADE_DA_META: Record<Teste, string> = { digitacao: "PPM", numeros: "PPM", logica: "acertos", atalhos: "acertos" };
/** O alvo máximo de cada teste (a lógica tem 10 questões por rodada). */
export const ALVO_MAXIMO: Record<Teste, number> = { digitacao: 200, numeros: 200, logica: QUESTOES_POR_RODADA, atalhos: 80 };
/** Até quantos dias à frente o prazo pode ir. */
export const PRAZO_MAXIMO_DIAS = 366;

export const metaSchema = z
  .object({
    teste: z.enum(TESTES, { error: "Escolha o teste." }),
    nivel: z.enum(NIVEIS).nullable().default(null),
    alvo: z.coerce.number({ error: "Escreva o alvo." }).int("Use um número inteiro.").min(1, "O alvo precisa ser maior que zero."),
    prazo: z.string({ error: "Escolha o prazo." }).regex(/^\d{4}-\d{2}-\d{2}$/, "Escolha o prazo."),
  })
  .superRefine((m, ctx) => {
    if (m.alvo > ALVO_MAXIMO[m.teste]) ctx.addIssue({ code: "custom", path: ["alvo"], message: `Em ${ROTULO_DO_TESTE[m.teste]}, o alvo vai até ${ALVO_MAXIMO[m.teste]} ${UNIDADE_DA_META[m.teste]}.` });
  });
export type MetaParaGravar = z.output<typeof metaSchema>;

/** O prazo vale: de hoje até `PRAZO_MAXIMO_DIAS` à frente. */
export function prazoValido(prazo: string, hoje: string, limite: string): boolean {
  return prazo >= hoje && prazo <= limite;
}

export type SituacaoDaMeta = "atingida" | "andamento" | "vencida";

export type ProgressoDaMeta = {
  /** O melhor desde a meta, na unidade dela (PPM ou acertos), ou nulo sem resultado. */
  melhor: number | null;
  /** De 0 a 100. */
  pct: number;
  situacao: SituacaoDaMeta;
};

/** O número de um resultado na unidade da meta. */
export const numeroDaMeta = (teste: Teste, r: { ppm: number | null; acertos: number | null }) => (ehDeDigitar(teste) ? (r.ppm ?? 0) : (r.acertos ?? 0));

/**
 * O progresso: o melhor resultado (`resultados` já são os valendo, do teste e
 * do nível da meta, desde que ela foi definida) contra o alvo. Atingida vale
 * mesmo depois do prazo; sem atingir, depois do prazo, vencida.
 */
export function progressoDaMeta(
  meta: { teste: Teste; alvo: number; prazo: string },
  resultados: readonly { ppm: number | null; acertos: number | null }[],
  hoje: string,
): ProgressoDaMeta {
  const melhor = resultados.length ? Math.max(...resultados.map((r) => numeroDaMeta(meta.teste, r))) : null;
  const pct = melhor === null ? 0 : Math.min(100, Math.round((melhor / meta.alvo) * 100));
  const situacao: SituacaoDaMeta = melhor !== null && melhor >= meta.alvo ? "atingida" : hoje > meta.prazo ? "vencida" : "andamento";
  return { melhor, pct, situacao };
}

/** "60 PPM em Digitação, nível Médio" / "8 acertos em Lógica". */
export function metaEmTexto(meta: { teste: Teste; nivel: Nivel | null; alvo: number }): string {
  return `${meta.alvo} ${UNIDADE_DA_META[meta.teste]} em ${ROTULO_DO_TESTE[meta.teste]}${meta.nivel ? `, nível ${ROTULO_DO_NIVEL[meta.nivel]}` : ""}`;
}
