import { describe, expect, it } from "vitest";
import { avisoDaMudancaDaIE, ehSituacaoDaIE, lerSituacaoDaIE, precisaVigiarIE, temInscricaoEstadual } from "./inscricaoEstadual";

describe("lerSituacaoDaIE", () => {
  it("lê as quatro situações no masculino, no feminino e sem acento", () => {
    expect(lerSituacaoDaIE("ATIVO")).toBe("ATIVA");
    expect(lerSituacaoDaIE("Ativa")).toBe("ATIVA");
    expect(lerSituacaoDaIE("HABILITADO")).toBe("ATIVA");
    expect(lerSituacaoDaIE("SUSPENSO DESDE 01/10/2026")).toBe("SUSPENSA");
    expect(lerSituacaoDaIE("baixada")).toBe("BAIXADA");
    expect(lerSituacaoDaIE("  Cancelada ")).toBe("CANCELADA");
  });

  it("não chuta: texto desconhecido, vazio ou 'inativa' fica nulo", () => {
    expect(lerSituacaoDaIE("INATIVA")).toBeNull();
    expect(lerSituacaoDaIE("Em análise")).toBeNull();
    expect(lerSituacaoDaIE("")).toBeNull();
    expect(lerSituacaoDaIE(null)).toBeNull();
  });

  it("reconhece o que está gravado", () => {
    expect(ehSituacaoDaIE("SUSPENSA")).toBe(true);
    expect(ehSituacaoDaIE("suspensa")).toBe(false);
    expect(ehSituacaoDaIE(null)).toBe(false);
  });
});

describe("avisoDaMudancaDaIE", () => {
  it("não avisa quando nada muda nem na primeira leitura ativa", () => {
    expect(avisoDaMudancaDaIE("ATIVA", "ATIVA", "Empresa X")).toBeNull();
    expect(avisoDaMudancaDaIE("SUSPENSA", "SUSPENSA", "Empresa X")).toBeNull();
    expect(avisoDaMudancaDaIE(null, "ATIVA", "Empresa X")).toBeNull();
  });

  it("avisa quando sai de ativa e quando a primeira leitura já vem fora", () => {
    expect(avisoDaMudancaDaIE("ATIVA", "SUSPENSA", "Empresa X")).toEqual({ tom: "danger", mensagem: "Inscrição estadual de Empresa X passou de ativa para suspensa" });
    expect(avisoDaMudancaDaIE(null, "CANCELADA", "Empresa X")).toEqual({ tom: "danger", mensagem: "Inscrição estadual de Empresa X está cancelada" });
  });

  it("avisa quando volta a ficar ativa", () => {
    expect(avisoDaMudancaDaIE("SUSPENSA", "ATIVA", "Empresa X")).toEqual({ tom: "success", mensagem: "Inscrição estadual de Empresa X voltou a ficar ativa" });
  });
});

describe("precisaVigiarIE", () => {
  const agora = new Date("2026-10-30T12:00:00Z");
  const dias = (n: number) => new Date(agora.getTime() - n * 86_400_000);

  it("só a IE do PR com dígito", () => {
    expect(temInscricaoEstadual("ISENTO")).toBe(false);
    expect(precisaVigiarIE({ stateRegistration: "ISENTO", stateCode: "PR", stateRegistrationCheckedAt: null }, agora)).toBe(false);
    expect(precisaVigiarIE({ stateRegistration: "123.456.789-0", stateCode: "SC", stateRegistrationCheckedAt: null }, agora)).toBe(false);
    expect(precisaVigiarIE({ stateRegistration: "123.456.789-0", stateCode: "pr", stateRegistrationCheckedAt: null }, agora)).toBe(true);
  });

  it("lê de novo depois de uma semana", () => {
    const e = { stateRegistration: "1234567890", stateCode: "PR" };
    expect(precisaVigiarIE({ ...e, stateRegistrationCheckedAt: dias(6) }, agora)).toBe(false);
    expect(precisaVigiarIE({ ...e, stateRegistrationCheckedAt: dias(7) }, agora)).toBe(true);
  });
});
