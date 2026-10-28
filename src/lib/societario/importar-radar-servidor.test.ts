import { beforeEach, describe, expect, it, vi } from "vitest";
import { chaveDoModelo } from "@/lib/drive/regras";

// A importação do Radar pelo servidor (28/10/2026), com um Radar simulado:
// nada vai à rede. O banco é o falso dos testes do Serpro.

const m = await vi.hoisted(async () => {
  const { tabela } = await import("@/lib/serpro/teste.fixture");
  const company = tabela();
  const license = tabela({ organId: null, expiresAt: null, notes: null });
  const processOrgan = tabela({ active: true });
  const driveFolder = tabela({ parentId: null, deletedAt: null, systemKey: null });
  const prisma = { company, license, processOrgan, driveFolder, $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma) };
  return {
    prisma,
    logAudit: vi.fn(),
    isModuleEnabled: vi.fn(async () => true),
    guardarArquivo: vi.fn(async (input: { folderId: string; arquivo: File }) => ({ ok: true as const, arquivoId: "arquivo-1", nome: input.arquivo.name })),
  };
});

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.prisma }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: m.isModuleEnabled }));
vi.mock("@/lib/drive/servidor", () => ({
  garantirPastasDaEmpresa: async () => [{ id: "m-societario", name: "Societário", active: true }],
  guardarArquivo: m.guardarArquivo,
}));

const { importarDoRadar, previaDoRadar, urlDoRadar } = await import("./importar-radar-servidor");

const TENANT = "tenant-1";

/** O Radar de mentira: duas páginas de empresas, licenças e um anexo. */
function radar(falhaNoAnexo = false) {
  const chamadas: string[] = [];
  const empresas = Array.from({ length: 101 }, (_, i) => ({ id: `r${i}`, razao_social: `EMPRESA ${i}`, cnpj: i === 0 ? "11444777000161" : `9999${String(i).padStart(8, "0")}91` }));
  const ler = async (caminho: string) => {
    chamadas.push(caminho);
    const pagina = /page=(\d+)/.exec(caminho);
    if (pagina) {
      const p = Number(pagina[1]);
      return Response.json({ data: empresas.slice((p - 1) * 100, p * 100), total: empresas.length });
    }
    if (caminho === "/companies/r0/licenses")
      return Response.json([
        { id: 10, license_type: "alvara_funcionamento", license_label: null, expiration_date: "2027-01-31", expiration_date_text: null, notes: null, applicable: 1 },
        { id: 11, license_type: "ibama", license_label: null, expiration_date: null, expiration_date_text: "Em andamento", notes: null, applicable: 1 },
      ]);
    if (caminho === "/companies/r0/attachments") return Response.json([{ id: 7, license_id: 10, original_name: "alvara.pdf", mime_type: "application/pdf" }]);
    if (caminho === "/attachments/7/download") return falhaNoAnexo ? new Response("sumiu", { status: 404 }) : new Response(new Uint8Array([37, 80, 68, 70]));
    if (caminho.endsWith("/licenses") || caminho.endsWith("/attachments")) return Response.json([]);
    return new Response("?", { status: 404 });
  };
  return { ler, chamadas };
}

beforeEach(() => {
  [m.prisma.company, m.prisma.license, m.prisma.processOrgan, m.prisma.driveFolder].forEach((t) => t.zerar());
  vi.clearAllMocks();
  m.prisma.company.linhas.push({ id: "c1", tenantId: TENANT, cnpj: "11444777000161" });
  m.prisma.driveFolder.linhas.push({ id: "pasta-societario", tenantId: TENANT, companyId: "c1", parentId: null, deletedAt: null, name: "Societário", systemKey: chaveDoModelo("m-societario") });
});

describe("a prévia", () => {
  it("lê todas as páginas e mostra o que entra e o que fica de fora", async () => {
    const { ler, chamadas } = radar();
    const r = await previaDoRadar(TENANT, "https://radar", { ler });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(chamadas.filter((c) => c.startsWith("/companies?"))).toHaveLength(2);
    expect(r.empresasNoRadar).toBe(101);
    expect(r.plano.licencas.map((l) => l.radarId)).toEqual([10, 11]);
    expect(m.prisma.license.linhas).toHaveLength(0);
  });

  it("Radar fora do ar: diz o que houve", async () => {
    const r = await previaDoRadar(TENANT, "https://radar", { ler: async () => new Response("erro", { status: 502 }) });
    expect(r).toEqual({ ok: false, erro: "Não consegui ler o Radar: O Radar respondeu 502 em /companies?status=active&limit=100&page=1." });
  });
});

describe("a importação", () => {
  it("grava as licenças, traz o anexo para o Societário e registra; rodar de novo não duplica", async () => {
    const { ler } = radar();
    expect(await importarDoRadar(TENANT, "kauan", "https://radar", { ler })).toEqual({ ok: true, licencas: 2, anexos: 1, anexosQueFalharam: 0, semPastaOuArquivos: 0 });
    expect(m.prisma.license.linhas.map((l) => l.kind)).toEqual(["Alvará de Funcionamento", "IBAMA"]);
    expect(m.prisma.license.linhas[1]).toMatchObject({ expiresAt: null, companyId: "c1" });
    expect(m.guardarArquivo.mock.calls[0][0]).toMatchObject({ folderId: "pasta-societario", uploadedByUserId: "kauan" });
    expect(m.guardarArquivo.mock.calls[0][0].arquivo.name).toBe("Licença - Alvará de Funcionamento - alvara.pdf");
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "license.import_radar", metadata: expect.objectContaining({ licencas: 2, anexos: 1 }) }));

    expect(await importarDoRadar(TENANT, "kauan", "https://radar", { ler })).toMatchObject({ ok: true, licencas: 0, anexos: 0 });
    expect(m.prisma.license.linhas).toHaveLength(2);
  });

  it("anexo que não vem não desfaz a licença", async () => {
    const { ler } = radar(true);
    expect(await importarDoRadar(TENANT, "kauan", "https://radar", { ler })).toMatchObject({ ok: true, licencas: 2, anexos: 0, anexosQueFalharam: 1 });
  });

  it("Arquivos desligados: as licenças entram, os anexos ficam contados", async () => {
    m.isModuleEnabled.mockResolvedValue(false);
    const { ler } = radar();
    expect(await importarDoRadar(TENANT, "kauan", "https://radar", { ler })).toMatchObject({ ok: true, licencas: 2, anexos: 0, semPastaOuArquivos: 1 });
    m.isModuleEnabled.mockResolvedValue(true);
  });
});

describe("o endereço do Radar", () => {
  it("http(s), sem a barra final", () => {
    expect(urlDoRadar(" https://radar.exemplo.com.br/ ")).toBe("https://radar.exemplo.com.br");
    expect(urlDoRadar("javascript:alert(1)")).toBeNull();
    expect(urlDoRadar(undefined)).toBeNull();
  });
});
