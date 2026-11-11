// O teste de lógica (10/11/2026, pedido do Kauan): 10 questões sorteadas do
// nível, 3 minutos, uma resposta por questão — como no 41 Hub. O novo é a
// imagem: no enunciado e, se quiser, em cada alternativa (a alternativa virou
// `{ texto?, imagemUrl? }`). Puro, sem banco.

import { z } from "zod";
import { NIVEIS, type Nivel } from "./regras";
import { ehUrlDeImagemDaAcademia } from "./imagens";

export type Alternativa = { texto?: string; imagemUrl?: string };

export const MINIMO_DE_ALTERNATIVAS = 2;
export const MAXIMO_DE_ALTERNATIVAS = 6;
export const TAMANHO_DO_ENUNCIADO = 2000;
export const TAMANHO_DA_ALTERNATIVA = 300;

/** As alternativas gravadas, lidas com tolerância: o que não for alternativa sai. */
export function lerAlternativas(json: unknown): Alternativa[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((a): Alternativa[] => {
    if (typeof a === "string") return a.trim() ? [{ texto: a }] : [];
    if (!a || typeof a !== "object") return [];
    const { texto, imagemUrl } = a as Record<string, unknown>;
    const alt: Alternativa = {};
    if (typeof texto === "string" && texto.trim()) alt.texto = texto;
    if (typeof imagemUrl === "string" && ehUrlDeImagemDaAcademia(imagemUrl)) alt.imagemUrl = imagemUrl;
    return alt.texto || alt.imagemUrl ? [alt] : [];
  });
}

const textoOpcional = (max: number) =>
  z.string().trim().max(max, `Use até ${max} caracteres.`).optional().transform((v) => (v ? v : undefined));
const imagemOpcional = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || ehUrlDeImagemDaAcademia(v), "Envie a imagem pela Academia.");

/** O cadastro de uma questão, como a tela de administração manda. */
export const questaoSchema = z
  .object({
    nivel: z.enum(NIVEIS, { error: "Escolha o nível." }),
    enunciado: z.string({ error: "Escreva o enunciado." }).trim().min(1, "Escreva o enunciado.").max(TAMANHO_DO_ENUNCIADO, `Use até ${TAMANHO_DO_ENUNCIADO} caracteres.`),
    imagemUrl: imagemOpcional,
    alternativas: z
      .array(z.object({ texto: textoOpcional(TAMANHO_DA_ALTERNATIVA), imagemUrl: imagemOpcional }))
      .min(MINIMO_DE_ALTERNATIVAS, `Cadastre pelo menos ${MINIMO_DE_ALTERNATIVAS} alternativas.`)
      .max(MAXIMO_DE_ALTERNATIVAS, `Cadastre no máximo ${MAXIMO_DE_ALTERNATIVAS} alternativas.`),
    correta: z.coerce.number({ error: "Marque a alternativa certa." }).int("Marque a alternativa certa."),
    ativo: z.boolean().default(true),
  })
  .superRefine((q, ctx) => {
    q.alternativas.forEach((a, i) => {
      if (!a.texto && !a.imagemUrl) ctx.addIssue({ code: "custom", path: ["alternativas", i], message: `A alternativa ${letraDaAlternativa(i)} precisa de texto ou de imagem.` });
    });
    if (q.correta < 0 || q.correta >= q.alternativas.length) ctx.addIssue({ code: "custom", path: ["correta"], message: "Marque a alternativa certa." });
  });
export type QuestaoParaGravar = z.output<typeof questaoSchema>;

/** A, B, C… — como a tela e o leitor de tela chamam a alternativa. */
export const letraDaAlternativa = (i: number) => String.fromCharCode(65 + i);

/** Corrige: acertos, total e a precisão (duas casas), como o Hub. */
export function corrigirLogica(corretas: readonly number[], respostas: readonly (number | null)[]): { acertos: number; total: number; precisao: number } {
  const total = corretas.length;
  let acertos = 0;
  corretas.forEach((c, i) => {
    if (respostas[i] === c) acertos++;
  });
  return { acertos, total, precisao: total > 0 ? Math.round((acertos / total) * 10_000) / 100 : 0 };
}

export type ResultadoDaLogica =
  | { ok: true; acertos: number; total: number; precisao: number; duracaoMs: number }
  | { ok: false; codigo: "respostas" | "curta"; motivo: string };

const TOLERANCIA_DO_RELOGIO_MS = 15_000;
const DURACAO_MINIMA_MS = 2_000;

/**
 * Avalia o envio. As respostas são posições (ou nulo, sem resposta); a certa
 * vem da foto da sessão, nunca da tela. A duração do navegador vale se estiver
 * a até 15 s do relógio do servidor (o Hub); senão, vale a do servidor.
 */
export function avaliarLogica(entrada: {
  corretas: readonly number[];
  respostas: readonly (number | null)[];
  duracaoDoNavegadorMs: number;
  decorridoNoServidorMs: number;
}): ResultadoDaLogica {
  if (entrada.respostas.length !== entrada.corretas.length) {
    return { ok: false, codigo: "respostas", motivo: "O número de respostas não confere com o das questões." };
  }
  const navegador = Number.isFinite(entrada.duracaoDoNavegadorMs) ? entrada.duracaoDoNavegadorMs : entrada.decorridoNoServidorMs;
  const confiavel = navegador <= entrada.decorridoNoServidorMs + 1_000 && Math.abs(navegador - entrada.decorridoNoServidorMs) <= TOLERANCIA_DO_RELOGIO_MS;
  const duracaoMs = Math.round(confiavel ? navegador : entrada.decorridoNoServidorMs);
  if (duracaoMs < DURACAO_MINIMA_MS) return { ok: false, codigo: "curta", motivo: "A rodada durou menos de 2 segundos." };
  return { ok: true, ...corrigirLogica(entrada.corretas, entrada.respostas), duracaoMs };
}

/** Embaralha (Fisher–Yates) com o sorteio dado — para sortear as questões da rodada. */
export function embaralhar<T>(lista: readonly T[], sorteio: () => number = Math.random): T[] {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(sorteio() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

export type { Nivel };
