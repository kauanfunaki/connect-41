import { describe, expect, it, vi } from "vitest";
import * as F from "@/lib/sped/telasDoMotor.fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/fiscal/data", () => ({ listarDocumentos: vi.fn() }));
const { carregarAcervo, carregarCobertura, carregarImportacoes } = await import("./documentos");
const { telaDeTeste, ESTAB_SP } = await import("./telaDeTeste");

const DOC = (over: Record<string, unknown> = {}) => ({
  id: "d1", type: "NFE", number: "123", issuerName: "Fornecedor", issuerDocument: "11111111000100", recipientName: "BLD SP", recipientDocument: ESTAB_SP.cnpj,
  amount: null, renderizavel: true, issuedAt: new Date("2026-09-05T12:00:00Z"), ...over,
});

describe("Acervo (projeção FiscalDocument)", () => {
  it("lê só a Company do estabelecimento, na competência, com tipo e sentido aplicados lá", async () => {
    const listar = vi.fn().mockResolvedValue({ documentos: [DOC(), DOC({ id: "d2", issuerDocument: ESTAB_SP.cnpj, recipientDocument: "222", recipientName: "Cliente", amount: 10.5 })], total: 2, totalLimitado: false, temProxima: false, pagina: 1, porPagina: 50 });
    const { tela, fetch } = telaDeTeste({});
    const r = await carregarAcervo(tela, { tipo: "NFE", sentido: "entrada", pagina: "2" }, { listar });
    expect(listar).toHaveBeenCalledWith({ tipo: "EMPRESAS", tenantId: "t1", companyIds: ["c-sp"] }, { companyId: "c-sp", competencia: "2026-09", tipo: "NFE", parte: { lado: "destinatario", documento: ESTAB_SP.cnpj } }, 2);
    expect(r.dados?.linhas.map((l) => [l.sentido, l.participante, l.valor])).toEqual([["Entrada", "Fornecedor", null], ["Saída", "Cliente", 10.5]]);
    // Nada no motor: o acervo não tem rota na v1.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("filtro desconhecido não vai à consulta; sem estabelecimento ou sem módulo, nem consulta", async () => {
    const listar = vi.fn().mockResolvedValue({ documentos: [], total: 0, totalLimitado: false, temProxima: false, pagina: 1, porPagina: 50 });
    const { tela } = telaDeTeste({});
    await carregarAcervo(tela, { tipo: "XPTO", sentido: "lado" }, { listar });
    expect(listar.mock.calls[0][1]).toEqual({ companyId: "c-sp", competencia: "2026-09", tipo: undefined });
    listar.mockClear();
    expect((await carregarAcervo(telaDeTeste({}, { estabelecimento: null }).tela, {}, { listar })).erro).toMatch(/estabelecimento/);
    expect((await carregarAcervo(telaDeTeste({}, { modulos: ["fiscal_icms_ipi"] }).tela, {}, { listar })).erro).toMatch(/acesso/);
    expect(listar).not.toHaveBeenCalled();
  });
});

