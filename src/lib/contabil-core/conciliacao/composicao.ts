// Composição visual de pagamentos SISPAG partidos no extrato (porte de
// `src/domain/conciliacao_bancaria/composicao.py` do Contábil Core, 11/11/2026). Funções puras.
//
// A consulta SISPAG documenta quais pagamentos pertencem ao grupo, mas não em qual linha cada um foi
// liquidado quando o banco divide o total. O procedimento confirmado pelo time contábil é eliminar
// as correspondências exatas e, para o restante, procurar grupos de pagamentos cuja soma feche cada
// linha.
//
// Dois resultados: uma partição global ÚNICA pelos valores é confirmada automaticamente. Quando os
// valores são ambíguos, o lote contábil pode só ordenar os lançamentos e produzir uma SUGESTÃO cujas
// somas fechem; ela nunca comprova o vínculo com o extrato e exige confirmação humana.
//
// Fidelidade ao Python: centavos e somas em `bigint` (o `int` do Python não estoura); a máscara de
// bits de cada caminho vira a lista encadeada dos destinos (mesmo resultado: o caminho guardado é o
// primeiro que chegou ao estado, e só se usa quando ele é único).

import { modulo, ehZero, type Dec } from "../motor/decimal";
import { digitoUnicode } from "../motor/unicodePy";
import { re } from "../extrato/py";

// Guardas conservadoras: acima destes limites a tela fica sem vínculo automático. A busca usa estados
// esparsos e aborta antes de transformar um relatório grande numa carga imprevisível.
const MAX_LINHAS_EXTRATO = 3;
const MAX_PARCELAS = 108;
const MAX_ESTADOS = 200_000;
const MAX_SISPAG_FALTANDO_NA_SUGESTAO = 8;
const AJUSTE_MAXIMO_ULTIMA_PARCELA_CENTAVOS = BigInt(5);
export const CRITERIO_CONFIRMADO = "SOMA_UNICA_POR_VALORES_SISPAG";
export const CRITERIO_SUGERIDO = "SUGESTAO_POR_LOTES_E_SOMA";
const LOTE_NUMERICO = re("\\d+");

const B0 = BigInt(0);
const DEZ = BigInt(10);

export type LancamentoParaComposicao = {
  readonly indice: number;
  readonly valor: Dec;
  readonly lote?: string | null;
};

export type LinhaExtratoParaComposicao = {
  readonly indice: number;
  readonly valor: Dec;
};

export type ComposicaoCalculada = {
  readonly extratoIndice: number;
  readonly razaoIndices: number[];
  readonly sispagFaltandoIndices: number[];
  readonly criterio: string;
  readonly confianca: string;
};

type Parcela = { readonly origem: "razao" | "sispag_faltando"; readonly indice: number; readonly centavos: bigint };

/** Destinos do caminho, do último para o primeiro (a máscara de bits do original). */
type Trilha = { readonly destino: number; readonly anterior: Trilha | null } | null;
type Caminho = { readonly quantidade: number; readonly trilha: Trilha };

/** `valor > 0` */
function positivo(d: Dec): boolean {
  return !d.negativo && !ehZero(d);
}

/** Centavos de `abs(valor)`, ou `null` para zero e para fração de centavo. */
function centavos(valor: Dec): bigint | null {
  const absoluto = modulo(valor);
  if (ehZero(absoluto)) return null;
  const e = absoluto.expoente + 2;
  if (e >= 0) return absoluto.coeficiente * DEZ ** BigInt(e);
  const divisor = DEZ ** BigInt(-e);
  if (absoluto.coeficiente % divisor !== B0) return null;
  return absoluto.coeficiente / divisor;
}

function somaInt(xs: Iterable<bigint>): bigint {
  let s = B0;
  for (const x of xs) s += x;
  return s;
}

