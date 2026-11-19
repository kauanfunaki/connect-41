// Calculadora da reforma tributária (19/11/2026, funcionalidade-794): CBS, IBS
// e Imposto Seletivo pelo cálculo oficial da Receita Federal, que o Connect
// roda como serviço interno (infra/calculadora-rtc). Aqui ficam as regras
// puras — sem rede e sem banco —, para a tela da equipe, a do portal, as ações
// e os testes usarem igual: montar o pedido, ler a resposta, traduzir os erros
// e somar.
//
// Não é o Planejamento tributário (./regras.ts, ./motor): lá CBS e IBS são
// premissas digitadas de um estudo de regimes; aqui é o cálculo item a item de
// uma operação, com as regras que a própria Receita publicou.
//
// Formato da API: o regime geral 1.6.1 (POST /calculadora/observabilidade/
// regime-geral). Os valores voltam como texto ("42.24"); o estado de cada item
// diz se calculou. Os gabaritos dos testes são respostas reais do serviço.

import { lerNumeroDigitado } from "../numeroDigitado";

export const MODULO_DA_CALCULADORA = "fiscal_calculadora";
export const ROTA_DA_CALCULADORA = "/calculadora-tributaria";
export const ROTA_DA_CALCULADORA_NO_PORTAL = "/portal/calculadora-tributaria";

/** O primeiro dia em que a Receita exige as alíquotas nominais no pedido (e antes disso as proíbe). */
export const INICIO_DAS_ALIQUOTAS_NOMINAIS = "2027-01-01";
/** Itens por cálculo: uma nota grande cabe; mais que isso é lote, não conferência. */
export const MAXIMO_DE_ITENS = 50;

// ─── Dados abertos ───────────────────────────────────────────────────────────

export type UfDaCalculadora = { sigla: string; nome: string; codigo: number };
export type MunicipioDaCalculadora = { codigo: number; nome: string };

export type NomenclaturaDaClassificacao = "NCM" | "NBS" | "NBS ou NCM" | "Não possui";

/** A classificação tributária (cClassTrib) como a tela precisa: o que escolher e o que ela faz. */
export type ClassificacaoParaEscolher = {
  codigo: string;
  /** O CST: os três primeiros dígitos da cClassTrib (conferido em todas as 161 da base V0059). */
  cst: string;
  descricao: string;
  /** "Alíquota reduzida em 60%", "Imunidade e não incidência". */
  tratamento: string;
  nomenclatura: NomenclaturaDaClassificacao;
  tipoAliquota: string;
  reducao: { cbs: number; ibsUf: number; ibsMun: number };
};

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const numero = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
const objeto = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * O nome de cada CST de CBS e IBS (`/dados-abertos/situacoes-tributarias/cbs-ibs`,
 * base V0059): o título do grupo na lista de classificações. CST novo que a
 * Receita criar aparece como "CST 999" até entrar aqui.
 */
export const NOME_DO_CST: Readonly<Record<string, string>> = {
  "000": "Tributação integral",
  "010": "Tributação com alíquotas uniformes",
  "011": "Tributação com alíquotas uniformes reduzidas",
  "200": "Alíquota reduzida",
  "220": "Alíquota fixa",
  "221": "Alíquota fixa proporcional",
  "222": "Redução de base de cálculo",
  "400": "Isenção",
  "410": "Imunidade e não incidência",
  "510": "Diferimento",
  "515": "Diferimento com redução de alíquota",
  "550": "Suspensão",
  "620": "Tributação monofásica",
  "800": "Transferência de crédito",
  "810": "Ajustes de IBS na ZFM",
  "811": "Ajustes",
  "820": "Tributação em documento específico",
  "830": "Exclusão de base de cálculo",
};

export function rotuloDoCst(cst: string): string {
  return NOME_DO_CST[cst] ? `CST ${cst} — ${NOME_DO_CST[cst]}` : `CST ${cst}`;
}

/** A classificação agrupada por CST, na ordem do código: os grupos da lista. */
export function classificacoesPorCst(classificacoes: readonly ClassificacaoParaEscolher[]): { cst: string; rotulo: string; itens: ClassificacaoParaEscolher[] }[] {
  const grupos = new Map<string, ClassificacaoParaEscolher[]>();
  for (const c of classificacoes) grupos.set(c.cst, [...(grupos.get(c.cst) ?? []), c]);
  return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cst, itens]) => ({ cst, rotulo: rotuloDoCst(cst), itens }));
}

/** O que a classificação faz, numa linha: "CST 200 — Alíquota reduzida em 60%". */
export function resumoDaClassificacao(c: ClassificacaoParaEscolher): string {
  return `CST ${c.cst} — ${c.tratamento || NOME_DO_CST[c.cst] || "sem descrição"}`;
}

/** O CST de uma cClassTrib: os três primeiros dígitos. */
export function cstDaClassificacao(cClassTrib: string): string {
  return cClassTrib.replace(/\D/g, "").slice(0, 3);
}

const NOMENCLATURAS: readonly NomenclaturaDaClassificacao[] = ["NCM", "NBS", "NBS ou NCM", "Não possui"];

