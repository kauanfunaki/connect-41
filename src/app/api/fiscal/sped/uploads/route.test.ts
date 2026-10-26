import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// As rotas do envio em partes (API-CONNECT §14.4): abrir, a parte (o proxy
// do navegador ao motor), ver, concluir e cancelar. O cliente do motor é o de
// verdade; o motor responde com as fixtures reais.

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1", role: "ADMIN" } as { tenantId: string; userId: string; role: string },
  pode: vi.fn(),
  audit: vi.fn(),
  revalidar: vi.fn(),
  fetch: vi.fn(),
  motor: null as unknown,
}));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx, podeExcluir: () => true }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/audit", () => ({ logAudit: m.audit }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidar }));
vi.mock("@/lib/fiscal/motor/servidor", () => ({
  abrirMotor: async () => m.motor,
  atorDaSessao: async () => ({ id: "usr_teste", nome: "Kátia Souza", email: "katia@41contabil.com.br", tenant: "ten_teste" }),
  estabelecimentosDaRaiz: async () => ({ visiveis: [], semCadastro: [], semMotor: [] }),
}));
process.env.JWT_ACCESS_SECRET = "segredo-de-teste";
const { criarClienteDoMotor } = await import("@/lib/sped/motor");
const { emitirTokenDoUpload, conferirTokenDoUpload } = await import("@/lib/fiscal/motor/tokenDoUpload");
const { limitarCorpo } = await import("@/lib/fiscal/motor/portaoDoUpload");
const criar = await import("./route");
const sessao = await import("./[id]/route");
const parte = await import("./[id]/partes/[n]/route");
const concluir = await import("./[id]/concluir/route");

const DIR = path.resolve(__dirname, "../../../../../../tests/fixtures/connect_v1/escritas");
type Fx = { requisicao: { corpo_cru?: { conteudo_base64: string; sha256: string; tamanho: number } }; resposta: { status: number; corpo: unknown; x_custo?: string; idempotent_replay?: string } };
const fixture = (nome: string) => JSON.parse(readFileSync(path.join(DIR, `${nome}.json`), "utf8")) as Fx;
const R = "17122471";
const ID = "bab7c54df686aa60a645bbcd4930cff7";
const GESTO = "c41:11111111-2222-3333-4444-555555555555";
const MiB = 1024 * 1024;
const EXPIRA = "2099-01-01T00:00:00+00:00";

function responder(nome: string) {
  const r = fixture(nome).resposta;
  m.fetch.mockImplementationOnce(async (_url: string, init: RequestInit) => {
    // Como o motor: consome o corpo (stream ou não) antes de responder.
    if (init.body instanceof ReadableStream) await new Response(init.body).arrayBuffer();
    const headers: Record<string, string> = { "Content-Type": "application/json", "X-Custo": r.x_custo ?? "leve" };
    if (r.idempotent_replay) headers["Idempotent-Replay"] = r.idempotent_replay;
    return new Response(r.status === 204 ? null : JSON.stringify(r.corpo), { status: r.status, headers });
  });
}

const tokenDe = (extra: Partial<{ id: string; tenantId: string; raiz: string; userId: string }> = {}, expira = EXPIRA) =>
  emitirTokenDoUpload({ id: ID, tenantId: "t1", raiz: R, userId: "u1", ...extra }, expira);

function req(metodo: string, caminho: string, opcoes: { headers?: Record<string, string>; corpo?: Uint8Array | string; raiz?: string } = {}) {
  const url = new URL(`http://connect/api/fiscal/sped/uploads${caminho}?raiz=${opcoes.raiz ?? R}`);
  // Valor vazio = o cabeçalho não vai.
  const headers = new Headers(Object.entries(opcoes.headers ?? {}).filter(([, v]) => v !== ""));
  const corpo = typeof opcoes.corpo === "string" ? new TextEncoder().encode(opcoes.corpo) : opcoes.corpo;
  const body = corpo ? new ReadableStream<Uint8Array>({ start(c) { for (let i = 0; i < corpo.length; i += 4096) c.enqueue(corpo.subarray(i, i + 4096)); c.close(); } }) : null;
  return { headers, nextUrl: url, url: url.toString(), body, json: async () => JSON.parse(new TextDecoder().decode(corpo)) } as never;
}
const params = <T,>(p: T) => ({ params: Promise.resolve(p) });

