import { readdirSync, readFileSync } from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";

// As respostas reais do motor para cada rota de §11 (API-CONNECT §11.5,
// "as fixtures seguem §8.4 ... usadas nos dois lados"), copiadas de
// `tests/fixtures/connect_v1/telas/*.json` do repositório do motor. Cada uma é
// servida ao cliente como o motor a serviria (status, corpo, `X-Custo` e, no
// 503, `Retry-After: 5`) e tem de passar pelo esquema zod da rota.

vi.mock("server-only", () => ({}));
const { criarClienteDoMotor, ErroDoMotor } = await import("./motor");

const DIR = path.resolve(__dirname, "../../../tests/fixtures/connect_v1/telas");
type Fixture = { status: number; corpo: unknown; x_custo: "leve" | "pesada" };
const ler = (nome: string): Fixture => JSON.parse(readFileSync(path.join(DIR, `${nome}.json`), "utf8"));
type Cliente = ReturnType<typeof criarClienteDoMotor>;
const R = "17122471";

/** Fixture → a chamada do cliente que a recebe. */
const ROTAS: Record<string, (c: Cliente) => Promise<unknown>> = {
  importacoes: (c) => c.listarImportacoes(R),
  importacao: (c) => c.obterImportacao(R, 1),
  quarentena_resumo: (c) => c.resumoDaQuarentena(R),
  quarentena: (c) => c.listarQuarentena(R),
  cobertura: (c) => c.obterCobertura(R, 1, "2032-03"),
  cobertura_lista: (c) => c.listarCoberturas(R),
  erros_extracao: (c) => c.errosDeExtracao(R),
  nfse_resumo: (c) => c.resumoNfse(R),
  apuracao: (c) => c.apuracaoDoArquivo(R, 1),
  apuracao_documentos: (c) => c.documentosDoCfop(R, 1, { grupo: "saidas_cte", cfop: "6352" }),
  demonstrativo_icms: (c) => c.demonstrativoDoArquivo(R, 1),
  saldos_icms: (c) => c.saldosIcms(R, 1),
  dcip_dime: (c) => c.dcipDime(R, 1, "2032-03"),
  tabelas_icms: (c) => c.tabelasIcms(R),
  demonstrativo_contribuicoes_competencias: (c) => c.competenciasDoDemonstrativoContrib(R),
  demonstrativo_contribuicoes: (c) => c.demonstrativoContribuicoes(R, { competencia: "2032-03" }),
  fechamento: (c) => c.fechamento(R, "2032-03"),
  fechamento_competencias: (c) => c.competenciasDoFechamento(R),
  fechamento_faturamento: (c) => c.faturamento(R, "2032-03"),
  fechamento_conferencia: (c) => c.conferenciaDoFechamento(R),
  fechamento_duplicatas: (c) => c.duplicatas(R),
  fechamento_alugueis_imoveis: (c) => c.alugueisDeImoveis(R),
  conferencia_competencias: (c) => c.competenciasDaConferencia(R),
  conferencia_previa: (c) => c.previaDaConferencia(R, "2032-03"),
  conferencia_prestadores: (c) => c.prestadores(R, "2032-03"),
  conferencia_confronto: (c) => c.confronto(R, { competencia: "2032-03" }),
  conferencia_documentos: (c) => c.documentosDaConferencia(R, { competencia: "2032-03" }),
  // Os erros, numa rota da mesma classe.
  erro_motor_ocupado: (c) => c.apuracaoDoArquivo(R, 1),
  erro_obrigacao_incompativel: (c) => c.apuracaoDoArquivo(R, 1),
  erro_uf_nao_suportada: (c) => c.dcipDime(R, 1, "2032-03"),
};

function servir(f: Fixture) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(f.corpo), {
    status: f.status,
    headers: { "Content-Type": "application/json", "X-Custo": f.x_custo, ...(f.status === 503 ? { "Retry-After": "5" } : {}) },
  }));
  return { fetch, c: criarClienteDoMotor({ baseUrl: "https://motor", token: "t", tokenEscrita: null }, { fetch: fetch as unknown as typeof globalThis.fetch, esperar: async () => {} }) };
}

describe("fixtures reais do motor (§11)", () => {
  const arquivos = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();

  it("toda fixture tem a sua rota no cliente, e toda rota tem fixture", () => {
    expect(arquivos).toEqual(Object.keys(ROTAS).sort());
  });

  it.each(arquivos.filter((a) => !a.startsWith("erro_")))("%s passa pelo esquema, com a classe de custo certa", async (nome) => {
    const f = ler(nome);
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { c, fetch } = servir(f);
    await expect(ROTAS[nome](c)).resolves.toBeDefined();
    // `X-Custo` do motor igual à classe que o Connect dá à rota: sem o aviso de divergência.
    expect(aviso).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    aviso.mockRestore();
  });

  it("503 motor_ocupado: mensagem amigável, Retry-After 5 e nenhuma nova tentativa", async () => {
    const { c, fetch } = servir(ler("erro_motor_ocupado"));
    const e = (await ROTAS.erro_motor_ocupado(c).catch((x) => x)) as InstanceType<typeof ErroDoMotor>;
    expect(e).toBeInstanceOf(ErroDoMotor);
    expect([e.status, e.codigo, e.retryAfter, e.ocupado]).toEqual([503, "motor_ocupado", 5, true]);
    expect(e.message).toMatch(/^O motor está ocupado com outra leitura pesada; tente em alguns segundos/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([["erro_obrigacao_incompativel", "obrigacao_incompativel"], ["erro_uf_nao_suportada", "uf_nao_suportada"]])("%s chega como 422 com o código e a frase do motor", async (nome, codigo) => {
    const f = ler(nome);
    const { c } = servir(f);
    const e = (await ROTAS[nome](c).catch((x) => x)) as InstanceType<typeof ErroDoMotor>;
    expect([e.status, e.codigo]).toEqual([422, codigo]);
    expect(e.message).toBe((f.corpo as { erro: string }).erro);
  });

  it("dinheiro e alíquota chegam como string e null continua null", async () => {
    const { c } = servir(ler("fechamento"));
    const f = (await c.fechamento(R, "2032-03")) as { fiscais: { valor: string | null }[] };
    for (const linha of f.fiscais) expect(linha.valor === null || typeof linha.valor === "string").toBe(true);
    const { c: c2 } = servir(ler("conferencia_previa"));
    const p = await c2.previaDaConferencia(R, "2032-03");
    expect(p.aliquotas.cheia).toMatch(/^\d+\.\d{4}$/);
  });
});
