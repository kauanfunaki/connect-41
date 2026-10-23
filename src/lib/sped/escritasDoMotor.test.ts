import { describe, expect, it } from "vitest";
import { camposDaCorrecao, camposDoEnvio, chaveDoEnvio, regimeNaTela, somarEnvios, envioDeDocumentosSchema, chaveDoPagamentoDaLinha, conferirArquivos, correcaoGravada, pendenciasDaPrevia, dinheiroDoCampo, ENVIOS, FOLGA_DO_ENVELOPE, mensagemDeTamanho, sha256DoArquivo, type ImpressaoDoEnvio } from "./escritasDoMotor";
import { prestadoresSchema } from "./telasDoMotor";
import { permissaoDeEscrita, SEM_PERFIL_DE_ESCRITA, SEM_TOKEN_DE_ESCRITA } from "@/lib/fiscal/motor/escrita";

const MiB = 1024 * 1024;
const a = (name: string, size: number) => ({ name, size });

describe("tetos e tipos dos envios (§13.0.9)", () => {
  it("os tetos são os do motor: 25 MiB nos documentos, 20 MiB no Omie e no confronto", () => {
    expect([ENVIOS.documentos.teto, ENVIOS.omie.teto, ENVIOS.confronto.teto]).toEqual([25 * MiB, 20 * MiB, 20 * MiB]);
    expect([ENVIOS.documentos.parte, ENVIOS.omie.parte, ENVIOS.confronto.parte]).toEqual(["arquivos", "arquivo", "arquivo"]);
  });
  it("documentos: vários arquivos; o total conta contra o teto menos a folga do envelope", () => {
    expect(conferirArquivos("documentos", [a("a.xml", 10 * MiB), a("b.zip", 10 * MiB)])).toBeNull();
    expect(conferirArquivos("documentos", [a("a.zip", 25 * MiB - FOLGA_DO_ENVELOPE)])).toBeNull();
    expect(conferirArquivos("documentos", [a("a.zip", 25 * MiB - FOLGA_DO_ENVELOPE + 1)])).toBe(mensagemDeTamanho("documentos"));
    expect(conferirArquivos("documentos", [a("a.zip", 20 * MiB), a("b.zip", 5 * MiB)])).toBe(mensagemDeTamanho("documentos"));
  });
  it("acima do teto, a frase aponta o painel do motor", () => {
    // Documentos acima de 25 MB vão em partes (§14.4): a frase diz isso, não "use o painel".
    expect(mensagemDeTamanho("documentos")).toMatch(/25 MB.*em partes, até 500 MB/);
    expect(mensagemDeTamanho("omie")).toMatch(/20 MB.*painel do motor/);
    expect(mensagemDeTamanho("confronto")).toMatch(/20 MB/);
  });
  it("Omie e confronto: um arquivo só, até 20 MiB", () => {
    expect(conferirArquivos("omie", [a("r.csv", 20 * MiB - FOLGA_DO_ENVELOPE)])).toBeNull();
    expect(conferirArquivos("omie", [a("r.csv", 20 * MiB)])).toBe(mensagemDeTamanho("omie"));
    expect(conferirArquivos("omie", [a("r.csv", 1), a("s.csv", 1)])).toMatch(/um arquivo por vez/);
    expect(conferirArquivos("confronto", [a("p.xlsx", 21 * MiB)])).toBe(mensagemDeTamanho("confronto"));
  });
  it("confronto só aceita .xlsx (o motor lê com pandas.ExcelFile)", () => {
    expect(conferirArquivos("confronto", [a("Planilha BPO.XLSX", 100)])).toBeNull();
    expect(conferirArquivos("confronto", [a("p.xls", 100)])).toMatch(/\.xlsx/);
    expect(conferirArquivos("confronto", [a("p.csv", 100)])).toMatch(/\.xlsx/);
  });
  it("nenhum arquivo ou arquivo vazio é recusado antes de sair", () => {
    expect(conferirArquivos("documentos", [])).toMatch(/ao menos um/);
    expect(conferirArquivos("omie", [a("vazio.csv", 0)])).toMatch(/vazio/);
  });
});

