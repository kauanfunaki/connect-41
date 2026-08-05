import { describe, expect, it } from "vitest";
import { calcularRescisao, type RescisaoInput } from "./calculo";
import { CONFIG_PADRAO, type RescisaoConfig } from "./config";
import type { MotivoCanonico } from "./motivos";
import { RESCISAO_CHECK_KEYS } from "../rescisaoChecklist";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function input(over: Partial<RescisaoInput> = {}): RescisaoInput {
  return {
    motivo: "DISPENSA_SEM_JUSTA_CAUSA",
    admissao: d("2024-01-10"),
    desligamento: d("2026-08-20"),
    avisoIndenizado: true,
    avisoDispensado: false,
    salarioBase: 3000,
    feriasVencidas: [],
    inicioPeriodoAquisitivoAtual: d("2026-01-10"),
    faltasInjustificadas: 0,
    mediaVariaveis: null,
    saldoFgtsInformado: 10000,
    decimoTerceiroAdiantado: null,
    aprendiz: false,
    ...over,
  };
}

const cfg = (over: Partial<RescisaoConfig> = {}): RescisaoConfig => ({ ...CONFIG_PADRAO, ...over });

describe("matriz legal por motivo", () => {
  const casos: { motivo: MotivoCanonico; devidas: string[]; naoDevidas: string[] }[] = [
    {
      motivo: "DISPENSA_SEM_JUSTA_CAUSA",
      devidas: ["saldo_salario", "ferias_vencidas", "ferias_proporcionais", "decimo_terceiro", "aviso_previo", "fgts_multa"],
      naoDevidas: [],
    },
    {
      motivo: "PEDIDO_DEMISSAO",
      devidas: ["saldo_salario", "ferias_vencidas", "ferias_proporcionais", "decimo_terceiro"],
      naoDevidas: ["fgts_multa"],
    },
    {
      motivo: "DISPENSA_JUSTA_CAUSA",
      devidas: ["saldo_salario", "ferias_vencidas"],
      naoDevidas: ["ferias_proporcionais", "decimo_terceiro", "aviso_previo", "fgts_multa"],
    },
    {
      motivo: "ACORDO_MUTUO",
      devidas: ["saldo_salario", "ferias_vencidas", "ferias_proporcionais", "decimo_terceiro", "aviso_previo", "fgts_multa"],
      naoDevidas: [],
    },
    {
      motivo: "TERMINO_EXPERIENCIA",
      devidas: ["saldo_salario", "ferias_vencidas", "ferias_proporcionais", "decimo_terceiro"],
      naoDevidas: ["aviso_previo", "fgts_multa"],
    },
    {
      motivo: "RESCISAO_INDIRETA",
      devidas: ["saldo_salario", "ferias_proporcionais", "decimo_terceiro", "aviso_previo", "fgts_multa"],
      naoDevidas: [],
    },
  ];

  for (const caso of casos) {
    it(`${caso.motivo}: verbas devidas saem calculadas`, () => {
      const r = calcularRescisao(input({ motivo: caso.motivo }), cfg());
      for (const key of caso.devidas) {
        expect(r.verbas[key]!.situacao, `${key} deveria ser calculada em ${caso.motivo}`).toBe("CALCULADO");
      }
    });

    it(`${caso.motivo}: verbas não devidas saem NAO_DEVIDA com motivo`, () => {
      const r = calcularRescisao(input({ motivo: caso.motivo }), cfg());
      for (const key of caso.naoDevidas) {
        expect(r.verbas[key]!.situacao, `${key} não deveria ser devida em ${caso.motivo}`).toBe("NAO_DEVIDA");
        expect(r.verbas[key]!.motivo).toBeTruthy();
      }
    });
  }

  it("justa causa MANTÉM férias vencidas (erro comum na prática)", () => {
    const r = calcularRescisao(
      input({
        motivo: "DISPENSA_JUSTA_CAUSA",
        feriasVencidas: [{ inicio: d("2024-01-10"), fim: d("2025-01-09") }],
      }),
      cfg()
    );
    expect(r.verbas.ferias_vencidas!.situacao).toBe("CALCULADO");
    expect(r.verbas.ferias_vencidas!.valor).toBeGreaterThan(0);
  });

  it("pedido de demissão transforma aviso em DESCONTO (valor negativo)", () => {
    const r = calcularRescisao(input({ motivo: "PEDIDO_DEMISSAO", avisoIndenizado: false }), cfg());
    expect(r.verbas.aviso_previo!.situacao).toBe("CALCULADO");
    expect(r.verbas.aviso_previo!.valor).toBeLessThan(0);
    expect(r.totalDescontos).toBeGreaterThan(0);
  });

  it("acordo 484-A dá 20% de multa, não 40%", () => {
    const acordo = calcularRescisao(input({ motivo: "ACORDO_MUTUO" }), cfg());
    const dispensa = calcularRescisao(input({ motivo: "DISPENSA_SEM_JUSTA_CAUSA" }), cfg());
    expect(acordo.verbas.fgts_multa!.valor).toBe(2000); // 10000 × 20%
    expect(dispensa.verbas.fgts_multa!.valor).toBe(4000); // 10000 × 40%
  });

  it("acordo 484-A paga METADE do aviso", () => {
    const acordo = calcularRescisao(input({ motivo: "ACORDO_MUTUO" }), cfg());
    const dispensa = calcularRescisao(input({ motivo: "DISPENSA_SEM_JUSTA_CAUSA" }), cfg());
    expect(acordo.verbas.aviso_previo!.valor).toBeCloseTo(dispensa.verbas.aviso_previo!.valor! / 2, 2);
  });
});

