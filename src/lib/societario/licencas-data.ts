// Leitura de licenças e taxas.

import { getPrisma } from "@/lib/prisma";
import { ordenarLicencas, contarPendentes, custoEmTaxas, type CustoDoProcesso } from "@/lib/societario/licencas";
import {
  ehTaxaDoBombeiros,
  arquivarTaxaDeBombeiros,
  contatosDaEmpresa,
  destinatarios,
} from "@/lib/societario/arquivamento";
import { caminhoDaGuia } from "@/lib/societario/guias";

export type LinhaDeLicenca = {
  id: string;
  companyId: string;
  empresaNome: string;
  kind: string;
  number: string | null;
  organId: string | null;
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
      organId: true,
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
      organId: l.organId,
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

/**
 * O que a tela mostra **antes** de enviar a guia ao cliente.
 *
 * Calculado no servidor com as mesmas funções que a action usa, para a prévia
 * e o envio não discordarem: "vai para 2 de 3" na tela e três e-mails saindo
 * seria a confirmação mentindo.
 */
export type EnvioDaTaxa = {
  caminho: string;
  para: string[];
  descartados: { rotulo: string; motivo: string }[];
  /** Já existe guia guardada deste armazenamento. Não confere o disco. */
  temGuia: boolean;
};

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
  /** Prévia do envio ao cliente. Só a taxa do Bombeiros tem — ver `ehTaxaDoBombeiros`. */
  envio: EnvioDaTaxa | null;
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

  const doBombeiros = (t: (typeof linhas)[number]) =>
    ehTaxaDoBombeiros(t.protocol?.organ ? { sigla: t.protocol.organ.acronym, nome: t.protocol.organ.name } : null);

  // Os contatos só são buscados quando há o que enviar — é a mesma empresa para
  // todas as taxas do processo, então uma consulta serve a todas.
  const empresa = linhas.some(doBombeiros)
    ? (
        await prisma.process.findFirst({
          where: { id: processId, tenantId },
          select: {
            company: {
              select: {
                name: true,
                email: true,
                people: { where: { active: true, isInternal: false }, select: { name: true, email: true } },
              },
            },
          },
        })
      )?.company ?? null
    : null;
  const contatos = empresa ? destinatarios(contatosDaEmpresa(empresa, empresa.people)) : null;
  const hoje = new Date();

  const taxas: TaxaNaTela[] = linhas.map((t) => ({
    id: t.id,
    description: t.description,
    amountCents: t.amountCents,
    dueDate: t.dueDate,
    paidAt: t.paidAt,
    documentUrl: t.documentUrl,
    attempt: t.protocol?.attempt ?? null,
    orgaoNome: t.protocol?.organ ? t.protocol.organ.acronym || t.protocol.organ.name : null,
    envio:
      empresa && contatos && doBombeiros(t)
        ? {
            caminho: arquivarTaxaDeBombeiros(empresa.name, t.dueDate, hoje).caminho,
            para: contatos.para,
            descartados: contatos.descartados,
            temGuia: t.documentUrl !== null && caminhoDaGuia(tenantId, t.documentUrl) !== null,
          }
        : null,
  }));

  return {
    taxas,
    custo: custoEmTaxas(
      taxas.map((t) => ({ amountCents: t.amountCents, paidAt: t.paidAt, attempt: t.attempt }))
    ),
  };
}
