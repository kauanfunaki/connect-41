import { describe, expect, it } from "vitest";
import type { PastaDoDrive, QuemPede } from "./regras";
import {
  ARQUIVOS_POR_VEZ,
  MAXIMO_DE_ARQUIVOS,
  buscaAtiva,
  clausulaDaBusca,
  documentoDaPalavra,
  empresasDaPalavra,
  filtroDasPastas,
  lerFiltroDaBusca,
  lerTipo,
  opcoesDoTipo,
  palavrasDaBusca,
  pastasDaBusca,
  urlDaBusca,
} from "./busca";

const pasta = (id: string, parentId: string | null, extra: Partial<PastaDoDrive> = {}): PastaDoDrive => ({
  id,
  name: id,
  parentId,
  companyId: "emp",
  sectorCode: null,
  systemKey: null,
  sharedWithPortal: false,
  deletedAt: null,
  ...extra,
});

const quem = (role: QuemPede["role"], sectors: string[] = []): QuemPede => ({ role, sectors, subscriptionReadOnly: false });

// Duas empresas e as pastas do escritório. O DP é do setor "dp"; "velha" está
// na lixeira; "orfa" aponta para um pai que não existe.
const ARVORE: PastaDoDrive[] = [
  pasta("fiscal", null, { systemKey: "modelo:m-fiscal" }),
  pasta("fiscal-2026", "fiscal"),
  pasta("dp", null, { systemKey: "modelo:m-dp", sectorCode: "dp" }),
  pasta("holerites", "dp"),
  pasta("guias", null, { systemKey: "modelo:m-guias", sharedWithPortal: true }),
  pasta("enviados", null, { systemKey: "enviados", sharedWithPortal: true }),
  pasta("velha", null, { deletedAt: new Date("2026-11-01T00:00:00Z") }),
  pasta("dentro-da-velha", "velha"),
  pasta("fiscal-da-outra", null, { companyId: "emp2", systemKey: "modelo:m-fiscal" }),
  pasta("modelos-da-casa", null, { companyId: null }),
  pasta("orfa", "nao-existe"),
];

const clausula = (q: QuemPede, extra: Partial<Parameters<typeof clausulaDaBusca>[0]> = {}) =>
  clausulaDaBusca({ tenantId: "t", quem: q, pastas: ARVORE, tipo: null, palavras: [], ...extra });

/** Toda condição da cláusula que fala de outra tabela (a pasta, a guia, a certidão) e a de cima. */
function condicoesComTabela(where: unknown): Record<string, unknown>[] {
  const achadas: Record<string, unknown>[] = [];
  const andar = (no: unknown, chave: string | null) => {
    if (Array.isArray(no)) return no.forEach((x) => andar(x, null));
    if (!no || typeof no !== "object" || no instanceof Date) return;
    if (chave === "folder" || chave === "some") achadas.push(no as Record<string, unknown>);
    for (const [k, v] of Object.entries(no)) andar(v, k);
  };
  achadas.push(where as Record<string, unknown>);
  andar(where, null);
  return achadas;
}

describe("palavrasDaBusca", () => {
  it("separa por espaço, tira as de uma letra e não repete (maiúscula ou não)", () => {
    expect(palavrasDaBusca("  Contrato a contrato   SOCIAL ")).toEqual(["Contrato", "SOCIAL"]);
  });

  it("para em cinco palavras", () => {
    expect(palavrasDaBusca("um dois tres quatro cinco seis")).toEqual(["um", "dois", "tres", "quatro", "cinco"]);
  });
});

describe("documentoDaPalavra", () => {
  it("o CNPJ com ou sem máscara dá os mesmos dígitos", () => {
    expect(documentoDaPalavra("12.345.678/0001-90")).toBe("12345678000190");
    expect(documentoDaPalavra("12345678000190")).toBe("12345678000190");
  });

  it("a raiz (8 números) já vale; ano e competência não viram CNPJ", () => {
    expect(documentoDaPalavra("12.345.678")).toBe("12345678");
    expect(documentoDaPalavra("2026")).toBeNull();
    expect(documentoDaPalavra("09/2026")).toBeNull();
  });
});

