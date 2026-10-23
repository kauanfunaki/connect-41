import { afterEach, describe, expect, it, vi } from "vitest";
import * as F from "./telasDoMotor.fixtures";

vi.mock("server-only", () => ({}));
const { criarClienteDoMotor, ErroDoMotor, TIMEOUT_PESADA_MS } = await import("./motor");

const json = (corpo: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json", ...headers } });

function cliente(respostas: (Response | Error)[]) {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init: init ?? {} });
    const r = respostas.shift();
    if (!r) throw new Error("sem resposta preparada");
    if (r instanceof Error) throw r;
    return r;
  });
  const esperas: number[] = [];
  const c = criarClienteDoMotor({ baseUrl: "https://motor", token: "t-leitura", tokenEscrita: null }, { fetch: fetch as unknown as typeof globalThis.fetch, esperar: async (ms) => { esperas.push(ms); } });
  return { c, chamadas, esperas };
}
const R = "17122471";
const caminho = (url: string) => url.replace("https://motor/api/connect/v1", "");

afterEach(() => vi.restoreAllMocks());

describe("rotas e parâmetros de §11", () => {
  it("cada leitura vai ao caminho do contrato, com a raiz na query e o token de leitura", async () => {
    const casos: [(c: ReturnType<typeof cliente>["c"]) => Promise<unknown>, unknown, string][] = [
      [(c) => c.listarImportacoes(R, { limite: 50, cursor: "abc" }), { itens: [F.IMPORTACAO], proximo_cursor: null }, "/importacoes?cnpj_raiz=17122471&limite=50&cursor=abc"],
      [(c) => c.obterImportacao(R, 812), F.IMPORTACAO, "/importacoes/812?cnpj_raiz=17122471"],
      [(c) => c.resumoDaQuarentena(R), F.RESUMO_QUARENTENA, "/quarentena/resumo?cnpj_raiz=17122471"],
      [(c) => c.listarQuarentena(R, { importacao_id: 812, classe: "desconhecido", apenas_pendentes: true }), { itens: [F.REJEITADO], proximo_cursor: null }, "/quarentena?cnpj_raiz=17122471&importacao_id=812&classe=desconhecido&apenas_pendentes=true"],
      [(c) => c.obterCobertura(R, 3, "2026-09"), { registro: F.COBERTURA, anterior: null, avaliacao: F.AVALIACAO }, "/cobertura?cnpj_raiz=17122471&empresa_id=3&competencia=2026-09"],
      [(c) => c.listarCoberturas(R, { limite: 999 }), { itens: [{ ...F.COBERTURA, avaliacao: F.AVALIACAO }], proximo_cursor: null }, "/cobertura/lista?cnpj_raiz=17122471&limite=300"],
      [(c) => c.errosDeExtracao(R, { data_ini: "2026-09-01", data_fim: "2026-09-30" }), F.ERROS_EXTRACAO, "/erros-extracao?cnpj_raiz=17122471&data_ini=2026-09-01&data_fim=2026-09-30"],
      [(c) => c.resumoNfse(R), F.NFSE_RESUMO, "/nfse/resumo?cnpj_raiz=17122471"],
      [(c) => c.saldosIcms(R, 3), F.SALDOS, "/saldos-icms?cnpj_raiz=17122471&empresa_id=3"],
      [(c) => c.dcipDime(R, 5, "2026-09"), F.DCIP_DIME, "/dcip-dime?cnpj_raiz=17122471&empresa_id=5&competencia=2026-09"],
      [(c) => c.tabelasIcms(R), F.TABELAS_ICMS, "/tabelas/icms?cnpj_raiz=17122471"],
      [(c) => c.competenciasDoDemonstrativoContrib(R), F.COMPETENCIAS_CONTRIB, "/demonstrativo-contribuicoes/competencias?cnpj_raiz=17122471"],
      [(c) => c.fechamento(R, "2026"), F.FECHAMENTO, "/fechamento?cnpj_raiz=17122471&competencia=2026"],
      [(c) => c.competenciasDoFechamento(R), { competencias: ["2026-09"] }, "/fechamento/competencias?cnpj_raiz=17122471"],
      [(c) => c.faturamento(R, "2026-09"), F.FATURAMENTO, "/fechamento/faturamento?cnpj_raiz=17122471&competencia=2026-09"],
      [(c) => c.conferenciaDoFechamento(R), F.CONFERENCIA_FECHAMENTO, "/fechamento/conferencia?cnpj_raiz=17122471&sem_credito=false"],
      [(c) => c.duplicatas(R, { competencia: "2026-09", cursor: "x" }), F.DUPLICATAS, "/fechamento/duplicatas?cnpj_raiz=17122471&competencia=2026-09&cursor=x"],
      [(c) => c.alugueisDeImoveis(R), F.ALUGUEIS, "/fechamento/alugueis-imoveis?cnpj_raiz=17122471"],
      [(c) => c.competenciasDaConferencia(R), F.COMPETENCIAS_CONFERENCIA, "/conferencia/competencias?cnpj_raiz=17122471"],
      [(c) => c.previaDaConferencia(R, "2026-09"), F.PREVIA, "/conferencia/previa?cnpj_raiz=17122471&competencia=2026-09"],
      [(c) => c.prestadores(R, "2026-09"), F.PRESTADORES, "/conferencia/prestadores?cnpj_raiz=17122471&competencia=2026-09"],
      [(c) => c.confronto(R, { competencia: "2026-09", situacao: "sem_nota" }), F.CONFRONTO, "/conferencia/confronto?cnpj_raiz=17122471&competencia=2026-09&situacao=sem_nota"],
      [(c) => c.documentosDaConferencia(R, { competencia: "2026-09", pendentes: true }), F.DOCUMENTOS_CONFERENCIA, "/conferencia/documentos?cnpj_raiz=17122471&competencia=2026-09&pendentes=true"],
    ];
    for (const [chamar, corpo, esperado] of casos) {
      const { c, chamadas } = cliente([json(corpo, 200, { "X-Custo": "leve" })]);
      await chamar(c);
      expect(caminho(chamadas[0].url)).toBe(esperado);
      expect((chamadas[0].init.headers as Record<string, string>).Authorization).toBe("Bearer t-leitura");
      expect(chamadas[0].init.method).toBe("GET");
    }
  });

  it("vazio com sentido próprio vai na query: `classe=` (todas) e `situacao=` (todas)", async () => {
    const a = cliente([json({ itens: [], proximo_cursor: null })]);
    await a.c.listarQuarentena(R, { classe: "" });
    expect(caminho(a.chamadas[0].url)).toBe("/quarentena?cnpj_raiz=17122471&classe=");
    const b = cliente([json({ itens: [], proximo_cursor: null })]);
    await b.c.confronto(R, { competencia: "2026-09", situacao: "" });
    expect(caminho(b.chamadas[0].url)).toBe("/conferencia/confronto?cnpj_raiz=17122471&competencia=2026-09&situacao=");
  });

  it("recusa localmente competência malformada, mês 13, ano onde só vale mês, grupo de CFOP e período ausente", async () => {
    const { c, chamadas } = cliente([]);
    await expect(c.previaDaConferencia(R, "2026-13")).rejects.toMatchObject({ codigo: "parametro_invalido" });
    await expect(c.confronto(R, { competencia: "2026" })).rejects.toMatchObject({ codigo: "parametro_invalido" });
    await expect(c.dcipDime(R, 5, "09/2026")).rejects.toBeInstanceOf(ErroDoMotor);
    await expect(c.documentosDoCfop(R, 301, { grupo: "saidas" as never, cfop: "6352" })).rejects.toBeInstanceOf(ErroDoMotor);
    await expect(c.demonstrativoContribuicoes(R, {} as never)).rejects.toThrow(/ano ou a competência/);
    expect(chamadas).toHaveLength(0);
  });

  it("demonstrativo de Contribuições: com os dois, vale a competência e só ela vai", async () => {
    const { c, chamadas } = cliente([json(F.DEMONSTRATIVO_CONTRIB)]);
    await c.demonstrativoContribuicoes(R, { ano: "2026", competencia: "2026-09", filial: 3, relatorio: "saidas", ordenar: "valor" });
    expect(caminho(chamadas[0].url)).toBe("/demonstrativo-contribuicoes?cnpj_raiz=17122471&competencia=2026-09&filial=3&relatorio=saidas&ordenar=valor");
  });

  it("documentos do CFOP: limite entre 1 e 2000, alíquota em string", async () => {
    const { c, chamadas } = cliente([json(F.DOCUMENTOS_DO_CFOP)]);
    await c.documentosDoCfop(R, 301, { grupo: "saidas_cte", cfop: "6352", cst: "000", aliquota: "12.0000", limite: 50_000 });
    expect(caminho(chamadas[0].url)).toBe("/arquivos/301/apuracao/documentos?cnpj_raiz=17122471&grupo=saidas_cte&cfop=6352&cst=000&aliquota=12.0000&limite=2000");
  });
});