describe("Idempotency-Key derivada do envio", () => {
  const base: ImpressaoDoEnvio = {
    destino: "documentos", raiz: "17122471", usuario: "u1", campos: {},
    arquivos: [{ nome: "a.pdf", tamanho: 49, sha256: "5025e7110f2576eed370952e54b04be9b702037fa234e69b7a7aa1bee4e348ed" }],
    gesto: "c41:11111111-2222-3333-4444-555555555555",
  };
  it("a nova tentativa do mesmo arquivo no mesmo gesto dá a mesma chave (replay no motor)", async () => {
    expect(await chaveDoEnvio(base)).toBe(await chaveDoEnvio({ ...base, arquivos: [...base.arquivos], campos: {} }));
  });
  it("tem o formato do motor", async () => {
    const k = await chaveDoEnvio(base);
    expect(k).toMatch(/^c41:[0-9a-f]{64}$/);
    expect(k).toMatch(/^[A-Za-z0-9:_-]{16,100}$/);
  });
  it("muda com o conteúdo, o destino, a raiz, quem envia, os campos e o gesto", async () => {
    const k = await chaveDoEnvio(base);
    const variacoes: Partial<ImpressaoDoEnvio>[] = [
      { arquivos: [{ ...base.arquivos[0], sha256: "0".repeat(64) }] },
      { arquivos: [{ ...base.arquivos[0], nome: "b.pdf" }] },
      { destino: "omie" }, { raiz: "12345678" }, { usuario: "u2" }, { campos: { competencia: "2026-09" } },
      { gesto: "c41:99999999-2222-3333-4444-555555555555" },
    ];
    for (const v of variacoes) expect(await chaveDoEnvio({ ...base, ...v })).not.toBe(k);
  });
  it("a ordem das chaves dos campos não importa", async () => {
    expect(await chaveDoEnvio({ ...base, campos: { a: "1", b: "2" } })).toBe(await chaveDoEnvio({ ...base, campos: { b: "2", a: "1" } }));
  });
  it("o SHA-256 do arquivo é o mesmo das fixtures do motor", async () => {
    expect(await sha256DoArquivo(new File(["%PDF-1.4 fixture 0eb6dadc16c44254946598a3d047bf32"], "x.pdf"))).toBe("5025e7110f2576eed370952e54b04be9b702037fa234e69b7a7aa1bee4e348ed");
  });
});

describe("dinheiro digitado", () => {
  it("aceita vírgula e ponto e devolve string decimal", () => {
    expect(dinheiroDoCampo("1.234,56")).toBe("1234.56");
    expect(dinheiroDoCampo("1234.56")).toBe("1234.56");
    expect(dinheiroDoCampo("0")).toBe("0");
    expect(dinheiroDoCampo("")).toBeNull();
    expect(dinheiroDoCampo("-1")).toBeNull();
    expect(dinheiroDoCampo("12,345")).toBeNull();
  });
});

describe("quem vê os botões das escritas", () => {
  it("sem perfil, somem; sem token, aparecem desabilitados com o motivo", () => {
    expect(permissaoDeEscrita({ agir: false, tokenDeEscrita: true })).toEqual({ pode: false, visivel: false, motivo: SEM_PERFIL_DE_ESCRITA });
    expect(permissaoDeEscrita({ agir: true, tokenDeEscrita: false })).toEqual({ pode: false, visivel: true, motivo: SEM_TOKEN_DE_ESCRITA });
    expect(permissaoDeEscrita({ agir: true, tokenDeEscrita: true })).toEqual({ pode: true, visivel: true, motivo: null });
    expect(SEM_TOKEN_DE_ESCRITA).toMatch(/token de escrita/);
  });
});

