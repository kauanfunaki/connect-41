import { describe, expect, it } from "vitest";
import {
  adicionalDaAposentadoriaEspecial,
  alertasDaAposentadoria,
  diasDeLicencaPagosNoMes,
  fimDoGozo,
  lerAposentadoria,
  lerRegraDaLicencaPremio,
  lerUsoDaLicencaPremio,
  saldoDaLicencaPremio,
} from "./licencaPremio";

describe("licença-prêmio", () => {
  it("a regra da convenção vem com os dois campos ou nenhum", () => {
    expect(lerRegraDaLicencaPremio(null, null)).toEqual({ ok: true, regra: null });
    expect(lerRegraDaLicencaPremio(5, 90)).toEqual({ ok: true, regra: { anos: 5, dias: 90 } });
    expect(lerRegraDaLicencaPremio(5, null)).toMatchObject({ ok: false });
    expect(lerRegraDaLicencaPremio(0, 90)).toMatchObject({ ok: false });
  });

  it("saldo: períodos completos × dias, menos os gozados e os pagos", () => {
    const regra = { anos: 5, dias: 90 };
    expect(saldoDaLicencaPremio("2016-03-10", "2026-03-09", regra, [])).toMatchObject({ periodos: 1, direito: 90, saldo: 90, proximoPeriodo: "2026-03-10" });
    const usos = [
      { tipo: "LICENCA_PREMIO_GOZO" as const, data: "2022-01-03", dias: 30 },
      { tipo: "LICENCA_PREMIO_PAGA" as const, data: "2026-05-05", dias: 60 },
    ];
    expect(saldoDaLicencaPremio("2016-03-10", "2026-05-20", regra, usos)).toEqual({ periodos: 2, direito: 180, gozados: 30, pagos: 60, saldo: 90, proximoPeriodo: "2031-03-10" });
  });

  it("o uso não passa do saldo", () => {
    expect(lerUsoDaLicencaPremio({ tipo: "LICENCA_PREMIO_GOZO", data: "2027-01-04", dias: "30" }, 90)).toEqual({ ok: true, uso: { tipo: "LICENCA_PREMIO_GOZO", data: "2027-01-04", dias: 30 } });
    expect(lerUsoDaLicencaPremio({ tipo: "LICENCA_PREMIO_PAGA", data: "2027-01-04", dias: "91" }, 90)).toMatchObject({ ok: false, erro: expect.stringMatching(/90/) });
    expect(lerUsoDaLicencaPremio({ tipo: "LICENCA_PREMIO_PAGA", data: "2027-01-04", dias: "1" }, 0)).toMatchObject({ ok: false, erro: expect.stringMatching(/período/) });
    expect(lerUsoDaLicencaPremio({ tipo: "X", data: "2027-01-04", dias: "1" }, 90)).toMatchObject({ ok: false });
  });

  it("o fim do gozo e os dias pagos no mês", () => {
    expect(fimDoGozo({ data: "2027-01-04", dias: 30 })).toBe("2027-02-02");
    const usos = [
      { tipo: "LICENCA_PREMIO_PAGA" as const, data: "2027-03-05", dias: 30 },
      { tipo: "LICENCA_PREMIO_PAGA" as const, data: "2027-03-20", dias: 15 },
      { tipo: "LICENCA_PREMIO_GOZO" as const, data: "2027-03-01", dias: 10 },
    ];
    expect(diasDeLicencaPagosNoMes(usos, 2027, 3)).toBe(45);
    expect(diasDeLicencaPagosNoMes(usos, 2027, 4)).toBe(0);
  });
});

describe("aposentadoria", () => {
  it("lê o tipo, a DIB e o NB", () => {
    expect(lerAposentadoria({ tipo: "IDADE", data: "2027-02-01", beneficio: "123.456.789-0" })).toEqual({ ok: true, aposentadoria: { tipo: "IDADE", data: "2027-02-01", beneficio: "1234567890" } });
    expect(lerAposentadoria({ tipo: "IDADE", data: "2027-02-01", beneficio: "" })).toMatchObject({ ok: true, aposentadoria: { beneficio: null } });
    expect(lerAposentadoria({ tipo: "IDADE", data: "2027-02-01", beneficio: "123" })).toMatchObject({ ok: false });
    expect(lerAposentadoria({ tipo: "X", data: "2027-02-01", beneficio: "" })).toMatchObject({ ok: false });
  });

  it("o adicional da especial: 12%, 9% ou 6% da base", () => {
    expect(adicionalDaAposentadoriaEspecial(3000, "4")).toEqual({ valor: 180, aliquota: 6 });
    expect(adicionalDaAposentadoriaEspecial(3000, "2")).toEqual({ valor: 360, aliquota: 12 });
    expect(adicionalDaAposentadoriaEspecial(3000, "1")).toEqual({ valor: 0, aliquota: 0 });
    expect(adicionalDaAposentadoriaEspecial(3000, null)).toEqual({ valor: 0, aliquota: 0 });
  });

  it("os avisos: INSS e FGTS continuam; incapacidade suspende; especial não pode seguir exposto", () => {
    expect(alertasDaAposentadoria(null, "4")).toEqual([]);
    expect(alertasDaAposentadoria({ tipo: "IDADE", desde: "2027-02-01" }, null)[0]).toMatch(/01\/02\/2027.*INSS e o FGTS/);
    expect(alertasDaAposentadoria({ tipo: "INCAPACIDADE", desde: "2027-02-01" }, null)[0]).toMatch(/suspenso.*06/);
    expect(alertasDaAposentadoria({ tipo: "ESPECIAL", desde: "2027-02-01" }, "4")).toHaveLength(2);
    expect(alertasDaAposentadoria({ tipo: "ESPECIAL", desde: "2027-02-01" }, "1")).toHaveLength(1);
  });
});