describe("saldo de salário", () => {
  it("usa dias trabalhados no mês do desligamento", () => {
    const r = calcularRescisao(input({ desligamento: d("2026-08-20") }), cfg());
    // 3000 / 30 × 20 = 2000
    expect(r.verbas.saldo_salario!.valor).toBe(2000);
    expect(r.verbas.saldo_salario!.formula).toContain("20 dias");
  });

  it("NÃO usa a data projetada do aviso (só os avos usam)", () => {
    const comAviso = calcularRescisao(input({ avisoIndenizado: true }), cfg());
    const semAviso = calcularRescisao(input({ avisoIndenizado: false }), cfg());
    expect(comAviso.verbas.saldo_salario!.valor).toBe(semAviso.verbas.saldo_salario!.valor);
  });
});

describe("projeção do aviso indenizado nos avos", () => {
  it("aviso indenizado aumenta os avos de 13º", () => {
    // desligamento 20/12 → projeta pra janeiro do ano seguinte
    const comProjecao = calcularRescisao(
      input({ desligamento: d("2026-12-20"), avisoIndenizado: true, admissao: d("2020-01-01") }),
      cfg()
    );
    const semProjecao = calcularRescisao(
      input({ desligamento: d("2026-12-20"), avisoIndenizado: false, admissao: d("2020-01-01") }),
      cfg()
    );
    // sem projeção: 12 avos de 2026; com projeção: cai pro ano novo (1 avo)
    expect(semProjecao.verbas.decimo_terceiro!.formula).toContain("12/12");
    expect(comProjecao.verbas.decimo_terceiro!.formula).toContain("1/12");
  });

  it("registra a premissa da projeção", () => {
    const r = calcularRescisao(input({ avisoIndenizado: true }), cfg());
    expect(r.verbas.decimo_terceiro!.premissas.some((p) => p.includes("projetada"))).toBe(true);
  });
});