describe("correção de pagamento pela convenção do painel", () => {
  const linha = { caminho: "TESTE-TELAS/rpa.pdf", pagina: 4, ordem: 1, valor_corrigido: "55.50", documento_corrigido: "", nome_corrigido: "MARIA", competencia_corrigida: "", data_pagamento_corrigida: "", tipo_corrigido: "" };
  it("a chave vem da linha; sem ela, nada a decidir", () => {
    expect(chaveDoPagamentoDaLinha(linha)).toEqual({ caminho: "TESTE-TELAS/rpa.pdf", pagina: 4, ordem: 1 });
    expect(chaveDoPagamentoDaLinha({ caminho: "x", pagina: "4", ordem: 1 })).toBeNull();
    expect(chaveDoPagamentoDaLinha({ pagina: 1, ordem: 1 })).toBeNull();
  });
  it("só vai o que mudou; esvaziar manda \"\" (limpa); dinheiro com vírgula vira string decimal", () => {
    const inicial = correcaoGravada(linha);
    expect(inicial.valor).toBe("55.50");
    expect(camposDaCorrecao(inicial, { ...inicial })).toEqual({});
    expect(camposDaCorrecao(inicial, { ...inicial, valor: "60,00", nome: "", documento: "987.654.321-00" })).toEqual({ valor: "60.00", nome: "", documento: "98765432100" });
    expect(camposDaCorrecao(inicial, { ...inicial, valor: "abc" })).toEqual({ erro: expect.any(String) });
  });
});

describe("o que falta apurar, lido da prévia", () => {
  it("na forma das fixtures do motor", async () => {
    const { readFileSync } = await import("fs");
    const path = await import("path");
    const f = JSON.parse(readFileSync(path.resolve(__dirname, "../../../tests/fixtures/connect_v1/escritas/simulacao.json"), "utf8"));
    expect(pendenciasDaPrevia(f.resposta.corpo)).toEqual({
      cte: [],
      combustivel: ["17122471000175", "17122471001147", "17122471001490"],
      simulacoes: [{ linha: "rpas", valor: "1234.56", observacao: "RPA de março" }],
    });
  });
  it("forma inesperada vira lista vazia, sem quebrar a tela", () => {
    expect(pendenciasDaPrevia({ cte: null, combustivel: "x", simulacoes: { a: 1 } })).toEqual({ cte: [], combustivel: [], simulacoes: [] });
    expect(pendenciasDaPrevia({ cte: { pendentes: [103, "104", 103] }, combustivel: { pendentes: ["123"] }, simulacoes: [{ linha: "rpas", valor: null }] })).toEqual({ cte: [103], combustivel: [], simulacoes: [{ linha: "rpas", valor: null, observacao: "" }] });
  });
});

describe("os envios de §14.3 (pagamentos de apoio e faturas do BPO)", () => {
  it("25 MiB cada; PDF nos pagamentos; planilha .xlsx mais os PDF dos comprovantes nas faturas", () => {
    expect([ENVIOS.pagamentos_apoio.teto, ENVIOS.faturas_bpo.teto]).toEqual([25 * MiB, 25 * MiB]);
    expect([ENVIOS.pagamentos_apoio.caminho, ENVIOS.faturas_bpo.caminho]).toEqual(["/pagamentos-apoio/importar", "/faturas-bpo/importar"]);
    expect(conferirArquivos("pagamentos_apoio", [a("r1.pdf", 1), a("r2.PDF", 1)])).toBeNull();
    expect(conferirArquivos("pagamentos_apoio", [a("r1.jpg", 1)])).toMatch(/PDF/);
    expect(conferirArquivos("faturas_bpo", [a("f.xlsx", 1)], [a("NF 123.pdf", 1)])).toBeNull();
    expect(conferirArquivos("faturas_bpo", [a("f.xlsx", 1), a("g.xlsx", 1)])).toMatch(/uma planilha por vez/);
    expect(conferirArquivos("faturas_bpo", [a("f.csv", 1)])).toMatch(/\.xlsx/);
    expect(conferirArquivos("faturas_bpo", [a("f.xlsx", 1)], [a("c.png", 1)])).toMatch(/comprovantes vão em PDF/);
    expect(conferirArquivos("faturas_bpo", [a("f.xlsx", 20 * MiB)], [a("c.pdf", 5 * MiB)])).toBe(mensagemDeTamanho("faturas_bpo"));
    expect(conferirArquivos("omie", [a("r.csv", 1)], [a("x.pdf", 1)])).toMatch(/não aceita/);
  });
  it("os campos de cada envio, validados e na ordem do multipart", () => {
    const de = (o: Record<string, string>) => (k: string) => o[k];
    expect(camposDoEnvio("pagamentos_apoio", de({ tipo: "recibo", pasta: " TESTE/2032-03 ", ocr: "" }))).toEqual({ campos: { tipo: "recibo", pasta: "TESTE/2032-03" } });
    expect(camposDoEnvio("pagamentos_apoio", de({ tipo: "rpa", ocr: "true" }))).toEqual({ campos: { tipo: "rpa", ocr: "true" } });
    expect(camposDoEnvio("pagamentos_apoio", de({ tipo: "nota_fiscal" }))).toMatchObject({ campo: "tipo" });
    for (const pasta of ["../x", "a/../b", "/abs", "\\rede", "x".repeat(201)]) expect(camposDoEnvio("pagamentos_apoio", de({ tipo: "recibo", pasta }))).toMatchObject({ campo: "pasta" });
    expect(camposDoEnvio("faturas_bpo", de({ substituir: "true" }))).toEqual({ campos: { substituir: "true" } });
    expect(camposDoEnvio("faturas_bpo", de({ substituir: "false" }))).toEqual({ campos: {} });
    expect(camposDoEnvio("omie", de({ competencia: "2026-13" }))).toMatchObject({ campo: "competencia" });
    expect(camposDoEnvio("confronto", de({ competencia: "2026-09" }))).toEqual({ campos: { competencia: "2026-09" } });
    expect(camposDoEnvio("documentos", de({ competencia: "2026-09" }))).toEqual({ campos: {} });
  });
});

