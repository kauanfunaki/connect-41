// A consulta das contas a pagar e a receber.
//
// Separada de `contas.ts`, que é regra pura e testada. Aqui só o que toca o
// banco — e a montagem das linhas que a tela lê.

import { getPrisma } from "@/lib/prisma";
import { presaAoOmie } from "@/lib/integracoes/omie/virada";
import { rotuloDaSerie } from "./repeticao";
import type { Prisma } from "@/generated/prisma/client";
import { saoPauloParts, addDaysToKey } from "@/lib/agenda";
import { nomeExibicao } from "@/lib/companyName";
import {
  situacaoDaConta,
  totaisDoRecorte,
  ordenarContas,
  centavosDeDecimal,
  type RecorteDeContas,
  type SituacaoDaConta,
  type Totais,
} from "./contas";
import { inicioDeHoje, totaisDoEscopo } from "./consultas";
import {
  CONTAS_POR_PAGINA,
  SITUACOES_DO_FUNIL,
  diaDaChave,
  fatiasDaPagina,
  totalDePaginas,
  whereDaSituacao,
  whereDosFunis,
  type ChaveDoFunil,
  type FunisDasContas,
} from "./paginaDeContas";

export type TipoDeConta = "PAGAR" | "RECEBER";

export type LinhaDaConta = {
  id: string;
  situacao: SituacaoDaConta;
  valorCentavos: number;
  vencimentoKey: string;
  vencimento: Date;
  /** A data de previsão (lote D, 20/10), quando há. */
  previsao?: Date | null;
  pagoEm: Date | null;
  competencia: string;
  descricao: string | null;
  empresaId: string;
  empresaNome: string;
  contraparteNome: string;
  categoriaNome: string | null;
  /** Quantas linhas de rateio a conta tem (lote D, 20/10). A categoria é a da linha maior. */
  rateio?: number;
  /** Quanto foi retido na fonte (lote D, 20/10). O valor da conta é o líquido; o bruto, este mais aquele. */
  retidoCentavos?: number;
  status: "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO";
  /** Aprovação por alçada — AGUARDANDO e REPROVADO travam a baixa. */
  approvalStatus: "NAO_REQUER" | "AGUARDANDO" | "APROVADO" | "REPROVADO";
  /** Documento fiscal que originou, quando veio de um. */
  documentoId: string | null;
  /** Por que saiu do em aberto, quando cancelada — renegociada e perda aparecem com o nome. */
  closeReason: "CANCELADO" | "RENEGOCIADO" | "PERDA" | null;
  /** Parcela de acordo de cobrança. */
  parcelaDeAcordo: boolean;
  centroDeCustoId: string | null;
  centroDeCustoNome: string | null;
  projetoNome: string | null;
  /** O que as baixas já quitaram (lote C). Abaixo do valor numa conta em aberto é baixa parcial. */
  baixadoCentavos: number;
  /** Número do documento e emissão (19/10) — como o setor acha a conta. */
  numeroDocumento: string | null;
  emissao: Date | null;
  /** Veio do Omie e a empresa ainda não virou para o Connect (lote E): baixa e cancelamento, só no Omie. */
  presaAoOmie: boolean;
  /** A posição na série da repetição ("3/12"), quando nasceu de uma (lote D). */
  serie: string | null;
};

export type FiltroDeContas = {
  competencia?: string;
  empresaId?: string;
  /**
   * Sem `empresaId` ("todas"), as empresas que entram — com uma empresa em
   * foco (21/10/2026), a matriz e as filiais da base. Sem as duas, o
   * escritório inteiro.
   */
  empresaIds?: string[];
  /** "abertas" esconde pago e cancelado — é o recorte de trabalho. */
  recorte?: RecorteDeContas;
  /** Os funis das colunas (13/11/2026), lidos da URL por `funisDaUrl`. Entram na lista, nas contagens e nos totais. */
  funis?: FunisDasContas;
};