describe("lerTipo e lerFiltroDaBusca", () => {
  it("aceita os vínculos, a pasta de envios e a chave do modelo; o resto é sem tipo", () => {
    expect(lerTipo("guia")).toEqual({ vinculo: "guia" });
    expect(lerTipo("certidao")).toEqual({ vinculo: "certidao" });
    expect(lerTipo("enviados")).toEqual({ pasta: "enviados" });
    expect(lerTipo("modelo:3f1c-aa")).toEqual({ pasta: "modelo:3f1c-aa" });
    expect(lerTipo("modelo:")).toBeNull();
    expect(lerTipo("modelo:../x")).toBeNull();
    expect(lerTipo("qualquer")).toBeNull();
    expect(lerTipo(undefined)).toBeNull();
  });

  it("apara o termo e conta as levas de 50, até 200", () => {
    const f = lerFiltroDaBusca({ q: "  contrato   social ", tipo: "guia" });
    expect(f).toMatchObject({ termo: "contrato social", palavras: ["contrato", "social"], tipo: { vinculo: "guia" }, pagina: 1, limite: ARQUIVOS_POR_VEZ });
    expect(lerFiltroDaBusca({ pagina: "3" }).limite).toBe(150);
    expect(lerFiltroDaBusca({ pagina: "99" })).toMatchObject({ pagina: 4, limite: MAXIMO_DE_ARQUIVOS });
    expect(lerFiltroDaBusca({ pagina: "-2" }).pagina).toBe(1);
    expect(lerFiltroDaBusca({ pagina: "abc" }).pagina).toBe(1);
  });

  it("busca de verdade só com uma palavra que vale ou um tipo", () => {
    expect(buscaAtiva(lerFiltroDaBusca({ q: "a" }))).toBe(false);
    expect(buscaAtiva(lerFiltroDaBusca({}))).toBe(false);
    expect(buscaAtiva(lerFiltroDaBusca({ q: "nf" }))).toBe(true);
    expect(buscaAtiva(lerFiltroDaBusca({ tipo: "certidao" }))).toBe(true);
  });
});

describe("urlDaBusca", () => {
  it("troca o termo, mantém o tipo e volta para os primeiros 50", () => {
    expect(urlDaBusca("/arquivos", "tipo=guia&pagina=3&q=velho", "novo termo")).toBe("/arquivos?tipo=guia&q=novo+termo");
  });

  it("termo vazio tira o q", () => {
    expect(urlDaBusca("/arquivos", "q=x&tipo=guia", "  ")).toBe("/arquivos?tipo=guia");
    expect(urlDaBusca("/arquivos", "q=x", "")).toBe("/arquivos");
  });
});

describe("filtroDasPastas", () => {
  it("nenhuma pasta dentro: nada a buscar; nenhuma fora: sem filtro", () => {
    expect(filtroDasPastas([], ["a"])).toBeNull();
    expect(filtroDasPastas(["a"], [])).toBeUndefined();
  });

  it("manda a lista mais curta, em ordem", () => {
    expect(filtroDasPastas(["c", "a", "b"], ["d"])).toEqual({ notIn: ["d"] });
    expect(filtroDasPastas(["b"], ["c", "a"])).toEqual({ in: ["b"] });
    expect(filtroDasPastas(["b", "a"], ["d", "c"])).toEqual({ in: ["a", "b"] });
  });
});

describe("pastasDaBusca — a régua dos Arquivos", () => {
  it("quem vê tudo fica sem a lixeira (e o que está dentro dela) e sem a pasta de caminho quebrado", () => {
    for (const papel of ["ADMIN", "SUPER_ADMIN", "READONLY"] as const) {
      const { fora } = pastasDaBusca(quem(papel), ARVORE, null);
      expect(fora.sort()).toEqual(["dentro-da-velha", "orfa", "velha"]);
    }
  });

  it("pasta de setor (e o que está dentro) só para o setor", () => {
    expect(pastasDaBusca(quem("SECTOR_USER", ["fiscal"]), ARVORE, null).fora).toEqual(expect.arrayContaining(["dp", "holerites"]));
    expect(pastasDaBusca(quem("SECTOR_ADMIN", ["fiscal"]), ARVORE, null).fora).toEqual(expect.arrayContaining(["dp", "holerites"]));
    const doDp = pastasDaBusca(quem("SECTOR_USER", ["dp"]), ARVORE, null);
    expect([...doDp.dentro.keys()]).toEqual(expect.arrayContaining(["dp", "holerites"]));
  });

  it("as pastas internas do escritório entram sem tipo, e o caminho vira o rótulo", () => {
    const { dentro } = pastasDaBusca(quem("SECTOR_USER", ["fiscal"]), ARVORE, null);
    expect(dentro.has("modelos-da-casa")).toBe(true);
    expect(dentro.get("fiscal-2026")?.map((p) => p.name)).toEqual(["fiscal", "fiscal-2026"]);
  });

  it("com a pasta do modelo, só ela e o que está dentro, em todas as empresas", () => {
    const { dentro } = pastasDaBusca(quem("ADMIN"), ARVORE, "modelo:m-fiscal");
    expect([...dentro.keys()].sort()).toEqual(["fiscal", "fiscal-2026", "fiscal-da-outra"]);
  });
});

