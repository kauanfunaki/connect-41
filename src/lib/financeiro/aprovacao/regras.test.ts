import { describe, expect, it } from "vitest";
import {
  entraEmAprovacao,
  statusInicialDeAprovacao,
  aprovacaoEmCurso,
  motivoDoBloqueioDeBaixa,
  podeEnviarParaAprovacao,
  podeDecidir,
  dentroDoTeto,
  validarMotivo,
  avisosPorAprovador,
  separarLote,
  lerTeto,
  type StatusDoLancamento,
} from "./regras";

describe("entraEmAprovacao", () => {
  const base = { kind: "PAGAR" as const, status: "CONFERIDO" as StatusDoLancamento, empresaTemAlcadaAtiva: true, moduloLigado: true };

  it("conta a pagar em aberto numa empresa com alçada entra", () => {
    expect(entraEmAprovacao(base)).toBe(true);
    expect(entraEmAprovacao({ ...base, status: "PROVISORIO" })).toBe(true);
    expect(statusInicialDeAprovacao(base)).toBe("AGUARDANDO");
  });

  it("o que já nasce pago não entra", () => {
    expect(entraEmAprovacao({ ...base, status: "PAGO" })).toBe(false);
    expect(statusInicialDeAprovacao({ ...base, status: "PAGO" })).toBe("NAO_REQUER");
  });

  it("conta a receber não entra", () => {
    expect(entraEmAprovacao({ ...base, kind: "RECEBER" })).toBe(false);
  });

  it("empresa sem alçada ativa não entra", () => {
    expect(entraEmAprovacao({ ...base, empresaTemAlcadaAtiva: false })).toBe(false);
  });

  it("módulo desligado não entra — ninguém conseguiria aprovar", () => {
    expect(entraEmAprovacao({ ...base, moduloLigado: false })).toBe(false);
  });

  it("cancelado não entra", () => {
    expect(entraEmAprovacao({ ...base, status: "CANCELADO" })).toBe(false);
  });
});

describe("bloqueio da baixa", () => {
  it("aguardando e reprovado bloqueiam, com motivo", () => {
    expect(motivoDoBloqueioDeBaixa({ approvalStatus: "AGUARDANDO" })).toMatch(/Aguardando aprovação/);
    expect(motivoDoBloqueioDeBaixa({ approvalStatus: "REPROVADO" })).toMatch(/reprovada/i);
  });

  it("aprovado e sem aprovação não bloqueiam", () => {
    expect(motivoDoBloqueioDeBaixa({ approvalStatus: "APROVADO" })).toBeNull();
    expect(motivoDoBloqueioDeBaixa({ approvalStatus: "NAO_REQUER" })).toBeNull();
  });

  it("cancelar encerra a aprovação em curso", () => {
    expect(aprovacaoEmCurso({ approvalStatus: "AGUARDANDO", status: "CONFERIDO" })).toBe(true);
    expect(aprovacaoEmCurso({ approvalStatus: "REPROVADO", status: "PROVISORIO" })).toBe(true);
    expect(aprovacaoEmCurso({ approvalStatus: "AGUARDANDO", status: "CANCELADO" })).toBe(false);
    expect(aprovacaoEmCurso({ approvalStatus: "APROVADO", status: "CONFERIDO" })).toBe(false);
  });
});

