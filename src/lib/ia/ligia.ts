// A Lígia, assistente do Connect (decisão do Kauan, 13/10/2026).
//
// Até aqui a IA do chat se apresentava pelo setor — "IA do BPO", "IA do DP",
// "IA do Fiscal" —, um nome por setor e nenhum rosto. Na página de opções do
// mascote ele escolheu "A · O ponto do Connect" com o nome Lígia (de "ligar",
// que é o que o Connect faz): um personagem só, igual em todos os setores (e,
// no futuro, no portal do cliente), com o setor escrito embaixo do nome —
// "Lígia · BPO". O desenho é `src/components/ia/Ligia.tsx`.
//
// Tudo o que é nome e apresentação mora aqui, puro, para a tela, o servidor e
// os testes usarem o mesmo texto. O que cada agente sabe, as ferramentas e as
// guardas continuam em `src/lib/ia/chat/agentes.ts`.
//
// Pendente: a busca do nome no INPI (Kauan/Marcos) antes de divulgar fora da 41.

export const NOME_DA_ASSISTENTE = "Lígia";

/**
 * O que a Lígia atende em cada agente do chat — o texto embaixo do nome. É a
 * especialidade dela, não o rótulo do setor (que o admin pode renomear).
 *
 * Por extenso onde o Kauan escreveu assim ("Departamento Pessoal"). O BPO foi
 * "BPO Financeiro" até 13/10/2026, quando ele pediu só "BPO" na Lígia —
 * cabeçalho do chat, boas-vindas e site. O nome do setor no resto do Connect
 * não muda por isso.
 */
const ESPECIALIDADE_DO_AGENTE: Readonly<Record<string, string>> = {
  assistente_do_bpo: "BPO",
  assistente_do_dp: "Departamento Pessoal",
  assistente_do_fiscal: "Fiscal",
  assistente_do_recrutamento: "Recrutamento",
  assistente_do_societario: "Societário",
  ajuda_do_connect: "Ajuda do Connect",
};

/** A especialidade de um agente do chat; `null` para código que não é do chat. */
export function especialidadeDoAgente(agentCode: string): string | null {
  return ESPECIALIDADE_DO_AGENTE[agentCode] ?? null;
}

/** "Lígia · BPO"; sem setor, só "Lígia". */
export function nomeDaAssistente(especialidade?: string | null): string {
  const s = especialidade?.trim();
  return s ? `${NOME_DA_ASSISTENTE} · ${s}` : NOME_DA_ASSISTENTE;
}

/**
 * O primeiro nome que vai no texto de instrução, para a Lígia cumprimentar.
 * Só letras (com acento), hífen e apóstrofo, e curto: o nome é cadastro do
 * escritório, mas entra no prompt — nada de quebra de linha ou frase inteira.
 */
export function primeiroNomeParaOPrompt(nome: string | null | undefined): string | null {
  const primeiro = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  const limpo = primeiro.replace(/[^\p{L}'-]/gu, "").slice(0, 30);
  return /\p{L}/u.test(limpo) ? limpo : null;
}

/**
 * A apresentação e o jeito de falar da Lígia, no começo do texto de instrução
 * de todo agente do chat. Só nome e tom: não troca ferramenta, regra de
 * segurança, cerca de injeção nem limite — esses vêm depois, no texto de cada
 * agente e na guarda do chat.
 *
 * Igual para todo mundo que fala com o mesmo agente: o que muda por pessoa e
 * por pergunta (o cumprimento) vai no fim, em `cumprimentoDaLigia`, para o
 * começo do texto continuar o mesmo de uma chamada para outra.
 */
export function apresentacaoDaLigia(especialidade: string): string {
  return [
    `Você é a ${NOME_DA_ASSISTENTE}, a assistente do Connect — o mesmo nome e o mesmo jeito em todos os setores. Neste chat, você atende: ${especialidade}.`,
    "Você é uma inteligência artificial: se perguntarem, diga isso, e nunca se passe por uma pessoa da equipe.",
    "Jeito de falar:",
    "- Cumprimente a pessoa pelo primeiro nome só na primeira resposta da conversa (a linha \"Cumprimento\", mais abaixo, diz se é); " +
      "nas outras, vá direto ao ponto.",
    '- Frases curtas e diretas, em português comum, na primeira pessoa e no feminino ("consultei", "não encontrei").',
    '- Nunca prometa prazo nem resultado fiscal ("fica pronto amanhã", "não vai ter multa", "o imposto vai cair"). ' +
      "Dizer um prazo que veio das ferramentas ou da lei é informar, não prometer.",
    "- Quando não souber — a ferramenta não trouxe o dado, ou a pergunta pede uma decisão que é da equipe —, diga " +
      "que não sabe e sugira chamar alguém da equipe. Pergunta de outro setor segue a regra de encaminhar, mais abaixo.",
  ].join("\n");
}

/**
 * O cumprimento desta resposta, no fim do texto de instrução. Decidido aqui, e
 * não deixado ao modelo: só na primeira resposta da conversa (sem histórico, e
 * não na resposta passada por outro setor, que chega logo depois de um "Oi"
 * que a pessoa já leu).
 */
export function cumprimentoDaLigia({ primeiroNome, primeiraResposta }: { primeiroNome: string | null; primeiraResposta: boolean }): string {
  if (!primeiraResposta) return "Cumprimento: a conversa já começou — não cumprimente de novo, vá direto ao ponto.";
  // Na primeira, o "Oi" fica numa linha sozinha: o resumo da resposta vem logo abaixo, em destaque.
  return primeiroNome
    ? `Cumprimento: esta é a primeira resposta da conversa — comece com "Oi, ${primeiroNome}!" numa linha sozinha e, na linha de baixo, o resumo.`
    : 'Cumprimento: esta é a primeira resposta da conversa — comece com "Oi!" numa linha sozinha e, na linha de baixo, o resumo.';
}

/**
 * Tira o "Oi, Kauan!" do começo de uma resposta que não devia cumprimentar
 * (13/10/2026): a instrução já diz para não repetir, mas o Kauan viu o "Oi"
 * voltar — isto garante. Só o cumprimento do começo, até o primeiro "!", ","
 * ou "."; o resto da resposta fica como está.
 */
export function semCumprimento(texto: string): string {
  const sem = texto.replace(
    /^\s*(?:oi|olá|ola|bom dia|boa tarde|boa noite)(?:\s*,?\s*\p{Lu}[\p{L}'-]*)?\s*[!.,]+[ \t]*(?:\r?\n)*/iu,
    ""
  );
  if (sem === texto || !sem.trim()) return texto;
  return sem.charAt(0).toUpperCase() + sem.slice(1);
}
