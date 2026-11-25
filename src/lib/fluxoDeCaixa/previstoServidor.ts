// O que a aba "Previsto" e o Excel leem, na equipe e no portal (25/11/2026,
// funcionalidade-837).
//
// Uma empresa por vez: o de-para, a data de caixa e o saldo são da empresa. A
// base (`baseDoPrevisto`) junta as contas em aberto com a categoria, o de-para
// do cliente, a data de caixa e o saldo inicial; a tela soma por período, e o
// Excel lista conta por conta.

import { getPrisma } from "@/lib/prisma";
import { saoPauloParts } from "@/lib/agenda";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { saldoBancarioDoEscopo } from "@/lib/financeiro/conciliacao/saldoDasContas";
import { sugerirLinha } from "./sugestao";
import { diaPrevisto } from "@/lib/financeiro/fluxo";
import type { AtrasadaDaPlanilha, ContaDaPlanilha, EntradaDaPlanilha } from "./planilhaDoPrevisto";
import {
  contasDaCelula,
  dataDeCaixa,
  diasSemBanco,
  montarPrevisto,
  type Celula,
  type Classificacao,
  type ContaDaCelula,
  type Granularidade,
  type Previsto,
  type RegrasDaData,
  type TituloDoPrevisto,
} from "./projecao";

/** O mesmo teto da projeção de hoje: passar disso é lançamento esquecido em aberto. */
const TETO_DE_CONTAS = 5_000;

export type OrigemDoSaldo = "auto" | "conciliacao" | "omie";

export function origemDoSaldoValida(texto: string | null | undefined): OrigemDoSaldo {
  return texto === "conciliacao" || texto === "omie" ? texto : "auto";
}

export type ConfiguracaoDoFluxo = { diasReceber: number; diasPagar: number; origemDoSaldo: OrigemDoSaldo };

export async function configuracaoDoFluxo(tenantId: string, companyId: string): Promise<ConfiguracaoDoFluxo> {
  const c = await getPrisma().cashFlowSettings.findFirst({
    where: { tenantId, companyId },
    select: { receivableDays: true, payableDays: true, balanceSource: true },
  });
  return { diasReceber: c?.receivableDays ?? 0, diasPagar: c?.payableDays ?? 0, origemDoSaldo: origemDoSaldoValida(c?.balanceSource) };
}

/** O saldo de onde o previsto parte, com a origem dita na tela. */
export type SaldoInicial = {
  centavos: number | null;
  origem: "conciliacao" | "omie" | null;
  /** "extrato até 24/11" ou "do Omie, 25/11 12:15". */
  referencia: string | null;
  contas: { nome: string; centavos: number }[];
};

const dm = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;

async function saldoInicialDaEmpresa(tenantId: string, companyId: string, origem: OrigemDoSaldo): Promise<SaldoInicial> {
  const [conciliacao, doOmie] = await Promise.all([
    origem === "omie" ? null : saldoBancarioDoEscopo({ tenantId, companyIds: [companyId] }),
    origem === "conciliacao"
      ? []
      : getPrisma().omieAccountBalance.findMany({
          where: { tenantId, companyId },
          select: { label: true, balance: true, fetchedAt: true },
          orderBy: { label: "asc" },
        }),
  ]);
  const pelaConciliacao = (): SaldoInicial | null =>
    conciliacao && conciliacao.centavos !== null
      ? {
          centavos: conciliacao.centavos,
          origem: "conciliacao",
          referencia: conciliacao.atualizadoAteKey ? `extrato até ${dm(conciliacao.atualizadoAteKey)}` : null,
          contas: conciliacao.contas.filter((c) => c.saldo.centavos !== null).map((c) => ({ nome: c.nome, centavos: c.saldo.centavos! })),
        }
      : null;
  const peloOmie = (): SaldoInicial | null => {
    if (!doOmie || doOmie.length === 0) return null;
    const maisAntigo = doOmie.reduce((m, s) => (s.fetchedAt < m ? s.fetchedAt : m), doOmie[0]!.fetchedAt);
    const p = saoPauloParts(maisAntigo);
    return {
      centavos: doOmie.reduce((s, c) => s + centavosDeDecimal(c.balance), 0),
      origem: "omie",
      referencia: `do Omie, ${dm(p.dateKey)} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`,
      contas: doOmie.map((c) => ({ nome: c.label, centavos: centavosDeDecimal(c.balance) })),
    };
  };
  const escolhido = origem === "omie" ? peloOmie() : origem === "conciliacao" ? pelaConciliacao() : (pelaConciliacao() ?? peloOmie());
  return escolhido ?? { centavos: null, origem: null, referencia: null, contas: [] };
}

