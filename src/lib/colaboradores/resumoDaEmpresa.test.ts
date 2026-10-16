import { describe, expect, it } from "vitest";
import { diaDoRegistro, mesDeHoje, numerosDoResumo, resumoDaEmpresa, type PessoaDoResumo } from "./resumoDaEmpresa";

// 14/10/2026, meio da tarde em São Paulo.
const AGORA = new Date("2026-10-14T18:00:00.000Z");

function pessoa(parcial: Partial<PessoaDoResumo> = {}): PessoaDoResumo {
  return { employmentStatus: "ATIVO", active: true, admissionDate: null, dismissalDate: null, ...parcial };
}

/** Data do formulário: meia-noite UTC do dia. */
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("diaDoRegistro — o dia de uma data do cadastro", () => {
  it("data do formulário (meia-noite UTC) é o próprio dia", () => {
    expect(diaDoRegistro(dia("2026-10-31"))).toBe("2026-10-31");
    expect(diaDoRegistro(dia("2026-11-01"))).toBe("2026-11-01");
  });

  it("instante (desligamento finalizado) é lido no fuso de São Paulo", () => {
    // 31/10 às 22h em São Paulo = 01/11 01h UTC: ainda é outubro no escritório.
    expect(diaDoRegistro(new Date("2026-11-01T01:00:00.000Z"))).toBe("2026-10-31");
    // 01/11 às 09h em São Paulo.
    expect(diaDoRegistro(new Date("2026-11-01T12:00:00.000Z"))).toBe("2026-11-01");
  });
});

describe("mesDeHoje", () => {
  it("é o mês de São Paulo, não o do relógio UTC", () => {
    // 31/10 às 22h em São Paulo — em UTC já é novembro.
    expect(mesDeHoje(new Date("2026-11-01T01:00:00.000Z"))).toBe("2026-10");
    expect(mesDeHoje(AGORA)).toBe("2026-10");
  });
});

describe("resumoDaEmpresa — os números da faixa", () => {
  it("conta cada situação do vínculo, só com cadastro ativo", () => {
    const r = resumoDaEmpresa(
      [
        pessoa(),
        pessoa(),
        pessoa({ employmentStatus: "EM_FERIAS" }),
        pessoa({ employmentStatus: "AFASTADO" }),
        pessoa({ employmentStatus: "ADMISSAO_EM_ANDAMENTO" }),
        pessoa({ employmentStatus: "DESLIGADO" }),
        // Cadastro arquivado: não entra em situação nenhuma.
        pessoa({ active: false }),
        pessoa({ active: false, employmentStatus: "EM_FERIAS" }),
      ],
      AGORA
    );
    expect(r).toMatchObject({ mes: "2026-10", ativos: 2, emFerias: 1, afastados: 1, admissoesEmAndamento: 1 });
  });

  it("admissão no mês: do primeiro ao último dia, inclusive, e nada dos meses vizinhos", () => {
    const r = resumoDaEmpresa(
      [
        pessoa({ admissionDate: dia("2026-10-01") }),
        pessoa({ admissionDate: dia("2026-10-31"), employmentStatus: "ADMISSAO_EM_ANDAMENTO" }),
        pessoa({ admissionDate: dia("2026-09-30") }),
        pessoa({ admissionDate: dia("2026-11-01") }),
        pessoa({ admissionDate: dia("2025-10-14") }),
      ],
      AGORA
    );
    expect(r.admissoesNoMes).toBe(2);
    expect(r.admissoesEmAndamento).toBe(1);
  });

  it("admissão com o cadastro inativado não conta — não foi adiante", () => {
    expect(resumoDaEmpresa([pessoa({ active: false, admissionDate: dia("2026-10-05") })], AGORA).admissoesNoMes).toBe(0);
  });

  it("desligamento no mês conta mesmo com o cadastro arquivado", () => {
    const r = resumoDaEmpresa(
      [
        pessoa({ employmentStatus: "DESLIGADO", dismissalDate: dia("2026-10-10") }),
        pessoa({ employmentStatus: "DESLIGADO", active: false, dismissalDate: dia("2026-10-02") }),
        pessoa({ employmentStatus: "DESLIGADO", dismissalDate: dia("2026-09-30") }),
      ],
      AGORA
    );
    expect(r.desligamentosNoMes).toBe(2);
  });

  it("desligamento finalizado às 22h do último dia fica no mês do escritório", () => {
    const fimDeOutubro = new Date("2026-11-01T01:00:00.000Z"); // 31/10, 22h em São Paulo
    expect(resumoDaEmpresa([pessoa({ employmentStatus: "DESLIGADO", dismissalDate: fimDeOutubro })], AGORA).desligamentosNoMes).toBe(1);
    const novembro = new Date("2026-11-03T15:00:00.000Z");
    expect(resumoDaEmpresa([pessoa({ employmentStatus: "DESLIGADO", dismissalDate: novembro })], AGORA).desligamentosNoMes).toBe(0);
  });

  it("empresa sem ninguém: tudo zero", () => {
    expect(resumoDaEmpresa([], AGORA)).toEqual({
      mes: "2026-10",
      ativos: 0,
      emFerias: 0,
      afastados: 0,
      admissoesEmAndamento: 0,
      admissoesNoMes: 0,
      desligamentosNoMes: 0,
    });
  });
});

describe("numerosDoResumo — os cartões", () => {
  it("cinco cartões, na ordem do desenho, com o mês no rótulo", () => {
    const itens = numerosDoResumo({
      mes: "2026-10",
      ativos: 1234,
      emFerias: 1,
      afastados: 0,
      admissoesEmAndamento: 1,
      admissoesNoMes: 2,
      desligamentosNoMes: 1,
    });
    expect(itens.map((i) => i.rotulo)).toEqual(["Ativos", "Admissões em outubro", "Desligamentos em outubro", "Em férias", "Afastados"]);
    expect(itens[0]).toEqual({ rotulo: "Ativos", valor: "1.234" });
    expect(itens[1]).toMatchObject({ valor: "2", detalhe: "1 em andamento", tom: "text-success-fg" });
  });

  it("sem admissão no mês nem em andamento: sem cor e sem linha de apoio", () => {
    const itens = numerosDoResumo({
      mes: "2027-01",
      ativos: 3,
      emFerias: 0,
      afastados: 0,
      admissoesEmAndamento: 0,
      admissoesNoMes: 0,
      desligamentosNoMes: 0,
    });
    expect(itens[1]).toEqual({ rotulo: "Admissões em janeiro", valor: "0", tom: undefined, detalhe: undefined });
  });

  it("o mês por extenso e em minúscula, com acento — no meio da frase", () => {
    const zerado = { ativos: 0, emFerias: 0, afastados: 0, admissoesEmAndamento: 0, admissoesNoMes: 0, desligamentosNoMes: 0 };
    expect(numerosDoResumo({ ...zerado, mes: "2026-03" })[1].rotulo).toBe("Admissões em março");
    expect(numerosDoResumo({ ...zerado, mes: "2026-09" })[2].rotulo).toBe("Desligamentos em setembro");
  });
});
