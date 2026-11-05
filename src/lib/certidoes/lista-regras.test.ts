import { describe, expect, it } from "vitest";
import { casaComABusca, estadoDaCertidao, lerRecorte, normalizar, proximoVencimento, recortesDaEmpresa, rotuloDeEmitirTodas } from "./lista-regras";

// As regras da lista de /certidoes (opção A, 05/11/2026): busca, atalhos e o
// estado de cada certidão na linha. Hoje é 05/11/2026 em todos os casos.
const HOJE = "2026-11-05";
const empresa = (name: string, cnpj: string | null = "11444777000161", displayName: string | null = null) => ({ name, displayName, cnpj });

describe("a busca", () => {
  it("ignora acento, maiúscula e espaço sobrando", () => {
    expect(normalizar("  Pão   de SÃO João ")).toBe("pao de sao joao");
    expect(casaComABusca("pao de sao joao", empresa("Padaria Pão de São João Ltda"))).toBe(true);
    expect(casaComABusca("PADARIA", empresa("Padaria Pão de São João Ltda"))).toBe(true);
    expect(casaComABusca("zeta", empresa("Padaria Pão de São João Ltda"))).toBe(false);
  });

  it("acha pelo nome de exibição também", () => {
    expect(casaComABusca("zeta", empresa("Transportes Fictícios S/A", null, "Zeta Transportes"))).toBe(true);
  });

  it("acha pelo CNPJ com ou sem pontuação, a partir de três dígitos", () => {
    const e = empresa("Empresa Fictícia", "11.444.777/0001-61");
    expect(casaComABusca("11444777", e)).toBe(true);
    expect(casaComABusca("11.444.777/0001", e)).toBe(true);
    expect(casaComABusca("0001-61", e)).toBe(true);
    expect(casaComABusca("99.999", e)).toBe(false);
    // Dois dígitos só valem no nome.
    expect(casaComABusca("61", e)).toBe(false);
  });

  it("busca vazia traz todas", () => {
    expect(casaComABusca("   ", empresa("Qualquer"))).toBe(true);
  });
});

describe("o atalho da URL", () => {
  it("lê os quatro e cai em todas no resto", () => {
    expect(lerRecorte("positivas")).toBe("positivas");
    expect(lerRecorte("faltando")).toBe("faltando");
    expect(lerRecorte("vencendo")).toBe("vencendo");
    expect(lerRecorte("outra")).toBe("todas");
    expect(lerRecorte(undefined)).toBe("todas");
  });
});

describe("o estado de cada certidão", () => {
  const regular = (validaAte: string | null) => ({ situacao: "NEGATIVA" as const, validaAte, vista: false });

  it("sem certidão quando nunca saiu", () => {
    expect(estadoDaCertidao(null, HOJE)).toEqual({ tipo: "sem" });
    expect(estadoDaCertidao({ situacao: "NAO_SAIU", validaAte: null, vista: false }, HOJE)).toEqual({ tipo: "sem" });
  });

  it("positiva, a ver até alguém marcar", () => {
    expect(estadoDaCertidao({ situacao: "POSITIVA", validaAte: null, vista: false }, HOJE)).toMatchObject({ tipo: "positiva", aVer: true });
    expect(estadoDaCertidao({ situacao: "POSITIVA", validaAte: null, vista: true }, HOJE)).toMatchObject({ tipo: "positiva", aVer: false });
  });

  it("vencida, vencendo em 15 dias ou regular pela validade", () => {
    expect(estadoDaCertidao(regular("2026-11-04"), HOJE).tipo).toBe("vencida");
    expect(estadoDaCertidao(regular("2026-11-05"), HOJE).tipo).toBe("vencendo");
    expect(estadoDaCertidao(regular("2026-11-20"), HOJE).tipo).toBe("vencendo");
    expect(estadoDaCertidao(regular("2026-11-21"), HOJE).tipo).toBe("regular");
    expect(estadoDaCertidao(regular(null), HOJE).tipo).toBe("regular");
    expect(estadoDaCertidao({ situacao: "POSITIVA_COM_EFEITO", validaAte: "2027-01-10", vista: false }, HOJE).tipo).toBe("regular");
  });

  it("a empresa entra em cada atalho pelo pior de cada certidão", () => {
    expect([...recortesDaEmpresa([regular("2027-01-01")], HOJE)]).toEqual(["todas"]);
    const r = recortesDaEmpresa([null, { situacao: "POSITIVA", validaAte: null, vista: false }, regular("2026-11-10")], HOJE);
    expect([...r].sort()).toEqual(["faltando", "positivas", "todas", "vencendo"]);
    // Positiva já vista não volta para "a ver"; vencida entra em "vencendo".
    expect([...recortesDaEmpresa([{ situacao: "POSITIVA", validaAte: null, vista: true }, regular("2026-10-01")], HOJE)].sort()).toEqual(["todas", "vencendo"]);
  });
});

describe("o próximo vencimento", () => {
  it("a que falta vem antes de qualquer data", () => {
    expect(proximoVencimento({ FEDERAL: null, FGTS: { situacao: "NEGATIVA", validaAte: "2026-11-06", vista: false } }, HOJE)).toEqual({ tipo: "sem", certidao: "FEDERAL" });
  });

  it("senão, a validade mais próxima, dizendo se venceu", () => {
    expect(
      proximoVencimento(
        { FEDERAL: { situacao: "NEGATIVA", validaAte: "2027-02-02", vista: false }, FGTS: { situacao: "NEGATIVA", validaAte: "2026-11-20", vista: false } },
        HOJE
      )
    ).toEqual({ tipo: "data", certidao: "FGTS", validaAte: "2026-11-20", vencida: false, vencendo: true });
    expect(proximoVencimento({ FGTS: { situacao: "NEGATIVA", validaAte: "2026-11-01", vista: false } }, HOJE)).toMatchObject({ vencida: true });
    expect(proximoVencimento({ FEDERAL: { situacao: "NEGATIVA", validaAte: null, vista: false } }, HOJE)).toBeNull();
  });
});

describe("o botão do painel", () => {
  it("diz quantas vão sair", () => {
    expect(rotuloDeEmitirTodas(5)).toBe("Emitir as cinco");
    expect(rotuloDeEmitirTodas(3)).toBe("Emitir as três");
    expect(rotuloDeEmitirTodas(1)).toBe("Emitir");
  });
});
