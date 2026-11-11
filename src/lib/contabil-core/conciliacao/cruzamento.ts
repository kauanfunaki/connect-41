// Cruzamento razão × extrato, em camadas (porte de `src/domain/conciliacao_bancaria/cruzamento.py`
// do Contábil Core, 11/11/2026). Função pura: não lê arquivo nem banco.
//
// Medido na conta 2699 de fev/2025: 3.277 de 3.280 lançamentos casam no mesmo dia pelo valor exato.
// O trabalho do contador está nas sobras, e o que este módulo precisa fazer bem é classificá-las.
//
// O VALOR SOZINHO ESCOLHE O PAR ERRADO: o banco tem UMA entrada de 520.000,00 e o razão DUAS
// ("VALOR REF ..." e "TRANSFERENCIA ENTRE CONTAS"). Dentro do mesmo dia e valor, o par é decidido
// pela semelhança do histórico.
//
// AS CAMADAS, NA ORDEM (a ordem importa: duplicidade só é afirmada depois que a janela de dias e os
// agrupamentos tiveram a chance de achar par para o lançamento repetido):
// 1. mesmo dia, mesmo valor                      → CONCILIADO
// 2. mesmo valor, até N dias de distância         → DATA_DIFERENTE
// 3. vários de um lado somam um do outro, no dia  → AGRUPADO
// 3a. lote do SISPAG (se a consulta foi enviada)  → LOTE_SISPAG / LOTE_SISPAG_DIVERGENTE
// 3b. a sobra inteira do dia fecha com o extrato  → LOTE_DO_DIA
// 4. sobra que repete dia e valor de um par feito → DUPLICIDADE_RAZAO / DUPLICIDADE_EXTRATO
// 5. mesmo dia, valor muito próximo               → VALOR_DIVERGENTE
// 6. o resto                                      → SO_RAZAO / SO_EXTRATO
//
// LOTES DE SISPAG: o Itaú paga TED e crédito em conta em lote (UMA linha no extrato, dezenas no
// razão). Procurar "qual combinação soma a linha" é ambíguo de verdade, por isso nenhuma camada daqui
// escolhe entre combinações. A 3a usa a consulta de pagamentos (o banco junta por DIA e TIPO); a 3b
// só fecha quando TUDO o que sobrou no dia, num sentido, soma o que sobrou do extrato.
//
// APLICAÇÃO AUTOMÁTICA QUE O EXTRATO NÃO TRAZ: por ESPÉCIE (resgate, aplicação, rendimento), se o
// extrato do período não tem nenhum lançamento daquela espécie, os do razão saem das pendências e vão
// para `aplicacaoSemExtrato`. Eles saem ANTES das camadas.
//
// Fidelidade ao Python:
// - dicionário por (data, valor): `Decimal("10.0")` e `Decimal("10.00")` são a MESMA chave, então a
//   chave usa o valor normalizado (`chaveValor`);
// - `sorted` estável, `max` com chave devolve o primeiro empate, `itertools.combinations` na ordem
//   lexicográfica;
// - o `re.IGNORECASE` do Python casa `I` com `ı` e `İ`; o JavaScript não, por isso os padrões trazem
//   a classe `[Iıİ]` no lugar da letra.

import { cmp } from "../motor/unicodePy";
import { compara, ehZero, igual, modulo, oposto, somaTodos, subtrai, type Dec } from "../motor/decimal";
import { tokensParaMatch } from "../motor/texto";
import { diasEntre } from "../extrato/comum";
import { re } from "../extrato/py";

export const CONCILIADO = "CONCILIADO";
export const DATA_DIFERENTE = "DATA_DIFERENTE";
export const AGRUPADO = "AGRUPADO";
export const LOTE_SISPAG = "LOTE_SISPAG";
export const LOTE_SISPAG_DIVERGENTE = "LOTE_SISPAG_DIVERGENTE";
export const LOTE_DO_DIA = "LOTE_DO_DIA";
export const DUPLICIDADE_RAZAO = "DUPLICIDADE_RAZAO";
export const DUPLICIDADE_EXTRATO = "DUPLICIDADE_EXTRATO";
export const VALOR_DIVERGENTE = "VALOR_DIVERGENTE";
export const SO_RAZAO = "SO_RAZAO";
export const SO_EXTRATO = "SO_EXTRATO";