describe("podeEnviarParaAprovacao", () => {
  const conta = { kind: "PAGAR" as const, status: "CONFERIDO" as StatusDoLancamento, paidAt: null, approvalStatus: "NAO_REQUER" as const };

  it("envio manual de conta a pagar em aberto sem aprovação", () => {
    expect(podeEnviarParaAprovacao(conta).pode).toBe(true);
  });

  it("reenvio de reprovada", () => {
    expect(podeEnviarParaAprovacao({ ...conta, approvalStatus: "REPROVADO" }).pode).toBe(true);
  });

  it("recusa aguardando, aprovada, paga, cancelada e a receber", () => {
    expect(podeEnviarParaAprovacao({ ...conta, approvalStatus: "AGUARDANDO" }).pode).toBe(false);
    expect(podeEnviarParaAprovacao({ ...conta, approvalStatus: "APROVADO" }).pode).toBe(false);
    expect(podeEnviarParaAprovacao({ ...conta, status: "PAGO" }).pode).toBe(false);
    expect(podeEnviarParaAprovacao({ ...conta, paidAt: new Date() }).pode).toBe(false);
    expect(podeEnviarParaAprovacao({ ...conta, status: "CANCELADO" }).pode).toBe(false);
    expect(podeEnviarParaAprovacao({ ...conta, kind: "RECEBER" }).pode).toBe(false);
  });
});

describe("podeDecidir", () => {
  const conta = { status: "CONFERIDO" as StatusDoLancamento, approvalStatus: "AGUARDANDO" as const, valorCentavos: 500_000, createdById: "ana" };

  it("cliente com teto que cobre aprova; igual ao teto também", () => {
    expect(podeDecidir(conta, { tipo: "PORTAL", tetoCentavos: 1_000_000 }, "APROVAR").pode).toBe(true);
    expect(podeDecidir(conta, { tipo: "PORTAL", tetoCentavos: 500_000 }, "APROVAR").pode).toBe(true);
  });

  it("cliente acima do teto ou sem alçada não decide", () => {
    expect(podeDecidir(conta, { tipo: "PORTAL", tetoCentavos: 499_999 }, "APROVAR").pode).toBe(false);
    expect(podeDecidir(conta, { tipo: "PORTAL", tetoCentavos: null }, "APROVAR").pode).toBe(false);
    expect(podeDecidir(conta, { tipo: "PORTAL", tetoCentavos: 499_999 }, "REPROVAR", "valor errado").pode).toBe(false);
  });

  it("coordenação aprova sem teto", () => {
    expect(podeDecidir({ ...conta, valorCentavos: 99_999_999 }, { tipo: "EQUIPE", userId: "bia", gerenciaOSetor: true }, "APROVAR").pode).toBe(true);
  });

  it("quem não gerencia o setor não decide", () => {
    expect(podeDecidir(conta, { tipo: "EQUIPE", userId: "bia", gerenciaOSetor: false }, "APROVAR").pode).toBe(false);
  });

  it("segregação: quem criou não aprova nem reprova", () => {
    const r = podeDecidir(conta, { tipo: "EQUIPE", userId: "ana", gerenciaOSetor: true }, "APROVAR");
    expect(r).toEqual({ pode: false, motivo: expect.stringMatching(/Quem lançou/) });
    expect(podeDecidir(conta, { tipo: "EQUIPE", userId: "ana", gerenciaOSetor: true }, "REPROVAR", "motivo ok").pode).toBe(false);
  });

  it("sem criador conhecido, a coordenação decide", () => {
    expect(podeDecidir({ ...conta, createdById: null }, { tipo: "EQUIPE", userId: "ana", gerenciaOSetor: true }, "APROVAR").pode).toBe(true);
  });

  it("reprovar exige motivo", () => {
    const quem = { tipo: "PORTAL" as const, tetoCentavos: 1_000_000 };
    expect(podeDecidir(conta, quem, "REPROVAR").pode).toBe(false);
    expect(podeDecidir(conta, quem, "REPROVAR", "  ").pode).toBe(false);
    expect(podeDecidir(conta, quem, "REPROVAR", "Fornecedor não reconhecido").pode).toBe(true);
  });

  it("só decide o que está aguardando e não cancelado", () => {
    const quem = { tipo: "PORTAL" as const, tetoCentavos: 1_000_000 };
    expect(podeDecidir({ ...conta, approvalStatus: "APROVADO" }, quem, "APROVAR").pode).toBe(false);
    expect(podeDecidir({ ...conta, approvalStatus: "REPROVADO" }, quem, "APROVAR").pode).toBe(false);
    expect(podeDecidir({ ...conta, approvalStatus: "NAO_REQUER" }, quem, "APROVAR").pode).toBe(false);
    expect(podeDecidir({ ...conta, status: "CANCELADO" }, quem, "APROVAR").pode).toBe(false);
  });
});

