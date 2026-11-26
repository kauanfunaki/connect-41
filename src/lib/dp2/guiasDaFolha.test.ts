import { describe, expect, it } from "vitest";
import { conferirGuias, lerGuiaDoFgts } from "./guiasDaFolha";

describe("guias da folha (funcionalidade-744)", () => {
  it("DARF da DCTFWeb = INSS + IRRF a recolher; GFD = FGTS do mês", () => {
    const [darf, gfd] = conferirGuias({ inssARecolher: 5917.2, irrfARecolher: 1049.27, fgtsDoMes: 716, valorDarf: 6966.47, valorGfd: 716 });
    expect(darf).toMatchObject({ guia: "DCTFWEB", esperado: 6966.47, valorDaGuia: 6966.47, diferenca: 0, situacao: "BATE" });
    expect(darf.memoria).toContain("INSS a recolher");
    expect(gfd).toMatchObject({ guia: "FGTS", esperado: 716, situacao: "BATE" });
  });

  it("diferença acima de 1 centavo diverge; sem guia, só o esperado", () => {
    const [darf, gfd] = conferirGuias({ inssARecolher: 1000, irrfARecolher: 0, fgtsDoMes: 80, valorDarf: 1010.5, valorGfd: null });
    expect(darf).toMatchObject({ diferenca: 10.5, situacao: "DIFERE" });
    expect(gfd).toMatchObject({ valorDaGuia: null, diferenca: null, situacao: "SEM_GUIA" });
    expect(conferirGuias({ inssARecolher: 100, irrfARecolher: 0, fgtsDoMes: 0, valorDarf: 100.01, valorGfd: null })[0].situacao).toBe("BATE");
  });

  it("lê valor e vencimento da GFD", () => {
    expect(lerGuiaDoFgts("716,00", "2027-03-20")).toEqual({ ok: true, valor: 716, vencimento: "2027-03-20" });
    expect(lerGuiaDoFgts("0", "2027-03-20").ok).toBe(false);
    expect(lerGuiaDoFgts("716", "20/03/2027").ok).toBe(false);
  });
});
