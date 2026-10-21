// A leitura do DRE: do banco até o resultado calculado.
//
// ─── O recorte é o pago, não o competente ───────────────────────────────────
//
// O DRE da 41 é de caixa: o que vale é a data em que o dinheiro andou. Então a
// consulta filtra por `paidAt` dentro do mês, e **ignora `competence`** — que é
// a coluna que quase todo o resto do app usa.
//
// Isso é fácil de trocar por engano, e trocar muda o número sem quebrar nada.
// Por isso o filtro está num lugar só, aqui.

import { getPrisma } from "@/lib/prisma";
import { ondeDaEmpresa, padraoAntesDaEmpresa } from "@/lib/financeiro/planoDeContas";
import { movimentosDeCaixa, baixasNoPeriodo } from "@/lib/financeiro/baixa/consultas";
import { decimalDeCentavos } from "@/lib/financeiro/manual";
import {
  calcularDre,
  impostoForaDoResultado,
  SEM_CATEGORIA,
  type LancamentoDoDre,
  type Mapeamento,
  type ResultadoDoDre,
  type ValorDaCategoria,
} from "@/lib/dre/calculo";
import { resolverCategorias, type CategoriaResolvida } from "@/lib/dre/mapeamento";
import { OPCOES_PADRAO, type ModeloDoDre, type OpcoesDoDre } from "@/lib/dre/estrutura";
import { modeloDaEmpresaOu } from "@/lib/dre/modeloDaEmpresa";
import type { MesDoAno } from "@/lib/dre/anual";

/** Primeiro instante de um mês em São Paulo, como Date UTC. */
export function inicioDoMes(ano: number, mes: number): Date {
  // São Paulo é UTC−3 o ano todo desde 2019.
  return new Date(Date.UTC(ano, mes - 1, 1, 3, 0, 0, 0));
}

export type MesDoDre = { ano: number; mes: number };

export type FonteDoDre = {
  tipo: "import" | "financeiro";
  arquivos: string[];
  importadoEm: Date | null;
};

export type DreDaEmpresa = {
  resultado: ResultadoDoDre;
  categorias: CategoriaResolvida[];
  /** Quantos lançamentos entraram na conta. Zero explica um relatório zerado. */
  lancamentos: number;
  fonte: FonteDoDre;
};

/**
 * Monta o DRE de um mês para uma empresa.
 *
 * Três consultas, e nenhuma por linha de relatório: os lançamentos pagos do
 * mês, as categorias do escritório e as exceções desta empresa.
 */
export async function dreDoMes(
  tenantId: string,
  companyId: string,
  mes: MesDoDre,
  opcoes: OpcoesDoDre = OPCOES_PADRAO
): Promise<DreDaEmpresa> {
  const { lancamentos, mapeamento, categorias, fonte, modelo } = await lancamentosDoMes(tenantId, companyId, mes, opcoes.modelo);
  return {
    // O modelo da empresa (21/10/2026), quando quem chama não disse outro.
    resultado: calcularDre(lancamentos, mapeamento, { ...opcoes, modelo }),
    categorias,
    lancamentos: lancamentos.length,
    fonte,
  };
}

/** O que entra no DRE de um mês, antes de virar relatório. */
export type LancamentosDoMes = {
  lancamentos: LancamentoDoDre[];
  mapeamento: Mapeamento;
  categorias: CategoriaResolvida[];
  fonte: FonteDoDre;
  /** O modelo com que as categorias foram resolvidas — o da empresa, se quem chamou não disse. */
  modelo: ModeloDoDre;
};

/**
 * Os lançamentos de um mês, já com a fonte escolhida (import ou financeiro).
 *
 * Separado de `dreDoMes` em 13/10/2026: a exportação no modelo do BPO precisa
 * dos lançamentos, e não só dos totais por grupo, e tem de partir da **mesma**
 * leitura da tela — mesmo recorte por `paidAt`, mesma precedência do import.
 */
