import { beforeEach, describe, expect, it, vi } from "vitest";
import { ID_ITEM, LEITOR, ESCRITOR, CRITERIO_FALSO, itemFalso } from "./api-fixtures.test-utils";

// As rotas da API pública do Controle interno (`/api/v1/controle-interno`),
// chamadas como o Next chama, com o servidor do Controle interno de mentira:
// o que se confere é a porta — escopo, formato da resposta, erros com código,
// e que a regra chamada é a mesma das telas, com a pessoa do token.

const s = vi.hoisted(() => ({
  listarItens: vi.fn(), detalheItem: vi.fn(), opcoesTech: vi.fn(), salvarItem: vi.fn(), mudarSituacaoItem: vi.fn(), comentarItem: vi.fn(),
  anexarArquivo: vi.fn(), comentarioSalvo: vi.fn(),
}));
vi.mock("@/lib/tokens-pessoais/servidor", async () => ({ autenticarTokenPessoal: (await import("./api-fixtures.test-utils")).autenticarFalso }));
vi.mock("./servidor", async original => ({
  ...await original<typeof import("./servidor")>(),
  listarItens: s.listarItens, detalheItem: s.detalheItem, opcoesTech: s.opcoesTech,
  salvarItem: s.salvarItem, mudarSituacaoItem: s.mudarSituacaoItem, comentarItem: s.comentarItem,
}));
vi.mock("./anexos", () => ({ anexarArquivo: s.anexarArquivo }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ techInternalComment: { findFirstOrThrow: s.comentarioSalvo } }) }));

import * as colecao from "@/app/api/v1/controle-interno/route";
import * as item from "@/app/api/v1/controle-interno/[id]/route";
import * as opcoes from "@/app/api/v1/controle-interno/opcoes/route";
import * as situacao from "@/app/api/v1/controle-interno/[id]/situacao/route";
import * as comentarios from "@/app/api/v1/controle-interno/[id]/comentarios/route";
import * as anexos from "@/app/api/v1/controle-interno/[id]/anexos/route";
import { CONFLITO } from "./regras";

const BASE = "https://connect.example.test/api/v1/controle-interno";
function pedido(caminho: string, { token, metodo = "GET", corpo, headers = {} }: { token?: string; metodo?: string; corpo?: unknown; headers?: Record<string, string> } = {}) {
  // FormData e texto cru vão como estão (o multipart põe o próprio Content-Type); objeto vira JSON.
  const cru = typeof corpo === "string" || corpo instanceof FormData;
  return new Request(`${BASE}${caminho}`, {
    method: metodo,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(corpo !== undefined && !cru ? { "content-type": "application/json" } : {}), ...headers },
    ...(corpo !== undefined ? { body: cru ? corpo : JSON.stringify(corpo) } : {}),
  });
}
const params = (id = ID_ITEM) => ({ params: Promise.resolve({ id }) });
const corpo = async (r: Response) => ({ status: r.status, json: await r.json() as Record<string, unknown> & { error?: { code: string; message: string } } });
const ator = expect.objectContaining({ userId: "pessoa-1", tenantId: "esc-a", via: { tokenId: "tok-1", tokenName: "Claude Code" } });

beforeEach(() => {
  vi.clearAllMocks();
  s.detalheItem.mockResolvedValue(itemFalso());
  s.listarItens.mockResolvedValue({ total: 1, pages: 1, page: 1, items: [itemFalso()] });
  s.salvarItem.mockResolvedValue({ ok: true, id: ID_ITEM });
  s.mudarSituacaoItem.mockResolvedValue({ ok: true, id: ID_ITEM });
});

