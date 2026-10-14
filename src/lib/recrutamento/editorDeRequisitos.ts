// O editor dos requisitos da triagem em duas listas — escolha "Vaga · 3 B" do
// Kauan (14/10/2026): Obrigatórios e Desejáveis, cada uma com o próprio campo
// de adicionar; o tipo é a lista onde o requisito está, e some o seletor de
// tipo em cada linha, que era o que mais confundia. Embaixo, a régua de 0 a
// 100 com os dois cortes.
//
// **O formato gravado não muda.** A tela continua com uma lista só, na ordem
// em que os requisitos foram cadastrados, e as duas listas são duas leituras
// dela. Reordenar ao salvar (obrigatórios primeiro) trocaria os ids r1, r2… e
// faria "salvar sem mexer" virar versão nova (`salvarRequisitos` compara o
// gravado com o novo) — e a versão nova marca as notas dadas como de versão
// anterior.

import type { Faixa, Requisito } from "./triagem";

export type LinhaDeRequisito = Pick<Requisito, "tipo" | "texto" | "peso">;

export const ROTULO_DO_PESO: Record<LinhaDeRequisito["peso"], string> = { 1: "baixo", 2: "médio", 3: "alto" };

/** O peso de um requisito novo: o do meio. */
export const PESO_INICIAL: LinhaDeRequisito["peso"] = 2;

export type ItemDaLista = { indice: number; linha: LinhaDeRequisito };

/** As duas listas da tela, cada item com a posição dele na lista gravada. */
export function separarEmListas(linhas: LinhaDeRequisito[]): { obrigatorios: ItemDaLista[]; desejaveis: ItemDaLista[] } {
  const obrigatorios: ItemDaLista[] = [];
  const desejaveis: ItemDaLista[] = [];
  linhas.forEach((linha, indice) => (linha.tipo === "OBRIGATORIO" ? obrigatorios : desejaveis).push({ indice, linha }));
  return { obrigatorios, desejaveis };
}

/**
 * Acrescenta no fim da lista gravada — no fim da lista do tipo, na tela.
 * Texto vazio não entra (o campo de adicionar só vira requisito com texto).
 */
export function adicionarRequisito(linhas: LinhaDeRequisito[], tipo: LinhaDeRequisito["tipo"], texto: string): LinhaDeRequisito[] {
  const limpo = texto.trim().replace(/\s+/g, " ");
  if (!limpo) return linhas;
  return [...linhas, { tipo, texto: limpo, peso: PESO_INICIAL }];
}

/** Troca uma linha pela posição dela na lista gravada. */
export function mudarRequisito(linhas: LinhaDeRequisito[], indice: number, mudanca: Partial<LinhaDeRequisito>): LinhaDeRequisito[] {
  return linhas.map((l, i) => (i === indice ? { ...l, ...mudanca } : l));
}

export function removerRequisito(linhas: LinhaDeRequisito[], indice: number): LinhaDeRequisito[] {
  return linhas.filter((_, i) => i !== indice);
}

// ─── A régua ────────────────────────────────────────────────────────────────

export type FaixaDaRegua = { faixa: Faixa; de: number; ate: number; legenda: string };

/**
 * As três faixas de 0 a 100 a partir dos cortes — "Incompatível: até 44",
 * "Parcial: 45 a 74", "Compatível: 75 ou mais". Os campos são texto enquanto
 * a pessoa digita: com corte que não é número, ou fora da regra do servidor
 * (`normalizarRequisitos`: Parcial de 1 a 99, abaixo do Compatível, que vai
 * até 100), devolve null e a tela mostra o aviso no lugar da régua.
 */
export function faixasDaRegua(corteParcial: string | number, corteCompativel: string | number): FaixaDaRegua[] | null {
  const ler = (v: string | number) => (typeof v === "number" ? v : String(v).trim() === "" ? NaN : Number(v));
  const parcial = Math.round(ler(corteParcial));
  const compativel = Math.round(ler(corteCompativel));
  if (!Number.isFinite(parcial) || !Number.isFinite(compativel)) return null;
  if (parcial < 1 || compativel > 100 || parcial >= compativel) return null;
  const intervalo = (de: number, ate: number) => (de === ate ? `${de}` : `${de} a ${ate}`);
  return [
    { faixa: "INCOMPATIVEL", de: 0, ate: parcial - 1, legenda: `Incompatível: até ${parcial - 1}` },
    { faixa: "PARCIAL", de: parcial, ate: compativel - 1, legenda: `Parcial: ${intervalo(parcial, compativel - 1)}` },
    { faixa: "COMPATIVEL", de: compativel, ate: 100, legenda: compativel === 100 ? "Compatível: só 100" : `Compatível: ${compativel} ou mais` },
  ];
}