// Soma com mais itens que isso é mais coincidência que agrupamento, e o número de combinações explode.
const MAX_ITENS_AGRUPADOS = 6;
const MAX_CANDIDATOS_AGRUPAMENTO = 20;
// "Valor muito próximo": o que cabe num erro de digitação ou num centavo de tarifa.
const DIVERGENCIA_MAX_ABSOLUTA: Dec = { negativo: false, coeficiente: BigInt(5000), expoente: -2 }; // 50.00
const DIVERGENCIA_MAX_RELATIVA: Dec = { negativo: false, coeficiente: BigInt(1), expoente: -2 }; // 0.01
// Um lote do SISPAG sai em até tantas linhas do extrato no mesmo dia.
const MAX_LINHAS_POR_LOTE = 3;

// Abertura do período: o saldo do mês anterior lançado como movimento. No banco é "saldo anterior",
// não transação — nunca vai ter par.
const ABERTURA = re("SALDO\\s+(NEGAT[Iıİ]VO|ANTER[Iıİ]OR|[Iıİ]N[Iıİ]C[Iıİ]AL)", "i");

// "APLIC" como começo de palavra. Sem a exigência da palavra, "REND" achava "PGTO ... MARENDA".
const APLICACAO_RE = re("\\bAPL[Iıİ]C", "i");
const RENDIMENTO_RE = re("\\bREND", "i");
export const RENDIMENTO = "RENDIMENTO";
export const RESGATE = "RESGATE";
export const APLICACAO = "APLICACAO";

const DEZ = BigInt(10);
const B0 = BigInt(0);

/** Um lançamento do razão ou do extrato. `data` é "AAAA-MM-DD"; entrada positiva, saída negativa. */
export type Item = {
  readonly id: string;
  readonly data: string;
  readonly valor: Dec;
  readonly historico: string;
};

/**
 * O que o cruzamento lê de um pagamento da consulta SISPAG (`PagamentoSispag` do original:
 * data, valor, tipo, favorecido, documento, efetuado). `valor` é positivo: o valor pago.
 */
export type PagamentoParaLote = {
  readonly data: string;
  readonly valor: Dec;
  readonly tipo: string;
  readonly favorecido: string;
  readonly efetuado: boolean;
};

export type Grupo<I extends Item = Item, P extends PagamentoParaLote = PagamentoParaLote> = {
  tipo: string;
  razao: I[];
  extrato: I[];
  /** Lote do SISPAG com pagamento que não achou par no razão: pago pelo banco, não lançado. */
  sispagFaltando: P[];
};

export type Resultado<I extends Item = Item, P extends PagamentoParaLote = PagamentoParaLote> = {
  conciliados: Grupo<I, P>[];
  pendencias: Grupo<I, P>[];
  abertura: I[];
  /** Aplicação automática do razão de uma espécie que o extrato não traz: nem conciliada nem pendência. */
  aplicacaoSemExtrato: I[];
};

export type OpcoesConciliar<P extends PagamentoParaLote = PagamentoParaLote> = {
  /** "AAAA-MM-DD" */
  periodoInicio?: string | null;
  toleranciaDias?: number;
  sispag?: readonly P[] | null;
};

/** `Grupo.diferenca`: soma do razão menos soma do extrato. */
export function diferenca(grupo: Grupo<Item, PagamentoParaLote>): Dec {
  return subtrai(somaTodos(grupo.razao.map((i) => i.valor)), somaTodos(grupo.extrato.map((i) => i.valor)));
}

/** `valor > 0` */
function positivo(d: Dec): boolean {
  return !d.negativo && !ehZero(d);
}

/** Chave de dicionário de um Decimal: valores iguais (`1.0` e `1.00`, `0` e `-0`) dão a mesma chave. */
function chaveValor(d: Dec): string {
  if (ehZero(d)) return "0";
  let c = d.coeficiente;
  let e = d.expoente;
  while (c % DEZ === B0) {
    c /= DEZ;
    e++;
  }
  return `${d.negativo ? "-" : ""}${c}e${e}`;
}

