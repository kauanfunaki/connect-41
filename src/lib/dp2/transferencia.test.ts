import { describe, expect, it } from "vitest";
import { avisosDaTransferencia, lerTransferencia } from "./transferencia";

const e = { personId: "p1", deCompanyId: "a", paraCompanyId: "b", data: "2027-07-01", motivo: "" };

describe("transferência entre empresas", () => {
  it("valida destino, data e situação", () => {
    expect(lerTransferencia(e, { admissao: "2024-05-11", desligamento: null })).toMatchObject({ ok: true, transferencia: { motivo: "Transferência entre empresas do grupo" } });
    expect(lerTransferencia({ ...e, paraCompanyId: "a" }, { admissao: null, desligamento: null })).toMatchObject({ ok: false, erro: expect.stringMatching(/mesma/) });
    expect(lerTransferencia({ ...e, data: "" }, { admissao: null, desligamento: null })).toMatchObject({ ok: false });
    expect(lerTransferencia(e, { admissao: "2027-08-01", desligamento: null })).toMatchObject({ ok: false, erro: expect.stringMatching(/admissão/) });
    expect(lerTransferencia(e, { admissao: null, desligamento: "2027-01-01" })).toMatchObject({ ok: false, erro: expect.stringMatching(/desligado/) });
  });

  it("avisa dos eventos do eSocial e da raiz de CNPJ diferente", () => {
    const mesma = avisosDaTransferencia({ nome: "A", cnpj: "48.291.730/0001-15" }, { nome: "B", cnpj: "48.291.730/0002-04" });
    expect(mesma).toHaveLength(2);
    expect(mesma[0]).toContain("motivo 11");
    const outra = avisosDaTransferencia({ nome: "A", cnpj: "48.291.730/0001-15" }, { nome: "B", cnpj: "11.222.333/0001-81" });
    expect(outra[2]).toContain("grupo econômico");
  });
});
