import { beforeEach, describe, expect, it, vi } from "vitest";
import { chaveDoModelo } from "@/lib/drive/regras";
import { configDeProducao, TENANT, transportePorServico } from "./teste.fixture";
import { PDF_FICTICIO } from "./servicos.fixture";

// O certificado de MEI pela ficha (Societário, 28/10/2026): só para empresa
// MEI com CNPJ, sem Autorização de Acesso, e o PDF na pasta Societário. O
// transporte é falso: nada vai ao Serpro.

const m = await vi.hoisted(async () => {
  const { bancoFalso } = await import("./teste.fixture");
  return {
    banco: bancoFalso(),
    logAudit: vi.fn(),
    isModuleEnabled: vi.fn(async () => true),
    guardarArquivo: vi.fn(async (input: { folderId: string; arquivo: File }) => ({ ok: true as const, arquivoId: "arquivo-1", nome: input.arquivo.name })),
  };
});

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.banco.prisma }));
vi.mock("@/lib/integracoes/data", () => ({
  lerConfig: (enc: string) => (enc ? JSON.parse(enc) : {}),
  executar: async (_p: unknown, corpo: () => Promise<{ resultado: unknown }>) => (await corpo()).resultado,
}));
vi.mock("@/lib/notifications", () => ({ notifyUser: vi.fn(), notifySector: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: m.isModuleEnabled }));
vi.mock("@/lib/drive/servidor", () => ({
  garantirPastasDaEmpresa: async () => [{ id: "m-societario", name: "Societário", active: true }],
  guardarArquivo: m.guardarArquivo,
}));

const { esquecerTokens } = await import("./cliente");
const { emitirCertificadoDoMei } = await import("./certificadoDoMei");

const HOJE = "2026-10-28";
const CNPJ = "11444777000161";
const EMPRESA = { id: "empresa-1", tenantId: TENANT, name: "Empresa Fictícia MEI", displayName: null, kind: "PESSOA_JURIDICA", cnpj: CNPJ, cpf: null, taxRegimeKind: "MEI" };
const CCMEI = () => ({ status: 200, corpo: JSON.stringify({ status: 200, dados: JSON.stringify({ cnpj: CNPJ, pdf: PDF_FICTICIO }), mensagens: [{ codigo: "Sucesso-CCMEI", texto: "Requisição efetuada com sucesso." }] }) });

beforeEach(() => {
  m.banco.zerar();
  esquecerTokens();
  vi.clearAllMocks();
  m.banco.conectar(configDeProducao());
  m.banco.tabelas.company.linhas.push({ ...EMPRESA });
  m.banco.tabelas.driveFolder.linhas.push({ id: "pasta-societario", tenantId: TENANT, companyId: EMPRESA.id, parentId: null, deletedAt: null, name: "Societário", systemKey: chaveDoModelo("m-societario") });
});

describe("o certificado de MEI pela ficha", () => {
  it("emite sem autorização de acesso e guarda o PDF na pasta Societário", async () => {
    const t = transportePorServico({ EMITIRCCMEI121: CCMEI });
    const r = await emitirCertificadoDoMei(TENANT, "kauan", EMPRESA.id, { transporte: t.transporte, hoje: HOJE });

    expect(r).toEqual({ ok: true, texto: "Certificado de MEI emitido. Está em Arquivos › Societário.", arquivoId: "arquivo-1" });
    expect(JSON.parse(t.doServico("EMITIRCCMEI121")[0].corpo).pedidoDados.dados).toBe("");
    const [guardado] = m.guardarArquivo.mock.calls[0];
    expect(guardado.folderId).toBe("pasta-societario");
    expect(guardado.arquivo.name).toBe("Certificado MEI - Empresa Fictícia MEI - 2026-10-28.pdf");
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "autorizacoes.serpro_ccmei", entityId: EMPRESA.id }));
    expect(m.banco.estado.chamadas).toEqual([expect.objectContaining({ idServico: "EMITIRCCMEI121", cobrada: true, origem: "ccmei" })]);
  });

  it("empresa que não é MEI, ou sem a pasta Societário: recusa sem chamar", async () => {
    const t = transportePorServico({});
    m.banco.tabelas.company.zerar();
    m.banco.tabelas.company.linhas.push({ ...EMPRESA, taxRegimeKind: "SIMPLES_NACIONAL" });
    expect(await emitirCertificadoDoMei(TENANT, "kauan", EMPRESA.id, { transporte: t.transporte, hoje: HOJE })).toMatchObject({ ok: false, erro: expect.stringContaining("regime MEI") });

    m.banco.tabelas.company.zerar();
    m.banco.tabelas.company.linhas.push({ ...EMPRESA });
    m.banco.tabelas.driveFolder.zerar();
    expect(await emitirCertificadoDoMei(TENANT, "kauan", EMPRESA.id, { transporte: t.transporte, hoje: HOJE })).toMatchObject({ ok: false, erro: expect.stringContaining("pasta Societário") });
    expect(t.chamadas()).toHaveLength(0);
  });
});
