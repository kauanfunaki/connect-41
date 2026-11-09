import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

// O banco simulado: guarda cada consulta (para conferir o tenantId de todas)
// e devolve o que o estado manda. O filtro de verdade é do banco; aqui se
// testa o que a busca pede a ele e o que faz com a resposta.
type Chamada = { tabela: string; args: { where?: Record<string, unknown> } };
const chamadas: Chamada[] = [];
const estado = {
  pastas: [] as unknown[],
  arquivos: [] as unknown[],
  empresasDaPalavra: [] as { id: string }[],
  empresas: [] as { id: string; name: string; displayName: string | null; cnpj: string | null }[],
  modelo: [] as unknown[],
  moduloLigado: true,
};

function registrar<T>(tabela: string, resposta: (args: Chamada["args"]) => T) {
  return async (args: Chamada["args"]) => {
    chamadas.push({ tabela, args });
    return resposta(args);
  };
}

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    driveFolder: { findMany: registrar("driveFolder", () => estado.pastas) },
    driveFile: { findMany: registrar("driveFile", () => estado.arquivos) },
    driveTemplateFolder: { findMany: registrar("driveTemplateFolder", () => estado.modelo) },
    company: {
      findMany: registrar("company", (args) => ((args.where?.id as { in?: string[] } | undefined)?.in ? estado.empresas : estado.empresasDaPalavra)),
    },
  }),
}));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: async () => estado.moduloLigado }));

const { arquivosParaABuscaDoTopo, buscarEmTodasAsEmpresas, opcoesDoTipoDoEscritorio } = await import("./buscaServidor");

const pasta = (id: string, parentId: string | null, extra: Record<string, unknown> = {}) => ({
  id,
  name: id === "fiscal" ? "Fiscal" : id,
  parentId,
  companyId: "emp",
  sectorCode: null,
  systemKey: null,
  sharedWithPortal: false,
  deletedAt: null,
  ...extra,
});

const arquivo = (id: string, folderId: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `${id}.pdf`,
  sizeBytes: 1024,
  mimeType: "application/pdf",
  createdAt: new Date("2026-11-09T12:00:00Z"),
  folderId,
  _count: { guias: 0, certidoes: 0 },
  ...extra,
});

const ctx = (role: AuthContext["role"], sectors: string[] = []): AuthContext => ({
  userId: "u",
  tenantId: "t",
  homeTenantId: "t",
  role,
  sectors,
  subscriptionReadOnly: false,
  canSelfRegularizeSubscription: false,
  activeSector: null,
});

beforeEach(() => {
  chamadas.length = 0;
  estado.pastas = [
    pasta("fiscal", null, { systemKey: "modelo:m-fiscal" }),
    pasta("2026", "fiscal"),
    pasta("dp", null, { sectorCode: "dp", systemKey: "modelo:m-dp" }),
    pasta("casa", null, { companyId: null }),
  ];
  estado.arquivos = [];
  estado.empresasDaPalavra = [];
  estado.empresas = [{ id: "emp", name: "Razão Social Ltda", displayName: "Apelido", cnpj: "12345678000190" }];
  estado.modelo = [];
  estado.moduloLigado = true;
});

