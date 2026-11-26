import { describe, expect, it } from "vitest";
import { historicoDoPpp, pdfDoPpp, type EventoDeSst } from "./ppp";

const s2240 = (inicio: string, setor: string, agentes: string[], situacao = "ACEITO", em = "2026-01-01T10:00:00Z"): EventoDeSst => ({
  tipo: "S-2240",
  situacao,
  createdAt: new Date(em),
  xml: `<eSocial><infoExpRisco><dtIniCondicao>${inicio}</dtIniCondicao><infoAmb><dscSetor>${setor}</dscSetor></infoAmb><infoAtiv><dscAtivDes>Opera &amp; limpa</dscAtivDes></infoAtiv>${(agentes.length ? agentes : ["09.01.001"]).map((a) => `<agNoc><codAgNoc>${a}</codAgNoc><epcEpi><utilizEPC>2</utilizEPC><utilizEPI>2</utilizEPI></epcEpi></agNoc>`).join("")}</infoExpRisco></eSocial>`,
});

describe("histórico PPP", () => {
  it("monta os períodos dos S-2240: cada um vai até a véspera do próximo", () => {
    const h = historicoDoPpp([s2240("2026-03-01", "Forno", ["02.01.006"]), s2240("2026-01-10", "Balcão", [])], "2026-12-31");
    expect(h.periodos.map((p) => [p.inicio, p.fim, p.setor, p.agentes])).toEqual([
      ["2026-01-10", "2026-02-28", "Balcão", []],
      ["2026-03-01", "2026-12-31", "Forno", ["02.01.006"]],
    ]);
    expect(h.periodos[0].atividade).toBe("Opera & limpa");
  });

  it("gerado de novo para a mesma data vale o mais recente; excluído e retificado ficam de fora", () => {
    const h = historicoDoPpp([
      s2240("2026-03-01", "Forno velho", [], "RETIFICADO", "2026-03-01T10:00:00Z"),
      s2240("2026-03-01", "Forno", [], "PRONTO", "2026-03-02T10:00:00Z"),
      s2240("2026-03-01", "Forno novo", [], "PRONTO", "2026-03-03T10:00:00Z"),
      s2240("2026-05-01", "Excluído", [], "EXCLUIDO"),
    ]);
    expect(h.periodos).toHaveLength(1);
    expect(h.periodos[0]).toMatchObject({ setor: "Forno novo", fim: null });
  });

  it("lê os ASOs do S-2220", () => {
    const h = historicoDoPpp([
      {
        tipo: "S-2220",
        situacao: "PRONTO",
        createdAt: new Date(),
        xml: "<exMedOcup><tpExameOcup>1</tpExameOcup><aso><dtAso>2026-11-20</dtAso><resAso>1</resAso><medico><nmMed>Dra. Ana</nmMed><nrCRM>123</nrCRM><ufCRM>PR</ufCRM></medico></aso></exMedOcup>",
      },
    ]);
    expect(h.exames).toEqual([{ data: "2026-11-20", tipo: "Periódico", resultado: "Apto", medico: "Dra. Ana · CRM 123/PR", situacao: "PRONTO" }]);
  });

  it("sai em PDF", async () => {
    const pdf = await pdfDoPpp(historicoDoPpp([s2240("2026-01-10", "Balcão", ["02.01.006"])]), {
      empresa: "Panificadora",
      documentoDaEmpresa: null,
      colaborador: "Joana",
      cpf: null,
      pis: null,
      admissao: "2024-05-11",
      cargo: null,
      cbo: null,
      responsavelAmbiental: null,
      medicoDoPcmso: null,
    });
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-");
  });
});
