import { beforeEach, describe, expect, it, vi } from "vitest";
import { unzipSync } from "fflate";
import type { AuthContext } from "@/lib/auth/context";
import type { PastaDoDrive } from "./regras";
import type { ArquivoParaOZip } from "./zip";
import type { ZipDaPasta } from "./baixarPasta";

// Quem baixa o quê no zip da pasta. O banco é simulado (com os filtros de
// escritório, empresa e lixeira que as consultas reais pedem); a régua é a de
// verdade. O teste que mais importa compara, arquivo por arquivo, o zip com o
// download avulso (`arquivoParaAEquipe` / `arquivoParaOCliente`): o que um não
// entrega, o outro também não.

type PastaNoBanco = PastaDoDrive & { tenantId: string };
type ArquivoNoBanco = ArquivoParaOZip & { tenantId: string };
const banco = { pastas: [] as PastaNoBanco[], arquivos: [] as ArquivoNoBanco[] };

type Onde = Record<string, unknown> & {
  id?: string;
  tenantId?: string;
  companyId?: string | null | { in: string[] };
  folderId?: { in: string[] };
  folder?: { companyId?: { in: string[] } };
};

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    driveFolder: {
      findMany: async ({ where }: { where: Onde }) =>
        banco.pastas.filter((p) => p.tenantId === where.tenantId && p.companyId === where.companyId),
      findFirst: async ({ where }: { where: Onde }) => {
        const filtro = where.companyId as { in: string[] } | undefined;
        return (
          banco.pastas.find(
            (p) => p.id === where.id && p.tenantId === where.tenantId && (!filtro || (p.companyId !== null && filtro.in.includes(p.companyId)))
          ) ?? null
        );
      },
    },
    driveFile: {
      findMany: async ({ where }: { where: Onde }) =>
        banco.arquivos.filter((a) => a.tenantId === where.tenantId && a.deletedAt === null && where.folderId!.in.includes(a.folderId)),
      findFirst: async ({ where }: { where: Onde }) => {
        const a = banco.arquivos.find((x) => x.id === where.id && x.tenantId === where.tenantId && x.deletedAt === null);
        if (!a) return null;
        const companyId = banco.pastas.find((p) => p.id === a.folderId)?.companyId ?? null;
        const filtro = where.folder?.companyId;
        if (filtro && (companyId === null || !filtro.in.includes(companyId))) return null;
        return { ...a, folder: { companyId } };
      },
    },
    company: {
      findFirst: async ({ where }: { where: Onde }) =>
        where.tenantId === "t" ? { id: where.id, name: where.id === "emp" ? "Padaria Pão Quente" : "Outra Ltda", displayName: null } : null,
    },
  }),
}));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: async () => true, setorDoModulo: async () => null }));
vi.mock("./servidor", async (original) => ({
  ...(await original<typeof import("./servidor")>()),
  armazenamentoDoDrive: { lerAnexo: async (chave: string) => Buffer.from(`conteúdo de ${chave}`) },
}));

const { arquivoParaAEquipe, arquivoParaOCliente } = await import("./servidor");
const { respostaDoZip, zipDaPastaParaAEquipe, zipDaPastaParaOCliente } = await import("./baixarPasta");

const pasta = (id: string, parentId: string | null, extra: Partial<PastaNoBanco> = {}): PastaNoBanco => ({
  id,
  name: id,
  parentId,
  companyId: "emp",
  sectorCode: null,
  systemKey: null,
  sharedWithPortal: false,
  deletedAt: null,
  tenantId: "t",
  ...extra,
});

const arquivo = (id: string, folderId: string, extra: Partial<ArquivoNoBanco> = {}): ArquivoNoBanco => ({
  id,
  name: `${id}.pdf`,
  sizeBytes: 100,
  mimeType: "application/pdf",
  storageKey: `t/${id}.pdf`,
  folderId,
  createdAt: new Date("2026-10-01T12:00:00Z"),
  deletedAt: null,
  tenantId: "t",
  ...extra,
});

