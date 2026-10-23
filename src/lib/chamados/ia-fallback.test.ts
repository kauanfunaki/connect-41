import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ principal: vi.fn(), config: vi.fn(), update: vi.fn(), upsert: vi.fn(), agente: vi.fn(), gasto: vi.fn(), count: vi.fn(), criar: vi.fn(), terminar: vi.fn(), fetch: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/ai", () => ({ gerarEstruturado: m.principal }));
vi.mock("@/lib/ia/data", () => ({ gastoDoMes: m.gasto }));
vi.mock("@/lib/audit", () => ({ logAudit: m.audit }));
vi.mock("@/lib/crypto", () => ({ encryptSecret: (s: string) => `cifrado:${s}`, decryptSecret: () => JSON.stringify({ apiKey: "gsk-ficticia" }) }));
vi.mock("@/lib/prisma", () => {
  const db = { tenantIntegration: { findUnique: m.config, update: m.update, upsert: m.upsert }, tenantAgent: { findUnique: m.agente }, integrationRun: { count: m.count, create: m.criar, update: m.terminar }, $queryRaw: vi.fn() };
  return { getPrisma: () => ({ ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) }) };
});
import { gerarComFallback, salvarFallback, estadoDoFallback } from "./ia-fallback";
import type { Contexto } from "./contexto";
const input = { tenantId: "t", agentCode: "triagem_chamados", sistema: "Classifique", texto: "Dados fictícios", nome: "teste", schema: { type: "object" }, maxTokens: 1200 };
const c = { ctx: { tenantId: "t", userId: "u", role: "ADMIN", subscriptionReadOnly: false, sectors: [] }, config: { enabled: true, sectorCode: "tech", requesterSectors: [] } } as unknown as Contexto;
const config = { id: "config", enabled: true, configEnc: "cifrado", lastRunAt: null, lastError: null };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("fetch", m.fetch);
  m.config.mockResolvedValue(config); m.principal.mockRejectedValue(new Error("falha-privada"));
  m.agente.mockResolvedValue({ enabled: true, model: null, monthlyCapCents: 10000, monthlyCapCalls: 2000 });
  m.gasto.mockResolvedValue({ centavos: 0, chamadas: 0, semCusto: 0 }); m.count.mockResolvedValue(0); m.criar.mockResolvedValue({ id: "run" });
  m.fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }] }) });
});
describe("fallback protegido por escritório", () => {
  it("usa apenas a IA principal quando ela responde", async () => {
    m.principal.mockResolvedValue({ valor: { ok: true }, runId: "principal" });
    expect((await gerarComFallback(input)).origem).toBe("principal"); expect(m.fetch).not.toHaveBeenCalled();
  });
  it("usa Groq uma vez com saída estrita, timeout e auditoria isolada", async () => {
    expect(await gerarComFallback(input)).toEqual({ valor: { ok: true }, origem: "groq" });
    const [url, p] = m.fetch.mock.calls[0]; expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(JSON.parse(p.body)).toMatchObject({ model: "openai/gpt-oss-20b", max_completion_tokens: 1200, response_format: { type: "json_schema", json_schema: { strict: true } } });
    expect(p.signal).toBeInstanceOf(AbortSignal); expect(m.fetch).toHaveBeenCalledTimes(1);
    expect(m.config).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId_integrationCode_instanceKey: { tenantId: "t", integrationCode: "helpdesk_groq", instanceKey: "default" } } }));
    expect(m.terminar).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ok: true }) }));
  });
  it("não contorna agente desligado nem os tetos combinados", async () => {
    m.agente.mockResolvedValueOnce({ enabled: false }); await expect(gerarComFallback(input)).rejects.toThrow("desligado");
    m.count.mockResolvedValue(1999); m.gasto.mockResolvedValue({ centavos: 0, chamadas: 1, semCusto: 0 });
    await expect(gerarComFallback(input)).rejects.toThrow("teto de chamadas"); expect(m.fetch).not.toHaveBeenCalled(); expect(m.principal).not.toHaveBeenCalled();
  });
  it.each([null, { ...config, enabled: false }])("sem fallback habilitado não envia dados à Groq", async row => {
    m.config.mockResolvedValue(row); await expect(gerarComFallback(input)).rejects.toThrow("indisponível"); expect(m.fetch).not.toHaveBeenCalled();
  });
  it("não envia binários nem declara leitura de anexos no fallback", async () => {
    m.fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ attachments: [{ id: "a", status: "analyzed" }] }) } }] }) });
    const r = await gerarComFallback({ ...input, anexos: [{ nome: "arquivo.png", mime: "image/png", imagem: true, base64: "binario-privado" }] });
    expect(m.fetch.mock.calls[0][1].body).not.toContain("binario-privado"); expect(r.valor).toMatchObject({ attachments: [{ status: "unreadable" }] });
  });
  it.each(["length", "content_filter"])("recusa resposta incompleta e não guarda erro bruto: %s", async finish_reason => {
    m.fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ finish_reason, message: { content: "privado" } }] }) });
    await expect(gerarComFallback(input)).rejects.toThrow("IA indisponível"); expect(JSON.stringify(m.terminar.mock.calls)).not.toContain("privado");
  });
  it("preserva chave em atualização vazia e devolve somente estado público", async () => {
    await salvarFallback(c, { enabled: false, apiKey: "" });
    expect(m.upsert.mock.calls[0][0].update.configEnc).toBe("cifrado");
    expect(await estadoDoFallback(c)).not.toHaveProperty("configEnc"); expect(await estadoDoFallback(c)).not.toHaveProperty("apiKey");
    await salvarFallback(c, { enabled: true, apiKey: "nova-chave-ficticia" });
    expect(m.upsert.mock.calls[1][0].update.configEnc).toContain("cifrado:"); expect(JSON.stringify(m.audit.mock.calls)).not.toContain("nova-chave-ficticia");
  });
  it("restringe credenciais ao administrador com escrita", async () => {
    for (const ctx of [{ ...c.ctx, role: "SECTOR_ADMIN", sectors: ["tech"] }, { ...c.ctx, subscriptionReadOnly: true }]) {
      await expect(salvarFallback({ ...c, ctx: ctx as Contexto["ctx"] }, { enabled: true, apiKey: "ficticia" })).rejects.toThrow();
    }
    expect(m.upsert).not.toHaveBeenCalled();
  });
});