describe("apoio", () => {
  it("dentroDoTeto", () => {
    expect(dentroDoTeto(null, 1)).toBe(false);
    expect(dentroDoTeto(100, 100)).toBe(true);
    expect(dentroDoTeto(100, 101)).toBe(false);
  });

  it("validarMotivo limpa e limita", () => {
    expect(validarMotivo("  duplicada ")).toEqual({ ok: true, motivo: "duplicada" });
    expect(validarMotivo("ok").ok).toBe(false);
    expect(validarMotivo("x".repeat(1_001)).ok).toBe(false);
  });

  it("lerTeto aceita formatos brasileiros", () => {
    expect(lerTeto("5.000,00")).toEqual({ ok: true, centavos: 500_000 });
    expect(lerTeto("R$ 1.234,5")).toEqual({ ok: true, centavos: 123_450 });
    expect(lerTeto("2500")).toEqual({ ok: true, centavos: 250_000 });
    expect(lerTeto("0").ok).toBe(false);
    expect(lerTeto("5.00").ok).toBe(false);
    expect(lerTeto("abc").ok).toBe(false);
    expect(lerTeto("-10").ok).toBe(false);
    expect(lerTeto("99999999999").ok).toBe(false);
  });
});

describe("avisosPorAprovador", () => {
  const alcadas = [
    { portalUserId: "joao", companyId: "A", tetoCentavos: 100_000, email: "j@x", nome: "João" },
    { portalUserId: "joao", companyId: "B", tetoCentavos: 1_000, email: "j@x", nome: "João" },
    { portalUserId: "maria", companyId: "A", tetoCentavos: 10_000, email: "m@x", nome: "Maria" },
  ];

  it("um aviso por aprovador, contando só o que o teto dele cobre na empresa dele", () => {
    const r = avisosPorAprovador(
      [
        { companyId: "A", valorCentavos: 5_000 },
        { companyId: "A", valorCentavos: 50_000 },
        { companyId: "B", valorCentavos: 500 },
        { companyId: "B", valorCentavos: 5_000 },
        { companyId: "C", valorCentavos: 1 },
      ],
      alcadas
    );
    expect(r.sort((a, b) => a.portalUserId.localeCompare(b.portalUserId))).toEqual([
      { portalUserId: "joao", email: "j@x", nome: "João", quantidade: 3 },
      { portalUserId: "maria", email: "m@x", nome: "Maria", quantidade: 1 },
    ]);
  });

  it("ninguém cobre: nenhum aviso", () => {
    expect(avisosPorAprovador([{ companyId: "A", valorCentavos: 10_000_000 }], alcadas)).toEqual([]);
  });
});

describe("separarLote", () => {
  it("aprova o que cabe e devolve o resto com motivo", () => {
    const contas = [
      { id: "1", companyId: "A", status: "CONFERIDO" as const, approvalStatus: "AGUARDANDO" as const, valorCentavos: 100 },
      { id: "2", companyId: "A", status: "CONFERIDO" as const, approvalStatus: "AGUARDANDO" as const, valorCentavos: 10_000 },
      { id: "3", companyId: "B", status: "CONFERIDO" as const, approvalStatus: "AGUARDANDO" as const, valorCentavos: 100 },
      { id: "4", companyId: "A", status: "CONFERIDO" as const, approvalStatus: "APROVADO" as const, valorCentavos: 100 },
    ];
    const r = separarLote(contas, new Map([["A", 5_000]]));
    expect(r.aprovaveis.map((c) => c.id)).toEqual(["1"]);
    expect(r.ignoradas.map((c) => c.id)).toEqual(["2", "3", "4"]);
    expect(r.ignoradas.every((c) => c.motivo.length > 0)).toBe(true);
  });
});
