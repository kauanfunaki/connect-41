import { readFileSync } from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  pode: vi.fn(),
  audit: vi.fn(),
  revalidar: vi.fn(),
  fetch: vi.fn(),
  motor: null as unknown,
}));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => ({ tenantId: "t1", userId: "u1", role: "ADMIN" }), podeExcluir: () => true }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/audit", () => ({ logAudit: m.audit }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidar }));
vi.mock("@/lib/fiscal/motor/servidor", () => ({
  abrirMotor: async () => m.motor,
  atorDaSessao: async () => ({ id: "usr_teste", nome: "Kátia Souza", email: "katia@41contabil.com.br", tenant: "ten_teste" }),
  estabelecimentosDaRaiz: async () => ({ visiveis: [], semCadastro: [], semMotor: [] }),
}));
const { criarClienteDoMotor } = await import("@/lib/sped/motor");
const { POST } = await import("./route");

const DIR = path.resolve(__dirname, "../../../../../../../tests/fixtures/connect_v1/escritas");
const fixture = (nome: string) => JSON.parse(readFileSync(path.join(DIR, `${nome}.json`), "utf8")) as { resposta: { status: number; corpo: unknown; x_custo?: string } };
const MiB = 1024 * 1024;
const GESTO = "c41:11111111-2222-3333-4444-555555555555";

function responder(nome: string) {
  const r = fixture(nome).resposta;
  m.fetch.mockImplementationOnce(async () => new Response(JSON.stringify(r.corpo), { status: r.status, headers: { "Content-Type": "application/json", "X-Custo": r.x_custo ?? "pesada" } }));
}

async function pedido(destino: string, campos: [string, string | File][], opcoes: { raiz?: string; semTamanho?: boolean; tamanho?: number } = {}) {
  const form = new FormData();
  for (const [k, v] of campos) form.append(k, v);
  const serial = new Response(form);
  const corpo = new Uint8Array(await serial.arrayBuffer());
  const headers: Record<string, string> = { "Content-Type": serial.headers.get("Content-Type")! };
  if (!opcoes.semTamanho) headers["Content-Length"] = String(opcoes.tamanho ?? corpo.byteLength);
  const req = new Request(`http://connect/api/fiscal/sped/envios/${destino}?raiz=${opcoes.raiz ?? "17122471"}`, { method: "POST", body: corpo, headers });
  // `new Request` recalcula o Content-Length a partir do corpo; o navegador sem ele é simulado aqui.
  const h = new Headers(req.headers);
  if (opcoes.semTamanho) h.delete("content-length");
  else h.set("content-length", headers["Content-Length"]);
  const falso = { headers: h, nextUrl: new URL(req.url), url: req.url, formData: () => req.formData() };
  return [falso as never, { params: Promise.resolve({ destino }) }] as const;
}
const pdf = () => new File(["%PDF-1.4 fixture 0eb6dadc16c44254946598a3d047bf32"], "TESTE-ESCRITAS.pdf");

beforeEach(() => {
  vi.clearAllMocks();
  m.fetch.mockReset();
  m.pode.mockResolvedValue(true);
  m.motor = { escrita: true, raizes: ["17122471"], cliente: criarClienteDoMotor({ baseUrl: "https://motor", token: "t-leitura", tokenEscrita: "t-escrita" }, { fetch: m.fetch as never, esperar: async () => {} }) };
});

