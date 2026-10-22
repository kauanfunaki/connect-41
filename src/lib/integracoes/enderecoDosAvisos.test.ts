import { afterEach, describe, expect, it, vi } from "vitest";
import { apontarWebhookDaEvolution, apontarWebhookDoChatwoot, lerWebhooksDoChatwoot, urlDoAviso } from "./enderecoDosAvisos";

// O que se testa (21/10): o Connect troca só a URL do aviso, no webhook que é
// dele — achado pelo caminho, em qualquer domínio —, sem criar outro nem
// perder os eventos e o segredo.

const NOVA = "https://app.useconnect.com.br/api/integrations/chatwoot/webhook/con1";
const CREDS = { baseUrl: "https://chat.41.com.br/", accountId: "3", apiToken: "tok" };

function resposta(status: number, corpo: unknown) {
  return new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), { status });
}

afterEach(() => vi.unstubAllGlobals());

describe("urlDoAviso", () => {
  it("junta o domínio e o caminho sem barra dobrada", () => {
    expect(urlDoAviso("https://app.useconnect.com.br/", "/api/x")).toBe("https://app.useconnect.com.br/api/x");
  });
});

describe("lerWebhooksDoChatwoot", () => {
  it("lê o formato novo e o antigo, e ignora o que não tem id ou url", () => {
    expect(lerWebhooksDoChatwoot({ payload: { webhooks: [{ id: 1, url: "https://a/x" }, { id: 2 }] } })).toHaveLength(1);
    expect(lerWebhooksDoChatwoot({ payload: [{ id: 1, url: "https://a/x" }] })).toHaveLength(1);
    expect(lerWebhooksDoChatwoot(null)).toEqual([]);
  });
});

describe("apontarWebhookDoChatwoot", () => {
  it("troca a URL do webhook do Connect, mantendo as inscrições", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(
      resposta(200, {
        payload: {
          webhooks: [
            { id: 7, url: "https://outro.sistema/hook", subscriptions: ["message_created"] },
            { id: 9, url: "https://connect.41contabil.com.br/api/integrations/chatwoot/webhook/con1", subscriptions: ["conversation_updated"] },
          ],
        },
      })
    ).mockResolvedValueOnce(resposta(200, { payload: { webhook: { id: 9 } } }));
    vi.stubGlobal("fetch", fetch);
    const r = await apontarWebhookDoChatwoot(CREDS, NOVA);
    expect(r).toEqual({ ok: true, mudou: true, antes: "https://connect.41contabil.com.br/api/integrations/chatwoot/webhook/con1" });
    expect(fetch.mock.calls[1]![0]).toBe("https://chat.41.com.br/api/v1/accounts/3/webhooks/9");
    expect(fetch.mock.calls[1]![1]).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({ url: NOVA, subscriptions: ["conversation_updated"] });
  });

  it("já no endereço novo, não grava", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(resposta(200, { payload: { webhooks: [{ id: 9, url: NOVA }] } }));
    vi.stubGlobal("fetch", fetch);
    expect(await apontarWebhookDoChatwoot(CREDS, NOVA)).toEqual({ ok: true, mudou: false, antes: NOVA });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sem o webhook do Connect, não cria outro e diz o que fazer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(resposta(200, { payload: { webhooks: [{ id: 7, url: "https://outro/hook" }] } })));
    const r = await apontarWebhookDoChatwoot(CREDS, NOVA);
    expect(r.ok).toBe(false);
  });

  it("token sem permissão vira mensagem clara", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(resposta(401, { error: "unauthorized" })));
    const r = await apontarWebhookDoChatwoot(CREDS, NOVA);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.erro).toContain("administrador");
  });
});

describe("apontarWebhookDaEvolution", () => {
  const CONFIG = { baseUrl: "https://evo.41.com.br", instance: "recrutamento", apiKey: "k", webhookSecret: "s3gredo" };
  const URL_EVO = "https://app.useconnect.com.br/api/integrations/whatsapp/webhook/int1";

  it("grava de volta com a URL nova, os eventos de antes e o segredo", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        resposta(200, {
          enabled: true,
          url: "https://connect.41contabil.com.br/api/integrations/whatsapp/webhook/int1",
          headers: { "x-connect-secret": "s3gredo", outro: "1" },
          events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
          webhookByEvents: false,
          webhookBase64: true,
        })
      )
      .mockResolvedValueOnce(resposta(201, { ok: true }));
    vi.stubGlobal("fetch", fetch);
    const r = await apontarWebhookDaEvolution(CONFIG, URL_EVO);
    expect(r).toMatchObject({ ok: true, mudou: true });
    expect(fetch.mock.calls[1]![0]).toBe("https://evo.41.com.br/webhook/set/recrutamento");
    expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({
      webhook: {
        enabled: true,
        url: URL_EVO,
        headers: { "x-connect-secret": "s3gredo", outro: "1" },
        byEvents: false,
        base64: true,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
      },
    });
  });

  it("sem eventos, vai o MESSAGES_UPSERT; sem segredo na conexão, recusa", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(resposta(200, {})).mockResolvedValueOnce(resposta(201, {}));
    vi.stubGlobal("fetch", fetch);
    await apontarWebhookDaEvolution(CONFIG, URL_EVO);
    expect(JSON.parse(fetch.mock.calls[1]![1].body).webhook.events).toEqual(["MESSAGES_UPSERT"]);
    expect(await apontarWebhookDaEvolution({ ...CONFIG, webhookSecret: "" }, URL_EVO)).toMatchObject({ ok: false });
  });

  it("já certo, não grava", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(resposta(200, { enabled: true, url: URL_EVO, headers: { "x-connect-secret": "s3gredo" } }));
    vi.stubGlobal("fetch", fetch);
    expect(await apontarWebhookDaEvolution(CONFIG, URL_EVO)).toEqual({ ok: true, mudou: false, antes: URL_EVO });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
