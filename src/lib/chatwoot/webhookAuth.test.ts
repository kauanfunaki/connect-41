import { createHmac } from "crypto";
import { describe, it, expect } from "vitest";
import { verifyChatwootSignature } from "./webhookAuth";

const SECRET = "test-webhook-secret";

function sign(body: string, timestamp: string, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

describe("verifyChatwootSignature", () => {
  it("aceita assinatura válida dentro da janela de tempo", () => {
    const body = JSON.stringify({ event: "message_created" });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(body, timestamp);
    expect(verifyChatwootSignature(body, signature, timestamp, SECRET)).toEqual({ ok: true });
  });

  it("rejeita quando a assinatura não confere (segredo errado)", () => {
    const body = JSON.stringify({ event: "message_created" });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(body, timestamp, "outro-segredo");
    const result = verifyChatwootSignature(body, signature, timestamp, SECRET);
    expect(result.ok).toBe(false);
  });

  it("rejeita quando o body foi alterado depois de assinado", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(JSON.stringify({ event: "message_created" }), timestamp);
    const tampered = JSON.stringify({ event: "message_created", extra: "injetado" });
    expect(verifyChatwootSignature(tampered, signature, timestamp, SECRET).ok).toBe(false);
  });

  it("rejeita timestamp fora da janela aceita (possível replay)", () => {
    const body = JSON.stringify({ event: "message_created" });
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 3600);
    const signature = sign(body, oldTimestamp);
    expect(verifyChatwootSignature(body, signature, oldTimestamp, SECRET).ok).toBe(false);
  });

  it("rejeita quando headers de assinatura estão ausentes", () => {
    expect(verifyChatwootSignature("{}", null, null, SECRET)).toEqual({ ok: false, reason: "Headers de assinatura ausentes." });
  });
});