describe("envio de documentos", () => {
  it("repassa o multipart com Content-Length, a chave derivada e o ator; audita e relê Documentos", async () => {
    responder("documentos_envio");
    const r = await POST(...await pedido("documentos", [["gesto", GESTO], ["arquivos", pdf()], ["arquivos", new File(["nada"], "leia-me.txt")]]));
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo).toMatchObject({ ok: true, dados: { importacao_id: 100, resumo: { novos: 1, ignorados: 1 } } });
    const [url, init] = m.fetch.mock.calls[0] as [string, RequestInit];
    const h = init.headers as Record<string, string>;
    expect(url).toBe("https://motor/api/connect/v1/documentos?cnpj_raiz=17122471");
    expect(Number(h["Content-Length"])).toBe((init.body as Uint8Array).byteLength);
    expect(h["Idempotency-Key"]).toMatch(/^c41:[0-9a-f]{64}$/);
    // O gesto não vai ao motor; os arquivos vão com o nome da parte do contrato.
    const enviado = await new Response(init.body as BodyInit, { headers: { "Content-Type": h["Content-Type"] } }).formData();
    expect([...enviado.keys()]).toEqual(["arquivos", "arquivos"]);
    expect(m.pode).toHaveBeenCalledWith(expect.anything(), "fiscal_acervo", "agir");
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "fiscal.sped.documentos.enviados", entityType: "SpedImportacao", entityId: "100" }));
    expect(m.revalidar).toHaveBeenCalledWith("/fiscal/documentos");
  });

  it("a nova tentativa do mesmo arquivo, no mesmo gesto, manda a mesma chave (replay); gesto novo, chave nova", async () => {
    responder("documentos_envio"); responder("documentos_envio"); responder("documentos_envio");
    await POST(...await pedido("documentos", [["gesto", GESTO], ["arquivos", pdf()]]));
    await POST(...await pedido("documentos", [["gesto", GESTO], ["arquivos", pdf()]]));
    await POST(...await pedido("documentos", [["gesto", "c41:99999999-2222-3333-4444-555555555555"], ["arquivos", pdf()]]));
    const chaves = m.fetch.mock.calls.map((c) => ((c[1] as RequestInit).headers as Record<string, string>)["Idempotency-Key"]);
    expect(chaves[0]).toBe(chaves[1]);
    expect(chaves[2]).not.toBe(chaves[0]);
  });

  it("sem Content-Length: 411; acima do teto: 413 apontando o envio em partes — sem ler o corpo nem chamar", async () => {
    expect((await POST(...await pedido("documentos", [["gesto", GESTO], ["arquivos", pdf()]], { semTamanho: true }))).status).toBe(411);
    const grande = await POST(...await pedido("documentos", [["gesto", GESTO], ["arquivos", pdf()]], { tamanho: 27 * MiB }));
    expect(grande.status).toBe(413);
    expect((await grande.json()).mensagem).toMatch(/em partes/);
    expect(m.pode).not.toHaveBeenCalled();
    expect(m.fetch).not.toHaveBeenCalled();
  });

  it("os arquivos acima do teto (menos o envelope) também são recusados na rota", async () => {
    const r = await POST(...await pedido("documentos", [["gesto", GESTO], ["arquivos", new File([new Uint8Array(25 * MiB)], "lote.zip")]]));
    expect(r.status).toBe(413);
    expect(m.fetch).not.toHaveBeenCalled();
  });

  it("sem agir no módulo ou sem token de escrita: recusa sem chamar", async () => {
    m.pode.mockResolvedValue(false);
    expect((await POST(...await pedido("documentos", [["gesto", GESTO], ["arquivos", pdf()]]))).status).toBe(403);
    m.pode.mockResolvedValue(true);
    (m.motor as { escrita: boolean }).escrita = false;
    const r = await POST(...await pedido("documentos", [["gesto", GESTO], ["arquivos", pdf()]]));
    expect(r.status).toBe(409);
    expect((await r.json()).codigo).toBe("escrita_nao_habilitada");
    expect(m.fetch).not.toHaveBeenCalled();
  });

  it("raiz fora do alcance, destino desconhecido ou sem gesto: recusa", async () => {
    expect((await POST(...await pedido("documentos", [["gesto", GESTO], ["arquivos", pdf()]], { raiz: "99999999" }))).status).toBe(403);
    expect((await POST(...await pedido("outro", [["gesto", GESTO]]))).status).toBe(404);
    expect((await POST(...await pedido("documentos", [["arquivos", pdf()]]))).status).toBe(400);
    expect(m.fetch).not.toHaveBeenCalled();
  });
});

