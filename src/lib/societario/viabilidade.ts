// Viabilidade — Empresa Fácil PR: as respostas do questionário.
//
// São **26 perguntas**, não 21 como se pensava, e o setor (Ruli) mandou em
// 15/09/2026 a resposta padrão de cada uma **e a regra de quando ela muda**.
// Isso tirou a viabilidade da lista de "bloqueado": deixou de ser conhecimento
// na cabeça de quem preenche e virou dado.
//
// ─── O que este arquivo é, e o que não é ────────────────────────────────────
//
// É a **decisão**: dados cinco fatos sobre a empresa e a atividade, quais são as
// 26 respostas. Pura, sem rede e sem portal — a mesma separação dos leitores de
// órgão em `orgaos/`.
//
// Não é o preenchimento. Quem digita no Empresa Fácil é outro passo, e ele vai
// precisar casar cada pergunta da tela com uma daqui — o texto abaixo é o
// resumo do setor, não o enunciado literal do formulário.
//
// ─── As duas coisas que este código se recusa a fazer ───────────────────────
//
// 1. **Responder "Reside no local" sem saber o endereço do sócio.** É a única
//    pergunta sem padrão: é Sim quando o endereço do sócio é o da empresa, Não
//    quando não é (confirmado pelo Kauan em 15/09). O Connect **não guarda sócio
//    hoje** — não existe modelo de sócio no schema —, então esse fato entra de
//    fora, e quando não entra a resposta é nula, para uma pessoa responder.
// 2. **Responder pergunta que não está nesta lista.** O setor avisou que
//    aparecem perguntas extras conforme o CNAE, **sem padrão fixo**. Uma
//    pergunta desconhecida no formulário é trabalho de gente, e o robô que a
//    respondesse por semelhança estaria declarando coisa errada a um órgão.

/** Os fatos de onde saem as respostas que mudam. Cinco, e só. */
export type FatosDaViabilidade = {
  /** A atividade é exercida no endereço declarado? */
  exercidaNoLocal: boolean;
  /** A atividade é de comércio? */
  ehComercio: boolean;
  /** A atividade pode ser feita de forma online? */
  podeSerOnline: boolean;
  /**
   * O endereço do sócio é o mesmo da empresa?
   *
   * `null` quando não se sabe — que é o caso sempre que o dado não vier de
   * fora, porque o Connect não tem cadastro de sócio.
   */
  socioNoMesmoEndereco: boolean | null;
  /** A área comporta mais gente que o mínimo? Ver `capacidade-de-publico`. */
  areaGrande: boolean;
};

export type ValorDaResposta = "Sim" | "Não" | number;

export type RespostaDaViabilidade = {
  id: string;
  /** O resumo do setor, não o enunciado literal do formulário. */
  pergunta: string;
  /** `null` quando o robô não pode responder — `conferir` diz por quê. */
  resposta: ValorDaResposta | null;
  /** De onde saiu: o padrão do setor ou a regra que o mudou. */
  motivo: string;
  /** Presente quando uma pessoa precisa olhar antes de enviar. */
  conferir?: string;
};

type Pergunta = {
  id: string;
  pergunta: string;
  padrao: ValorDaResposta | null;
  /**
   * O setor escreveu "sempre" na coluna de quando muda.
   *
   * Guardado porque ele **distinguiu** "sempre" de "—": na primeira ele afirmou
   * que a resposta não muda; na segunda, só não deu condição. Tratar as duas
   * como iguais perderia a diferença entre "é invariante" e "não perguntei", e
   * é ela que aparece no `motivo` de cada resposta — quem preenche vê qual
   * resposta nunca varia e qual é só o padrão de hoje.
   */
  sempre: boolean;
  regra?: (f: FatosDaViabilidade) => Omit<RespostaDaViabilidade, "id" | "pergunta"> | null;
};

const PADRAO = "resposta padrão do setor";
const FIXA = "resposta fixa do setor — não muda";

/**
 * As 26, na ordem da tabela do levantamento.
 *
 * Exportada para quem for casar com a tela do Empresa Fácil: é a lista contra a
 * qual se confere se apareceu pergunta nova.
 */