export type ResultadoDeContas = {
  linhas: LinhaDaConta[];
  /** Somados no banco, sobre o recorte inteiro — não só sobre as linhas que vieram. */
  totais: Totais;
  /** Quantas existem para este tipo com os filtros de competência e empresa, ignorando o recorte. */
  totalGeral: number;
  /** Quantas o recorte tem. Passa de `linhas.length` quando a lista parou no teto. */
  totalNoRecorte: number;
  /** A lista parou em `LIMITE_DE_CONTAS`: a tela avisa, e a contagem vira "1.000+". */
  limitada: boolean;
};

/**
 * Teto de linhas de `listarContas` — não dos totais, que são somados no banco.
 *
 * Desde 13/11/2026 a lista da tela é paginada (`listarPaginaDeContas`); este
 * teto vale para quem precisa das contas de uma vez: a aba Análise e a IA.
 * Passando disto, o que falta é filtro, e a tela diz isso.
 */
export const LIMITE_DE_CONTAS = 1000;

const ABERTAS: Prisma.FinanceEntryWhereInput = { paidAt: null, status: { notIn: ["CANCELADO", "PAGO"] } };

/**
 * O recorte em SQL, com as regras de `situacaoDaConta`: em aberto é nem paga
 * (status PAGO ou com baixa) nem cancelada; vencida é a em aberto com
 * vencimento antes do começo de hoje em São Paulo — o mesmo corte de
 * `totaisDoEscopo`, que o portal usa desde 07/10.
 */
export function whereDoRecorte(recorte: RecorteDeContas, hojeKey: string): Prisma.FinanceEntryWhereInput {
  if (recorte === "todas") return {};
  const amanha = inicioDeHoje(addDaysToKey(hojeKey, 1));
  if (recorte === "avencer") return { ...ABERTAS, dueDate: { gte: amanha } };
  if (recorte === "hoje") return { ...ABERTAS, dueDate: { gte: inicioDeHoje(hojeKey), lt: amanha } };
  if (recorte === "vencidas") return { ...ABERTAS, dueDate: { lt: inicioDeHoje(hojeKey) } };
  return ABERTAS;
}

/** O que não está em aberto: paga ou cancelada. Só o recorte "todas" traz. */
const FECHADAS: Prisma.FinanceEntryWhereInput = {
  OR: [{ status: { in: ["CANCELADO", "PAGO"] } }, { paidAt: { not: null } }],
};

const CAMPOS = {
  id: true,
  status: true,
  amount: true,
  dueDate: true,
  forecastDate: true,
  paidAt: true,
  competence: true,
  description: true,
  fiscalDocumentId: true,
  approvalStatus: true,
  closeReason: true,
  agreementId: true,
  company: { select: { id: true, name: true, displayName: true, omieCutoverAt: true } },
  omieTitleId: true,
  omieMovementId: true,
  counterparty: { select: { name: true } },
  category: { select: { name: true } },
  _count: { select: { allocations: true } },
  retentions: { select: { amount: true } },
  costCenterId: true,
  costCenter: { select: { name: true } },
  project: { select: { name: true } },
  documentNumber: true,
  recurrenceIndex: true,
  recurrenceTotal: true,
  issueDate: true,
  paidPrincipal: true,
} satisfies Prisma.FinanceEntrySelect;

type ContaLida = Prisma.FinanceEntryGetPayload<{ select: typeof CAMPOS }>;