/** Distribui todas as parcelas nos alvos, ou recusa zero/múltiplas respostas. */
function particaoUnica(parcelas: readonly Parcela[], alvos: readonly bigint[]): number[] | null {
  if (alvos.length === 1) {
    return somaInt(parcelas.map((p) => p.centavos)) === alvos[0] ? parcelas.map(() => 0) : null;
  }

  const dimensoes = alvos.length - 1;
  const zeros = Array.from({ length: Math.max(0, dimensoes) }, () => B0);
  let estados = new Map<string, { somas: bigint[]; caminho: Caminho }>([
    [zeros.join(","), { somas: zeros, caminho: { quantidade: 1, trilha: null } }],
  ]);
  let processado = B0;

  for (const parcela of parcelas) {
    processado += parcela.centavos;
    const proximos = new Map<string, { somas: bigint[]; caminho: Caminho }>();

    for (const { somas, caminho } of estados.values()) {
      for (let destino = 0; destino < alvos.length; destino++) {
        const novasSomas = [...somas];
        if (destino < dimensoes) {
          novasSomas[destino] += parcela.centavos;
          if (novasSomas[destino] > alvos[destino]) continue;
        }

        // A soma do último destino é implícita. Como os valores são positivos, ultrapassar o alvo
        // nunca poderá ser corrigido.
        if (processado - somaInt(novasSomas) > alvos[alvos.length - 1]) continue;

        const chave = novasSomas.join(",");
        const anterior = proximos.get(chave);
        if (anterior === undefined) {
          proximos.set(chave, { somas: novasSomas, caminho: { quantidade: caminho.quantidade, trilha: { destino, anterior: caminho.trilha } } });
        } else {
          proximos.set(chave, {
            somas: anterior.somas,
            caminho: { quantidade: Math.min(2, anterior.caminho.quantidade + caminho.quantidade), trilha: anterior.caminho.trilha },
          });
        }
      }
    }

    if (proximos.size > MAX_ESTADOS) return null;
    estados = proximos;
    if (!estados.size) return null;
  }

  const final = estados.get(alvos.slice(0, -1).join(","));
  if (final === undefined || final.caminho.quantidade !== 1) return null;
  const destinos: number[] = [];
  for (let t = final.caminho.trilha; t !== null; t = t.anterior) destinos.push(t.destino);
  return destinos.reverse();
}