export const PERGUNTAS: readonly Pergunta[] = [
  {
    id: "estoque-no-local",
    pergunta: "Estoque no local",
    padrao: "Não",
    sempre: false,
    regra: (f) => (f.ehComercio && f.exercidaNoLocal ? { resposta: "Sim", motivo: "comércio exercido no local" } : null),
  },
  {
    id: "atendimento-ao-publico",
    pergunta: "Atendimento ao público no local",
    padrao: "Não",
    sempre: false,
    regra: (f) => (f.exercidaNoLocal ? { resposta: "Sim", motivo: "atividade exercida no local" } : null),
  },
  {
    id: "reside-no-local",
    pergunta: "Reside no local",
    // Sem padrão de propósito: é a única que depende de um fato da empresa, e
    // não da atividade.
    padrao: null,
    sempre: false,
    regra: (f) =>
      f.socioNoMesmoEndereco === null
        ? {
            resposta: null,
            motivo: "depende do endereço do sócio",
            conferir: "O Connect não guarda sócio: alguém precisa dizer se o endereço do sócio é o da empresa.",
          }
        : {
            resposta: f.socioNoMesmoEndereco ? "Sim" : "Não",
            motivo: f.socioNoMesmoEndereco ? "endereço do sócio é o da empresa" : "endereço do sócio é outro",
          },
  },
  {
    id: "pavimento-terreo",
    pergunta: "Atividade no pavimento térreo",
    padrao: "Não",
    sempre: false,
    // A tabela do setor traz padrão "Não" e, na coluna de quando muda, "Não
    // quando não exerce no local" — que repete o padrão em vez de descrever uma
    // troca. Ou a condição está incompleta, ou o padrão é outro quando a
    // atividade É exercida no local. Não dá para saber qual, então responde o
    // padrão e manda conferir: inventar aqui é declarar ao órgão um dado que
    // ninguém verificou.
    regra: (f) =>
      f.exercidaNoLocal
        ? {
            resposta: "Não",
            motivo: PADRAO,
            conferir:
              "A regra do setor repete o padrão em vez de descrever a troca — confirmar com o Societário quando a atividade é exercida no local.",
          }
        : null,
  },
  { id: "subsolo-uso-distinto", pergunta: "Subsolo com uso distinto de estacionamento", padrao: "Não", sempre: true },
  { id: "atividade-na-residencia", pergunta: "Atividade na residência do empreendedor", padrao: "Não", sempre: false },
  {
    id: "exclusivamente-virtual",
    pergunta: "Exclusivamente virtual / endereço só fiscal",
    padrao: "Não",
    sempre: false,
    regra: (f) => (f.podeSerOnline ? { resposta: "Sim", motivo: "a atividade pode ser online" } : null),
  },
  {
    id: "manutencao-veiculos-1",
    pergunta: "Manutenção, lavagem ou abastecimento de veículos (1ª variação)",
    padrao: "Não",
    sempre: true,
  },
  {
    id: "manutencao-veiculos-2",
    pergunta: "Manutenção, lavagem ou abastecimento de veículos (2ª variação)",
    padrao: "Não",
    sempre: true,
  },
  {
    id: "exclusivamente-escritorio",
    pergunta: "Exclusivamente escritório administrativo",
    padrao: "Sim",
    sempre: false,
    regra: (f) => (f.exercidaNoLocal ? { resposta: "Não", motivo: "atividade exercida no local" } : null),
  },
  { id: "explosivos", pergunta: "Explosivos ou substâncias perigosas", padrao: "Não", sempre: true },
  { id: "patrimonio-historico", pergunta: "Patrimônio Histórico Cultural", padrao: "Não", sempre: true },
  { id: "litros-inflamaveis", pergunta: "Litros de inflamáveis", padrao: 0, sempre: true },
  { id: "saida-area-externa", pergunta: "Saída direta para área externa", padrao: "Não", sempre: true },
  { id: "captacao-superficial", pergunta: "Captação superficial de recursos hídricos", padrao: "Não", sempre: true },
  { id: "captacao-subterranea", pergunta: "Captação subterrânea individual", padrao: "Não", sempre: true },
  {
    id: "alimentos-sem-condicao-especial",
    pergunta: "Alimentos sem condição especial de conservação",
    padrao: "Sim",
    sempre: false,
  },
  {
    id: "alimentos-pereciveis",
    pergunta: "Alimentos perecíveis, medicamento, cosmético e afins",
    padrao: "Não",
    sempre: true,
  },
  {
    id: "capacidade-de-publico",
    pergunta: "Capacidade de público",
    // "O menor número (3)" é a regra; "até 20 se a área for grande" é um teto,
    // não um valor. O robô responde o mínimo — capacidade é declaração a um
    // órgão — e quem tem área grande vai para conferência.
    padrao: 3,
    sempre: false,
    regra: (f) =>
      f.areaGrande
        ? {
            resposta: 3,
            motivo: "o menor número",
            conferir: "Área grande: o setor vai até 20, mas não há regra de qual número — uma pessoa decide.",
          }
        : null,
  },
  { id: "aberturas-adjacentes", pergunta: "Aberturas para áreas edificadas adjacentes", padrao: "Não", sempre: true },
  { id: "supressao-vegetacao", pergunta: "Supressão de vegetação nativa", padrao: "Não", sempre: true },
  { id: "area-ambientalmente-fragil", pergunta: "Área ambientalmente frágil ou protegida", padrao: "Não", sempre: true },
  { id: "quantidade-pavimentos", pergunta: "Quantidade de pavimentos", padrao: 1, sempre: true },
  { id: "movimentacao-solo", pergunta: "Movimentação de solo acima de 100 m³", padrao: "Não", sempre: true },
  { id: "kg-glp", pergunta: "Quilos de GLP", padrao: 0, sempre: true },
  { id: "pavimentos-subsolo", pergunta: "Pavimentos em subsolo", padrao: "Não", sempre: true },
] as const;

