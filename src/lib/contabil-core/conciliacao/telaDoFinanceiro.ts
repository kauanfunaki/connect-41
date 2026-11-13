// A conferência do financeiro na tela (Bloco B, Fase B4, 12/11/2026): o que o `FinanceiroTab`, o
// `FinanceiroEditor`, o `FinanceiroSugestoes` e o `FinanceiroVinculos` do Contábil Core faziam com a
// análise antes de desenhar (`concilpro-financeiro-utils.ts` e `concilpro-financeiro-upload.ts`).
// Puro, sem React: pares de comparação, seleção, totais, sugestões marcadas, filtros e envio em série.
//
// O original somava em centavos com `Number` e recusava a soma acima de `Number.MAX_SAFE_INTEGER`
// ("Valor fora do limite"). Aqui as somas são decimais exatas (`Dec`), sem limite na tela, como na
// revisão (B3); quem confere o valor de verdade é o servidor, que recalcula tudo ao registrar.

import { dec, ehZero, modulo, somaTodos, subtrai, texto } from "../motor/decimal";
import { dataBr, moedaDoRelatorio } from "./telaDaConciliacao";
import { textoBusca } from "./telaDaRevisao";
import type {
  AnaliseFinanceiro,
  LinhaFinanceiroJson,
  NovoVinculoFinanceiro,
  Sentido,
  SugestaoFinanceiro,
  SugestoesEmLote,
  TipoComparacao,
  TipoDocumentoFinanceiro,
  TipoFonteFinanceiro,
  VinculoFinanceiro,
} from "./financeiroTipos";

/** O documento do painel da esquerda: os relatórios do financeiro ou o Razão da conta banco. */
export type BaseFinanceiro = "FINANCEIRO" | "RAZAO";
/** O documento do painel da direita. */
export type OrigemComparacao = Exclude<TipoFonteFinanceiro, "FINANCEIRO">;

export const NOMES_DAS_FONTES: Record<TipoFonteFinanceiro, string> = {
  FINANCEIRO: "Financeiro da empresa",
  EXTRATO: "Extrato bancário",
  SISPAG: "SISPAG",
  RAZAO: "Razão da conta banco",
  EXTRATO_DETALHADO: "Extrato detalhado Itaú",
};

/** O mesmo mapa da API: o tipo da comparação define o documento de cada painel. */
export const PARES_DE_COMPARACAO: Record<TipoComparacao, { base: BaseFinanceiro; origem: OrigemComparacao }> = {
  EXTRATO: { base: "FINANCEIRO", origem: "EXTRATO" },
  SISPAG: { base: "FINANCEIRO", origem: "SISPAG" },
  RAZAO: { base: "FINANCEIRO", origem: "RAZAO" },
  RAZAO_SISPAG: { base: "RAZAO", origem: "SISPAG" },
  RAZAO_DETALHADO: { base: "RAZAO", origem: "EXTRATO_DETALHADO" },
};

export const COMPARACOES_POR_BASE: Record<BaseFinanceiro, TipoComparacao[]> = {
  FINANCEIRO: ["EXTRATO", "SISPAG", "RAZAO"],
  RAZAO: ["RAZAO_DETALHADO", "RAZAO_SISPAG"],
};

export const TODOS_OS_TIPOS_DE_COMPARACAO = Object.keys(PARES_DE_COMPARACAO) as TipoComparacao[];

export const nomeDaComparacao = (tipo: TipoComparacao) =>
  `${NOMES_DAS_FONTES[PARES_DE_COMPARACAO[tipo].base]} × ${NOMES_DAS_FONTES[PARES_DE_COMPARACAO[tipo].origem]}`;

/** O tipo do documento enviado para a origem (o extrato não se envia: é o já importado). */
export const documentoDaOrigem = (origem: OrigemComparacao): TipoDocumentoFinanceiro | null => (origem === "EXTRATO" ? null : origem);

/** Linhas por página nos dois painéis. */
export const TAMANHO_DA_PAGINA_FINANCEIRO = 50;
/** Análises salvas por página (o `page_size` do original). */
export const ANALISES_POR_PAGINA = 20;
/** Sugestões por página. */
export const SUGESTOES_POR_PAGINA = 5;
/** Títulos em aberto por página. */
export const TITULOS_POR_PAGINA = 20;

export const TITULO_PADRAO = "Conciliação do financeiro";

// ─── Início ─────────────────────────────────────────────────────────────────

/** Conta e período são obrigatórios: nunca se presume o período pelo relógio ou pelo arquivo. */
export function validarInicio(agenciaId: string, inicio: string, fim: string): string[] {
  const erros: string[] = [];
  if (!agenciaId) erros.push("Selecione a conta bancária da comparação.");
  if (!inicio) erros.push("Informe a data inicial do período.");
  if (!fim) erros.push("Informe a data final do período.");
  if (inicio && fim && inicio > fim) erros.push("A data final deve ser igual ou posterior à inicial.");
  return erros;
}