/** Elimina valores iguais e compõe as sobras somente com solução única. */
export function comporPorValoresSispag(
  razao: readonly LancamentoParaComposicao[],
  extrato: readonly LinhaExtratoParaComposicao[],
  sispagFaltando: readonly Dec[],
): ComposicaoCalculada[] {
  if (!(extrato.length >= 2 && extrato.length <= MAX_LINHAS_EXTRATO)) return [];

  const parcelas: Parcela[] = [];
  for (const item of razao) {
    const valor = centavos(item.valor);
    if (valor === null) return [];
    parcelas.push({ origem: "razao", indice: item.indice, centavos: valor });
  }
  for (let indice = 0; indice < sispagFaltando.length; indice++) {
    const valor = centavos(sispagFaltando[indice]);
    if (valor === null) return [];
    parcelas.push({ origem: "sispag_faltando", indice, centavos: valor });
  }

  const alvos: bigint[] = [];
  for (const item of extrato) {
    const valor = centavos(item.valor);
    if (valor === null) return [];
    alvos.push(valor);
  }

  if (!(extrato.length <= parcelas.length && parcelas.length <= MAX_PARCELAS)) return [];
  if (somaInt(parcelas.map((p) => p.centavos)) !== somaInt(alvos)) return [];

  // Regra operacional confirmada: primeiro os valores iguais se anulam. Só eliminamos aqui pares
  // identificáveis dos dois lados; repetições ficam para a busca global e resultam em ambiguidade
  // se as identidades puderem trocar.
  const linhasPorValor = new Map<bigint, number[]>();
  const parcelasPorValor = new Map<bigint, number[]>();
  alvos.forEach((valor, linha) => linhasPorValor.set(valor, [...(linhasPorValor.get(valor) ?? []), linha]));
  parcelas.forEach((item, parcela) => parcelasPorValor.set(item.centavos, [...(parcelasPorValor.get(item.centavos) ?? []), parcela]));

  const porLinha: number[][] = extrato.map(() => []);
  const linhasUsadas = new Set<number>();
  const parcelasUsadas = new Set<number>();
  // O original itera um `set` (interseção das chaves); a ordem não muda nada: cada linha recebe no
  // máximo uma parcela aqui.
  for (const [valor, linhas] of linhasPorValor) {
    const itens = parcelasPorValor.get(valor);
    if (itens === undefined) continue;
    if (linhas.length === 1 && itens.length === 1) {
      porLinha[linhas[0]].push(itens[0]);
      linhasUsadas.add(linhas[0]);
      parcelasUsadas.add(itens[0]);
    }
  }

  const linhasRestantes = extrato.map((_, i) => i).filter((i) => !linhasUsadas.has(i));
  const parcelasRestantes = parcelas.map((_, i) => i).filter((i) => !parcelasUsadas.has(i));
  const destinos = particaoUnica(
    parcelasRestantes.map((i) => parcelas[i]),
    linhasRestantes.map((i) => alvos[i]),
  );
  if (destinos === null) return [];

  parcelasRestantes.forEach((parcela, i) => porLinha[linhasRestantes[destinos[i]]].push(parcela));

  return extrato.map((linha, l) => ({
    extratoIndice: linha.indice,
    razaoIndices: porLinha[l].filter((i) => parcelas[i].origem === "razao").map((i) => parcelas[i].indice),
    sispagFaltandoIndices: porLinha[l].filter((i) => parcelas[i].origem === "sispag_faltando").map((i) => parcelas[i].indice),
    criterio: CRITERIO_CONFIRMADO,
    confianca: "CONFIRMADA",
  }));
}

/** `int(re.search(r"\d+", lote).group())`, com dígito de qualquer escrita, como o Python. */
function numeroLote(lote: string | null | undefined): bigint | null {
  const encontrado = LOTE_NUMERICO.search(lote || "");
  if (!encontrado) return null;
  let n = B0;
  for (const c of encontrado[0] ?? "") n = n * DEZ + BigInt(c >= "0" && c <= "9" ? c.charCodeAt(0) - 48 : (digitoUnicode(c) ?? 0));
  return n;
}

/** Distribui valores respeitando soma e quantidade, recusando ambiguidades. */
function particaoComQuantidadesUnica(valores: readonly bigint[], alvos: readonly bigint[], quantidades: readonly number[]): number[] | null {
  if (somaInt(valores) !== somaInt(alvos) || quantidades.reduce((a, b) => a + b, 0) !== valores.length) return null;

  let encontrada: number[] | null = null;
  let quantidadeEncontrada = 0;
  const somas = alvos.map(() => B0);
  const contagens = alvos.map(() => 0);
  const destinos = valores.map(() => 0);

  const visitar = (indice: number): void => {
    if (quantidadeEncontrada > 1) return;
    if (indice === valores.length) {
      if (somas.every((s, i) => s === alvos[i]) && contagens.every((c, i) => c === quantidades[i])) {
        quantidadeEncontrada++;
        if (encontrada === null) encontrada = [...destinos];
      }
      return;
    }
    const valor = valores[indice];
    for (let destino = 0; destino < alvos.length; destino++) {
      if (contagens[destino] >= quantidades[destino] || somas[destino] + valor > alvos[destino]) continue;
      somas[destino] += valor;
      contagens[destino] += 1;
      destinos[indice] = destino;
      visitar(indice + 1);
      contagens[destino] -= 1;
      somas[destino] -= valor;
    }
  };

  visitar(0);
  return quantidadeEncontrada === 1 ? encontrada : null;
}

