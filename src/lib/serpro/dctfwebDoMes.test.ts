import { beforeEach, describe, expect, it, vi } from "vitest";
import { chaveDoModelo } from "@/lib/drive/regras";
import { configDeProducao, corpoDoSerpro, TENANT, transportePorServico, type RespostaRoteirizada } from "./teste.fixture";
import { GUIA_DA_DCTFWEB, PDF_FICTICIO } from "./servicos.fixture";

// A rotina da DCTFWeb do mês (17/11/2026): recibo e DARF de cada empresa
// marcada, nos Arquivos, sem repetir chamada cobrada, com o teto e sem que o
// erro de uma pare as outras. O transporte é falso: nada vai à Receita.

const m = await vi.hoisted(async () => {
  const { bancoFalso } = await import("./teste.fixture");
  let n = 0;
  return {
    banco: bancoFalso(),
    logAudit: vi.fn(),
    registrarGuia: vi.fn(async () => "guia-1"),
    guardarArquivo: vi.fn(async (input: { folderId: string; arquivo: File }) => ({ ok: true as const, arquivoId: `arquivo-${++n}`, nome: input.arquivo.name })),
  };
});

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.banco.prisma }));
vi.mock("@/lib/integracoes/data", () => ({
  lerConfig: (enc: string) => (enc ? JSON.parse(enc) : {}),
  executar: async (_p: unknown, corpo: () => Promise<{ resultado: unknown }>) => (await corpo()).resultado,
}));
vi.mock("@/lib/notifications", () => ({ notifyUser: vi.fn(), notifySector: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: async () => true }));
vi.mock("@/lib/guias/servidor", () => ({ registrarGuiaEmitida: m.registrarGuia }));
vi.mock("@/lib/drive/servidor", () => ({
  garantirPastasDaEmpresa: async () => [{ id: "m-guias", name: "Guias", active: true }],
  guardarArquivo: m.guardarArquivo,
}));

const { esquecerTokens } = await import("./cliente");
const { rotinaDaDctfweb, rodarAgora, marcarEmpresas, dctfwebDoMes, salvarAjusteDaRotina } = await import("./dctfwebDoMes");

// 17/11/2026, 10h em São Paulo: depois do dia sem evento (16) e da hora da rotina.
const AGORA = new Date("2026-11-17T13:00:00Z");
const agora = () => AGORA;

const empresa = (id: string, cnpj: string, nome: string) => ({ id, tenantId: TENANT, name: nome, displayName: null, kind: "PESSOA_JURIDICA", cnpj, cpf: null });
const A = empresa("emp-a", "11444777000161", "Alfa Ltda");
const B = empresa("emp-b", "11222333000181", "Beta Ltda");
const C = empresa("emp-c", "45997418000153", "Gama Ltda");
const ativa = { status: "ACTIVE", requestedAt: null, receivedAt: null, validatedAt: null, expiresAt: new Date("2030-12-31T12:00:00Z"), allServices: true, services: null };

const RECIBO_OK: RespostaRoteirizada = { status: 200, corpo: corpoDoSerpro({ PDFByteArrayBase64: PDF_FICTICIO }, [{ codigo: "Aviso-DCTFWEB-MG11", texto: "Relatório de Recibo de Declaração executado com sucesso." }]) };
const SEM_DECLARACAO: RespostaRoteirizada = {
  status: 404,
  corpo: JSON.stringify({ status: 404, dados: "", mensagens: [{ codigo: "[Erro-DCTFWEB-MG08]", texto: "Não foi encontrada Declaração com os dados informados." }] }),
};
const SEM_DEBITO: RespostaRoteirizada = {
  status: 400,
  corpo: JSON.stringify({ status: 400, dados: "", mensagens: [{ codigo: "[Erro-DCTFWEB-GUIA03]", texto: "Não há débitos com saldo a pagar para emissão da guia de pagamento." }] }),
};
const contribuinte = (corpo: unknown) => (corpo as { contribuinte?: { numero: string } }).contribuinte?.numero;
const doPedido = (r: { corpo: string }) => JSON.parse(r.corpo) as { contribuinte: { numero: string }; pedidoDados: { idServico: string } };

