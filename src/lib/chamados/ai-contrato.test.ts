import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { zipSync, strToU8 } from "fflate";
const m = vi.hoisted(() => ({ config: vi.fn(), preparar: vi.fn(), abrir: vi.fn(), encerrar: vi.fn(), fetch: vi.fn(), criar: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ tenantAiConfig: { findUnique: m.config } }) }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: () => "chave-ficticia" }));
vi.mock("@/lib/ia/data", () => ({ prepararChamada: m.preparar, abrirChamada: m.abrir, encerrarChamada: m.encerrar, custoDaChamada: () => 1 }));
// Cliente Anthropic simulado (22/10/2026): mantém a classe de erro real, troca só `messages.create`.
vi.mock("@anthropic-ai/sdk", async (original) => {
  const real = (await original()) as { default: { APIError: unknown } };
  class Falso { messages = { create: m.criar }; static APIError = real.default.APIError; }
  return { default: Falso };
});
import Anthropic from "@anthropic-ai/sdk";
import { gerarEstruturado } from "@/lib/ai";
import { modeloDaFaixa } from "@/lib/ia/catalogo";
import { FOLGA_DE_RACIOCINIO } from "@/lib/ia/conversa-openai";
beforeEach(() => {
  vi.clearAllMocks(); m.config.mockResolvedValue({ provider: "OPENAI", apiKeyEnc: "ficticia", model: null });
  m.preparar.mockResolvedValue({ provider: "OPENAI", apiKey: "chave-ficticia", model: "modelo-de-teste" }); m.abrir.mockResolvedValue("run"); m.encerrar.mockResolvedValue(undefined); vi.stubGlobal("fetch", m.fetch);
  m.fetch.mockResolvedValue({ ok: true, json: async () => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '{"ok":true}' }] }], usage: { input_tokens: 10, output_tokens: 5 } }) });
  m.criar.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: '{"ok":true}' }], usage: { input_tokens: 12, output_tokens: 6 } });
});
const entrada = { tenantId: "t", agentCode: "triagem_chamados", sistema: "Avalie o chamado.", texto: "Dados fictícios", nome: "teste", schema: { type: "object" }, maxTokens: 3000, estrito: true, timeoutMs: 30000, store: false };
const comAnthropic = () => m.preparar.mockResolvedValue({ provider: "ANTHROPIC", apiKey: "chave-ficticia", model: modeloDaFaixa("ANTHROPIC", "rapido") });
describe("contrato OpenAI do agente de chamados", () => {
  it("usa Responses com store false, timeout, limite de tokens, saída estrita e uso auditado", async () => {
    const r = await gerarEstruturado({ ...entrada, anexos: [{ nome: "print.png", mime: "image/png", base64: "fake", imagem: true }, { nome: "pedido.pdf", mime: "application/pdf", base64: "fake-pdf" }] });
    expect(r.valor).toEqual({ ok: true }); const [url, options] = m.fetch.mock.calls[0]; expect(url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(options.body); expect(body).toMatchObject({ model: "modelo-de-teste", store: false, max_output_tokens: 3000 + FOLGA_DE_RACIOCINIO, text: { format: { type: "json_schema", strict: true } } });
    expect(body.input[0].content.map((c: { type: string }) => c.type)).toEqual(["input_image", "input_file", "input_text"]); expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(m.encerrar).toHaveBeenCalledWith("run", expect.objectContaining({ ok: true }), expect.any(Date)); expect(m.criar).not.toHaveBeenCalled();
  });
  // bug-695: no modelo que raciocina, o teto conta o raciocínio; sem folga, a triagem voltava incompleta.
  it("modelo legado (sem raciocínio) recebe só o limite pedido", async () => {
    m.preparar.mockResolvedValue({ provider: "OPENAI", apiKey: "chave-ficticia", model: "gpt-4.1-mini" });
    await gerarEstruturado(entrada); expect(JSON.parse(m.fetch.mock.calls[0][1].body).max_output_tokens).toBe(3000);
  });
  // bug-720: sem esforço, o gpt-5-nano raciocinava no padrão (medium) e passava do tempo limite.
  it("pede o esforço de raciocínio ao modelo que raciocina, e não ao legado nem sem pedido", async () => {
    await gerarEstruturado({ ...entrada, esforco: "low" }); expect(JSON.parse(m.fetch.mock.calls[0][1].body).reasoning).toEqual({ effort: "low" });
    await gerarEstruturado(entrada); expect(JSON.parse(m.fetch.mock.calls[1][1].body)).not.toHaveProperty("reasoning");
    m.preparar.mockResolvedValue({ provider: "OPENAI", apiKey: "chave-ficticia", model: "gpt-4.1-mini" });
    await gerarEstruturado({ ...entrada, esforco: "low" }); expect(JSON.parse(m.fetch.mock.calls[2][1].body)).not.toHaveProperty("reasoning");
  });
  it("as chamadas dos chamados pedem esforço baixo e 30 s", () => {
    for (const f of ["classificacao", "triagem"]) expect(readFileSync(`src/lib/chamados/${f}.ts`, "utf8")).toMatch(/timeoutMs: 30000, esforco: "low"/);
  });
  it.each(["incomplete", "failed"])("recusa resposta com status %s", async status => {
    m.fetch.mockResolvedValue({ ok: true, json: async () => ({ status, output_text: '{"ok":true}' }) }); await expect(gerarEstruturado(entrada)).rejects.toThrow("não concluiu");
  });
  it("recusa refusal e não expõe corpo de erro do provedor", async () => {
    m.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "completed", output: [{ content: [{ type: "refusal" }] }] }) }); await expect(gerarEstruturado(entrada)).rejects.toThrow("não concluiu");
    m.fetch.mockResolvedValueOnce({ ok: false, status: 429, text: async () => "conteúdo privado do provedor" }); await expect(gerarEstruturado(entrada)).rejects.toThrow("HTTP 429");
  });
});
describe("contrato Anthropic do agente de chamados", () => {
  it("usa a chave Anthropic do escritório com JSON Schema, teto de tokens, timeout, sem repetição e uso auditado", async () => {
    comAnthropic();
    const r = await gerarEstruturado(entrada);
    expect(r).toEqual({ valor: { ok: true }, runId: "run" }); expect(m.fetch).not.toHaveBeenCalled();
    const [corpo, opcoes] = m.criar.mock.calls[0];
    expect(corpo).toMatchObject({ model: "claude-haiku-4-5-20251001", max_tokens: 3000, output_config: { format: { type: "json_schema", schema: { type: "object" } } } });
    expect(corpo.system).toContain("Avalie o chamado."); expect(opcoes).toEqual({ timeout: 30000, maxRetries: 0 });
    expect(m.encerrar).toHaveBeenCalledWith("run", expect.objectContaining({ ok: true, uso: expect.objectContaining({ entrada: 12, saida: 6 }), custoCentavos: 1 }), expect.any(Date));
  });
  it("converte anexos: imagem, PDF, texto, DOCX e planilha ilegível", async () => {
    comAnthropic();
    const docx = Buffer.from(zipSync({ "word/document.xml": strToU8('<w:document><w:body><w:p><w:r><w:t>Erro &amp; tela</w:t></w:r></w:p><w:p><w:r><w:t>Linha 2</w:t></w:r></w:p></w:body></w:document>') })).toString("base64");
    await gerarEstruturado({ ...entrada, anexos: [
      { nome: "print.png", mime: "image/png", base64: "fake", imagem: true },
      { nome: "pedido.pdf", mime: "application/pdf", base64: "fake-pdf" },
      { nome: "log.txt", mime: "text/plain", base64: Buffer.from("linha de log").toString("base64") },
      { nome: "relato.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", base64: docx },
      { nome: "dados.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: Buffer.from("não é planilha").toString("base64") },
    ] });
    const conteudo = m.criar.mock.calls[0][0].messages[0].content;
    expect(conteudo.map((b: { type: string }) => b.type)).toEqual(["text", "image", "document", "document", "document", "text", "text"]);
    expect(conteudo[2]).toMatchObject({ title: "pedido.pdf", source: { type: "base64", media_type: "application/pdf" } });
    expect(conteudo[3]).toMatchObject({ title: "log.txt", source: { type: "text", data: "linha de log" } });
    expect(conteudo[4].source.data).toBe("Erro & tela\nLinha 2");
    expect(conteudo[5].text).toContain('"dados.xlsx"'); expect(conteudo[5].text).toContain("ilegível");
    expect(conteudo[6]).toEqual({ type: "text", text: "Dados fictícios" });
  });
  it.each(["refusal", "max_tokens"])("recusa resposta com stop_reason %s", async stop_reason => {
    comAnthropic(); m.criar.mockResolvedValue({ stop_reason, content: [{ type: "text", text: '{"ok' }], usage: { input_tokens: 1, output_tokens: 1 } });
    await expect(gerarEstruturado(entrada)).rejects.toThrow("não concluiu");
    expect(m.encerrar).toHaveBeenCalledWith("run", expect.objectContaining({ ok: false }), expect.any(Date));
  });
  it("não expõe corpo de erro do provedor", async () => {
    comAnthropic(); m.criar.mockRejectedValue(new Anthropic.APIError(529, { error: "conteúdo privado do provedor" }, "conteúdo privado do provedor", new Headers()));
    const erro = await gerarEstruturado(entrada).catch((e: Error) => e);
    expect(erro).toBeInstanceOf(Error); expect((erro as Error).message).toBe("Anthropic indisponível (HTTP 529)."); expect(m.fetch).not.toHaveBeenCalled();
  });
});
