// Leitura de licenças e taxas.

import { getPrisma } from "@/lib/prisma";
import { ordenarLicencas, contarPendentes, custoEmTaxas, type CustoDoProcesso } from "@/lib/societario/licencas";

export type LinhaDeLicenca = {
  id: string;
  companyId: string;
  empresaNome: string;
  kind: string;
  number: string | null;
  orgaoNome: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  notes: string | null;
};

/**
 * As licenças do cliente, já na ordem da fila de renovação.
 *
 * Sem paginação: uma carteira de 400 empresas com três licenças cada dá 1.200
 * linhas, que cabe. Quando não couber, o corte natural é por situação — e não
 * por página, porque a fila existe para mostrar o que vence, não para ser
 * folheada.
 */
export async function listarLicencas(
  tenantId: string,
  hoje: Date,
  companyId?: string
): Promise<LinhaDeLicenca[]> {
  const prisma = getPrisma();
  const linhas = await prisma.license.findMany({
    where: { tenantId, companyId: companyId || undefined },
    select: {
      id: true,
      companyId: true,
      kind: true,
      number: true,
      issuedAt: true,
      expiresAt: true,
      revokedAt: true,
      notes: true,
      company: { select: { name: true, tradeName: true } },
      organ: { select: { name: true, acronym: true } },
    },
  });

  return ordenarLicencas(
    linhas.map((l) => ({
      id: l.id,
      companyId: l.companyId,
      empresaNome: l.company.tradeName || l.company.name,
      kind: l.kind,
      number: l.number,
      orgaoNome: l.organ ? l.organ.acronym || l.organ.name : null,
      issuedAt: l.issuedAt,
      expiresAt: l.expiresAt,
      revokedAt: l.revokedAt,
      notes: l.notes,
    })),
    hoje
  );
}

export async function resumoDasLicencas(tenantId: string, hoje: Date) {
  const linhas = await listarLicencas(tenantId, hoje);
  return { linhas, ...contarPendentes(linhas, hoje) };
}

export type TaxaNaTela = {
  id: string;
  description: string;
  amountCents: number;
  dueDate: Date | null;
  paidAt: Date | null;
  documentUrl: string | null;
  /** A tentativa do protocolo que gerou a guia. Nulo em taxa avulsa. */
  attempt: number | null;
  orgaoNome: string | null;
};

/** As taxas de um processo, com o custo somado — inclusive o das voltas. */
export async function taxasDoProcesso(
  tenantId: string,
  processId: string
): Promise<{ taxas: TaxaNaTela[]; custo: CustoDoProcesso }> {
  const prisma = getPrisma();
  const linhas = await prisma.processFee.findMany({
    where: { tenantId, processId },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      description: true,
      amountCents: true,
      dueDate: true,
      paidAt: true,
      documentUrl: true,
      protocol: { select: { attempt: true, organ: { select: { name: true, acronym: true } } } },
    },
  });

  const taxas: TaxaNaTela[] = linhas.map((t) => ({
    id: t.id,
    description: t.description,
    amountCents: t.amountCents,
    dueDate: t.dueDate,
    paidAt: t.paidAt,
    documentUrl: t.documentUrl,
    attempt: t.protocol?.attempt ?? null,
    orgaoNome: t.protocol?.organ ? t.protocol.organ.acronym || t.protocol.organ.name : null,
  }));

  return {
    taxas,
    custo: custoEmTaxas(
      taxas.map((t) => ({ amountCents: t.amountCents, paidAt: t.paidAt, attempt: t.attempt }))
    ),
  };
}
