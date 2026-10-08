import { randomBytes, randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import sanitizeHtml from "sanitize-html";
import { getPrisma } from "@/lib/prisma";
import type { ClientDocumentViewAction } from "@/generated/prisma/enums";

// Fora de `public/`, mesmo padrão do módulo de anexos internos (src/app/api/documents) —
// o arquivo só é servido através da rota pública com token (src/app/d/[token]/arquivo)
// e, desde 08/10/2026, da rota do portal que confere o alcance do cliente
// (portal/envios/[id]/arquivo) — nunca por caminho estático direto.
const STORAGE_DIR = path.join(process.cwd(), "storage", "client-documents");

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const MAX_SIZE = 10 * 1024 * 1024;

export type SavedClientDocumentFile = {
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
};

export async function saveClientDocumentFile(tenantId: string, file: File): Promise<SavedClientDocumentFile> {
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) throw new Error("Formato não suportado. Use JPG, PNG, WEBP ou PDF.");
  if (file.size > MAX_SIZE) throw new Error("Arquivo maior que 10MB.");

  const storedFileName = `${randomUUID()}.${ext}`;
  const dir = path.join(STORAGE_DIR, tenantId);
  await mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, storedFileName), buffer);

  return {
    fileName: file.name,
    fileUrl: `${tenantId}/${storedFileName}`,
    mimeType: file.type,
    fileSize: file.size,
  };
}

// Allowlist restrita ao que o editor rich text (Tiptap StarterKit) realmente
// produz — a página pública (/d/[token]) não tem autenticação, então o corpo
// sanitizado aqui é a única barreira contra XSS via link enviado por e-mail.
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "em", "u", "s", "h1", "h2", "h3", "ul", "ol", "li", "a", "blockquote", "code", "pre"],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto"],
};

// Sanitizado tanto na gravação (criarDocumento/atualizarDocumento) quanto na
// renderização da página pública — defesa em profundidade.
export function sanitizeDocumentHtml(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

export function generateRecipientToken(): string {
  return randomBytes(32).toString("hex");
}

export async function recordClientDocumentView(params: {
  recipientId: string;
  action: ClientDocumentViewAction;
  ipAddress: string;
  userAgent: string | null;
  isFirstView: boolean;
}): Promise<void> {
  const prisma = getPrisma();
  const now = new Date();
  await prisma.clientDocumentView.create({
    data: {
      recipientId: params.recipientId,
      action: params.action,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent?.slice(0, 255),
    },
  });
  await prisma.clientDocumentRecipient.update({
    where: { id: params.recipientId },
    data: {
      lastViewedAt: now,
      ...(params.isFirstView ? { firstViewedAt: now } : {}),
    },
  });
}

// Aceite eletrônico do destinatário — grava nome/data/IP no recipient e uma
// linha SIGNED no log de prova (mesma trilha das visualizações/downloads).
//
// Usado pela página pública (/d/{token}/assinar) e pelo portal (08/10/2026),
// que validam antes pela mesma regra (`lib/envios/regras.ts`). A gravação só
// acontece se a linha ainda não tem aceite (`signedAt: null` no `where`): dois
// cliques ao mesmo tempo, ou o e-mail e o portal juntos, não sobrescrevem o
// primeiro aceite. Devolve `false` quando o aceite já existia.
export async function recordClientDocumentSignature(params: {
  recipientId: string;
  signerName: string;
  ipAddress: string;
  userAgent: string | null;
}): Promise<boolean> {
  const prisma = getPrisma();
  const gravado = await prisma.clientDocumentRecipient.updateMany({
    where: { id: params.recipientId, signedAt: null },
    data: {
      signedAt: new Date(),
      signerName: params.signerName.slice(0, 180),
      signerIp: params.ipAddress.slice(0, 64),
    },
  });
  if (gravado.count !== 1) return false;
  await prisma.clientDocumentView.create({
    data: {
      recipientId: params.recipientId,
      action: "SIGNED",
      ipAddress: params.ipAddress,
      userAgent: params.userAgent?.slice(0, 255),
    },
  });
  return true;
}

// ─── O anexo ─────────────────────────────────────────────────────────────────

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

/**
 * O arquivo anexado ao documento, lido do armazenamento — `null` se não está
 * lá. Quem chama já conferiu o direito de ler (o token do link, ou o alcance
 * do cliente no portal); aqui só se garante que o caminho gravado não sai da
 * pasta dos documentos.
 */
export async function lerArquivoDoDocumento(fileUrl: string): Promise<Buffer | null> {
  const caminho = path.resolve(STORAGE_DIR, fileUrl);
  if (!caminho.startsWith(STORAGE_DIR + path.sep)) return null;
  try {
    return await readFile(caminho);
  } catch {
    return null;
  }
}

/** A resposta de download do anexo — a mesma no link do e-mail e no portal. */
export function respostaDoArquivoDoDocumento(
  conteudo: Buffer,
  doc: { fileUrl: string; fileName: string | null; mimeType: string | null }
): Response {
  const ext = doc.fileUrl.split(".").pop() ?? "";
  return new Response(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": CONTENT_TYPES[ext] ?? doc.mimeType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.fileName ?? "documento")}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