/** `a * b` exato (os fatores daqui são valores de extrato e constantes de duas casas). */
function vezes(a: Dec, b: Dec): Dec {
  return { negativo: a.negativo !== b.negativo, coeficiente: a.coeficiente * b.coeficiente, expoente: a.expoente + b.expoente };
}

function menor(a: Dec, b: Dec): Dec {
  return compara(b, a) < 0 ? b : a;
}

/** Rendimento, resgate ou aplicação automática — ou `null` se não é. Visto da conta banco: entrada é resgate. */
export function especieDeAplicacao(historico: string, valor: Dec): string | null {
  if (!APLICACAO_RE.search(historico)) return null;
  if (RENDIMENTO_RE.search(historico)) return RENDIMENTO;
  return positivo(valor) ? RESGATE : APLICACAO;
}

/** `itertools.combinations(xs, k)`, na mesma ordem. */
function* combinacoes<T>(xs: readonly T[], k: number): Generator<T[]> {
  const n = xs.length;
  if (k > n || k < 0) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  yield idx.map((i) => xs[i]);
  for (;;) {
    let i = k - 1;
    while (i >= 0 && idx[i] === i + n - k) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
    yield idx.map((p) => xs[p]);
  }
}

/** `sorted` estável com comparador. */
function ordenar<T>(xs: Iterable<T>, comparador: (a: T, b: T) => number): T[] {
  return [...xs].sort(comparador);
}

/** Semelhança de Jaccard entre as palavras dos dois históricos (com cache de tokens por texto). */
function criarSemelhanca(): (a: string, b: string) => number {
  const cache = new Map<string, Set<string>>();
  const tokens = (t: string) => {
    let s = cache.get(t);
    if (!s) cache.set(t, (s = new Set(tokensParaMatch(t))));
    return s;
  };
  return (a, b) => {
    const ta = tokens(a);
    const tb = tokens(b);
    if (!ta.size || !tb.size) return 0.0;
    let comum = 0;
    for (const t of ta) if (tb.has(t)) comum++;
    return comum / (ta.size + tb.size - comum);
  };
}

type Semelhanca = (a: string, b: string) => number;

/** Pares mais parecidos primeiro — guloso, suficiente para grupos pequenos. */
function parearPorSemelhanca<I extends Item>(razao: readonly I[], extrato: readonly I[], semelhanca: Semelhanca): [I, I][] {
  const candidatos: [number, number, number][] = [];
  razao.forEach((r, i) => extrato.forEach((e, j) => candidatos.push([semelhanca(r.historico, e.historico), i, j])));
  candidatos.sort((a, b) => b[0] - a[0] || a[1] - b[1] || a[2] - b[2]);
  const usadosR = new Set<number>();
  const usadosE = new Set<number>();
  const pares: [I, I][] = [];
  for (const [, i, j] of candidatos) {
    if (usadosR.has(i) || usadosE.has(j)) continue;
    usadosR.add(i);
    usadosE.add(j);
    pares.push([razao[i], extrato[j]]);
  }
  return pares;
}

const SISPAG = re("s[iıİ]spag", "i");

/** Os valores em inteiros na mesma escala, para somar combinações sem refazer o alinhamento. */
function escala(valores: readonly Dec[]): bigint[] {
  const e = Math.min(0, ...valores.map((v) => v.expoente));
  return valores.map((v) => {
    const x = v.coeficiente * DEZ ** BigInt(v.expoente - e);
    return v.negativo ? -x : x;
  });
}

/**
 * As linhas do extrato cuja soma é o lote — só se a resposta for uma. Duas combinações com os mesmos
 * valores são a mesma resposta; com valores diferentes, é ambíguo. Mais de uma linha só vale entre
 * linhas de Sispag.
 */