async function marcar(...empresas: { id: string; cnpj: string }[]) {
  for (const e of empresas) {
    m.banco.tabelas.company.linhas.push({ ...e });
    m.banco.tabelas.driveFolder.linhas.push({ id: `guias-${e.id}`, tenantId: TENANT, companyId: e.id, parentId: null, deletedAt: null, name: "Guias", systemKey: chaveDoModelo("m-guias") });
    m.banco.estado.autorizacoes.set(e.cnpj.slice(0, 8), ativa);
  }
  await marcarEmpresas(TENANT, empresas.map((e) => e.id), true);
}

const linhaDe = (companyId: string) => m.banco.tabelas.serproDctfweb.linhas.find((l) => l.companyId === companyId);

beforeEach(async () => {
  m.banco.zerar();
  esquecerTokens();
  vi.clearAllMocks();
  m.banco.conectar(configDeProducao());
  await salvarAjusteDaRotina(TENANT, { ligada: true, diaSemEvento: 16, tetoCentavos: null });
});

describe("a rotina do agendador", () => {
  it("baixa o recibo e o DARF, guarda na pasta Guias e registra o DARF nas Guias do mês", async () => {
    await marcar(A);
    const t = transportePorServico({ CONSRECIBO32: () => RECIBO_OK, GERARGUIA31: () => GUIA_DA_DCTFWEB });

    expect(await rotinaDaDctfweb(TENANT, { transporte: t.transporte, agora })).toBe(1);

    expect(JSON.parse(JSON.parse(t.doServico("CONSRECIBO32")[0].corpo).pedidoDados.dados)).toEqual({
      categoria: "GERAL_MENSAL",
      anoPA: "2026",
      mesPA: "10",
    });
    expect(JSON.parse(JSON.parse(t.doServico("GERARGUIA31")[0].corpo).pedidoDados.dados)).toEqual({ categoria: "GERAL_MENSAL", anoPA: "2026", mesPA: "10" });
    const nomes = m.guardarArquivo.mock.calls.map(([i]) => i.arquivo.name);
    expect(nomes).toEqual(["Recibo DCTFWeb - Alfa Ltda - 10-2026.pdf", "DCTFWeb - Alfa Ltda - 10-2026.pdf"]);
    expect(m.guardarArquivo.mock.calls.every(([i]) => i.folderId === "guias-emp-a")).toBe(true);
    expect(m.registrarGuia).toHaveBeenCalledWith(expect.objectContaining({ companyId: "emp-a", userId: null, registro: expect.objectContaining({ tipo: "DCTFWEB", competencia: "2026-10" }) }));
    expect(linhaDe("emp-a")).toMatchObject({ situacao: "BAIXADO", reciboArquivoId: expect.stringMatching(/^arquivo-/), darfArquivoId: expect.stringMatching(/^arquivo-/), consultasCobradas: 1, emissoesCobradas: 1 });
    expect(m.banco.estado.chamadas.map((c) => [c.idServico, c.origem, c.cobrada])).toEqual([
      ["CONSRECIBO32", "dctfweb", true],
      ["GERARGUIA31", "dctfweb", true],
    ]);

    // O ciclo seguinte não chama de novo: cada chamada é cobrada.
    expect(await rotinaDaDctfweb(TENANT, { transporte: t.transporte, agora })).toBe(0);
    expect(t.chamadas()).toHaveLength(2);
  });

  it("sem declaração: o DARF nem é pedido, e a rotina não volta no mesmo dia", async () => {
    await marcar(A);
    const t = transportePorServico({ CONSRECIBO32: () => SEM_DECLARACAO });
    await rotinaDaDctfweb(TENANT, { transporte: t.transporte, agora });
    expect(linhaDe("emp-a")).toMatchObject({ situacao: "SEM_DECLARACAO", consultasCobradas: 0, reciboArquivoId: null });
    expect(t.doServico("CONSRECIBO32")).toHaveLength(1);
    await rotinaDaDctfweb(TENANT, { transporte: t.transporte, agora: () => new Date(AGORA.getTime() + 3 * 3600_000) });
    expect(t.chamadas()).toHaveLength(1);
  });

  it("recibo baixado e sem débito: não pede o recibo de novo e não volta mais", async () => {
    await marcar(A);
    const t = transportePorServico({ CONSRECIBO32: () => RECIBO_OK, GERARGUIA31: () => SEM_DEBITO });
    await rotinaDaDctfweb(TENANT, { transporte: t.transporte, agora });
    expect(linhaDe("emp-a")).toMatchObject({ situacao: "SEM_DEBITO", reciboArquivoId: expect.stringMatching(/^arquivo-/), darfArquivoId: null });
    await rotinaDaDctfweb(TENANT, { transporte: t.transporte, agora: () => new Date(AGORA.getTime() + 48 * 3600_000) });
    expect(t.chamadas()).toHaveLength(2);
  });

  it("sem procuração: nenhuma chamada (o 403 seria cobrado), e as outras seguem", async () => {
    await marcar(A, B);
    m.banco.estado.autorizacoes.delete("11444777");
    const t = transportePorServico({ CONSRECIBO32: () => RECIBO_OK, GERARGUIA31: () => GUIA_DA_DCTFWEB });
    await rotinaDaDctfweb(TENANT, { transporte: t.transporte, agora });
    expect(linhaDe("emp-a")).toMatchObject({ situacao: "SEM_PROCURACAO" });
    expect(linhaDe("emp-b")).toMatchObject({ situacao: "BAIXADO" });
    expect(t.chamadas().map((c) => doPedido(c).contribuinte.numero)).toEqual([B.cnpj, B.cnpj]);
  });

  it("o erro de uma empresa não para as outras", async () => {
    await marcar(A, B, C);
    const t = transportePorServico({
      CONSRECIBO32: (_n, corpo) => (contribuinte(corpo) === B.cnpj ? { status: 500, corpo: JSON.stringify({ status: 500, dados: "", mensagens: [] }) } : RECIBO_OK),
      GERARGUIA31: () => GUIA_DA_DCTFWEB,
    });
    m.guardarArquivo.mockImplementationOnce(async () => {
      throw new Error("disco cheio");
    });
    expect(await rotinaDaDctfweb(TENANT, { transporte: t.transporte, agora })).toBe(3);
    // O recibo foi cobrado antes de o disco falhar: o custo fica na linha.
    expect(linhaDe("emp-a")).toMatchObject({ situacao: "ERRO", tentativas: 1, consultasCobradas: 1 });
    expect(linhaDe("emp-b")).toMatchObject({ situacao: "ERRO", erro: expect.stringContaining("fora do ar") });
    expect(linhaDe("emp-c")).toMatchObject({ situacao: "BAIXADO" });
  });

  it("o teto da rotina para o lote antes da chamada", async () => {
    await salvarAjusteDaRotina(TENANT, { ligada: true, diaSemEvento: 16, tetoCentavos: 60 });
    await marcar(A, B);
    const t = transportePorServico({ CONSRECIBO32: () => RECIBO_OK, GERARGUIA31: () => GUIA_DA_DCTFWEB });
    await rotinaDaDctfweb(TENANT, { transporte: t.transporte, agora });
    // R$ 0,24 + R$ 0,32 = R$ 0,56 cabe; a segunda empresa não.
    expect(t.chamadas()).toHaveLength(2);
    const tratadas = m.banco.tabelas.serproDctfweb.linhas.filter((l) => l.situacao === "BAIXADO");
    expect(tratadas).toHaveLength(1);
  });

  it("desligada, antes do dia sem evento ou antes das 8h, não chama ninguém", async () => {
    await marcar(A);
    const t = transportePorServico({});
    await salvarAjusteDaRotina(TENANT, { ligada: false, diaSemEvento: 16, tetoCentavos: null });
    expect(await rotinaDaDctfweb(TENANT, { transporte: t.transporte, agora })).toBe(0);
    await salvarAjusteDaRotina(TENANT, { ligada: true, diaSemEvento: 20, tetoCentavos: null });
    expect(await rotinaDaDctfweb(TENANT, { transporte: t.transporte, agora })).toBe(0);
    await salvarAjusteDaRotina(TENANT, { ligada: true, diaSemEvento: 16, tetoCentavos: null });
    expect(await rotinaDaDctfweb(TENANT, { transporte: t.transporte, agora: () => new Date("2026-11-17T09:00:00Z") })).toBe(0);
    expect(t.chamadas()).toHaveLength(0);
  });

  it("com o evento da DCTFWeb, não espera o dia sem evento", async () => {
    await salvarAjusteDaRotina(TENANT, { ligada: true, diaSemEvento: 20, tetoCentavos: null });
    await marcar(A);
    m.banco.tabelas.serproEvento.linhas.push({ id: "ev", tenantId: TENANT, chave: "11444777", evento: "E0301", ultimoEm: new Date("2026-11-10T12:00:00Z") });
    const t = transportePorServico({ CONSRECIBO32: () => RECIBO_OK, GERARGUIA31: () => GUIA_DA_DCTFWEB });
    expect(await rotinaDaDctfweb(TENANT, { transporte: t.transporte, agora })).toBe(1);
  });
});

