// O que os três serviços de exclusão (empresa, pessoa, usuário) têm em comum:
// quem pode, a contagem das ligações para a prévia, o plano em passos e o
// registro que sobrevive à exclusão.

import type { Prisma } from "@/generated/prisma/client";
import type { UserRole } from "@/generated/prisma/enums";
import { isPrismaForeignKeyError, isPrismaUniqueError } from "@/lib/prismaErrors";
import { contagem, type Ligacao, type Rotulo, type Tratamento } from "./registro";
import { isFullWrite } from "@/lib/auth/papeis";
import { confirmacaoConfere } from "@/lib/exclusaoConfirmada";
import type { Efeito, ItemDaPrevia, ModoDaExclusao, Previa } from "./tipos";

export type Tx = Prisma.TransactionClient;

/**
 * O papel de quem pede, conferido de novo dentro do serviço (a tela e a action
 * já passaram por `podeExcluir`, de src/lib/auth/papeis.ts, que olha também a
 * assinatura): só ADMIN e SUPER_ADMIN, decisão do Kauan de 13/10/2026.
 */
export function papelExclui(role: UserRole | string | null | undefined): boolean {
  return !!role && isFullWrite(role as UserRole);
}
export const ASSINATURA_SOMENTE_LEITURA = "Com a assinatura em modo somente leitura, nada pode ser excluído.";

/** Recusa de regra: a mensagem vai para a tela e a transação desfaz tudo. */
export class Recusa extends Error {}

/**
 * A transação da exclusão. Generosa de propósito: uma empresa de teste pode
 * levar dezenas de tabelas, e cortar no meio desfaz tudo — o que é seguro, mas
 * frustra. O teto de 2.000 notas fiscais (`empresa.ts`) segura o tamanho.
 */
export const OPCOES_DA_TRANSACAO = { maxWait: 15_000, timeout: 300_000 } as const;

// ─── Contagem das ligações ──────────────────────────────────────────────────

type Contavel = { count: (args: { where: Record<string, unknown> }) => Promise<number> };

/** O delegate do Prisma de um model pelo nome do schema ("FiscalDocument" → `db.fiscalDocument`). */
export function delegado(db: Tx, modelo: string): Contavel {
  const nome = modelo.charAt(0).toLowerCase() + modelo.slice(1);
  const d = (db as unknown as Record<string, Contavel | undefined>)[nome];
  if (!d || typeof d.count !== "function") throw new Error(`Model sem delegate no Prisma: ${modelo}`);
  return d;
}

/**
 * Várias consultas de uma vez. Fora da transação, em paralelo — o pool tem
 * várias conexões. Dentro, uma de cada vez: a transação é uma conexão só, e
 * não há prova neste código de consulta paralela dentro de `$transaction`.
 * (O cliente da transação é o único sem `$transaction`.)
 */
export async function juntos<T extends readonly unknown[] | []>(
  db: Tx,
  consultas: { [K in keyof T]: () => Promise<T[K]> }
): Promise<T> {
  const lista = consultas as unknown as readonly (() => Promise<unknown>)[];
  if ("$transaction" in (db as object)) return (await Promise.all(lista.map((c) => c()))) as unknown as T;
  const saida: unknown[] = [];
  for (const c of lista) saida.push(await c());
  return saida as unknown as T;
}

export type Contagem = { ligacao: Ligacao; quantidade: number };

/**
 * Conta cada ligação do registro pela coluna da chave. O filtro é o id já
 * conferido no tenant (ou a lista deles): a linha que aponta para ele é do
 * mesmo escritório por construção.
 */
export async function contarLigacoes(
  db: Tx,
  ligacoes: readonly Ligacao[],
  alvo: string | { in: string[] }
): Promise<Contagem[]> {
  if (typeof alvo !== "string" && alvo.in.length === 0) return ligacoes.map((ligacao) => ({ ligacao, quantidade: 0 }));
  return juntos(
    db,
    ligacoes.map((ligacao) => async () => ({
      ligacao,
      quantidade: await delegado(db, ligacao.modelo).count({ where: { [ligacao.fk]: alvo } }),
    }))
  );
}

const EFEITO: Record<Tratamento, Efeito> = {
  apagar: "apagar",
  cascata: "apagar",
  desligar: "desligar",
  reatribuir: "reatribuir",
};

/** O item da prévia, ou `null` quando não há o que mostrar. */
export function item(chave: string, quantidade: number, rotulo: Rotulo, efeito: Efeito, historico = false): ItemDaPrevia | null {
  if (quantidade <= 0) return null;
  return { chave, texto: contagem(quantidade, rotulo), quantidade, efeito, historico };
}

/** As ligações com rótulo e quantidade, prontas para a prévia. */
export function itensDasContagens(contagens: Contagem[]): ItemDaPrevia[] {
  return contagens.flatMap(({ ligacao, quantidade }) => {
    if (!ligacao.rotulo) return [];
    const i = item(`${ligacao.modelo}.${ligacao.fk}`, quantidade, ligacao.rotulo, EFEITO[ligacao.tratamento], !!ligacao.historico);
    return i ? [i] : [];
  });
}