const ctx = (role: AuthContext["role"], sectors: string[] = [], tenantId = "t"): AuthContext => ({
  userId: "u",
  tenantId,
  homeTenantId: tenantId,
  role,
  sectors,
  subscriptionReadOnly: false,
  canSelfRegularizeSubscription: false,
  activeSector: null,
});

const PERFIS: [string, AuthContext][] = [
  ["admin", ctx("ADMIN")],
  ["só leitura", ctx("READONLY")],
  ["setor fiscal", ctx("SECTOR_USER", ["fiscal"])],
  ["setor DP", ctx("SECTOR_USER", ["dp"])],
  ["coordenador do DP", ctx("SECTOR_ADMIN", ["dp"])],
];

beforeEach(() => {
  banco.pastas = [
    // Empresa do cliente
    pasta("fiscal", null, { name: "Fiscal" }),
    pasta("fiscal-2026", "fiscal", { name: "2026" }),
    pasta("dp", null, { name: "Departamento Pessoal", sectorCode: "dp" }),
    pasta("holerites", "dp", { name: "Holerites" }),
    pasta("guias", null, { name: "Guias", sharedWithPortal: true }),
    pasta("guias-2026", "guias", { name: "2026" }),
    pasta("folha", "guias", { name: "Folha", sectorCode: "dp" }),
    pasta("velha", "guias", { name: "Velha", deletedAt: new Date() }),
    pasta("dentro-da-velha", "velha", { name: "Dentro" }),
    pasta("contabil", null, { name: "Contábil" }),
    pasta("balancos", "contabil", { name: "Balanços", sharedWithPortal: true }),
    // Pasta interna do escritório, sem empresa
    pasta("modelos", null, { name: "Modelos", companyId: null }),
    // Empresa de outro cliente, no mesmo escritório
    pasta("guias-outra", null, { name: "Guias", companyId: "outra", sharedWithPortal: true }),
    // Outro escritório
    pasta("guias-t2", null, { name: "Guias", tenantId: "t2", sharedWithPortal: true }),
  ];
  banco.arquivos = [
    arquivo("nota-fiscal", "fiscal"),
    arquivo("nota-2026", "fiscal-2026"),
    arquivo("holerite", "holerites"),
    arquivo("contrato-dp", "dp"),
    arquivo("das", "guias"),
    arquivo("das-apagado", "guias", { deletedAt: new Date() }),
    arquivo("darf", "guias-2026"),
    arquivo("fgts", "folha"),
    arquivo("na-velha", "dentro-da-velha"),
    arquivo("balanco", "balancos"),
    arquivo("rascunho", "contabil"),
    arquivo("modelo", "modelos"),
    arquivo("das-outra", "guias-outra"),
    arquivo("das-t2", "guias-t2", { tenantId: "t2" }),
  ];
});

const idsNoZip = (zip: ZipDaPasta | null) =>
  (zip?.conteudo.entradas ?? []).flatMap((e) => (e.tipo === "arquivo" ? [e.arquivo.id] : [])).sort();
const nomesNoZip = (zip: ZipDaPasta | null) => (zip?.conteudo.entradas ?? []).map((e) => e.caminho);

/** O arquivo está na pasta ou em alguma subpasta dela (pelo banco, sem régua). */
function dentroDe(folderId: string, raizId: string): boolean {
  for (let id: string | null = folderId, n = 0; id && n < 30; n++) {
    if (id === raizId) return true;
    id = banco.pastas.find((p) => p.id === id)?.parentId ?? null;
  }
  return false;
}