function linhasDoLote<I extends Item>(linhas: readonly I[], total: Dec): I[] | null {
  const escalados = escala([total, ...linhas.map((l) => l.valor)]);
  const alvo = escalados[0];
  const porIndice = linhas.map((_, i) => i);
  for (let k = 1; k <= Math.min(MAX_LINHAS_POR_LOTE, linhas.length); k++) {
    const achadas: number[][] = [];
    for (const c of combinacoes(porIndice, k)) {
      let s = B0;
      for (const i of c) s += escalados[i + 1];
      if (-s === alvo && (k === 1 || c.every((i) => SISPAG.search(linhas[i].historico)))) achadas.push(c);
    }
    if (!achadas.length) continue;
    const distintas = new Set(
      achadas.map((c) =>
        c
          .map((i) => linhas[i].valor)
          .sort(compara)
          .map(chaveValor)
          .join("|"),
      ),
    );
    if (distintas.size > 1) return null;
    return achadas[0].map((i) => linhas[i]);
  }
  return null;
}

// Palavras de razão social que não identificam ninguém.
const GENERICOS = new Set([
  "ltda", "eireli", "epp", "me", "sa", "cia", "comercio", "servicos", "transportes",
  "transporte", "logistica", "industria", "empresa", "brasil", "do", "da", "de", "dos",
]);

function nomes(texto: string): Set<string> {
  // Os tokens já são só [a-z0-9]: "numérico" do Python aqui é só dígito ASCII.
  return new Set(tokensParaMatch(texto).filter((t) => t.length >= 3 && !/^[0-9]+$/.test(t) && !GENERICOS.has(t)));
}

/** O histórico nomeia o favorecido? Dois nomes em comum, ou o único que ele tem. */
function eDoFavorecido(historico: string, favorecido: string): boolean {
  const ns = nomes(favorecido);
  const doHistorico = new Set(tokensParaMatch(historico));
  let comuns = 0;
  for (const n of ns) if (doHistorico.has(n)) comuns++;
  return comuns >= 2 || (ns.size === 1 && comuns === 1);
}

/**
 * Tira do par 1 × 1 o lançamento do razão que o SISPAG diz ser deste lote. A camada 1 casa pelo dia e
 * pelo valor e pode ter posto um pagamento do lote com a linha "Sispag Salários" de mesmo valor. Só
 * desfaz quando o histórico do razão nomeia o favorecido e o do extrato não; a linha liberada volta
 * para as camadas seguintes.
 */
function recuperarDoParSimples<I extends Item, P extends PagamentoParaLote>(
  pagamento: P,
  conciliados: Grupo<I, P>[],
  livresE: Map<string, I>,
): I | null {
  for (let i = 0; i < conciliados.length; i++) {
    const g = conciliados[i];
    if (g.tipo !== CONCILIADO && g.tipo !== DATA_DIFERENTE) continue;
    // `(r,), (e,) = g.razao, g.extrato`: estes grupos são sempre 1 × 1.
    const r = g.razao[0];
    const e = g.extrato[0];
    if (r.data !== pagamento.data || !igual(oposto(r.valor), pagamento.valor)) continue;
    if (eDoFavorecido(r.historico, pagamento.favorecido) && !eDoFavorecido(e.historico, pagamento.favorecido)) {
      conciliados.splice(i, 1);
      livresE.set(e.id, e);
      return r;
    }
  }
  return null;
}

type Fechar<I extends Item, P extends PagamentoParaLote> = (tipo: string, rs: readonly I[], es: readonly I[], destino: Grupo<I, P>[]) => Grupo<I, P>;