describe("Importações e quarentena", () => {
  it("lista as importações da competência, o detalhe e a quarentena daquela importação", async () => {
    const outra = { ...F.IMPORTACAO, id: 700, por_competencia: { "2026-08": 10 } };
    const { tela, chamadas } = telaDeTeste({
      "/quarentena/resumo": F.RESUMO_QUARENTENA,
      "/importacoes": { itens: [F.IMPORTACAO, outra], proximo_cursor: "c2" },
      "/importacoes/812": F.IMPORTACAO,
      "/quarentena": { itens: [F.REJEITADO], proximo_cursor: null },
    });
    const d = await carregarImportacoes(tela, { importacao: "812", c_imp: "c1" });
    expect(d?.lista.dados?.itens.map((i) => i.id)).toEqual([812]);
    expect(d?.lista.dados?.foraDaCompetencia).toBe(1);
    expect(d?.detalhe?.dados?.id).toBe(812);
    const q = chamadas.find((u) => u.pathname.endsWith("/quarentena"))!;
    expect(q.searchParams.get("importacao_id")).toBe("812");
    expect(q.searchParams.get("classe")).toBe("desconhecido");
    expect(q.searchParams.get("apenas_pendentes")).toBe("true");
    expect(chamadas.find((u) => u.pathname.endsWith("/importacoes"))!.searchParams.get("cursor")).toBe("c1");
  });

  it("`todas=1` mostra todas; `classe=todas` manda `classe=` vazio; `pendentes=0` inclui os resolvidos", async () => {
    const { tela, chamadas } = telaDeTeste({
      "/quarentena/resumo": F.RESUMO_QUARENTENA,
      "/importacoes": { itens: [{ ...F.IMPORTACAO, por_competencia: {} }], proximo_cursor: null },
      "/quarentena": { itens: [], proximo_cursor: null },
    });
    const d = await carregarImportacoes(tela, { todas: "1", classe: "todas", pendentes: "0" });
    expect(d?.lista.dados?.itens).toHaveLength(1);
    const q = chamadas.find((u) => u.pathname.endsWith("/quarentena"))!;
    expect(q.searchParams.has("classe")).toBe(true);
    expect(q.searchParams.get("classe")).toBe("");
    expect(q.searchParams.get("apenas_pendentes")).toBe("false");
  });

  it("sem o módulo fiscal_acervo, nada é lido", async () => {
    const { tela, fetch } = telaDeTeste({}, { modulos: ["fiscal_conferencia"] });
    expect(await carregarImportacoes(tela, {})).toBeNull();
    expect(await carregarCobertura(tela)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("Cobertura", () => {
  it("lê o registro do estabelecimento, os erros do mês e esconde a cobertura de quem a pessoa não vê", async () => {
    const { tela, chamadas } = telaDeTeste({
      "/cobertura": { registro: F.COBERTURA, anterior: null, avaliacao: F.AVALIACAO },
      "/cobertura/lista": { itens: [{ ...F.COBERTURA, avaliacao: F.AVALIACAO }, { ...F.COBERTURA, empresa_id: 99, avaliacao: null }], proximo_cursor: null },
      "/erros-extracao": F.ERROS_EXTRACAO,
      "/nfse/resumo": F.NFSE_RESUMO,
    });
    const d = await carregarCobertura(tela);
    expect(d?.cobertura?.dados?.avaliacao?.semaforo).toBe("amarelo");
    expect(d?.lista.dados?.map((c) => c.empresa_id)).toEqual([3]);
    const erros = chamadas.find((u) => u.pathname.endsWith("/erros-extracao"))!;
    expect([erros.searchParams.get("data_ini"), erros.searchParams.get("data_fim")]).toEqual(["2026-09-01", "2026-09-30"]);
    expect(chamadas.find((u) => u.pathname.endsWith("/cobertura"))!.searchParams.get("empresa_id")).toBe("3");
  });

  it("sem estabelecimento, não pede /cobertura; erro de uma leitura não derruba as outras", async () => {
    const { tela, chamadas } = telaDeTeste({
      "/cobertura/lista": { itens: [], proximo_cursor: null },
      "/erros-extracao": () => new Response(JSON.stringify({ erro: "x", codigo: "banco_indisponivel" }), { status: 503 }),
      "/nfse/resumo": F.NFSE_RESUMO,
    }, { estabelecimento: null });
    const d = await carregarCobertura(tela);
    expect(d?.cobertura).toBeNull();
    expect(chamadas.some((u) => u.pathname.endsWith("/cobertura"))).toBe(false);
    expect(d?.erros.erro).toMatch(/banco do motor/);
    expect(d?.erros.erro !== null && d?.erros.codigo).toBe("banco_indisponivel");
    expect(d?.nfse.dados?.itens).toHaveLength(1);
  });
});
