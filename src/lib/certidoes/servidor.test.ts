import { beforeEach, describe, expect, it, vi } from "vitest";
import { chaveDoModelo } from "@/lib/drive/regras";
import type { RespostaDaInfoSimples } from "./regras";

// As certidões pelo servidor (28/10/2026), com respostas simuladas da
// InfoSimples: nada vai à rede. O banco é o falso dos testes do Serpro.

const m = await vi.hoisted(async () => {
  const { tabela } = await import("@/lib/serpro/teste.fixture");
  // `createdAt` aqui vale para as linhas novas: o teto conta as do mês do relógio do teste.
  const padroesDaCertidao: Record<string, unknown> = { codigo: null, emitidaEm: null, validaAte: null, mensagem: null, trimestre: null, driveFileId: null, pedidaPorId: null, vistaEm: null, vistaPorId: null };
  return {
    padroesDaCertidao,
    company: tabela({ displayName: null, cnpj: null, stateCode: null, city: null, status: "ACTIVE" }),
    certidao: tabela(padroesDaCertidao),
    driveFolder: tabela({ parentId: null, deletedAt: null, systemKey: null }),
    conexao: null as { enabled: boolean; configEnc: string } | null,
    notifySector: vi.fn(),
    isModuleEnabled: vi.fn(async () => true),
    guardarArquivo: vi.fn(async (input: { folderId: string; arquivo: File }) => ({ ok: true as const, arquivoId: `arquivo-${input.folderId}`, nome: input.arquivo.name })),
  };
});

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({ company: m.company, certidao: m.certidao, driveFolder: m.driveFolder, tenantIntegration: { findUnique: async () => m.conexao } }),
}));
vi.mock("@/lib/integracoes/data", () => ({ lerConfig: (enc: string) => (enc ? JSON.parse(enc) : {}) }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: m.isModuleEnabled }));
vi.mock("@/lib/notifications", () => ({ notifySector: m.notifySector }));
vi.mock("@/lib/drive/servidor", () => ({
  garantirPastasDaEmpresa: async () => [
    { id: "m-certidoes", name: "Certidões", active: true },
    { id: "m-societario", name: "Societário", active: true },
  ],
  guardarArquivo: m.guardarArquivo,
}));

const { emitirAgora, emitirCertidao, marcarCertidaoComoVista, quadroDasCertidoes, rotinaDasCertidoes } = await import("./servidor");

const TENANT = "tenant-1";
const MATRIZ = { id: "matriz", tenantId: TENANT, name: "Empresa Fictícia Ltda", cnpj: "11444777000161", stateCode: "PR", city: "Curitiba", status: "ACTIVE", displayName: null };
const FILIAL = { id: "filial", tenantId: TENANT, name: "Empresa Fictícia Filial", cnpj: "11444777000242", stateCode: "PR", city: "Curitiba", status: "ACTIVE", displayName: null };
// Dezembro: o terceiro mês do trimestre, em que a carteira inteira já chegou.
const DEZEMBRO = () => new Date("2026-12-10T12:00:00-03:00");

type Chamada = { caminho: string; corpo: URLSearchParams };
function transporte(resposta: (caminho: string) => RespostaDaInfoSimples) {
  const chamadas: Chamada[] = [];
  return {
    chamadas,
    t: {
      consultar: async (caminho: string, corpo: URLSearchParams) => {
        chamadas.push({ caminho, corpo });
        return resposta(caminho);
      },
      baixar: async () => ({ ok: true as const, bytes: new Uint8Array([37, 80, 68, 70]), pdf: true }),
    },
  };
}
const negativa = (): RespostaDaInfoSimples => ({ code: 200, data: [{ conseguiu_emitir_certidao_negativa: true, situacao: "Regular", validade_data: "08/06/2027" }], site_receipts: ["https://recibo/1.pdf"] });
const positiva = (): RespostaDaInfoSimples => ({ code: 200, data: [{ conseguiu_emitir_certidao_negativa: false, situacao: "Irregular" }], site_receipts: ["https://recibo/2.pdf"] });

beforeEach(() => {
  [m.company, m.certidao, m.driveFolder].forEach((t) => t.zerar());
  delete m.padroesDaCertidao.createdAt;
  vi.clearAllMocks();
  m.conexao = { enabled: true, configEnc: JSON.stringify({ token: "token-de-teste", tetoMensal: "100" }) };
  m.company.linhas.push({ ...MATRIZ }, { ...FILIAL });
  for (const e of [MATRIZ, FILIAL]) {
    m.driveFolder.linhas.push(
      { id: `certidoes-${e.id}`, tenantId: TENANT, companyId: e.id, parentId: null, deletedAt: null, name: "Certidões", systemKey: chaveDoModelo("m-certidoes") },
      { id: `societario-${e.id}`, tenantId: TENANT, companyId: e.id, parentId: null, deletedAt: null, name: "Societário", systemKey: chaveDoModelo("m-societario") }
    );
  }
});

