import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { resolveConnectionById } from "@/lib/chatwoot/connection";
import { verifyChatwootSignature } from "@/lib/chatwoot/webhookAuth";
import { chatwootWebhookEventSchema, MAX_WEBHOOK_BODY_BYTES } from "@/lib/chatwoot/schemas";
import { processWebhookEvent } from "@/lib/chatwoot/webhookProcessor";
import type { ChatwootWebhookPayload } from "@/lib/chatwoot/types";

export const dynamic = "force-dynamic";

/**
 * Log da recusa, no máximo uma vez por hora por conexão e motivo.
 *
 * Desde 21/07 toda entrega chegava sem cabeçalho de assinatura e cada uma virava
 * uma linha no log — dezenas por hora, escondendo o resto. O Chatwoot instalado
 * (4.17.1) assina quando o webhook tem segredo, e o webhook da conta tem; a
 * suspeita é o processo que envia (sidekiq) estar numa versão antiga. O log
 * passa a dizer quem mandou e quais cabeçalhos `x-chatwoot-*` vieram — só os
 * nomes, nunca valores —, que é o que separa uma hipótese da outra.
 */
const ULTIMO_LOG = new Map<string, number>();
const INTERVALO_DO_LOG_MS = 60 * 60 * 1000;
let recusadasDesdeOLog = 0;

function logarRecusa(connectionId: string, motivo: string, req: NextRequest): void {
  recusadasDesdeOLog++;
  const chave = `${connectionId}:${motivo}`;
  const agora = Date.now();
  if (agora - (ULTIMO_LOG.get(chave) ?? 0) < INTERVALO_DO_LOG_MS) return;
  ULTIMO_LOG.set(chave, agora);
  const cabecalhosDoChatwoot = [...req.headers.keys()].filter((k) => k.startsWith("x-chatwoot"));
  console.error("[chatwoot:webhook] assinatura inválida", connectionId, motivo, {
    recusadasNaUltimaHora: recusadasDesdeOLog,
    userAgent: req.headers.get("user-agent"),
    cabecalhosDoChatwoot,
  });
  recusadasDesdeOLog = 0;
}

// Chamado pelo Chatwoot (fora do app, sem sessão de usuário) — por isso está
// em PUBLIC_PATHS no proxy. A autenticação de verdade é a assinatura HMAC
// (X-Chatwoot-Signature), verificada aqui contra o segredo do webhook da
// integração ligada à conexão identificada pelo :connectionId da URL (não
// secreto por si só). Sem integração ligada e completa, a conexão não resolve e
// a entrega é recusada.
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
    logarRecusa(connectionId, verify.reason, req);
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
