import { beforeEach, describe, expect, it, vi } from "vitest";
import { ID_ITEM, LEITOR, ESCRITOR, itemFalso } from "@/lib/tech-interno/api-fixtures.test-utils";

// O servidor MCP de ponta a ponta pela rota `/api/mcp`, com o SDK de verdade
// (JSON-RPC sobre Streamable HTTP, sem sessão) e o servidor do Controle
// interno de mentira: as ferramentas que aparecem por escopo, a chamada com a
// pessoa do token e o erro devolvido como resultado da ferramenta.

const s = vi.hoisted(() => ({
  listarItens: vi.fn(), detalheItem: vi.fn(), opcoesTech: vi.fn(), salvarItem: vi.fn(), mudarSituacaoItem: vi.fn(), comentarItem: vi.fn(),
  anexarArquivo: vi.fn(), comentarioSalvo: vi.fn(), resumoTech: vi.fn(),
}));
vi.mock("@/lib/tokens-pessoais/servidor", async () => ({ autenticarTokenPessoal: (await import("@/lib/tech-interno/api-fixtures.test-utils")).autenticarFalso }));
vi.mock("@/lib/tech-interno/servidor", async original => ({
  ...await original<typeof import("@/lib/tech-interno/servidor")>(),
  listarItens: s.listarItens, detalheItem: s.detalheItem, opcoesTech: s.opcoesTech,
  salvarItem: s.salvarItem, mudarSituacaoItem: s.mudarSituacaoItem, comentarItem: s.comentarItem, resumoTech: s.resumoTech,
}));
vi.mock("@/lib/tech-interno/anexos", () => ({ anexarArquivo: s.anexarArquivo }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ techInternalComment: { findFirstOrThrow: s.comentarioSalvo } }) }));

import { POST, GET, DELETE } from "@/app/api/mcp/route";
import { CONFLITO } from "@/lib/tech-interno/regras";

let proximoId = 1;
function rpc(token: string | null, method: string, params: Record<string, unknown> = {}) {
  return new Request("https://connect.example.test/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: proximoId++, method, params }),
  });
}
async function chamar(token: string, method: string, params: Record<string, unknown> = {}) {
  const r = await POST(rpc(token, method, params));
  expect(r.status).toBe(200);
  return (await r.json()) as { result?: Record<string, unknown> & { content?: { type: string; text: string }[]; isError?: boolean; tools?: { name: string; annotations?: Record<string, unknown>; inputSchema: { properties?: Record<string, unknown> } }[] }; error?: unknown };
}
async function ferramenta(token: string, name: string, args: Record<string, unknown>) {
  const { result } = await chamar(token, "tools/call", { name, arguments: args });
  return { isError: result?.isError ?? false, dados: JSON.parse(result!.content![0].text) as Record<string, unknown> };
}
const ator = expect.objectContaining({ userId: "pessoa-1", tenantId: "esc-a", via: { tokenId: "tok-1", tokenName: "Claude Code" } });

beforeEach(() => {
  vi.clearAllMocks();
  s.detalheItem.mockResolvedValue(itemFalso());
  s.listarItens.mockResolvedValue({ total: 1, pages: 1, page: 1, items: [itemFalso()] });
  s.salvarItem.mockResolvedValue({ ok: true, id: ID_ITEM });
  s.mudarSituacaoItem.mockResolvedValue({ ok: true, id: ID_ITEM });
});

describe("servidor MCP: conexão", () => {
  it("sem token, nem chega ao MCP: 401 com o Bearer", async () => {
    const r = await POST(rpc(null, "initialize"));
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toMatch(/^Bearer /);
    expect(await r.json()).toMatchObject({ error: { code: "unauthenticated" } });
  });

  it("token desconhecido: 401", async () => {
    expect((await POST(rpc(`c41_${"0f".repeat(32)}`, "initialize"))).status).toBe(401);
  });

  it("initialize apresenta o Connect, com as instruções para a IA", async () => {
    const { result } = await chamar(ESCRITOR, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "teste", version: "0" } });
    expect(result).toMatchObject({ serverInfo: { name: "connect" }, capabilities: { tools: {} } });
    expect(String(result?.instructions)).toContain("ver_opcoes");
  });

  it("sem sessão: GET e DELETE respondem 405", async () => {
    expect(GET().status).toBe(405);
    expect(DELETE().status).toBe(405);
  });
});