const parteFx = fixture("upload_parte");
const bytesDaParte = new Uint8Array(Buffer.from(parteFx.requisicao.corpo_cru!.conteudo_base64, "base64"));
const pedidoDaParte = (extra: { headers?: Record<string, string>; corpo?: Uint8Array; n?: string; id?: string; raiz?: string } = {}) => [
  req("PUT", `/${extra.id ?? ID}/partes/${extra.n ?? "1"}`, {
    raiz: extra.raiz,
    corpo: extra.corpo ?? bytesDaParte,
    headers: { "Content-Type": "application/octet-stream", "Content-Length": String((extra.corpo ?? bytesDaParte).byteLength), "X-Parte-SHA256": parteFx.requisicao.corpo_cru!.sha256, "X-Upload-Token": tokenDe(), ...extra.headers },
  }),
  params({ id: extra.id ?? ID, n: extra.n ?? "1" }),
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  m.fetch.mockReset();
  m.ctx = { tenantId: "t1", userId: "u1", role: "ADMIN" };
  m.pode.mockResolvedValue(true);
  m.motor = { escrita: true, raizes: [R], cliente: criarClienteDoMotor({ baseUrl: "https://motor", token: "t-leitura", tokenEscrita: "t-escrita" }, { fetch: m.fetch as never, esperar: async () => {} }) };
});

describe("o token do dono da sessão", () => {
  it("vale para a sessão, o escritório, a raiz e o usuário que a abriram — e só até vencer", () => {
    const dono = { id: ID, tenantId: "t1", raiz: R, userId: "u1" };
    const t = emitirTokenDoUpload(dono, EXPIRA);
    expect(conferirTokenDoUpload(t, dono)).toBe("ok");
    expect(conferirTokenDoUpload(t, { ...dono, userId: "u2" })).toBe("de_outro");
    expect(conferirTokenDoUpload(t, { ...dono, tenantId: "t2" })).toBe("de_outro");
    expect(conferirTokenDoUpload(t, { ...dono, raiz: "99999999" })).toBe("de_outro");
    expect(conferirTokenDoUpload(t, { ...dono, id: "f".repeat(32) })).toBe("de_outro");
    expect(conferirTokenDoUpload(null, dono)).toBe("ausente");
    // Assinatura de outro segredo, carga trocada, lixo.
    expect(conferirTokenDoUpload(emitirTokenDoUpload(dono, EXPIRA, Date.now(), "outro"), dono)).toBe("invalido");
    const [carga, ass] = t.split(".");
    const outra = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(carga, "base64url").toString()), u: "u2" })).toString("base64url");
    expect(conferirTokenDoUpload(`${outra}.${ass}`, { ...dono, userId: "u2" })).toBe("invalido");
    expect(conferirTokenDoUpload("x.y.z", dono)).toBe("invalido");
    // Vence no `expira_em` do motor, e nunca passa de 24 h.
    const agora = Date.parse("2026-10-23T15:00:00Z");
    const curto = emitirTokenDoUpload(dono, "2026-10-23T16:00:00Z", agora);
    expect(conferirTokenDoUpload(curto, dono, agora + 59 * 60_000)).toBe("ok");
    expect(conferirTokenDoUpload(curto, dono, agora + 61 * 60_000)).toBe("vencido");
    expect(conferirTokenDoUpload(emitirTokenDoUpload(dono, "2099-01-01T00:00:00Z", agora), dono, agora + 25 * 3600_000)).toBe("vencido");
  });
});

