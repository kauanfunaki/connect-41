import { readFile } from "fs/promises";
import path from "path";
import { getPrisma } from "@/lib/prisma";
import type { DocumentCategory, DocumentEntityType, SensitiveFieldGroup } from "@/generated/prisma/enums";

/** Onde moram os arquivos dos documentos (ficha da empresa, pessoa, vaga, card). Fora de `public/`. */
export const PASTA_DOS_DOCUMENTOS = path.join(process.cwd(), "storage", "documents");

// Documentos médicos (ASO/atestado) são protegidos pelo grupo DADOS_MEDICOS
// mesmo que a flag `sensitive` não tenha sido marcada no upload — dado de saúde
// é sensível por natureza (LGPD). Os demais caem em DOCUMENTOS_PESSOAIS.
const MEDICAL_CATEGORIES: DocumentCategory[] = ["ASO", "ATESTADO"];

/**
 * O grupo de campo sensível que precisa liberar o download, ou `null` quando o
 * documento é de qualquer um do tenant. Era local da rota /api/documents/[id];
 * saiu para cá para os Arquivos ("Do Connect") seguirem a mesma régua.
 */
export function grupoSensivelDoDocumento(category: DocumentCategory, sensitiveFlag: boolean): SensitiveFieldGroup | null {
  if (MEDICAL_CATEGORIES.includes(category)) return "DADOS_MEDICOS";
  if (sensitiveFlag) return "DOCUMENTOS_PESSOAIS";
  return null; // documento não sensível — liberado para qualquer usuário do tenant
}

/**
 * O conteúdo de um documento pelo `fileUrl` gravado ("<tenantId>/<uuid>.<ext>").
 * A checagem de prefixo fica mesmo o valor sendo nosso: um valor adulterado no
 * banco não vira leitura fora da pasta.
 */
export async function lerArquivoDoDocumentoDaFicha(fileUrl: string): Promise<Buffer | null> {
  const alvo = path.resolve(PASTA_DOS_DOCUMENTOS, fileUrl);
  if (!alvo.startsWith(path.resolve(PASTA_DOS_DOCUMENTOS) + path.sep)) return null;
  try {
    return await readFile(alvo);
  } catch {
    return null;
  }
}

export async function listDocuments(
  tenantId: string,
  entityType: DocumentEntityType,
  entityId: string
) {
  const prisma = getPrisma();
  return prisma.document.findMany({
    where: { tenantId, entityType, entityId },
    orderBy: { createdAt: "desc" },
    // photoUrl alimenta o avatar do responsável no cartão de anexo do
    // detalhamento de tarefa (DocumentsSection em modo compacto).
    include: { uploadedBy: { select: { id: true, name: true, photoUrl: true } } },
  });
}
