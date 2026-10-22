import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { codificarAtor, criarClienteDoMotor, ErroDoMotor, mensagemDoErro, novaChaveDeIdempotencia, FORMATO_DA_CHAVE } = await import("./motor");

const CREDS: { baseUrl: string; token: string; tokenEscrita: string | null } = { baseUrl: "https://motor.exemplo/", token: "t-leitura", tokenEscrita: "t-escrita" };
const ATOR = { id: "u1", nome: "Kátia Souza", email: "katia@41contabil.com.br", tenant: "ten_1" };
const CHAVE = "c41:11111111-2222-3333-4444-555555555555";

const EXECUCAO = {
  id: 812, acao: "sped", rotulo: "gerar EFD ICMS/IPI", empresa_id: 3, cnpj: "17122471001147",
  competencia: "2026-09", data_ini: "2026-09-01", data_fim: "2026-09-30",
  parametros: { saida: "saida_sped.txt", sem_entradas: false, forcar_com_erros: false, forcar_cobertura: false, retificadora: false },
  estado: "executando", solicitado_por: "Kátia Souza", solicitado_em: "2026-10-22T13:00:00+00:00", agente_host: "SRV-FISCAL", pid: 4120,
  iniciado_em: "2026-10-22T13:01:00+00:00", concluido_em: null, batida_em: "2026-10-22T13:04:00+00:00", codigo_saida: null, mensagem: null,
  travada: false, pode_cancelar: false, pode_destravar: false, arquivo_ids: [],
};

const json = (corpo: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json", ...headers } });

function cliente(respostas: (Response | Error)[], creds = CREDS) {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init: init ?? {} });
    const r = respostas.shift();
    if (!r) throw new Error("sem resposta preparada");
    if (r instanceof Error) throw r;
    return r;
  });
  const esperas: number[] = [];
  const c = criarClienteDoMotor(creds, { fetch: fetch as unknown as typeof globalThis.fetch, esperar: async (ms) => { esperas.push(ms); } });
  return { c, chamadas, fetch, esperas };
}
const cabecalhos = (init: RequestInit) => init.headers as Record<string, string>;