describe("uma certidão", () => {
  it("negativa: o pedido leva token, CNPJ e o 2via da federal; o comprovante vai para Certidões, sem aviso", async () => {
    const { t, chamadas } = transporte(negativa);
    const r = await emitirCertidao({ tenantId: TENANT, companyId: "matriz", tipo: "FEDERAL", token: "token-de-teste", userId: "kauan", trimestre: null, opcoes: { transporte: t, agora: DEZEMBRO } });

    expect(r).toEqual({ ok: true, situacao: "NEGATIVA", texto: "Certidão Federal: negativa. Está em Arquivos › Certidões." });
    expect(chamadas[0].caminho).toBe("receita-federal/pgfn");
    expect(Object.fromEntries(chamadas[0].corpo)).toEqual({ token: "token-de-teste", timeout: "120", cnpj: "11444777000161", preferencia_emissao: "2via" });
    expect(m.guardarArquivo.mock.calls[0][0].folderId).toBe("certidoes-matriz");
    expect(m.guardarArquivo.mock.calls[0][0].arquivo.name).toBe("CND Federal - Empresa Fictícia Ltda - 2026-12-10.pdf");
    expect(m.certidao.linhas[0]).toMatchObject({ situacao: "NEGATIVA", validaAte: "2027-06-08", driveFileId: "arquivo-certidoes-matriz", pedidaPorId: "kauan" });
    expect(m.notifySector).not.toHaveBeenCalled();
  });

  it("positiva do FGTS: o comprovante fica no Societário, e Societário e DP são avisados", async () => {
    const { t } = transporte(positiva);
    const r = await emitirCertidao({ tenantId: TENANT, companyId: "matriz", tipo: "FGTS", token: "x", userId: null, trimestre: "2026-T4", opcoes: { transporte: t, agora: DEZEMBRO } });

    expect(r).toMatchObject({ ok: true, situacao: "POSITIVA" });
    expect(m.guardarArquivo.mock.calls[0][0].folderId).toBe("societario-matriz");
    expect(m.notifySector.mock.calls.map(([s]) => s)).toEqual(["societario", "dp"]);
    expect(m.notifySector).toHaveBeenCalledWith("societario", expect.objectContaining({ type: "CERTIDAO_POSITIVA", message: "Certidão FGTS positiva: Empresa Fictícia Ltda", entityId: "matriz" }));
  });

  it("não saiu: fica registrado com o motivo, sem arquivo", async () => {
    const { t } = transporte(() => ({ code: 615, code_message: "Site da Caixa fora do ar" }));
    const r = await emitirCertidao({ tenantId: TENANT, companyId: "matriz", tipo: "FGTS", token: "x", userId: null, trimestre: "2026-T4", opcoes: { transporte: t, agora: DEZEMBRO } });
    expect(r).toEqual({ ok: false, erro: "A certidão FGTS não saiu: Site da Caixa fora do ar (código 615)", configuracao: false });
    expect(m.certidao.linhas[0]).toMatchObject({ situacao: "NAO_SAIU", mensagem: "Site da Caixa fora do ar (código 615)" });
    expect(m.guardarArquivo).not.toHaveBeenCalled();
  });
});

