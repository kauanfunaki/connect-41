import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

// O que chega do robô da pasta de rede (21/10/2026): empresa do CNPJ e no
// piloto, pasta do modelo no primeiro nível, o mesmo arquivo uma vez só, e
// cada recusa no Ops Center.

const m = vi.hoisted(() => ({
  db: {
    company: { findFirst: vi.fn() },
    driveNetworkFile: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    driveFolder: { create: vi.fn() },
  },
  moduloLigado: true,
  pastas: [] as unknown[],
  guardarArquivo: vi.fn(),
  receberEvento: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: async () => m.moduloLigado }));
vi.mock("@/lib/ops/servidor", async () => {
  class ErroOps extends Error {
    constructor(message: string, public status = 400) {
      super(message);
    }
  }
  return { ErroOps, receberEvento: m.receberEvento };
});
vi.mock("./servidor", () => ({
  garantirPastasDaEmpresa: vi.fn(async () => []),
  pastasDoEscopo: async () => m.pastas.map((p) => ({ ...(p as object) })),
  guardarArquivo: m.guardarArquivo,
}));

const { receberDaPastaDeRede } = await import("./pastaDeRedeServidor");

const w = { tenantId: "t", slug: "pasta-de-rede", tokenHash: "h", compartilhado: true };
const conteudo = new TextEncoder().encode("%PDF-1.4 nota");
const hash = createHash("sha256").update(conteudo).digest("hex");
const envio = (extra: Partial<{ cnpj: string; caminho: string; sha256: string }> = {}) => ({
  cnpj: "12.345.678/0001-90",
  caminho: "Fiscal\\2026\\nota.pdf",
  sha256: hash,
  arquivo: new File([conteudo], "nota.pdf"),
  ...extra,
});
const pasta = (id: string, name: string, parentId: string | null, extra: Record<string, unknown> = {}) => ({
  id, name, parentId, companyId: "emp", sectorCode: null, systemKey: null, sharedWithPortal: false, deletedAt: null, ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  m.moduloLigado = true;
  m.pastas = [
    pasta("fiscal", "Fiscal", null, { systemKey: "modelo:1" }),
    pasta("dp", "Departamento Pessoal", null, { systemKey: "modelo:2", sectorCode: "dp" }),
    pasta("enviados", "Enviados pelo cliente", null, { systemKey: "enviados" }),
    pasta("solta", "Minha pasta", null),
  ];
  m.db.company.findFirst.mockResolvedValue({ id: "emp", name: "Padaria", displayName: null, pastaDeRedeNoDrive: true });
  m.db.driveNetworkFile.findUnique.mockResolvedValue(null);
  m.db.driveNetworkFile.create.mockResolvedValue({ id: "reserva" });
  m.db.driveNetworkFile.delete.mockResolvedValue({});
  m.db.driveFolder.create.mockImplementation(async ({ data }: { data: { name: string } }) => ({ id: `nova-${data.name}` }));
  m.guardarArquivo.mockResolvedValue({ ok: true, arquivoId: "arq-1", nome: "nota.pdf" });
  m.receberEvento.mockResolvedValue({ id: 1, duplicate: false });
});

