import { describe, expect, it } from "vitest";
import {
  absenteismo,
  diasUteisDosUltimos,
  feriasMensais,
  fimDoMes,
  funilDoPeriodo,
  horasExtrasMensais,
  mesesDaJanela,
  periodoDosMeses,
  quadroMensal,
  rotuloDoMes,
  tempoMedioDeContratacao,
  turnover,
  variacaoDoQuadro,
  type FeriasDoHistorico,
  type PessoaDoQuadro,
} from "./indicadoresRHMensal";
import { contarFerias } from "@/lib/home/paineis";

// 05/11/2026, meio-dia em São Paulo (uma quinta-feira).
const AGORA = new Date("2026-11-05T15:00:00.000Z");
/** Data do formulário: meia-noite UTC do dia. */
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function pessoa(p: Partial<PessoaDoQuadro> = {}): PessoaDoQuadro {
  return { admissionDate: null, dismissalDate: null, active: true, employmentStatus: "ATIVO", ...p };
}

describe("mesesDaJanela e rótulos", () => {
  it("termina no mês de hoje em São Paulo, do mais antigo ao atual", () => {
    expect(mesesDaJanela(AGORA, 6)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    // 31/10 às 22h em São Paulo: em UTC já é novembro, no escritório ainda é outubro.
    expect(mesesDaJanela(new Date("2026-11-01T01:00:00.000Z"), 2)).toEqual(["2026-09", "2026-10"]);
  });

  it("atravessa a virada do ano", () => {
    const meses = mesesDaJanela(AGORA, 12);
    expect(meses[0]).toBe("2025-12");
    expect(meses).toHaveLength(12);
    expect(meses.map(rotuloDoMes)).toEqual(["dez", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov"]);
  });

  it("período por extenso, com o ano só quando muda", () => {
    expect(periodoDosMeses(["2026-09", "2026-10", "2026-11"])).toBe("setembro a novembro");
    expect(periodoDosMeses(["2025-12", "2026-01"])).toBe("dezembro de 2025 a janeiro de 2026");
  });

  it("o fim do mês é o último instante em São Paulo", () => {
    expect(fimDoMes("2026-10").toISOString()).toBe("2026-11-01T02:59:59.999Z");
    expect(fimDoMes("2026-12").toISOString()).toBe("2027-01-01T02:59:59.999Z");
  });
});

describe("quadroMensal — headcount, admissões e desligamentos", () => {
  const meses = mesesDaJanela(AGORA, 6); // jun a nov

  it("o último ponto é o Headcount de hoje", () => {
    const q = quadroMensal(
      [
        pessoa(),
        pessoa({ employmentStatus: "EM_FERIAS" }),
        pessoa({ employmentStatus: "ADMISSAO_EM_ANDAMENTO", admissionDate: dia("2026-12-01") }),
        pessoa({ employmentStatus: "DESLIGADO", dismissalDate: dia("2026-08-10") }),
        pessoa({ active: false }),
      ],
      meses
    );
    expect(q[q.length - 1].headcount).toBe(3);
  });

  it("conta da admissão até o mês do desligamento, exclusive", () => {
    const q = quadroMensal(
      [
        pessoa({ admissionDate: dia("2026-07-15") }),
        pessoa({ employmentStatus: "DESLIGADO", active: false, admissionDate: dia("2026-06-01"), dismissalDate: dia("2026-09-30") }),
      ],
      meses
    );
    expect(q.map((m) => m.headcount)).toEqual([1, 2, 2, 1, 1, 1]);
    expect(q.map((m) => m.admissoes)).toEqual([1, 1, 0, 0, 0, 0]);
    expect(q.map((m) => m.desligamentos)).toEqual([0, 0, 0, 1, 0, 0]);
  });

  it("a linha só muda pelo que as colunas mostram", () => {
    const pessoas = [
      pessoa(),
      pessoa({ admissionDate: dia("2025-01-10") }),
      pessoa({ admissionDate: dia("2026-08-03") }),
      pessoa({ admissionDate: dia("2026-11-02") }),
      pessoa({ employmentStatus: "DESLIGADO", admissionDate: dia("2024-03-01"), dismissalDate: dia("2026-07-20") }),
      pessoa({ employmentStatus: "DESLIGADO", admissionDate: dia("2026-06-05"), dismissalDate: dia("2026-10-31") }),
    ];
    const q = quadroMensal(pessoas, meses);
    for (let i = 1; i < q.length; i++) {
      expect(q[i].headcount - q[i - 1].headcount).toBe(q[i].admissoes - q[i].desligamentos);
    }
  });

  it("desligamento finalizado às 22h do dia 31 conta em outubro, não em novembro", () => {
    const q = quadroMensal(
      [pessoa({ employmentStatus: "DESLIGADO", admissionDate: dia("2020-01-01"), dismissalDate: new Date("2026-11-01T01:00:00.000Z") })],
      meses
    );
    expect(q.find((m) => m.mes === "2026-10")?.desligamentos).toBe(1);
    expect(q.find((m) => m.mes === "2026-10")?.headcount).toBe(0);
  });

  it("quem saiu sem data de desligamento fica de fora", () => {
    const q = quadroMensal([pessoa({ employmentStatus: "DESLIGADO", admissionDate: dia("2026-06-01") }), pessoa({ active: false, admissionDate: dia("2026-07-01") })], meses);
    expect(q.every((m) => m.headcount === 0 && m.admissoes === 0)).toBe(true);
  });

  it("quem segue no quadro ignora a data de desligamento", () => {
    const q = quadroMensal([pessoa({ admissionDate: dia("2026-06-01"), dismissalDate: dia("2026-08-01") })], meses);
    expect(q.map((m) => m.headcount)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(q.every((m) => m.desligamentos === 0)).toBe(true);
  });

  it("variação e turnover", () => {
    const q = [
      { mes: "a", headcount: 10, admissoes: 0, desligamentos: 0 },
      { mes: "b", headcount: 10, admissoes: 1, desligamentos: 1 },
      { mes: "c", headcount: 12, admissoes: 2, desligamentos: 0 },
      { mes: "d", headcount: 12, admissoes: 1, desligamentos: 1 },
    ];
    expect(variacaoDoQuadro(q, 3)).toBe(2);
    expect(variacaoDoQuadro(q, 4)).toBeNull();
    // 2 saídas sobre o headcount médio de 11.
    expect(turnover(q)).toBeCloseTo((2 / 11) * 100, 6);
    expect(turnover([{ mes: "a", headcount: 0, admissoes: 0, desligamentos: 0 }])).toBeNull();
  });
});

describe("feriasMensais — vencidas e a vencer no fim de cada mês", () => {
  const meses = mesesDaJanela(AGORA, 6);
  const f = (p: Partial<FeriasDoHistorico>): FeriasDoHistorico => ({
    concessivePeriodEnd: null,
    status: "PLANEJADA",
    returnDate: null,
    updatedAt: dia("2026-01-01"),
    ...p,
  });

  it("o mês atual é o mesmo número de contarFerias hoje", () => {
    const ferias = [
      f({ concessivePeriodEnd: dia("2026-10-20") }),
      f({ concessivePeriodEnd: dia("2026-12-01") }),
      f({ concessivePeriodEnd: dia("2027-06-01") }),
      f({ concessivePeriodEnd: dia("2026-09-01"), status: "EM_GOZO" }),
    ];
    const r = feriasMensais(ferias, meses, AGORA);
    const hoje = contarFerias(ferias, AGORA);
    expect(r[r.length - 1]).toEqual({ mes: "2026-11", vencidas: hoje.vencidas, aVencer: hoje.aVencer });
  });

  it("em aberto vira vencida no mês em que o período concessivo acaba", () => {
    const r = feriasMensais([f({ concessivePeriodEnd: dia("2026-09-15") })], meses, AGORA);
    // Jun: vence em mais de 60 dias. Jul e ago: dentro dos 60 dias. Set em diante: vencida.
    expect(r.map((m) => [m.vencidas, m.aVencer])).toEqual([[0, 0], [0, 1], [0, 1], [1, 0], [1, 0], [1, 0]]);
  });

  it("concluída conta até a volta e cancelada não conta", () => {
    const r = feriasMensais(
      [
        f({ concessivePeriodEnd: dia("2026-07-10"), status: "CONCLUIDA", returnDate: dia("2026-09-20") }),
        f({ concessivePeriodEnd: dia("2026-07-10"), status: "CANCELADA" }),
      ],
      meses,
      AGORA
    );
    expect(r.map((m) => m.vencidas)).toEqual([0, 1, 1, 0, 0, 0]);
    expect(r[0].aVencer).toBe(1);
  });

  it("concluída sem volta lançada conta até a última alteração", () => {
    const r = feriasMensais([f({ concessivePeriodEnd: dia("2026-05-01"), status: "CONCLUIDA", updatedAt: dia("2026-08-05") })], meses, AGORA);
    expect(r.map((m) => m.vencidas)).toEqual([1, 1, 0, 0, 0, 0]);
  });
});

describe("horasExtrasMensais", () => {
  it("soma por mês e ignora o que está fora da janela", () => {
    const r = horasExtrasMensais(
      [
        { date: dia("2026-10-01"), horas: 2.5 },
        { date: dia("2026-10-31"), horas: 1.25 },
        { date: dia("2026-11-03"), horas: 3 },
        { date: dia("2026-04-03"), horas: 9 },
      ],
      ["2026-10", "2026-11"]
    );
    expect(r).toEqual([
      { mes: "2026-10", horas: 3.8 },
      { mes: "2026-11", horas: 3 },
    ]);
  });
});

describe("absenteísmo", () => {
  it("dias úteis dos últimos 30 dias, segunda a sexta", () => {
    // 07/10 (quarta) a 05/11 (quinta): 22 dias úteis.
    expect(diasUteisDosUltimos(AGORA, 30)).toBe(22);
    expect(diasUteisDosUltimos(new Date("2026-11-08T15:00:00.000Z"), 2)).toBe(0); // sábado e domingo
  });

  it("dias perdidos sobre headcount × dias úteis", () => {
    expect(absenteismo(11, 25, 22)).toBeCloseTo(2, 6);
    expect(absenteismo(3, 0, 22)).toBeNull();
  });
});

describe("funilDoPeriodo", () => {
  it("candidaturas → triadas → entrevista → proposta → contratados", () => {
    const etapas = funilDoPeriodo([
      { stage: "TRIAGEM", status: "EM_ANDAMENTO" },
      { stage: "TRIAGEM", status: "EM_ANDAMENTO" },
      { stage: "TRIAGEM", status: "REPROVADO" },
      { stage: "ENTREVISTA", status: "EM_ANDAMENTO" },
      { stage: "TESTE", status: "DESISTENTE" },
      { stage: "PROPOSTA", status: "EM_ANDAMENTO" },
      { stage: "CONTRATADO", status: "CONTRATADO" },
      // Contratada pelo status, com a etapa parada na triagem.
      { stage: "TRIAGEM", status: "CONTRATADO" },
    ]);
    expect(etapas.map((e) => [e.rotulo, e.valor])).toEqual([
      ["Candidaturas", 8],
      ["Triadas", 6],
      ["Entrevista", 5],
      ["Proposta", 3],
      ["Contratados", 2],
    ]);
  });

  it("nenhuma etapa passa da anterior", () => {
    const etapas = funilDoPeriodo([{ stage: "PROPOSTA", status: "REPROVADO" }, { stage: "TRIAGEM", status: "APROVADO" }]);
    for (let i = 1; i < etapas.length; i++) expect(etapas[i].valor).toBeLessThanOrEqual(etapas[i - 1].valor);
  });
});

describe("tempoMedioDeContratacao", () => {
  it("média em dias, sem as contratações sem data", () => {
    expect(
      tempoMedioDeContratacao([
        { createdAt: dia("2026-10-01"), hiredAt: dia("2026-10-11") },
        { createdAt: dia("2026-10-01"), hiredAt: dia("2026-10-21") },
        { createdAt: dia("2026-10-01"), hiredAt: null },
      ])
    ).toBe(15);
    expect(tempoMedioDeContratacao([])).toBeNull();
  });
});
