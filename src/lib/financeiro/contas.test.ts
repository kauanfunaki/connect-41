import { describe, it, expect } from "vitest";
import {
  situacaoDaConta,
  emAberto,
  totalizar,
  ordenarContas,
  centavosDeDecimal,
  podeMarcarPago,
  podeConferir,
  type LinhaDeConta,
} from "./contas";

const HOJE = "2026-09-11";

function conta(over: Partial<LinhaDeConta> & { id: string }): LinhaDeConta {
  return {
    situacao: "A_VENCER",
    valorCentavos: 10_000,
    vencimentoKey: "2026-09-20",
    ...over,
  };
}

describe("situacaoDaConta", () => {
  const base = { status: "PROVISORIO" as const, dueDate: new Date(), paidAt: null };

  it("vencida quando o vencimento já passou", () => {
    expect(situacaoDaConta(base, HOJE, "2026-09-10")).toBe("VENCIDA");
  });

  it("vence hoje é situação própria — ainda dá para resolver", () => {
    expect(situacaoDaConta(base, HOJE, HOJE)).toBe("VENCE_HOJE");
  });

  it("a vencer quando ainda falta", () => {
    expect(situacaoDaConta(base, HOJE, "2026-09-12")).toBe("A_VENCER");
  });

  // Conta paga com atraso está paga. Mostrá-la como vencida faria a fila de
  // trabalho crescer com o que já foi resolvido.
  it("pago ganha de vencido", () => {
    const paga = { ...base, status: "PAGO" as const, paidAt: new Date("2026-09-15") };
    expect(situacaoDaConta(paga, HOJE, "2026-09-01")).toBe("PAGA");
  });

  it("paidAt preenchido basta, mesmo com status atrasado", () => {
    const paga = { ...base, status: "CONFERIDO" as const, paidAt: new Date("2026-09-09") };
    expect(situacaoDaConta(paga, HOJE, "2026-09-01")).toBe("PAGA");
  });

  it("cancelada ganha de tudo", () => {
    const cancelada = { ...base, status: "CANCELADO" as const, paidAt: new Date() };
    expect(situacaoDaConta(cancelada, HOJE, "2026-09-01")).toBe("CANCELADA");
  });

  it("em aberto é só o que ainda vai sair ou entrar", () => {
    expect(emAberto("VENCIDA")).toBe(true);
    expect(emAberto("VENCE_HOJE")).toBe(true);
    expect(emAberto("A_VENCER")).toBe(true);
    expect(emAberto("PAGA")).toBe(false);
    expect(emAberto("CANCELADA")).toBe(false);
  });
});

describe("totalizar", () => {
  it("soma cada situação separadamente e o aberto junto", () => {
    const t = totalizar([
      conta({ id: "1", situacao: "VENCIDA", valorCentavos: 5_000 }),
      conta({ id: "2", situacao: "VENCE_HOJE", valorCentavos: 2_500 }),
      conta({ id: "3", situacao: "A_VENCER", valorCentavos: 1_000 }),
      conta({ id: "4", situacao: "PAGA", valorCentavos: 9_999 }),
    ]);
    expect(t.vencido).toBe(5_000);
    expect(t.venceHoje).toBe(2_500);
    expect(t.aVencer).toBe(1_000);
    expect(t.pago).toBe(9_999);
    expect(t.emAberto).toBe(8_500);
  });

  // Cancelada é lançamento que deixou de existir para efeito de caixa. Somá-la
  // em "pago" inflaria o realizado do mês.
  it("cancelada não entra em nenhum total", () => {
    const t = totalizar([conta({ id: "1", situacao: "CANCELADA", valorCentavos: 100_000 })]);
    expect(t).toEqual({ vencido: 0, venceHoje: 0, aVencer: 0, pago: 0, emAberto: 0 });
  });

  it("lista vazia dá tudo zero, não indefinido", () => {
    expect(totalizar([]).emAberto).toBe(0);
  });
});