describe("números de §11.0.3", () => {
  it("null continua null (não levantado), nunca \"0.00\"; contagens são inteiros", async () => {
    const { c } = cliente([json(F.FECHAMENTO)]);
    const f = await c.fechamento(R, "2026-09");
    expect(f.fiscais[0].valor).toBeNull();
    expect(f.totais.fiscais_saida).toBeNull();
    expect(f.fiscais[0].documentos).toBe(15022);
  });
  it("dinheiro como número JSON é resposta fora do contrato", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { c } = cliente([json({ ...F.FECHAMENTO, totais: { ...F.FECHAMENTO.totais, apoio_bruto: 4000 } })]);
    await expect(c.fechamento(R, "2026-09")).rejects.toMatchObject({ codigo: "resposta_invalida" });
    expect(aviso).toHaveBeenCalled();
  });
  it("contagem fracionária também é recusada", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { c } = cliente([json({ ...F.IMPORTACAO, lidos: 1.5 })]);
    await expect(c.obterImportacao(R, 812)).rejects.toMatchObject({ codigo: "resposta_invalida" });
  });
  it("aceita campo a mais (looseObject); /cobertura/lista em {itens} e /nfse/resumo na forma do painel", async () => {
    const a = cliente([json({ ...F.APURACAO, campo_novo: 1 })]);
    expect((await a.c.apuracaoDoArquivo(R, 301)).cfop.saidas_cte[0].valor_operacao).toBe("1000.00");
    const b = cliente([json({ itens: [{ ...F.COBERTURA, avaliacao: null }], proximo_cursor: null })]);
    expect(await b.c.listarCoberturas(R)).toHaveLength(1);
    const d = cliente([json(F.NFSE_RESUMO)]);
    const n = await d.c.resumoNfse(R);
    expect([n.itens.length, n.totais?.sem_xml, n.quarentena_por_triar]).toEqual([1, 3, 2]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const e = cliente([json(F.NFSE_RESUMO.por_competencia)]);
    await expect(e.c.resumoNfse(R)).rejects.toMatchObject({ codigo: "resposta_invalida" });
  });
  it("as fixtures de todas as rotas passam pelos esquemas", async () => {
    const { c } = cliente([json(F.DEMONSTRATIVO_ICMS), json(F.DEMONSTRATIVO_CONTRIB)]);
    expect((await c.demonstrativoDoArquivo(R, 301)).total_saidas.outras).toBeNull();
    const d = await c.demonstrativoContribuicoes(R, { ano: "2026" });
    expect(d.meses[0].arquivo).toEqual({ arquivo_id: 401, qtd_linhas: 8000 });
    expect(d.cadeia[0].esperado_da_anterior).toBeNull();
  });
});