describe("autenticação nas rotas", () => {
  it("sem token: 401 com código, mensagem e o cabeçalho do Bearer", async () => {
    const r = await colecao.GET(pedido(""));
    const { status, json } = await corpo(r);
    expect(status).toBe(401);
    expect(json.error).toEqual({ code: "unauthenticated", message: expect.any(String) });
    expect(r.headers.get("www-authenticate")).toMatch(/^Bearer /);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(s.listarItens).not.toHaveBeenCalled();
  });

  it("token só de leitura não escreve em nenhuma rota", async () => {
    const respostas = await Promise.all([
      colecao.POST(pedido("", { token: LEITOR, metodo: "POST", corpo: { title: "x", type: "BUG" } })),
      item.PATCH(pedido(`/${ID_ITEM}`, { token: LEITOR, metodo: "PATCH", corpo: { title: "x" } }), params()),
      situacao.POST(pedido(`/${ID_ITEM}/situacao`, { token: LEITOR, metodo: "POST", corpo: { status: "DONE" } }), params()),
      comentarios.POST(pedido(`/${ID_ITEM}/comentarios`, { token: LEITOR, metodo: "POST", corpo: { body: "x" } }), params()),
      anexos.POST(pedido(`/${ID_ITEM}/anexos`, { token: LEITOR, metodo: "POST", corpo: new FormData() }), params()),
    ]);
    for (const r of respostas) expect(await corpo(r)).toMatchObject({ status: 403, json: { error: { code: "insufficient_scope" } } });
    expect(s.salvarItem).not.toHaveBeenCalled();
    expect(s.mudarSituacaoItem).not.toHaveBeenCalled();
    expect(s.comentarItem).not.toHaveBeenCalled();
    expect(s.anexarArquivo).not.toHaveBeenCalled();
  });
});

describe("listar e ver", () => {
  it("traduz os filtros da API para os da tela e devolve o item no formato estável", async () => {
    const { status, json } = await corpo(await colecao.GET(pedido("?status=ALL&type=BUG&assignee=me&q=CNPJ&overdue=true&page=2&priority=2", { token: LEITOR })));
    expect(status).toBe(200);
    expect(s.listarItens).toHaveBeenCalledWith(ator, expect.objectContaining({
      status: "ALL", type: "BUG", assignee: "me", q: "CNPJ", overdue: true, page: 2, priority: "2", view: "lista",
    }));
    expect(json).toEqual({
      total: 1, page: 1, pages: 1,
      items: [{
        id: ID_ITEM, title: "Busca de empresas não acha pelo CNPJ", description: "Passos fictícios.", acceptanceCriteria: CRITERIO_FALSO,
        type: "BUG", typeLabel: "Bug", priority: 2, priorityLabel: "Alta", status: "PENDING", statusLabel: "Pendente",
        system: { mode: "EXISTING", key: "site:site-1", name: "Site fictício" },
        assignee: { id: "pessoa-1", name: "Pessoa fictícia" }, dueDate: "2026-11-20", size: null, sizeLabel: null, origin: null,
        version: 3, createdAt: "2026-11-05T15:00:00.000Z", updatedAt: "2026-11-05T15:00:00.000Z",
        url: `https://connect.example.test/controle-interno/${ID_ITEM}`,
      }],
    });
  });

  it("sem filtro de situação, só os em aberto (como a tela)", async () => {
    await colecao.GET(pedido("", { token: LEITOR }));
    expect(s.listarItens.mock.calls[0][1].status).toBeUndefined();
    await colecao.GET(pedido("?status=OPEN", { token: LEITOR }));
    expect(s.listarItens.mock.calls[1][1].status).toBeUndefined();
  });

  it("filtro inválido ou desconhecido é recusado, e não ignorado", async () => {
    expect(await corpo(await colecao.GET(pedido("?status=FEITO", { token: LEITOR })))).toMatchObject({ status: 422, json: { error: { code: "validation_error" } } });
    const r = await corpo(await colecao.GET(pedido("?situacao=DONE", { token: LEITOR })));
    expect(r).toMatchObject({ status: 422, json: { error: { code: "validation_error", message: "Campo desconhecido: situacao." } } });
    expect(s.listarItens).not.toHaveBeenCalled();
  });

  it("o item vem com comentários, histórico e anexos", async () => {
    const { status, json } = await corpo(await item.GET(pedido(`/${ID_ITEM}`, { token: LEITOR }), params()));
    expect(status).toBe(200);
    expect(s.detalheItem).toHaveBeenCalledWith(ator, ID_ITEM);
    expect(json).toMatchObject({
      id: ID_ITEM, version: 3,
      comments: [{ id: "c-1", author: "Pessoa fictícia", body: "Comentário fictício.", createdAt: "2026-11-05T15:00:00.000Z" }],
      history: [{ version: 3, author: "Pessoa fictícia", changes: [{ field: "Título" }] }],
      attachments: [],
      acceptanceCriteria: CRITERIO_FALSO,
    });
    // Só a marca que ainda vale: a do ponto 2 é de um texto reescrito.
    expect(json.acceptanceChecks).toEqual([{ position: 1, text: "A busca acha pelo CNPJ com e sem máscara.", checkedBy: "Pessoa fictícia", checkedAt: "2026-11-05T15:00:00.000Z" }]);
  });

  it("item sem critério de aceite: o campo vem null e não há pontos conferidos", async () => {
    s.detalheItem.mockResolvedValue(itemFalso({ acceptanceCriteria: null }));
    const { json } = await corpo(await item.GET(pedido(`/${ID_ITEM}`, { token: LEITOR }), params()));
    expect(json).toMatchObject({ acceptanceCriteria: null, acceptanceChecks: [] });
  });

  it("item de outro escritório ou inexistente: 404, sem dizer qual", async () => {
    s.detalheItem.mockResolvedValue(null);
    expect(await corpo(await item.GET(pedido(`/${ID_ITEM}`, { token: LEITOR }), params()))).toMatchObject({ status: 404, json: { error: { code: "not_found" } } });
    expect(await corpo(await item.GET(pedido("/nao-e-uuid", { token: LEITOR }), params("nao-e-uuid")))).toMatchObject({ status: 404 });
  });

  it("sem acesso ao módulo: 403 forbidden", async () => {
    const { ErroTechInterno } = await import("./servidor");
    s.listarItens.mockRejectedValue(new ErroTechInterno("Controle interno indisponível para este acesso.", "forbidden"));
    expect(await corpo(await colecao.GET(pedido("", { token: LEITOR })))).toMatchObject({ status: 403, json: { error: { code: "forbidden", message: "Controle interno indisponível para este acesso." } } });
  });

  it("opções: sistemas com a key, pessoas com o id", async () => {
    s.opcoesTech.mockResolvedValue({ sistemas: [{ chave: "robo:robo-1", nome: "Robô fictício", origem: "robo", ativo: true }], users: [{ id: "pessoa-1", name: "Pessoa fictícia" }], entregas: [{ id: "e-1", title: "Entrega fictícia" }] });
    const { json } = await corpo(await opcoes.GET(pedido("/opcoes", { token: LEITOR })));
    expect(json).toMatchObject({
      systems: [{ key: "robo:robo-1", name: "Robô fictício", origin: "robo", active: true }],
      people: [{ id: "pessoa-1", name: "Pessoa fictícia" }], recentDeliveries: [{ id: "e-1", title: "Entrega fictícia" }],
      types: { BUG: "Bug" }, priorities: { 0: "Baixa", 3: "Urgente" },
    });
  });
});

