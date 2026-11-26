import { describe, expect, it } from "vitest";
import { avisosDaTransferencia, lerTransferencia, periodoNaEmpresa } from "./transferencia";

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
    expect(mesma).toHaveLength(3);
    expect(mesma[0]).toContain("motivo 11");
    expect(mesma[1]).toContain("cada empresa calcula só os dias dela");
    const outra = avisosDaTransferencia({ nome: "A", cnpj: "48.291.730/0001-15" }, { nome: "B", cnpj: "11.222.333/0001-81" });
    expect(outra[3]).toContain("grupo econômico");
  });
});

describe("período de cada empresa no mês da transferência", () => {
  const p = { companyIdAtual: "B", admissao: "2024-05-11", desligamento: null };
  const passagens = [{ data: "2027-06-16", deCompanyId: "A", paraCompanyId: "B" }];

  it("a origem vai até a véspera e o destino começa no dia", () => {
    expect(periodoNaEmpresa(passagens, p, "A", 2027, 6)).toEqual({ admissao: "2024-05-11", desligamento: "2027-06-15", entrou: null, saiu: "2027-06-16" });
    expect(periodoNaEmpresa(passagens, p, "B", 2027, 6)).toEqual({ admissao: "2027-06-16", desligamento: null, entrou: "2027-06-16", saiu: null });
  });

  it("fora do mês da transferência, cada empresa tem o mês inteiro ou nada", () => {
    expect(periodoNaEmpresa(passagens, p, "A", 2027, 5)).toMatchObject({ desligamento: "2027-06-15", saiu: null });
    expect(periodoNaEmpresa(passagens, p, "A", 2027, 7)).toBeNull();
    expect(periodoNaEmpresa(passagens, p, "B", 2027, 5)).toBeNull();
    expect(periodoNaEmpresa(passagens, p, "B", 2027, 7)).toMatchObject({ admissao: "2027-06-16", entrou: null });
  });

  it("transferência no dia 1º: a origem não tem dia no mês", () => {
    const dia1 = [{ data: "2027-06-01", deCompanyId: "A", paraCompanyId: "B" }];
    expect(periodoNaEmpresa(dia1, p, "A", 2027, 6)).toBeNull();
    expect(periodoNaEmpresa(dia1, p, "B", 2027, 6)).toMatchObject({ admissao: "2027-06-01", entrou: "2027-06-01" });
  });

  it("sem transferência, vale o cadastro; desligado antes do fim do trecho, vale o desligamento", () => {
    expect(periodoNaEmpresa([], { companyIdAtual: "A", admissao: "2024-05-11", desligamento: "2027-06-20" }, "A", 2027, 6)).toEqual({ admissao: "2024-05-11", desligamento: "2027-06-20", entrou: null, saiu: null });
    expect(periodoNaEmpresa([], { companyIdAtual: "A", admissao: null, desligamento: null }, "B", 2027, 6)).toBeNull();
  });
});
