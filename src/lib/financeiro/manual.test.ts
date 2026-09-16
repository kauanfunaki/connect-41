import { describe, it, expect } from "vitest";
import {
  centavosDeTexto,
  decimalDeCentavos,
  validarCamposDoLancamento,
  statusInicialDoManual,
  podeCancelarManual,
  type CamposDoLancamento,
} from "./manual";
import { somarMeses, competenciasAte, acumuladoDoAno, dataValida, diasEntre, diasNoMes } from "./periodo";

const HOJE = "2026-09-15";

describe("centavosDeTexto", () => {
  it("lê o formato brasileiro com milhar e decimal", () => {
    expect(centavosDeTexto("1.234,56")).toBe(123_456);
    expect(centavosDeTexto("R$ 1.234,56")).toBe(123_456);
  });

  it("lê o formato de planilha com ponto decimal", () => {
    expect(centavosDeTexto("1234.56")).toBe(123_456);
    expect(centavosDeTexto("1,234.56")).toBe(123_456);
  });

  // O caso ambíguo: ponto seguido de três dígitos é milhar, não decimal.
  it("ponto com três dígitos é milhar", () => {
    expect(centavosDeTexto("1.234")).toBe(123_400);
    expect(centavosDeTexto("12.5")).toBe(1_250);
  });

  it("vírgula sozinha é decimal", () => {
    expect(centavosDeTexto("10,5")).toBe(1_050);
    expect(centavosDeTexto("10")).toBe(1_000);
  });

  // Três casas é erro de digitação; arredondar lançaria um valor que ninguém escreveu.
  it("recusa três casas decimais, negativo e lixo", () => {
    expect(centavosDeTexto("10,555")).toBeNull();
    expect(centavosDeTexto("-10")).toBeNull();
    expect(centavosDeTexto("abc")).toBeNull();
    expect(centavosDeTexto("")).toBeNull();
  });

  it("volta para o texto do Decimal sem float", () => {
    expect(decimalDeCentavos(123_456)).toBe("1234.56");
    expect(decimalDeCentavos(5)).toBe("0.05");
  });
});

describe("validarCamposDoLancamento", () => {
  const base: CamposDoLancamento = {
    kind: "PAGAR",
    competencia: "2026-09",
    vencimento: "2026-09-20",
    valor: "1.500,00",
    categoryId: "cat-1",
  };

  it("aceita o lançamento completo", () => {
    const r = validarCamposDoLancamento(base, HOJE);
    expect(r).toEqual({
      ok: true,
      dados: {
        kind: "PAGAR",
        competencia: "2026-09",
        vencimentoKey: "2026-09-20",
        centavos: 150_000,
        descricao: null,
        pagoEmKey: null,
        categoryId: "cat-1",
      },
    });
  });

  it("conta a pagar sem categoria não passa — despesa sem classificação não fecha o DRE", () => {
    const r = validarCamposDoLancamento({ ...base, categoryId: null }, HOJE);
    expect(r.ok).toBe(false);
  });

  it("conta a receber sem categoria passa", () => {
    const r = validarCamposDoLancamento({ ...base, kind: "RECEBER", categoryId: null }, HOJE);
    expect(r.ok).toBe(true);
  });

  it("pago no futuro é agendamento, não baixa", () => {
    const r = validarCamposDoLancamento({ ...base, pagoEm: "2026-09-16" }, HOJE);
    expect(r).toMatchObject({ ok: false });
    const hoje = validarCamposDoLancamento({ ...base, pagoEm: HOJE }, HOJE);
    expect(hoje).toMatchObject({ ok: true, dados: { pagoEmKey: HOJE } });
  });

  it("recusa competência fora do formato, data inexistente e valor zero", () => {
    expect(validarCamposDoLancamento({ ...base, competencia: "09/2026" }, HOJE).ok).toBe(false);
    expect(validarCamposDoLancamento({ ...base, vencimento: "2026-02-31" }, HOJE).ok).toBe(false);
    expect(validarCamposDoLancamento({ ...base, valor: "0,00" }, HOJE).ok).toBe(false);
    expect(validarCamposDoLancamento({ ...base, kind: "OUTRO" }, HOJE).ok).toBe(false);
  });

  it("status inicial: conferido, ou pago quando já vem baixado", () => {
    expect(statusInicialDoManual(null)).toBe("CONFERIDO");
    expect(statusInicialDoManual(HOJE)).toBe("PAGO");
  });
});

describe("podeCancelarManual", () => {
  it("cancela o manual em aberto", () => {
    expect(podeCancelarManual({ status: "CONFERIDO", paidAt: null, fiscalDocumentId: null })).toEqual({ pode: true });
  });

  // Cancelar aqui deixaria a nota marcada como lançada apontando para um lançamento morto.
  it("recusa o que veio de nota, o pago e o já cancelado", () => {
    expect(podeCancelarManual({ status: "PROVISORIO", paidAt: null, fiscalDocumentId: "doc" }).pode).toBe(false);
    expect(podeCancelarManual({ status: "PAGO", paidAt: new Date(), fiscalDocumentId: null }).pode).toBe(false);
    expect(podeCancelarManual({ status: "CANCELADO", paidAt: null, fiscalDocumentId: null }).pode).toBe(false);
  });

  // Parcela solta cancelada deixaria o acordo cobrando menos do que foi combinado.
  it("recusa parcela de acordo de cobrança — o caminho é desfazer o acordo", () => {
    expect(podeCancelarManual({ status: "CONFERIDO", paidAt: null, fiscalDocumentId: null, agreementId: "acordo" }).pode).toBe(false);
  });
});

describe("periodo", () => {
  it("anda por competências atravessando o ano", () => {
    expect(somarMeses("2026-01", -1)).toBe("2025-12");
    expect(somarMeses("2025-12", 1)).toBe("2026-01");
    expect(competenciasAte("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(acumuladoDoAno("2026-03")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("valida data de calendário e conta dias", () => {
    expect(dataValida("2024-02-29")).toBe("2024-02-29");
    expect(dataValida("2026-02-29")).toBeNull();
    expect(diasEntre("2026-09-10", "2026-09-15")).toBe(5);
    expect(diasEntre("2026-12-31", "2027-01-01")).toBe(1);
    expect(diasNoMes("2026-02")).toBe(28);
  });
});
