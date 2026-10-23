import { describe, expect, it } from "vitest";
import { camposDaCorrecao, chaveDoEnvio, chaveDoPagamentoDaLinha, conferirArquivos, correcaoGravada, pendenciasDaPrevia, dinheiroDoCampo, ENVIOS, FOLGA_DO_ENVELOPE, mensagemDeTamanho, sha256DoArquivo, type ImpressaoDoEnvio } from "./escritasDoMotor";
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
    expect(mensagemDeTamanho("documentos")).toMatch(/25 MB.*painel do motor/);
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
