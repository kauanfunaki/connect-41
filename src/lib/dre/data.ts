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
import { calcularDre, type LancamentoDoDre, type Mapeamento, type ResultadoDoDre } from "@/lib/dre/calculo";
import { resolverCategorias, type CategoriaResolvida } from "@/lib/dre/mapeamento";
import { OPCOES_PADRAO, type OpcoesDoDre } from "@/lib/dre/estrutura";
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
  const prisma = getPrisma();
  const de = inicioDoMes(mes.ano, mes.mes);
  const ate = inicioDoMes(mes.mes === 12 ? mes.ano + 1 : mes.ano, mes.mes === 12 ? 1 : mes.mes + 1);

  const [entries, categorias, excecoes, importados] = await Promise.all([
    prisma.financeEntry.findMany({
      where: {
        tenantId,
        companyId,
        // Pago dentro do mês. Lançamento em aberto não entra num DRE de caixa —
        // ele ainda não moveu dinheiro.
        paidAt: { gte: de, lt: ate },
      },
      select: { kind: true, amount: true, categoryId: true },
    }),
    prisma.financeCategory.findMany({
      where: { tenantId },
      select: { id: true, name: true, dreGroup: true },
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
  ]);

  const resolvidas = resolverCategorias(
    categorias.map((c) => ({ id: c.id, nome: c.name, dreGroup: c.dreGroup })),
    excecoes
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
      resultado: calcularDre(lancamentosImportados, mapeamentoDe(resolvidas), opcoes),
      categorias: resolvidas,
      lancamentos: lancamentosImportados.length,
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
    resultado: calcularDre(lancamentos, mapeamento, opcoes),
    categorias: resolvidas,
    lancamentos: lancamentos.length,
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
    prisma.financeEntry.findMany({
      where: { tenantId, companyId, paidAt: { not: null } },
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
): Promise<{ meses: MesDoAno[]; categorias: CategoriaResolvida[] }> {
  const prisma = getPrisma();
  const de = inicioDoMes(ano, 1);
  const ate = inicioDoMes(ano + 1, 1);

  const [entries, categorias, excecoes, imports] = await Promise.all([
    prisma.financeEntry.findMany({
      where: { tenantId, companyId, paidAt: { gte: de, lt: ate } },
      select: { kind: true, amount: true, categoryId: true, paidAt: true },
    }),
    prisma.financeCategory.findMany({
      where: { tenantId },
      select: { id: true, name: true, dreGroup: true },
    }),
    prisma.dreCategoryMapping.findMany({
      where: { tenantId, companyId },
      select: { categoryId: true, grupo: true },
    }),
    prisma.dreImport.findMany({
      where: { tenantId, companyId, ano },
      select: { mes: true, origem: true, linhas: { select: { categoria: true, valorCentavos: true } } },
    }),
  ]);

  const resolvidas = resolverCategorias(
    categorias.map((c) => ({ id: c.id, nome: c.name, dreGroup: c.dreGroup })),
    excecoes
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

  const meses: MesDoAno[] = [];
  for (let mes = 1; mes <= 12; mes++) {
    const lista = porMes.get(mes) ?? [];
    meses.push({
      mes,
      porGrupo: calcularDre(lista, mapeamento, opcoes).porGrupo,
      temMovimento: lista.length > 0,
    });
  }

  return { meses, categorias: resolvidas };
}