/** A conta como a tela e a exportação leem. */
function linhaDaConta(e: ContaLida, hojeKey: string): LinhaDaConta {
  const vencimentoKey = saoPauloParts(e.dueDate).dateKey;
  return {
    id: e.id,
    situacao: situacaoDaConta(e, hojeKey, vencimentoKey),
    valorCentavos: centavosDeDecimal(e.amount),
    vencimentoKey,
    vencimento: e.dueDate,
    previsao: e.forecastDate,
    pagoEm: e.paidAt,
    competencia: e.competence,
    descricao: e.description,
    empresaId: e.company.id,
    empresaNome: nomeExibicao(e.company),
    contraparteNome: e.counterparty.name,
    categoriaNome: e.category?.name ?? null,
    rateio: e._count.allocations,
    retidoCentavos: e.retentions.reduce((s, r) => s + centavosDeDecimal(r.amount), 0),
    status: e.status,
    approvalStatus: e.approvalStatus,
    documentoId: e.fiscalDocumentId,
    closeReason: e.closeReason,
    parcelaDeAcordo: e.agreementId !== null,
    centroDeCustoId: e.costCenterId,
    centroDeCustoNome: e.costCenter?.name ?? null,
    projetoNome: e.project?.name ?? null,
    baixadoCentavos: centavosDeDecimal(e.paidPrincipal),
    numeroDocumento: e.documentNumber,
    emissao: e.issueDate,
    presaAoOmie: presaAoOmie(e, e.company),
    serie: rotuloDaSerie(e),
  };
}

/**
 * O filtro da tela em SQL, sem o recorte: tipo, competência, empresa (ou as da
 * base em foco) e os funis das colunas. Os funis vão num `AND` à parte, para
 * não brigar com as chaves do recorte quando os dois se juntam.
 */
function whereDoFiltro(
  tenantId: string,
  kind: TipoDeConta,
  filtro: FiltroDeContas,
  hojeKey: string,
  opcoes: { semFunis?: boolean; exceto?: ChaveDoFunil } = {}
): Prisma.FinanceEntryWhereInput {
  const funis = opcoes.semFunis || !filtro.funis ? [] : whereDosFunis(filtro.funis, hojeKey, opcoes.exceto);
  return {
    tenantId,
    kind,
    ...(filtro.competencia ? { competence: filtro.competencia } : {}),
    ...(filtro.empresaId ? { companyId: filtro.empresaId } : filtro.empresaIds ? { companyId: { in: filtro.empresaIds } } : {}),
    ...(funis.length ? { AND: funis } : {}),
  };
}

/** Os totais do topo, somados no banco sobre o filtro inteiro — com os funis, os mesmos da lista. */
function totaisDoFiltro(tenantId: string, kind: TipoDeConta, filtro: FiltroDeContas, hojeKey: string) {
  return totaisDoEscopo(
    // Com a base em foco (matriz e filiais), os totais somam só ela, como a
    // lista: antes somavam o escritório inteiro e diziam outra coisa (05/11/2026).
    { tenantId, companyIds: filtro.empresaId ? [filtro.empresaId] : (filtro.empresaIds ?? null) },
    kind,
    hojeKey,
    { competencia: filtro.competencia || undefined, onde: filtro.funis ? whereDosFunis(filtro.funis, hojeKey) : undefined }
  );
}

/**
 * As contas de um tipo, já com situação, totais e ordem.
 *
 * ─── Por que a consulta mudou (08/10/2026) ──────────────────────────────────
 *
 * Até aqui era um `findMany` com `take: 1000` e **sem `orderBy`**, e o recorte
 * e os totais saíam dessas mil linhas, no JavaScript. Acima de mil contas no
 * filtro (o histórico pago conta, mesmo no recorte "em aberto"), o banco
 * devolvia mil linhas quaisquer: a lista e os cartões do topo perdiam contas
 * sem aviso — inclusive vencidas, que são o motivo da tela.
 *
 * Agora:
 * - o recorte vai para o banco (`whereDoRecorte`), e o teto vale só para o
 *   que a tela mostra;
 * - a ordem é estável — vencimento e id —, e em aberto ela já é a ordem da
 *   fila (vencida, vence hoje, a vencer), então o corte, se houver, deixa de
 *   fora o vencimento mais distante, nunca a vencida;
 * - em "todas", as em aberto vêm primeiro e o histórico (paga, cancelada)
 *   completa até o teto, do mais recente para o mais antigo;
 * - os totais e as contagens são do banco (`totaisDoEscopo`, `count`), sem
 *   teto, e a tela avisa quando a lista está limitada.
 */