describe("clausulaDaBusca", () => {
  it("fora da lixeira e com a régua das pastas na lista curta", () => {
    expect(clausula(quem("ADMIN"))?.where).toEqual({
      tenantId: "t",
      deletedAt: null,
      folderId: { notIn: ["dentro-da-velha", "orfa", "velha"] },
    });
    expect(clausula(quem("SECTOR_USER", ["fiscal"]))?.where.folderId).toEqual({
      notIn: ["dentro-da-velha", "dp", "holerites", "orfa", "velha"],
    });
  });

  it("o tipo pasta do modelo vira a lista das pastas dele", () => {
    expect(clausula(quem("ADMIN"), { tipo: { pasta: "enviados" } })?.where.folderId).toEqual({ in: ["enviados"] });
  });

  it("pasta do modelo de outro setor: nada a buscar, nem vai ao banco", () => {
    expect(clausula(quem("SECTOR_USER", ["fiscal"]), { tipo: { pasta: "modelo:m-dp" } })).toBeNull();
    expect(clausula(quem("SECTOR_USER", ["dp"]), { tipo: { pasta: "modelo:m-dp" } })?.where.folderId).toEqual({ in: ["dp", "holerites"] });
  });

  it("o vínculo pede a guia ou a certidão do arquivo, no mesmo escritório", () => {
    expect(clausula(quem("ADMIN"), { tipo: { vinculo: "guia" } })?.where).toMatchObject({ guias: { some: { tenantId: "t" } } });
    expect(clausula(quem("ADMIN"), { tipo: { vinculo: "certidao" } })?.where).toMatchObject({ certidoes: { some: { tenantId: "t" } } });
  });

  it("cada palavra no nome do arquivo ou na empresa dele", () => {
    const where = clausula(quem("ADMIN"), {
      palavras: [
        { palavra: "contrato", empresas: [] },
        { palavra: "padaria", empresas: ["emp2"] },
      ],
    })?.where;
    expect(where?.AND).toEqual([
      { OR: [{ name: { contains: "contrato" } }] },
      { OR: [{ name: { contains: "padaria" } }, { folder: { tenantId: "t", companyId: { in: ["emp2"] } } }] },
    ]);
  });

  it("toda condição leva o tenantId — a do arquivo, a da pasta da empresa e a do vínculo", () => {
    for (const tipo of [null, { vinculo: "guia" as const }, { vinculo: "certidao" as const }, { pasta: "modelo:m-fiscal" }]) {
      const where = clausula(quem("SECTOR_USER", ["fiscal"]), { tipo, palavras: [{ palavra: "x1", empresas: ["emp"] }] })?.where;
      const condicoes = condicoesComTabela(where);
      expect(condicoes.length).toBeGreaterThan(1);
      for (const c of condicoes) expect(c.tenantId).toBe("t");
    }
  });

  it("escritório sem pasta nenhuma: nada a buscar", () => {
    expect(clausulaDaBusca({ tenantId: "t", quem: quem("ADMIN"), pastas: [], tipo: null, palavras: [] })).toBeNull();
  });
});

describe("empresasDaPalavra", () => {
  it("nome, apelido e nome fantasia pelo texto, no escritório de quem busca", () => {
    expect(empresasDaPalavra("t", "padaria")).toEqual({
      tenantId: "t",
      OR: [{ name: { contains: "padaria" } }, { displayName: { contains: "padaria" } }, { tradeName: { contains: "padaria" } }],
    });
  });

  it("CNPJ e CPF pelos dígitos, com ou sem máscara", () => {
    expect(empresasDaPalavra("t", "12.345.678/0001-90").OR).toEqual(
      expect.arrayContaining([{ cnpj: { contains: "12345678000190" } }, { cpf: { contains: "12345678000190" } }])
    );
  });
});

describe("opcoesDoTipo", () => {
  const modelo = [
    { id: "m-fiscal", name: "Fiscal", sectorCode: null },
    { id: "m-dp", name: "Departamento Pessoal", sectorCode: "dp" },
    { id: "m-guias", name: "Guias", sectorCode: null },
  ];

  it("a pasta do modelo de outro setor não aparece; envios e vínculos sempre", () => {
    expect(opcoesDoTipo(quem("SECTOR_USER", ["fiscal"]), modelo).map((o) => o.value)).toEqual([
      "modelo:m-fiscal",
      "modelo:m-guias",
      "enviados",
      "guia",
      "certidao",
    ]);
  });

  it("quem é do DP, ou vê tudo, tem a do DP", () => {
    expect(opcoesDoTipo(quem("SECTOR_USER", ["dp"]), modelo).map((o) => o.label)).toContain("Departamento Pessoal");
    expect(opcoesDoTipo(quem("READONLY"), modelo).map((o) => o.label)).toContain("Departamento Pessoal");
  });
});