/** O que falta para enviar os documentos escolhidos (além de conta e período, na criação). */
export function pendenciasDoEnvio(p: { base: BaseFinanceiro; origem: OrigemComparacao; arquivos: number; temArquivoDaOrigem: boolean; confirmouEmpresa: boolean }): string[] {
  const erros: string[] = [];
  if (p.arquivos === 0) erros.push(p.base === "RAZAO" ? "Selecione o Razão da conta banco." : "Selecione ao menos um documento do financeiro.");
  if (p.origem !== "EXTRATO" && !p.temArquivoDaOrigem) erros.push(`Selecione o arquivo de ${NOMES_DAS_FONTES[p.origem]}.`);
  if ((p.arquivos > 0 || p.temArquivoDaOrigem) && !p.confirmouEmpresa) erros.push("Confirme que os arquivos pertencem à empresa selecionada.");
  return erros;
}

// ─── Vínculos e seleção ─────────────────────────────────────────────────────

/** O documento base pode ser conferido com cada origem de forma independente. */
export function itensUsados(vinculos: readonly Pick<VinculoFinanceiro, "estado" | "tipoComparacao" | "financeiroIds" | "comparacaoIds">[], tipo: TipoComparacao) {
  const ativos = vinculos.filter((v) => v.estado === "ATIVO" && v.tipoComparacao === tipo);
  return {
    financeiro: new Set(ativos.flatMap((v) => v.financeiroIds)),
    comparacao: new Set(ativos.flatMap((v) => v.comparacaoIds)),
  };
}

export const vinculosAtivosDoFinanceiro = (vinculos: readonly VinculoFinanceiro[]) => vinculos.filter((v) => v.estado === "ATIVO");

export type TotaisDoFinanceiro = {
  /** Soma dos valores absolutos do lado base. */
  totalFinanceiro: string;
  /** Soma dos valores absolutos da comparação. */
  totalComparacao: string;
  /** Comparação − base. */
  diferenca: string;
  temDiferenca: boolean;
  /** Só entradas ou só saídas, nos dois lados. */
  mesmoSentido: boolean;
  datasDiferentes: boolean;
};

type LinhaDoTotal = Pick<LinhaFinanceiroJson, "valor" | "sentido" | "data">;

/** Os valores de documentos diferentes são comparados, nunca somados entre si. */
export function totaisDoFinanceiro(financeiro: readonly LinhaDoTotal[], comparacao: readonly LinhaDoTotal[]): TotaisDoFinanceiro {
  const totalFinanceiro = somaTodos(financeiro.map((l) => modulo(dec(l.valor))));
  const totalComparacao = somaTodos(comparacao.map((l) => modulo(dec(l.valor))));
  const diferenca = subtrai(totalComparacao, totalFinanceiro);
  const todas = [...financeiro, ...comparacao];
  return {
    totalFinanceiro: texto(totalFinanceiro),
    totalComparacao: texto(totalComparacao),
    diferenca: texto(diferenca),
    temDiferenca: !ehZero(diferenca),
    mesmoSentido: new Set(todas.map((l) => l.sentido)).size <= 1,
    datasDiferentes: new Set(todas.map((l) => l.data)).size > 1,
  };
}

/** Datas "AAAA-MM-DD" comparam como texto, sem fuso. */
export const foraDoPeriodo = (linhas: readonly Pick<LinhaFinanceiroJson, "data">[], inicio: string, fim: string) => linhas.some((l) => l.data < inicio || l.data > fim);

/** Movimento sem valor não compõe uma relação. */
export const semValor = (l: Pick<LinhaFinanceiroJson, "valor">) => ehZero(dec(l.valor));

// ─── Sugestões ──────────────────────────────────────────────────────────────

/** A sugestão como a tela usa (os campos do `sugerir` do original, já conferidos). */
export type SugestaoNaTela = {
  id: string;
  financeiroIds: string[];
  comparacaoIds: string[];
  motivo: string;
  ambigua: boolean;
  alertas: string[];
  exigeJustificativa: boolean;
};

const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** A sugestão vinda da API; `null` quando falta o essencial (id e os dois lados). */
export function sugestaoNaTela(s: SugestaoFinanceiro | Record<string, unknown>): SugestaoNaTela | null {
  const r = s as Record<string, unknown>;
  const financeiroIds = textos(r.financeiroIds);
  const comparacaoIds = textos(r.comparacaoIds);
  if (typeof r.id !== "string" || !r.id || financeiroIds.length === 0 || comparacaoIds.length === 0) return null;
  return {
    id: r.id,
    financeiroIds,
    comparacaoIds,
    motivo: typeof r.motivo === "string" ? r.motivo : "Sugestão de conferência",
    ambigua: r.ambigua === true,
    alertas: textos(r.alertas),
    exigeJustificativa: r.exigeJustificativa === true,
  };
}