/** O que o previsto precisa da empresa, antes de somar. */
export type BaseDoPrevisto = {
  hojeKey: string;
  titulos: TituloDoPrevisto[];
  classificar: (t: TituloDoPrevisto) => Classificacao;
  regras: RegrasDaData;
  configuracao: ConfiguracaoDoFluxo;
  saldoInicial: SaldoInicial;
  /** A categoria do Omie de cada conta, pelo id (para o Excel). */
  nomeDaCategoria: Map<string, string>;
  /** O de-para gravado: categoria do Omie → categoria do cliente e linha. */
  dePara: { categoria: string; cliente: string; linha: string }[];
  comNomenclaturaDoCliente: boolean;
  noTeto: boolean;
};

/** "Sem categoria" de cada lado: o nome tem de dizer o lado, porque vira linha no Excel. */
export const SEM_CATEGORIA = { RECEBER: "Sem categoria (a receber)", PAGAR: "Sem categoria (a pagar)" } as const;

export async function baseDoPrevisto(tenantId: string, companyId: string, agora: Date = new Date()): Promise<BaseDoPrevisto> {
  const prisma = getPrisma();
  const hojeKey = saoPauloParts(agora).dateKey;
  const configuracao = await configuracaoDoFluxo(tenantId, companyId);

  const [linhas, ligacoes, saldoInicial] = await Promise.all([
    prisma.financeEntry.findMany({
      where: { tenantId, companyId, paidAt: null, status: { not: "CANCELADO" } },
      select: {
        id: true,
        kind: true,
        amount: true,
        paidPrincipal: true,
        dueDate: true,
        forecastDate: true,
        description: true,
        documentNumber: true,
        categoryId: true,
        category: { select: { name: true } },
        counterparty: { select: { name: true } },
      },
      orderBy: { dueDate: "asc" },
      take: TETO_DE_CONTAS,
    }),
    prisma.clientCategoryMapping.findMany({
      where: { tenantId, companyId },
      select: { categoryId: true, category: { select: { name: true } }, clientCategory: { select: { name: true, line: true } } },
    }),
    saldoInicialDaEmpresa(tenantId, companyId, configuracao.origemDoSaldo),
  ]);

  const titulos: TituloDoPrevisto[] = linhas.map((l) => ({
    id: l.id,
    kind: l.kind,
    // O que falta: a baixa parcial já saiu do caixa e não volta a ser projetada.
    centavos: centavosDeDecimal(l.amount) - centavosDeDecimal(l.paidPrincipal),
    vencimentoKey: saoPauloParts(l.dueDate).dateKey,
    previsaoKey: l.forecastDate ? saoPauloParts(l.forecastDate).dateKey : null,
    categoryId: l.categoryId,
    contraparte: l.counterparty.name,
    descricao: [l.documentNumber, l.description].filter(Boolean).join(" · ") || null,
  }));
  const nomeDaCategoria = new Map(linhas.filter((l) => l.categoryId).map((l) => [l.categoryId!, l.category?.name ?? ""]));
  const doCliente = new Map(ligacoes.map((l) => [l.categoryId, l.clientCategory]));

  // A categoria do cliente, quando há; senão a do Omie, na linha sugerida pelo
  // nome; sem categoria, "outras" do lado da conta.
  const classificar = (t: TituloDoPrevisto): Classificacao => {
    if (!t.categoryId) return { linha: t.kind === "RECEBER" ? "outras_entradas" : "outras_saidas", item: SEM_CATEGORIA[t.kind] };
    const c = doCliente.get(t.categoryId);
    if (c) return { linha: c.line, item: c.name };
    const nome = nomeDaCategoria.get(t.categoryId) || SEM_CATEGORIA[t.kind];
    return { linha: sugerirLinha(nome, t.kind), item: nome };
  };

  return {
    hojeKey,
    titulos,
    classificar,
    regras: { diasReceber: configuracao.diasReceber, diasPagar: configuracao.diasPagar, semBanco: diasSemBanco(hojeKey) },
    configuracao,
    saldoInicial,
    nomeDaCategoria,
    dePara: ligacoes.map((l) => ({ categoria: l.category.name, cliente: l.clientCategory.name, linha: l.clientCategory.line })),
    comNomenclaturaDoCliente: ligacoes.length > 0,
    noTeto: linhas.length >= TETO_DE_CONTAS,
  };
}