describe("criar e atualizar", () => {
  it("cria com a pessoa do token, aplica os atalhos e responde 201 com o item", async () => {
    const r = await colecao.POST(pedido("", { token: ESCRITOR, metodo: "POST", corpo: { title: "Novo bug", type: "BUG", assigneeId: "me", systemKey: "robo:robo-1" } }));
    expect(r.status).toBe(201);
    expect(s.salvarItem).toHaveBeenCalledWith(ator, { title: "Novo bug", type: "BUG", assigneeId: "pessoa-1", systemKey: "robo:robo-1", systemMode: "EXISTING" });
    expect((await r.json()).id).toBe(ID_ITEM);
  });

  it("erro da regra das telas volta com o código e a mensagem dela", async () => {
    s.salvarItem.mockResolvedValue({ error: "Informe o título.", code: "validation_error" });
    expect(await corpo(await colecao.POST(pedido("", { token: ESCRITOR, metodo: "POST", corpo: { type: "BUG" } })))).toMatchObject({ status: 422, json: { error: { code: "validation_error", message: "Informe o título." } } });
    s.salvarItem.mockResolvedValue({ error: "Só quem coordena a Tech define o tamanho do item.", code: "forbidden" });
    expect(await corpo(await colecao.POST(pedido("", { token: ESCRITOR, metodo: "POST", corpo: { title: "x", type: "BUG", size: "G" } })))).toMatchObject({ status: 403 });
  });

  it("campo com nome errado, JSON quebrado e corpo grande", async () => {
    expect(await corpo(await colecao.POST(pedido("", { token: ESCRITOR, metodo: "POST", corpo: { titulo: "x", type: "BUG" } })))).toMatchObject({ status: 422, json: { error: { message: "Campo desconhecido: titulo." } } });
    expect(await corpo(await colecao.POST(pedido("", { token: ESCRITOR, metodo: "POST", corpo: "{nao é json", headers: { "content-type": "application/json" } })))).toMatchObject({ status: 400, json: { error: { code: "invalid_json" } } });
    expect(await corpo(await colecao.POST(pedido("", { token: ESCRITOR, metodo: "POST", corpo: { title: "x".repeat(70_000), type: "BUG" } })))).toMatchObject({ status: 413, json: { error: { code: "payload_too_large" } } });
    expect(await corpo(await colecao.POST(pedido("", { token: ESCRITOR, metodo: "POST", corpo: [1, 2] })))).toMatchObject({ status: 422 });
    expect(s.salvarItem).not.toHaveBeenCalled();
  });

  it("PATCH muda só o enviado: o resto vem do item, e a version é a enviada", async () => {
    const r = await item.PATCH(pedido(`/${ID_ITEM}`, { token: ESCRITOR, metodo: "PATCH", corpo: { priority: 3, version: 2 } }), params());
    expect(r.status).toBe(200);
    expect(s.salvarItem).toHaveBeenCalledWith(ator, {
      title: "Busca de empresas não acha pelo CNPJ", description: "Passos fictícios.", acceptanceCriteria: CRITERIO_FALSO, type: "BUG", priority: 3, status: "PENDING",
      systemMode: "EXISTING", systemKey: "site:site-1", assigneeId: "pessoa-1", dueDate: "2026-11-20", size: null, originItemId: null,
    }, ID_ITEM, 2);
  });

  it("o critério de aceite entra e sai pelo campo próprio, sem mexer na descrição", async () => {
    await item.PATCH(pedido(`/${ID_ITEM}`, { token: ESCRITOR, metodo: "PATCH", corpo: { acceptanceCriteria: "Mudança: nova.", version: 3 } }), params());
    expect(s.salvarItem.mock.calls[0][1]).toMatchObject({ acceptanceCriteria: "Mudança: nova.", description: "Passos fictícios." });
    await item.PATCH(pedido(`/${ID_ITEM}`, { token: ESCRITOR, metodo: "PATCH", corpo: { acceptanceCriteria: null } }), params());
    expect(s.salvarItem.mock.calls[1][1]).toMatchObject({ acceptanceCriteria: null, description: "Passos fictícios." });
    await colecao.POST(pedido("", { token: ESCRITOR, metodo: "POST", corpo: { title: "Novo", type: "BUG", acceptanceCriteria: "Passos:\n1. x" } }));
    expect(s.salvarItem.mock.calls[2][1]).toEqual({ title: "Novo", type: "BUG", acceptanceCriteria: "Passos:\n1. x" });
  });

  it("PATCH sem version usa a atual; trocar o modo do sistema limpa a chave antiga", async () => {
    await item.PATCH(pedido(`/${ID_ITEM}`, { token: ESCRITOR, metodo: "PATCH", corpo: { systemMode: "NONE" } }), params());
    expect(s.salvarItem.mock.calls[0][1]).toMatchObject({ systemMode: "NONE", systemKey: null });
    expect(s.salvarItem.mock.calls[0][3]).toBe(3);
    await item.PATCH(pedido(`/${ID_ITEM}`, { token: ESCRITOR, metodo: "PATCH", corpo: { systemKey: null } }), params());
    expect(s.salvarItem.mock.calls[1][1]).toMatchObject({ systemMode: "NONE", systemKey: null });
  });

  it("conflito de versão: 409 com a mensagem das telas", async () => {
    s.salvarItem.mockResolvedValue({ error: CONFLITO, code: "conflict" });
    expect(await corpo(await item.PATCH(pedido(`/${ID_ITEM}`, { token: ESCRITOR, metodo: "PATCH", corpo: { title: "x", version: 1 } }), params())))
      .toMatchObject({ status: 409, json: { error: { code: "conflict", message: CONFLITO } } });
  });
});

