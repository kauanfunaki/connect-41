import { describe, expect, it } from "vitest";
import { registroDaGuia } from "./registro";

const emitida = { pdf: "JVBER", total: 123456, vencimento: "2026-10-20", validoAte: "2026-10-31", numeroDocumento: "07202629812345678" };

describe("registro da guia emitida", () => {
  it("DAS: competência, vencimento, válido até, valor e número", () => {
    expect(registroDaGuia({ tipo: "DAS", periodo: "2026-09", pagamento: "2026-10-31" }, emitida)).toEqual({
      tipo: "DAS",
      descricao: "DAS do Simples Nacional · 09/2026",
      competencia: "2026-09",
      vencimento: "2026-10-20",
      validoAte: "2026-10-31",
      valorCentavos: 123456,
      numeroDocumento: "07202629812345678",
    });
  });

  it("DCTFWeb do 13º e parcela: o rótulo diz qual é, e o que o Serpro não manda fica nulo", () => {
    const semCampos = { pdf: "JVBER", total: null, vencimento: null, validoAte: null, numeroDocumento: null };
    expect(registroDaGuia({ tipo: "DCTFWEB", periodo: "2026-12", decimoTerceiro: true, pagamento: null }, semCampos)).toMatchObject({
      descricao: "Guia da DCTFWeb · 13º de 2026",
      vencimento: null,
      valorCentavos: null,
    });
    expect(registroDaGuia({ tipo: "PARCELA", modalidade: "PARCSN", parcela: "2026-10" } as never, semCampos)).toMatchObject({
      descricao: "Parcela de parcelamento PARCSN · 10/2026",
      competencia: "2026-10",
    });
  });

  it("data fora do formato não entra", () => {
    expect(registroDaGuia({ tipo: "DAS", periodo: "2026-09", pagamento: null }, { ...emitida, vencimento: "20/10/2026", validoAte: "" })).toMatchObject({
      vencimento: null,
      validoAte: null,
    });
  });
});