describe("1/3 constitucional", () => {
  it("incide sobre vencidas + proporcionais", () => {
    const r = calcularRescisao(
      input({ feriasVencidas: [{ inicio: d("2024-01-10"), fim: d("2025-01-09") }] }),
      cfg()
    );
    const vencidas = r.verbas.ferias_vencidas!.valor!;
    const prop = r.verbas.ferias_proporcionais!.valor!;
    expect(r.verbas.terco_constitucional!.valor).toBeCloseTo((vencidas + prop) / 3, 1);
  });

  it("config de 1/3 embutido marca como não devido separadamente", () => {
    const r = calcularRescisao(input(), cfg({ tercoApresentadoSeparado: false }));
    expect(r.verbas.terco_constitucional!.situacao).toBe("NAO_DEVIDA");
    expect(r.verbas.terco_constitucional!.motivo).toContain("embutido");
  });
});

describe("faltas injustificadas (art. 130)", () => {
  it("reduz os dias de férias vencidas", () => {
    const semFaltas = calcularRescisao(
      input({ faltasInjustificadas: 0, feriasVencidas: [{ inicio: d("2024-01-10"), fim: d("2025-01-09") }] }),
      cfg()
    );
    const comFaltas = calcularRescisao(
      input({ faltasInjustificadas: 20, feriasVencidas: [{ inicio: d("2024-01-10"), fim: d("2025-01-09") }] }),
      cfg()
    );
    // 0 faltas → 30 dias; 20 faltas → 18 dias
    expect(semFaltas.verbas.ferias_vencidas!.valor).toBe(3000);
    expect(comFaltas.verbas.ferias_vencidas!.valor).toBe(1800);
  });

  it("dado ausente assume 0 E registra a premissa", () => {
    const r = calcularRescisao(
      input({ faltasInjustificadas: null, feriasVencidas: [{ inicio: d("2024-01-10"), fim: d("2025-01-09") }] }),
      cfg()
    );
    expect(r.verbas.ferias_vencidas!.premissas.some((p) => p.includes("assumido 0"))).toBe(true);
  });
});

describe("insumos ausentes — nunca devolve zero silencioso", () => {
  it("sem salário base, verbas viram NAO_CALCULAVEL", () => {
    const r = calcularRescisao(input({ salarioBase: null }), cfg());
    expect(r.verbas.saldo_salario!.situacao).toBe("NAO_CALCULAVEL");
    expect(r.verbas.saldo_salario!.valor).toBeNull();
    expect(r.inputsFaltantes.some((i) => i.includes("Salário"))).toBe(true);
  });

  it("sem saldo FGTS, a multa não é chutada e o insumo é pedido", () => {
    const r = calcularRescisao(input({ saldoFgtsInformado: null }), cfg());
    expect(r.verbas.fgts_multa!.situacao).toBe("NAO_CALCULAVEL");
    expect(r.inputsFaltantes.some((i) => i.includes("FGTS"))).toBe(true);
  });

  it("sem período aquisitivo, férias proporcionais pedem o cadastro", () => {
    const r = calcularRescisao(input({ inicioPeriodoAquisitivoAtual: null }), cfg());
    expect(r.verbas.ferias_proporcionais!.situacao).toBe("NAO_CALCULAVEL");
    expect(r.inputsFaltantes.some((i) => i.includes("Férias"))).toBe(true);
  });

  it("INSS/IRRF sempre NAO_CALCULAVEL com motivo didático", () => {
    const r = calcularRescisao(input(), cfg());
    expect(r.verbas.inss_irrf!.situacao).toBe("NAO_CALCULAVEL");
    expect(r.verbas.inss_irrf!.motivo).toContain("portaria anual");
  });
});

describe("verba desabilitada na config", () => {
  it("não some da tela — mantém o valor que teria sido calculado", () => {
    const r = calcularRescisao(input(), cfg({ verbasDesabilitadas: ["fgts_multa"] }));
    expect(r.verbas.fgts_multa!.situacao).toBe("DESABILITADA_CONFIG");
    expect(r.verbas.fgts_multa!.valor).toBe(4000); // valor preservado
    expect(r.verbas.fgts_multa!.motivo).toContain("configuração");
  });

  it("verba desabilitada não entra nos totais", () => {
    const normal = calcularRescisao(input(), cfg());
    const desabilitada = calcularRescisao(input(), cfg({ verbasDesabilitadas: ["fgts_multa"] }));
    expect(desabilitada.totalProventos).toBeLessThan(normal.totalProventos);
  });
});

