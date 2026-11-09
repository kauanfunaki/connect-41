// Porte das partes puras do motor NEO (`src/domain/neo/engine.py` do Contábil Core): como uma regra
// casa com o histórico, em que ordem as regras são consideradas, o histórico sugerido e a escolha de
// contraparte pelo tipo.

import type { Dec } from "./decimal";
import { normalizarHistoricoContabil, normalizarParaMatch } from "./texto";
import { len, split, strip } from "./unicodePy";
import { motivoValorNaoConfiavel } from "./valorConfiavel";

export type Dc = "D" | "C";
export type Estrategia = "exato" | "substring" | "todas_palavras";

/** Em ordem de precisão: primeiro todas as exatas, depois substrings e por fim todas as palavras. */
export const ESTRATEGIAS: readonly Estrategia[] = ["exato", "substring", "todas_palavras"];

/** Marca da decisão de quarentena (`estrategia`), com `resultado = "sem_regra"`. */
export const ESTRATEGIA_VALOR_SUSPEITO = "valor_suspeito";

/**
 * Como uma regra casa, com os dois lados JÁ na forma canônica. É a fonte única das estratégias, usada
 * pelo motor e pela prévia de impacto: duas definições fariam a prévia mentir sobre o que o motor faz.
 */
export function estrategiaDeMatchNormalizado(regra: string, transacao: string): Estrategia | null {
  if (transacao === regra) return "exato";
  if (transacao.includes(regra)) return "substring";
  const tokensRegra = split(regra);
  if (tokensRegra.length) {
    const tokensTransacao = new Set(split(transacao));
    if (tokensRegra.every((t) => tokensTransacao.has(t))) return "todas_palavras";
  }
  return null;
}

/** A mesma coisa a partir de texto cru (simulação de regra, um par por vez). */
export function estrategiaDeMatch(historicoRegra: string, historicoTransacao: string): Estrategia | null {
  return estrategiaDeMatchNormalizado(normalizarParaMatch(historicoRegra), normalizarParaMatch(historicoTransacao));
}

export type RegraDoMotor = {
  readonly id: string;
  readonly agenciaId: string | null;
  readonly historico: string;
  readonly dc: Dc;
};

/**
 * A ordem em que o motor considera as regras (`_carregar_regras`), e ela faz parte do resultado: nas
 * estratégias `substring` e `todas_palavras` a primeira que casa vence.
 * 1. Regra de agência antes da global: quem restringiu o escopo escreveu uma EXCEÇÃO à regra geral.
 *    Vem antes do comprimento de propósito, porque a exceção costuma ser mais curta.
 * 2. Histórico mais longo (o mais específico), contado em caracteres, como o `length()` do PostgreSQL.
 *    O `LENGTH()` do MySQL conta bytes, e por isso a ordenação é feita aqui e não no SQL.
 * 3. Menor `id`, para o mesmo extrato dar sempre a mesma classificação.
 */
export function ordenarRegras<R extends RegraDoMotor>(regras: readonly R[]): R[] {
  return [...regras].sort((a, b) => {
    const globalA = a.agenciaId === null ? 1 : 0;
    const globalB = b.agenciaId === null ? 1 : 0;
    if (globalA !== globalB) return globalA - globalB;
    const tamanho = len(b.historico) - len(a.historico);
    if (tamanho) return tamanho;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * A regra que classifica a transação, e com qual estratégia. `regras` já vem na ordem de
 * `ordenarRegras`; `formaDeMatch` devolve a forma canônica do histórico da regra (o chamador guarda
 * em cache: cada transação é comparada com todas as regras, e normalizar por par era 38× mais lento).
 * Só valem as regras da agência da transação ou globais, e da mesma natureza D/C.
 */
export function encontrarRegra<R extends RegraDoMotor>(
  transacao: { readonly agenciaId: string; readonly historico: string; readonly dc: Dc },
  regras: readonly R[],
  formaDeMatch: (regra: R) => string = (r) => normalizarParaMatch(r.historico),
): { regra: R; estrategia: Estrategia } | null {
  const candidatas = regras.filter((r) => (r.agenciaId === null || r.agenciaId === transacao.agenciaId) && r.dc === transacao.dc);
  const historico = normalizarParaMatch(transacao.historico);
  const casou = new Map(candidatas.map((r) => [r, estrategiaDeMatchNormalizado(formaDeMatch(r), historico)]));
  for (const estrategia of ESTRATEGIAS) {
    for (const regra of candidatas) if (casou.get(regra) === estrategia) return { regra, estrategia };
  }
  return null;
}

/**
 * Histórico no formato pedido pelos contadores: 'PGTO/REC REF [NF XXX -] RAZÃO SOCIAL'. Débito é
 * pagamento; crédito, recebimento. Prefixos curtos de propósito, para não comer a razão social.
 */
export function gerarHistoricoSugerido(dc: Dc, razaoSocial: string, numeroNf: string | null): string {
  const prefixo = dc === "D" ? "PGTO" : "REC";
  const nf = strip(numeroNf ?? "");
  const texto = nf ? `${prefixo} REF NF ${nf} - ${razaoSocial}` : `${prefixo} REF ${razaoSocial}`;
  return normalizarHistoricoContabil(texto);
}

/**
 * Por que a transação não pode virar lançamento, ou `null`. Reusa a régua da importação: duas
 * definições de "valor confiável" fariam a fila barrar um conjunto e a importação recusar outro.
 */
export function motivoParaNaoContabilizar(transacao: { readonly historico: string | null; readonly valor: Dec }): string | null {
  const motivo = motivoValorNaoConfiavel(transacao.historico ?? "", transacao.valor);
  if (motivo === null) return null;
  return `Valor não confiável: ${motivo}. Corrija a importação deste extrato antes de classificar.`;
}

export type TipoContraparte = "fornecedor" | "cliente" | "ambos";

/** Débito procura fornecedor; crédito, cliente. `ambos` serve aos dois. */
export function tiposCompativeis(dc: string): readonly TipoContraparte[] {
  if (dc === "D") return ["fornecedor", "ambos"];
  if (dc === "C") return ["cliente", "ambos"];
  return [];
}

/**
 * Aplica o tipo sem reinterpretar cadastro legado (ADR-016). Antes da importação fiscal havia uma
 * contraparte por documento e o NEO não olhava o tipo: esse comportamento fica igual para todo
 * cadastro legado com vínculo único. Cadastros vindos de relatório fiscal, e documentos com mais de
 * um vínculo, são filtrados pela direção. A ordem de saída é a de primeira aparição do documento.
 */
export function desambiguarTiposPorDocumento<C extends { readonly documento: string; readonly tipo: string; readonly origem: string }>(
  contrapartes: readonly C[],
  dc: string,
): C[] {
  const porDocumento = new Map<string, C[]>();
  for (const c of contrapartes) {
    const grupo = porDocumento.get(c.documento);
    if (grupo) grupo.push(c);
    else porDocumento.set(c.documento, [c]);
  }
  const compativeis: readonly string[] = tiposCompativeis(dc);
  const resultado: C[] = [];
  for (const grupo of porDocumento.values()) {
    if (grupo.length === 1 && grupo[0].origem !== "relatorio_fiscal") {
      resultado.push(...grupo);
      continue;
    }
    resultado.push(...grupo.filter((c) => compativeis.includes(c.tipo)));
  }
  return resultado;
}