export async function listarContas(
  tenantId: string,
  kind: TipoDeConta,
  filtro: FiltroDeContas,
  agora: Date,
  /** O teto: a análise e a IA param em `LIMITE_DE_CONTAS`; a exportação, em `LIMITE_DA_EXPORTACAO`. A lista da tela é paginada (`listarPaginaDeContas`). */
  limite: number = LIMITE_DE_CONTAS
): Promise<ResultadoDeContas> {
  const prisma = getPrisma();
  const hojeKey = saoPauloParts(agora).dateKey;
  const recorte = filtro.recorte ?? "abertas";

  const doFiltro = whereDoFiltro(tenantId, kind, filtro, hojeKey);
  // "todas" começa pelas em aberto; o histórico entra depois, até o teto.
  const daFila: Prisma.FinanceEntryWhereInput = {
    ...doFiltro,
    ...whereDoRecorte(recorte === "todas" ? "abertas" : recorte, hojeKey),
  };

  const [naFila, totalGeral, totalNoRecorte, somas] = await Promise.all([
    prisma.financeEntry.findMany({
      where: daFila,
      select: CAMPOS,
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: limite,
    }),
    prisma.financeEntry.count({ where: doFiltro }),
    prisma.financeEntry.count({ where: { ...doFiltro, ...whereDoRecorte(recorte, hojeKey) } }),
    totaisDoFiltro(tenantId, kind, filtro, hojeKey),
  ]);

  const vagas = limite - naFila.length;
  const historico =
    recorte === "todas" && vagas > 0
      ? await prisma.financeEntry.findMany({
          where: { ...doFiltro, ...FECHADAS },
          select: CAMPOS,
          orderBy: [{ dueDate: "desc" }, { id: "desc" }],
          take: vagas,
        })
      : [];

  const linhas = [...naFila, ...historico].map((e) => linhaDaConta(e, hojeKey));

  return {
    linhas: ordenarContas(linhas),
    totais: totaisDoRecorte(somas, recorte),
    totalGeral,
    totalNoRecorte,
    limitada: totalNoRecorte > linhas.length,
  };
}

export type PaginaDeContas = {
  linhas: LinhaDaConta[];
  /** Somados no banco sobre o recorte e os funis inteiros — não só sobre a página. */
  totais: Totais;
  /** Quantas o filtro de competência e empresa tem, sem o recorte e sem os funis: zero é a empresa sem conta deste lado. */
  totalGeral: number;
  /** Quantas passam pelo recorte e pelos funis — o que as páginas somam. */
  totalNoRecorte: number;
  pagina: number;
  totalDePaginas: number;
  porPagina: number;
};

const PELA_FILA: Prisma.FinanceEntryOrderByWithRelationInput[] = [{ dueDate: "asc" }, { id: "asc" }];
const DO_MAIS_RECENTE: Prisma.FinanceEntryOrderByWithRelationInput[] = [{ dueDate: "desc" }, { id: "desc" }];

/**
 * Uma página da lista de contas (13/11/2026) — o que a tela mostra.
 *
 * A lista é uma sequência de partes, e a página é uma janela sobre ela
 * (`fatiasDaPagina`). Num recorte em aberto é uma parte só, pela fila:
 * vencimento mais antigo primeiro, que já põe a vencida antes da de hoje e da a
 * vencer. Em "todas" são duas: as em aberto pela fila e depois o histórico
 * (paga, cancelada), do mais recente para o mais antigo — a mesma ordem que a
 * lista de mil tinha, agora sem teto e sem reordenar a página no JavaScript,
 * que faria uma conta trocar de página.
 *
 * Os totais e as contagens são do banco, sem teto, com o recorte e os funis.
 * Página além do fim volta sem linhas; a tela leva para a última.
 */