function lotesSispag<I extends Item, P extends PagamentoParaLote>(
  sispag: readonly P[],
  livresR: Map<string, I>,
  livresE: Map<string, I>,
  fechar: Fechar<I, P>,
  conciliados: Grupo<I, P>[],
  pendencias: Grupo<I, P>[],
  semelhanca: Semelhanca,
): void {
  const lotes = new Map<string, { dia: string; pagamentos: P[] }>();
  for (const p of sispag) {
    if (!p.efetuado) continue;
    const chave = JSON.stringify([p.data, p.tipo]);
    let lote = lotes.get(chave);
    if (!lote) lotes.set(chave, (lote = { dia: p.data, pagamentos: [] }));
    lote.pagamentos.push(p);
  }

  // O maior lote do dia primeiro: ele não pode perder a linha para um lote menor que some o mesmo.
  const comTotal = [...lotes.values()].map((l) => ({ ...l, total: somaTodos(l.pagamentos.map((p) => p.valor)) }));
  const ordem = ordenar(comTotal, (a, b) => cmp(a.dia, b.dia) || compara(b.total, a.total));
  for (const { dia, pagamentos, total } of ordem) {
    if (pagamentos.length < 2) continue;
    const linhas = ordenar(
      [...livresE.values()].filter((e) => e.data === dia && e.valor.negativo && !ehZero(e.valor)),
      (a, b) => cmp(a.id, b.id),
    );
    const alvo = linhasDoLote(linhas, total);
    if (alvo === null) continue;

    const porValor = new Map<string, I[]>();
    for (const r of livresR.values()) {
      if (r.data === dia && r.valor.negativo && !ehZero(r.valor)) {
        const k = chaveValor(oposto(r.valor));
        const lista = porValor.get(k);
        if (lista) lista.push(r);
        else porValor.set(k, [r]);
      }
    }
    const usados: I[] = [];
    const faltando: P[] = [];
    for (const p of ordenar(pagamentos, (a, b) => compara(b.valor, a.valor))) {
      const opcoes = porValor.get(chaveValor(p.valor));
      if (!opcoes || !opcoes.length) {
        const recuperado = recuperarDoParSimples(p, conciliados, livresE);
        if (recuperado !== null) usados.push(recuperado);
        else faltando.push(p);
        continue;
      }
      // Mesmo valor para dois favorecidos: decide o nome.
      let melhor = 0;
      let melhorNota = semelhanca(opcoes[0].historico, p.favorecido);
      for (let i = 1; i < opcoes.length; i++) {
        const nota = semelhanca(opcoes[i].historico, p.favorecido);
        if (nota > melhorNota) {
          melhor = i;
          melhorNota = nota;
        }
      }
      usados.push(opcoes.splice(melhor, 1)[0]);
    }

    if (faltando.length) {
      const grupo = fechar(LOTE_SISPAG_DIVERGENTE, usados, alvo, pendencias);
      grupo.sispagFaltando = faltando;
    } else {
      fechar(LOTE_SISPAG, usados, alvo, conciliados);
    }
  }
}

function anexar<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const lista = m.get(k);
  if (lista) lista.push(v);
  else m.set(k, [v]);
}