describe("o regime do prestador na tela (§14.1)", () => {
  it("o selo diz quem decidiu; a linha oferece o outro regime e, só na correção do cliente, desfazer", () => {
    const cliente = regimeNaTela({ regime: "mei", origem: "cliente" });
    expect([cliente.origem?.rotulo, cliente.rotulo, cliente.acoes.map((x) => x.regime)]).toEqual(["Corrigido neste cliente", "MEI", ["normal", null]]);
    const cadastro = regimeNaTela({ regime: "normal", origem: "cadastro" });
    expect([cadastro.origem?.variante, cadastro.acoes.map((x) => x.regime)]).toEqual(["neutral", ["mei"]]);
    const nome = regimeNaTela({ regime: "normal", origem: "nome" });
    expect([nome.origem?.rotulo, nome.acoes.map((x) => x.regime)]).toEqual(["Pelo nome", ["mei"]]);
    // Motor anterior a §14: sem origem, sem selo — e sem "desfazer".
    expect(regimeNaTela({ regime: "mei", origem: null })).toMatchObject({ origem: null, acoes: [{ regime: "normal" }] });
  });
  it("a lista de prestadores lê `origem`; ausente ou desconhecida vira null, sem quebrar a leitura", () => {
    const l = prestadoresSchema.parse({ mei: "1.00", normal: "0.00", prestadores_mei: [{ cnpj: "1", nome: "A", regime: "mei", por_cadastro: true, origem: "cliente" }, { cnpj: "2", regime: "mei", origem: "outra" }], prestadores_normal: [{ cnpj: "3", regime: "normal" }] });
    expect([...l.prestadores_mei, ...l.prestadores_normal].map((p) => p.origem)).toEqual(["cliente", null, null]);
  });
});

describe("o relatório de vários envios em partes", () => {
  it("soma o resumo e junta as linhas; a importação é a do último", () => {
    const um = envioDeDocumentosSchema.parse({ resumo: { lidos: 2, cancelamentos: 0, novos: 1, duplicados: 1, erros: 0, ignorados: 0, por_tipo: { "CT-e": 1 } }, relatorio: [{ arquivo: "a", tipo: "CT-e", chave: null, situacao: "novo", detalhe: "" }], importacao_id: 1 });
    const dois = envioDeDocumentosSchema.parse({ resumo: { lidos: 1, cancelamentos: 0, novos: 0, duplicados: 0, erros: 0, ignorados: 1, por_tipo: { "CT-e": 2, arquivo: 1 } }, relatorio: [{ arquivo: "b", tipo: "-", chave: null, situacao: "ignorado", detalhe: "" }], importacao_id: 2 });
    const s = somarEnvios([um, dois])!;
    expect([s.importacao_id, s.resumo.lidos, s.resumo.ignorados, s.resumo.por_tipo, s.relatorio.map((x) => x.arquivo)]).toEqual([2, 3, 1, { "CT-e": 3, arquivo: 1 }, ["a", "b"]]);
    expect(um.resumo.lidos).toBe(2);
    expect(somarEnvios([])).toBeNull();
  });
});