describe("situação, comentário e anexo", () => {
  it("muda a situação com a version enviada, ou com a atual quando não vem", async () => {
    await situacao.POST(pedido(`/${ID_ITEM}/situacao`, { token: ESCRITOR, metodo: "POST", corpo: { status: "IN_PROGRESS", version: 3 } }), params());
    expect(s.mudarSituacaoItem).toHaveBeenLastCalledWith(ator, ID_ITEM, "IN_PROGRESS", 3, {});
    expect(s.detalheItem).toHaveBeenCalledTimes(1); // só a resposta
    await situacao.POST(pedido(`/${ID_ITEM}/situacao`, { token: ESCRITOR, metodo: "POST", corpo: { status: "VALIDATION" } }), params());
    expect(s.mudarSituacaoItem).toHaveBeenLastCalledWith(ator, ID_ITEM, "VALIDATION", 3, {});
    // Ao concluir, o PR e o commit da mudança seguem junto (06/11/2026).
    await situacao.POST(pedido(`/${ID_ITEM}/situacao`, { token: ESCRITOR, metodo: "POST", corpo: { status: "DONE", version: 3, prUrl: "https://github.com/o/r/pull/1", commitSha: "abc1234" } }), params());
    expect(s.mudarSituacaoItem).toHaveBeenLastCalledWith(ator, ID_ITEM, "DONE", 3, { prUrl: "https://github.com/o/r/pull/1", commitSha: "abc1234" });
    expect(await corpo(await situacao.POST(pedido(`/${ID_ITEM}/situacao`, { token: ESCRITOR, metodo: "POST", corpo: {} }), params()))).toMatchObject({ status: 422 });
  });

  it("comenta e devolve o comentário criado", async () => {
    s.comentarItem.mockResolvedValue({ ok: true, id: ID_ITEM, commentId: "c-9" });
    s.comentarioSalvo.mockResolvedValue({ id: "c-9", authorName: "Pessoa fictícia", body: "Feito no PR.", createdAt: new Date("2026-11-05T16:00:00Z") });
    const { status, json } = await corpo(await comentarios.POST(pedido(`/${ID_ITEM}/comentarios`, { token: ESCRITOR, metodo: "POST", corpo: { body: "Feito no PR." } }), params()));
    expect(status).toBe(201);
    expect(s.comentarItem).toHaveBeenCalledWith(ator, ID_ITEM, "Feito no PR.");
    expect(json).toEqual({ id: "c-9", itemId: ID_ITEM, author: "Pessoa fictícia", body: "Feito no PR.", createdAt: "2026-11-05T16:00:00.000Z" });
  });

  it("anexa por multipart, com o armazenamento das telas", async () => {
    s.anexarArquivo.mockResolvedValue({ ok: true, valor: { id: "a-1", nome: "erro.png" } });
    const form = new FormData(); form.set("arquivo", new File([new Uint8Array([1, 2, 3])], "erro.png", { type: "image/png" }));
    const { status, json } = await corpo(await anexos.POST(pedido(`/${ID_ITEM}/anexos`, { token: ESCRITOR, metodo: "POST", corpo: form }), params()));
    expect(status).toBe(201);
    expect(s.anexarArquivo).toHaveBeenCalledWith(ator, ID_ITEM, expect.any(File));
    expect(json).toEqual({ id: "a-1", itemId: ID_ITEM, fileName: "erro.png", url: "https://connect.example.test/api/tech-interno/anexos/a-1" });
    s.anexarArquivo.mockResolvedValue({ ok: false, erro: "Item não encontrado.", status: 404 });
    expect(await corpo(await anexos.POST(pedido(`/${ID_ITEM}/anexos`, { token: ESCRITOR, metodo: "POST", corpo: form }), params()))).toMatchObject({ status: 404, json: { error: { code: "not_found" } } });
    expect(await corpo(await anexos.POST(pedido(`/${ID_ITEM}/anexos`, { token: ESCRITOR, metodo: "POST", corpo: { arquivo: "x" } }), params()))).toMatchObject({ status: 422 });
  });
});
