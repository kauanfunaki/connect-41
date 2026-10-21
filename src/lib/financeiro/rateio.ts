// O rateio da conta (lote D da fila do BPO, 20/10 — o rateio de categorias e
// de departamentos do Omie): a conta dividida em linhas, cada uma com uma
// categoria, um centro de custo e um projeto, e o valor dela. Funções puras;
// a conferência no banco e a gravação moram em `rateioServidor.ts`.
//
// ─── Linhas, e não dois rateios ──────────────────────────────────────────────
//
// O Omie rateia categorias por valor e departamentos por percentual, cada um
// por conta própria. Aqui é uma lista de linhas — "R$ 600 em Aluguel na Loja
// A, R$ 400 em Aluguel na Loja B" —, que diz o mesmo e mais: a combinação de
// categoria e centro de cada parte. Os dois rateios do Omie cabem em linhas.
//
// ─── O resumo na conta ───────────────────────────────────────────────────────
//
// A conta continua com uma categoria, um centro e um projeto: a categoria da
// linha maior, e o centro e o projeto quando todas as linhas têm o mesmo. É o
// que as listas mostram e o que lê quem só conhece uma categoria por conta
// (a fila de classificação, o CSV). Quem soma — a DRE, as análises — lê as
// linhas.

import { formatarReaisDeCentavos } from "@/lib/format";

export type LinhaDoRateio = {
  categoriaId: string | null;
  centroId: string | null;
  projetoId: string | null;
  centavos: number;
};

/** O máximo de linhas num rateio — é divisão de uma conta, não planilha. */
export const MAXIMO_DE_LINHAS_DO_RATEIO = 20;

const reais = (centavos: number) => formatarReaisDeCentavos(centavos);

/**
 * Divide `total` na proporção de `pesos`, em centavos inteiros que somam o
 * total — o método do maior resto: cada parte leva o piso da sua fatia, e os
 * centavos que sobram vão para as maiores frações (a primeira, no empate).
 * Sem peso nenhum, tudo vai para a primeira parte.
 */
export function repartir(total: number, pesos: number[]): number[] {
  if (pesos.length === 0) return [];
  const soma = pesos.reduce((s, p) => s + Math.max(0, p), 0);
  if (soma <= 0) return pesos.map((_, i) => (i === 0 ? total : 0));
  const exatas = pesos.map((p) => (total * Math.max(0, p)) / soma);
  const partes = exatas.map((x) => Math.floor(x));
  let sobra = total - partes.reduce((s, p) => s + p, 0);
  const ordem = exatas.map((x, i) => ({ i, resto: x - Math.floor(x) })).sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of ordem) {
    if (sobra <= 0) break;
    partes[i]! += 1;
    sobra -= 1;
  }
  return partes;
}

/**
 * Lê o rateio que o formulário manda (um JSON de linhas, no campo oculto
 * `rateio`). Vazio é "sem rateio". Texto que não é uma lista de linhas é erro
 * — e não "sem rateio", que gravaria a conta inteira numa categoria só.
 */
export function lerRateio(texto: string | null | undefined): { ok: true; linhas: LinhaDoRateio[] } | { ok: false; erro: string } {
  const t = (texto ?? "").trim();
  if (!t) return { ok: true, linhas: [] };
  let bruto: unknown;
  try {
    bruto = JSON.parse(t);
  } catch {
    return { ok: false, erro: "Rateio ilegível — monte as linhas de novo." };
  }
  if (!Array.isArray(bruto)) return { ok: false, erro: "Rateio ilegível — monte as linhas de novo." };
  const id = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 36) : null);
  const linhas: LinhaDoRateio[] = [];
  for (const item of bruto) {
    if (!item || typeof item !== "object") return { ok: false, erro: "Rateio ilegível — monte as linhas de novo." };
    const o = item as Record<string, unknown>;
    const centavos = Number(o.centavos);
    if (!Number.isInteger(centavos)) return { ok: false, erro: "Valor de linha do rateio ilegível." };
    linhas.push({ categoriaId: id(o.categoriaId), centroId: id(o.centroId), projetoId: id(o.projetoId), centavos });
  }
  return { ok: true, linhas };
}

/**
 * O rateio vale para esta conta? De duas a vinte linhas, cada uma com
 * categoria e valor positivo, somando o valor da conta. Uma linha só não é
 * rateio — é a conta numa categoria, e a tela não oferece.
 */
export function validarRateio(linhas: LinhaDoRateio[], totalCentavos: number): { ok: true } | { ok: false; erro: string } {
  if (linhas.length < 2) return { ok: false, erro: "Rateio precisa de ao menos duas linhas." };
  if (linhas.length > MAXIMO_DE_LINHAS_DO_RATEIO) return { ok: false, erro: `Rateio com no máximo ${MAXIMO_DE_LINHAS_DO_RATEIO} linhas.` };
  const semCategoria = linhas.findIndex((l) => !l.categoriaId);
  if (semCategoria >= 0) return { ok: false, erro: `Escolha a categoria da linha ${semCategoria + 1} do rateio.` };
  const semValor = linhas.findIndex((l) => l.centavos <= 0);
  if (semValor >= 0) return { ok: false, erro: `A linha ${semValor + 1} do rateio está sem valor.` };
  const soma = linhas.reduce((s, l) => s + l.centavos, 0);
  if (soma !== totalCentavos) {
    return { ok: false, erro: `O rateio soma ${reais(soma)}, e a conta é de ${reais(totalCentavos)} — as linhas precisam fechar o valor.` };
  }
  return { ok: true };
}

/**
 * O resumo que a conta guarda: a categoria da linha maior (a primeira, no
 * empate) e o centro e o projeto comuns a todas as linhas — ou nenhum.
 */
export function resumoDoRateio(linhas: LinhaDoRateio[]): { categoriaId: string | null; centroId: string | null; projetoId: string | null } {
  if (linhas.length === 0) return { categoriaId: null, centroId: null, projetoId: null };
  const maior = linhas.reduce((m, l) => (l.centavos > m.centavos ? l : m), linhas[0]!);
  const comum = (v: (l: LinhaDoRateio) => string | null) => {
    const valores = new Set(linhas.map(v));
    return valores.size === 1 ? [...valores][0]! : null;
  };
  return { categoriaId: maior.categoriaId, centroId: comum((l) => l.centroId), projetoId: comum((l) => l.projetoId) };
}

/**
 * As partes de um valor da conta (o principal de uma baixa, o valor de uma
 * perda) por linha do rateio, na proporção das linhas. Baixa cheia dá
 * exatamente o valor de cada linha.
 */
export function partesDoRateio<L extends { centavos: number }>(valorCentavos: number, linhas: L[]): { linha: L; centavos: number }[] {
  const partes = repartir(valorCentavos, linhas.map((l) => l.centavos));
  return linhas.map((linha, i) => ({ linha, centavos: partes[i]! }));
}

/**
 * Percentuais (com até duas casas) em centavos de um total — o modo "%" da
 * tela. Fechando 100%, os centavos fecham o total (maior resto); sem fechar,
 * cada linha leva a sua fatia arredondada, e a tela mostra o que falta.
 */
export function centavosDosPercentuais(totalCentavos: number, percentuais: number[]): number[] {
  const centesimos = percentuais.map((p) => Math.round(Math.max(0, p) * 100));
  if (centesimos.reduce((s, p) => s + p, 0) === 100_00) return repartir(totalCentavos, centesimos);
  return centesimos.map((p) => Math.round((totalCentavos * p) / 100_00));
}
