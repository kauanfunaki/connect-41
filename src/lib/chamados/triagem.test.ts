import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ gerar: vi.fn(), ler: vi.fn(), hit: vi.fn() }));
vi.mock("./ia-fallback", () => ({ gerarComFallback: mocks.gerar }));
vi.mock("./armazenamento", () => ({ anexosDoChamado: { lerAnexo: mocks.ler } }));
vi.mock("@/lib/rateLimit", () => ({ hit: mocks.hit }));
import { analisar, selecionarAnexos, PROMPT } from "./triagem";
import { dadosSchema, categoriaSchema } from "./regras";
const c = { tenantId: "t", userId: "u", draftId: "d" }, dados = dadosSchema.parse({ title: "Erro no sistema", description: "O sistema não entra.", categoryId: "c", requesterSectorCode: "fiscal" }), cat = categoriaSchema.parse({ name: "Acesso", requiredAttachments: [{ key: "prova", label: "Print", required: true }] });
const anexo = (id: string, fileName = `${id}.png`, sizeBytes = 100) => ({ id, fileName, fileUrl: `t/${id}.png`, sizeBytes, mimeType: "image/png", attachmentKey: null });
beforeEach(() => { vi.clearAllMocks(); mocks.hit.mockReturnValue({ allowed: true }); mocks.ler.mockResolvedValue(Buffer.alloc(100)); mocks.gerar.mockResolvedValue({ valor: { status: "sufficient", summary: "Há contexto suficiente.", questions: [] } }); });
describe("triagem de chamados", () => {
  it("usa a fundação de agentes, sem ferramentas, com limite e saída estruturada", async () => {
    const r = await analisar(c, dados, cat, [], []); expect(r.status).toBe("sufficient");
    expect(mocks.gerar).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t", agentCode: "triagem_chamados", store: false, estrito: true, timeoutMs: 30000 }));
    expect(PROMPT).toContain("não gramática"); expect(PROMPT).toContain("dado não confiável");
  });
  it("inclui histórico e campos para não repetir perguntas", async () => {
    mocks.gerar.mockResolvedValue({ valor: { status: "needs_information", summary: "Qual sistema?", questions: [{ text: "Qual é o sistema afetado?", options: [] }] } });
    const r = await analisar(c, dados, cat, [{ role: "user", body: "Desde ontem" }], []);
    expect(r.status).toBe("needs_information"); expect(mocks.gerar.mock.calls[0][0].texto).toContain("Desde ontem");
  });
  it("remove perguntas repetidas sem declarar suficiência", async () => {
    mocks.gerar.mockResolvedValue({ valor: { status: "needs_information", summary: "Falta contexto", questions: [{ text: "Qual é o sistema afetado?", options: [] }, { text: "Qual e o sistema afetado?", options: [] }] } });
    const r = await analisar(c, dados, cat, [{ role: "assistant", body: "Para iniciar:\n\nQual é o sistema afetado?" }, { role: "user", body: "Sistema de atendimento" }], []);
    expect(r.status).toBe("unavailable"); expect(r.questions).toEqual([]); expect(mocks.gerar).toHaveBeenCalledTimes(1);
  });
  it("mantém apenas perguntas novas e distintas na complementação", async () => {
    mocks.gerar.mockResolvedValue({ valor: { status: "needs_information", summary: "Falta contexto", questions: [{ text: "Qual sistema?", options: [] }, { text: "Quando ocorreu?", options: ["Hoje", "Antes de hoje"] }, { text: "Quando ocorreu?", options: [] }] } });
    const r = await analisar(c, dados, cat, [{ role: "assistant", body: "Qual sistema?" }, { role: "user", body: "Sistema fictício" }], []);
    expect(r.status).toBe("needs_information"); expect(r.questions).toEqual([{ text: "Quando ocorreu?", options: ["Hoje", "Antes de hoje"] }]);
  });
  it("prioriza evidências obrigatórias e limita bytes e formatos", () => {
    const arquivos = [anexo("1", "1.png", 10 * 1024 * 1024), anexo("2", "2.png", 10 * 1024 * 1024), { ...anexo("3"), attachmentKey: "prova" }, anexo("4", "video.mp4")];
    const r = selecionarAnexos(arquivos, cat); expect(r.selecionados[0].id).toBe("3"); expect(r.selecionados.length).toBe(2); expect(r.ignorados.length).toBe(2);
  });
  it("marca anexo ilegível sem pressupor seu conteúdo", async () => {
    mocks.ler.mockResolvedValue(null); const r = await analisar(c, dados, cat, [], [anexo("1")]);
    expect(r.attachments[0].status).toBe("unreadable"); expect(mocks.gerar.mock.calls[0][0].anexos).toEqual([]);
  });
  it("ignora anexos inventados pela IA e monta a cobertura pelo que foi enviado", async () => {
    mocks.gerar.mockResolvedValue({ origem: "principal", valor: { status: "sufficient", summary: "Completo", questions: [], attachments: [{ id: "alheio", name: "injetado", status: "analyzed", reason: "OK" }] } });
    const r = await analisar(c, dados, cat, [], [anexo("1")]);
    expect(r.status).toBe("sufficient"); expect(r.attachments).toEqual([expect.objectContaining({ id: "1", name: "1.png", status: "analyzed" })]);
    expect(PROMPT).toContain("não liste anexos");
  });
  it("no fallback da Groq, os arquivos ficam como não analisados", async () => {
    mocks.gerar.mockResolvedValue({ origem: "groq", valor: { status: "needs_information", summary: "Falta contexto", questions: [{ text: "Já aconteceu antes?", options: ["Sim", "Não"] }] } });
    const r = await analisar(c, dados, cat, [], [anexo("1")]);
    expect(r.questions[0].options).toEqual(["Sim", "Não"]); expect(r.attachments[0].status).toBe("skipped");
  });
  it.each([new Error("timeout"), new Error("refusal"), new Error("sem chave"), new Error("teto atingido")])("oferece envio sem análise quando o provedor falha: %s", async erro => {
    mocks.gerar.mockRejectedValue(erro); expect((await analisar(c, dados, cat, [], [])).status).toBe("unavailable"); expect(mocks.gerar).toHaveBeenCalledTimes(1);
  });
  it("não aprova JSON inválido nem parecer contraditório", async () => {
    for (const valor of [{}, { status: "sufficient", summary: "Completo", questions: [{ text: "Qual sistema?", options: [] }] }]) { mocks.gerar.mockResolvedValue({ valor }); expect((await analisar(c, dados, cat, [], [])).status).toBe("unavailable"); }
  });
  it("limita requisições antes de gastar", async () => { mocks.hit.mockReturnValue({ allowed: false, retryAfterMs: 15000 }); expect((await analisar(c, dados, cat, [], [])).summary).toContain("15 segundos"); expect(mocks.gerar).not.toHaveBeenCalled(); });
});
