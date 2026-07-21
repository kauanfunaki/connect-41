import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { resolveConnectionById } from "@/lib/chatwoot/connection";
import { verifyChatwootSignature } from "@/lib/chatwoot/webhookAuth";
import { chatwootWebhookEventSchema, MAX_WEBHOOK_BODY_BYTES } from "@/lib/chatwoot/schemas";
import { processWebhookEvent } from "@/lib/chatwoot/webhookProcessor";
import type { ChatwootWebhookPayload } from "@/lib/chatwoot/types";

export const dynamic = "force-dynamic";

// Chamado pelo Chatwoot (fora do app, sem sessão de usuário) — por isso está
// em PUBLIC_PATHS no proxy. A autenticação de verdade é a assinatura HMAC
// (X-Chatwoot-Signature), verificada aqui contra o webhookSecretEnc da
// conexão identificada pelo :connectionId da URL (não secreto por si só).
export async function POST(req: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ error: "Payload excede o tamanho máximo aceito." }, { status: 413 });
  }

  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ error: "Payload excede o tamanho máximo aceito." }, { status: 413 });
  }

  const connection = await resolveConnectionById(connectionId);
  if (!connection) {
    return NextResponse.json({ error: "Conexão não encontrada ou inativa." }, { status: 404 });
  }

  const verify = verifyChatwootSignature(
    rawBody,
    req.headers.get("x-chatwoot-signature"),
    req.headers.get("x-chatwoot-timestamp"),
    connection.webhookSecret
  );
  if (!verify.ok) {
    console.error("[chatwoot:webhook] assinatura inválida", connectionId, verify.reason);
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = chatwootWebhookEventSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload fora do formato esperado." }, { status: 422 });
  }
  const payload = parsed.data;

  // Chatwoot nem sempre envia um id de entrega estável — cai para hash do
  // conteúdo relevante do próprio payload (dedup por conteúdo, não por tempo).
  const deliveryId = req.headers.get("x-chatwoot-delivery");
  const externalEventId =
    deliveryId ??
    createHash("sha256")
      .update(`${payload.event}:${payload.id ?? ""}:${payload.conversation?.id ?? ""}:${payload.updated_at ?? payload.created_at ?? ""}`)
      .digest("hex");

  const prisma = getPrisma();

  let eventRow;
  try {
    eventRow = await prisma.chatwootWebhookEvent.create({
      data: {
        tenantId: connection.tenantId,
        connectionId,
        eventType: payload.event,
        externalEventId,
        status: "RECEIVED",
      },
    });
  } catch {
    // Unique constraint (tenantId, connectionId, externalEventId) — evento já
    // recebido antes (reenvio do Chatwoot). Responde 200 sem reprocessar.
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    await processWebhookEvent(connection.tenantId, connectionId, payload as unknown as ChatwootWebhookPayload);
    await prisma.chatwootWebhookEvent.update({ where: { id: eventRow.id }, data: { status: "PROCESSED", processedAt: new Date() } });
  } catch (err) {
    console.error("[chatwoot:webhook] falha ao processar", connectionId, payload.event, err);
    await prisma.chatwootWebhookEvent.update({
      where: { id: eventRow.id },
      data: { status: "FAILED", error: err instanceof Error ? err.message : "Erro desconhecido", processedAt: new Date() },
    });
    // Responde 200 mesmo em falha de processamento — a reconciliação
    // periódica cobre a lacuna; não queremos o Chatwoot retentando
    // indefinidamente por um erro que pode não ser transitório.
  }

  return NextResponse.json({ ok: true });
}