/** O corpo da rota de sugestões, normalizado (`itens` ou `items`, e os avisos). */
export function sugestoesDaResposta(corpo: unknown): { itens: SugestaoNaTela[]; avisos: string[] } {
  const r = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  const lista = Array.isArray(r.itens) ? r.itens : Array.isArray(r.items) ? r.items : [];
  return {
    itens: lista.map((s) => (s && typeof s === "object" ? sugestaoNaTela(s as Record<string, unknown>) : null)).filter((s): s is SugestaoNaTela => s !== null),
    avisos: textos(r.avisos),
  };
}

type Marcavel = Pick<SugestaoNaTela, "id" | "financeiroIds" | "comparacaoIds">;

/** Marcar de novo desmarca; a ordem é a sequência em que a pessoa conferiu. */
export const alternarSugestao = <T extends Marcavel>(marcadas: readonly T[], sugestao: T): T[] =>
  marcadas.some((m) => m.id === sugestao.id) ? marcadas.filter((m) => m.id !== sugestao.id) : [...marcadas, sugestao];

/** Sugestões ambíguas dividem movimentos: escolher entre elas é decisão da pessoa, uma por vez. */
export function bloqueioDaSugestao(sugestao: Marcavel, marcadas: readonly Marcavel[], sentidoDe: (id: string) => Sentido | undefined): string | null {
  if (marcadas.some((m) => m.id === sugestao.id)) return null;
  const usados = new Set(marcadas.flatMap((m) => [...m.financeiroIds, ...m.comparacaoIds]));
  if ([...sugestao.financeiroIds, ...sugestao.comparacaoIds].some((id) => usados.has(id))) {
    return "Usa um movimento de outra sugestão marcada. Desmarque a outra para conferir esta.";
  }
  const atual = marcadas.length ? sentidoDe(marcadas[0].financeiroIds[0]) : undefined;
  if (atual && sentidoDe(sugestao.financeiroIds[0]) !== atual) {
    return "Natureza diferente das sugestões marcadas. Registre-as antes de conferir esta.";
  }
  return null;
}

// ─── Registro ───────────────────────────────────────────────────────────────

export type SituacaoDaSelecao = {
  totais: TotaisDoFinanceiro;
  datasDiferentes: boolean;
  foraDoPeriodo: boolean;
  precisaJustificativa: boolean;
};

/**
 * Com sugestões marcadas, cada uma vira uma conferência: datas de sugestões diferentes entre si não
 * pedem justificativa, só a sugestão que tem datas diferentes dentro dela.
 */
export function situacaoDaSelecao(p: {
  financeiro: readonly LinhaDoTotal[];
  comparacao: readonly LinhaDoTotal[];
  marcadas: readonly Pick<SugestaoNaTela, "exigeJustificativa">[];
  periodoInicio: string;
  periodoFim: string;
}): SituacaoDaSelecao {
  const totais = totaisDoFinanceiro(p.financeiro, p.comparacao);
  const datasDiferentes = p.marcadas.length ? p.marcadas.some((s) => s.exigeJustificativa) : totais.datasDiferentes;
  const fora = foraDoPeriodo([...p.financeiro, ...p.comparacao], p.periodoInicio, p.periodoFim);
  return { totais, datasDiferentes, foraDoPeriodo: fora, precisaJustificativa: totais.temDiferenca || datasDiferentes || fora };
}

export function podeRegistrarFinanceiro(p: {
  ocupado: boolean;
  comparacaoValida: boolean;
  qtdFinanceiro: number;
  qtdComparacao: number;
  situacao: SituacaoDaSelecao;
  observacao: string;
}): boolean {
  return (
    !p.ocupado &&
    p.comparacaoValida &&
    p.situacao.totais.mesmoSentido &&
    p.qtdFinanceiro > 0 &&
    p.qtdComparacao > 0 &&
    (!p.situacao.precisaJustificativa || p.observacao.trim().length > 0)
  );
}

/** Só as conferências com o Extrato param quando o extrato mudou; SISPAG e Razão seguem. */
export const comparacaoValida = (analise: Pick<AnaliseFinanceiro, "extratoValido">, tipo: TipoComparacao) =>
  PARES_DE_COMPARACAO[tipo].origem !== "EXTRATO" || analise.extratoValido;

/** O corpo do `POST …/vinculos`, na ordem dos documentos (não na dos cliques). */
export function novoVinculoFinanceiro(
  analise: Pick<AnaliseFinanceiro, "versao" | "linhas">,
  financeiro: ReadonlySet<string>,
  comparacao: ReadonlySet<string>,
  observacao: string,
): NovoVinculoFinanceiro {
  return {
    versao: analise.versao,
    sugestaoId: null,
    financeiroIds: analise.linhas.filter((l) => financeiro.has(l.id)).map((l) => l.id),
    comparacaoIds: analise.linhas.filter((l) => comparacao.has(l.id)).map((l) => l.id),
    observacao: observacao.trim(),
  };
}

