import { describe, expect, it } from "vitest";
import {
  camposDaMudanca,
  contasDaquiEmDiante,
  inferirSerieAntiga,
  lerMudancaDaSerie,
  vencimentoNaSerieAntiga,
  type ContaDaSerie,
} from "./mudancaDaSerie";
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

// O dia novo na série antiga, sem regra (22/10/2026): a frequência e o ajuste
// saem das contas da série; o mês é o que cada conta já tem, salvo o ajuste
// do fim de semana que a empurrou para o mês vizinho.
describe("inferirSerieAntiga e vencimentoNaSerieAntiga", () => {
  const c = (indice: number, vencimentoKey: string, competencia: string | null = vencimentoKey.slice(0, 7)) => ({ indice, vencimentoKey, competencia });
  // Dia 31, adiando: 31/10/2026 é sábado e foi para segunda, 02/11.
  const dia31 = [c(1, "2026-08-31"), c(2, "2026-09-30"), c(3, "2026-11-02", "2026-10"), c(4, "2026-11-30"), c(5, "2026-12-31")];

  it("mensal que adia: o 02/11 é o outubro empurrado pelo sábado", () => {
    const r = inferirSerieAntiga(dia31);
    expect(r).toEqual({ ok: true, frequencia: "MENSAL", ajuste: "ADIAR", deslocamento: 0 });
    if (!r.ok) return;
    expect(vencimentoNaSerieAntiga(dia31[2]!, r, 15)).toBe("2026-10-15");
    // Dia 10 de outubro é sábado: adia, e o feriado de 12/10 empurra mais um.
    expect(vencimentoNaSerieAntiga(dia31[2]!, r, 10, new Set(["2026-10-12"]))).toBe("2026-10-13");
    // No mês sem o dia, o último.
    expect(vencimentoNaSerieAntiga(dia31[3]!, r, 31)).toBe("2026-11-30");
  });

  it("conta num fim de semana: a série mantém a data", () => {
    const serie = [c(1, "2026-09-10"), c(2, "2026-10-10"), c(3, "2026-11-10")];
    const r = inferirSerieAntiga(serie);
    expect(r).toMatchObject({ ok: true, frequencia: "MENSAL", ajuste: "MANTER" });
    if (r.ok) expect(vencimentoNaSerieAntiga(serie[2]!, r, 15)).toBe("2026-11-15"); // domingo, mantido
  });

  it("contas antes do dia de sempre: a série antecipa", () => {
    const r = inferirSerieAntiga([c(1, "2026-09-10"), c(2, "2026-10-09"), c(3, "2026-11-10"), c(4, "2026-12-10"), c(5, "2027-01-08", "2027-01")]);
    expect(r).toMatchObject({ ok: true, ajuste: "ANTECIPAR" });
  });

  it("anual, e a mensal com uma conta mudada à mão", () => {
    expect(inferirSerieAntiga([c(1, "2024-03-05"), c(2, "2025-03-05"), c(3, "2026-03-05")])).toMatchObject({ ok: true, frequencia: "ANUAL" });
    expect(inferirSerieAntiga([c(1, "2026-09-10"), c(2, "2026-10-26"), c(3, "2026-11-10"), c(4, "2026-12-10")])).toMatchObject({ ok: true, frequencia: "MENSAL" });
  });

  it("semanal, quinzenal e diária seguem sem dia do mês; uma conta só não diz nada", () => {
    expect(inferirSerieAntiga([c(1, "2026-10-05"), c(2, "2026-10-12"), c(3, "2026-10-19")])).toEqual({ ok: false, motivo: "sem_dia_do_mes" });
    expect(inferirSerieAntiga([c(1, "2026-10-01"), c(2, "2026-10-16"), c(3, "2026-10-31")])).toEqual({ ok: false, motivo: "sem_dia_do_mes" });
    expect(inferirSerieAntiga([c(1, "2026-10-05")])).toEqual({ ok: false, motivo: "poucas" });
  });

  it("sem competência legível, o mês é o do vencimento", () => {
    const serie = [c(1, "2026-08-10", null), c(2, "2026-09-10", null), c(3, "2026-11-02", null), c(4, "2026-11-10", null)];
    const r = inferirSerieAntiga(serie);
    expect(r).toMatchObject({ ok: true, deslocamento: null });
    if (r.ok) expect(vencimentoNaSerieAntiga(serie[2]!, r, 20)).toBe("2026-11-20");
  });
});
