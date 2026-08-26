import { describe, expect, it } from "vitest";
import { cnpjRoot, mesmoTenant, planejarGrupos, type EmpresaParaAgrupar } from "./clientGroups";

const emp = (id: string, name: string, cnpj: string | null): EmpresaParaAgrupar => ({ id, name, cnpj });

describe("cnpjRoot", () => {
  it("extrai os 8 primeiros dígitos com e sem máscara", () => {
    expect(cnpjRoot("17.122.471/0001-90")).toBe("17122471");
    expect(cnpjRoot("17122471000190")).toBe("17122471");
  });

  it("ignora o que não tem 14 dígitos", () => {
    expect(cnpjRoot(null)).toBeNull();
    expect(cnpjRoot("")).toBeNull();
    expect(cnpjRoot("373.709.313-61")).toBeNull(); // CPF
    expect(cnpjRoot("1712247100019")).toBeNull(); // 13 dígitos
    expect(cnpjRoot("171224710001900")).toBeNull(); // 15 dígitos
  });
});

describe("planejarGrupos", () => {
  // O caso que sustenta a decisão inteira: grupo BLD, 5 estabelecimentos sob
  // a mesma raiz, medido na base do SPED em 2026-08-21.
  it("junta estabelecimentos da mesma raiz num grupo só", () => {
    const grupos = planejarGrupos([
      emp("1", "BLD Participações", "17.122.471/0001-90"),
      emp("2", "BLD Comércio de Alimentos", "17.122.471/0002-70"),
      emp("3", "BLD Logística e Transportes", "17.122.471/0003-51"),
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].cnpjRoot).toBe("17122471");
    expect(grupos[0].empresas.map((e) => e.id).sort()).toEqual(["1", "2", "3"]);
  });

  it("nomeia o grupo pela empresa de nome mais curto — tende a ser a matriz", () => {
    const grupos = planejarGrupos([
      emp("1", "Aurora Comércio Filial São José dos Pinhais", "01.137.191/0002-98"),
      emp("2", "Aurora Comércio", "01.137.191/0001-17"),
    ]);

    expect(grupos[0].name).toBe("Aurora Comércio");
  });

  it("empresa de raiz única vira grupo 1:1, mas guarda a raiz", () => {
    const grupos = planejarGrupos([emp("1", "Nutriplena Alimentos", "03.211.373/0001-31")]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].name).toBe("Nutriplena Alimentos");
    expect(grupos[0].cnpjRoot).toBe("03211373");
  });

  it("empresa sem CNPJ utilizável vira grupo 1:1 sem raiz", () => {
    const grupos = planejarGrupos([
      emp("1", "Camila Duarte Arquitetura", null),
      emp("2", "Pedro Barbosa Advocacia", "373.709.313-61"),
    ]);

    expect(grupos).toHaveLength(2);
    expect(grupos.every((g) => g.cnpjRoot === null)).toBe(true);
  });

  // Sem esta, duas empresas sem CNPJ cairiam no mesmo balde de "raiz null" e
  // seriam agrupadas como se fossem do mesmo cliente.
  it("não agrupa empresas diferentes só porque as duas estão sem CNPJ", () => {
    const grupos = planejarGrupos([emp("1", "Alpha", null), emp("2", "Beta", null)]);

    expect(grupos).toHaveLength(2);
    expect(grupos.map((g) => g.empresas.length)).toEqual([1, 1]);
  });

  it("cobre 100% das empresas, sem repetir nenhuma", () => {
    const entrada = [
      emp("1", "BLD Participações", "17.122.471/0001-90"),
      emp("2", "BLD Comércio", "17.122.471/0002-70"),
      emp("3", "Nutriplena", "03.211.373/0001-31"),
      emp("4", "Camila Duarte Arquitetura", null),
    ];

    const ids = planejarGrupos(entrada).flatMap((g) => g.empresas.map((e) => e.id));

    expect(ids.sort()).toEqual(["1", "2", "3", "4"]);
  });

  it("é determinístico: a ordem de entrada não muda o resultado", () => {
    const entrada = [
      emp("1", "BLD Participações", "17.122.471/0001-90"),
      emp("2", "BLD Comércio", "17.122.471/0002-70"),
      emp("3", "Nutriplena", "03.211.373/0001-31"),
      emp("4", "Camila Duarte", null),
    ];

    const direto = planejarGrupos(entrada);
    const invertido = planejarGrupos([...entrada].reverse());

    expect(JSON.stringify(direto.map((g) => [g.name, g.cnpjRoot, g.empresas.map((e) => e.id).sort()])))
      .toBe(JSON.stringify(invertido.map((g) => [g.name, g.cnpjRoot, g.empresas.map((e) => e.id).sort()])));
  });

  it("lista vazia não gera grupo", () => {
    expect(planejarGrupos([])).toEqual([]);
  });
});

describe("mesmoTenant", () => {
  it("barra empresa entrando em grupo de outro tenant", () => {
    expect(mesmoTenant({ tenantId: "t1" }, { tenantId: "t2" })).toBe(false);
    expect(mesmoTenant({ tenantId: "t1" }, { tenantId: "t1" })).toBe(true);
  });
});