describe("servidor MCP: ferramentas por escopo", () => {
  it("token só de leitura vê só as quatro de consulta, marcadas como leitura", async () => {
    const { result } = await chamar(LEITOR, "tools/list");
    expect(result?.tools?.map(t => t.name).sort()).toEqual(["listar_itens", "resumo_do_periodo", "ver_item", "ver_opcoes"]);
    for (const t of result!.tools!) expect(t.annotations?.readOnlyHint, t.name).toBe(true);
  });

  it("token de escrita vê as nove", async () => {
    const { result } = await chamar(ESCRITOR, "tools/list");
    expect(result?.tools?.map(t => t.name).sort()).toEqual(["anexar", "atualizar_item", "comentar", "criar_item", "listar_itens", "mudar_situacao", "resumo_do_periodo", "ver_item", "ver_opcoes"]);
    const criar = result!.tools!.find(t => t.name === "criar_item")!;
    expect(Object.keys(criar.inputSchema.properties ?? {})).toEqual(expect.arrayContaining(["title", "type", "systemKey", "assigneeId", "dueDate"]));
  });

  it("chamar uma ferramenta de escrita com token de leitura não age", async () => {
    const { result, error } = await chamar(LEITOR, "tools/call", { name: "criar_item", arguments: { title: "x", type: "BUG" } });
    expect(error ?? result?.isError).toBeTruthy();
    expect(s.salvarItem).not.toHaveBeenCalled();
  });
});