describe("relatório do Omie e planilha do BPO", () => {
  it("Omie: um arquivo, competência opcional; audita e relê a Conferência", async () => {
    responder("conferencia_documentos_envio");
    const r = await POST(...await pedido("omie", [["gesto", GESTO], ["arquivo", new File(["Numero;Competencia\n1;2032-03\n"], "TESTE-ESCRITAS-omie.csv")]]));
    expect(r.status).toBe(200);
    expect(String(m.fetch.mock.calls[0][0])).toBe("https://motor/api/connect/v1/conferencia/documentos?cnpj_raiz=17122471");
    expect(m.pode).toHaveBeenCalledWith(expect.anything(), "fiscal_conferencia", "agir");
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "fiscal.sped.omie.conferido" }));
    expect(m.revalidar).toHaveBeenCalledWith("/fiscal/conferencia");
  });

  it("422 arquivo_invalido do motor chega com a frase dele", async () => {
    responder("erro_arquivo_invalido");
    const r = await POST(...await pedido("omie", [["gesto", GESTO], ["arquivo", new File(["x"], "vazio.csv")]]));
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ ok: false, codigo: "arquivo_invalido", mensagem: "arquivo vazio" });
  });

  it("confronto: só .xlsx, e a competência vai como campo", async () => {
    const csv = await POST(...await pedido("confronto", [["gesto", GESTO], ["arquivo", new File(["a"], "p.csv")]]));
    expect(csv.status).toBe(422);
    expect((await csv.json()).mensagem).toMatch(/\.xlsx/);
    expect(m.fetch).not.toHaveBeenCalled();
    responder("confronto_envio");
    const ok = await POST(...await pedido("confronto", [["gesto", GESTO], ["competencia", "2032-03"], ["arquivo", new File(["PK"], "TESTE-ESCRITAS.xlsx")]]));
    expect(ok.status).toBe(200);
    const init = m.fetch.mock.calls[0][1] as RequestInit;
    const enviado = await new Response(init.body as BodyInit, { headers: { "Content-Type": (init.headers as Record<string, string>)["Content-Type"] } }).formData();
    expect(enviado.get("competencia")).toBe("2032-03");
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "fiscal.sped.confronto.enviado" }));
  });

  it("503 motor_ocupado: mensagem amigável e nenhuma nova tentativa", async () => {
    m.fetch.mockImplementationOnce(async () => new Response(JSON.stringify(fixture("erro_motor_ocupado").resposta.corpo), { status: 503, headers: { "Content-Type": "application/json", "Retry-After": "5", "X-Custo": "pesada" } }));
    const r = await POST(...await pedido("confronto", [["gesto", GESTO], ["arquivo", new File(["PK"], "p.xlsx")]]));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ ok: false, codigo: "motor_ocupado", renovarChave: false });
    expect(m.fetch).toHaveBeenCalledTimes(1);
    expect(m.audit).not.toHaveBeenCalled();
  });
});

