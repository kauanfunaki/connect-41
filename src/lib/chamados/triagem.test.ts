import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ gerar: vi.fn(), ler: vi.fn(), hit: vi.fn() }));
vi.mock("./ia-fallback", () => ({ gerarComFallback: mocks.gerar }));
vi.mock("./armazenamento", () => ({ anexosDoChamado: { lerAnexo: mocks.ler } }));
vi.mock("@/lib/rateLimit", () => ({ hit: mocks.hit }));
import { analisar, selecionarAnexos, PROMPT, repete, perguntasRespondidas } from "./triagem";
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
  it("quando só sobram perguntas repetidas, segue para a revisão com as respostas na descrição", async () => {
    mocks.gerar.mockResolvedValue({ valor: { status: "needs_information", summary: "Falta contexto", questions: [{ text: "Qual é o sistema afetado?", options: [] }, { text: "Qual e o sistema afetado?", options: [] }] } });
    const r = await analisar(c, dados, cat, [{ role: "assistant", body: "Para iniciar:\n\nQual é o sistema afetado?" }, { role: "user", body: "Sistema de atendimento" }], [anexo("1")]);
    expect(r.status).toBe("sufficient"); expect(r.questions).toEqual([]); expect(mocks.gerar).toHaveBeenCalledTimes(1);
    expect(r.final?.description).toContain("Qual é o sistema afetado? Sistema de atendimento"); expect(r.final?.anexos).toEqual(["1"]);
    expect(mocks.gerar.mock.calls[0][0].texto).toContain("perguntasJaFeitas");
  });
  it("barra a pergunta reescrita pelo tema, como no caso do relatório de faturamento", () => {
    const anteriores = ["Qual o procedimento usado para gerar o relatório (tela, parâmetro ou filtro) e há alguma alteração recente no processo?"];
    expect(repete("Qual tela, parâmetro ou filtro são utilizados para gerar o relatório de faturamento por cliente?", anteriores)).toBe(true);
    expect(repete("Houve alguma alteração recente nos parâmetros, filtros ou processos de geração do relatório?", anteriores)).toBe(true);
    // Mesmo assunto, pergunta nova: não cai.
    expect(repete("Qual o período do relatório?", anteriores)).toBe(false);
    // O resumo da IA não conta como pergunta já feita.
    expect(perguntasRespondidas([{ role: "assistant", body: "Relatório de faturamento por cliente com erro.\n\nDesde quando?" }, { role: "user", body: "Outubro" }])).toEqual([{ pergunta: "Desde quando?", resposta: "Outubro" }]);
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
  const catalogo = { itens: [
    { ref: "robo:rendimentos", tipo: "robo" as const, nome: "Conferência de rendimentos", descricao: "Monta a planilha de rendimentos.", detalhe: "Todos os clientes", responsavel: "Camila Duarte", endereco: null },
    { ref: "site:1", tipo: "site" as const, nome: "Portal de certidões", descricao: "Emite certidões.", detalhe: null, responsavel: null, endereco: "https://certidoes.exemplo" },
  ], recusados: [] as string[], linkDoOps: true };
  it("aponta o que já existe no Ops Center com os dados do catálogo, não os do modelo", async () => {
    mocks.gerar.mockResolvedValue({ valor: { status: "sufficient", summary: "Completo", questions: [], existing: { ref: "robo:rendimentos", match: "same", reason: "Já monta a planilha." } } });
    const r = await analisar(c, dados, cat, [], [], catalogo);
    expect(r.existente).toEqual(expect.objectContaining({ nome: "Conferência de rendimentos", responsavel: "Camila Duarte", match: "same", noOps: "/ops?view=automations" }));
    expect(mocks.gerar.mock.calls[0][0].texto).toContain("robo:rendimentos");
  });
  it("ignora item inventado e não oferece de novo o que a pessoa recusou", async () => {
    mocks.gerar.mockResolvedValue({ valor: { status: "sufficient", summary: "Completo", questions: [], existing: { ref: "robo:inventado", match: "same", reason: "" } } });
    expect((await analisar(c, dados, cat, [], [], catalogo)).existente).toBeNull();
    mocks.gerar.mockResolvedValue({ valor: { status: "sufficient", summary: "Completo", questions: [], existing: { ref: "robo:rendimentos", match: "same", reason: "" } } });
    const r = await analisar(c, dados, cat, [], [], { ...catalogo, recusados: ["robo:rendimentos"], linkDoOps: false });
    expect(r.existente).toBeNull(); expect(mocks.gerar.mock.calls[1][0].texto).not.toContain("robo:rendimentos");
  });
  it("monta o chamado final: descrição da IA e só anexos deste rascunho", async () => {
    mocks.gerar.mockResolvedValue({ origem: "principal", valor: { status: "sufficient", summary: "Completo", questions: [], existing: null, description: "Pedido com as respostas da conversa.", attachmentIds: ["2", "inventado"] } });
    const r = await analisar(c, dados, cat, [], [anexo("1"), anexo("2")]);
    expect(r.final).toEqual({ description: "Pedido com as respostas da conversa.", anexos: ["2"] });
    mocks.gerar.mockResolvedValue({ valor: { status: "sufficient", summary: "Completo", questions: [], existing: null, description: "  " } });
    expect((await analisar(c, dados, cat, [], [anexo("1")])).final).toEqual({ description: dados.description, anexos: ["1"] });
    mocks.gerar.mockResolvedValue({ valor: { status: "needs_information", summary: "Falta", questions: [{ text: "Quando?", options: [] }], existing: null, description: "x", attachmentIds: [] } });
    expect((await analisar(c, dados, cat, [], [])).final).toBeNull();
  });
  it("limita requisições antes de gastar", async () => { mocks.hit.mockReturnValue({ allowed: false, retryAfterMs: 15000 }); expect((await analisar(c, dados, cat, [], [])).summary).toContain("15 segundos"); expect(mocks.gerar).not.toHaveBeenCalled(); });
});