describe("autenticação e endereço", () => {
  it("GET usa o token de leitura, o prefixo v1 e a raiz na query, sem cache", async () => {
    const { c, chamadas } = cliente([json({ itens: [], proximo_cursor: null })]);
    await c.listarExecucoes("17122471", { estado: "pendente,executando", limite: 50 });
    const { url, init } = chamadas[0];
    expect(url).toBe("https://motor.exemplo/api/connect/v1/execucoes?cnpj_raiz=17122471&estado=pendente%2Cexecutando&limite=50");
    expect(cabecalhos(init).Authorization).toBe("Bearer t-leitura");
    expect(cabecalhos(init)["X-Connect-Ator"]).toBeUndefined();
    expect(init.cache).toBe("no-store");
  });

  it("escrita usa o token de escrita, o ator e a chave de idempotência", async () => {
    const { c, chamadas } = cliente([json(EXECUCAO, 202)]);
    await c.criarExecucao("17122471", { acao: "sped", empresa_id: 3, competencia: "2026-09", tipo_sped: "0", parametros: {}, confirmar_duplicado: false }, { ator: ATOR, chave: CHAVE });
    const h = cabecalhos(chamadas[0].init);
    expect(chamadas[0].init.method).toBe("POST");
    expect(h.Authorization).toBe("Bearer t-escrita");
    expect(h["Idempotency-Key"]).toBe(CHAVE);
    expect(h["Content-Type"]).toBe("application/json");
    expect(JSON.parse(Buffer.from(h["X-Connect-Ator"], "base64url").toString("utf8"))).toEqual(ATOR);
  });

  it("sem token de escrita, nem chama o motor", async () => {
    const { c, fetch } = cliente([], { ...CREDS, tokenEscrita: null });
    await expect(c.cancelarExecucao("17122471", 812, { ator: ATOR, chave: CHAVE })).rejects.toMatchObject({ codigo: "escrita_nao_habilitada" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("POST de criação sem chave de idempotência é recusado localmente", async () => {
    const { c, fetch } = cliente([]);
    await expect(c.validarArquivo("17122471", 301, { ator: ATOR })).rejects.toMatchObject({ codigo: "idempotencia_ausente" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("raiz de 14 dígitos não sai daqui", async () => {
    const { c, fetch } = cliente([]);
    await expect(c.saude("17122471000175")).rejects.toBeInstanceOf(ErroDoMotor);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("X-Connect-Ator", () => {
  it("é base64url sem padding de JSON UTF-8, com acento preservado", () => {
    const v = codificarAtor({ id: "u1", nome: "João Ção", email: "j@x.com" });
    expect(v).not.toMatch(/[=+/]/);
    expect(JSON.parse(Buffer.from(v, "base64url").toString("utf8"))).toEqual({ id: "u1", nome: "João Ção", email: "j@x.com" });
  });
  it("corta nos limites do motor e recusa e-mail sem @", () => {
    const v = JSON.parse(Buffer.from(codificarAtor({ id: "u".repeat(80), nome: "n".repeat(150), email: "a@b" }), "base64url").toString());
    expect(v.id).toHaveLength(64);
    expect(v.nome).toHaveLength(100);
    expect(() => codificarAtor({ id: "u", nome: "n", email: "sem-arroba" })).toThrow(ErroDoMotor);
  });
});

describe("idempotência", () => {
  it("a chave nova tem o formato do motor", () => {
    expect(novaChaveDeIdempotencia()).toMatch(FORMATO_DA_CHAVE);
    expect(novaChaveDeIdempotencia()).not.toBe(novaChaveDeIdempotencia());
  });

  it("repete com a MESMA chave em 5xx e em 409 idempotencia_em_andamento, respeitando Retry-After", async () => {
    const { c, chamadas, esperas } = cliente([
      json({ erro: "x", codigo: "erro_interno" }, 500),
      json({ erro: "x", codigo: "idempotencia_em_andamento" }, 409, { "Retry-After": "2" }),
      json(EXECUCAO, 202, { "Idempotent-Replay": "true" }),
    ]);
    const e = await c.criarExecucao("17122471", { acao: "sped", empresa_id: 3, competencia: "2026-09", tipo_sped: "0", parametros: {}, confirmar_duplicado: false }, { ator: ATOR, chave: CHAVE });
    expect(e.id).toBe(812);
    expect(chamadas).toHaveLength(3);
    expect(new Set(chamadas.map((x) => cabecalhos(x.init)["Idempotency-Key"]))).toEqual(new Set([CHAVE]));
    expect(new Set(chamadas.map((x) => x.init.body))).toHaveProperty("size", 1);
    expect(esperas).toEqual([500, 2000]);
  });

  it("não repete escrita depois de 4xx, nem escrita sem chave", async () => {
    const a = cliente([json({ erro: "Período inválido", codigo: "parametro_invalido" }, 422)]);
    await expect(a.c.criarExecucao("17122471", { acao: "sped", empresa_id: 3, competencia: "2026-09", tipo_sped: "0", parametros: {}, confirmar_duplicado: false }, { ator: ATOR, chave: CHAVE })).rejects.toMatchObject({ status: 422 });
    expect(a.chamadas).toHaveLength(1);
    const b = cliente([json({ erro: "x", codigo: "erro_interno" }, 500)]);
    await expect(b.c.cancelarExecucao("17122471", 812, { ator: ATOR })).rejects.toMatchObject({ status: 500 });
    expect(b.chamadas).toHaveLength(1);
  });

  it("leitura repete uma vez em 503 e em falha de rede, nunca em 4xx", async () => {
    const a = cliente([json({ erro: "x", codigo: "banco_indisponivel" }, 503), json({ itens: [], proximo_cursor: null })]);
    await a.c.listarArquivos("17122471");
    expect(a.chamadas).toHaveLength(2);
    const b = cliente([new TypeError("fetch failed"), new TypeError("fetch failed")]);
    await expect(b.c.listarArquivos("17122471")).rejects.toMatchObject({ codigo: "falha_de_rede" });
    expect(b.chamadas).toHaveLength(2);
    const d = cliente([json({ erro: "x", codigo: "cursor_invalido" }, 400)]);
    await expect(d.c.listarArquivos("17122471", { cursor: "abc" })).rejects.toMatchObject({ codigo: "cursor_invalido" });
    expect(d.chamadas).toHaveLength(1);
  });
});

describe("erros em português", () => {
  it("códigos de configuração têm mensagem do Connect; os de negócio, a do motor", async () => {
    const { c } = cliente([json({ erro: "token sem escrita", codigo: "token_sem_escrita" }, 403)]);
    await expect(c.cancelarExecucao("17122471", 1, { ator: ATOR, chave: CHAVE })).rejects.toThrow(/não tem permissão de escrita/);
    expect(mensagemDoErro(422, "parametro_invalido", "A geração exige um mês inteiro.")).toBe("A geração exige um mês inteiro.");
    expect(mensagemDoErro(403, "decisao_bloqueada", "tipo bloqueado")).toMatch(/bloqueado para gravação pelo Connect/);
    expect(mensagemDoErro(409, "execucao_duplicada", null)).toMatch(/pedido igual/);
    expect(mensagemDoErro(500, null, null)).toMatch(/falhou/);
  });

  it("o corpo do 409 de duplicata chega a quem chama, com `existente` e os `campos` do 422", async () => {
    const { c } = cliente([json({ erro: "Já existe", codigo: "execucao_duplicada", existente: EXECUCAO }, 409)]);
    const erro = await c.criarExecucao("17122471", { acao: "sped", empresa_id: 3, competencia: "2026-09", tipo_sped: "0", parametros: {}, confirmar_duplicado: false }, { ator: ATOR, chave: CHAVE }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroDoMotor);
    expect(erro.codigo).toBe("execucao_duplicada");
    expect((erro.corpo.existente as { id: number }).id).toBe(812);
    const b = cliente([json({ erro: "Confira", codigo: "parametro_invalido", campos: { valor: "maior que zero" } }, 422)]);
    const e2 = await b.c.gravarDecisoes("17122471", "credito_icms_item", { chave: {}, valor: {} }, { ator: ATOR }).catch((e) => e);
    expect(e2.campos).toEqual({ valor: "maior que zero" });
  });

  it("lê o formato antigo do FastAPI sem quebrar", async () => {
    const { c } = cliente([json({ detail: { erro: "nao_encontrado" } }, 404), json({ detail: { erro: "nao_encontrado" } }, 404)]);
    await expect(c.obterExecucao("17122471", 9)).rejects.toMatchObject({ status: 404, codigo: "nao_encontrado" });
  });
});

describe("validação das respostas", () => {
  it("aceita o exemplo do contrato e converte nulos", async () => {
    const { c } = cliente([json(EXECUCAO)]);
    const e = await c.obterExecucao("17122471", 812);
    expect(e.estado).toBe("executando");
    expect(e.concluido_em).toBeNull();
  });
  it("recusa resposta fora do contrato com erro em português", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { c } = cliente([json({ ...EXECUCAO, estado: "voando" })]);
    await expect(c.obterExecucao("17122471", 812)).rejects.toMatchObject({ codigo: "resposta_invalida" });
    aviso.mockRestore();
  });
  it("lê o log como texto, com os cabeçalhos do motor", async () => {
    const { c, chamadas } = cliente([new Response("linha 1\nlinha 2", { headers: { "X-Log-Truncado": "true", "X-Execucao-Estado": "executando" } })]);
    expect(await c.logDaExecucao("17122471", 812, 9999)).toEqual({ texto: "linha 1\nlinha 2", truncado: true, estado: "executando" });
    expect(chamadas[0].url).toContain("linhas=5000");
  });
  it("o POST de decisão vai no envelope `valor`", async () => {
    const { c, chamadas } = cliente([json({ ids: [7], itens: [] }, 201)]);
    await c.criarDecisoes("17122471", "ajuste_apuracao", { codigo: "SP020", valor: "10.00" }, { ator: ATOR, chave: CHAVE });
    expect(JSON.parse(String(chamadas[0].init.body))).toEqual({ valor: { codigo: "SP020", valor: "10.00" } });
  });
});
