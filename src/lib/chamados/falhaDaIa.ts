import { ZodError } from "zod";

/**
 * O motivo de uma falha da IA da triagem, para o log do servidor (10/11/2026).
 * Até aqui o erro era engolido e a pessoa via "indisponível ou precisa de mais
 * contexto", sem ninguém saber qual dos dois. O texto que vai ao log é o da
 * nossa mensagem: as falhas do provedor já chegam sem o corpo da resposta
 * (`falhaEstrita` em src/lib/ai.ts), e o erro de JSON, que cita um trecho do
 * que o modelo devolveu, vira só "resposta fora do formato".
 */
export function motivoDaFalha(err: unknown): string {
  if (err instanceof SyntaxError) return "resposta da IA fora do formato JSON";
  if (err instanceof ZodError) return "resposta da IA fora do esquema esperado";
  const texto = err instanceof Error ? err.message : String(err);
  return texto.replace(/\s+/g, " ").trim().slice(0, 300) || "erro sem mensagem";
}
