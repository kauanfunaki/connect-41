import { describe, expect, it } from "vitest";
import { aplicarCoringas, chaveDoNome, contaNoPlano, fornecedorNoFim, montarRelatorio, CTE, NFE, NFSE, type Entrada, type Modelos, type Regra } from "./lancamentos";
import { criarSugestor, semelhanca } from "./sugestao";
import { lerPlanoDeContas } from "./plano";

const entrada = (e: Partial<Entrada> = {}): Entrada => ({
  chave: e.chave ?? `ch-${Math.random()}`, tipo: NFE, cnpj: "11111111000191", nome: "POSTO BOM LTDA", numero: "123", serie: "1",
  data: "2026-09-05", centavos: 10000, cfops: ["1653"], cancelada: false, ...e,
});
const regra = (r: Partial<Regra> = {}): Regra => ({
  cnpjFornecedor: "11111111000191", cfop: "", nomeFornecedor: "", contaDebito: "500", contaCredito: "900", codigoHistorico: "", historico: "", desconsiderar: false, ...r,
});
const MODELOS: Modelos = { debitoCte: "312", debitoNfse: "362", contaImobilizado: "121", historicoImobilizado: "136" };

describe("montarRelatorio", () => {
  it("lança pela regra padrão do fornecedor, com o histórico padrão terminando no nome", () => {
    const { lancamentos, pendencias } = montarRelatorio([entrada()], [regra()]);
    expect(pendencias).toEqual([]);
    expect(lancamentos[0]).toMatchObject({ debito: "500", credito: "900", centavos: 10000, data: "2026-09-05", historico: "COMPRAS NF 123 POSTO BOM LTDA", origemDoCredito: "regra" });
  });

  it("a regra do CFOP vence a padrão do fornecedor", () => {
    const { lancamentos } = montarRelatorio([entrada({ cfops: ["1556"] })], [regra(), regra({ cfop: "1556", contaDebito: "777" })]);
    expect(lancamentos[0].debito).toBe("777");
  });

  it("sem regra vira pendência agrupada por fornecedor e CFOP, a maior primeiro", () => {
    const { pendencias, lancamentos } = montarRelatorio([
      entrada({ centavos: 100 }), entrada({ centavos: 200 }),
      entrada({ cnpj: "22222222000191", nome: "OUTRO", centavos: 5000 }),
    ], []);
    expect(lancamentos).toEqual([]);
    expect(pendencias.map((p) => [p.cnpjFornecedor, p.qtd, p.centavos])).toEqual([["22222222000191", 1, 5000], ["11111111000191", 2, 300]]);
  });

  it("regra com conta em branco é pendência marcada como cadastrada", () => {
    const { pendencias } = montarRelatorio([entrada()], [regra({ contaDebito: "" })]);
    expect(pendencias[0].cadastradaSemConta).toBe(true);
  });

  it("cancelada, valor zero e desconsiderada saem contadas, sem lançamento", () => {
    const { descartados, lancamentos, pendencias } = montarRelatorio([
      entrada({ cancelada: true }), entrada({ centavos: 0 }),
      entrada({ cnpj: "33333333000191", cfops: ["1949"] }),
    ], [regra({ cnpjFornecedor: "", cfop: "1949", desconsiderar: true, contaDebito: "", contaCredito: "" })]);
    expect(lancamentos).toEqual([]);
    expect(pendencias).toEqual([]);
    expect(descartados.map((d) => d.motivo).sort()).toEqual(["cancelado", "desconsiderado", "valor_zero"]);
  });

  it("regra de CFOP para qualquer fornecedor só vale para deixar de fora", () => {
    const { pendencias } = montarRelatorio([entrada({ cnpj: "44444444000191" })], [regra({ cnpjFornecedor: "", cfop: "1653" })]);
    expect(pendencias).toHaveLength(1);
  });

  it("CT-e e NFS-e usam o débito do modelo e o crédito de qualquer regra do fornecedor", () => {
    const { lancamentos } = montarRelatorio([
      entrada({ tipo: CTE, cfops: ["1353"], numero: "77" }),
      entrada({ tipo: NFSE, cfops: [], numero: "88" }),
    ], [regra({ cfop: "1653" })], MODELOS);
    expect(lancamentos.map((l) => [l.tipo, l.debito, l.credito, l.origemDoCredito])).toEqual([[CTE, "312", "900", "outra_regra"], [NFSE, "362", "900", "outra_regra"]]);
    expect(lancamentos[0].historico).toBe("SERVIÇOS DE TRANSPORTE CTE N° 77 POSTO BOM LTDA");
  });

  it("sem modelo configurado, o CT-e segue a regra do fornecedor como a NF-e", () => {
    const { lancamentos } = montarRelatorio([entrada({ tipo: CTE, cfops: ["1353"] })], [regra()]);
    expect(lancamentos[0].debito).toBe("500");
  });

  it("imobilizado vai para a conta genérica com o histórico do modelo", () => {
    const { lancamentos } = montarRelatorio([entrada({ cfops: ["1126", "1551"] })], [regra({ cfop: "2551" })], MODELOS);
    expect(lancamentos[0]).toMatchObject({ debito: "121", credito: "900", codigoHistorico: "136", imobilizado: true, cfop: "1551", historico: "123 - POSTO BOM LTDA" });
  });

  it("NFS-e sem regra acha o crédito no plano pela raiz do MEI", () => {
    const plano = contaNoPlano([{ reduzido: "4321", classificacao: "2.1.3.01.0001", nome: "48.392.479 JANAINA SILVA" }]);
    const { lancamentos } = montarRelatorio([entrada({ tipo: NFSE, cnpj: "48392479000101", nome: "", cfops: [] })], [], MODELOS, plano);
    expect(lancamentos[0]).toMatchObject({ credito: "4321", origemDoCredito: "plano_cnpj", historico: "SERVIÇO TOMADO NF 123 48.392.479 JANAINA SILVA" });
  });

  it("homônimo no plano não casa", () => {
    const plano = contaNoPlano([
      { reduzido: "1", classificacao: "2.1", nome: "TRANSPORTES SILVA LTDA" },
      { reduzido: "2", classificacao: "2.1", nome: "TRANSPORTES SILVA" },
    ]);
    expect(plano("99999999000191", "Transportes Silva Ltda")).toBeNull();
  });
});

