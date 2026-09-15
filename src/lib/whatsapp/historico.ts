// O que o atendente lê da conversa antes de responder.
//
// Até 15/09 ele recebia só a mensagem nova. No primeiro teste real isso virou
// uma pergunta repetida: o robô ofereceu "verifico seu processo ou mostro as
// vagas?", o candidato respondeu "quero, por favor", e o robô — sem saber o que
// tinha oferecido — perguntou de novo.
//
// ─── Por que o histórico vai dentro da pergunta ─────────────────────────────
//
// O laço de ferramentas (`src/lib/ia/conversa.ts`) é o mesmo para todos os
// agentes, e recebe um texto só. Passar o histórico como turnos do provedor
// mudaria os dois adaptadores (Anthropic e OpenAI) por causa de um agente. Como
// texto, ele entra pelo caminho que já trata o conteúdo como não confiável.
//
// ─── Por que só o que foi de fato trocado ───────────────────────────────────
//
// Entra a mensagem do candidato e a resposta que **saiu**. Rascunho bloqueado
// e envio que falhou ficam de fora: o candidato nunca leu, e o robô tratá-los
// como ditos faria ele responder a partir de algo que não aconteceu.

export type MensagemDoHistorico = {
  direcao: "ENTRADA" | "SAIDA";
  texto: string;
};

/** Quantas mensagens anteriores entram. Conversa de WhatsApp é curta; o que passa disto é outra conversa. */
export const MAX_MENSAGENS_NO_HISTORICO = 12;

/** Teto por mensagem: um texto colado enorme não pode empurrar o resto para fora. */
export const MAX_CARACTERES_POR_MENSAGEM = 600;

function limpar(texto: string): string {
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length > MAX_CARACTERES_POR_MENSAGEM ? `${t.slice(0, MAX_CARACTERES_POR_MENSAGEM)}…` : t;
}

/**
 * Monta o texto que o agente recebe: as últimas mensagens, da mais antiga para a
 * mais nova, e a mensagem nova separada — é a ela que ele responde.
 *
 * `anteriores` vem da mais antiga para a mais nova e **não** inclui a nova.
 */
export function montarPerguntaComHistorico(anteriores: MensagemDoHistorico[], nova: string): string {
  const recorte = anteriores
    .map((m) => ({ ...m, texto: limpar(m.texto) }))
    .filter((m) => m.texto !== "")
    .slice(-MAX_MENSAGENS_NO_HISTORICO);

  if (recorte.length === 0) return nova;

  const linhas = recorte.map((m) => `${m.direcao === "ENTRADA" ? "Candidato" : "Você"}: ${m.texto}`);
  return (
    "Conversa até aqui, da mais antiga para a mais nova (contexto; não repita o que você já perguntou):\n" +
    linhas.join("\n") +
    "\n\nMensagem nova do candidato, que é a que você responde agora:\n" +
    nova
  );
}