describe("zip da equipe", () => {
  it("quem vê tudo leva a pasta inteira, com as subpastas, menos o que está na lixeira", async () => {
    const zip = await zipDaPastaParaAEquipe(ctx("ADMIN"), "guias");
    expect(idsNoZip(zip)).toEqual(["darf", "das", "fgts"]);
    expect(nomesNoZip(zip)).toEqual(["das.pdf", "2026/", "2026/darf.pdf", "Folha/", "Folha/fgts.pdf"]);
    expect(zip?.nome).toBe("Padaria Pão Quente - Guias.zip");
  });

  it("subpasta de setor sem acesso fica de fora, e o nome dela não aparece", async () => {
    const zip = await zipDaPastaParaAEquipe(ctx("SECTOR_USER", ["fiscal"]), "guias");
    expect(idsNoZip(zip)).toEqual(["darf", "das"]);
    expect(nomesNoZip(zip).join()).not.toContain("Folha");
  });

  it("pasta de setor: sem acesso não há zip; com acesso, sim", async () => {
    expect(await zipDaPastaParaAEquipe(ctx("SECTOR_USER", ["fiscal"]), "dp")).toBeNull();
    expect(idsNoZip(await zipDaPastaParaAEquipe(ctx("SECTOR_USER", ["dp"]), "dp"))).toEqual(["contrato-dp", "holerite"]);
    expect(idsNoZip(await zipDaPastaParaAEquipe(ctx("READONLY"), "dp"))).toEqual(["contrato-dp", "holerite"]);
  });

  it("pasta na lixeira não dá zip", async () => {
    expect(await zipDaPastaParaAEquipe(ctx("ADMIN"), "velha")).toBeNull();
    expect(await zipDaPastaParaAEquipe(ctx("ADMIN"), "dentro-da-velha")).toBeNull();
  });

  it("pasta de outro escritório não existe para quem pede", async () => {
    expect(await zipDaPastaParaAEquipe(ctx("ADMIN"), "guias-t2")).toBeNull();
    expect(await zipDaPastaParaAEquipe(ctx("ADMIN", [], "t2"), "guias")).toBeNull();
  });

  it("pasta interna leva o nome dela, sem empresa", async () => {
    const zip = await zipDaPastaParaAEquipe(ctx("ADMIN"), "modelos");
    expect(idsNoZip(zip)).toEqual(["modelo"]);
    expect(zip?.nome).toBe("Modelos.zip");
  });

  it("subpasta: o nome do zip traz o caminho", async () => {
    expect((await zipDaPastaParaAEquipe(ctx("ADMIN"), "fiscal-2026"))?.nome).toBe("Padaria Pão Quente - Fiscal - 2026.zip");
  });

  it.each(PERFIS)("%s: entra no zip exatamente o que baixaria um a um", async (_nome, quem) => {
    for (const raiz of banco.pastas.filter((p) => p.tenantId === "t")) {
      const zip = await zipDaPastaParaAEquipe(quem, raiz.id);
      const noZip = new Set(idsNoZip(zip));
      for (const a of banco.arquivos.filter((x) => dentroDe(x.folderId, raiz.id))) {
        const avulso = (await arquivoParaAEquipe(quem, a.id)) !== null;
        expect({ pasta: raiz.id, arquivo: a.id, noZip: noZip.has(a.id) }).toEqual({ pasta: raiz.id, arquivo: a.id, noZip: avulso });
      }
    }
  });
});