describe("pagamentos de apoio e faturas do BPO (§14.3)", () => {
  const recibo = () => new File(["%PDF-1.4 recibo"], "recibo frete.pdf");

  it("pagamentos: tipo e pasta como campos, PDF na parte `arquivos`; módulo de PIS e COFINS; audita e relê Fechamento e Conferência", async () => {
    responder("pagamentos_apoio_importar");
    const r = await POST(...await pedido("pagamentos_apoio", [["gesto", GESTO], ["tipo", "recibo"], ["pasta", "TESTE-LACUNAS/2032-03"], ["arquivos", recibo()]]));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, dados: { gravadas: 1, tipo: "recibo" } });
    const [url, init] = m.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://motor/api/connect/v1/pagamentos-apoio/importar?cnpj_raiz=17122471");
    const h = init.headers as Record<string, string>;
    expect(h["Idempotency-Key"]).toMatch(/^c41:[0-9a-f]{64}$/);
    const enviado = await new Response(init.body as BodyInit, { headers: { "Content-Type": h["Content-Type"] } }).formData();
    expect([...enviado.keys()]).toEqual(["tipo", "pasta", "arquivos"]);
    expect(m.pode).toHaveBeenCalledWith(expect.anything(), "fiscal_contribuicoes", "agir");
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "fiscal.sped.pagamentos_apoio.importados", entityType: "SpedImportacaoApoio" }));
    expect(m.revalidar).toHaveBeenCalledWith("/fiscal/contribuicoes");
    expect(m.revalidar).toHaveBeenCalledWith("/fiscal/conferencia");
  });

  it("pagamentos: sem tipo, tipo fora da lista, pasta com `..` ou arquivo que não é PDF: recusa sem chamar", async () => {
    for (const campos of [[], [["tipo", "nota_fiscal"]], [["tipo", "recibo"], ["pasta", "../fora"]]] as [string, string][][]) {
      const r = await POST(...await pedido("pagamentos_apoio", [["gesto", GESTO], ...campos, ["arquivos", recibo()]]));
      expect(r.status).toBe(422);
      expect((await r.json()).codigo).toBe("parametro_invalido");
    }
    const jpg = await POST(...await pedido("pagamentos_apoio", [["gesto", GESTO], ["tipo", "recibo"], ["arquivos", new File(["x"], "foto.jpg")]]));
    expect(jpg.status).toBe(422);
    expect(m.fetch).not.toHaveBeenCalled();
  });

  it("pagamentos: OCR pedido onde o motor não tem — 422 ocr_indisponivel com a frase", async () => {
    m.fetch.mockImplementationOnce(async () => new Response(JSON.stringify({ erro: "o motor não tem o Tesseract: envie com ocr=false", codigo: "ocr_indisponivel" }), { status: 422, headers: { "Content-Type": "application/json", "X-Custo": "pesada" } }));
    const r = await POST(...await pedido("pagamentos_apoio", [["gesto", GESTO], ["tipo", "recibo"], ["ocr", "true"], ["arquivos", recibo()]]));
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ codigo: "ocr_indisponivel", renovarChave: true });
    const init = m.fetch.mock.calls[0][1] as RequestInit;
    const enviado = await new Response(init.body as BodyInit, { headers: { "Content-Type": (init.headers as Record<string, string>)["Content-Type"] } }).formData();
    expect(enviado.get("ocr")).toBe("true");
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("faturas: a planilha e os comprovantes nas partes do contrato; `substituir` muda a chave", async () => {
    responder("faturas_bpo_importar"); responder("faturas_bpo_substituir");
    const planilha = () => new File(["PK"], "TESTE-LACUNAS-faturas.xlsx");
    const comp = () => new File(["%PDF-1.4 comprovante"], "LOCADORA FATURA 123456.pdf");
    const r = await POST(...await pedido("faturas_bpo", [["gesto", GESTO], ["planilha", planilha()], ["pdfs", comp()]]));
    expect(r.status).toBe(200);
    const r2 = await POST(...await pedido("faturas_bpo", [["gesto", GESTO], ["substituir", "true"], ["planilha", planilha()], ["pdfs", comp()]]));
    expect((await r2.json()).dados.removidas).toBe(2);
    const corpos = await Promise.all(m.fetch.mock.calls.map(async (c) => {
      const init = c[1] as RequestInit;
      const h = init.headers as Record<string, string>;
      return { chave: h["Idempotency-Key"], form: await new Response(init.body as BodyInit, { headers: { "Content-Type": h["Content-Type"] } }).formData() };
    }));
    expect([...corpos[0].form.keys()]).toEqual(["planilha", "pdfs"]);
    expect([...corpos[1].form.keys()]).toEqual(["substituir", "planilha", "pdfs"]);
    expect(corpos[1].chave).not.toBe(corpos[0].chave);
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "fiscal.sped.faturas_bpo.importadas" }));
  });

  it("faturas: 409 importacao_existente diz quantas e como substituir; nada auditado", async () => {
    responder("erro_importacao_existente");
    const r = await POST(...await pedido("faturas_bpo", [["gesto", GESTO], ["planilha", new File(["PK"], "TESTE-LACUNAS-faturas.xlsx")]]));
    expect(r.status).toBe(409);
    const corpo = await r.json();
    expect(corpo).toMatchObject({ codigo: "importacao_existente", detalhe: { existentes: 2 } });
    expect(corpo.mensagem).toMatch(/2 fatura\(s\).*substituir/);
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("faturas: planilha que não é .xlsx, ou comprovante que não é PDF, nem sai", async () => {
    expect((await POST(...await pedido("faturas_bpo", [["gesto", GESTO], ["planilha", new File(["a"], "f.csv")]]))).status).toBe(422);
    expect((await POST(...await pedido("faturas_bpo", [["gesto", GESTO], ["planilha", new File(["PK"], "f.xlsx")], ["pdfs", new File(["x"], "c.png")]]))).status).toBe(422);
    expect(m.fetch).not.toHaveBeenCalled();
  });
});