export type DadosDoPrevisto = {
  previsto: Previsto;
  saldoInicial: SaldoInicial;
  configuracao: ConfiguracaoDoFluxo;
  /** A empresa tem categorias do cliente: a grade sai na nomenclatura dela. */
  comNomenclaturaDoCliente: boolean;
  noTeto: boolean;
  celula: { celula: Celula; contas: ContaDaCelula[] } | null;
};

export async function dadosDoPrevisto(p: {
  tenantId: string;
  companyId: string;
  granularidade: Granularidade;
  celula: Celula | null;
  agora?: Date;
}): Promise<DadosDoPrevisto> {
  const b = await baseDoPrevisto(p.tenantId, p.companyId, p.agora);
  const previsto = montarPrevisto({
    titulos: b.titulos,
    classificar: b.classificar,
    regras: b.regras,
    hojeKey: b.hojeKey,
    granularidade: p.granularidade,
    saldoInicial: b.saldoInicial.centavos,
  });
  return {
    previsto,
    saldoInicial: b.saldoInicial,
    configuracao: b.configuracao,
    comNomenclaturaDoCliente: b.comNomenclaturaDoCliente,
    noTeto: b.noTeto,
    celula: p.celula ? { celula: p.celula, contas: contasDaCelula(p.celula, b.titulos, b.classificar, b.regras, b.hojeKey, p.granularidade) } : null,
  };
}

// ─── O Excel ────────────────────────────────────────────────────────────────

/**
 * A base do previsto como o Excel lista: uma linha por conta, com a data de
 * caixa, e as atrasadas à parte. A mesma categoria tem de cair numa linha só
 * (o De-para do Excel é categoria → linha): a do Omie sem de-para cuja linha
 * sugerida muda com o lado ("Empréstimo" é captação ao receber e amortização ao
 * pagar) ganha o lado no nome.
 */
export function entradaDaPlanilha(b: BaseDoPrevisto, empresa: string, agora: Date = new Date()): EntradaDaPlanilha {
  const linhaDaCategoria = new Map<string, string>();
  const contas: ContaDaPlanilha[] = [];
  const atrasadas: AtrasadaDaPlanilha[] = [];
  for (const t of b.titulos) {
    if (t.centavos === 0) continue;
    const tipo = t.kind === "RECEBER" ? "A receber" : "A pagar";
    const { linha } = b.classificar(t);
    let { item } = b.classificar(t);
    const ja = linhaDaCategoria.get(item);
    if (ja && ja !== linha) item = `${item} (${tipo.toLowerCase()})`;
    const comum = {
      vencimento: t.vencimentoKey,
      tipo,
      contraparte: t.contraparte,
      documento: t.descricao ?? "",
      categoriaDoOmie: t.categoryId ? (b.nomeDaCategoria.get(t.categoryId) ?? "") : "",
      categoria: item,
      centavos: t.kind === "RECEBER" ? t.centavos : -t.centavos,
    } as const;
    if (diaPrevisto(t) < b.hojeKey) {
      atrasadas.push(comum);
      continue;
    }
    linhaDaCategoria.set(item, linha);
    contas.push({ ...comum, dataDeCaixa: dataDeCaixa(t, b.regras) });
  }
  contas.sort((x, y) => x.dataDeCaixa.localeCompare(y.dataDeCaixa));
  atrasadas.sort((x, y) => x.vencimento.localeCompare(y.vencimento));

  const omieDaCategoria = new Map<string, string[]>();
  for (const d of b.dePara) omieDaCategoria.set(d.cliente, [...(omieDaCategoria.get(d.cliente) ?? []), d.categoria]);

  const p = saoPauloParts(agora);
  return {
    empresa,
    geradoEm: `${dm(p.dateKey)}/${p.year} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`,
    hojeKey: b.hojeKey,
    regras: { diasReceber: b.regras.diasReceber, diasPagar: b.regras.diasPagar },
    contas,
    atrasadas,
    linhaDaCategoria,
    omieDaCategoria,
    saldos: b.saldoInicial.contas.map((c) => ({ conta: c.nome, centavos: c.centavos })),
    origemDoSaldo: b.saldoInicial.origem === "omie" ? "do Omie" : b.saldoInicial.origem === "conciliacao" ? "da conciliação do Connect" : null,
  };
}
