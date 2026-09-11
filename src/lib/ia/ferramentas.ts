// As ferramentas que um agente pode chamar.
//
// ─── A decisão que este arquivo carrega ─────────────────────────────────────
//
// **O agente nunca escreve.** Nem quando a ferramenta é de escrita, nem quando
// o catálogo marca o agente como `escreve: true`.
//
// A saída não é "o agente grava e a gente confia": é que uma ferramenta de
// escrita **não executa** — ela vira uma proposta, que sai no resultado do
// laço, e uma pessoa confirma na tela. A confirmação dispara a mesma server
// action que já existia para aquela operação, com a mesma checagem de papel, o
// mesmo `logAudit`, o mesmo tudo.
//
// Isso é mais forte que pedir confirmação dentro do laço, por dois motivos:
//
// 1. O agente **nunca ganha credencial de escrita**. Não há caminho, nem por
//    engano, nem por prompt injection vindo do texto que ele leu.
// 2. O que a pessoa confirma é a operação do app, não a intenção do modelo. Se
//    a proposta estiver errada, ela falha nas mesmas validações que falhariam
//    se alguém tivesse digitado errado.
//
// ─── Por que o registro está vazio ──────────────────────────────────────────
//
// Mesma regra de `OBSERVADORES` e `EXECUTORES`: declarar aqui é prometer que a
// ferramenta existe e foi revisada. Os quatro agentes de hoje são de uma
// chamada só e não usam ferramenta nenhuma — o primeiro consumidor real é o
// piloto do Recrutamento, que é a Onda 3.
//
// O que a Onda 2 entrega é a máquina: allowlist checada na hora da chamada,
// teto de rodadas, e o resultado de ferramenta tratado como texto de terceiro.

import type { AgenteDef } from "@/lib/ia/catalogo";

/**
 * Uma ferramenta que o modelo pode pedir para chamar.
 *
 * `parametros` é JSON Schema, do mesmo jeito que os schemas de saída em
 * `src/lib/ai.ts` — é o que os dois provedores entendem.
 */
export type FerramentaDef = {
  nome: string;
  descricao: string;
  parametros: Record<string, unknown>;
  /**
   * `leitura` executa e devolve o resultado ao modelo.
   * `escrita` **nunca executa**: vira proposta para uma pessoa confirmar.
   */
  natureza: "leitura" | "escrita";
};

/**
 * O que uma ferramenta de leitura recebe para rodar.
 *
 * `tenantId` não vem do modelo, e isso é deliberado: se o tenant fosse
 * parâmetro, bastaria o modelo inventar outro — ou ser convencido a inventar
 * por um texto que ele leu — para vazar dado entre clientes. Ele vem do
 * contexto da execução, e a ferramenta não tem como sobrescrevê-lo.
 */
export type ContextoDaFerramenta = {
  tenantId: string;
  userId: string | null;
};

export type ExecutorDeFerramenta = (
  argumentos: Record<string, unknown>,
  ctx: ContextoDaFerramenta
) => Promise<unknown>;

export type FerramentaRegistrada = {
  def: FerramentaDef;
  /** Ausente nas de escrita: elas não executam, viram proposta. */
  executar?: ExecutorDeFerramenta;
};

/** As ferramentas que existem. Vazio — ver o cabeçalho. */
export const FERRAMENTAS: Record<string, FerramentaRegistrada> = {};

export function ferramentaPara(nome: string): FerramentaRegistrada | null {
  return FERRAMENTAS[nome] ?? null;
}

export type VereditoDeFerramenta =
  | { pode: true; ferramenta: FerramentaRegistrada }
  | { pode: false; motivo: string };

/**
 * Este agente pode chamar esta ferramenta agora?
 *
 * **A allowlist é checada aqui, na hora da chamada — não só ao montar o
 * prompt.** Modelo inventa nome de ferramenta, e um texto que ele leu pode
 * pedir que invente. Se a checagem morasse só na montagem do prompt, bastaria
 * o modelo pedir uma ferramenta de outro agente para atravessar a fronteira:
 * ela existe no registro, e "existe" viraria "pode".
 */
export function podeUsarFerramenta(def: AgenteDef, nome: string): VereditoDeFerramenta {
  if (!def.ferramentas.includes(nome)) {
    return { pode: false, motivo: `A ferramenta "${nome}" não está liberada para este agente.` };
  }
  const ferramenta = ferramentaPara(nome);
  if (!ferramenta) {
    return { pode: false, motivo: `A ferramenta "${nome}" não existe.` };
  }
  return { pode: true, ferramenta };
}

/**
 * As ferramentas a declarar no prompt deste agente.
 *
 * Ignora em silêncio nome liberado que não existe no registro: é erro de
 * catálogo, e derrubar a chamada por causa dele tiraria do ar um agente por
 * causa de uma ferramenta que ele talvez nem usasse. O `podeUsarFerramenta`
 * recusa depois, se o modelo pedir.
 */
export function ferramentasDoAgente(def: AgenteDef): FerramentaDef[] {
  return def.ferramentas
    .map((nome) => ferramentaPara(nome)?.def)
    .filter((f): f is FerramentaDef => f !== undefined);
}

/**
 * Uma escrita que o agente propôs, e que ninguém executou.
 *
 * Sai no resultado do laço para a tela mostrar. Quem confirma dispara a server
 * action correspondente — nunca esta estrutura.
 */
export type PropostaDeEscrita = {
  ferramenta: string;
  descricao: string;
  argumentos: Record<string, unknown>;
};

/**
 * O texto que volta ao modelo quando ele pede uma escrita.
 *
 * Diz que foi **registrada**, e não que foi feita. A diferença importa: um
 * modelo que acredita ter gravado escreve o resumo final como se a coisa
 * estivesse resolvida, e a pessoa lê "pronto, atualizei o cadastro" na tela ao
 * lado de um botão de confirmar que ninguém apertou.
 */
export const AVISO_DE_PROPOSTA =
  "Registrado como proposta para uma pessoa revisar e confirmar. NADA foi gravado ainda — " +
  "não afirme que a alteração foi feita.";
