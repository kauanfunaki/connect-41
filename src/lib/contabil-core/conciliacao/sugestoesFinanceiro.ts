// Sugestões de conferência do financeiro (Bloco B, Fase B4, 12/11/2026): só sugestões documentais,
// nunca decisões contábeis nem vínculos automáticos. Porte de `conciliacao_bancaria/sugestoes_financeiro.py`.
//
// Para cada par de documentos (financeiro × extrato, SISPAG ou Razão; Razão × SISPAG ou extrato
// detalhado), sugere:
// - mesmo valor e a mesma identidade (CPF/CNPJ do favorecido, nome do favorecido ou o nome no
//   histórico), preferindo o mesmo dia;
// - parcelas identificadas cuja soma fecha exatamente o valor (nos dois sentidos), iguais ou com a
//   última até 5 centavos maior quando a ordem é verificável;
// - lotes SISPAG pela soma global exata ou pela composição única do lote.
// Datas diferentes exigem candidato único nas duas pontas e justificativa na confirmação.
//
// Entrada na forma do snapshot da análise (snake_case, como o original recebe: `analise.snapshot["linhas"]`
// e os vínculos gravados), para o id de cada sugestão sair igual ao do original. A saída é o envelope
// do original com as chaves em camelCase (`tipoComparacao`, `financeiroIds`, `comparacaoIds`,
// `exigeJustificativa`); o `id` é o mesmo sha256.

import { createHash } from "node:crypto";
import { compara, dec, ehZero, igual, modulo, soma, subtrai, type Dec } from "../motor/decimal";
import { combinante, digitoUnicode, jsonTexto } from "../motor/unicodePy";
import { re } from "../extrato/py";
import { comporPorValoresSispag } from "./composicao";
import type { SugestaoFinanceiro, TipoComparacao } from "./financeiroTipos";

// Proteção contra arquivos patológicos, não um corte do período: um mês com ~5 mil lançamentos de
// cada lado usa ~1,5 milhão de comparações.
export const MAX_COMPARACOES = 20_000_000;
export const MAX_PARCELAS = 108;
const DOC = re("(?<!\\d)(?:\\d{2}\\.\\d{3}\\.\\d{3}/\\d{4}-\\d{2}|\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}|\\d{14}|\\d{11})(?!\\d)");
const NAO_DIGITO = re("\\D");
const GENERICO = new Set(["LTDA", "LTD", "SA", "S", "A", "DE", "DA", "DO", "E", "ME", "EPP"]);

/** Tipo de comparação → (documento base à esquerda, origem à direita). */
export const PARES: Record<TipoComparacao, [string, string]> = {
  EXTRATO: ["FINANCEIRO", "EXTRATO"],
  SISPAG: ["FINANCEIRO", "SISPAG"],
  RAZAO: ["FINANCEIRO", "RAZAO"],
  RAZAO_SISPAG: ["RAZAO", "SISPAG"],
  RAZAO_DETALHADO: ["RAZAO", "EXTRATO_DETALHADO"],
};

/** Uma linha do snapshot da análise (as chaves do original). */
export type LinhaParaSugestao = {
  readonly id: string;
  readonly data: string;
  readonly valor: string;
  readonly tipo_fonte: string;
  readonly historico?: string;
  readonly favorecido?: string | null;
  readonly documento_favorecido?: string | null;
  readonly ordem?: number | null;
  readonly ordem_fonte?: string | null;
};

/** Um vínculo gravado (os atributos que o original lê do `FinanceiroVinculo`). */
export type VinculoParaSugestao = {
  readonly estado: string;
  readonly tipo_comparacao: string;
  readonly financeiro_ids: readonly string[];
  readonly comparacao_ids: readonly string[];
};

export type SugestaoFinanceiroCompleta = SugestaoFinanceiro & {
  criterio: string;
  ambigua: boolean;
  exigeJustificativa: boolean;
  motivo: string;
  alertas: string[];
};