describe("buscarEmTodasAsEmpresas", () => {
  it("toda consulta ao banco leva o tenantId", async () => {
    estado.empresasDaPalavra = [{ id: "emp" }];
    estado.arquivos = [arquivo("a", "2026")];
    await buscarEmTodasAsEmpresas(ctx("SECTOR_USER", ["fiscal"]), { palavras: ["contrato", "12.345.678/0001-90"], tipo: { vinculo: "guia" }, limite: 50 });
    expect(chamadas.map((c) => c.tabela).sort()).toEqual(["company", "company", "company", "driveFile", "driveFolder"]);
    for (const c of chamadas) expect(c.args.where?.tenantId).toBe("t");
  });

  it("devolve empresa, caminho e vínculo, e para no limite dizendo que há mais", async () => {
    estado.arquivos = [
      arquivo("guia-1", "2026", { _count: { guias: 1, certidoes: 0 } }),
      arquivo("manual", "casa"),
      arquivo("terceiro", "fiscal"),
    ];
    const r = await buscarEmTodasAsEmpresas(ctx("ADMIN"), { palavras: [], tipo: null, limite: 2 });
    expect(r.temMais).toBe(true);
    expect(r.itens).toEqual([
      expect.objectContaining({
        id: "guia-1",
        previa: true,
        empresa: { id: "emp", nome: "Apelido", cnpj: "12345678000190" },
        pastaId: "2026",
        pastaRotulo: "Fiscal › 2026",
        vinculo: "guia",
      }),
      expect.objectContaining({ id: "manual", empresa: null, pastaRotulo: "casa", vinculo: null }),
    ]);
    // Pede um a mais que o limite, para saber se há mais.
    expect(chamadas.find((c) => c.tabela === "driveFile")?.args).toMatchObject({ take: 3 });
  });

  it("descarta o arquivo de uma pasta que a árvore não conhecia", async () => {
    estado.arquivos = [arquivo("novo", "pasta-criada-agora"), arquivo("visto", "fiscal")];
    const r = await buscarEmTodasAsEmpresas(ctx("ADMIN"), { palavras: [], tipo: null, limite: 50 });
    expect(r.itens.map((a) => a.id)).toEqual(["visto"]);
  });

  it("tipo fora do alcance de quem pede: nem vai buscar arquivo", async () => {
    const r = await buscarEmTodasAsEmpresas(ctx("SECTOR_USER", ["fiscal"]), { palavras: [], tipo: { pasta: "modelo:m-dp" }, limite: 50 });
    expect(r).toEqual({ itens: [], temMais: false });
    expect(chamadas.some((c) => c.tabela === "driveFile")).toBe(false);
  });
});

describe("arquivosParaABuscaDoTopo", () => {
  it("só pelo nome do arquivo, abrindo na pasta dele", async () => {
    estado.arquivos = [arquivo("nota", "2026"), arquivo("manual", "casa")];
    const r = await arquivosParaABuscaDoTopo(ctx("ADMIN"), "nota fiscal");
    expect(chamadas.some((c) => c.tabela === "company" && c.args.where?.OR)).toBe(false);
    expect(r.itens).toEqual([
      { id: "nota", name: "nota.pdf", detalhe: "Apelido", href: "/arquivos/empresa/emp?pasta=2026" },
      { id: "manual", name: "manual.pdf", detalhe: "Pastas do escritório", href: "/arquivos/internas?pasta=casa" },
    ]);
  });

  it("com os Arquivos desligados, ou sem termo que valha, não consulta nada", async () => {
    estado.moduloLigado = false;
    expect(await arquivosParaABuscaDoTopo(ctx("ADMIN"), "nota")).toEqual({ itens: [], mais: false });
    estado.moduloLigado = true;
    expect(await arquivosParaABuscaDoTopo(ctx("ADMIN"), "a")).toEqual({ itens: [], mais: false });
    expect(chamadas).toEqual([]);
  });
});

describe("opcoesDoTipoDoEscritorio", () => {
  it("lê o modelo do escritório e esconde a pasta de outro setor", async () => {
    estado.modelo = [
      { id: "m-fiscal", name: "Fiscal", sectorCode: null },
      { id: "m-dp", name: "Departamento Pessoal", sectorCode: "dp" },
    ];
    const opcoes = await opcoesDoTipoDoEscritorio(ctx("SECTOR_USER", ["fiscal"]));
    expect(opcoes.map((o) => o.label)).toEqual(["Fiscal", "Enviados pelo cliente", "Guia emitida no Connect", "Certidão emitida no Connect"]);
    expect(chamadas[0].args.where).toEqual({ tenantId: "t" });
  });
});
