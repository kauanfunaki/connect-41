import { describe, expect, it, vi } from "vitest";

// A auditoria grava no banco; aqui só importa que a regra a chama.
const auditoria = vi.hoisted(() => ({ chamadas: [] as unknown[] }));
vi.mock("@/lib/audit", () => ({
  logAudit: async (x: unknown) => {
    auditoria.chamadas.push(x);
  },
}));

import { categoriaComONome, criarCategoriaNoPlanoDaEmpresa, nomeDaCategoria } from "./categoriaDaEmpresa";

describe("nomeDaCategoria", () => {
  it("colapsa espaço e tira as pontas, como o plano guarda", () => {
    expect(nomeDaCategoria("  Compra de   Moldes ")).toBe("Compra de Moldes");
  });

  // Cortar calado criaria uma categoria que o de-para, por nome, nunca casaria
  // com a linha do arquivo de onde ela veio.
  it("vazio ou acima de 120 caracteres não serve", () => {
    expect(nomeDaCategoria("   ")).toBeNull();
    expect(nomeDaCategoria("x".repeat(121))).toBeNull();
    expect(nomeDaCategoria("x".repeat(120))).toHaveLength(120);
  });
});

describe("categoriaComONome", () => {
  const plano = [
    { id: "p", name: "Juros Pagos", kind: "PAGAR", companyId: null },
    { id: "r", name: "juros pagos", kind: "RECEBER", companyId: "e1" },
    { id: "e", name: "Juros  Pagos", kind: "PAGAR", companyId: "e1" },
  ];

  it("acha pela chave do de-para, preferindo o mesmo tipo e, nele, a última (a da empresa)", () => {
    expect(categoriaComONome(plano, "JUROS PAGOS", "PAGAR")?.id).toBe("e");
    expect(categoriaComONome(plano, "Júros pagos", "RECEBER")?.id).toBe("r");
  });

  it("sem uma do mesmo tipo, usa a de outro tipo — não cria um segundo nome igual", () => {
    expect(categoriaComONome([plano[1]!], "Juros pagos", "PAGAR")?.id).toBe("r");
  });

  it("nula quando não há", () => {
    expect(categoriaComONome(plano, "Compra de Moldes", "PAGAR")).toBeNull();
  });
});

describe("criarCategoriaNoPlanoDaEmpresa", () => {
  function banco(opcoes: { noPadrao?: boolean; duplicada?: boolean } = {}) {
    const criadas: unknown[] = [];
    const db = {
      financeCategory: {
        findFirst: async () => (opcoes.noPadrao ? { id: "padrao" } : null),
        create: async ({ data }: { data: unknown }) => {
          if (opcoes.duplicada) throw Object.assign(new Error("unique"), { code: "P2002" });
          criadas.push(data);
          return { id: "nova" };
        },
      },
    };
    return { db: db as never, criadas };
  }
  const dados = {
    tenantId: "t1",
    companyId: "e1",
    userId: "u1",
    nome: "Compra de Moldes",
    kind: "PAGAR" as const,
    planGroup: null,
    dreGroup: "cmv",
    origem: "dre" as const,
  };

  it("cria no plano da empresa, com o escopo dela e o grupo do DRE, e registra na auditoria", async () => {
    auditoria.chamadas = [];
    const { db, criadas } = banco();
    expect(await criarCategoriaNoPlanoDaEmpresa(db, dados)).toEqual({ ok: true, id: "nova" });
    expect(criadas).toEqual([
      { tenantId: "t1", companyId: "e1", scope: "e1", name: "Compra de Moldes", kind: "PAGAR", planGroup: null, dreGroup: "cmv" },
    ]);
    expect(auditoria.chamadas).toHaveLength(1);
    expect(auditoria.chamadas[0]).toMatchObject({ action: "financeiro.categoria_da_empresa.criada", entityId: "nova" });
  });

  it("recusa o nome que o padrão do escritório já tem", async () => {
    const r = await criarCategoriaNoPlanoDaEmpresa(banco({ noPadrao: true }).db, dados);
    expect(r).toEqual({ error: expect.stringContaining("já existe no plano padrão") });
  });

  it("recusa a repetida na empresa, com o nome na mensagem", async () => {
    const r = await criarCategoriaNoPlanoDaEmpresa(banco({ duplicada: true }).db, dados);
    expect(r).toEqual({ error: 'Esta empresa já tem a categoria "Compra de Moldes".' });
  });
});
