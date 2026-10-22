import { describe, expect, it } from "vitest";
import { camposDaMudanca, contasDaquiEmDiante, lerMudancaDaSerie, type ContaDaSerie } from "./mudancaDaSerie";
import { travasDaEdicao, type ContaParaEditar } from "./edicao";

// Mudar a série daqui em diante (22/10/2026): só desta posição em diante, só
// as em aberto e sem trava no que foi pedido; o resto fica, com o porquê.

const BASE: ContaParaEditar = {
  status: "CONFERIDO",
  paidAt: null,
  closeReason: null,
  fiscalDocumentId: null,
  agreementId: null,
  doOmie: false,
  conciliada: false,
};

function conta(indice: number, p: Partial<ContaParaEditar> & { pagoCentavos?: number; rateada?: boolean } = {}): ContaDaSerie {
  const { pagoCentavos = 0, rateada = false, ...edicao } = p;
  const c = { ...BASE, ...edicao };
  return { id: `e${indice}`, indice, status: c.status, paidAt: c.paidAt, pagoCentavos, edicao: travasDaEdicao(c), rateada };
}

describe("lerMudancaDaSerie", () => {
  it("em branco é manter; lê valor, categoria, descrição e dia", () => {
    expect(lerMudancaDaSerie({ valor: "1.650,00", categoryId: "", descricao: "  Aluguel   reajustado ", dia: "15" })).toEqual({
      ok: true,
      mudanca: { centavos: 165000, descricao: "Aluguel reajustado", dia: 15 },
    });
    expect(lerMudancaDaSerie({ valor: "", categoryId: "cat", descricao: "", dia: "" })).toEqual({ ok: true, mudanca: { categoriaId: "cat" } });
  });

  it("recusa nada pedido, valor ilegível ou zero e dia fora do mês", () => {
    expect(lerMudancaDaSerie({ valor: "", categoryId: "", descricao: "", dia: "" })).toMatchObject({ ok: false });
    expect(lerMudancaDaSerie({ valor: "abc", categoryId: "", descricao: "", dia: "" })).toMatchObject({ ok: false });
    expect(lerMudancaDaSerie({ valor: "0,00", categoryId: "", descricao: "", dia: "" })).toMatchObject({ ok: false });
    expect(lerMudancaDaSerie({ valor: "", categoryId: "", descricao: "", dia: "32" })).toMatchObject({ ok: false });
    expect(lerMudancaDaSerie({ valor: "", categoryId: "", descricao: "", dia: "1.5" })).toMatchObject({ ok: false });
  });

  it("os campos da mudança no vocabulário das travas", () => {
    expect(camposDaMudanca({ centavos: 1, dia: 3 })).toEqual(["valor", "vencimento"]);
  });
});

describe("contasDaquiEmDiante", () => {
  it("as anteriores e as canceladas não entram; a paga e a com baixa ficam com o porquê", () => {
    const r = contasDaquiEmDiante(
      [conta(1), conta(2), conta(3, { status: "PAGO", paidAt: new Date() }), conta(4, { status: "CANCELADO" }), conta(5, { pagoCentavos: 100 }), conta(6)],
      2,
      ["valor"]
    );
    expect(r.mudam.map((c) => c.indice)).toEqual([2, 6]);
    expect(r.ficam).toEqual([
      { id: "e3", indice: 3, motivo: expect.stringContaining("Paga") },
      { id: "e5", indice: 5, motivo: expect.stringContaining("baixa parcial") },
    ]);
  });

  it("a conciliada fica de fora para o valor, mas muda a descrição", () => {
    const contas = [conta(1, { conciliada: true })];
    expect(contasDaquiEmDiante(contas, 1, ["valor"]).mudam).toHaveLength(0);
    expect(contasDaquiEmDiante(contas, 1, ["descricao"]).mudam).toHaveLength(1);
  });

  it("a do Omie antes da virada fica de fora com o motivo da edição", () => {
    const r = contasDaquiEmDiante([conta(1, { doOmie: true })], 1, ["categoria"]);
    expect(r.ficam[0]!.motivo).toContain("Omie");
  });

  it("a rateada não muda valor nem categoria, mas muda a descrição e o dia", () => {
    const contas = [conta(1, { rateada: true })];
    expect(contasDaquiEmDiante(contas, 1, ["categoria"]).ficam[0]!.motivo).toContain("rateio");
    expect(contasDaquiEmDiante(contas, 1, ["descricao", "vencimento"]).mudam).toHaveLength(1);
  });

  it("a renegociada fica de fora", () => {
    const r = contasDaquiEmDiante([conta(1, { closeReason: "RENEGOCIADO" })], 1, ["descricao"]);
    expect(r.ficam[0]!.motivo).toContain("renegociada");
  });
});