describe("entrada", () => {
  it("guarda na pasta do modelo, criando as subpastas, e avisa o Ops Center", async () => {
    expect(await receberDaPastaDeRede(w, envio())).toEqual({ ok: true, arquivoId: "arq-1", duplicado: false });
    expect(m.db.company.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "t", cnpj: { in: ["12345678000190", "12.345.678/0001-90"] } } }));
    expect(m.db.driveFolder.create).toHaveBeenCalledWith({ data: { tenantId: "t", companyId: "emp", parentId: "fiscal", name: "2026" }, select: { id: true } });
    expect(m.guardarArquivo).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t", folderId: "nova-2026" }));
    expect(m.db.driveNetworkFile.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ relativePath: "Fiscal/2026/nota.pdf", sha256: hash, watcherSlug: "pasta-de-rede" }) }));
    expect(m.db.driveNetworkFile.update).toHaveBeenCalledWith({ where: { id: "reserva" }, data: { driveFileId: "arq-1" } });
    expect(m.receberEvento).toHaveBeenCalledWith(w, expect.objectContaining({ status: "SUCCESS", filename: "Fiscal/2026/nota.pdf", client: "Padaria" }));
  });

  it("acha a pasta do modelo e a subpasta sem acento nem caixa", async () => {
    m.pastas.push(pasta("p2026", "2026", "dp"));
    await receberDaPastaDeRede(w, envio({ caminho: "departamento pessoal/2026/nota.pdf" }));
    expect(m.db.driveFolder.create).not.toHaveBeenCalled();
    expect(m.guardarArquivo).toHaveBeenCalledWith(expect.objectContaining({ folderId: "p2026" }));
  });

  it("o mesmo arquivo de novo não cria outro", async () => {
    m.db.driveNetworkFile.findUnique.mockResolvedValue({ driveFileId: "arq-0" });
    expect(await receberDaPastaDeRede(w, envio())).toEqual({ ok: true, arquivoId: "arq-0", duplicado: true });
    expect(m.guardarArquivo).not.toHaveBeenCalled();
  });

  it("dois envios ao mesmo tempo: o segundo vê o primeiro pronto", async () => {
    m.db.driveNetworkFile.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    m.db.driveNetworkFile.findUnique.mockResolvedValueOnce(null).mockResolvedValue({ driveFileId: "arq-0", createdAt: new Date() });
    expect(await receberDaPastaDeRede(w, envio())).toEqual({ ok: true, arquivoId: "arq-0", duplicado: true });
    expect(m.guardarArquivo).not.toHaveBeenCalled();
  });

  it("envio em curso responde 409 para o robô tentar depois", async () => {
    m.db.driveNetworkFile.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    m.db.driveNetworkFile.findUnique.mockResolvedValueOnce(null).mockResolvedValue({ id: "r", driveFileId: null, createdAt: new Date() });
    await expect(receberDaPastaDeRede(w, envio())).rejects.toMatchObject({ status: 409 });
  });
});

describe("recusas", () => {
  it("empresa fora do piloto: 403 e aviso no Ops Center", async () => {
    m.db.company.findFirst.mockResolvedValue({ id: "emp", name: "Padaria", displayName: null, pastaDeRedeNoDrive: false });
    await expect(receberDaPastaDeRede(w, envio())).rejects.toMatchObject({ status: 403 });
    expect(m.receberEvento).toHaveBeenCalledWith(w, expect.objectContaining({ status: "WARNING", errorMessage: expect.stringContaining("piloto") }));
    expect(m.guardarArquivo).not.toHaveBeenCalled();
  });

  it("pasta fora do modelo (inclusive a de enviados e a criada à mão): 422 com as do modelo", async () => {
    for (const caminho of ["RH/nota.pdf", "Enviados pelo cliente/nota.pdf", "Minha pasta/nota.pdf"]) {
      await expect(receberDaPastaDeRede(w, envio({ caminho }))).rejects.toMatchObject({ status: 422, message: expect.stringContaining("Departamento Pessoal, Fiscal") });
    }
    expect(m.guardarArquivo).not.toHaveBeenCalled();
  });

  it("CNPJ de fora do escritório: 404", async () => {
    m.db.company.findFirst.mockResolvedValue(null);
    await expect(receberDaPastaDeRede(w, envio())).rejects.toMatchObject({ status: 404 });
    expect(m.receberEvento).not.toHaveBeenCalled();
  });

  it("conteúdo diferente do hash: 400, sem gravar", async () => {
    await expect(receberDaPastaDeRede(w, envio({ sha256: "0".repeat(64) }))).rejects.toMatchObject({ status: 400 });
    expect(m.db.driveNetworkFile.create).not.toHaveBeenCalled();
  });

  it("tipo recusado pelos Arquivos: solta a reserva e avisa", async () => {
    m.guardarArquivo.mockResolvedValue({ ok: false, erro: "nota.exe: tipo não aceito." });
    await expect(receberDaPastaDeRede(w, envio())).rejects.toMatchObject({ status: 422, message: "nota.exe: tipo não aceito." });
    expect(m.db.driveNetworkFile.delete).toHaveBeenCalledWith({ where: { id: "reserva" } });
    expect(m.receberEvento).toHaveBeenCalledWith(w, expect.objectContaining({ status: "WARNING" }));
  });

  it("Arquivos desligados no escritório: 403", async () => {
    m.moduloLigado = false;
    await expect(receberDaPastaDeRede(w, envio())).rejects.toMatchObject({ status: 403 });
    expect(m.db.company.findFirst).not.toHaveBeenCalled();
  });
});