describe("abrir a sessão", () => {
  const abrir = (corpo: unknown, raiz?: string) => criar.POST(req("POST", "", { raiz, corpo: JSON.stringify(corpo), headers: { "Content-Type": "application/json" } }));

  it("cria no motor com a chave derivada do gesto, devolve o Upload e o token do dono, e audita", async () => {
    responder("upload_criar");
    const r = await abrir({ nome: "lote-setembro.zip", tamanho: 9701, gesto: GESTO });
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.dados.upload).toMatchObject({ id: ID, partes_esperadas: 1, tamanho_parte: 8 * MiB });
    // O token vence no `expira_em` da fixture (24/10/2026 15:13 UTC): conferir
    // com o relógio de verdade fazia o teste falhar a partir dessa data.
    const antesDeVencer = Date.parse("2026-10-24T15:00:00Z");
    expect(conferirTokenDoUpload(corpo.dados.token, { id: ID, tenantId: "t1", raiz: R, userId: "u1" }, antesDeVencer)).toBe("ok");
    const [url, init] = m.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://motor/api/connect/v1/uploads?cnpj_raiz=17122471");
    expect(JSON.parse(init.body as string)).toEqual({ nome: "lote-setembro.zip", tamanho: 9701 });
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toMatch(/^c41:[0-9a-f]{64}$/);
    expect(m.pode).toHaveBeenCalledWith(expect.anything(), "fiscal_acervo", "agir");
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "fiscal.sped.upload.criado", entityType: "SpedUpload", entityId: ID }));
  });

  it("a nova tentativa do mesmo gesto repete a chave (o motor devolve a mesma sessão); gesto novo, chave nova", async () => {
    responder("upload_criar"); responder("upload_criar"); responder("upload_criar");
    await abrir({ nome: "lote-setembro.zip", tamanho: 9701, gesto: GESTO });
    await abrir({ nome: "lote-setembro.zip", tamanho: 9701, gesto: GESTO });
    await abrir({ nome: "lote-setembro.zip", tamanho: 9701, gesto: "c41:99999999-2222-3333-4444-555555555555" });
    const chaves = m.fetch.mock.calls.map((c) => ((c[1] as RequestInit).headers as Record<string, string>)["Idempotency-Key"]);
    expect(chaves[0]).toBe(chaves[1]);
    expect(chaves[2]).not.toBe(chaves[0]);
  });

  it("acima de 500 MB, nome sem extensão aceita ou sem gesto: recusa sem chamar o motor", async () => {
    expect((await abrir({ nome: "a.zip", tamanho: 500 * MiB + 1, gesto: GESTO })).status).toBe(413);
    expect((await abrir({ nome: "a.rar", tamanho: 10, gesto: GESTO })).status).toBe(422);
    expect((await abrir({ nome: "a.zip", tamanho: 0, gesto: GESTO })).status).toBe(422);
    expect((await abrir({ nome: "a.zip", tamanho: 10 })).status).toBe(400);
    expect(m.fetch).not.toHaveBeenCalled();
  });

  it("sem agir, sem token de escrita ou raiz fora do alcance: recusa", async () => {
    m.pode.mockResolvedValue(false);
    expect((await abrir({ nome: "a.zip", tamanho: 10, gesto: GESTO })).status).toBe(403);
    m.pode.mockResolvedValue(true);
    expect((await abrir({ nome: "a.zip", tamanho: 10, gesto: GESTO }, "99999999")).status).toBe(403);
    (m.motor as { escrita: boolean }).escrita = false;
    expect((await abrir({ nome: "a.zip", tamanho: 10, gesto: GESTO })).status).toBe(409);
    expect(m.fetch).not.toHaveBeenCalled();
  });

  it("413 do motor passa adiante", async () => {
    responder("erro_upload_corpo_grande");
    const r = await abrir({ nome: "enorme.zip", tamanho: 400 * MiB, gesto: GESTO });
    expect(r.status).toBe(413);
  });
});

