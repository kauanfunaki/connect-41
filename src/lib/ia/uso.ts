// Ler o uso de tokens da resposta de cada provedor.
//
// Duas funções de três linhas moram num arquivo só, com teste, por um motivo:
// **elas decidem se uma chamada entra na conta do mês**. Quando o bloco de uso
// não vem — provedor que mudou o formato, resposta em streaming, erro parcial —
// a tentação é ler `?? 0`, e aí a chamada passa a custar nada. Um mês inteiro
// de zeros é um teto que não segura, e a descoberta vem pela fatura.
//
// Aqui a ausência devolve `null`, que o resto do sistema já sabe tratar: custo
// desconhecido, e `saudeDoAgente` levantando a mão.

import type { UsoDeTokens } from "@/lib/ia/custo";

/** O uso que o SDK do Anthropic devolve em `response.usage`. */
export function usoAnthropic(
  usage: { input_tokens?: number; output_tokens?: number } | undefined | null
): UsoDeTokens | null {
  if (!usage) return null;
  if (typeof usage.input_tokens !== "number" || typeof usage.output_tokens !== "number") return null;
  return { entrada: usage.input_tokens, saida: usage.output_tokens };
}

/**
 * O uso que a Responses API da OpenAI devolve em `data.usage`.
 *
 * Recebe `unknown` porque do outro lado há `res.json()` — e tipar como se o
 * formato fosse garantido é como um `undefined` vira zero sem ninguém ver.
 */
export function usoOpenAi(usage: unknown): UsoDeTokens | null {
  if (!usage || typeof usage !== "object") return null;
  const u = usage as { input_tokens?: unknown; output_tokens?: unknown };
  if (typeof u.input_tokens !== "number" || typeof u.output_tokens !== "number") return null;
  return { entrada: u.input_tokens, saida: u.output_tokens };
}
