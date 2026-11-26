import { describe, expect, it } from "vitest";
import { configDoHub, lerRespostaDoHub, montarEnvio, motivoDaFalhaNoHub, rotaDoHub } from "./hub";

// O chamado do Connect também no Hub (17/11/2026, funcionalidade-711).

describe("configDoHub", () => {
  const completo = { HUB_API_URL: "https://hub.exemplo.cloud/", HUB_SERVICE_TOKEN: "tk", HUB_CHAMADOS_ESCRITORIO: "41tech" };

  it("liga só com endereço, token e escritório", () => {
    expect(configDoHub(completo)).toEqual({ url: "https://hub.exemplo.cloud", token: "tk", escritorio: "41tech" });
    expect(configDoHub({ ...completo, HUB_CHAMADOS_ESCRITORIO: "" })).toBeNull();
    expect(configDoHub({ ...completo, HUB_SERVICE_TOKEN: undefined })).toBeNull();
    expect(configDoHub({ ...completo, HUB_API_URL: "hub.exemplo.cloud" })).toBeNull();
  });

  it("a rota é a de chamados da integração do Connect", () => {
    expect(rotaDoHub(configDoHub(completo)!)).toBe("https://hub.exemplo.cloud/api/integrations/connect41/tickets");
  });
});

describe("montarEnvio", () => {
  const base = {
    id: "uuid-1",
    protocolo: "CHA-45",
    titulo: "Impressora do Fiscal",
    descricao: "Não imprime desde ontem.",
    categoria: "Equipamentos",
    setorSolicitante: "Fiscal",
    setorQueAtende: "Tech",
    prioridade: "ALTA" as const,
    solicitante: { nome: "Ana", email: "ana@exemplo.com" },
    connectUrl: "https://app.exemplo.com/chamados/cha-45",
  };

  it("leva o que o Hub precisa para abrir, com o link de volta", () => {
    expect(montarEnvio(base)).toEqual({
      connectTicketId: "uuid-1",
      protocolo: "CHA-45",
      titulo: "Impressora do Fiscal",
      descricao: "Não imprime desde ontem.",
      categoria: "Equipamentos",
      setorSolicitante: "Fiscal",
      setorQueAtende: "Tech",
      prioridade: "ALTA",
      solicitante: { nome: "Ana", email: "ana@exemplo.com" },
      connectUrl: "https://app.exemplo.com/chamados/cha-45",
    });
  });

  it("sem categoria (a equipe classifica), sem e-mail e sem endereço público, os campos não vão", () => {
    const envio = montarEnvio({ ...base, categoria: null, solicitante: { nome: "Ana", email: null }, connectUrl: null });
    expect(envio).not.toHaveProperty("categoria");
    expect(envio).not.toHaveProperty("connectUrl");
    expect(envio.solicitante).toEqual({ nome: "Ana" });
  });

  it("corta no tamanho que o Hub aceita e não manda título vazio", () => {
    const envio = montarEnvio({ ...base, titulo: "  ", descricao: "x".repeat(30000) });
    expect(envio.titulo).toBe("CHA-45");
    expect(envio.descricao).toHaveLength(20000);
  });
});

describe("lerRespostaDoHub e motivoDaFalhaNoHub", () => {
  it("lê o id e o link; link que não é http fica de fora", () => {
    expect(lerRespostaDoHub({ ticketId: "h-1", ticketUrl: "https://hub/tickets/h-1" })).toEqual({ id: "h-1", url: "https://hub/tickets/h-1" });
    expect(lerRespostaDoHub({ ticketId: "h-1", ticketUrl: null })).toEqual({ id: "h-1", url: null });
    expect(lerRespostaDoHub({ ticketId: "h-1", ticketUrl: "javascript:alert(1)" })).toEqual({ id: "h-1", url: null });
    expect(lerRespostaDoHub({ ok: true })).toBeNull();
    expect(lerRespostaDoHub(null)).toBeNull();
  });

  it("diz o motivo: a resposta do Hub, o tempo esgotado ou a rede", () => {
    expect(motivoDaFalhaNoHub(500, { error: "Categoria não encontrada" })).toBe("O Hub respondeu 500: Categoria não encontrada");
    expect(motivoDaFalhaNoHub(401, null)).toBe("O Hub respondeu 401");
    const tempo = new Error("x");
    tempo.name = "TimeoutError";
    expect(motivoDaFalhaNoHub(null, null, tempo)).toBe("Sem resposta do Hub: o Hub não respondeu a tempo");
    expect(motivoDaFalhaNoHub(null, null, new Error("ECONNREFUSED"))).toBe("Sem resposta do Hub: ECONNREFUSED");
  });
});