describe("a parte: do navegador ao motor, pelo Connect", () => {
  it("repassa o corpo como stream, com o mesmo Content-Length e o SHA-256 da parte", async () => {
    let recebido: Uint8Array | null = null;
    m.fetch.mockImplementationOnce(async (_url: string, init: RequestInit) => {
      expect(init.body).toBeInstanceOf(ReadableStream);
      expect((init as { duplex?: string }).duplex).toBe("half");
      recebido = new Uint8Array(await new Response(init.body).arrayBuffer());
      return new Response(JSON.stringify(fixture("upload_parte").resposta.corpo), { status: 200, headers: { "Content-Type": "application/json", "X-Custo": "leve" } });
    });
    const r = await parte.PUT(...pedidoDaParte());
    expect(r.status).toBe(200);
    expect((await r.json()).dados).toMatchObject({ numero: 1, partes_recebidas: [1] });
    const [url, init] = m.fetch.mock.calls[0] as [string, RequestInit];
    const h = init.headers as Record<string, string>;
    expect(url).toBe(`https://motor/api/connect/v1/uploads/${ID}/partes/1?cnpj_raiz=17122471`);
    expect([h["Content-Type"], h["Content-Length"], h["X-Parte-SHA256"], h.Authorization]).toEqual(["application/octet-stream", String(bytesDaParte.byteLength), parteFx.requisicao.corpo_cru!.sha256, "Bearer t-escrita"]);
    expect(h["Idempotency-Key"]).toBeUndefined();
    expect(h["X-Upload-Token"]).toBeUndefined();
    expect(createHash("sha256").update(recebido!).digest("hex")).toBe(parteFx.requisicao.corpo_cru!.sha256);
    // A parte não é auditada uma a uma (a abertura e a conclusão são).
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("tamanho: sem Content-Length 411, acima de 8 MiB 413, vazio 422 — antes do portão e sem ler o corpo", async () => {
    expect((await parte.PUT(...pedidoDaParte({ headers: { "Content-Length": "" } }))).status).toBe(411);
    expect((await parte.PUT(...pedidoDaParte({ headers: { "Content-Length": String(8 * MiB + 1) } }))).status).toBe(413);
    expect((await parte.PUT(...pedidoDaParte({ headers: { "Content-Length": "0" } }))).status).toBe(422);
    expect((await parte.PUT(...pedidoDaParte({ headers: { "Content-Type": "multipart/form-data" } }))).status).toBe(415);
    expect((await parte.PUT(...pedidoDaParte({ n: "0" }))).status).toBe(422);
    expect((await parte.PUT(...pedidoDaParte({ n: "64" }))).status).toBe(422);
    expect((await parte.PUT(...pedidoDaParte({ headers: { "X-Parte-SHA256": "xyz" } }))).status).toBe(422);
    expect(m.pode).not.toHaveBeenCalled();
    expect(m.fetch).not.toHaveBeenCalled();
  });

  it("exatamente 8 MiB passa", async () => {
    responder("upload_parte");
    const r = await parte.PUT(...pedidoDaParte({ corpo: new Uint8Array(8 * MiB), headers: { "X-Parte-SHA256": "" } }));
    expect(r.status).toBe(200);
    expect(((m.fetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>)["Content-Length"]).toBe(String(8 * MiB));
  });

  it("portão de §13: sem agir 403, sem token de escrita 409", async () => {
    m.pode.mockResolvedValue(false);
    expect((await parte.PUT(...pedidoDaParte())).status).toBe(403);
    m.pode.mockResolvedValue(true);
    (m.motor as { escrita: boolean }).escrita = false;
    expect((await parte.PUT(...pedidoDaParte())).status).toBe(409);
    expect(m.fetch).not.toHaveBeenCalled();
  });

  it("dono da sessão: sem token, token de outra pessoa, de outra sessão, de outra raiz ou vencido — 404, sem chamar", async () => {
    const recusas = [
      pedidoDaParte({ headers: { "X-Upload-Token": "" } }),
      pedidoDaParte({ headers: { "X-Upload-Token": tokenDe({ userId: "u2" }) } }),
      pedidoDaParte({ headers: { "X-Upload-Token": tokenDe({ tenantId: "t2" }) } }),
      pedidoDaParte({ headers: { "X-Upload-Token": tokenDe({ id: "f".repeat(32) }) } }),
      pedidoDaParte({ headers: { "X-Upload-Token": tokenDe({ raiz: "11111111" }) } }),
      pedidoDaParte({ headers: { "X-Upload-Token": tokenDe({}, "2020-01-01T00:00:00Z") } }),
      pedidoDaParte({ id: "../../execucoes" }),
    ];
    for (const r of recusas) expect((await parte.PUT(...r)).status).toBe(404);
    // A mesma pessoa noutra sessão de usuário: também 404.
    m.ctx = { tenantId: "t1", userId: "u2", role: "ADMIN" };
    expect((await parte.PUT(...pedidoDaParte())).status).toBe(404);
    expect(m.fetch).not.toHaveBeenCalled();
  });

  it("a recusa do motor passa adiante (422 parte_invalida)", async () => {
    responder("erro_parte_invalida");
    const r = await parte.PUT(...pedidoDaParte({ n: "2" }));
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ ok: false, codigo: "parte_invalida" });
  });

  it("corpo maior que o declarado é cortado no caminho", async () => {
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(10)); c.enqueue(new Uint8Array(10)); c.close(); } });
    await expect(new Response(limitarCorpo(stream, 15)).arrayBuffer()).rejects.toThrow(/Content-Length/);
    const ok = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(10)); c.close(); } });
    expect((await new Response(limitarCorpo(ok, 10)).arrayBuffer()).byteLength).toBe(10);
  });
});

