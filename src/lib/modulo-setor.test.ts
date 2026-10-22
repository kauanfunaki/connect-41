import { describe, expect, it } from "vitest";
import { resolverSetorDoModulo, resolverSetoresDoModulo, setorParaGravar, setorParaMostrar, setoresParaLigar } from "./modulo-setor";

describe("resolverSetorDoModulo", () => {
  it("mantém módulo exclusivo no setor de origem mesmo com override antigo", () => {
    expect(resolverSetorDoModulo("tech", "fiscal", true)).toBe("tech");
  });
  it("usa o setor do catálogo quando o tenant não transferiu", () => {
    expect(resolverSetorDoModulo("bpo", null)).toBe("bpo");
    expect(resolverSetorDoModulo("bpo", undefined)).toBe("bpo");
  });

  it("usa o setor transferido quando há um", () => {
    expect(resolverSetorDoModulo("bpo", "financeiro")).toBe("financeiro");
  });

  it("trata texto em branco como não transferido", () => {
    expect(resolverSetorDoModulo("bpo", "  ")).toBe("bpo");
  });
});

describe("setorParaGravar", () => {
  it("grava null ao voltar para o setor do catálogo", () => {
    expect(setorParaGravar("bpo", "bpo")).toBeNull();
    expect(setorParaGravar("bpo", "")).toBeNull();
  });

  it("grava o código quando é outro setor", () => {
    expect(setorParaGravar("bpo", " financeiro ")).toBe("financeiro");
  });
});

// Uma tela em mais de um setor (21/10/2026).
describe("resolverSetoresDoModulo", () => {
  it("sem setor a mais, é só o dono — a tela de antes", () => {
    expect(resolverSetoresDoModulo("fiscal", [])).toEqual(["fiscal"]);
  });

  it("o dono vem primeiro, depois os ligados na ordem em que entraram", () => {
    expect(resolverSetoresDoModulo("fiscal", ["contabil", "bpo"])).toEqual(["fiscal", "contabil", "bpo"]);
  });

  it("não repete o dono (tela movida para um setor que já estava ligado) nem guarda vazio", () => {
    expect(resolverSetoresDoModulo("bpo", ["bpo", " ", null, "contabil", "contabil "])).toEqual(["bpo", "contabil"]);
  });
});

describe("setoresParaLigar", () => {
  const ativos = ["bpo", "fiscal", "contabil"];

  it("tira o dono e os repetidos: o dono mora em tenant_modules", () => {
    expect(setoresParaLigar("fiscal", ["fiscal", "bpo", "bpo"], ativos)).toEqual(["bpo"]);
  });

  it("setor inventado ou inativo não entra — o valor vem do navegador", () => {
    expect(setoresParaLigar("fiscal", ["contabil", "inventado"], ativos)).toEqual(["contabil"]);
  });

  it("lista vazia volta a tela a ser só do dono", () => {
    expect(setoresParaLigar("fiscal", [], ativos)).toEqual([]);
  });
});

describe("setorParaMostrar", () => {
  const setores = ["fiscal", "contabil", "bpo"];

  it("com setor escolhido no alto da tela, é ele", () => {
    expect(setorParaMostrar(setores, { activeSector: "bpo", sectors: ["contabil"] })).toBe("bpo");
  });

  it("sem setor escolhido, o primeiro que é da pessoa", () => {
    expect(setorParaMostrar(setores, { activeSector: null, sectors: ["dp", "bpo"] })).toBe("bpo");
  });

  it("setor escolhido que não é da tela não conta; sem nenhum da pessoa, o dono", () => {
    expect(setorParaMostrar(setores, { activeSector: "dp", sectors: [] })).toBe("fiscal");
  });
});
