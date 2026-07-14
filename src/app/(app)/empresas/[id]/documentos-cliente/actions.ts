"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { logAudit } from "@/lib/audit";
import {
  sanitizeDocumentHtml,
  saveClientDocumentFile,
  generateRecipientToken,
} from "@/lib/clientDocuments";
import { sendClientDocumentEmail } from "@/lib/email/sendMail";

export type ClientDocumentState = { error: string } | { success: true } | null;

async function assertCompanyInScope(companyId: string, ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true, email: true },
  });
  return company;
}

function parseExtraEmails(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,;]+/)
        .map((e) => e.trim())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    )
  );
}

export async function criarDocumento(_prev: ClientDocumentState, form: FormData): Promise<ClientDocumentState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para criar documentos." };

  const companyId = form.get("companyId") as string;
  const company = await assertCompanyInScope(companyId, ctx);
  if (!company) return { error: "Empresa não encontrada ou fora do seu escopo." };

  const title = (form.get("title") as string)?.trim();
  const bodyHtmlRaw = (form.get("bodyHtml") as string) ?? "";
  if (!title) return { error: "Título é obrigatório." };
  if (!bodyHtmlRaw.trim()) return { error: "O conteúdo do documento não pode ficar vazio." };

  const file = form.get("file");
  let fileData: { fileName: string; fileUrl: string; mimeType: string; fileSize: number } | null = null;
  if (file instanceof File && file.size > 0) {
    try {
      fileData = await saveClientDocumentFile(ctx.tenantId, file);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Erro ao salvar arquivo anexo." };
    }
  }

  const prisma = getPrisma();
  const document = await prisma.clientDocument.create({
    data: {
      tenantId: ctx.tenantId,
      companyId,
      title,
      bodyHtml: sanitizeDocumentHtml(bodyHtmlRaw),
      fileName: fileData?.fileName,
      fileUrl: fileData?.fileUrl,
      mimeType: fileData?.mimeType,
      fileSize: fileData?.fileSize,
      createdById: ctx.userId,
    },
  });

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "clientDocument.create", entityType: "ClientDocument", entityId: document.id, metadata: { title, companyId } });

  revalidatePath(`/empresas/${companyId}/documentos-cliente`);
  redirect(`/empresas/${companyId}/documentos-cliente/${document.id}`);
}

export async function atualizarDocumento(_prev: ClientDocumentState, form: FormData): Promise<ClientDocumentState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para editar documentos." };

  const id = form.get("id") as string;
  const companyId = form.get("companyId") as string;
  const company = await assertCompanyInScope(companyId, ctx);
  if (!company) return { error: "Empresa não encontrada ou fora do seu escopo." };

  const prisma = getPrisma();
  const existing = await prisma.clientDocument.findFirst({
    where: { id, tenantId: ctx.tenantId, companyId },
    include: { recipients: { select: { sentAt: true } } },
  });
  if (!existing) return { error: "Documento não encontrado." };

  // Trava de integridade: uma vez enviado, o conteúdo não pode mais mudar —
  // senão o link já aberto pelo cliente mostraria algo diferente do que foi
  // de fato visualizado, o que invalida a prova de recebimento.
  if (existing.recipients.some((r) => r.sentAt)) {
    return { error: "Este documento já foi enviado a algum destinatário e não pode mais ser editado. Crie um novo documento se precisar alterar o conteúdo." };
  }

  const title = (form.get("title") as string)?.trim();
  const bodyHtmlRaw = (form.get("bodyHtml") as string) ?? "";
  if (!title) return { error: "Título é obrigatório." };
  if (!bodyHtmlRaw.trim()) return { error: "O conteúdo do documento não pode ficar vazio." };

  const file = form.get("file");
  let fileData: { fileName: string; fileUrl: string; mimeType: string; fileSize: number } | null = null;
  if (file instanceof File && file.size > 0) {
    try {
      fileData = await saveClientDocumentFile(ctx.tenantId, file);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Erro ao salvar arquivo anexo." };
    }
  }

  await prisma.clientDocument.update({
    where: { id },
    data: {
      title,
      bodyHtml: sanitizeDocumentHtml(bodyHtmlRaw),
      ...(fileData
        ? { fileName: fileData.fileName, fileUrl: fileData.fileUrl, mimeType: fileData.mimeType, fileSize: fileData.fileSize }
        : {}),
    },
  });

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "clientDocument.update", entityType: "ClientDocument", entityId: id, metadata: { title } });

  revalidatePath(`/empresas/${companyId}/documentos-cliente/${id}`);
  redirect(`/empresas/${companyId}/documentos-cliente/${id}`);
}

