// Um banco de mentira para os testes da trava do portal (21/10/2026).
//
// Os testes de consulta do repositório conferem o `where` que a função monta.
// Para provar que um acesso do portal nunca lê empresa de outro cliente, isso
// não basta: o defeito da consulta das notas era justamente um `where` com
// cara de certo (o filtro sobrescrevia o alcance). Aqui o `where` é APLICADO a
// linhas de dois clientes e de outro escritório, com a semântica do Prisma
// para os operadores que as consultas usam — e operador desconhecido derruba
// o teste, para ele nunca passar por não entender o filtro.
//
// Só para testes: nada do app importa este arquivo.

type Linha = Record<string, unknown>;
type Where = Record<string, unknown>;

const OPERADORES = new Set(["equals", "in", "notIn", "not", "lt", "lte", "gt", "gte", "contains", "startsWith", "endsWith", "mode"]);

function comparavel(v: unknown): unknown {
  return v instanceof Date ? v.getTime() : v;
}

function ehObjetoSimples(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !(v instanceof Date) && !Array.isArray(v);
}

function casaCampo(valor: unknown, filtro: unknown): boolean {
  if (!ehObjetoSimples(filtro)) return comparavel(valor) === comparavel(filtro);
  const chaves = Object.keys(filtro);
  // Objeto sem operador: filtro de relação (`entry: { ... }`, `company: { ... }`).
  if (chaves.every((k) => !OPERADORES.has(k))) {
    if (!ehObjetoSimples(valor)) return false;
    return casaWhere(valor, filtro);
  }
  for (const [op, alvo] of Object.entries(filtro)) {
    const v = comparavel(valor);
    const a = comparavel(alvo);
    switch (op) {
      case "equals":
        if (v !== a) return false;
        break;
      case "in":
        if (!(alvo as unknown[]).map(comparavel).includes(v)) return false;
        break;
      case "notIn":
        if ((alvo as unknown[]).map(comparavel).includes(v)) return false;
        break;
      case "not":
        if (ehObjetoSimples(alvo) ? casaCampo(valor, alvo) : v === a) return false;
        break;
      case "lt":
        if (!(v !== null && (v as number) < (a as number))) return false;
        break;
      case "lte":
        if (!(v !== null && (v as number) <= (a as number))) return false;
        break;
      case "gt":
        if (!(v !== null && (v as number) > (a as number))) return false;
        break;
      case "gte":
        if (!(v !== null && (v as number) >= (a as number))) return false;
        break;
      case "contains":
        if (typeof v !== "string" || !v.toLowerCase().includes(String(a).toLowerCase())) return false;
        break;
      case "startsWith":
        if (typeof v !== "string" || !v.toLowerCase().startsWith(String(a).toLowerCase())) return false;
        break;
      case "endsWith":
        if (typeof v !== "string" || !v.toLowerCase().endsWith(String(a).toLowerCase())) return false;
        break;
      case "mode":
        break;
      default:
        throw new Error(`banco de teste: operador desconhecido "${op}"`);
    }
  }
  return true;
}

/** A linha casa com o `where`? Semântica do Prisma: chaves em AND; AND/OR/NOT; relação por objeto. */
export function casaWhere(linha: Linha, where: Where | undefined): boolean {
  if (!where) return true;
  for (const [chave, filtro] of Object.entries(where)) {
    if (filtro === undefined) continue;
    if (chave === "AND") {
      const lista = Array.isArray(filtro) ? filtro : [filtro];
      if (!lista.every((w) => casaWhere(linha, w as Where))) return false;
    } else if (chave === "OR") {
      if (!(filtro as Where[]).some((w) => casaWhere(linha, w))) return false;
    } else if (chave === "NOT") {
      const lista = Array.isArray(filtro) ? filtro : [filtro];
      if (lista.some((w) => casaWhere(linha, w as Where))) return false;
    } else if (!(chave in linha)) {
      throw new Error(`banco de teste: a linha não tem o campo "${chave}" — acrescente-o às linhas do teste`);
    } else if (!casaCampo(linha[chave], filtro)) {
      return false;
    }
  }
  return true;
}

export type Leitura = { modelo: string; metodo: string; where: Where | undefined; casadas: Linha[] };

/**
 * Um `getPrisma()` de mentira sobre as tabelas dadas. Toda leitura aplica o
 * `where` às linhas e fica registrada em `leituras`, com as linhas que casaram
 * — é nelas que o teste confere que só há empresa do acesso.
 *
 * `$queryRaw` (as competências das notas, por empresa) registra os valores
 * interpolados como `where: { valores }`, para o teste conferir as empresas.
 */
export function bancoDeTeste(tabelas: Record<string, Linha[]>) {
  const leituras: Leitura[] = [];
  const ler = (modelo: string, metodo: string, where: Where | undefined) => {
    const casadas = (tabelas[modelo] ?? []).filter((l) => casaWhere(l, where));
    leituras.push({ modelo, metodo, where, casadas });
    return casadas;
  };
  const modelo = (nome: string) => ({
    findMany: async (a: { where?: Where; skip?: number; take?: number } = {}) => {
      const linhas = ler(nome, "findMany", a.where);
      return linhas.slice(a.skip ?? 0, a.take === undefined ? undefined : (a.skip ?? 0) + a.take);
    },
    findFirst: async (a: { where?: Where } = {}) => ler(nome, "findFirst", a.where)[0] ?? null,
    count: async (a: { where?: Where } = {}) => ler(nome, "count", a.where).length,
    aggregate: async (a: { where?: Where }) => {
      ler(nome, "aggregate", a.where);
      return { _sum: { amount: null, paidPrincipal: null }, _min: { paidAt: null }, _count: { _all: 0 } };
    },
    groupBy: async (a: { by: string[]; where?: Where }) => {
      const grupos = new Map<string, Linha & { _count: { _all: number } }>();
      for (const l of ler(nome, "groupBy", a.where)) {
        const chave = JSON.stringify(a.by.map((k) => l[k]));
        const g = grupos.get(chave) ?? { ...Object.fromEntries(a.by.map((k) => [k, l[k]])), _count: { _all: 0 } };
        g._count._all += 1;
        grupos.set(chave, g);
      }
      return [...grupos.values()];
    },
  });
  const prisma = new Proxy({} as Record<string, unknown>, {
    get(_, prop: string) {
      if (prop === "$queryRaw") {
        return async (_partes: TemplateStringsArray, ...valores: unknown[]) => {
          leituras.push({ modelo: "$queryRaw", metodo: "$queryRaw", where: { valores }, casadas: [] });
          return [];
        };
      }
      if (prop === "then") return undefined;
      return modelo(prop);
    },
  });
  return { prisma, leituras };
}