export async function listarPaginaDeContas(
  tenantId: string,
  kind: TipoDeConta,
  filtro: FiltroDeContas,
  agora: Date,
  pagina: number,
  porPagina: number = CONTAS_POR_PAGINA
): Promise<PaginaDeContas> {
  const prisma = getPrisma();
  const hojeKey = saoPauloParts(agora).dateKey;
  const recorte = filtro.recorte ?? "abertas";
  const doFiltro = whereDoFiltro(tenantId, kind, filtro, hojeKey);

  const partes: { where: Prisma.FinanceEntryWhereInput; orderBy: Prisma.FinanceEntryOrderByWithRelationInput[] }[] =
    recorte === "todas"
      ? [
          { where: { ...doFiltro, ...whereDoRecorte("abertas", hojeKey) }, orderBy: PELA_FILA },
          { where: { ...doFiltro, ...FECHADAS }, orderBy: DO_MAIS_RECENTE },
        ]
      : [{ where: { ...doFiltro, ...whereDoRecorte(recorte, hojeKey) }, orderBy: PELA_FILA }];

  // Em "todas" sem funil, as partes já somam o filtro inteiro: a contagem geral sai delas.
  const geralDasPartes = recorte === "todas" && !doFiltro.AND;
  const [contagens, geral, somas] = await Promise.all([
    Promise.all(partes.map((p) => prisma.financeEntry.count({ where: p.where }))),
    geralDasPartes ? null : prisma.financeEntry.count({ where: whereDoFiltro(tenantId, kind, filtro, hojeKey, { semFunis: true }) }),
    totaisDoFiltro(tenantId, kind, filtro, hojeKey),
  ]);
  const totalNoRecorte = contagens.reduce((s, n) => s + n, 0);

  const blocos = await Promise.all(
    fatiasDaPagina(contagens, pagina, porPagina).map((f) =>
      prisma.financeEntry.findMany({
        where: partes[f.parte].where,
        select: CAMPOS,
        orderBy: partes[f.parte].orderBy,
        skip: f.skip,
        take: f.take,
      })
    )
  );

  return {
    linhas: blocos.flat().map((e) => linhaDaConta(e, hojeKey)),
    totais: totaisDoRecorte(somas, recorte),
    totalGeral: geral ?? totalNoRecorte,
    totalNoRecorte,
    pagina,
    totalDePaginas: totalDePaginas(totalNoRecorte, porPagina),
    porPagina,
  };
}

/** Um valor oferecido no funil de uma coluna, com quantas contas têm. */
export type OpcaoDoFunilDeContas = { valor: string; rotulo: string; n: number };

/** O vazio de cada coluna, como o funil mostra. */
const SEM: Record<"categoria" | "centro" | "projeto", string> = {
  categoria: "(sem categoria)",
  centro: "(sem centro de custo)",
  projeto: "(sem projeto)",
};

/** Por nome, como o Excel; o vazio no fim. */
function porNome(a: OpcaoDoFunilDeContas, b: OpcaoDoFunilDeContas): number {
  if (a.valor === "" || b.valor === "") return a.valor === "" ? (b.valor === "" ? 0 : 1) : -1;
  return a.rotulo.localeCompare(b.rotulo, "pt-BR", { sensitivity: "base", numeric: true });
}

/**
 * Os valores de um funil (13/11/2026), com a contagem de cada um — pedidos
 * quando o funil abre, e não a cada página: a lista de fornecedores de um
 * escritório inteiro pesaria mais que a página.
 *
 * Em cascata, como no Excel: conta as contas do recorte que passam pelos
 * funis das **outras** colunas.
 */