export async function excluirDocumento(id: string, companyId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return;
  if (!(await assertCompanyInScope(companyId, ctx))) return;

  const prisma = getPrisma();
  const existing = await prisma.clientDocument.findFirst({
    where: { id, tenantId: ctx.tenantId, companyId },
    include: { recipients: { select: { id: true } } },
  });
  if (!existing || existing.recipients.length > 0) return; // nunca excluir documento já enviado

  await prisma.clientDocument.delete({ where: { id } });
  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "clientDocument.delete", entityType: "ClientDocument", entityId: id });

  revalidatePath(`/empresas/${companyId}/documentos-cliente`);
}

export async function publicarDocumento(id: string, companyId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return;
  if (!(await assertCompanyInScope(companyId, ctx))) return;

  const prisma = getPrisma();
  const existing = await prisma.clientDocument.findFirst({ where: { id, tenantId: ctx.tenantId, companyId } });
  if (!existing || existing.status !== "DRAFT") return;

  await prisma.clientDocument.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "clientDocument.publish", entityType: "ClientDocument", entityId: id });

  revalidatePath(`/empresas/${companyId}/documentos-cliente/${id}`);
}

export async function enviarDocumento(_prev: ClientDocumentState, form: FormData): Promise<ClientDocumentState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para enviar documentos." };

  const documentId = form.get("documentId") as string;
  const companyId = form.get("companyId") as string;
  const company = await assertCompanyInScope(companyId, ctx);
  if (!company) return { error: "Empresa não encontrada ou fora do seu escopo." };

  const prisma = getPrisma();
  const document = await prisma.clientDocument.findFirst({ where: { id: documentId, tenantId: ctx.tenantId, companyId } });
  if (!document) return { error: "Documento não encontrado." };
  if (document.status !== "PUBLISHED") return { error: "Publique o documento antes de enviar." };

  const useCompanyEmail = form.get("useCompanyEmail") === "on";
  const extraEmailsRaw = (form.get("extraEmails") as string) ?? "";
  const emails = new Set(parseExtraEmails(extraEmailsRaw));
  if (useCompanyEmail && company.email) emails.add(company.email);

  if (emails.size === 0) {
    return { error: "Informe ao menos um e-mail de destino (o e-mail da empresa não está cadastrado ou nenhum e-mail avulso foi informado)." };
  }

  const sender = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } });

  const failures: string[] = [];
  for (const email of emails) {
    let recipient = await prisma.clientDocumentRecipient.findFirst({ where: { clientDocumentId: documentId, email } });
    if (!recipient) {
      recipient = await prisma.clientDocumentRecipient.create({
        data: { clientDocumentId: documentId, email, token: generateRecipientToken() },
      });
    }

    const result = await sendClientDocumentEmail({
      tenantId: ctx.tenantId,
      to: email,
      documentTitle: document.title,
      viewToken: recipient.token,
      companyName: company.name,
      senderName: sender?.name ?? "Equipe",
      hasAttachment: !!document.fileUrl,
    });

    if (result.ok) {
      await prisma.clientDocumentRecipient.update({ where: { id: recipient.id }, data: { sentAt: new Date() } });
    } else {
      failures.push(`${email}: ${result.error}`);
    }
  }

  if (failures.length > 0) {
    return { error: `Falha ao enviar para: ${failures.join("; ")}` };
  }

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "clientDocument.send", entityType: "ClientDocument", entityId: documentId, metadata: { emails: Array.from(emails) } });

  revalidatePath(`/empresas/${companyId}/documentos-cliente/${documentId}`);
  return { success: true };
}

export async function reenviarParaDestinatario(recipientId: string, companyId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return;
  const company = await assertCompanyInScope(companyId, ctx);
  if (!company) return;

  const prisma = getPrisma();
  const recipient = await prisma.clientDocumentRecipient.findFirst({
    where: { id: recipientId, clientDocument: { tenantId: ctx.tenantId, companyId } },
    include: { clientDocument: true },
  });
  if (!recipient) return;

  const sender = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } });

  const result = await sendClientDocumentEmail({
    tenantId: ctx.tenantId,
    to: recipient.email,
    documentTitle: recipient.clientDocument.title,
    viewToken: recipient.token,
    companyName: company.name,
    senderName: sender?.name ?? "Equipe",
    hasAttachment: !!recipient.clientDocument.fileUrl,
  });

  if (result.ok) {
    await prisma.clientDocumentRecipient.update({ where: { id: recipientId }, data: { sentAt: new Date() } });
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "clientDocument.resend", entityType: "ClientDocument", entityId: recipient.clientDocumentId, metadata: { email: recipient.email } });
  }

  revalidatePath(`/empresas/${companyId}/documentos-cliente/${recipient.clientDocumentId}`);
}
