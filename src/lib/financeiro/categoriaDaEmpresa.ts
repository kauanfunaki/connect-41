// Criar categoria no plano de uma empresa — a regra num lugar só (13/10/2026).
//
// Saiu de `criarCategoriaDaEmpresa` (Fornecedores e sacados › Plano de contas)
// quando a fila do DRE passou a criar a categoria que o arquivo do Omie trazia
// e o plano da empresa não tinha. As duas portas têm de gravar igual: o mesmo
// nome limpo, a mesma recusa quando o padrão do escritório já tem o nome, o
// mesmo escopo, o mesmo registro na auditoria. Duas cópias divergiriam na
// primeira mudança de uma delas.
//
// Quem chama confere a permissão: o plano pela régua dos cadastros, a fila
// pela régua da DRE (`src/lib/dre/acesso.ts`).

import type { Prisma } from "@/generated/prisma/client";
import { chaveDaCategoria } from "@/lib/dre/calculo";
import { escopoDa, ondeDoPadrao } from "@/lib/financeiro/planoDeContas";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { logAudit } from "@/lib/audit";

/** O limite da coluna `FinanceCategory.name`. */
export const MAX_NOME_DA_CATEGORIA = 120;

/**
 * O nome como o plano o guarda: espaço repetido vira um, sem as pontas. Nulo
 * quando fica vazio ou passa do limite — cortar calado criaria uma categoria
 * que o de-para da DRE, por nome, nunca casaria com a linha de onde ela veio.
 */
export function nomeDaCategoria(valor: string): string | null {
  const nome = valor.replace(/\s+/g, " ").trim();
  return nome && nome.length <= MAX_NOME_DA_CATEGORIA ? nome : null;
}

type ComNome = { name: string; kind: string; companyId: string | null };

/**
 * A categoria com o mesmo nome, ignorando caixa, acento e espaço — a mesma
 * chave do de-para da DRE (`chaveDaCategoria`). Nula quando não há.
 *
 * Prefere a do mesmo tipo; entre as do mesmo tipo, a última da lista — quem
 * passa a lista por `padraoAntesDaEmpresa` faz a da empresa ganhar da do
 * padrão, como no de-para.
 */
export function categoriaComONome<T extends ComNome>(categorias: T[], nome: string, kind: "PAGAR" | "RECEBER"): T | null {
  const chave = chaveDaCategoria(nome);
  const iguais = categorias.filter((c) => chaveDaCategoria(c.name) === chave);
  const doTipo = iguais.filter((c) => c.kind === kind);
  return doTipo.at(-1) ?? iguais.at(-1) ?? null;
}

export type NovaCategoriaDaEmpresa = {
  tenantId: string;
  companyId: string;
  userId: string;
  /** Já passado por `nomeDaCategoria`. */
  nome: string;
  kind: "PAGAR" | "RECEBER";
  planGroup: string | null;
  /** Código do grupo do DRE já validado, ou nulo para "ainda não classificada". */
  dreGroup: string | null;
  /** De qual tela veio — fica na auditoria. */
  origem: "plano" | "dre";
};

/** Cria a categoria só da empresa. Devolve o id, ou o motivo da recusa em português. */
export async function criarCategoriaNoPlanoDaEmpresa(
  db: Prisma.TransactionClient,
  dados: NovaCategoriaDaEmpresa
): Promise<{ ok: true; id: string } | { error: string }> {
  const { tenantId, companyId, nome, kind } = dados;

  // O mesmo nome no padrão confundiria o seletor ("Salários" duas vezes) e o
  // de-para da DRE, que é por nome. Quem quer outra linha para a do padrão muda
  // a linha dela na lista, sem criar outra.
  const noPadrao = await db.financeCategory.findFirst({
    where: { ...ondeDoPadrao(tenantId), kind, name: nome },
    select: { id: true },
  });
  if (noPadrao) return { error: `"${nome}" já existe no plano padrão. Para esta empresa, mude a linha da DRE dela na lista.` };

  let id: string;
  try {
    const criada = await db.financeCategory.create({
      data: {
        tenantId,
        companyId,
        scope: escopoDa(companyId),
        name: nome,
        kind,
        planGroup: dados.planGroup,
        dreGroup: dados.dreGroup,
      },
      select: { id: true },
    });
    id = criada.id;
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: `Esta empresa já tem a categoria "${nome}".` };
    throw err;
  }

  await logAudit({
    tenantId,
    userId: dados.userId,
    action: "financeiro.categoria_da_empresa.criada",
    entityType: "FinanceCategory",
    entityId: id,
    metadata: { companyId, nome, kind, ...(dados.origem === "dre" ? { origem: "dre", dreGroup: dados.dreGroup } : {}) },
  });
  return { ok: true, id };
}