describe("zip do cliente (portal)", () => {
  const DO_CLIENTE = ["emp"];

  it("pasta compartilhada: leva tudo dentro dela, menos a lixeira", async () => {
    const zip = await zipDaPastaParaOCliente("t", DO_CLIENTE, "guias");
    expect(idsNoZip(zip)).toEqual(["darf", "das", "fgts"]);
  });

  it("subpasta compartilhada dentro de pasta fechada: o nome da pasta de cima não vaza", async () => {
    const zip = await zipDaPastaParaOCliente("t", DO_CLIENTE, "balancos");
    expect(idsNoZip(zip)).toEqual(["balanco"]);
    expect(zip?.nome).toBe("Padaria Pão Quente - Balanços.zip");
  });

  it("pasta que não foi compartilhada não dá zip — nem a de cima de uma compartilhada", async () => {
    expect(await zipDaPastaParaOCliente("t", DO_CLIENTE, "fiscal")).toBeNull();
    expect(await zipDaPastaParaOCliente("t", DO_CLIENTE, "contabil")).toBeNull();
    expect(await zipDaPastaParaOCliente("t", DO_CLIENTE, "dp")).toBeNull();
  });

  it("pasta na lixeira não dá zip", async () => {
    expect(await zipDaPastaParaOCliente("t", DO_CLIENTE, "velha")).toBeNull();
  });

  it("empresa de outro cliente, pasta interna e outro escritório: nada", async () => {
    expect(await zipDaPastaParaOCliente("t", DO_CLIENTE, "guias-outra")).toBeNull();
    expect(await zipDaPastaParaOCliente("t", DO_CLIENTE, "modelos")).toBeNull();
    expect(await zipDaPastaParaOCliente("t", DO_CLIENTE, "guias-t2")).toBeNull();
    expect(await zipDaPastaParaOCliente("t2", DO_CLIENTE, "guias")).toBeNull();
    expect(await zipDaPastaParaOCliente("t", [], "guias")).toBeNull();
  });

  it("entra no zip exatamente o que o cliente baixaria um a um", async () => {
    for (const raiz of banco.pastas) {
      const zip = await zipDaPastaParaOCliente("t", DO_CLIENTE, raiz.id);
      const noZip = new Set(idsNoZip(zip));
      for (const a of banco.arquivos.filter((x) => dentroDe(x.folderId, raiz.id))) {
        const avulso = (await arquivoParaOCliente("t", DO_CLIENTE, a.id)) !== null;
        // Sem zip (pasta que o cliente não vê), nada sai — mesmo que uma
        // subpasta dela esteja compartilhada e o arquivo de lá saia avulso.
        expect({ pasta: raiz.id, arquivo: a.id, noZip: noZip.has(a.id) }).toEqual({ pasta: raiz.id, arquivo: a.id, noZip: zip ? avulso : false });
      }
    }
  });
});

describe("resposta da rota", () => {
  it("acima do teto: 413 com a mensagem, sem zip", async () => {
    for (let i = 0; i < 1001; i++) banco.arquivos.push(arquivo(`n${i}`, "fiscal-2026"));
    const zip = (await zipDaPastaParaAEquipe(ctx("ADMIN"), "fiscal"))!;
    expect(zip.problema?.status).toBe(413);
    const resposta = respostaDoZip(zip, { conferir: false });
    expect(resposta.status).toBe(413);
    expect((await resposta.json()).error).toContain("o zip leva até 1.000");
  });

  it("pasta só com subpastas vazias: 422, nada para baixar", async () => {
    banco.pastas.push(pasta("oca", null, { name: "Oca" }), pasta("oca-dentro", "oca"));
    const resposta = respostaDoZip((await zipDaPastaParaAEquipe(ctx("ADMIN"), "oca"))!, { conferir: true });
    expect(resposta.status).toBe(422);
  });

  it("?conferir=1 diz o nome, quantos arquivos e o tamanho", async () => {
    const resposta = respostaDoZip((await zipDaPastaParaAEquipe(ctx("ADMIN"), "guias"))!, { conferir: true });
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ nome: "Padaria Pão Quente - Guias.zip", arquivos: 3, bytes: 300 });
  });

  it("o zip sai como anexo, com o nome acentuado no cabeçalho, e avisa o que entrou", async () => {
    const aoTerminar = vi.fn();
    const resposta = respostaDoZip((await zipDaPastaParaAEquipe(ctx("ADMIN"), "guias"))!, { conferir: false, aoTerminar });
    expect(resposta.headers.get("Content-Type")).toBe("application/zip");
    expect(resposta.headers.get("Content-Disposition")).toContain("filename*=UTF-8''Padaria%20P%C3%A3o%20Quente%20-%20Guias.zip");
    const aberto = unzipSync(new Uint8Array(await resposta.arrayBuffer()));
    expect(Object.keys(aberto).sort()).toEqual(["2026/", "2026/darf.pdf", "Folha/", "Folha/fgts.pdf", "das.pdf"]);
    await vi.waitFor(() => expect(aoTerminar).toHaveBeenCalled());
    expect(aoTerminar.mock.calls[0][0].map((a: ArquivoParaOZip) => a.id).sort()).toEqual(["darf", "das", "fgts"]);
  });
});
