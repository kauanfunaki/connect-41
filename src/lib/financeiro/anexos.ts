// Os anexos de um lançamento (19/10, lote H2 do BPO): o boleto, a nota ou o
// comprovante, guardados na própria conta — como o anexo do título no Omie.
//
// O disco é o mesmo armazenamento das pendências (`criarArmazenamento`), com a
// mesma conferência pelos bytes, noutra pasta. Fica sob `storage/`, que no
// EasyPanel tem volume próprio desde 25/09: pasta nova ali não se perde a cada
// deploy.

import { getPrisma } from "@/lib/prisma";
import { criarArmazenamento } from "./pendencias/armazenamento";

export const PASTA_DOS_ANEXOS = "finance-entries";
export const armazenamentoDosAnexos = criarArmazenamento(PASTA_DOS_ANEXOS);

/** Teto por conta: o boleto, a nota, o comprovante e alguma sobra. Mais que isso é pasta, não conta. */
export const MAXIMO_DE_ANEXOS_POR_CONTA = 20;

export type AnexoDaConta = {
  id: string;
  nome: string;
  tamanho: number;
  /** ISO — a tela formata. */
  enviadoEm: string;
  enviadoPor: string | null;
};

export async function anexosDaConta(tenantId: string, entryId: string): Promise<AnexoDaConta[]> {
  const linhas = await getPrisma().financeEntryAttachment.findMany({
    where: { tenantId, entryId },
    select: { id: true, fileName: true, sizeBytes: true, createdAt: true, uploadedByUser: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return linhas.map((a) => ({
    id: a.id,
    nome: a.fileName,
    tamanho: a.sizeBytes,
    enviadoEm: a.createdAt.toISOString(),
    enviadoPor: a.uploadedByUser?.name ?? null,
  }));
}
