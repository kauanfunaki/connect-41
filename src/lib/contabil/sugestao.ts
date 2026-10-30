// A sugestão de conta de crédito das pendências (29/10/2026), portada do
// `_Sugestor` do SPED Generator: a conta de fornecedor do plano cujo nome mais
// se parece com o do participante.
//
// A sugestão é sugestão: aparece pré-preenchida para ser confirmada, nunca
// entra sozinha no de-para. O corte é alto (0,88) porque nome parecido erra —
// "PLANET VANS COMERCIO DE AUTO PECAS" casava com "PADOMAR COMERCIO DE AUTO
// PECAS" a 0,81 —, e quem confirma tende a confiar no que já veio preenchido.
//
// A nota é a do `difflib.SequenceMatcher.ratio()` do Python, 2·M/T, com os
// mesmos dois tetos baratos antes do cálculo inteiro (só o tamanho, depois as
// letras em comum): com milhares de contas por pendência, quase todas caem nos
// tetos, e a resposta é a mesma.

import type { ContaDoPlano } from "./lancamentos";

export const LIMITE_DA_SEMELHANCA = 0.88;
// Sufixos societários atrapalham a comparação: quase todo nome termina em LTDA.
const RUIDO = [" LTDA", " EPP", " ME", " S/A", " SA", " EIRELI", " - ME", " MEI", "."];

export function nomeParaComparar(nome: string): string {
  let limpo = (nome ?? "").toUpperCase().trim();
  for (const r of RUIDO) limpo = limpo.replaceAll(r, " ");
  return limpo.split(/\s+/).filter(Boolean).join(" ");
}

/** O maior bloco em comum de a[alo:ahi] e b[blo:bhi], com o desempate do `difflib` (o primeiro). */
function maiorBloco(a: string, b: string, alo: number, ahi: number, blo: number, bhi: number): [number, number, number] {
  let melhor: [number, number, number] = [alo, blo, 0];
  let anterior = new Map<number, number>();
  for (let i = alo; i < ahi; i++) {
    const atual = new Map<number, number>();
    for (let j = blo; j < bhi; j++) {
      if (a[i] !== b[j]) continue;
      const k = (anterior.get(j - 1) ?? 0) + 1;
      atual.set(j, k);
      if (k > melhor[2]) melhor = [i - k + 1, j - k + 1, k];
    }
    anterior = atual;
  }
  return melhor;
}

function letrasEmComum(a: string, b: string): number {
  const conta = new Map<string, number>();
  for (const c of b) conta.set(c, (conta.get(c) ?? 0) + 1);
  let m = 0;
  for (const c of a) {
    const n = conta.get(c) ?? 0;
    if (n > 0) {
      conta.set(c, n - 1);
      m++;
    }
  }
  return m;
}

/** O `ratio()` do `difflib`, sem lixo (os nomes têm bem menos de 200 letras). */
export function semelhanca(a: string, b: string): number {
  const total = a.length + b.length;
  if (!total) return 1;
  let iguais = 0;
  const fila: [number, number, number, number][] = [[0, a.length, 0, b.length]];
  while (fila.length) {
    const [alo, ahi, blo, bhi] = fila.pop()!;
    const [i, j, k] = maiorBloco(a, b, alo, ahi, blo, bhi);
    if (!k) continue;
    iguais += k;
    if (alo < i && blo < j) fila.push([alo, i, blo, j]);
    if (i + k < ahi && j + k < bhi) fila.push([i + k, ahi, j + k, bhi]);
  }
  return (2 * iguais) / total;
}

export type Sugestao = { reduzido: string; classificacao: string; nome: string; semelhanca: number };

/** Monta uma vez por carga da tela e sugere para todas as pendências contra o mesmo plano. */
export function criarSugestor(contas: readonly ContaDoPlano[]) {
  const nomes = contas.map((c) => nomeParaComparar(c.nome));
  return (nomeDoFornecedor: string): Sugestao | null => {
    const alvo = nomeParaComparar(nomeDoFornecedor);
    if (alvo.length < 6) return null;
    let melhor = -1;
    let nota = 0;
    for (let i = 0; i < contas.length; i++) {
      const outro = nomes[i];
      const total = alvo.length + outro.length;
      // Teto pelo tamanho, depois pelas letras em comum: quem não passa do corte
      // nem da melhor nota até aqui não mudaria a resposta.
      let teto = (2 * Math.min(alvo.length, outro.length)) / total;
      if (teto < LIMITE_DA_SEMELHANCA || teto <= nota) continue;
      teto = (2 * letrasEmComum(alvo, outro)) / total;
      if (teto < LIMITE_DA_SEMELHANCA || teto <= nota) continue;
      const r = semelhanca(alvo, outro);
      if (r > nota) [melhor, nota] = [i, r];
    }
    if (melhor < 0 || nota < LIMITE_DA_SEMELHANCA) return null;
    const c = contas[melhor];
    return { reduzido: c.reduzido, classificacao: c.classificacao, nome: c.nome, semelhanca: Math.round(nota * 1000) / 1000 };
  };
}