export type SugestoesFinanceiro = {
  versao: number;
  tipoComparacao: TipoComparacao;
  items: SugestaoFinanceiroCompleta[];
  avisos: string[];
};

export type Perfil = [Set<string>, string, string];

/** `normalizar`: maiúsculas, sem acento e só letras e dígitos ASCII, um espaço entre as palavras. */
export function normalizar(texto: string): string {
  const semAcento = Array.from(texto.toUpperCase().normalize("NFKD"))
    .filter((c) => !combinante(c))
    .join("");
  return semAcento.replace(/[^A-Z0-9 ]/gu, " ").split(" ").filter(Boolean).join(" ");
}

/** `src.core.cnpj.valido`: 14 dígitos com os verificadores certos e sem dígito repetido. */
function cnpjValido(valor: string): boolean {
  const d = Array.from(valor)
    .map((c) => digitoUnicode(c))
    .filter((v): v is number => v !== null);
  if (d.length !== 14 || d.every((x) => x === d[0])) return false;
  const dv = (digitos: number[], pesos: number[]) => {
    const resto = digitos.reduce((s, x, i) => s + x * pesos[i], 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return d[12] === dv(d.slice(0, 12), p1) && d[13] === dv(d.slice(0, 13), p2);
}

/** `_documentos`: CPF/CNPJ do favorecido; sem a coluna, os do histórico com pontuação ou CNPJ válido. */
function documentos(linha: LinhaParaSugestao): Set<string> {
  // `documento` é nota/boleto, não documento do favorecido.
  const proprio = linha.documento_favorecido || "";
  const fonte = proprio || (linha.historico ?? "");
  return new Set(
    DOC.findallTextos(fonte)
      .filter((d) => proprio || d.includes(".") || cnpjValido(d))
      .map((d) => NAO_DIGITO.sub("", d)),
  );
}

const semGenericos = (texto: string) =>
  normalizar(texto)
    .split(" ")
    .filter((t) => t && !GENERICO.has(t))
    .join(" ");

/** `_perfil`: (documentos, nome do favorecido, " histórico ") sem as palavras genéricas. */
function perfil(linha: LinhaParaSugestao): Perfil {
  return [documentos(linha), semGenericos(linha.favorecido || ""), ` ${semGenericos(linha.historico ?? "")} `];
}

/** `_ordem_verificavel`: todas com ordem, da mesma fonte, sem ordem repetida. */
function ordemVerificavel(parcelas: readonly LinhaParaSugestao[]): boolean {
  return (
    parcelas.every((p) => p.ordem !== null && p.ordem !== undefined && Boolean(p.ordem_fonte)) &&
    new Set(parcelas.map((p) => p.ordem_fonte)).size === 1 &&
    new Set(parcelas.map((p) => p.ordem)).size === parcelas.length
  );
}

/** `identidade`: o critério que liga as duas linhas, ou `null`. */
export function identidade(a: LinhaParaSugestao, b: LinhaParaSugestao, perfis?: ReadonlyMap<string, Perfil>): string | null {
  const [da, na, ha] = perfis && perfis.size ? perfis.get(a.id)! : perfil(a);
  const [db, nb, hb] = perfis && perfis.size ? perfis.get(b.id)! : perfil(b);
  if (da.size && db.size) return [...da].some((d) => db.has(d)) ? "DOCUMENTO_FAVORECIDO" : null;
  if (na && nb) {
    // Nomes estruturados contraditórios não são superados pelo valor.
    if (na === nb || (na.length >= 8 && (nb.includes(na) || na.includes(nb)))) return "FAVORECIDO";
    return null;
  }
  for (const [nome, historico] of [
    [na, hb],
    [nb, ha],
  ]) {
    if (Array.from(nome).length >= 6 && historico.includes(` ${nome} `)) return "FAVORECIDO_NO_HISTORICO";
  }
  return null;
}

/** A chave de um Decimal pelo valor (`Decimal("10.0") == Decimal("10.00")`). */
function chave(d: Dec): string {
  if (ehZero(d)) return "0";
  let c = d.coeficiente;
  let e = d.expoente;
  while (c % BigInt(10) === BigInt(0)) {
    c /= BigInt(10);
    e += 1;
  }
  return `${d.negativo ? "-" : ""}${c}e${e}`;
}

const positivo = (d: Dec) => !d.negativo && !ehZero(d);
const valorDe = (l: LinhaParaSugestao) => dec(l.valor);
const CINCO_CENTAVOS = dec("0.05");
const ZERO = dec("0");

function pegar<K, V>(m: Map<K, V[]>, k: K): V[] {
  let v = m.get(k);
  if (!v) m.set(k, (v = []));
  return v;
}

/** `json.dumps([versao, tipo, ids_f, ids_c, criterio], sort_keys=True)` */
function chaveDaSugestao(versao: number, tipo: string, idsF: string[], idsC: string[], criterio: string): string {
  const lista = (xs: string[]) => `[${xs.map(jsonTexto).join(", ")}]`;
  return `[${versao}, ${jsonTexto(tipo)}, ${lista(idsF)}, ${lista(idsC)}, ${jsonTexto(criterio)}]`;
}

type Candidato = [LinhaParaSugestao[], LinhaParaSugestao[], string];

/** As parcelas fecham o valor: iguais, ou com ordem verificável e a última até 5 centavos maior. */
function fechaParcelas(parcelas: LinhaParaSugestao[], alvo: Dec): LinhaParaSugestao[] | null {
  let valores = parcelas.map((p) => modulo(valorDe(p)));
  const iguais = new Set(valores.map(chave)).size === 1;
  // A ordem do extrato é explícita na referência; documentos sem ordem verificável admitem apenas
  // parcelas inteiramente iguais.
  const ordenadas = ordemVerificavel(parcelas);
  let lista = parcelas;
  if (ordenadas) {
    lista = parcelas
      .map((p, i) => ({ p, i }))
      .sort((x, y) => (x.p.ordem as number) - (y.p.ordem as number) || x.i - y.i)
      .map((x) => x.p);
    valores = lista.map((p) => modulo(valorDe(p)));
  }
  const diferenca = subtrai(valores[valores.length - 1], valores[0]);
  const ajuste = new Set(valores.slice(0, -1).map(chave)).size === 1 && compara(diferenca, ZERO) >= 0 && compara(diferenca, CINCO_CENTAVOS) <= 0;
  const total = valores.reduce((s, v) => soma(s, v), ZERO);
  return igual(total, modulo(alvo)) && (iguais || (ordenadas && ajuste)) ? lista : null;
}

/**
 * `sugerir`: as sugestões de um tipo de comparação no período, sem as linhas já vinculadas nesse
 * tipo. `opcoes.maxComparacoes` só existe para o gabarito (o teste do original troca a constante).
 */
export function sugerir(
  linhas: readonly LinhaParaSugestao[],
  vinculos: readonly VinculoParaSugestao[],
  tipo: TipoComparacao,
  versao: number,
  inicio: string,
  fim: string,
  opcoes: { maxComparacoes?: number } = {},
): SugestoesFinanceiro {
  const maximo = opcoes.maxComparacoes ?? MAX_COMPARACOES;
  const usados = new Set<string>();
  for (const v of vinculos) {
    if (v.estado === "ATIVO" && v.tipo_comparacao === tipo) for (const id of [...v.financeiro_ids, ...v.comparacao_ids]) usados.add(id);
  }
  const disponiveis = linhas.filter((l) => !usados.has(l.id) && inicio <= l.data && l.data <= fim && !ehZero(valorDe(l)));
  const par = PARES[tipo];
  if (!par) throw new Error(`KeyError: '${tipo}'`);
  const [base, origemComparacao] = par;
  const financeiros = disponiveis.filter((l) => l.tipo_fonte === base);
  const comparacao = disponiveis.filter((l) => l.tipo_fonte === origemComparacao);
  const perfis = new Map<string, Perfil>();
  for (const l of [...financeiros, ...comparacao]) perfis.set(l.id, perfil(l));
  const porValor = new Map<string, LinhaParaSugestao[]>();
  const porDia = new Map<string, LinhaParaSugestao[]>();
  const dia = (l: LinhaParaSugestao) => `${l.data}|${positivo(valorDe(l))}`;
  for (const l of comparacao) {
    pegar(porValor, chave(valorDe(l))).push(l);
    pegar(porDia, dia(l)).push(l);
  }
  let candidatos: Candidato[] = [];
  let trabalho = 0;
  const avisos: string[] = [];

  for (const f of financeiros) {
    const valor = valorDe(f);
    const pares: Candidato[] = [];
    for (const c of porValor.get(chave(valor)) ?? []) {
      trabalho += 1;
      if (trabalho > maximo) break;
      const criterio = identidade(f, c, perfis);
      if (criterio) pares.push([[f], [c], criterio]);
    }
    if (trabalho > maximo) {
      avisos.push("Limite de busca atingido. Continue pela conferência manual.");
      break;
    }
    const mesmosDias = pares.filter((p) => p[1][0].data === f.data);
    candidatos.push(...(mesmosDias.length ? mesmosDias : pares.length === 1 ? pares : []));
    // Só grupos homogêneos identificados; ordem física, nunca UUID/data ordenada.
    if (!pares.length) {
      const parcelas: LinhaParaSugestao[] = [];
      let total = ZERO;
      for (const c of porDia.get(`${f.data}|${positivo(valor)}`) ?? []) {
        trabalho += 1;
        if (trabalho > maximo) break;
        if (identidade(f, c, perfis)) {
          parcelas.push(c);
          total = soma(total, modulo(valorDe(c)));
          // Todo o grupo do dia precisa fechar; passou do total, já não fecha.
          if (compara(total, modulo(valor)) > 0 || parcelas.length > MAX_PARCELAS) break;
        }
      }
      if (trabalho <= maximo && parcelas.length >= 2 && parcelas.length <= MAX_PARCELAS) {
        const lista = fechaParcelas(parcelas, valor);
        if (lista) candidatos.push([[f], lista, "PARCELAS_IGUAIS_SOMA_EXATA"]);
      }
    }
    if (trabalho > maximo) {
      avisos.push("Limite de busca atingido. Os demais movimentos continuam disponíveis " + "para conferência manual.");
      break;
    }
  }

  // Mesmo raciocínio no sentido inverso: vários itens financeiros para um pagamento.
  const financeirosDia = new Map<string, LinhaParaSugestao[]>();
  for (const f of financeiros) pegar(financeirosDia, dia(f)).push(f);
  const jaCandidatos = new Set(candidatos.flatMap(([, cs]) => cs.map((l) => l.id)));
  for (const c of comparacao) {
    if (trabalho > maximo) break;
    if (jaCandidatos.has(c.id)) continue;
    const valorC = valorDe(c);
    const parcelas: LinhaParaSugestao[] = [];
    let total = ZERO;
    for (const f of financeirosDia.get(dia(c)) ?? []) {
      trabalho += 1;
      if (trabalho > maximo) break;
      if (f.data === c.data && positivo(valorDe(f)) === positivo(valorC) && identidade(f, c, perfis)) {
        parcelas.push(f);
        total = soma(total, modulo(valorDe(f)));
        if (compara(total, modulo(valorC)) > 0 || parcelas.length > MAX_PARCELAS) break;
      }
    }
    if (trabalho <= maximo && parcelas.length >= 2 && parcelas.length <= MAX_PARCELAS) {
      const lista = fechaParcelas(parcelas, valorC);
      if (lista) candidatos.push([lista, [c], "PARCELAS_IGUAIS_SOMA_EXATA"]);
    }
  }

  // Lotes SISPAG sem favorecido não permitem adivinhar parcelas: só uma partição global exata e única.
  const reservados = new Set(candidatos.flatMap(([fs, cs]) => [...fs, ...cs].map((l) => l.id)));
  // No Razão × SISPAG o lote está no Razão (base) e o detalhe no SISPAG.
  const loteNaBase = base === "RAZAO";
  const [lancados, detalhes] = loteNaBase ? [financeiros, comparacao] : [comparacao, financeiros];
  const parDoLote = (origem: LinhaParaSugestao[], alvos: LinhaParaSugestao[]): [LinhaParaSugestao[], LinhaParaSugestao[]] =>
    loteNaBase ? [alvos, origem] : [origem, alvos];
  const lotes = new Map<string, LinhaParaSugestao[]>();
  for (const c of lancados) {
    if (!reservados.has(c.id) && normalizar(c.historico ?? "").includes("SISPAG")) pegar(lotes, c.data).push(c);
  }
  // Todos os dias do período: cada dia já é limitado a 3 alvos e MAX_PARCELAS pagamentos, e a
  // composição só aceita solução única.
  for (const [diaLote, alvos] of lotes) {
    const origem = detalhes.filter((f) => f.data === diaLote && valorDe(f).negativo && !ehZero(valorDe(f)) && !reservados.has(f.id));
    if (!(origem.length >= 1 && origem.length <= MAX_PARCELAS) || !(alvos.length >= 1 && alvos.length <= 3)) continue;
    if (alvos.some((c) => !valorDe(c).negativo || ehZero(valorDe(c)))) continue;
    if (alvos.length === 1) {
      const total = origem.reduce((s, f) => soma(s, valorDe(f)), ZERO);
      if (igual(total, valorDe(alvos[0]))) candidatos.push([...parDoLote(origem, alvos), "SOMA_GLOBAL_SISPAG"]);
    } else {
      const grupos = comporPorValoresSispag(
        origem.map((f, i) => ({ indice: i, valor: valorDe(f) })),
        alvos.map((c, i) => ({ indice: i, valor: valorDe(c) })),
        [],
      );
      for (const grupo of grupos) {
        candidatos.push([...parDoLote(grupo.razaoIndices.map((i) => origem[i]), [alvos[grupo.extratoIndice]]), "SOMA_UNICA_SISPAG"]);
      }
    }
  }
  if (trabalho > maximo && !avisos.length) avisos.push("Limite de busca atingido. Continue pela conferência manual.");

  const ocorrencias = new Map<string, number>();
  for (const [fs, cs] of candidatos) for (const l of [...fs, ...cs]) ocorrencias.set(l.id, (ocorrencias.get(l.id) ?? 0) + 1);
  const uma = (l: LinhaParaSugestao) => ocorrencias.get(l.id) === 1;
  // Datas diferentes exigem unicidade nas duas pontas, não apenas no valor.
  candidatos = candidatos.filter(([fs, cs]) => new Set([...fs, ...cs].map((l) => l.data)).size === 1 || [...fs, ...cs].every(uma));

  const items = candidatos.map(([fs, cs, criterio]): SugestaoFinanceiroCompleta => {
    const idsF = fs.map((l) => l.id);
    const idsC = cs.map((l) => l.id);
    const datas = new Set([...fs, ...cs].map((l) => l.data)).size > 1;
    const ambigua = [...fs, ...cs].some((l) => (ocorrencias.get(l.id) ?? 0) > 1);
    return {
      id: createHash("sha256").update(chaveDaSugestao(versao, tipo, idsF, idsC, criterio), "utf8").digest("hex"),
      financeiroIds: idsF,
      comparacaoIds: idsC,
      criterio,
      ambigua,
      exigeJustificativa: datas,
      motivo: criterio.includes("SISPAG")
        ? "Lote SISPAG: composição por soma exata, não prova de favorecido"
        : fs.length === 1 && cs.length === 1
          ? "Mesmo valor e identificação do favorecido"
          : "Parcelas identificadas cuja soma fecha exatamente o valor",
      alertas: [...(ambigua ? ["Mais de uma associação possível; confira os documentos."] : []), ...(datas ? ["Datas diferentes: justifique a confirmação."] : [])],
    };
  });
  return { versao, tipoComparacao: tipo, items, avisos };
}
