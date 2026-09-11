// O catálogo de agentes — o terceiro da família, depois de `MODULE_CATALOG` e
// `INTEGRATION_CATALOG`.
//
// ─── A decisão que este arquivo carrega ─────────────────────────────────────
//
// Uma fundação, não três. O caro num agente de setor não é o prompt: é o
// encanamento — chave por cliente, teto de gasto, trilha de auditoria, o humano
// no laço, o tratamento de texto escrito por terceiro. Isso é idêntico em
// Recrutamento, Societário e BPO. O que muda por setor é **o prompt, quais
// ferramentas o agente pode chamar, e quem confirma** — e isso é configuração,
// declarada aqui.
//
// ─── Por que estes quatro, e nenhum a mais ──────────────────────────────────
//
// Mesma regra do catálogo de integrações: declarar aqui é prometer que existe
// implementação. Os quatro que estão aqui **já rodam em produção** desde antes
// desta fundação, em `src/lib/ai.ts`. Trazê-los para debaixo do catálogo é o
// que dá a eles o que nunca tiveram — custo medido e auditoria — e é o teste de
// que a forma serve para o que existe, antes de servir para o que virá.
//
// O agente de Recrutamento com WhatsApp, que é o piloto, **não está aqui**: ele
// precisa de ferramentas e de memória entre turnos, que são a Onda 2. Declarar
// antes seria prometer o que não existe.

import type { AiProvider } from "@/generated/prisma/enums";

/**
 * A faixa de modelo que o agente pede, em vez do id do modelo.
 *
 * Existe para que trocar de modelo seja um lugar só (`modeloDaFaixa`) e não uma
 * edição em cada agente — e para que um cliente com override não fique preso a
 * um modelo descontinuado.
 */
export type FaixaDeModelo = "rapido" | "padrao" | "complexo";

export type AgenteDef = {
  code: string;
  label: string;
  /** Setor a que pertence, ou `null` quando serve o app inteiro. */
  sectorCode: string | null;
  description: string;
  faixa: FaixaDeModelo;

  /**
   * O agente grava algo sozinho, ou só propõe?
   *
   * **`false` é o padrão e a regra.** O agente lê e propõe; uma pessoa confirma
   * na tela. Um agente que escreve sozinho erra sozinho, e o erro de IA é o que
   * mais se parece com trabalho feito — texto plausível, no lugar certo, com a
   * cara de quem conferiu.
   *
   * Exceção é declarada aqui, por agente, nunca assumida no caminho do código.
   */
  escreve: boolean;

  /**
   * As ferramentas que este agente pode chamar, por nome.
   *
   * Vazio hoje em todos: a Onda 1 não tem tool-calling. O campo existe desde já
   * porque é **allowlist** — e allowlist que nasce depois nasce com exceção,
   * que é como um agente acaba podendo chamar o que ninguém revisou.
   */
  ferramentas: string[];

  /**
   * Teto de gasto no mês, em centavos, quando o cliente não define o próprio.
   *
   * Não é estimativa de uso: é o valor a partir do qual alguém devia ser
   * avisado. Um agente que passa disso ou está sendo muito usado — o que é bom
   * e merece revisão do teto — ou entrou num laço, o que é ruim e precisa
   * parar.
   */
  tetoMensalCentavos: number;

  /** Teto de chamadas no mês. O backstop que funciona sem tabela de preço. */
  tetoMensalChamadas: number;

  /**
   * Vale o padrão quando o cliente não tem linha em `TenantAgent`.
   *
   * `true` nos quatro que já rodavam antes desta fundação: desligá-los aqui
   * tiraria do ar função em uso, em silêncio. O ato deliberado que autoriza
   * gasto já aconteceu noutro lugar — salvar a própria chave em
   * `TenantAiConfig`. Sem chave, nenhum deles roda.
   *
   * Agente novo nasce `false`.
   */
  padraoLigado: boolean;
};