export async function opcoesDoFunil(
  tenantId: string,
  kind: TipoDeConta,
  filtro: FiltroDeContas,
  chave: ChaveDoFunil,
  agora: Date
): Promise<OpcaoDoFunilDeContas[]> {
  const prisma = getPrisma();
  const hojeKey = saoPauloParts(agora).dateKey;
  const where: Prisma.FinanceEntryWhereInput = {
    ...whereDoFiltro(tenantId, kind, filtro, hojeKey, { exceto: chave }),
    ...whereDoRecorte(filtro.recorte ?? "abertas", hojeKey),
  };

  if (chave === "situacao") {
    const ns = await Promise.all(
      SITUACOES_DO_FUNIL.map((s) => prisma.financeEntry.count({ where: { AND: [where, whereDaSituacao(s.valor, hojeKey)] } }))
    );
    return SITUACOES_DO_FUNIL.map((s, i) => ({ valor: s.valor, rotulo: s.rotulo, n: ns[i] })).filter((o) => o.n > 0);
  }

  if (chave === "vencimento") {
    const grupos = await prisma.financeEntry.groupBy({ by: ["dueDate"], where, _count: { _all: true } });
    const porDia = new Map<string, number>();
    for (const g of grupos) {
      const dia = saoPauloParts(g.dueDate).dateKey;
      porDia.set(dia, (porDia.get(dia) ?? 0) + g._count._all);
    }
    // Do mais recente para o mais antigo, como o funil de data do navegador.
    return [...porDia]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dia, n]) => ({ valor: dia, rotulo: diaDaChave(dia), n }));
  }

  if (chave === "contraparte") {
    const grupos = await prisma.financeEntry.groupBy({ by: ["counterpartyId"], where, _count: { _all: true } });
    const nomes = await prisma.financeCounterparty.findMany({
      where: { tenantId, id: { in: grupos.map((g) => g.counterpartyId) } },
      select: { id: true, name: true, company: { select: { name: true, displayName: true } } },
    });
    const porId = new Map(nomes.map((c) => [c.id, c]));
    // O mesmo nome em duas empresas são dois cadastros: o funil diz de qual.
    const repetidos = new Set<string>();
    const vistos = new Set<string>();
    for (const c of nomes) (vistos.has(c.name) ? repetidos : vistos).add(c.name);
    return grupos
      .map((g) => {
        const c = porId.get(g.counterpartyId);
        const nome = c?.name ?? "(sem nome)";
        return { valor: g.counterpartyId, rotulo: c && repetidos.has(nome) ? `${nome} · ${nomeExibicao(c.company)}` : nome, n: g._count._all };
      })
      .sort(porNome);
  }

  // Categoria, centro e projeto: um id opcional, com o nome no cadastro.
  const porCampo = { categoria: "categoryId", centro: "costCenterId", projeto: "projectId" } as const;
  const campo = porCampo[chave];
  const grupos = await prisma.financeEntry.groupBy({ by: [campo], where, _count: { _all: true } });
  const ids = grupos.map((g) => g[campo]).filter((id): id is string => id !== null);
  const consulta = { where: { tenantId, id: { in: ids } }, select: { id: true, name: true } } as const;
  const cadastros =
    ids.length === 0
      ? []
      : chave === "categoria"
        ? await prisma.financeCategory.findMany(consulta)
        : chave === "centro"
          ? await prisma.costCenter.findMany(consulta)
          : await prisma.financeProject.findMany(consulta);
  const nomes = new Map(cadastros.map((c) => [c.id, c.name]));
  return grupos
    .map((g) => {
      const id = g[campo];
      return { valor: id ?? "", rotulo: id === null ? SEM[chave] : (nomes.get(id) ?? "(sem nome)"), n: g._count._all };
    })
    .sort(porNome);
}

/**
 * Competências que têm lançamento deste tipo, para o filtro — da empresa
 * escolhida, quando há uma (13/10/2026): o índice `[tenantId, companyId,
 * competence]` responde sem varrer as contas dos outros clientes.
 */
export async function competenciasComContas(
  tenantId: string,
  kind: TipoDeConta,
  /** Uma empresa, as da base em foco ("todas" com foco), ou nada — o escritório. */
  empresaId?: string | string[]
): Promise<string[]> {
  const prisma = getPrisma();
  const linhas = await prisma.financeEntry.groupBy({
    by: ["competence"],
    where: { tenantId, kind, ...(Array.isArray(empresaId) ? { companyId: { in: empresaId } } : empresaId ? { companyId: empresaId } : {}) },
    orderBy: { competence: "desc" },
    take: 36,
  });
  return linhas.map((l) => l.competence);
}