/** Cruza o razão com o extrato, camada por camada. */
export function conciliar<I extends Item, P extends PagamentoParaLote = PagamentoParaLote>(
  razao: readonly I[],
  extrato: readonly I[],
  opcoes: OpcoesConciliar<P> = {},
): Resultado<I, P> {
  const periodoInicio = opcoes.periodoInicio ?? null;
  const toleranciaDias = opcoes.toleranciaDias ?? 3;
  const sispag = opcoes.sispag ?? null;
  const semelhanca = criarSemelhanca();

  const abertura = razao.filter((r) => ABERTURA.search(r.historico) && (periodoInicio === null || r.data === periodoInicio));
  const idsAbertura = new Set(abertura.map((r) => r.id));
  const especiesNoExtrato = new Set<string>();
  for (const e of extrato) {
    const especie = especieDeAplicacao(e.historico, e.valor);
    if (especie !== null) especiesNoExtrato.add(especie);
  }
  const aplicacaoSemExtrato = razao.filter((r) => {
    if (idsAbertura.has(r.id)) return false;
    const especie = especieDeAplicacao(r.historico, r.valor);
    return especie !== null && !especiesNoExtrato.has(especie);
  });
  const idsFora = new Set([...idsAbertura, ...aplicacaoSemExtrato.map((r) => r.id)]);
  const livresR = new Map<string, I>();
  for (const r of razao) if (!idsFora.has(r.id)) livresR.set(r.id, r);
  const livresE = new Map<string, I>();
  for (const e of extrato) livresE.set(e.id, e);
  const conciliados: Grupo<I, P>[] = [];
  const pendencias: Grupo<I, P>[] = [];

  const fechar: Fechar<I, P> = (tipo, rs, es, destino) => {
    for (const r of rs) livresR.delete(r.id);
    for (const e of es) livresE.delete(e.id);
    const grupo: Grupo<I, P> = { tipo, razao: [...rs], extrato: [...es], sispagFaltando: [] };
    destino.push(grupo);
    return grupo;
  };

  // 1) mesmo dia, mesmo valor — desempate pelo histórico
  const chaveDiaValor = (x: Item) => `${x.data}|${chaveValor(x.valor)}`;
  const porChaveR = new Map<string, I[]>();
  const porChaveE = new Map<string, I[]>();
  for (const r of livresR.values()) anexar(porChaveR, chaveDiaValor(r), r);
  for (const e of livresE.values()) anexar(porChaveE, chaveDiaValor(e), e);
  for (const [chave, rs] of porChaveR) {
    const es = porChaveE.get(chave);
    if (es && es.length) {
      for (const [r, e] of parearPorSemelhanca(rs, es, semelhanca)) fechar(CONCILIADO, [r], [e], conciliados);
    }
  }

  // 2) mesmo valor, datas próximas — a mais próxima primeiro
  if (toleranciaDias > 0) {
    const porValor = new Map<string, I[]>();
    for (const e of livresE.values()) anexar(porValor, chaveValor(e.valor), e);
    const candidatos: [number, number, string, string][] = [];
    for (const r of livresR.values()) {
      for (const e of porValor.get(chaveValor(r.valor)) ?? []) {
        const dias = Math.abs(diasEntre(r.data, e.data));
        if (dias <= toleranciaDias) candidatos.push([dias, -semelhanca(r.historico, e.historico), r.id, e.id]);
      }
    }
    candidatos.sort((a, b) => a[0] - b[0] || a[1] - b[1] || cmp(a[2], b[2]) || cmp(a[3], b[3]));
    for (const [, , rid, eid] of candidatos) {
      const r = livresR.get(rid);
      const e = livresE.get(eid);
      if (r !== undefined && e !== undefined) fechar(DATA_DIFERENTE, [r], [e], conciliados);
    }
  }

  // 3) vários de um lado somam um do outro, no mesmo dia e sentido
  const chaveDiaSentido = (x: Item) => `${x.data}|${positivo(x.valor) ? 1 : 0}`;
  const agrupar = (fonte: Map<string, I>, alvo: Map<string, I>, ladoFonteERazao: boolean) => {
    const porDia = new Map<string, I[]>();
    for (const x of fonte.values()) anexar(porDia, chaveDiaSentido(x), x);
    for (const a of ordenar(alvo.values(), (x, y) => compara(modulo(y.valor), modulo(x.valor)))) {
      if (!alvo.has(a.id)) continue;
      const cands = (porDia.get(chaveDiaSentido(a)) ?? []).filter(
        (x) => fonte.has(x.id) && compara(modulo(x.valor), modulo(a.valor)) <= 0,
      );
      if (cands.length < 2 || cands.length > MAX_CANDIDATOS_AGRUPAMENTO) continue;
      const escalados = escala([a.valor, ...cands.map((x) => x.valor)]);
      const indices = cands.map((_, i) => i);
      for (let k = 2; k <= Math.min(MAX_ITENS_AGRUPADOS, cands.length); k++) {
        let comb: number[] | null = null;
        for (const c of combinacoes(indices, k)) {
          let s = B0;
          for (const i of c) s += escalados[i + 1];
          if (s === escalados[0]) {
            comb = c;
            break;
          }
        }
        if (comb) {
          const itens = comb.map((i) => cands[i]);
          if (ladoFonteERazao) fechar(AGRUPADO, itens, [a], conciliados);
          else fechar(AGRUPADO, [a], itens, conciliados);
          break;
        }
      }
    }
  };
  agrupar(livresR, livresE, true);
  agrupar(livresE, livresR, false);

  // 3a) lote do SISPAG: pagamentos de um dia e tipo que somam linha(s) do extrato
  if (sispag && sispag.length) lotesSispag(sispag, livresR, livresE, fechar, conciliados, pendencias, semelhanca);

  // 3b) a sobra inteira do dia, num sentido, fecha com a sobra do extrato
  const sobraR = new Map<string, I[]>();
  const sobraE = new Map<string, I[]>();
  for (const r of livresR.values()) anexar(sobraR, chaveDiaSentido(r), r);
  for (const e of livresE.values()) anexar(sobraE, chaveDiaSentido(e), e);
  // A chave "AAAA-MM-DD|0" / "|1" ordena como a tupla (date, bool) do Python.
  for (const chave of ordenar([...sobraR.keys()].filter((k) => sobraE.has(k)), cmp)) {
    const rs = sobraR.get(chave)!;
    const es = sobraE.get(chave)!;
    // 1 × 1 com a mesma soma a camada 1 já teria casado; exigir 3 itens deixa isto para lote de fato.
    if (rs.length + es.length >= 3 && igual(somaTodos(rs.map((r) => r.valor)), somaTodos(es.map((e) => e.valor)))) {
      fechar(LOTE_DO_DIA, rs, es, conciliados);
    }
  }

  // 4) duplicidade: sobra que repete dia e valor de um lançamento já conciliado
  const jaConciliado = new Map<string, Grupo<I, P>[]>();
  for (const g of conciliados) if (g.tipo === CONCILIADO) anexar(jaConciliado, chaveDiaValor(g.razao[0]), g);
  const porDataHistorico = (x: Item, y: Item) => cmp(x.data, y.data) || cmp(x.historico, y.historico);
  for (const r of ordenar(livresR.values(), porDataHistorico)) {
    const pares = jaConciliado.get(chaveDiaValor(r));
    if (pares && pares.length) {
      fechar(DUPLICIDADE_RAZAO, [r], [pares[0].extrato[0]], pendencias);
      livresE.delete(pares[0].extrato[0].id); // já estava fora; mantém a referência
    }
  }
  for (const e of ordenar(livresE.values(), porDataHistorico)) {
    const pares = jaConciliado.get(chaveDiaValor(e));
    if (pares && pares.length) fechar(DUPLICIDADE_EXTRATO, [pares[0].razao[0]], [e], pendencias);
  }

  // 5) mesmo dia, valor muito próximo
  const ePorDia = new Map<string, I[]>();
  for (const e of livresE.values()) anexar(ePorDia, e.data, e);
  const divergencias: [Dec, string, string][] = [];
  for (const r of livresR.values()) {
    for (const e of ePorDia.get(r.data) ?? []) {
      if (positivo(r.valor) !== positivo(e.valor) || igual(r.valor, e.valor)) continue;
      const dif = modulo(subtrai(r.valor, e.valor));
      if (compara(dif, menor(DIVERGENCIA_MAX_ABSOLUTA, vezes(modulo(e.valor), DIVERGENCIA_MAX_RELATIVA))) <= 0) {
        divergencias.push([dif, r.id, e.id]);
      }
    }
  }
  // A ordem de geração não importa: (rid, eid) não se repete, e a ordenação decide tudo.
  divergencias.sort((a, b) => compara(a[0], b[0]) || cmp(a[1], b[1]) || cmp(a[2], b[2]));
  for (const [, rid, eid] of divergencias) {
    const r = livresR.get(rid);
    const e = livresE.get(eid);
    if (r !== undefined && e !== undefined) fechar(VALOR_DIVERGENTE, [r], [e], pendencias);
  }

  // 6) o que sobrou
  const porDataEValor = (x: Item, y: Item) => cmp(x.data, y.data) || compara(modulo(y.valor), modulo(x.valor));
  for (const r of ordenar(livresR.values(), porDataEValor)) pendencias.push({ tipo: SO_RAZAO, razao: [r], extrato: [], sispagFaltando: [] });
  for (const e of ordenar(livresE.values(), porDataEValor)) pendencias.push({ tipo: SO_EXTRATO, razao: [], extrato: [e], sispagFaltando: [] });

  return { conciliados, pendencias, abertura, aplicacaoSemExtrato };
}
