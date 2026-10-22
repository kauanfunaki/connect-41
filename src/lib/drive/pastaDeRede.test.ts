import { describe, expect, it } from "vitest";
import { arquivoIgnoradoNaRede, cnpjDaPastaDaEmpresa, cnpjFormatado, lerCaminhoDaRede, lerCnpj, nomeComparavel, pastaPeloNome } from "./pastaDeRede";

// A pasta de rede ligada aos Arquivos (21/10/2026): o caminho que o robô manda,
// o CNPJ da pasta da empresa e o nome da pasta do modelo.

describe("lerCaminhoDaRede", () => {
  it("separa pastas e arquivo, com barra de Windows ou não", () => {
    expect(lerCaminhoDaRede("Fiscal\\2026\\10\\nota.pdf")).toEqual({ ok: true, pastas: ["Fiscal", "2026", "10"], arquivo: "nota.pdf", caminho: "Fiscal/2026/10/nota.pdf" });
    expect(lerCaminhoDaRede("/Fiscal//nota.pdf")).toMatchObject({ ok: true, caminho: "Fiscal/nota.pdf" });
    expect(lerCaminhoDaRede("./Fiscal/ ./nota.pdf")).toMatchObject({ ok: true, caminho: "Fiscal/nota.pdf" });
  });

  it("recusa subir de pasta, arquivo solto e vazio", () => {
    expect(lerCaminhoDaRede("Fiscal/../../segredo.txt").ok).toBe(false);
    expect(lerCaminhoDaRede("nota.pdf")).toMatchObject({ ok: false, erro: expect.stringContaining("solto") });
    expect(lerCaminhoDaRede("").ok).toBe(false);
    expect(lerCaminhoDaRede(null).ok).toBe(false);
  });

  it("recusa caminho fundo ou comprido demais", () => {
    expect(lerCaminhoDaRede(`${Array.from({ length: 20 }, (_, i) => `p${i}`).join("/")}/a.pdf`).ok).toBe(false);
    expect(lerCaminhoDaRede(`${Array.from({ length: 5 }, () => "x".repeat(110)).join("/")}/a.pdf`).ok).toBe(false);
  });

  it("limpa caractere de controle do nome", () => {
    expect(lerCaminhoDaRede("Fiscal/no\u0007ta.pdf")).toMatchObject({ ok: true, arquivo: "no ta.pdf" });
  });
});

describe("CNPJ", () => {
  it("lê com e sem pontuação", () => {
    expect(lerCnpj("12.345.678/0001-90")).toBe("12345678000190");
    expect(lerCnpj("12345678000190")).toBe("12345678000190");
    expect(lerCnpj("1234567800019")).toBeNull();
    expect(lerCnpj("12345678000190x")).toBeNull();
    expect(cnpjFormatado("12345678000190")).toBe("12.345.678/0001-90");
  });

  it("acha no começo do nome da pasta da empresa", () => {
    expect(cnpjDaPastaDaEmpresa("12.345.678/0001-90 - Padaria")).toBe("12345678000190");
    expect(cnpjDaPastaDaEmpresa("12.345.678 0001-90 - Padaria")).toBe("12345678000190");
    expect(cnpjDaPastaDaEmpresa("12345678000190 Padaria")).toBe("12345678000190");
    expect(cnpjDaPastaDaEmpresa("Padaria 12345678000190")).toBeNull();
    expect(cnpjDaPastaDaEmpresa("123456780001901 - longo")).toBeNull();
    expect(cnpjDaPastaDaEmpresa("_modelo")).toBeNull();
  });
});

describe("pasta do modelo pelo nome", () => {
  const modelo = [{ name: "Fiscal" }, { name: "Departamento Pessoal" }, { name: "Societário" }];
  it("ignora acento, caixa e espaço a mais", () => {
    expect(nomeComparavel("  Societário ")).toBe("societario");
    expect(pastaPeloNome("SOCIETARIO", modelo)).toBe(modelo[2]);
    expect(pastaPeloNome("departamento  pessoal", modelo)).toBe(modelo[1]);
    expect(pastaPeloNome("RH", modelo)).toBeNull();
  });
});

describe("arquivos que não entram", () => {
  it.each(["~$contrato.docx", "Thumbs.db", "desktop.ini", ".DS_Store", "._nota.pdf", "copia.tmp", "baixando.crdownload", "atalho.lnk"])("%s", (nome) => {
    expect(arquivoIgnoradoNaRede(nome)).toBe(true);
  });
  it.each(["nota.pdf", "contrato.docx", "folha.xlsx"])("%s entra", (nome) => {
    expect(arquivoIgnoradoNaRede(nome)).toBe(false);
  });
});
