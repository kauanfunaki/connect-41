import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { hit, clientIp } from "@/lib/rateLimit";
import { recordClientDocumentSignature } from "@/lib/clientDocuments";

// Aceite eletrônico na página pública do documento — o destinatário não tem
// login; a prova é o token no link + nome/IP/data registrados. Só aceita se o
// documento realmente exige assinatura e ainda não foi assinado por este
// destinatário.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = clientIp(req);

  const form = await req.formData();
  const signerName = (form.get("signerName") as string)?.trim();
  const consent = form.get("consent") === "true";

  if (!signerName || signerName.length < 3) {
    return NextResponse.json({ error: "Informe seu nome completo para assinar." }, { status: 400 });
  }
  if (!consent) {
    return NextResponse.json({ error: "É preciso marcar o aceite para assinar." }, { status: 400 });
  }

  const prisma = getPrisma();
  const recipient = await prisma.clientDocumentRecipient.findUnique({
    where: { token },
    include: { clientDocument: { select: { status: true, requiresSignature: true } } },
  });

  if (!recipient || recipient.clientDocument.status !== "PUBLISHED" || !recipient.clientDocument.requiresSignature) {
    hit(`docsign-miss:${ip}`, 20, 10 * 60_000);
    return NextResponse.json({ error: "Link inválido ou documento não disponível para assinatura." }, { status: 404 });
  }
  if (recipient.signedAt) {
    return NextResponse.json({ error: "Este documento já foi assinado." }, { status: 409 });
  }

  await recordClientDocumentSignature({
    recipientId: recipient.id,
    signerName,
    ipAddress: ip,
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}