/** Soma das ligações sem rótulo de um tratamento — a linha "outros registros". */
export function somaSemRotulo(contagens: Contagem[], tratamento: Tratamento): number {
  return contagens
    .filter((c) => !c.ligacao.rotulo && c.ligacao.tratamento === tratamento)
    .reduce((s, c) => s + c.quantidade, 0);
}

export function compactar<T>(lista: (T | null | undefined | false)[]): T[] {
  return lista.filter((x): x is T => !!x);
}

// ─── Plano ──────────────────────────────────────────────────────────────────

/**
 * Um passo da exclusão, na ordem em que roda. `modelo`, `acao` e `coluna` são
 * a descrição que o teste confere contra o schema (a ordem respeita as chaves
 * estrangeiras; toda ligação `apagar` do registro tem o seu passo); `executar`
 * é o que roda de fato, dentro da transação, e devolve quantas linhas mexeu.
 */
export type Passo<A> = {
  modelo: string;
  acao: "apagar" | "anular" | "reatribuir";
  /** Em `anular` e `reatribuir`, a coluna mexida. */
  coluna?: string;
  executar: (tx: Tx, alvo: A) => Promise<number>;
};

/** `deleteMany`/`updateMany` devolvem `{ count }`; o passo devolve o número. */
export async function n(p: Promise<{ count: number }>): Promise<number> {
  return (await p).count;
}

/** Roda o plano em ordem. Devolve o que mexeu, por model — vai para o registro da exclusão. */
export async function executarPlano<A>(tx: Tx, plano: readonly Passo<A>[], alvo: A): Promise<Record<string, number>> {
  const mexido: Record<string, number> = {};
  for (const passo of plano) {
    const qtd = await passo.executar(tx, alvo);
    if (qtd > 0) {
      const chave = passo.acao === "apagar" ? passo.modelo : `${passo.modelo}.${passo.coluna}:${passo.acao}`;
      mexido[chave] = (mexido[chave] ?? 0) + qtd;
    }
  }
  return mexido;
}

// ─── Registro que sobrevive ─────────────────────────────────────────────────

/**
 * A linha da auditoria da exclusão, gravada na mesma transação: se ela falha,
 * nada sai. Não aponta para o cadastro por chave — `entityType`/`entityId` são
 * texto —, e leva o retrato do que existia (nome, documento, o que saiu junto).
 */
export async function registrarExclusao(
  tx: Tx,
  dados: {
    tenantId: string;
    ator: { id: string; nome: string | null };
    acao: "company.delete" | "person.delete" | "user.delete";
    entityType: "Company" | "Person" | "User";
    entityId: string;
    metadata: Prisma.InputJsonValue;
  }
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: dados.tenantId,
      userId: dados.ator.id,
      actorName: dados.ator.nome,
      action: dados.acao,
      entityType: dados.entityType,
      entityId: dados.entityId,
      metadata: dados.metadata,
    },
  });
}

/** O nome de quem exclui, para o registro. */
export async function nomeDoAtor(db: Tx, id: string): Promise<string | null> {
  return (await db.user.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
}

// ─── Os dois modos ──────────────────────────────────────────────────────────

/**
 * A regra dos dois modos, igual para os três cadastros:
 * - com bloqueio, não exclui;
 * - com histórico, só no modo completo, e com o nome digitado;
 * - no modo completo, o nome digitado tem de conferir sempre.
 */
export function validarModo(previa: Previa, modo: ModoDaExclusao, confirmacao: string | undefined, opcaoTrazHistorico = false): void {
  if (previa.bloqueio) throw new Recusa(previa.bloqueio);
  const exigeNome = previa.temHistorico || opcaoTrazHistorico;
  if (exigeNome && modo !== "completo") {
    throw new Recusa("Este cadastro tem histórico ligado. Para excluir, confira a lista e digite o nome para confirmar.");
  }
  if (modo === "completo" && !confirmacaoConfere(confirmacao ?? "", [previa.nome])) {
    throw new Recusa("O nome digitado não confere. Nada foi apagado.");
  }
}

// ─── Erro para a tela ───────────────────────────────────────────────────────

export function mensagemDeErro(err: unknown, contexto: string): string {
  if (err instanceof Recusa) return err.message;
  if (isPrismaForeignKeyError(err)) {
    console.error(`[exclusao:${contexto}] chave estrangeira`, err);
    return "O banco recusou a exclusão: apareceu uma ligação que esta tela ainda não sabe tratar. Nada foi apagado. Avise a 41 Tech.";
  }
  if (isPrismaUniqueError(err)) {
    console.error(`[exclusao:${contexto}] duplicidade`, err);
    return "O banco recusou a exclusão por um registro repetido. Nada foi apagado. Avise a 41 Tech.";
  }
  console.error(`[exclusao:${contexto}]`, err);
  return "Não foi possível excluir. Nada foi apagado — tente de novo.";
}
