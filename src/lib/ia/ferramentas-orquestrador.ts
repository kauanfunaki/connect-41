// O orquestrador do chat: a ferramenta que toda IA de setor tem para dizer
// "isto não é comigo".
//
// ─── Por que não uma IA que chama as outras ─────────────────────────────────
//
// Decidido em 25/09 (Plano-Chat-IA-por-Setor): um super-agente que lê toda
// pergunta e distribui custa uma ida a mais ao provedor **em toda pergunta**, é
// mais lento e mistura permissões. Aqui quem decide é a própria IA que recebeu
// a pergunta — ela já leu, sabe o que é. Quando a pergunta é de outro setor, ela
// chama `encaminhar_pergunta` em vez de responder, e o **servidor** (a rota do
// chat) faz o resto: passa a pergunta para a IA daquele setor, se a pessoa tiver
// acesso a ela, ou oferece abrir uma transferência. Pergunta do próprio setor
// não custa nada a mais.
//
// A ferramenta é de `escrita` e não tem executor: como toda escrita, vira
// proposta — nada é feito dentro do laço. Quem executa o encaminhamento é a
// rota, com a permissão de quem perguntou.

import type { FerramentaRegistrada } from "@/lib/ia/ferramentas";
import { SETORES_DO_ENCAMINHAMENTO, SUGERIR_RESPOSTAS } from "@/lib/ia/chat/regras";

export const ENCAMINHAR = "encaminhar_pergunta";

export const FERRAMENTAS_DO_ORQUESTRADOR: Record<string, FerramentaRegistrada> = {
  [ENCAMINHAR]: {
    def: {
      nome: ENCAMINHAR,
      descricao:
        "Use quando a pergunta for de OUTRO setor, em vez de responder. Setores: societario (abertura, alteração e baixa de empresas, processos na Junta), recrutamento (vagas e candidatos), fiscal (notas fiscais, XML), bpo (contas a pagar e a receber, DRE, conciliação, pendências com o cliente), contabil (balanço, lançamentos contábeis, fechamento), dp (folha, admissão, férias, rescisão), ajuda (como usar o Connect), outro (nenhum destes). O sistema passa a pergunta adiante.",
      parametros: {
        type: "object",
        properties: {
          setor: { type: "string", enum: [...SETORES_DO_ENCAMINHAMENTO] },
          motivo: { type: "string", description: "Em uma frase, do que trata a pergunta" },
        },
        required: ["setor", "motivo"],
        additionalProperties: false,
      },
      natureza: "escrita",
    },
  },

  // Respostas rápidas (02/10/2026): a IA oferece botões quando a próxima
  // resposta da pessoa é uma escolha curta. Mesma mecânica do encaminhamento —
  // escrita sem executor, vira "proposta" gravada no Json da mensagem, e a tela
  // a desenha como botões. O clique só manda o texto como pergunta nova.
  [SUGERIR_RESPOSTAS]: {
    def: {
      nome: SUGERIR_RESPOSTAS,
      descricao:
        "Use quando a próxima resposta da pessoa for uma escolha curta — confirmar (sim/não), escolher entre poucas opções, ou o próximo passo óbvio. Ofereça de 2 a 4 opções curtas, escritas como a pessoa diria. Sua resposta em texto continua normal; as opções aparecem como botões embaixo dela.",
      parametros: {
        type: "object",
        properties: {
          opcoes: {
            type: "array",
            items: { type: "string", description: "Até 60 caracteres, como a pessoa diria" },
            minItems: 2,
            maxItems: 4,
          },
        },
        required: ["opcoes"],
        additionalProperties: false,
      },
      natureza: "escrita",
    },
  },
};
