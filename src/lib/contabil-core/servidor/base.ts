import "server-only";

// O que todo serviço do Contábil Core usa (Fase 2, 09/11/2026).
//
// Regra de isolamento: todo serviço recebe o `tenantId` do contexto e o id da empresa do Contábil
// Core vindo da tela, e começa por `empresaDoTenant`. Um id que não é do tenant some aqui, com a mesma
// resposta de "não existe" — a tela nunca descobre se o registro é de outro escritório.

import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { dec, fixo, centavosDoBanco, deCentavos, type Dec } from "../motor/decimal";

export type Resultado<T = object> = { ok: true; valor: T } | { ok: false; erro: string };
export const ok = <T>(valor: T): Resultado<T> => ({ ok: true, valor });
export const falha = <T = never>(erro: string): Resultado<T> => ({ ok: false, erro });

export const NAO_ENCONTRADA = "Empresa não encontrada no Contábil Core.";

export type EmpresaDoCore = { id: string; tenantId: string; companyId: string; cnpj: string; razaoSocial: string };

/** A empresa do Contábil Core, se for deste tenant e estiver viva. */
export async function empresaDoTenant(tenantId: string, empresaId: string): Promise<EmpresaDoCore | null> {
  if (!tenantId || !empresaId) return null;
  return getPrisma().coreEmpresa.findFirst({
    where: { id: empresaId, tenantId, deletedAt: null },
    select: { id: true, tenantId: true, companyId: true, cnpj: true, razaoSocial: true },
  });
}

/** Violação de chave única (P2002): a coluna de unicidade de `chaves.ts` recusou o duplicado. */
export function ehDuplicado(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** Chave estrangeira recusou (P2003): o registro ainda é usado por outro. */
export function ehEmUso(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003";
}

// ─── Dinheiro e datas ─────────────────────────────────────────────────────

/** `Decimal(15,2)` do banco → Dec do motor (exato). */
export function decDoBanco(v: Prisma.Decimal | string | number): Dec {
  return dec(typeof v === "number" ? String(v) : v.toString());
}

/** Dec → texto para gravar em `Decimal(15,2)`, arredondando como o banco (meio para longe do zero). */
export function paraBanco(d: Dec): string {
  return fixo(deCentavos(centavosDoBanco(d)), 2);
}

/** `@db.Date` (meia-noite UTC) → "AAAA-MM-DD". */
export function dia(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "AAAA-MM-DD" → Date à meia-noite UTC, para `@db.Date`. */
export function dataDoDia(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Primeiro e último dia de uma competência "AAAA-MM", como datas UTC. */
export function limitesDoMes(mes: string): { inicio: Date; fim: Date } {
  const [a, m] = mes.split("-").map(Number);
  return { inicio: new Date(Date.UTC(a, m - 1, 1)), fim: new Date(Date.UTC(a, m, 0)) };
}