describe("adicionais configuráveis", () => {
  it("periculosidade 30% entra na base", () => {
    const sem = calcularRescisao(input({ desligamento: d("2026-08-30") }), cfg());
    const com = calcularRescisao(input({ desligamento: d("2026-08-30") }), cfg({ periculosidadeAplica: true }));
    expect(com.verbas.saldo_salario!.valor).toBeGreaterThan(sem.verbas.saldo_salario!.valor!);
    expect(com.verbas.saldo_salario!.premissas.join()).toContain("periculosidade");
  });

  it("insalubridade usa o salário mínimo do ano do desligamento", () => {
    const r = calcularRescisao(
      input({ desligamento: d("2026-08-30") }),
      cfg({ insalubridadeGrau: "MEDIO" })
    );
    // 20% de 1621 (mínimo 2026) = 324,20
    expect(r.verbas.saldo_salario!.premissas.join()).toContain("324.20");
  });

  it("ano fora da tabela de salário mínimo não extrapola — avisa na premissa", () => {
    const r = calcularRescisao(
      input({ desligamento: d("2035-08-30"), admissao: d("2030-01-01"), inicioPeriodoAquisitivoAtual: d("2035-01-01") }),
      cfg({ insalubridadeGrau: "MEDIO" })
    );
    expect(r.verbas.saldo_salario!.premissas.join()).toContain("base indisponível");
    expect(r.verbas.saldo_salario!.confianca).not.toBe("ALTA");
  });
});

describe("aprendiz", () => {
  it("FGTS do aprendiz é 2%, não 8%", () => {
    const normal = calcularRescisao(input({ desligamento: d("2026-08-30") }), cfg());
    const aprendiz = calcularRescisao(input({ desligamento: d("2026-08-30"), aprendiz: true }), cfg());
    expect(aprendiz.verbas.fgts_deposito!.valor).toBeCloseTo(normal.verbas.fgts_deposito!.valor! / 4, 2);
  });
});

describe("invariantes de explicabilidade", () => {
  const cenarios: MotivoCanonico[] = [
    "DISPENSA_SEM_JUSTA_CAUSA",
    "PEDIDO_DEMISSAO",
    "DISPENSA_JUSTA_CAUSA",
    "ACORDO_MUTUO",
    "TERMINO_PRAZO_DETERMINADO",
    "TERMINO_EXPERIENCIA",
    "RESCISAO_INDIRETA",
  ];

  it("toda verba CALCULADO tem fórmula não vazia", () => {
    for (const motivo of cenarios) {
      const r = calcularRescisao(input({ motivo }), cfg());
      for (const v of Object.values(r.verbas)) {
        if (v.situacao === "CALCULADO") {
          expect(v.formula, `${motivo}/${v.itemKey} sem fórmula`).toBeTruthy();
        }
      }
    }
  });

  it("toda verba não calculada tem motivo não vazio", () => {
    for (const motivo of cenarios) {
      const r = calcularRescisao(input({ motivo }), cfg());
      for (const v of Object.values(r.verbas)) {
        if (v.situacao !== "CALCULADO") {
          expect(v.motivo, `${motivo}/${v.itemKey} sem motivo`).toBeTruthy();
        }
      }
    }
  });

  it("todo itemKey do resultado existe no checklist (trava a integração)", () => {
    const r = calcularRescisao(input(), cfg());
    for (const key of Object.keys(r.verbas)) {
      expect(RESCISAO_CHECK_KEYS, `${key} não existe no checklist`).toContain(key);
    }
  });
});