/** `itertools.combinations(range(inicio, fim), k)`, na mesma ordem. */
function* combinacoes(inicio: number, fim: number, k: number): Generator<number[]> {
  const n = fim - inicio;
  if (k > n || k < 0) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  yield idx.map((i) => inicio + i);
  for (;;) {
    let i = k - 1;
    while (i >= 0 && idx[i] === i + n - k) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
    yield idx.map((p) => inicio + p);
  }
}

/** `itertools.permutations(range(n))`, em ordem lexicográfica. */
function permutacoes(n: number): number[][] {
  const saida: number[][] = [];
  const atual: number[] = [];
  const usado = new Array<boolean>(n).fill(false);
  const passo = () => {
    if (atual.length === n) {
      saida.push([...atual]);
      return;
    }
    for (let i = 0; i < n; i++) {
      if (usado[i]) continue;
      usado[i] = true;
      atual.push(i);
      passo();
      atual.pop();
      usado[i] = false;
    }
  };
  passo();
  return saida;
}

/**
 * Usa o lote contábil somente como ordem para uma sugestão conferível. O lote do Domínio não
 * identifica uma linha bancária; ainda assim, quando os lançamentos ordenados por lote formam blocos
 * contíguos cujas somas fecham exatamente as linhas do extrato, essa organização é útil para o
 * contador. Só devolve sugestão se houver uma única divisão desse tipo.
 */
function sugerirPorLotesESoma(
  razao: readonly LancamentoParaComposicao[],
  extrato: readonly LinhaExtratoParaComposicao[],
  sispagFaltando: readonly Dec[],
): ComposicaoCalculada[] {
  if (!(extrato.length >= 2 && extrato.length <= MAX_LINHAS_EXTRATO) || razao.length > MAX_PARCELAS || sispagFaltando.length > MAX_SISPAG_FALTANDO_NA_SUGESTAO) {
    return [];
  }

  const razaoPorLote = new Map<bigint, LancamentoParaComposicao>();
  for (const item of razao) {
    const numero = numeroLote(item.lote);
    if (numero === null || razaoPorLote.has(numero) || centavos(item.valor) === null) return [];
    razaoPorLote.set(numero, item);
  }

  const alvos = extrato.map((item) => centavos(item.valor));
  const faltantes = sispagFaltando.map((item) => centavos(item));
  if ([...alvos, ...faltantes].some((v) => v === null)) return [];
  const alvosInt = alvos.filter((v): v is bigint => v !== null);
  const faltantesInt = faltantes.filter((v): v is bigint => v !== null);

  if (somaInt(razao.map((item) => centavos(item.valor) ?? B0)) + somaInt(faltantesInt) !== somaInt(alvosInt)) return [];

  let primeiroLote = B0;
  let ultimoLote = -BigInt(1);
  if (razaoPorLote.size) {
    const numeros = [...razaoPorLote.keys()];
    primeiroLote = numeros.reduce((a, b) => (b < a ? b : a));
    ultimoLote = numeros.reduce((a, b) => (b > a ? b : a));
  }
  // Só interpretamos uma lacuna como o pagamento documentado que falta quando a faixa numérica
  // fecha exatamente. Qualquer outro salto é evidência insuficiente.
  if (ultimoLote - primeiroLote + BigInt(1) !== BigInt(razao.length + sispagFaltando.length)) return [];

  const posicoes: (LancamentoParaComposicao | null)[] = [];
  for (let numero = primeiroLote; numero <= ultimoLote; numero += BigInt(1)) posicoes.push(razaoPorLote.get(numero) ?? null);
  if (posicoes.length < extrato.length) return [];

  type PorExtrato = [number[], number[]][];
  let encontrada: PorExtrato | null = null;
  const cacheFaltantes = new Map<string, number[] | null>();

  for (const cortes of combinacoes(1, posicoes.length, extrato.length - 1)) {
    const limites = [0, ...cortes, posicoes.length];
    const blocos = limites.slice(0, -1).map((inicio, i) => posicoes.slice(inicio, limites[i + 1]));
    const somasBlocos = blocos.map((bloco) => somaInt(bloco.map((item) => (item === null ? B0 : (centavos(item.valor) ?? B0)))));
    const lacunasBlocos = blocos.map((bloco) => bloco.filter((item) => item === null).length);

    for (const ordemExtrato of permutacoes(extrato.length)) {
      const residuos = ordemExtrato.map((indiceExtrato, b) => alvosInt[indiceExtrato] - somasBlocos[b]);
      if (residuos.some((r) => r < B0) || somaInt(residuos) !== somaInt(faltantesInt)) continue;

      const chave = `${residuos.join(",")}|${lacunasBlocos.join(",")}`;
      if (!cacheFaltantes.has(chave)) cacheFaltantes.set(chave, particaoComQuantidadesUnica(faltantesInt, residuos, lacunasBlocos));
      const destinosFaltantes = cacheFaltantes.get(chave) ?? null;
      if (destinosFaltantes === null) continue;

      const porExtrato: PorExtrato = extrato.map(() => [[], []]);
      ordemExtrato.forEach((indiceExtrato, indiceBloco) => {
        const indicesFaltantes = destinosFaltantes.flatMap((destino, indice) => (destino === indiceBloco ? [indice] : []));
        porExtrato[indiceExtrato] = [
          blocos[indiceBloco].flatMap((item) => (item === null ? [] : [item.indice])),
          indicesFaltantes,
        ];
      });

      if (encontrada !== null && JSON.stringify(porExtrato) !== JSON.stringify(encontrada)) return [];
      encontrada = porExtrato;
    }
  }

  if (encontrada === null) return [];
  const final: PorExtrato = encontrada;
  return extrato.map((linha, indice) => ({
    extratoIndice: linha.indice,
    razaoIndices: final[indice][0],
    sispagFaltandoIndices: final[indice][1],
    criterio: CRITERIO_SUGERIDO,
    confianca: "SUGERIDA",
  }));
}

