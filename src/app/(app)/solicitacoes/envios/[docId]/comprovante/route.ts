import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { logAudit } from "@/lib/audit";
import { nomeExibicao } from "@/lib/companyName";
import { formatDocumento } from "@/lib/format";
import { lerArquivoDoDocumento } from "@/lib/clientDocuments";
import { numeroDoComprovante, pdfDoComprovante } from "@/lib/envios/comprovante";

export const dynamic = "force-dynamic";

const sha256 = (conteudo: string | Buffer) => createHash("sha256").update(conteudo).digest("hex");

/**
 * O comprovante de leitura do envio em PDF (22/10/2026). Mesma régua de acesso
 * da ficha do envio: o escritório da sessão e as empresas que a pessoa
 * enxerga — envio de fora responde 404, como id inexistente. Os hashes são
 * calculados na emissão: o do conteúdo (o HTML gravado, que não muda depois de
 * publicado) e o do anexo guardado. Baixar o comprovante não é acesso do
 * cliente: nada entra no log de prova, só na auditoria.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { docId } = await params;
  const doc = await getPrisma().clientDocument.findFirst({
    where: { id: docId, tenantId: ctx.tenantId, company: await scopedCompanyWhere(ctx) },
    select: {
      id: true,
      title: true,
      bodyHtml: true,
      fileName: true,
      fileUrl: true,
      requiresSignature: true,
      createdAt: true,
      publishedAt: true,
      scheduledFor: true,
      reminderSentAt: true,
      tenant: { select: { name: true } },
      company: { select: { name: true, displayName: true, kind: true, cnpj: true, cpf: true } },
      createdBy: { select: { name: true } },
      recipients: {
        orderBy: { createdAt: "asc" },
        select: {
          email: true,
          sentAt: true,
          firstViewedAt: true,
          signedAt: true,
          signerName: true,
          signerIp: true,
          views: { select: { action: true, ipAddress: true, viewedAt: true } },
        },
      },
    },
  });
  if (!doc) return NextResponse.json({ error: "Envio não encontrado." }, { status: 404 });

  const emissor = await getPrisma().user.findUnique({ where: { id: ctx.userId }, select: { name: true } });
  const arquivo = doc.fileUrl ? await lerArquivoDoDocumento(doc.fileUrl) : null;
  const documentoDaEmpresa = formatDocumento(doc.company.kind, doc.company.cnpj, doc.company.cpf);

  const bytes = await pdfDoComprovante({
    envioId: doc.id,
    escritorioNome: doc.tenant.name,
    empresaNome: nomeExibicao(doc.company),
    empresaDocumento: documentoDaEmpresa === "—" ? null : documentoDaEmpresa,
    titulo: doc.title,
    conteudoSha256: sha256(doc.bodyHtml),
    anexo: doc.fileUrl ? { nome: doc.fileName ?? "anexo", sha256: arquivo ? sha256(arquivo) : null } : null,
    pedeAceite: doc.requiresSignature,
    criadoPor: doc.createdBy.name,
    criadoEm: doc.createdAt,
    publicadoEm: doc.publishedAt,
    agendadoPara: doc.scheduledFor,
    lembreteEnviadoEm: doc.reminderSentAt,
    destinatarios: doc.recipients.map((r) => ({
      email: r.email,
      enviadoEm: r.sentAt,
      primeiraVisualizacao: r.firstViewedAt,
      aceite: r.signedAt ? { nome: r.signerName, em: r.signedAt, ip: r.signerIp } : null,
    })),
    eventos: doc.recipients.flatMap((r) => r.views.map((v) => ({ em: v.viewedAt, acao: v.action, email: r.email, ip: v.ipAddress }))),
    emitidoPor: emissor?.name ?? "—",
    emitidoEm: new Date(),
  });

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "clientDocument.receipt", entityType: "ClientDocument", entityId: doc.id, metadata: { title: doc.title } });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="comprovante-${numeroDoComprovante(doc.id).toLowerCase()}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
