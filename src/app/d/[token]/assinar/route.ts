import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { hit, clientIp } from "@/lib/rateLimit";
import { recordClientDocumentSignature } from "@/lib/clientDocuments";
import { recusaDoAceite, validarAceite } from "@/lib/envios/regras";

// Aceite eletrônico na página pública do documento — o destinatário não tem
// login; a prova é o token no link + nome/IP/data registrados. Só aceita se o
// documento realmente exige assinatura e ainda não foi assinado por este
// destinatário. A validação é a mesma do aceite pelo portal (08/10/2026),
// em `lib/envios/regras.ts`.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = clientIp(req);

  const form = await req.formData();
  const aceite = validarAceite({ nome: form.get("signerName"), consentimento: form.get("consent") });
  if (!aceite.ok) return NextResponse.json({ error: aceite.erro }, { status: 400 });

  const prisma = getPrisma();
  const recipient = await prisma.clientDocumentRecipient.findUnique({
    where: { token },
    include: { clientDocument: { select: { status: true, requiresSignature: true } } },
  });

  const recusa = recipient ? recusaDoAceite(recipient.clientDocument, !!recipient.signedAt) : "indisponivel";
  if (!recipient || recusa === "indisponivel") {
    hit(`docsign-miss:${ip}`, 20, 10 * 60_000);
    return NextResponse.json({ error: "Link inválido ou documento não disponível para assinatura." }, { status: 404 });
  }
  if (recusa === "ja-aceito") {
    return NextResponse.json({ error: "Este documento já foi assinado." }, { status: 409 });
  }

  const gravado = await recordClientDocumentSignature({
    recipientId: recipient.id,
    signerName: aceite.nome,
    ipAddress: ip,
    userAgent: req.headers.get("user-agent"),
  });
  if (!gravado) return NextResponse.json({ error: "Este documento já foi assinado." }, { status: 409 });

  return NextResponse.json({ ok: true });
}