/** Confirma por valores; se houver ambiguidade, oferece sugestão por lote. */
export function comporSispag(
  razao: readonly LancamentoParaComposicao[],
  extrato: readonly LinhaExtratoParaComposicao[],
  sispagFaltando: readonly Dec[],
): ComposicaoCalculada[] {
  const confirmada = comporPorValoresSispag(razao, extrato, sispagFaltando);
  if (confirmada.length) return confirmada;
  return sugerirPorLotesESoma(razao, extrato, sispagFaltando);
}

/**
 * Indício documental, não vínculo: um valor inteiro e parcelas no extrato. A ordem recebida é a
 * ordem de liquidação do grupo. Sem soma exata, mesma direção, parcelas iguais e alvo único, não
 * oferece indicação. Devolve o `indice` do lançamento do razão.
 */
export function indicarParcelasIguais(
  razao: readonly { readonly indice: number; readonly valor: Dec }[],
  extrato: readonly { readonly valor: Dec }[],
): number | null {
  if (!(extrato.length >= 2 && extrato.length <= MAX_PARCELAS)) return null;
  const valores = extrato.map((item) => centavos(item.valor));
  if (valores.some((v) => v === null)) return null;
  const vs = valores as bigint[];
  const sentido = positivo(extrato[0].valor);
  if (extrato.some((item) => positivo(item.valor) !== sentido)) return null;
  const base = vs[0];
  if (vs.slice(0, -1).some((v) => v !== base)) return null;
  const ajuste = vs[vs.length - 1] - base;
  if (!(ajuste >= B0 && ajuste <= AJUSTE_MAXIMO_ULTIMA_PARCELA_CENTAVOS)) return null;
  const total = somaInt(vs);
  const candidatos = razao.filter((item) => centavos(item.valor) === total && positivo(item.valor) === sentido).map((item) => item.indice);
  return candidatos.length === 1 ? candidatos[0] : null;
}