/** O corpo do `POST …/vinculos/sugestoes`: uma conferência por sugestão, todas na mesma versão. */
export function loteDeSugestoes(versao: number, marcadas: readonly Marcavel[], observacao: string): SugestoesEmLote {
  return {
    versao,
    observacao: observacao.trim(),
    sugestoes: marcadas.map((s) => ({ sugestaoId: s.id, financeiroIds: [...s.financeiroIds], comparacaoIds: [...s.comparacaoIds] })),
  };
}

// ─── Filtros ────────────────────────────────────────────────────────────────

export const TODAS = "todas";

/** O texto de busca de uma linha (sem acento, com a data e o valor nas duas escritas). */
export function indexarLinha(l: LinhaFinanceiroJson): string {
  return textoBusca(
    [
      l.historico,
      l.favorecido,
      l.documento,
      l.documentoFavorecido,
      l.categoria,
      l.parcela,
      l.banco,
      l.referencia,
      l.observacao,
      l.data,
      dataBr(l.data),
      l.valor,
      moedaDoRelatorio(l.valor),
    ]
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .join(" "),
  );
}

export const indiceDasLinhas = (linhas: readonly LinhaFinanceiroJson[]) => new Map(linhas.map((l) => [l.id, indexarLinha(l)]));

export type FiltroDoPainel = {
  mostrarVinculados: boolean;
  /** Id da fonte (arquivo) ou `TODAS`. */
  fonte: string;
  /** "ENTRADA", "SAIDA" ou `TODAS`. */
  natureza: string;
  /** "AAAA-MM-DD" ou vazio. */
  data: string;
  /** Categoria literal ou `TODAS` (só o painel base filtra por categoria). */
  categoria: string;
  busca: string;
};

export function filtrarLinhas(
  linhas: readonly LinhaFinanceiroJson[],
  usados: ReadonlySet<string>,
  indice: ReadonlyMap<string, string>,
  f: FiltroDoPainel,
): LinhaFinanceiroJson[] {
  const busca = textoBusca(f.busca.trim());
  return linhas.filter(
    (l) =>
      (f.mostrarVinculados || !usados.has(l.id)) &&
      (f.fonte === TODAS || l.fonteId === f.fonte) &&
      (f.natureza === TODAS || l.sentido === f.natureza) &&
      (!f.data || l.data === f.data) &&
      (f.categoria === TODAS || l.categoria === f.categoria) &&
      (!busca || (indice.get(l.id) ?? "").includes(busca)),
  );
}

/** As categorias do lado base, em ordem alfabética (literais: não viram regra nem conta). */
export const categoriasDe = (linhas: readonly Pick<LinhaFinanceiroJson, "categoria">[]) =>
  [...new Set(linhas.map((l) => l.categoria).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "pt-BR"));

/** O rótulo da categoria conforme o documento: no Razão é a conta contábil. */
export const rotuloDaCategoria = (tipo: TipoFonteFinanceiro) =>
  tipo === "FINANCEIRO" ? "Categoria do financeiro" : tipo === "RAZAO" ? "Conta contábil do Razão" : "Categoria informada";

/** A página (a partir de 0) em que está a linha; `null` quando não está na lista. */
export function paginaDaLinha(linhas: readonly { id: string }[], id: string, tamanho = TAMANHO_DA_PAGINA_FINANCEIRO): number | null {
  const i = linhas.findIndex((l) => l.id === id);
  return i < 0 ? null : Math.floor(i / tamanho);
}

// ─── Envio dos documentos ───────────────────────────────────────────────────

export type DocumentoParaEnviar = { tipo: TipoDocumentoFinanceiro; arquivo: File };

/**
 * Cada envio é uma gravação própria, com a versão que o anterior devolveu. Para na primeira falha e
 * guarda o progresso: os já enviados não são repetidos, os seguintes não são tentados.
 */
export async function enviarEmSequencia<A extends { versao: number }, D, E>(
  inicial: A,
  documentos: readonly D[],
  enviar: (analise: A, documento: D) => Promise<{ ok: true; valor: A } | { ok: false; erro: E }>,
): Promise<{ analise: A; enviados: D[]; erro: E | null }> {
  let analise = inicial;
  const enviados: D[] = [];
  for (const documento of documentos) {
    const r = await enviar(analise, documento);
    if (!r.ok) return { analise, enviados, erro: r.erro };
    analise = r.valor;
    enviados.push(documento);
  }
  return { analise, enviados, erro: null };
}