/** Quantas perguntas o levantamento cobriu. O formulário pode mostrar mais. */
export const TOTAL_CONHECIDO = PERGUNTAS.length;

/** As 26 respostas, na ordem do formulário. */
export function responderViabilidade(fatos: FatosDaViabilidade): RespostaDaViabilidade[] {
  return PERGUNTAS.map((p) => {
    const daRegra = p.regra?.(fatos);
    if (daRegra) return { id: p.id, pergunta: p.pergunta, ...daRegra };
    return { id: p.id, pergunta: p.pergunta, resposta: p.padrao, motivo: p.sempre ? FIXA : PADRAO };
  });
}

/**
 * O que uma pessoa precisa olhar antes de enviar.
 *
 * Existe como função, e não como leitura solta, para o passo de preenchimento
 * ter um lugar só onde perguntar "posso enviar sozinho?". Lista vazia é a
 * licença para seguir.
 */
export function pendentesDeConferencia(respostas: RespostaDaViabilidade[]): RespostaDaViabilidade[] {
  return respostas.filter((r) => r.resposta === null || r.conferir !== undefined);
}

// ─── GeoCuritiba: escolher a indicação fiscal ───────────────────────────────

export type SubloteEncontrado = {
  /** A indicação fiscal como o GeoCuritiba a devolve. */
  indicacaoFiscal: string;
  /** O complemento do imóvel, quando há. Ex.: "LOJA 2", "APTO 31". */
  complemento: string | null;
  /** O sublote, como o portal escreve. Ex.: "000". */
  sublote: string;
};

/**
 * Qual sublote usar quando a empresa não trouxe indicação fiscal (VIA-2).
 *
 * A regra do setor, na ordem: pesquisa pelo endereço; havendo mais de um
 * resultado, procura o complemento de loja/apartamento; **sem complemento,
 * escolhe o primeiro sublote 000**.
 *
 * Devolve `null` quando a busca não achou nada e quando há vários resultados
 * sem nenhum `000` — nos dois casos a regra do setor não alcança, e pegar o
 * primeiro da lista seria pôr um imóvel qualquer na viabilidade do cliente.
 */
export function escolherSublote(
  resultados: SubloteEncontrado[],
  complementoDaEmpresa: string | null
): SubloteEncontrado | null {
  if (resultados.length === 0) return null;
  if (resultados.length === 1) return resultados[0]!;

  const alvo = complementoDaEmpresa?.trim().toUpperCase();
  if (alvo) {
    const porComplemento = resultados.find((r) => r.complemento?.trim().toUpperCase() === alvo);
    if (porComplemento) return porComplemento;
  }

  return resultados.find((r) => r.sublote.trim() === "000") ?? null;
}