export async function lancamentosDoMes(
  tenantId: string,
  companyId: string,
  mes: MesDoDre,
  modeloPedido?: ModeloDoDre
): Promise<LancamentosDoMes> {
  const prisma = getPrisma();
  const de = inicioDoMes(mes.ano, mes.mes);
  const ate = inicioDoMes(mes.mes === 12 ? mes.ano + 1 : mes.ano, mes.mes === 12 ? 1 : mes.mes + 1);

  const [entries, categorias, excecoes, importados, modelo] = await Promise.all([
    // Pago dentro do mês, das baixas (lote C, 19/10): a parcial entra no mês
    // dela, e juros, multa e desconto nas categorias deles. Lançamento sem
    // baixa não entra num DRE de caixa — ainda não moveu dinheiro.
    movimentosDeCaixa(baixasNoPeriodo({ tenantId, companyId }, de, ate)).then((ms) =>
      ms.map((m) => ({ kind: m.kind, amount: decimalDeCentavos(m.centavos), categoryId: m.categoryId }))
    ),
    prisma.financeCategory.findMany({
      where: ondeDaEmpresa(tenantId, companyId, { apenasAtivas: false, incluirOcultas: true }),
      select: { id: true, name: true, dreGroup: true, companyId: true },
    }),
    prisma.dreCategoryMapping.findMany({
      where: { tenantId, companyId },
      select: { categoryId: true, grupo: true },
    }),
    prisma.dreImport.findMany({
      where: { tenantId, companyId, ano: mes.ano, mes: mes.mes },
      select: {
        origem: true,
        arquivo: true,
        createdAt: true,
        linhas: { select: { categoria: true, valorCentavos: true } },
      },
    }),
    modeloDaEmpresaOu(tenantId, companyId, modeloPedido),
  ]);

  const resolvidas = resolverCategorias(
    padraoAntesDaEmpresa(categorias).map((c) => ({ id: c.id, nome: c.name, dreGroup: c.dreGroup })),
    excecoes,
    modelo
  );

  const nomePorId = new Map(resolvidas.map((c) => [c.id, c.nome]));
  // O casamento é por **nome**, e não por id, porque é o que permite o mesmo
  // cálculo rodar sobre um export de planilha, que não tem id nenhum.
  const mapeamento = mapeamentoDe(resolvidas);

  // ─── A fonte: import quando existe, financeiro quando não ────────────────
  //
  // Um relatório que muda de origem sem avisar é um relatório em que ninguém
  // confia duas vezes, então a escolha é explícita e sai no retorno.
  if (importados.length > 0) {
    const lancamentosImportados: LancamentoDoDre[] = importados.flatMap((imp) =>
      imp.linhas.map((l) => ({
        categoria: l.categoria,
        valorCentavos: l.valorCentavos,
        origem: imp.origem === "PAGAMENTO" ? ("pagamento" as const) : ("recebimento" as const),
      }))
    );
    return {
      lancamentos: lancamentosImportados,
      mapeamento,
      categorias: resolvidas,
      modelo,
      fonte: {
        tipo: "import",
        arquivos: importados.map((i) => i.arquivo),
        importadoEm: importados.reduce<Date | null>(
          (a, i) => (a === null || i.createdAt > a ? i.createdAt : a),
          null
        ),
      },
    };
  }

  const lancamentos: LancamentoDoDre[] = entries.map((e) => {
    const nome = e.categoryId ? nomePorId.get(e.categoryId) ?? null : null;
    return {
      categoria: nome,
      // `Decimal` para centavos pela string, nunca por float — a regra do
      // projeto inteiro, e aqui ela vale duas vezes: é o número do relatório.
      valorCentavos: centavosDeDecimal(e.amount) * (e.kind === "PAGAR" ? -1 : 1),
      origem: e.kind === "PAGAR" ? "pagamento" : "recebimento",
    };
  });

  return {
    lancamentos,
    mapeamento,
    categorias: resolvidas,
    modelo,
    fonte: { tipo: "financeiro", arquivos: [], importadoEm: null },
  };
}

/** O mapa de categoria→grupo que `calcularDre` consome. */
function mapeamentoDe(resolvidas: CategoriaResolvida[]): Mapeamento {
  const m: Mapeamento = new Map();
  for (const c of resolvidas) if (c.grupo) m.set(chaveSimples(c.nome), c.grupo);
  return m;
}

