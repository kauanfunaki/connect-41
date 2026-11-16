import { describe, expect, it } from "vitest";
import { enderecoNovoDaVisaoDoCliente, hrefDaVisaoDaEquipe, hrefDaVisaoDoCliente, periodoDoPortal, visaoDaUrl } from "./visaoDaDre";

// "Visão: Equipe | Cliente" (16/11/2026, melhoria-718): o seletor na fileira
// dos filtros da DRE de caixa e da de competência.

describe("visaoDaUrl", () => {
  it("`como=cliente` abre a visão do cliente só para quem pode vê-la", () => {
    expect(visaoDaUrl("cliente", true)).toBe("cliente");
    expect(visaoDaUrl("cliente", false)).toBe("equipe");
    expect(visaoDaUrl(undefined, true)).toBe("equipe");
    expect(visaoDaUrl("outra-coisa", true)).toBe("equipe");
  });
});

describe("periodoDoPortal", () => {
  it("lê o mês com zero ou o ano inteiro, que vale no lugar do mês", () => {
    expect(periodoDoPortal("2026-09", undefined)).toEqual({ mes: "2026-09", ano: null });
    expect(periodoDoPortal("2026-09", "2026")).toEqual({ mes: null, ano: "2026" });
    expect(periodoDoPortal(undefined, undefined)).toEqual({ mes: null, ano: null });
  });

  it("o que não é mês nem ano fica de fora", () => {
    expect(periodoDoPortal("2026-9", "26")).toEqual({ mes: null, ano: null });
    expect(periodoDoPortal("2026-13", undefined)).toEqual({ mes: null, ano: null });
  });
});

describe("trocar de visão mantém a empresa e o período", () => {
  it("para o cliente: o mesmo mês ou o mesmo ano, na aba em que a pessoa está", () => {
    expect(hrefDaVisaoDoCliente("caixa", "emp1", { mes: "2026-09" })).toBe("/dre?empresa=emp1&como=cliente&mes=2026-09");
    expect(hrefDaVisaoDoCliente("caixa", "emp1", { ano: "2026" })).toBe("/dre?empresa=emp1&como=cliente&ano=2026");
    expect(hrefDaVisaoDoCliente("competencia", "emp1", { mes: "2026-09" })).toBe("/dre/economica?empresa=emp1&como=cliente&mes=2026-09");
    expect(hrefDaVisaoDoCliente("competencia", "emp1")).toBe("/dre/economica?empresa=emp1&como=cliente");
  });

  it("de volta para a equipe, no formato de cada tela", () => {
    // A DRE de caixa lê o mês sem o zero e o ano em `visao=ano`.
    expect(hrefDaVisaoDaEquipe("caixa", "emp1", { mes: "2026-09", ano: null })).toBe("/dre?empresa=emp1&mes=2026-9");
    expect(hrefDaVisaoDaEquipe("caixa", "emp1", { mes: null, ano: "2026" })).toBe("/dre?empresa=emp1&visao=ano&ano=2026");
    expect(hrefDaVisaoDaEquipe("caixa", "emp1")).toBe("/dre?empresa=emp1");
    expect(hrefDaVisaoDaEquipe("competencia", "emp1", { mes: "2026-09", ano: null })).toBe("/dre/economica?empresa=emp1&mes=2026-09");
    expect(hrefDaVisaoDaEquipe("competencia", "emp1")).toBe("/dre/economica?empresa=emp1");
  });

  it("o ano inteiro do cliente, na competência da equipe, é o acumulado até dezembro", () => {
    expect(hrefDaVisaoDaEquipe("competencia", "emp1", { mes: null, ano: "2026" })).toBe(
      "/dre/economica?empresa=emp1&mes=2026-12&visao=acumulado"
    );
  });
});

describe("enderecoNovoDaVisaoDoCliente", () => {
  it("o endereço antigo da competência do cliente vai para a aba Competência, com empresa e período", () => {
    expect(enderecoNovoDaVisaoDoCliente({ como: "cliente", regime: "competencia", empresa: "emp1", mes: "2026-09" }, true)).toBe(
      "/dre/economica?empresa=emp1&como=cliente&mes=2026-09"
    );
    expect(enderecoNovoDaVisaoDoCliente({ como: "cliente", regime: "competencia", empresa: "emp1", ano: "2026" }, true)).toBe(
      "/dre/economica?empresa=emp1&como=cliente&ano=2026"
    );
  });

  it("sem empresa no endereço, segue sem: a tela escolhe a da faixa", () => {
    expect(enderecoNovoDaVisaoDoCliente({ como: "cliente", regime: "competencia" }, true)).toBe("/dre/economica?como=cliente");
  });

  it("não mexe no que não é o endereço antigo", () => {
    expect(enderecoNovoDaVisaoDoCliente({ como: "cliente", empresa: "emp1" }, true)).toBeNull();
    expect(enderecoNovoDaVisaoDoCliente({ como: "cliente", regime: "caixa", empresa: "emp1" }, true)).toBeNull();
    expect(enderecoNovoDaVisaoDoCliente({ regime: "competencia", empresa: "emp1" }, true)).toBeNull();
  });

  it("sem a competência liberada para o cliente, fica no caixa, como no portal", () => {
    expect(enderecoNovoDaVisaoDoCliente({ como: "cliente", regime: "competencia", empresa: "emp1" }, false)).toBeNull();
  });
});