describe("a rotina do trimestre", () => {
  it("consulta o que falta da carteira, uma vez por trimestre", async () => {
    const { t, chamadas } = transporte(negativa);
    expect(await rotinaDasCertidoes(TENANT, { transporte: t, agora: DEZEMBRO })).toBe(6);
    // Raiz: federal, FGTS, trabalhista e estadual pela matriz; Curitiba, das duas.
    expect(chamadas.map((c) => c.caminho).sort()).toEqual(["caixa/regularidade", "pref/pr/curitiba/cnd", "pref/pr/curitiba/cnd", "receita-federal/pgfn", "sefaz/pr/certidao-debitos", "tribunal/tst/cndt"]);
    expect(m.certidao.linhas.every((c) => c.trimestre === "2026-T4" && c.pedidaPorId === null)).toBe(true);
    expect(await rotinaDasCertidoes(TENANT, { transporte: t, agora: DEZEMBRO })).toBe(0);
  });

  it("token recusado: para na primeira", async () => {
    const { t } = transporte(() => ({ code: 601, code_message: "Token inválido" }));
    expect(await rotinaDasCertidoes(TENANT, { transporte: t, agora: DEZEMBRO })).toBe(1);
  });

  it("a que não saiu tenta de novo no dia seguinte, até três vezes", async () => {
    const { t, chamadas } = transporte(() => ({ code: 615, code_message: "Fora do ar" }));
    m.company.zerar();
    m.company.linhas.push({ ...MATRIZ, stateCode: "SP", city: "São Paulo" });
    // O banco falso grava a hora do relógio de verdade: cada passada carimba as suas no relógio dela.
    const passada = async (iso: string) => {
      const antes = m.certidao.linhas.length;
      await rotinaDasCertidoes(TENANT, { transporte: t, agora: () => new Date(iso) });
      m.certidao.linhas.slice(antes).forEach((c) => (c.createdAt = new Date(iso)));
    };
    await passada("2026-12-10T12:00:00-03:00");
    expect(chamadas).toHaveLength(3);
    await passada("2026-12-10T18:00:00-03:00");
    expect(chamadas).toHaveLength(3);
    await passada("2026-12-11T12:00:00-03:00");
    expect(chamadas).toHaveLength(6);
    await passada("2026-12-12T12:00:00-03:00");
    await passada("2026-12-13T12:00:00-03:00");
    expect(chamadas).toHaveLength(9);
  });

  it("o teto: R$ 0,40 dá duas consultas no mês", async () => {
    m.conexao = { enabled: true, configEnc: JSON.stringify({ token: "x", tetoMensal: "0,40" }) };
    m.padroesDaCertidao.createdAt = DEZEMBRO();
    const { t } = transporte(negativa);
    expect(await rotinaDasCertidoes(TENANT, { transporte: t, agora: DEZEMBRO })).toBe(2);
    expect(await emitirAgora(TENANT, "kauan", "matriz", "FEDERAL", { transporte: t, agora: DEZEMBRO })).toMatchObject({ ok: false, erro: expect.stringContaining("teto mensal") });
  });

  it("sem módulo ou sem conexão, nada roda", async () => {
    const { t, chamadas } = transporte(negativa);
    m.isModuleEnabled.mockResolvedValueOnce(false);
    expect(await rotinaDasCertidoes(TENANT, { transporte: t, agora: DEZEMBRO })).toBe(0);
    m.conexao = { enabled: false, configEnc: "{}" };
    expect(await rotinaDasCertidoes(TENANT, { transporte: t, agora: DEZEMBRO })).toBe(0);
    expect(await emitirAgora(TENANT, "kauan", "matriz", "FEDERAL", { transporte: t })).toEqual({ ok: false, erro: "A integração da InfoSimples está desligada." });
    expect(chamadas).toHaveLength(0);
  });
});

describe("o quadro da tela", () => {
  it("a certidão que saiu vale mais que uma tentativa que falhou depois; a positiva vista sai do 'a ver'", async () => {
    m.certidao.linhas.push(
      { id: "c1", tenantId: TENANT, companyId: "matriz", tipo: "FEDERAL", situacao: "NEGATIVA", validaAte: "2027-06-08", createdAt: new Date("2026-10-01T12:00:00Z") },
      { id: "c2", tenantId: TENANT, companyId: "matriz", tipo: "FEDERAL", situacao: "NAO_SAIU", mensagem: "Fora do ar", createdAt: new Date("2026-11-01T12:00:00Z") },
      { id: "c3", tenantId: TENANT, companyId: "matriz", tipo: "FGTS", situacao: "POSITIVA", createdAt: new Date("2026-10-02T12:00:00Z") }
    );
    for (const l of m.certidao.linhas) Object.assign(l, { codigo: null, emitidaEm: null, driveFileId: null, vistaEm: null, ...l });

    const { linhas } = await quadroDasCertidoes(TENANT);
    const matriz = linhas.find((l) => l.companyId === "matriz")!;
    expect(Object.keys(matriz.certidoes).sort()).toEqual(["CURITIBA", "ESTADUAL_PR", "FEDERAL", "FGTS", "TRABALHISTA"]);
    expect(matriz.certidoes.FEDERAL).toMatchObject({ id: "c1", situacao: "NEGATIVA" });
    expect(matriz.certidoes.TRABALHISTA).toBeNull();
    expect(Object.keys(linhas.find((l) => l.companyId === "filial")!.certidoes)).toEqual(["CURITIBA"]);

    expect(await marcarCertidaoComoVista(TENANT, "kauan", "c1")).toBeNull();
    expect(await marcarCertidaoComoVista(TENANT, "kauan", "c3")).toEqual({ companyId: "matriz" });
    expect((await quadroDasCertidoes(TENANT)).linhas.find((l) => l.companyId === "matriz")!.certidoes.FGTS).toMatchObject({ vista: true });
  });
});

