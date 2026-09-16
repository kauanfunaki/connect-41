// Defesa contra robô no formulário público de candidatura.
//
// ─── Por que não captcha ────────────────────────────────────────────────────
//
// Captcha de terceiro pede chave, conta no provedor e um script de fora na
// página de um candidato — decisão que não é de código. O que se vê em
// formulário público sem login é robô genérico, e dois sinais baratos pegam
// quase todo ele:
//
// 1. **Campo-armadilha**: um campo que a pessoa não vê e o robô preenche.
// 2. **Carimbo de tempo assinado**: o servidor carimba a hora ao montar a
//    página. Quem posta direto na API não tem carimbo válido; quem envia em
//    menos de poucos segundos não leu o formulário.
//
// Robô detectado recebe um "sucesso" falso e nada é gravado: dizer que foi
// recusado ensina o robô a ajustar.
//
// ─── E o rate limit em memória ──────────────────────────────────────────────
//
// Continua em memória (`src/lib/rateLimit.ts`), de propósito: o deploy é um
// container só, e reiniciar o processo não é algo que quem ataca consegue
// provocar. Trocar por tabela custaria uma escrita no banco por requisição
// pública para resolver um cenário de várias réplicas que não existe hoje.

import { createHmac, timingSafeEqual } from "crypto";

/** Menos que isto entre abrir a página e enviar não é gente preenchendo. */
export const SEGUNDOS_MINIMOS_PARA_ENVIAR = 3;

/** Página aberta há mais que isto pede recarregar — e limita o reuso de um carimbo. */
export const HORAS_DE_VALIDADE_DO_CARIMBO = 12;

export type VeredictoAntiRobo = "humano" | "robo" | "carimbo_invalido";

function chave(): string {
  const segredo = process.env.JWT_ACCESS_SECRET;
  if (!segredo) throw new Error("Missing env var: JWT_ACCESS_SECRET");
  // Derivada, para um carimbo nunca servir de assinatura de outra coisa.
  return `${segredo}:carreiras-carimbo`;
}

function assinar(milissegundos: string): string {
  return createHmac("sha256", chave()).update(milissegundos).digest("base64url");
}

/** O carimbo que a página põe no formulário ao ser montada. */
export function emitirCarimbo(agora: Date): string {
  const ms = String(agora.getTime());
  return `${ms}.${assinar(ms)}`;
}

export function avaliarEnvio(p: { carimbo: string | null; armadilha: string | null; agora: Date }): VeredictoAntiRobo {
  if (p.armadilha && p.armadilha.trim() !== "") return "robo";

  const [ms, assinatura] = (p.carimbo ?? "").split(".");
  if (!ms || !assinatura || !/^\d+$/.test(ms)) return "carimbo_invalido";

  const esperada = Buffer.from(assinar(ms));
  const recebida = Buffer.from(assinatura);
  // Tamanho antes: `timingSafeEqual` lança com buffers de tamanhos diferentes.
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return "carimbo_invalido";

  const idade = p.agora.getTime() - Number(ms);
  if (idade < 0 || idade > HORAS_DE_VALIDADE_DO_CARIMBO * 3_600_000) return "carimbo_invalido";
  if (idade < SEGUNDOS_MINIMOS_PARA_ENVIAR * 1000) return "robo";
  return "humano";
}