describe("servidor MCP: as ações", () => {
  it("listar_itens usa os filtros da tela", async () => {
    const { isError, dados } = await ferramenta(LEITOR, "listar_itens", { type: "BUG", assignee: "me", overdue: true, page: 1 });
    expect(isError).toBe(false);
    expect(s.listarItens).toHaveBeenCalledWith(ator, expect.objectContaining({ type: "BUG", assignee: "me", overdue: true, page: 1 }));
    expect(dados).toMatchObject({ total: 1, items: [{ id: ID_ITEM, statusLabel: "Pendente", url: `https://connect.example.test/controle-interno/${ID_ITEM}` }] });
  });

  it("resumo_do_periodo: semana por padrão, com totais e uma linha curta por item", async () => {
    const quando = new Date("2026-11-04T13:00:00Z");
    const base = { title: "Corrigir X", type: "BUG", priority: 2, systemName: "Connect", assigneeName: "Pessoa", dueDate: null, prUrl: "https://github.com/a/b/pull/1", createdAt: quando };
    s.resumoTech.mockResolvedValue({
      periodo: "mes", primeiroDia: "2026-11-01", ultimoDia: "2026-11-30", rotulo: "novembro de 2026",
      concluidos: [{ ...base, id: ID_ITEM, status: "DONE", em: quando }],
      emAndamento: [{ ...base, id: "outro", status: "VALIDATION", mexidoNoPeriodo: true }],
      planejados: [], cancelados: [],
    });
    const { isError, dados } = await ferramenta(LEITOR, "resumo_do_periodo", { period: "month", date: "2026-11-06" });
    expect(isError).toBe(false);
    expect(s.resumoTech).toHaveBeenCalledWith(ator, "mes", "2026-11-06");
    expect(dados).toMatchObject({
      period: "month", from: "2026-11-01", to: "2026-11-30", label: "novembro de 2026",
      totals: { done: 1, inProgress: 1, planned: 0, canceled: 0 },
      done: [{ id: ID_ITEM, title: "Corrigir X", typeLabel: "Bug", prUrl: "https://github.com/a/b/pull/1", doneAt: quando.toISOString(), url: `https://connect.example.test/controle-interno/${ID_ITEM}` }],
      inProgress: [{ id: "outro", statusLabel: "Em validação", priorityLabel: "Alta", movedInPeriod: true }],
    });
    await ferramenta(LEITOR, "resumo_do_periodo", {});
    expect(s.resumoTech).toHaveBeenLastCalledWith(ator, "semana", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it("resumo_do_periodo recusa data que não existe", async () => {
    const { isError, dados } = await ferramenta(LEITOR, "resumo_do_periodo", { date: "2026-02-30" });
    expect(isError).toBe(true);
    expect(dados).toMatchObject({ error: { code: "validation_error" } });
    expect(s.resumoTech).not.toHaveBeenCalled();
  });

  it("ver_item devolve a version para a próxima alteração", async () => {
    const { dados } = await ferramenta(LEITOR, "ver_item", { id: ID_ITEM });
    expect(dados).toMatchObject({ id: ID_ITEM, version: 3, comments: [{ id: "c-1" }] });
  });

  it("criar_item age com a pessoa do token e a mesma regra das telas", async () => {
    const { isError, dados } = await ferramenta(ESCRITOR, "criar_item", { title: "Busca não acha pelo CNPJ", type: "BUG", priority: 2, assigneeId: "me" });
    expect(isError).toBe(false);
    expect(s.salvarItem).toHaveBeenCalledWith(ator, { title: "Busca não acha pelo CNPJ", type: "BUG", priority: 2, assigneeId: "pessoa-1" });
    expect(dados.id).toBe(ID_ITEM);
  });

  it("atualizar_item manda a version e só os campos pedidos", async () => {
    await ferramenta(ESCRITOR, "atualizar_item", { id: ID_ITEM, version: 3, description: "Nova descrição." });
    expect(s.salvarItem).toHaveBeenCalledWith(ator, expect.objectContaining({ description: "Nova descrição.", title: "Busca de empresas não acha pelo CNPJ" }), ID_ITEM, 3);
  });

  it("conflito volta como erro da ferramenta, com código e mensagem", async () => {
    s.mudarSituacaoItem.mockResolvedValue({ error: CONFLITO, code: "conflict" });
    const { isError, dados } = await ferramenta(ESCRITOR, "mudar_situacao", { id: ID_ITEM, status: "DONE", version: 1 });
    expect(isError).toBe(true);
    expect(dados).toEqual({ error: { code: "conflict", message: CONFLITO } });
  });

  it("entrada fora do esquema é recusada antes de chegar à regra", async () => {
    const { result, error } = await chamar(ESCRITOR, "tools/call", { name: "mudar_situacao", arguments: { id: ID_ITEM, status: "FEITO" } });
    expect(error ?? result?.isError).toBeTruthy();
    expect(s.mudarSituacaoItem).not.toHaveBeenCalled();
  });

  it("comentar", async () => {
    s.comentarItem.mockResolvedValue({ ok: true, id: ID_ITEM, commentId: "c-9" });
    s.comentarioSalvo.mockResolvedValue({ id: "c-9", authorName: "Pessoa fictícia", body: "PR aberto.", createdAt: new Date("2026-11-05T16:00:00Z") });
    const { dados } = await ferramenta(ESCRITOR, "comentar", { id: ID_ITEM, body: "PR aberto." });
    expect(s.comentarItem).toHaveBeenCalledWith(ator, ID_ITEM, "PR aberto.");
    expect(dados).toMatchObject({ id: "c-9", body: "PR aberto." });
  });

  it("anexar decodifica o base64 e usa o armazenamento das telas", async () => {
    s.anexarArquivo.mockResolvedValue({ ok: true, valor: { id: "a-1", nome: "log.txt" } });
    const { dados } = await ferramenta(ESCRITOR, "anexar", { id: ID_ITEM, fileName: "log.txt", contentBase64: Buffer.from("linha de log fictícia").toString("base64"), mimeType: "text/plain" });
    const arquivo = s.anexarArquivo.mock.calls[0][2] as File;
    expect(s.anexarArquivo.mock.calls[0][0]).toEqual(ator);
    expect(arquivo.name).toBe("log.txt");
    expect(Buffer.from(await arquivo.arrayBuffer()).toString()).toBe("linha de log fictícia");
    expect(dados).toMatchObject({ id: "a-1", fileName: "log.txt" });
    const ruim = await ferramenta(ESCRITOR, "anexar", { id: ID_ITEM, fileName: "x.txt", contentBase64: "não é base64!" });
    expect(ruim).toMatchObject({ isError: true, dados: { error: { code: "validation_error" } } });
  });
});