export const AGENT_CATALOG: AgenteDef[] = [
  {
    code: "triagem_curriculo",
    label: "Triagem de currículo",
    sectorCode: "recrutamento",
    description: "Lê o PDF do currículo e extrai dados e resumo profissional para o recrutador conferir",
    faixa: "padrao",
    escreve: false,
    ferramentas: [],
    tetoMensalCentavos: 20_000,
    tetoMensalChamadas: 2_000,
    padraoLigado: true,
  },
  {
    code: "resumo_empresa",
    label: "Resumo de histórico da empresa",
    sectorCode: null,
    description: "Resume o histórico de uma empresa cliente a partir do que já está registrado nela",
    faixa: "padrao",
    escreve: false,
    ferramentas: [],
    tetoMensalCentavos: 10_000,
    tetoMensalChamadas: 1_000,
    padraoLigado: true,
  },
  {
    code: "avaliacao_escrita",
    label: "Avaliação de escrita no atendimento",
    sectorCode: "atendimento",
    description: "Pontua a escrita de uma conversa do Chatwoot e justifica a nota",
    faixa: "rapido",
    escreve: false,
    ferramentas: [],
    tetoMensalCentavos: 15_000,
    tetoMensalChamadas: 5_000,
    padraoLigado: true,
  },
  {
    code: "resumo_agente",
    label: "Resumo de avaliações do atendente",
    sectorCode: "atendimento",
    description: "Junta as avaliações de um atendente num resumo com exemplos",
    faixa: "padrao",
    escreve: false,
    ferramentas: [],
    tetoMensalCentavos: 5_000,
    tetoMensalChamadas: 500,
    padraoLigado: true,
  },
];

export function agenteDoCatalogo(code: string): AgenteDef | null {
  return AGENT_CATALOG.find((a) => a.code === code) ?? null;
}

/**
 * O modelo de cada faixa, por provedor.
 *
 * **É o único lugar onde nome de modelo aparece.** Modelo é a coisa que mais
 * muda neste sistema, e espalhá-lo é como um catálogo inteiro fica velho junto
 * — foi o que aconteceu com o `DEFAULT_ANTHROPIC_MODEL` em `src/lib/ai.ts`,
 * que ficou apontando para uma geração anterior.
 */
const MODELO_DA_FAIXA: Record<AiProvider, Record<FaixaDeModelo, string>> = {
  ANTHROPIC: {
    rapido: "claude-haiku-4-5-20251001",
    padrao: "claude-sonnet-5",
    complexo: "claude-opus-5",
  },
  OPENAI: {
    rapido: "gpt-4.1-mini",
    padrao: "gpt-4.1",
    complexo: "gpt-4.1",
  },
};

export function modeloDaFaixa(provider: AiProvider, faixa: FaixaDeModelo): string {
  return MODELO_DA_FAIXA[provider][faixa];
}

/**
 * O modelo que uma chamada vai usar.
 *
 * Ordem: override do cliente, depois a faixa do agente. O override existe para
 * o cliente que quer pagar menos (ou mais) numa função específica — e por isso
 * ele ganha, mesmo quando aponta para um modelo que a faixa não escolheria.
 */
export function modeloParaChamada(
  def: AgenteDef,
  provider: AiProvider,
  overrideDoCliente: string | null | undefined
): string {
  const escolhido = overrideDoCliente?.trim();
  if (escolhido) return escolhido;
  return modeloDaFaixa(provider, def.faixa);
}

export type ConfigDoAgente = {
  enabled: boolean;
  model: string | null;
  monthlyCapCents: number | null;
  monthlyCapCalls: number | null;
};

/**
 * O que vale para este cliente, misturando catálogo e override.
 *
 * `null` no lugar da linha significa "o cliente nunca mexeu" — e aí vale o
 * catálogo inteiro. É o que faz a fundação nascer sem exigir uma linha por
 * cliente por agente antes de qualquer coisa funcionar.
 */
export function configEfetiva(def: AgenteDef, linha: ConfigDoAgente | null) {
  return {
    enabled: linha ? linha.enabled : def.padraoLigado,
    model: linha?.model ?? null,
    tetoMensalCentavos: linha?.monthlyCapCents ?? def.tetoMensalCentavos,
    tetoMensalChamadas: linha?.monthlyCapCalls ?? def.tetoMensalChamadas,
  };
}

/** Os agentes de um setor — o que a tela de configuração lista. */
export function agentesDoSetor(sectorCode: string | null): AgenteDef[] {
  return AGENT_CATALOG.filter((a) => a.sectorCode === sectorCode);
}