describe("rodar agora e a tela", () => {
  it("põe na fila, trata na hora e mostra o resultado com o custo", async () => {
    await salvarAjusteDaRotina(TENANT, { ligada: false, diaSemEvento: 16, tetoCentavos: null });
    await marcar(A, B);
    const t = transportePorServico({ CONSRECIBO32: (_n, corpo) => (contribuinte(corpo) === A.cnpj ? RECIBO_OK : SEM_DECLARACAO), GERARGUIA31: () => GUIA_DA_DCTFWEB });

    const r = await rodarAgora(TENANT, "victor", "2026-09", null, { transporte: t.transporte, agora });
    expect(r).toMatchObject({ ok: true, naFila: 2, resumo: { competencia: "2026-09", tratadas: 2, porSituacao: { BAIXADO: 1, SEM_DECLARACAO: 1 }, parou: null } });
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "autorizacoes.serpro_dctfweb", userId: "victor" }));
    expect(m.banco.estado.chamadas.every((c) => c.origem === "dctfweb")).toBe(true);

    const tela = await dctfwebDoMes(TENANT, "2026-09", AGORA);
    expect(tela.linhas.map((l) => [l.empresa, l.situacao, l.custoCentavos])).toEqual([
      ["Alfa Ltda", "BAIXADO", 56],
      ["Beta Ltda", "SEM_DECLARACAO", 0],
    ]);
    expect(tela.gastoNoMes).toEqual({ consultas: 1, emissoes: 1, centavos: 56 });

    // De novo: o baixado fica de fora; o sem declaração é consultado (o 404 não é cobrado).
    const de = await rodarAgora(TENANT, "victor", "2026-09", null, { transporte: t.transporte, agora: () => new Date(AGORA.getTime() + 60_000) });
    expect(de).toMatchObject({ ok: true, naFila: 1 });
    expect(t.doServico("GERARGUIA31")).toHaveLength(1);
  });

  it("na demonstração ou sem empresa marcada, recusa sem chamar", async () => {
    expect(await rodarAgora(TENANT, "victor", "2026-10", null, { agora })).toEqual({ ok: false, erro: "Nenhuma empresa marcada para a DCTFWeb do mês." });
    m.banco.conectar({ ambiente: "demonstracao" });
    process.env.SERPRO_TRIAL_TOKEN = "trial";
    expect(await rodarAgora(TENANT, "victor", "2026-10", null, { agora })).toMatchObject({ ok: false, erro: expect.stringContaining("demonstração") });
    delete process.env.SERPRO_TRIAL_TOKEN;
  });

  it("só marca empresa com CNPJ", async () => {
    m.banco.tabelas.company.linhas.push({ ...A }, { ...empresa("emp-pf", "", "Pessoa"), kind: "PESSOA_FISICA", cnpj: null, cpf: "12345678909" });
    expect(await marcarEmpresas(TENANT, ["emp-a", "emp-pf"], true)).toBe(1);
    expect(await marcarEmpresas(TENANT, ["emp-a"], true)).toBe(0);
    expect(await marcarEmpresas(TENANT, ["emp-a"], false)).toBe(1);
  });
});
