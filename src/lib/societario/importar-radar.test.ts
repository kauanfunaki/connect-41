import { describe, expect, it } from "vitest";
import { jaImportadasDoRadar, nomeDoAnexo, planejarDoRadar, tipoDaLicenca, type DoRadar } from "./importar-radar";

// As licenças do Radar Societário (28/10/2026): o que entra, como entra e o
// que fica de fora. Empresas e licenças fictícias.

const EMPRESA = { id: "r1", razao_social: "EMPRESA FICTICIA LTDA", razao_social_manual: null, cnpj: "11.444.777/0001-61" };
const licenca = (id: number, extra: Partial<DoRadar["licencas"][number]> = {}): DoRadar["licencas"][number] => ({
  id,
  license_type: "vigilancia_sanitaria",
  license_label: null,
  expiration_date: "2027-03-15",
  expiration_date_text: null,
  notes: null,
  applicable: 1,
  ...extra,
});
const CONNECT = {
  empresas: [{ id: "c1", cnpj: "11444777000161" }],
  orgaos: [
    { id: "o-visa", name: "Vigilância Sanitária de Curitiba" },
    { id: "o-cb1", name: "Corpo de Bombeiros PR" },
    { id: "o-cb2", name: "Bombeiros SC" },
  ],
  jaImportadas: new Set<number>(),
  hoje: "2026-10-28",
};

describe("o tipo da licença", () => {
  it("tipo com complemento; Outros vira só o complemento", () => {
    expect(tipoDaLicenca("vigilancia_sanitaria", "veicular")).toBe("Vigilância Sanitária — veicular");
    expect(tipoDaLicenca("corpo_bombeiros", "  ")).toBe("Corpo de Bombeiros");
    expect(tipoDaLicenca("outros", "Licença de publicidade")).toBe("Licença de publicidade");
    expect(tipoDaLicenca("outros", null)).toBe("Outros");
    expect(tipoDaLicenca("outros", "x".repeat(200))).toHaveLength(120);
  });
});

describe("o plano", () => {
  it("casa pelo CNPJ, traz validade, observações com a marca, órgão único e os anexos da licença", () => {
    const plano = planejarDoRadar(
      [
        {
          empresa: EMPRESA,
          licencas: [licenca(10, { notes: "Protocolo 123" }), licenca(11, { license_type: "corpo_bombeiros" })],
          anexos: [
            { id: 1, license_id: 10, original_name: "visa.pdf", mime_type: "application/pdf" },
            { id: 2, license_id: 99, original_name: "outro.pdf", mime_type: null },
          ],
        },
      ],
      CONNECT
    );
    expect(plano.licencas).toHaveLength(2);
    expect(plano.licencas[0]).toMatchObject({
      radarId: 10,
      companyId: "c1",
      empresa: "EMPRESA FICTICIA LTDA",
      kind: "Vigilância Sanitária",
      organId: "o-visa",
      expiresAt: new Date("2027-03-15T00:00:00Z"),
      notes: "Protocolo 123\n\nTrazida do Radar Societário em 28/10/2026 [Radar #10].",
      textoDoVencimento: null,
    });
    expect(plano.licencas[0].anexos.map((a) => a.id)).toEqual([1]);
    // Dois órgãos de bombeiros no cadastro: não chuta.
    expect(plano.licencas[1].organId).toBeNull();
  });

  it("vencimento em texto: sem validade, texto nas observações e na prévia", () => {
    const [l] = planejarDoRadar([{ empresa: EMPRESA, licencas: [licenca(12, { expiration_date: null, expiration_date_text: "Isento" })], anexos: [] }], CONNECT).licencas;
    expect(l).toMatchObject({ expiresAt: null, textoDoVencimento: "Isento" });
    expect(l.notes).toContain("Vencimento no Radar: Isento.");
  });

  it("não se aplica, já trazida e empresa sem par ficam de fora, contadas", () => {
    const plano = planejarDoRadar(
      [
        { empresa: EMPRESA, licencas: [licenca(13, { applicable: 0 }), licenca(14), licenca(15)], anexos: [] },
        { empresa: { id: "r2", razao_social: "OUTRA", razao_social_manual: "Outra Corrigida", cnpj: "99999999000191" }, licencas: [licenca(16), licenca(17, { applicable: false })], anexos: [] },
      ],
      { ...CONNECT, jaImportadas: new Set([14]) }
    );
    expect(plano.licencas.map((l) => l.radarId)).toEqual([15]);
    expect(plano.jaImportadas).toBe(1);
    expect(plano.naoSeAplica).toBe(2);
    expect(plano.semEmpresa).toEqual([{ empresa: "Outra Corrigida", cnpj: "99999999000191", licencas: 1 }]);
  });

  it("as marcas nas observações e o nome do anexo", () => {
    expect(jaImportadasDoRadar(["x [Radar #3] y", null, "[Radar #40]\n[Radar #5]"])).toEqual(new Set([3, 40, 5]));
    expect(nomeDoAnexo("Vigilância Sanitária — veicular", "alvará/2026.pdf")).toBe("Licença - Vigilância Sanitária — veicular - alvará 2026.pdf");
  });
});