describe("histórico", () => {
  it("troca os coringas pelos dados da nota", () => {
    expect(aplicarCoringas("NF {nf}/{serie} {data} {cfop} {fornecedor}", entrada())).toBe("NF 123/1 05/09/2026 1653 POSTO BOM LTDA");
  });
  it("não repete o fornecedor que já está no fim", () => {
    expect(fornecedorNoFim("COMPRA POSTO BOM LTDA.", "Posto Bom Ltda")).toBe("COMPRA POSTO BOM LTDA.");
    expect(fornecedorNoFim("COMPRA", "POSTO")).toBe("COMPRA POSTO");
  });
  it("a chave do nome tira documento da frente e tipo de empresa do fim", () => {
    expect(chaveDoNome("44.099.672 Jadison Ávila S/A")).toBe("JADISON AVILA");
    expect(chaveDoNome("AUTO POSTO X 01 LTDA")).toBe("AUTO POSTO X 01");
  });
});

describe("sugestão de conta", () => {
  it("é o ratio do difflib", () => {
    expect(semelhanca("abcd", "bcde")).toBeCloseTo(0.75);
    expect(semelhanca("", "")).toBe(1);
  });
  it("sugere só acima do corte", () => {
    const sugerir = criarSugestor([
      { reduzido: "10", classificacao: "2.1.3.01.0010", nome: "JEQUITIBA COMERCIO DE COMBUSTIVEIS LTDA" },
      { reduzido: "11", classificacao: "2.1.3.01.0011", nome: "PADOMAR COMERCIO DE AUTO PECAS" },
    ]);
    expect(sugerir("JEQUITIBA COMERCIO DE COMBUSTIVEIS EIRELI")?.reduzido).toBe("10");
    expect(sugerir("PLANET VANS COMERCIO DE AUTO PECAS")).toBeNull();
  });
});

describe("lerPlanoDeContas", () => {
  it("acha as colunas pelo cabeçalho, abaixo do título", () => {
    const r = lerPlanoDeContas([
      ["Plano de contas", ""],
      ["Código", "Classificação", "Nome", "T"],
      ["1", "1", "ATIVO", "S"],
      ["121", "1.2.4.04.0001", "VEÍCULOS", "A"],
      ["", "", "", ""],
      ["x", "lixo", "sem código", "A"],
    ]);
    expect(r).toEqual({ ok: true, ignoradas: 1, contas: [
      { reduzido: "1", classificacao: "1", nome: "ATIVO", analitica: false },
      { reduzido: "121", classificacao: "1.2.4.04.0001", nome: "VEÍCULOS", analitica: true },
    ] });
  });
  it("recusa sem a coluna do reduzido", () => {
    expect(lerPlanoDeContas([["Classificação", "Nome"], ["1", "ATIVO"]]).ok).toBe(false);
  });
});
