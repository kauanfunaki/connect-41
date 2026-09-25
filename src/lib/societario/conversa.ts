// Conversa e documentos de um processo do Societário — leitura e gravação,
// as mesmas para a equipe e para o portal.
//
// O escopo é o primeiro argumento, como na conversa livre: a equipe passa
// `companyIds: null` (o tenant inteiro), o cliente passa as empresas do grupo
// dele, e `[]` casa com nada. O processo é procurado **com** o escopo no
// `where` — id de processo de outro cliente responde "não encontrado", igual a
// um id que não existe.
//
// Os arquivos vão para `storage/societario-processos`, sob o volume único de
// `/app/storage` — mesmas regras de entrada da conversa livre e das pendências
// (tipo pelos bytes, nome sorteado, teto de tamanho e de quantidade).

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { criarArmazenamento, type AnexoGravado } from "@/lib/financeiro/pendencias/armazenamento";
import type { MensagemDaConversa } from "@/lib/financeiro/pendencias/consultas";

export const arquivosDoProcesso = criarArmazenamento("societario-processos");

export type EscopoDoProcesso = { tenantId: string; companyIds: string[] | null };

export type Autor = { userId: string | null } | { portalUserId: string };

export type DocumentoDoProcesso = {
  id: string;
  fileName: string;
  sizeBytes: number;
  descricao: string | null;
  lado: "EQUIPE" | "CLIENTE";
  enviadoPor: string;
  enviadoEm: Date;
  /** Veio anexado numa mensagem da conversa, e não pela lista de documentos. */
  naConversa: boolean;
};

/** Teto de mensagens carregadas de uma vez. Conversa mais longa mostra o fim. */
const LIMITE_DA_CONVERSA = 300;
export const LIMITE_DA_DESCRICAO = 200;

function whereDoProcesso(e: EscopoDoProcesso, processId: string): Prisma.ProcessWhereInput {
  return e.companyIds === null
    ? { id: processId, tenantId: e.tenantId }
    : { id: processId, tenantId: e.tenantId, companyId: { in: e.companyIds } };
}

/** O processo, se estiver no escopo de quem pede. */
export async function processoNoEscopo(escopo: EscopoDoProcesso, processId: string) {
  if (escopo.companyIds !== null && escopo.companyIds.length === 0) return null;
  return getPrisma().process.findFirst({
    where: whereDoProcesso(escopo, processId),
    select: {
      id: true,
      title: true,
      companyId: true,
      ownerUserId: true,
      type: { select: { name: true } },
      company: { select: { name: true, displayName: true } },
    },
  });
}

/** A conversa e os documentos do processo, do mais antigo para o mais recente. */
export async function conversaDoProcesso(
  escopo: EscopoDoProcesso,
  processId: string
): Promise<{ mensagens: MensagemDaConversa[]; limitada: boolean; documentos: DocumentoDoProcesso[] } | null> {
  const processo = await processoNoEscopo(escopo, processId);
  if (!processo) return null;
  const prisma = getPrisma();
  const where = { processId: processo.id, tenantId: escopo.tenantId };

  const [total, linhas, documentos] = await Promise.all([
    prisma.processMessage.count({ where }),
    prisma.processMessage.findMany({
      where,
      select: {
        id: true,
        body: true,
        createdAt: true,
        authorUser: { select: { name: true } },
        authorPortal: { select: { name: true } },
        documents: { select: { id: true, fileName: true, sizeBytes: true }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      take: LIMITE_DA_CONVERSA,
    }),
    prisma.processDocument.findMany({
      where,
      select: {
        id: true,
        fileName: true,
        sizeBytes: true,
        description: true,
        messageId: true,
        createdAt: true,
        uploadedByUser: { select: { name: true } },
        uploadedByPortal: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    mensagens: linhas.reverse().map((m) => ({
      id: m.id,
      // Autor do portal removido (SetNull) cai como equipe — o lado que não
      // expõe nome de outro cliente. Mesma regra da conversa livre.
      lado: m.authorPortal ? "CLIENTE" : "EQUIPE",
      autorNome: m.authorPortal?.name ?? m.authorUser?.name ?? "Equipe",
      corpo: m.body,
      criadaEm: m.createdAt,
      anexos: m.documents,
    })),
    limitada: total > LIMITE_DA_CONVERSA,
    documentos: documentos.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      sizeBytes: d.sizeBytes,
      descricao: d.description,
      lado: d.uploadedByPortal ? "CLIENTE" : "EQUIPE",
      enviadoPor: d.uploadedByPortal?.name ?? d.uploadedByUser?.name ?? "Equipe",
      enviadoEm: d.createdAt,
      naConversa: d.messageId !== null,
    })),
  };
}

function colunasDoAutor(autor: Autor) {
  return "portalUserId" in autor
    ? { mensagem: { authorPortalUserId: autor.portalUserId }, documento: { uploadedByPortalUserId: autor.portalUserId } }
    : { mensagem: { authorUserId: autor.userId }, documento: { uploadedByUserId: autor.userId } };
}

/**
 * Grava a mensagem e os anexos dela numa transação. Os arquivos já estão no
 * disco; se o banco falhar, eles são apagados — arquivo sem a linha que o
 * aponta é lixo que ninguém encontra.
 */
export async function gravarMensagem(input: {
  tenantId: string;
  processId: string;
  autor: Autor;
  corpo: string;
  anexos: AnexoGravado[];
}): Promise<string> {
  const colunas = colunasDoAutor(input.autor);
  try {
    return await getPrisma().$transaction(async (tx) => {
      const msg = await tx.processMessage.create({
        data: { tenantId: input.tenantId, processId: input.processId, body: input.corpo, ...colunas.mensagem },
        select: { id: true },
      });
      if (input.anexos.length > 0) {
        await tx.processDocument.createMany({
          data: input.anexos.map((a) => ({
            tenantId: input.tenantId,
            processId: input.processId,
            messageId: msg.id,
            ...colunas.documento,
            ...a,
          })),
        });
      }
      return msg.id;
    });
  } catch (err) {
    await arquivosDoProcesso.apagarAnexosGravados(input.anexos);
    throw err;
  }
}

/** Documentos guardados direto na lista, sem mensagem. */
export async function gravarDocumentos(input: {
  tenantId: string;
  processId: string;
  autor: Autor;
  descricao: string | null;
  anexos: AnexoGravado[];
}): Promise<void> {
  const colunas = colunasDoAutor(input.autor);
  try {
    await getPrisma().processDocument.createMany({
      data: input.anexos.map((a) => ({
        tenantId: input.tenantId,
        processId: input.processId,
        description: input.descricao,
        ...colunas.documento,
        ...a,
      })),
    });
  } catch (err) {
    await arquivosDoProcesso.apagarAnexosGravados(input.anexos);
    throw err;
  }
}

/** Descrição do envio direto: aparada, vazia vira nula. */
export function lerDescricao(valor: FormDataEntryValue | null): { ok: true; descricao: string | null } | { ok: false; erro: string } {
  const texto = String(valor ?? "").trim();
  if (texto.length > LIMITE_DA_DESCRICAO) return { ok: false, erro: `Descrição com mais de ${LIMITE_DA_DESCRICAO} caracteres.` };
  return { ok: true, descricao: texto || null };
}