describe("ver, concluir e cancelar", () => {
  const comToken = (metodo: string, caminho: string, corpo?: unknown, headers: Record<string, string> = {}) =>
    req(metodo, caminho, { corpo: corpo === undefined ? undefined : JSON.stringify(corpo), headers: { "X-Upload-Token": tokenDe(), "Content-Type": "application/json", ...headers } });
  const SHA = "9419d2d8db02fbe3a719148d67d212eeb9ba66567505d05962d0ed2cdd61269b";

  it("ver: o Upload com as partes recebidas, pelo token de leitura do motor", async () => {
    responder("upload_ver");
    const r = await sessao.GET(comToken("GET", `/${ID}`), params({ id: ID }));
    expect(r.status).toBe(200);
    expect((await r.json()).dados).toMatchObject({ partes_recebidas: [1], estado: "aberta" });
    expect(((m.fetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>).Authorization).toBe("Bearer t-leitura");
  });

  it("concluir: manda o SHA-256 do arquivo, audita a importação e relê Documentos", async () => {
    responder("upload_concluir");
    const r = await concluir.POST(comToken("POST", `/${ID}/concluir`, { sha256: SHA }), params({ id: ID }));
    expect(r.status).toBe(200);
    expect((await r.json()).dados).toMatchObject({ importacao_id: 206, upload_id: ID });
    expect(JSON.parse((m.fetch.mock.calls[0][1] as RequestInit).body as string)).toEqual({ sha256: SHA });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "fiscal.sped.upload.concluido", entityType: "SpedImportacao", entityId: "206" }));
    expect(m.revalidar).toHaveBeenCalledWith("/fiscal/documentos");
  });

  it("concluir: os 60 s estouram e a sessão já está concluída — pede o relatório de novo (replay)", async () => {
    m.fetch.mockImplementationOnce(async () => { throw new DOMException("tempo", "TimeoutError"); });
    m.fetch.mockImplementationOnce(async () => new Response(JSON.stringify({ ...(fixture("upload_ver").resposta.corpo as object), estado: "concluida", importacao_id: 206 }), { status: 200, headers: { "Content-Type": "application/json" } }));
    responder("upload_concluir_replay");
    const r = await concluir.POST(comToken("POST", `/${ID}/concluir`, { sha256: SHA }), params({ id: ID }));
    expect(r.status).toBe(200);
    expect(m.fetch.mock.calls.map((c) => (c[1] as RequestInit).method)).toEqual(["POST", "GET", "POST"]);
  });

  it("concluir: ainda concluindo — 409 upload_em_andamento, sem repetir; aberta — devolve o tempo esgotado", async () => {
    m.fetch.mockImplementationOnce(async () => { throw new DOMException("tempo", "TimeoutError"); });
    m.fetch.mockImplementationOnce(async () => new Response(JSON.stringify({ ...(fixture("upload_ver").resposta.corpo as object), estado: "concluindo" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const r = await concluir.POST(comToken("POST", `/${ID}/concluir`, { sha256: SHA }), params({ id: ID }));
    expect([r.status, (await r.json()).codigo]).toEqual([409, "upload_em_andamento"]);
    m.fetch.mockImplementationOnce(async () => { throw new DOMException("tempo", "TimeoutError"); });
    responder("upload_ver");
    const r2 = await concluir.POST(comToken("POST", `/${ID}/concluir`, { sha256: SHA }), params({ id: ID }));
    expect([r2.status, (await r2.json()).codigo]).toEqual([504, "tempo_esgotado"]);
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("concluir: 503 motor_ocupado não se repete; SHA-256 inválido nem sai", async () => {
    m.fetch.mockImplementationOnce(async () => new Response(JSON.stringify({ erro: "ocupado", codigo: "motor_ocupado" }), { status: 503, headers: { "Content-Type": "application/json", "Retry-After": "5" } }));
    const r = await concluir.POST(comToken("POST", `/${ID}/concluir`, { sha256: SHA }), params({ id: ID }));
    expect([r.status, (await r.json()).renovarChave]).toEqual([503, false]);
    expect(m.fetch).toHaveBeenCalledTimes(1);
    expect((await concluir.POST(comToken("POST", `/${ID}/concluir`, { sha256: "abc" }), params({ id: ID }))).status).toBe(422);
    expect(m.fetch).toHaveBeenCalledTimes(1);
  });

  it("concluir: 422 upload_incompleto chega com as partes que faltam", async () => {
    responder("erro_upload_incompleto");
    const r = await concluir.POST(comToken("POST", `/${ID}/concluir`, { sha256: SHA }), params({ id: ID }));
    expect(await r.json()).toMatchObject({ codigo: "upload_incompleto", detalhe: { faltam: [1, 2] } });
  });

  it("cancelar: DELETE no motor (204) e auditado; sem token do dono, 404", async () => {
    responder("upload_apagar");
    const r = await sessao.DELETE(comToken("DELETE", `/${ID}`), params({ id: ID }));
    expect(r.status).toBe(200);
    expect((m.fetch.mock.calls[0][1] as RequestInit).method).toBe("DELETE");
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "fiscal.sped.upload.cancelado", entityId: ID }));
    const outro = await sessao.DELETE(comToken("DELETE", `/${ID}`, undefined, { "X-Upload-Token": tokenDe({ userId: "u9" }) }), params({ id: ID }));
    expect(outro.status).toBe(404);
    expect(m.fetch).toHaveBeenCalledTimes(1);
  });
});