/** A mesma normalização de `chaveDaCategoria`, para o mapa bater. */
function chaveSimples(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * `Decimal` do Prisma para centavos inteiros, pela string.
 *
 * `Number(decimal)` passa por float e é onde o centavo se perde. Mesma função
 * que `src/lib/financeiro/contas.ts` usa, repetida aqui de propósito: importar
 * o financeiro para dentro do DRE criaria dependência entre dois módulos que
 * só compartilham uma regra de três linhas.
 */
export function centavosDeDecimal(valor: { toString(): string }): number {
  const [inteiro, decimais = ""] = valor.toString().split(".");
  const negativo = inteiro!.startsWith("-");
  const i = BigInt(inteiro!.replace("-", "") || "0");
  const c = BigInt((decimais + "00").slice(0, 2));
  const total = Number(i) * 100 + Number(c);
  return negativo ? -total : total;
}

/**
 * Os meses que têm alguma coisa — das duas fontes.
 *
 * Olhar só o financeiro esconderia o mês que existe apenas como import, que é
 * justamente o caso de quem ainda monta o DRE fora do Connect. Mais recente
 * primeiro.
 */
export async function mesesComMovimento(tenantId: string, companyId: string): Promise<MesDoDre[]> {
  const prisma = getPrisma();
  const [pagos, imports] = await Promise.all([
    prisma.financeEntryPayment.findMany({
      where: { tenantId, companyId, entry: { status: { not: "CANCELADO" } } },
      select: { paidAt: true },
      orderBy: { paidAt: "desc" },
      take: 5_000,
    }),
    prisma.dreImport.findMany({
      where: { tenantId, companyId },
      select: { ano: true, mes: true },
    }),
  ]);

  const vistos = new Set<string>();
  const meses: MesDoDre[] = [];
  const somar = (ano: number, mes: number) => {
    const chave = `${ano}-${mes}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    meses.push({ ano, mes });
  };

  for (const l of pagos) {
    const { ano, mes } = mesEmSaoPaulo(l.paidAt!);
    somar(ano, mes);
  }
  for (const i of imports) somar(i.ano, i.mes);

  return meses.sort((a, b) => b.ano - a.ano || b.mes - a.mes);
}

function mesEmSaoPaulo(d: Date): MesDoDre {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  return {
    ano: Number(p.find((x) => x.type === "year")!.value),
    mes: Number(p.find((x) => x.type === "month")!.value),
  };
}

/**
 * O ano inteiro, mês a mês.
 *
 * Doze chamadas a `dreDoMes` seriam trinta e seis consultas. Aqui são quatro,
 * e o agrupamento por mês acontece em memória — que é onde ele custa nada.
 */
export async function dreDoAnoDaEmpresa(
  tenantId: string,
  companyId: string,
  ano: number,
  opcoes: OpcoesDoDre = OPCOES_PADRAO
): Promise<{
  meses: MesDoAno[];
  categorias: CategoriaResolvida[];
  /**
   * O que ficou sem grupo no ano inteiro, somado por categoria.
   *
   * A visão mensal já mostrava isto; a anual não, e era onde ele mais se
   * escondia — uma categoria que some R$ 200 por mês some R$ 2.400 no ano, e
   * doze avisos pequenos passam despercebidos onde um grande não passaria.
   */
  naoClassificado: ValorDaCategoria[];
  /** O desconsiderado do ano, somado por categoria — o resumo da tela (13/10/2026). */
  desconsiderado: ValorDaCategoria[];
  /**
   * De que fonte veio o "(sem categoria)" do ano (13/10/2026). O ano mistura
   * meses importados e meses do financeiro, e o que dizer na fila muda: linha
   * do Omie sem categoria se corrige no Omie; conta sem categoria, na origem
   * dela. Vazio quando não houve nada sem categoria.
   */
  fontesDoSemCategoria: FonteDoDre["tipo"][];
  /** Algum mês do ano saiu de arquivo importado — só aí a fila pode criar categoria do arquivo. */
  temMesImportado: boolean;
  /** Impostos do ano que não entram no resultado. Zero quando a opção muda. */
  impostoForaDoResultado: number;
  /** O modelo do ano — o da empresa, se quem chamou não disse. */
  modelo: ModeloDoDre;
}> {
  const { porMes, mapeamento, categorias, mesesImportados, modelo } = await lancamentosDoAno(tenantId, companyId, ano, opcoes.modelo);
  const opc: OpcoesDoDre = { ...opcoes, modelo };

  const meses: MesDoAno[] = [];
  // Somado no laço, e não num segundo passe: os mesmos doze cálculos já
  // devolvem tudo que a tela precisa.
  const soltosNoAno = new Map<string, { centavos: number; origem: "recebimento" | "pagamento" }>();
  const desconsideradosNoAno = new Map<string, { centavos: number; origem: "recebimento" | "pagamento" }>();
  const fontesDoSemCategoria = new Set<FonteDoDre["tipo"]>();
  let impostos = 0;

  for (let mes = 1; mes <= 12; mes++) {
    const lista = porMes.get(mes) ?? [];
    const r = calcularDre(lista, mapeamento, opc);
    meses.push({ mes, porGrupo: r.porGrupo, temMovimento: lista.length > 0, porCategoria: r.porCategoria });
    impostos += impostoForaDoResultado(r, opc);
    somarNoAno(soltosNoAno, r.naoClassificado);
    somarNoAno(desconsideradosNoAno, r.desconsiderado);
    if (r.naoClassificado.some((n) => n.categoria === SEM_CATEGORIA)) {
      fontesDoSemCategoria.add(mesesImportados.has(mes) ? "import" : "financeiro");
    }
  }

  return {
    meses,
    categorias,
    naoClassificado: doMaiorParaOMenor(soltosNoAno),
    desconsiderado: doMaiorParaOMenor(desconsideradosNoAno),
    fontesDoSemCategoria: [...fontesDoSemCategoria],
    temMesImportado: mesesImportados.size > 0,
    impostoForaDoResultado: impostos,
    modelo,
  };
}

function somarNoAno(
  noAno: Map<string, { centavos: number; origem: "recebimento" | "pagamento" }>,
  doMes: ValorDaCategoria[]
): void {
  for (const n of doMes) {
    const atual = noAno.get(n.categoria);
    noAno.set(n.categoria, { centavos: (atual?.centavos ?? 0) + n.centavos, origem: n.origem });
  }
}

function doMaiorParaOMenor(mapa: Map<string, { centavos: number; origem: "recebimento" | "pagamento" }>): ValorDaCategoria[] {
  return [...mapa.entries()]
    .map(([categoria, v]) => ({ categoria, centavos: v.centavos, origem: v.origem }))
    .sort((a, b) => Math.abs(b.centavos) - Math.abs(a.centavos));
}

/** O que entra no DRE de um ano, mês a mês, antes de virar relatório. */
export type LancamentosDoAno = {
  /** Mês (1 a 12) para os lançamentos dele. Mês sem nada não tem chave. */
  porMes: Map<number, LancamentoDoDre[]>;
  mapeamento: Mapeamento;
  categorias: CategoriaResolvida[];
  /** Os meses que saíram do arquivo importado, e não do financeiro. */
  mesesImportados: Set<number>;
  /** O modelo com que as categorias foram resolvidas. */
  modelo: ModeloDoDre;
};

/**
 * Os lançamentos do ano, já separados por mês e com a fonte de cada mês
 * escolhida.
 *
 * Separado de `dreDoAnoDaEmpresa` em 13/10/2026, pelo mesmo motivo de
 * `lancamentosDoMes`: a exportação no modelo do BPO parte daqui.
 */
export async function lancamentosDoAno(
  tenantId: string,
  companyId: string,
  ano: number,
  modeloPedido?: ModeloDoDre
): Promise<LancamentosDoAno> {
  const prisma = getPrisma();
  const de = inicioDoMes(ano, 1);
  const ate = inicioDoMes(ano + 1, 1);

  const [entries, categorias, excecoes, imports, modelo] = await Promise.all([
    movimentosDeCaixa(baixasNoPeriodo({ tenantId, companyId }, de, ate)).then((ms) =>
      ms.map((m) => ({ kind: m.kind, amount: decimalDeCentavos(m.centavos), categoryId: m.categoryId, paidAt: m.paidAt }))
    ),
    prisma.financeCategory.findMany({
      where: ondeDaEmpresa(tenantId, companyId, { apenasAtivas: false, incluirOcultas: true }),
      select: { id: true, name: true, dreGroup: true, companyId: true },
    }),
    prisma.dreCategoryMapping.findMany({
      where: { tenantId, companyId },
      select: { categoryId: true, grupo: true },
    }),
    prisma.dreImport.findMany({
      where: { tenantId, companyId, ano },
      select: { mes: true, origem: true, linhas: { select: { categoria: true, valorCentavos: true } } },
    }),
    modeloDaEmpresaOu(tenantId, companyId, modeloPedido),
  ]);

  const resolvidas = resolverCategorias(
    padraoAntesDaEmpresa(categorias).map((c) => ({ id: c.id, nome: c.name, dreGroup: c.dreGroup })),
    excecoes,
    modelo
  );
  const mapeamento = mapeamentoDe(resolvidas);
  const nomePorId = new Map(resolvidas.map((c) => [c.id, c.nome]));

  const porMes = new Map<number, LancamentoDoDre[]>();
  const mesImportado = new Set(imports.map((i) => i.mes));

  for (const i of imports) {
    const lista = porMes.get(i.mes) ?? [];
    for (const l of i.linhas) {
      lista.push({
        categoria: l.categoria,
        valorCentavos: l.valorCentavos,
        origem: i.origem === "PAGAMENTO" ? "pagamento" : "recebimento",
      });
    }
    porMes.set(i.mes, lista);
  }

  for (const e of entries) {
    const { mes } = mesEmSaoPaulo(e.paidAt!);
    // Mês importado ignora o financeiro inteiro — a mesma precedência de
    // `dreDoMes`. Misturar as duas fontes no mesmo mês contaria duas vezes o
    // que já foi migrado.
    if (mesImportado.has(mes)) continue;
    const lista = porMes.get(mes) ?? [];
    lista.push({
      categoria: e.categoryId ? nomePorId.get(e.categoryId) ?? null : null,
      valorCentavos: centavosDeDecimal(e.amount) * (e.kind === "PAGAR" ? -1 : 1),
      origem: e.kind === "PAGAR" ? "pagamento" : "recebimento",
    });
    porMes.set(mes, lista);
  }

  return { porMes, mapeamento, categorias: resolvidas, mesesImportados: mesImportado, modelo };
}
