import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { CODIGOS_DE_WHATSAPP, provedorDaIntegracao, janelaDoCodigo } from "./index";
import { provedorMeta } from "./meta";
import { INTEGRATION_CATALOG } from "@/lib/integracoes/catalogo";
import { JANELA_LIVRE_EM_HORAS } from "../decisao";

const REQ = (corpoBruto: string, cabecalhos: Record<string, string> = {}, url = "https://connect.test/api/x") => ({
  corpoBruto,
  cabecalhos: new Headers(cabecalhos),
  url: new URL(url),
});

describe("registro de provedores de WhatsApp", () => {
  // Provedor sem integração no catálogo não tem onde guardar credencial, e a
  // rota nunca o encontraria.
  it("todo provedor registrado existe no catálogo de integrações", () => {
    const codigos = INTEGRATION_CATALOG.map((i) => i.code);
    for (const c of CODIGOS_DE_WHATSAPP) expect(codigos, c).toContain(c);
  });

  it("não tem código repetido", () => {
    expect(new Set(CODIGOS_DE_WHATSAPP).size).toBe(CODIGOS_DE_WHATSAPP.length);
  });

  // Errar para o lado de recusar é a pessoa ver o motivo; errar para o outro é
  // mandar mensagem que o provedor não permite.
  it("código desconhecido não tem provedor e fica com a janela mais restritiva", () => {
    expect(provedorDaIntegracao("nao_existe")).toBeNull();
    expect(janelaDoCodigo("nao_existe")).toBe(JANELA_LIVRE_EM_HORAS);
  });

  it("a Meta tem janela de 24h", () => {
    expect(janelaDoCodigo("whatsapp_recrutamento")).toBe(24);
  });

  // A Evolution não tem janela: aplicar a da Meta faria a tela mandar a pessoa
  // ligar para um candidato a quem ela pode simplesmente responder.
  it("a Evolution não tem janela", () => {
    expect(janelaDoCodigo("whatsapp_recrutamento_evolution")).toBeNull();
  });
});

describe("provedor Meta", () => {
  const SEGREDO = "app-secret";
  const corpo = JSON.stringify({ entry: [] });
  const assinatura = `sha256=${createHmac("sha256", SEGREDO).update(corpo, "utf8").digest("hex")}`;

  it("autentica pelo cabeçalho X-Hub-Signature-256 com o App Secret da conexão", () => {
    expect(provedorMeta.autenticar(REQ(corpo, { "x-hub-signature-256": assinatura }), { appSecret: SEGREDO })).toEqual({
      ok: true,
    });
  });

  it("sem cabeçalho, ou com App Secret de outra conexão, recusa", () => {
    expect(provedorMeta.autenticar(REQ(corpo), { appSecret: SEGREDO }).ok).toBe(false);
    expect(provedorMeta.autenticar(REQ(corpo, { "x-hub-signature-256": assinatura }), { appSecret: "outro" }).ok).toBe(
      false
    );
  });

  it("evento só de status sai marcado, sem mensagens", () => {
    const status = {
      entry: [{ changes: [{ value: { statuses: [{ id: "w1", status: "read" }] } }] }],
    };
    expect(provedorMeta.lerEvento(status)).toEqual({ mensagens: [], ignoradas: [], somenteStatus: true });
  });

  it("verificação de posse devolve o challenge quando o token confere", () => {
    const url = new URL("https://connect.test/x?hub.mode=subscribe&hub.verify_token=tk&hub.challenge=123");
    expect(provedorMeta.verificarPosse!(url, { verifyToken: "tk" })).toEqual({ ok: true, resposta: "123" });
    expect(provedorMeta.verificarPosse!(url, { verifyToken: "outro" }).ok).toBe(false);
  });
});
