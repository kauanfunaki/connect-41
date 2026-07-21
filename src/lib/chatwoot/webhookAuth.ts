// Verificação de assinatura de webhook do Chatwoot 4.15: o Chatwoot assina
// cada entrega com HMAC-SHA256 sobre "{timestamp}.{raw_body}", usando o
// webhook_secret gerado quando a inscrição de webhook é criada na UI dele.
// Headers enviados: X-Chatwoot-Signature ("sha256=<hex>"), X-Chatwoot-Timestamp
// (unix seconds), X-Chatwoot-Delivery (id, nem sempre presente).
//
// IMPORTANTE: a assinatura é calculada sobre o BODY BRUTO (string, antes de
// JSON.parse) — reserializar o JSON mudaria a assinatura. Por isso o handler
// da rota precisa ler req.text() antes de fazer qualquer parse.
import { createHmac, timingSafeEqual } from "crypto";

const MAX_CLOCK_SKEW_SECONDS = 5 * 60; // tolera até 5min de diferença de relógio

export type WebhookVerifyResult = { ok: true } | { ok: false; reason: string };

export function verifyChatwootSignature(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
  webhookSecret: string
): WebhookVerifyResult {
  if (!signatureHeader || !timestampHeader) {
    return { ok: false, reason: "Headers de assinatura ausentes." };
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: "Timestamp inválido." };

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > MAX_CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: "Timestamp fora da janela aceita (possível replay)." };
  }

  const expected = `sha256=${createHmac("sha256", webhookSecret).update(`${timestampHeader}.${rawBody}`).digest("hex")}`;

  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
    return { ok: false, reason: "Assinatura não confere." };
  }

  return { ok: true };
}