/** A lista de `GET /dados-abertos/classificacoes-tributarias/cbs-ibs`, só com o que a tela usa, em ordem de código. */
export function resumirClassificacoes(dados: unknown): ClassificacaoParaEscolher[] {
  const saida: ClassificacaoParaEscolher[] = [];
  for (const bruto of lista(dados)) {
    const c = objeto(bruto);
    const codigo = texto(c?.codigo);
    if (!c || !/^\d{6}$/.test(codigo)) continue;
    const nomenclatura = NOMENCLATURAS.find((n) => n === texto(c.nomenclatura)) ?? "NBS ou NCM";
    saida.push({
      codigo,
      cst: cstDaClassificacao(codigo),
      descricao: texto(c.descricao),
      tratamento: texto(c.descricaoTratamentoTributario),
      nomenclatura,
      tipoAliquota: texto(c.tipoAliquota),
      reducao: {
        cbs: numero(c.percentualReducaoCbs) ?? 0,
        ibsUf: numero(c.percentualReducaoIbsUf) ?? 0,
        ibsMun: numero(c.percentualReducaoIbsMun) ?? 0,
      },
    });
  }
  return saida.sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export type TipoDeCodigo = "ncm" | "nbs";

/** As classificações que aceitam o tipo de código do item: a de NCM não serve para serviço com NBS, e vice-versa. */
export function classificacoesDoTipo(classificacoes: readonly ClassificacaoParaEscolher[], tipo: TipoDeCodigo): ClassificacaoParaEscolher[] {
  const aceita = tipo === "ncm" ? "NCM" : "NBS";
  return classificacoes.filter((c) => c.nomenclatura === aceita || c.nomenclatura === "NBS ou NCM" || c.nomenclatura === "Não possui");
}

/**
 * As 27 UFs. A base da Receita traz também "EX" (Exterior, código 99), sem
 * município: a operação com o exterior não é o caso desta tela.
 */
export function resumirUfs(dados: unknown): UfDaCalculadora[] {
  const saida: UfDaCalculadora[] = [];
  for (const bruto of lista(dados)) {
    const u = objeto(bruto);
    const sigla = texto(u?.sigla).toUpperCase();
    const codigo = numero(u?.codigo);
    if (!/^[A-Z]{2}$/.test(sigla) || codigo === null || sigla === "EX") continue;
    saida.push({ sigla, nome: texto(u?.nome), codigo });
  }
  return saida.sort((a, b) => a.sigla.localeCompare(b.sigla));
}

export function resumirMunicipios(dados: unknown): MunicipioDaCalculadora[] {
  const saida: MunicipioDaCalculadora[] = [];
  for (const bruto of lista(dados)) {
    const m = objeto(bruto);
    const codigo = numero(m?.codigo);
    if (codigo === null || !/^\d{7}$/.test(String(codigo))) continue;
    saida.push({ codigo, nome: texto(m?.nome) });
  }
  return saida.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** `{"aliquotaReferencia":0.9}` → 0.9. */
export function lerAliquotaDeReferencia(dados: unknown): number | null {
  return numero(objeto(dados)?.aliquotaReferencia);
}

/**
 * A descrição de um NCM ou NBS (`GET /dados-abertos/ncm` e `/nbs`), do mais
 * geral ao mais específico, sem repetir: "Arroz. › Polido ou brunido".
 */
export function descricaoDaNomenclatura(dados: unknown): { descricao: string; impostoSeletivo: boolean } | null {
  const d = objeto(dados);
  if (!d) return null;
  const partes = ["capitulo", "posicao", "subposicao", "item", "subitem"].map((k) => texto(d[k])).filter(Boolean);
  if (partes.length === 0) return null;
  const ultimas = partes.slice(-2).filter((p, i, a) => a.indexOf(p) === i);
  return { descricao: ultimas.join(" › "), impostoSeletivo: d.tributadoPeloImpostoSeletivo === true };
}

// ─── O pedido ────────────────────────────────────────────────────────────────

/** Um item como a pessoa digitou: tudo texto, como nos campos. */
export type ItemDigitado = {
  id: string;
  /**
   * NCM (8 dígitos) ou NBS (9 dígitos), com ou sem pontos — o tamanho diz qual
   * é (`tipoDoCodigo`), e a tela não precisa de um seletor a mais. Vazio
   * quando a classificação não pede.
   */
  codigo: string;
  cClassTrib: string;
  base: string;
  quantidade: string;
  unidade: string;
};

export type AliquotasDigitadas = { cbs: string; ibsUf: string; ibsMun: string };

export type EntradaDaCalculadora = {
  /** AAAA-MM-DD: o dia do fato gerador. */
  data: string;
  uf: string;
  municipio: string;
  itens: ItemDigitado[];
  /** Obrigatórias a partir de 2027; antes disso, ignoradas. */
  aliquotas: AliquotasDigitadas | null;
};

export type ItemDoPedido = {
  numero: number;
  ncm?: string;
  nbs?: string;
  cst: string;
  cClassTrib: string;
  baseCalculo: number;
  quantidade?: number;
  unidade?: string;
  aliquotasNominais?: { cbs: number; ibsEstadual: number; ibsMunicipal: number };
};

export type PedidoDaCalculadora = {
  id: string;
  versao: "1.0.0";
  dhFatoGerador: string;
  municipio: number;
  uf: string;
  itens: ItemDoPedido[];
};

/** Onde está o problema: a operação (data, UF, município, alíquotas) ou um item, pela posição (1, 2, …). */
export type ProblemaDaEntrada = { item: number | null; campo: string; mensagem: string };

export function itemVazio(id: string): ItemDigitado {
  return { id, codigo: "", cClassTrib: "", base: "", quantidade: "", unidade: "" };
}

const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function dataValida(data: string): boolean {
  const m = DATA_ISO.exec(data);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** A partir de 2027 a Receita exige as alíquotas no pedido; antes, ela mesma resolve (e recusa as informadas). */
export function exigeAliquotasNominais(data: string): boolean {
  return dataValida(data) && data >= INICIO_DAS_ALIQUOTAS_NOMINAIS;
}

/** O código só com dígitos: "1006.30.21" → "10063021". */
export function soDigitos(codigo: string): string {
  return codigo.replace(/\D/g, "");
}

export function codigoValido(tipo: TipoDeCodigo, codigo: string): boolean {
  const d = soDigitos(codigo);
  return tipo === "ncm" ? /^\d{8}$/.test(d) : /^\d{9}$/.test(d);
}

/** NCM tem 8 dígitos e NBS, 9: o tamanho diz qual é. `null` enquanto não fecha nenhum dos dois. */
export function tipoDoCodigo(codigo: string): TipoDeCodigo | null {
  const d = soDigitos(codigo);
  return d.length === 8 ? "ncm" : d.length === 9 ? "nbs" : null;
}

/** As classificações para o código do item: pelo tipo, quando ele já fecha; todas, enquanto não. */
export function classificacoesDoCodigo(classificacoes: readonly ClassificacaoParaEscolher[], codigo: string): ClassificacaoParaEscolher[] {
  const tipo = tipoDoCodigo(codigo);
  return tipo ? classificacoesDoTipo(classificacoes, tipo) : [...classificacoes];
}

/** Alíquota em percentual: "8,8" → 8.8. Vazio ou fora de 0–100 não serve. */
function lerAliquota(texto: string): number | null | undefined {
  const n = lerNumeroDigitado(texto, false);
  if (n === null || n === undefined) return n;
  return n >= 0 && n <= 100 ? n : undefined;
}

/**
 * Confere o que foi digitado e monta o pedido da Receita. O que não passa
 * volta como problema, com o campo e o item, para a tela marcar onde está —
 * a calculadora também confere, mas aqui a pessoa não espera a rede para saber
 * que faltou a base.
 */
export function montarPedido(
  entrada: EntradaDaCalculadora,
  id: string
): { ok: true; pedido: PedidoDaCalculadora } | { ok: false; problemas: ProblemaDaEntrada[] } {
  const problemas: ProblemaDaEntrada[] = [];
  const operacao = (campo: string, mensagem: string) => problemas.push({ item: null, campo, mensagem });

  if (!dataValida(entrada.data)) operacao("data", "Informe a data do fato gerador.");
  const uf = entrada.uf.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf)) operacao("uf", "Escolha a UF.");
  const municipio = soDigitos(entrada.municipio);
  if (!/^\d{7}$/.test(municipio)) operacao("municipio", "Escolha o município (código IBGE de 7 dígitos).");

  let aliquotas: ItemDoPedido["aliquotasNominais"];
  if (exigeAliquotasNominais(entrada.data)) {
    const a = entrada.aliquotas ?? { cbs: "", ibsUf: "", ibsMun: "" };
    const cbs = lerAliquota(a.cbs);
    const ibsUf = lerAliquota(a.ibsUf);
    const ibsMun = lerAliquota(a.ibsMun);
    if (typeof cbs !== "number") operacao("aliquotaCbs", "Informe a alíquota da CBS, de 0 a 100%.");
    if (typeof ibsUf !== "number") operacao("aliquotaIbsUf", "Informe a alíquota do IBS estadual, de 0 a 100%.");
    if (typeof ibsMun !== "number") operacao("aliquotaIbsMun", "Informe a alíquota do IBS municipal, de 0 a 100%.");
    if (typeof cbs === "number" && typeof ibsUf === "number" && typeof ibsMun === "number") {
      aliquotas = { cbs, ibsEstadual: ibsUf, ibsMunicipal: ibsMun };
    }
  }

  if (entrada.itens.length === 0) operacao("itens", "Inclua pelo menos um item.");
  if (entrada.itens.length > MAXIMO_DE_ITENS) operacao("itens", `Calcule até ${MAXIMO_DE_ITENS} itens por vez.`);

  const itens: ItemDoPedido[] = [];
  entrada.itens.slice(0, MAXIMO_DE_ITENS).forEach((it, i) => {
    const n = i + 1;
    const doItem = (campo: string, mensagem: string) => problemas.push({ item: n, campo, mensagem });
    const codigo = soDigitos(it.codigo);
    const tipo = tipoDoCodigo(codigo);
    if (codigo && !tipo) doItem("codigo", "O NCM tem 8 dígitos e a NBS, 9.");
    const cClassTrib = soDigitos(it.cClassTrib);
    if (!/^\d{6}$/.test(cClassTrib)) doItem("cClassTrib", "Escolha a classificação tributária.");
    const base = lerNumeroDigitado(it.base, true);
    if (typeof base !== "number" || base <= 0) doItem("base", "Informe a base de cálculo, maior que zero.");
    const quantidade = it.quantidade.trim() ? lerNumeroDigitado(it.quantidade, false) : null;
    if (quantidade === undefined || (typeof quantidade === "number" && quantidade < 0)) doItem("quantidade", "A quantidade é um número a partir de zero.");
    const unidade = it.unidade.trim().toUpperCase();
    if (unidade.length > 6) doItem("unidade", "A unidade tem até 6 letras (UN, KG, LT).");

    if (typeof base === "number" && base > 0 && /^\d{6}$/.test(cClassTrib)) {
      itens.push({
        numero: n,
        ...(tipo === "ncm" ? { ncm: codigo } : tipo === "nbs" ? { nbs: codigo } : {}),
        cst: cstDaClassificacao(cClassTrib),
        cClassTrib,
        baseCalculo: Math.round(base * 100) / 100,
        ...(typeof quantidade === "number" ? { quantidade } : {}),
        ...(unidade ? { unidade } : {}),
        ...(aliquotas ? { aliquotasNominais: aliquotas } : {}),
      });
    }
  });

  if (problemas.length > 0) return { ok: false, problemas };
  return {
    ok: true,
    pedido: {
      id,
      versao: "1.0.0",
      // Meio-dia de Brasília: o dia escolhido é o dia do fato gerador, sem
      // risco de o fuso empurrar para o dia anterior ou o seguinte.
      dhFatoGerador: `${entrada.data}T12:00:00-03:00`,
      municipio: Number(municipio),
      uf,
      itens,
    },
  };
}

// ─── A resposta ──────────────────────────────────────────────────────────────

export type EstadoDoItem = "CALCULADO" | "CALCULO_SIMULADO" | "INCONSISTENCIA_ENTRADA" | "NAO_IMPLEMENTADO" | "FALHA_TECNICA";

const ESTADOS: readonly EstadoDoItem[] = ["CALCULADO", "CALCULO_SIMULADO", "INCONSISTENCIA_ENTRADA", "NAO_IMPLEMENTADO", "FALHA_TECNICA"];

export type TomDoEstado = "sucesso" | "atencao" | "perigo" | "neutro";

export const ROTULO_DO_ESTADO: Record<EstadoDoItem, { rotulo: string; tom: TomDoEstado; explicacao: string }> = {
  CALCULADO: { rotulo: "Calculado", tom: "sucesso", explicacao: "Calculado com as alíquotas que a Receita publicou para a data." },
  CALCULO_SIMULADO: {
    rotulo: "Simulado",
    tom: "atencao",
    explicacao: "Calculado com as alíquotas informadas no pedido: a Receita ainda não publicou as definitivas para a data.",
  },
  INCONSISTENCIA_ENTRADA: { rotulo: "Corrigir a entrada", tom: "perigo", explicacao: "A calculadora não aceitou os dados do item." },
  NAO_IMPLEMENTADO: {
    rotulo: "Sem cálculo da Receita",
    tom: "neutro",
    explicacao: "A Receita ainda não implementou o cálculo desta classificação na calculadora oficial.",
  },
  FALHA_TECNICA: { rotulo: "Falha na calculadora", tom: "perigo", explicacao: "A calculadora falhou ao calcular o item." },
};

export type ParcelaDoTributo = {
  /** Alíquota nominal, em %. */
  aliquota: number | null;
  /** Redução de alíquota, em %, quando a classificação tem. */
  reducao: number | null;
  /** Alíquota depois da redução, em %. Sem redução, é a nominal. */
  aliquotaEfetiva: number | null;
  valor: number | null;
  memoria: string | null;
};

export type ImpostoSeletivoDoItem = { base: number | null; aliquota: number | null; valor: number | null; memoria: string | null };

export type ErroTraduzido = {
  codigo: string;
  /** O que aconteceu, em português claro. */
  titulo: string;
  /** O que fazer para resolver. */
  oQueFazer: string;
  /** O texto da Receita, com o código e o valor recusado. */
  detalhe: string | null;
  /** O campo do item, quando a Receita apontou ("NCM", "Base de cálculo"). */
  campo: string | null;
};

export type ItemCalculado = {
  numero: number;
  estado: EstadoDoItem;
  cst: string | null;
  cClassTrib: string | null;
  base: number | null;
  cbs: ParcelaDoTributo | null;
  ibsUf: ParcelaDoTributo | null;
  ibsMun: ParcelaDoTributo | null;
  /** IBS estadual + municipal, como a Receita soma. */
  ibs: number | null;
  impostoSeletivo: ImpostoSeletivoDoItem | null;
  /** CBS + IBS + IS do item. */
  total: number | null;
  /** Calculou, mas sem grupo de CBS/IBS: imunidade, isenção, não incidência. */
  semTributo: boolean;
  erros: ErroTraduzido[];
};

export type TotaisDaCalculadora = {
  base: number;
  cbs: number;
  ibsUf: number;
  ibsMun: number;
  ibs: number;
  impostoSeletivo: number;
  total: number;
};

export type ResultadoDaCalculadora = {
  itens: ItemCalculado[];
  /** Os da Receita: somam só os itens calculados (ou simulados). */
  totais: TotaisDaCalculadora;
  /** Algum item saiu simulado (alíquotas informadas). */
  simulado: boolean;
  calculados: number;
  comProblema: number;
  /** Erros da operação inteira (UF, município, data): nenhum item foi calculado. */
  errosDaOperacao: ErroTraduzido[];
};

const CAMPOS: Record<string, string> = {
  ncm: "NCM",
  nbs: "NBS",
  cst: "CST",
  cClassTrib: "Classificação tributária",
  baseCalculo: "Base de cálculo",
  quantidade: "Quantidade",
  unidade: "Unidade",
  aliquotasNominais: "Alíquotas",
  impostoSeletivo: "Imposto Seletivo",
  tributacaoRegular: "Tributação regular",
  municipio: "Município",
  uf: "UF",
  dhFatoGerador: "Data do fato gerador",
  itens: "Itens",
};

/** "#/itens/3/ncm" → "NCM"; "#/itens/-1" (a operação) → null. */
export function campoDoPonteiro(ponteiro: string | null | undefined): string | null {
  if (!ponteiro) return null;
  const partes = ponteiro.replace(/^#\//, "").split("/").filter(Boolean);
  const ultimo = partes[partes.length - 1];
  if (!ultimo || /^-?\d+$/.test(ultimo)) return null;
  return CAMPOS[ultimo] ?? null;
}

/**
 * O que dizer para cada código de erro da calculadora (REG-, CAL- e VAL-, da
 * versão 1.6.1). Título curto do que aconteceu e o que fazer; o texto da
 * Receita, com o valor recusado, vai junto como detalhe.
 */
const MENSAGENS: Record<string, { titulo: string; oQueFazer: string }> = {
  "REG-001": { titulo: "NCM e NBS no mesmo item", oQueFazer: "Deixe só um: NCM para mercadoria, NBS para serviço." },
  "REG-002": { titulo: "NCM não encontrado", oQueFazer: "Confira os 8 dígitos do NCM e se ele vale na data do fato gerador." },
  "REG-003": { titulo: "NBS não encontrada", oQueFazer: "Confira os 9 dígitos da NBS e se ela vale na data do fato gerador." },
  "REG-004": { titulo: "CST não encontrado", oQueFazer: "Escolha a classificação tributária de novo: o CST vem dela." },
  "REG-005": { titulo: "Classificação tributária não encontrada", oQueFazer: "Escolha outra classificação: esta não vale na data do fato gerador." },
  "REG-006": { titulo: "Classificação não combina com o CST", oQueFazer: "Escolha a classificação tributária de novo: o CST vem dela." },
  "REG-007": { titulo: "Código não serve para esta classificação", oQueFazer: "Confira o NCM ou a NBS e a classificação escolhida." },
  "REG-008": { titulo: "Classificação sem tratamento na data", oQueFazer: "Confira a data do fato gerador ou escolha outra classificação." },
  "REG-009": {
    titulo: "A classificação pede a tributação regular",
    oQueFazer:
      "Diferimento, suspensão e parte das reduções pedem o grupo de tributação regular, que esta tela ainda não coleta. Para conferir este item, use o Swagger da calculadora.",
  },
  "REG-010": { titulo: "Classificação incompatível com a suspensão", oQueFazer: "Escolha outra classificação para o item." },
  "REG-011": { titulo: "NCM fora desta classificação", oQueFazer: "Este NCM não está na lista da classificação escolhida. Troque a classificação ou o NCM." },
  "REG-012": { titulo: "NBS fora desta classificação", oQueFazer: "Esta NBS não está na lista da classificação escolhida. Troque a classificação ou a NBS." },
  "REG-013": {
    titulo: "O item tem Imposto Seletivo",
    oQueFazer: "Este código paga Imposto Seletivo, que esta tela ainda não coleta. Para conferir este item, use o Swagger da calculadora.",
  },
  "REG-014": { titulo: "Imposto Seletivo informado sem incidência", oQueFazer: "A classificação escolhida não tem Imposto Seletivo." },
  "REG-015": { titulo: "Falta o NCM completo", oQueFazer: "Esta classificação exige o NCM com os 8 dígitos." },
  "REG-016": { titulo: "Falta a NBS completa", oQueFazer: "Esta classificação exige a NBS com os 9 dígitos." },
  "REG-018": { titulo: "Município de outra UF", oQueFazer: "Escolha o município depois da UF, na lista." },
  "REG-019": { titulo: "Município não encontrado", oQueFazer: "Escolha o município na lista." },
  "REG-020": { titulo: "UF não encontrada", oQueFazer: "Escolha a UF na lista." },
  "REG-021": { titulo: "Falta a data do fato gerador", oQueFazer: "Informe a data." },
  "REG-022": { titulo: "Tributação regular informada sem necessidade", oQueFazer: "Escolha a classificação tributária de novo." },
  "REG-023": { titulo: "A calculadora recusou o item", oQueFazer: "Confira os dados do item." },
  "REG-024": { titulo: "Campo inválido", oQueFazer: "Confira o campo apontado." },
  "REG-025": { titulo: "Falta a base de cálculo", oQueFazer: "Informe a base de cálculo do item." },
  "REG-026": { titulo: "Base de cálculo inconsistente", oQueFazer: "Confira a base de cálculo do item." },
  "REG-027": { titulo: "Base menor que a do Imposto Seletivo", oQueFazer: "Confira a base de cálculo do item." },
  "REG-028": { titulo: "Tipo de documento não encontrado", oQueFazer: "Confira o tipo de documento." },
  "REG-029": { titulo: "Classificação não vale neste documento", oQueFazer: "Escolha outra classificação para o item." },
  "REG-030": { titulo: "Código não aceito neste documento", oQueFazer: "Confira o NCM ou a NBS do item." },
  "REG-031": { titulo: "Documento sem NCM ou NBS", oQueFazer: "Apague o NCM ou a NBS do item." },
  "REG-032": { titulo: "Imposto Seletivo não aceito neste documento", oQueFazer: "Confira o código e a classificação do item." },
  "REG-033": { titulo: "Falta o NCM ou a NBS", oQueFazer: "Esta classificação exige o código completo do produto ou do serviço." },
  "REG-034": { titulo: "Base de cálculo inconsistente", oQueFazer: "Confira a base de cálculo do item." },
  "REG-035": {
    titulo: "Falta a alíquota do Imposto Seletivo",
    oQueFazer: "A alíquota do Imposto Seletivo deste código ainda não está em lei. Esta tela ainda não coleta o Imposto Seletivo.",
  },
  "REG-036": { titulo: "Alíquotas informadas antes de 2027", oQueFazer: "Até 31/12/2026 a calculadora usa as alíquotas dela. Apague as alíquotas ou mude a data." },
  "REG-037": { titulo: "Faltam as alíquotas", oQueFazer: "A partir de 2027, informe as alíquotas de CBS, IBS estadual e IBS municipal." },
  "CAL-001": { titulo: "Alíquota não encontrada", oQueFazer: "A base da calculadora não tem a alíquota desta operação. Avise a Tech." },
  "CAL-002": { titulo: "Alíquota padrão não encontrada", oQueFazer: "A base da calculadora não tem a alíquota desta data. Avise a Tech." },
  "CAL-003": { titulo: "Alíquota de referência não encontrada", oQueFazer: "A base da calculadora não tem a alíquota desta data. Avise a Tech." },
  "CAL-004": { titulo: "Alíquota ad rem não encontrada", oQueFazer: "A base da calculadora não tem a alíquota deste produto. Avise a Tech." },
  "CAL-005": { titulo: "O cálculo deu alíquota negativa", oQueFazer: "Confira as alíquotas informadas." },
  "CAL-006": { titulo: "Tipo de alíquota desconhecido", oQueFazer: "Falha da calculadora. Avise a Tech." },
  "CAL-007": { titulo: "A Receita ainda não calcula esta classificação", oQueFazer: "A calculadora oficial ainda não implementou o cálculo desta classificação." },
  "CAL-008": { titulo: "Falha na conta da calculadora", oQueFazer: "Falha da calculadora. Avise a Tech." },
  "CAL-009": { titulo: "Tratamento tributário não encontrado", oQueFazer: "Confira a classificação e a data." },
  "CAL-010": { titulo: "Percentual de redução não encontrado", oQueFazer: "Falha da base da calculadora. Avise a Tech." },
  "CAL-011": { titulo: "Fundamentação legal não encontrada", oQueFazer: "Falha da base da calculadora. Avise a Tech." },
  "CAL-012": { titulo: "Tributo e CST não combinam", oQueFazer: "Escolha a classificação tributária de novo." },
  "CAL-999": { titulo: "Erro interno da calculadora", oQueFazer: "Tente de novo. Se continuar, avise a Tech." },
};

/** VAL-: a validação de formato da API (campo vazio, tamanho, padrão). */
const VALIDACAO = { titulo: "Campo fora do formato", oQueFazer: "Confira o campo apontado." };

export function traduzirErro(bruto: unknown): ErroTraduzido {
  const e = objeto(bruto);
  const codigo = texto(e?.code) || "—";
  const conhecido = MENSAGENS[codigo] ?? (codigo.startsWith("VAL-") ? VALIDACAO : null);
  const detalhe = texto(e?.detail) || null;
  return {
    codigo,
    titulo: conhecido?.titulo ?? (texto(e?.title) || "A calculadora recusou o item"),
    oQueFazer: conhecido?.oQueFazer ?? "Confira os dados do item.",
    detalhe,
    campo: campoDoPonteiro(texto(e?.pointer)),
  };
}

function parcela(grupo: unknown, chaveAliquota: string, chaveValor: string): ParcelaDoTributo | null {
  const g = objeto(grupo);
  if (!g) return null;
  const aliquota = numero(g[chaveAliquota]);
  const red = objeto(g.gRed);
  const reducao = red ? numero(red.pRedAliq) : null;
  const efetiva = red ? numero(red.pAliqEfet) : aliquota;
  return { aliquota, reducao, aliquotaEfetiva: efetiva, valor: numero(g[chaveValor]), memoria: texto(g.memoriaCalculo) || null };
}

const soma = (...v: (number | null | undefined)[]): number | null => {
  const n = v.filter((x): x is number => typeof x === "number");
  return n.length ? Math.round(n.reduce((a, b) => a + b, 0) * 100) / 100 : null;
};

function lerItem(bruto: unknown, posicao: number): ItemCalculado {
  const o = objeto(bruto) ?? {};
  const estadoBruto = texto(o.estadoItem) as EstadoDoItem;
  const estado = ESTADOS.includes(estadoBruto) ? estadoBruto : "FALHA_TECNICA";
  const trib = objeto(o.tribCalc);
  const ibscbs = objeto(trib?.IBSCBS);
  const g = objeto(ibscbs?.gIBSCBS);
  const is = objeto(trib?.IS);
  const cbs = parcela(g?.gCBS, "pCBS", "vCBS");
  const ibsUf = parcela(g?.gIBSUF, "pIBSUF", "vIBSUF");
  const ibsMun = parcela(g?.gIBSMun, "pIBSMun", "vIBSMun");
  const ibs = numero(g?.vIBS) ?? soma(ibsUf?.valor, ibsMun?.valor);
  const impostoSeletivo: ImpostoSeletivoDoItem | null = is
    ? { base: numero(is.vBCIS), aliquota: numero(is.pIS), valor: numero(is.vIS), memoria: texto(is.memoriaCalculo) || null }
    : null;
  const calculou = estado === "CALCULADO" || estado === "CALCULO_SIMULADO";
  return {
    numero: numero(o.nObj) ?? posicao,
    estado,
    cst: texto(ibscbs?.CST) || null,
    cClassTrib: texto(ibscbs?.cClassTrib) || null,
    base: numero(g?.vBC),
    cbs,
    ibsUf,
    ibsMun,
    ibs,
    impostoSeletivo,
    total: calculou ? soma(cbs?.valor, ibs, impostoSeletivo?.valor) ?? 0 : null,
    semTributo: calculou && !g && !is,
    erros: lista(o.erros).map(traduzirErro),
  };
}

const ZERO: TotaisDaCalculadora = { base: 0, cbs: 0, ibsUf: 0, ibsMun: 0, ibs: 0, impostoSeletivo: 0, total: 0 };

/** Os totais da Receita (`total.tribCalc`); sem eles, a soma dos itens calculados. */
function lerTotais(total: unknown, itens: ItemCalculado[]): TotaisDaCalculadora {
  const t = objeto(objeto(total)?.tribCalc);
  const ibscbs = objeto(t?.IBSCBSTot);
  if (!t || !ibscbs) {
    const calculados = itens.filter((i) => i.estado === "CALCULADO" || i.estado === "CALCULO_SIMULADO");
    const somar = (f: (i: ItemCalculado) => number | null | undefined) => soma(...calculados.map(f)) ?? 0;
    const cbs = somar((i) => i.cbs?.valor);
    const ibsUf = somar((i) => i.ibsUf?.valor);
    const ibsMun = somar((i) => i.ibsMun?.valor);
    const ibs = somar((i) => i.ibs);
    const is = somar((i) => i.impostoSeletivo?.valor);
    return { base: somar((i) => i.base), cbs, ibsUf, ibsMun, ibs, impostoSeletivo: is, total: soma(cbs, ibs, is) ?? 0 };
  }
  const gIBS = objeto(ibscbs.gIBS);
  const cbs = numero(objeto(ibscbs.gCBS)?.vCBS) ?? 0;
  const ibsUf = numero(objeto(gIBS?.gIBSUF)?.vIBSUF) ?? 0;
  const ibsMun = numero(objeto(gIBS?.gIBSMun)?.vIBSMun) ?? 0;
  const ibs = numero(gIBS?.vIBS) ?? soma(ibsUf, ibsMun) ?? 0;
  const is = numero(objeto(t.ISTot)?.vIS) ?? 0;
  return { base: numero(ibscbs.vBCIBSCBS) ?? 0, cbs, ibsUf, ibsMun, ibs, impostoSeletivo: is, total: soma(cbs, ibs, is) ?? 0 };
}

/**
 * Lê a resposta de `POST /observabilidade/regime-geral`: a de 200 (estado por
 * item) e a de 422 (erro da operação inteira, como município de outra UF).
 */
export function lerResposta(dados: unknown): ResultadoDaCalculadora {
  const d = objeto(dados) ?? {};
  const itens = lista(d.objetos).map((o, i) => lerItem(o, i + 1));
  const errosDaOperacao = itens.length === 0 ? lista(d.errors).map(traduzirErro) : [];
  return {
    itens,
    totais: itens.length ? lerTotais(d.total, itens) : ZERO,
    simulado: itens.some((i) => i.estado === "CALCULO_SIMULADO"),
    calculados: itens.filter((i) => i.estado === "CALCULADO" || i.estado === "CALCULO_SIMULADO").length,
    comProblema: itens.filter((i) => i.estado !== "CALCULADO" && i.estado !== "CALCULO_SIMULADO").length,
    errosDaOperacao,
  };
}

// ─── O serviço ───────────────────────────────────────────────────────────────

/** Por que a calculadora não respondeu, do lado do Connect. */
export type FalhaDoServico = "nao-configurada" | "fora-do-ar" | "tempo-esgotado" | "resposta-invalida";

export const MENSAGEM_DA_FALHA: Record<FalhaDoServico, string> = {
  "nao-configurada": "A calculadora ainda não foi configurada neste ambiente. A Tech precisa subir o serviço e definir a variável CALCULADORA_RTC_URL.",
  "fora-do-ar": "A calculadora da Receita não respondeu. Tente de novo em alguns minutos; se continuar, avise a Tech.",
  "tempo-esgotado": "A calculadora demorou demais para responder. Tente de novo; com muitos itens, divida o cálculo.",
  "resposta-invalida": "A calculadora respondeu algo que o Connect não entendeu. Avise a Tech.",
};

/** No portal, o cliente não fala com a Tech nem sabe de variável: a equipe do escritório é o caminho. */
export const MENSAGEM_DA_FALHA_NO_PORTAL: Record<FalhaDoServico, string> = {
  "nao-configurada": "O simulador não está disponível agora. Se precisar da conta, abra uma solicitação para a equipe do escritório.",
  "fora-do-ar": "O simulador não respondeu. Tente de novo em alguns minutos.",
  "tempo-esgotado": "O simulador demorou demais para responder. Tente de novo; com muitos itens, divida a simulação.",
  "resposta-invalida": "O simulador não conseguiu calcular agora. Tente de novo mais tarde.",
};

/**
 * O que fazer, dito ao cliente do portal: onde a orientação da equipe manda
 * "avisar a Tech" ou "usar o Swagger", o cliente fala com o escritório.
 */
export function oQueFazerNoPortal(erro: ErroTraduzido): string {
  return /Tech|Swagger/.test(erro.oQueFazer)
    ? "Esta conta precisa da equipe do escritório: abra uma solicitação com o item."
    : erro.oQueFazer;
}

/**
 * O endereço do serviço a partir da variável: tira barras do fim e um "/api"
 * final, para valer tanto "http://calculadora-rtc:8080" quanto ".../api".
 * Sem variável (ou com algo que não é http/https), `null`.
 */
export function baseDaCalculadora(valor: string | null | undefined): string | null {
  const v = (valor ?? "").trim().replace(/\/+$/, "").replace(/\/api$/, "");
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

// ─── O que a tela pergunta ao servidor ───────────────────────────────────────

export type AliquotasDeReferencia = { cbs: number | null; ibsUf: number | null; ibsMun: number | null };

/**
 * Uma ação só por tela (a da equipe e a do portal), que confere o acesso e
 * repassa a pergunta: a tela recebe a ação por prop e o componente é o mesmo.
 */
export type PerguntaDaCalculadora =
  | { tipo: "classificacoes"; data: string }
  | { tipo: "municipios"; uf: string }
  | { tipo: "referencias"; data: string; uf: string; municipio: string }
  | { tipo: "codigo"; codigo: string; data: string }
  | { tipo: "calcular"; entrada: EntradaDaCalculadora };

export type RespostasDaCalculadora = {
  classificacoes: ClassificacaoParaEscolher[];
  municipios: MunicipioDaCalculadora[];
  referencias: AliquotasDeReferencia;
  codigo: { descricao: string; impostoSeletivo: boolean } | null;
  calcular: ResultadoDaCalculadora;
};

export type RetornoDaCalculadora<T> = { ok: true; dados: T } | { ok: false; mensagem: string; problemas?: ProblemaDaEntrada[] };

export type ConsultaDaCalculadora = (pergunta: PerguntaDaCalculadora) => Promise<RetornoDaCalculadora<unknown>>;

function itemRecebido(bruto: unknown, i: number): ItemDigitado {
  const o = objeto(bruto) ?? {};
  const s = (v: unknown) => (typeof v === "string" ? v.slice(0, 40) : typeof v === "number" ? String(v) : "");
  return {
    id: s(o.id) || String(i + 1),
    codigo: s(o.codigo),
    cClassTrib: s(o.cClassTrib),
    base: s(o.base),
    quantidade: s(o.quantidade),
    unidade: s(o.unidade),
  };
}

/**
 * A pergunta como chegou do navegador, só com o formato esperado — a ação não
 * confia no tipo que o TypeScript diz. `null` quando não é uma pergunta.
 */
export function lerPergunta(bruto: unknown): PerguntaDaCalculadora | null {
  const p = objeto(bruto);
  if (!p) return null;
  const s = (v: unknown, max = 20) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  switch (p.tipo) {
    case "classificacoes":
      return dataValida(s(p.data)) ? { tipo: "classificacoes", data: s(p.data) } : null;
    case "municipios":
      return /^[A-Za-z]{2}$/.test(s(p.uf)) ? { tipo: "municipios", uf: s(p.uf).toUpperCase() } : null;
    case "referencias":
      return dataValida(s(p.data)) ? { tipo: "referencias", data: s(p.data), uf: s(p.uf), municipio: s(p.municipio) } : null;
    case "codigo": {
      const codigo = soDigitos(s(p.codigo));
      return dataValida(s(p.data)) && tipoDoCodigo(codigo) ? { tipo: "codigo", codigo, data: s(p.data) } : null;
    }
    case "calcular": {
      const e = objeto(p.entrada);
      if (!e) return null;
      const a = objeto(e.aliquotas);
      return {
        tipo: "calcular",
        entrada: {
          data: s(e.data),
          uf: s(e.uf),
          municipio: s(e.municipio),
          // Um a mais que o teto, para o "até 50 itens" aparecer em vez de cortar calado.
          itens: lista(e.itens).slice(0, MAXIMO_DE_ITENS + 1).map(itemRecebido),
          aliquotas: a ? { cbs: s(a.cbs), ibsUf: s(a.ibsUf), ibsMun: s(a.ibsMun) } : null,
        },
      };
    }
    default:
      return null;
  }
}

// ─── Exibição ────────────────────────────────────────────────────────────────

const PERCENTUAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });

/** Percentual com vírgula e sem zeros à toa: 8.8 → "8,8%", 0.05 → "0,05%". */
export function percentual(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${PERCENTUAL.format(v)}%`;
}

/** O ano da data, para a tela dizer "alíquotas de 2026". */
export function anoDaData(data: string): number | null {
  return dataValida(data) ? Number(data.slice(0, 4)) : null;
}
