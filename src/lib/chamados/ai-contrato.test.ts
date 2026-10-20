import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ config: vi.fn(), preparar: vi.fn(), abrir: vi.fn(), encerrar: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ tenantAiConfig: { findUnique: m.config } }) }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: () => "chave-ficticia" }));
vi.mock("@/lib/ia/data", () => ({ prepararChamada: m.preparar, abrirChamada: m.abrir, encerrarChamada: m.encerrar, custoDaChamada: () => 1 }));
import { gerarEstruturado } from "@/lib/ai";
beforeEach(() => {
  vi.clearAllMocks(); m.config.mockResolvedValue({ provider: "OPENAI", apiKeyEnc: "ficticia", model: null });
  m.preparar.mockResolvedValue({ provider: "OPENAI", apiKey: "chave-ficticia", model: "modelo-de-teste" }); m.abrir.mockResolvedValue("run"); m.encerrar.mockResolvedValue(undefined); vi.stubGlobal("fetch", m.fetch);
  m.fetch.mockResolvedValue({ ok: true, json: async () => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '{"ok":true}' }] }], usage: { input_tokens: 10, output_tokens: 5 } }) });
});
const entrada = { tenantId: "t", agentCode: "triagem_chamados", sistema: "Avalie o chamado.", texto: "Dados fictícios", nome: "teste", schema: { type: "object" }, maxTokens: 3000, somenteOpenAi: true, timeoutMs: 30000, store: false };
describe("contrato OpenAI do agente de chamados", () => {
  it("usa Responses com store false, timeout, limite de tokens, saída estrita e uso auditado", async () => {
    const r = await gerarEstruturado({ ...entrada, anexos: [{ nome: "print.png", mime: "image/png", base64: "fake", imagem: true }, { nome: "pedido.pdf", mime: "application/pdf", base64: "fake-pdf" }] });
    expect(r.valor).toEqual({ ok: true }); const [url, options] = m.fetch.mock.calls[0]; expect(url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(options.body); expect(body).toMatchObject({ model: "modelo-de-teste", store: false, max_output_tokens: 3000, text: { format: { type: "json_schema", strict: true } } });
    expect(body.input[0].content.map((c: { type: string }) => c.type)).toEqual(["input_image", "input_file", "input_text"]); expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(m.encerrar).toHaveBeenCalledWith("run", expect.objectContaining({ ok: true }), expect.any(Date));
  });
  it("não chama Anthropic quando o helpdesk exige OpenAI", async () => {
    m.preparar.mockResolvedValue({ provider: "ANTHROPIC", apiKey: "ficticia", model: "ficticio" }); await expect(gerarEstruturado(entrada)).rejects.toThrow("OpenAI"); expect(m.fetch).not.toHaveBeenCalled();
  });
  it.each(["incomplete", "failed"])("recusa resposta com status %s", async status => {
    m.fetch.mockResolvedValue({ ok: true, json: async () => ({ status, output_text: '{"ok":true}' }) }); await expect(gerarEstruturado(entrada)).rejects.toThrow("não concluiu");
  });
  it("recusa refusal e não expõe corpo de erro do provedor", async () => {
    m.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "completed", output: [{ content: [{ type: "refusal" }] }] }) }); await expect(gerarEstruturado(entrada)).rejects.toThrow("não concluiu");
    m.fetch.mockResolvedValueOnce({ ok: false, status: 429, text: async () => "conteúdo privado do provedor" }); await expect(gerarEstruturado(entrada)).rejects.toThrow("HTTP 429");
  });
});