describe("leituras pesadas (§11.0.7)", () => {
  it("timeout de 60 s nas pesadas e de 15 s nas leves", async () => {
    const espiao = vi.spyOn(AbortSignal, "timeout");
    const { c } = cliente([json(F.APURACAO), json(F.SALDOS)]);
    await c.apuracaoDoArquivo(R, 301);
    await c.saldosIcms(R, 3);
    expect(espiao.mock.calls.map((x) => x[0])).toEqual([TIMEOUT_PESADA_MS, 15_000]);
    expect(TIMEOUT_PESADA_MS).toBe(60_000);
  });

  it("nenhuma nova tentativa automática: nem em 502/504, nem em falha de rede ou tempo esgotado", async () => {
    for (const r of [json({ erro: "x" }, 502), json({ erro: "x" }, 504), new TypeError("fetch failed")]) {
      const { c, chamadas, esperas } = cliente([r, json(F.APURACAO)]);
      await expect(c.apuracaoDoArquivo(R, 301)).rejects.toBeInstanceOf(ErroDoMotor);
      expect(chamadas).toHaveLength(1);
      expect(esperas).toEqual([]);
    }
    const tempo = Object.assign(new Error("timeout"), { name: "TimeoutError" });
    const { c, chamadas } = cliente([tempo]);
    await expect(c.demonstrativoDoArquivo(R, 301)).rejects.toMatchObject({ codigo: "tempo_esgotado", message: expect.stringMatching(/um minuto/) });
    expect(chamadas).toHaveLength(1);
  });

  it("a leve continua com a nova tentativa de §8.2", async () => {
    const { c, chamadas } = cliente([json({ erro: "x" }, 502), json(F.SALDOS)]);
    await c.saldosIcms(R, 3);
    expect(chamadas).toHaveLength(2);
  });

  it("503 motor_ocupado vira a mensagem amigável com o Retry-After, sem repetir", async () => {
    const { c, chamadas } = cliente([json({ erro: "semáforo cheio", codigo: "motor_ocupado" }, 503, { "Retry-After": "5" })]);
    const erro = await c.apuracaoDoArquivo(R, 301).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroDoMotor);
    expect(erro.ocupado).toBe(true);
    expect(erro.retryAfter).toBe(5);
    expect(erro.message).toBe("O motor está ocupado com outra leitura pesada; tente em alguns segundos (cerca de 5 s).");
    expect(chamadas).toHaveLength(1);
  });

  it("motor_ocupado numa rota leve também não se repete sozinho", async () => {
    const { c, chamadas } = cliente([json({ erro: "x", codigo: "motor_ocupado" }, 503)]);
    await expect(c.saldosIcms(R, 3)).rejects.toMatchObject({ codigo: "motor_ocupado", retryAfter: null, message: expect.stringMatching(/ocupado/) });
    expect(chamadas).toHaveLength(1);
  });

  it("os 422 novos têm mensagem em português quando o motor não manda frase", async () => {
    const casos = [["obrigacao_incompativel", /outra obrigação/], ["uf_nao_suportada", /Santa Catarina/], ["sem_arquivo", /Não há SPED gerado/]] as const;
    for (const [codigo, frase] of casos) {
      const { c } = cliente([json({ codigo }, 422)]);
      await expect(c.apuracaoDoArquivo(R, 301)).rejects.toMatchObject({ status: 422, codigo, message: expect.stringMatching(frase) });
    }
  });

  it("avisa quando o motor marca X-Custo: pesada numa rota tratada como leve", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { c } = cliente([json(F.SALDOS, 200, { "X-Custo": "pesada" })]);
    await c.saldosIcms(R, 3);
    expect(aviso.mock.calls[0][0]).toMatch(/X-Custo: pesada/);
  });
});

describe("XML da quarentena", () => {
  it("devolve a resposta sem ler o corpo, com Accept de XML", async () => {
    const { c, chamadas } = cliente([new Response("<NFe/>", { headers: { "Content-Type": "application/xml; charset=utf-8" } })]);
    const r = await c.xmlDaQuarentena(R, 9001);
    expect(r.bodyUsed).toBe(false);
    expect(await r.text()).toBe("<NFe/>");
    expect((chamadas[0].init.headers as Record<string, string>).Accept).toBe("application/xml");
    expect(caminho(chamadas[0].url)).toBe("/quarentena/9001/xml?cnpj_raiz=17122471");
  });
});