describe("ordenarContas", () => {
  it("vencido primeiro, depois hoje, depois a vencer, e o histórico no fim", () => {
    const fila = ordenarContas([
      conta({ id: "paga", situacao: "PAGA" }),
      conta({ id: "avencer", situacao: "A_VENCER" }),
      conta({ id: "hoje", situacao: "VENCE_HOJE" }),
      conta({ id: "cancelada", situacao: "CANCELADA" }),
      conta({ id: "vencida", situacao: "VENCIDA" }),
    ]);
    expect(fila.map((l) => l.id)).toEqual(["vencida", "hoje", "avencer", "paga", "cancelada"]);
  });

  it("dentro do vencido, o atrasado há mais tempo no topo", () => {
    const fila = ordenarContas([
      conta({ id: "ontem", situacao: "VENCIDA", vencimentoKey: "2026-09-10" }),
      conta({ id: "mes-passado", situacao: "VENCIDA", vencimentoKey: "2026-08-01" }),
    ]);
    expect(fila.map((l) => l.id)).toEqual(["mes-passado", "ontem"]);
  });

  it("dentro do a vencer, o que chega antes no topo", () => {
    const fila = ordenarContas([
      conta({ id: "longe", situacao: "A_VENCER", vencimentoKey: "2026-10-30" }),
      conta({ id: "perto", situacao: "A_VENCER", vencimentoKey: "2026-09-12" }),
    ]);
    expect(fila.map((l) => l.id)).toEqual(["perto", "longe"]);
  });

  it("não altera a lista recebida", () => {
    const original = [
      conta({ id: "a", situacao: "PAGA" }),
      conta({ id: "b", situacao: "VENCIDA" }),
    ];
    ordenarContas(original);
    expect(original.map((l) => l.id)).toEqual(["a", "b"]);
  });
});

describe("centavosDeDecimal", () => {
  // O Prisma devolve Decimal; somar isso como número é como se perde centavo.
  it("converte pela string, não por Number", () => {
    expect(centavosDeDecimal("1234.56")).toBe(123_456);
    expect(centavosDeDecimal("0.07")).toBe(7);
    expect(centavosDeDecimal("100")).toBe(10_000);
    expect(centavosDeDecimal("100.5")).toBe(10_050);
  });

  it("aceita negativo", () => {
    expect(centavosDeDecimal("-45.30")).toBe(-4_530);
  });

  // O caso clássico: 0,1 + 0,2 em float. Em centavos inteiros, fecha.
  it("soma de centavos não acumula erro", () => {
    const soma = centavosDeDecimal("0.10") + centavosDeDecimal("0.20");
    expect(soma).toBe(30);
  });
});

describe("podeMarcarPago", () => {
  const aberta = { status: "CONFERIDO" as const, paidAt: null };

  it("conta aberta com data de hoje pode", () => {
    expect(podeMarcarPago(aberta, HOJE, HOJE).pode).toBe(true);
  });

  it("data passada pode — baixa atrasada é comum", () => {
    expect(podeMarcarPago(aberta, "2026-09-01", HOJE).pode).toBe(true);
  });

  // Agendamento que se disfarça de pagamento faz o realizado do mês incluir
  // dinheiro que ainda não saiu.
  it("data futura é recusada", () => {
    const r = podeMarcarPago(aberta, "2026-09-30", HOJE);
    expect(r.pode).toBe(false);
    if (!r.pode) expect(r.motivo).toContain("agendamento");
  });

  // A data real do pagamento é o dado que a conciliação vai usar para casar
  // com o extrato — sobrescrevê-la em silêncio é perdê-la.
  it("já paga recusa, e manda desfazer antes", () => {
    const r = podeMarcarPago({ status: "PAGO", paidAt: new Date() }, HOJE, HOJE);
    expect(r.pode).toBe(false);
    if (!r.pode) expect(r.motivo).toContain("Desfaça");
  });

  it("paidAt preenchido basta para recusar, mesmo sem status PAGO", () => {
    expect(podeMarcarPago({ status: "CONFERIDO", paidAt: new Date() }, HOJE, HOJE).pode).toBe(false);
  });

  it("cancelada não volta a ser conta", () => {
    expect(podeMarcarPago({ status: "CANCELADO", paidAt: null }, HOJE, HOJE).pode).toBe(false);
  });
});

describe("podeConferir", () => {
  it("provisório é exatamente o que se confere", () => {
    expect(podeConferir({ status: "PROVISORIO" }).pode).toBe(true);
  });

  it("conferir de novo é ruído, não erro — recusa suave", () => {
    const r = podeConferir({ status: "CONFERIDO" });
    expect(r.pode).toBe(false);
    if (!r.pode) expect(r.motivo).toContain("Já estava");
  });

  it("pagar já implica ter conferido", () => {
    expect(podeConferir({ status: "PAGO" }).pode).toBe(false);
  });
});
