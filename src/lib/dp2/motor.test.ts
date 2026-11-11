import { describe, expect, it } from "vitest";
import { calcularInss, calcularIrrf } from "./impostos";
import { tabelaVigente, tabelasDaCompetencia, lerDadosDaTabela, type TabelaInss, type TabelaIrrf, type VersaoDaTabela } from "./tabelas";
import { diasDoMes, pascoa, feriadosNacionais } from "./calendario";
import { calcularMes, diasNoMes, CONVENCAO_DA_CLT, type VinculoDoMotor, type EmpresaDoMotor } from "./mensal";
import { calcularDecimo, avosNoAno } from "./decimo";
import { calcularFerias } from "./ferias";
import { calcularRescisaoDoDp2, inicioDoPeriodoAtual } from "./rescisao";
import { mediaDeVariaveis } from "./medias";
import { RUBRICAS_PADRAO, rubricasQueFaltam, type PapelDaRubrica, type RubricaDoMotor } from "./rubricas";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function tabelas(competencia: string) {
  const r = tabelasDaCompetencia(competencia);
  if (!r.ok) throw new Error(r.faltam.join(", "));
  return r.tabelas;
}

const INSS_2026 = tabelaVigente("INSS", "2026-03")!.dados as TabelaInss;
const IRRF_2026 = tabelaVigente("IRRF", "2026-03")!.dados as TabelaIrrf;
const IRRF_2025_06 = tabelaVigente("IRRF", "2025-06")!.dados as TabelaIrrf;

const rubricas = new Map<PapelDaRubrica, RubricaDoMotor>(RUBRICAS_PADRAO.filter((r) => r.papel).map((r) => [r.papel!, r]));
const rub = (p: PapelDaRubrica) => rubricas.get(p)!;

const vinculo = (extra: Partial<VinculoDoMotor> = {}): VinculoDoMotor => ({
  salarioBase: 3000,
  tipoSalario: "MENSAL",
  horasMensais: 220,
  dependentesIrrf: 0,
  filhosSalarioFamilia: 0,
  insalubridade: "NENHUM",
  periculosidade: false,
  valeTransporte: false,
  aprendiz: false,
  ...extra,
});

const empresa: EmpresaDoMotor = { patronalNoDas: false, ratAliquota: 2, fap: 1, terceirosAliquota: 5.8 };

describe("tabelas", () => {
  it("escolhe a vigência certa e não extrapola para trás", () => {
    expect(tabelaVigente("IRRF", "2025-03")!.vigencia).toBe("2025-01");
    expect(tabelaVigente("IRRF", "2025-06")!.vigencia).toBe("2025-05");
    expect(tabelaVigente("IRRF", "2026-11")!.vigencia).toBe("2026-01");
    expect(tabelaVigente("INSS", "2024-12")).toBeNull();
    const r = tabelasDaCompetencia("2024-12");
    expect(r.ok).toBe(false);
  });

  it("a tabela do escritório ganha na mesma vigência", () => {
    const minha: VersaoDaTabela = { tipo: "SALARIO_MINIMO", vigencia: "2026-01", origem: "ESCRITORIO", fundamento: "teste", dados: { valor: 1700 } };
    expect(tabelaVigente("SALARIO_MINIMO", "2026-05", [minha])!.dados).toEqual({ valor: 1700 });
    expect(tabelaVigente("SALARIO_MINIMO", "2025-05", [minha])!.dados).toEqual({ valor: 1518 });
  });

  it("recusa faixas fora de ordem e aceita uma tabela bem formada", () => {
    expect(lerDadosDaTabela("INSS", { faixas: [{ ate: 2000, aliquota: 9 }, { ate: 1000, aliquota: 7.5 }] }).ok).toBe(false);
    const ok = lerDadosDaTabela("INSS", { faixas: [{ ate: 1000, aliquota: 7.5 }, { ate: 2000, aliquota: 9 }] });
    expect(ok.ok).toBe(true);
    const irrf = lerDadosDaTabela("IRRF", {
      faixas: [{ ate: 2000, aliquota: 0, deducao: 0 }, { ate: 9999, aliquota: 27.5, deducao: 500 }],
      deducaoDependente: 189.59,
      descontoSimplificado: 607.2,
    });
    expect(irrf.ok && irrf.dados.faixas[1].ate).toBeNull();
  });
});

describe("INSS progressivo", () => {
  it("soma as faixas (2026)", () => {
    expect(calcularInss(3000, INSS_2026).valor).toBe(248.6);
    expect(calcularInss(1621, INSS_2026).valor).toBe(121.58);
  });

  it("para no teto", () => {
    const r = calcularInss(10000, INSS_2026);
    expect(r.valor).toBe(988.09);
    expect(r.baseLimitada).toBe(8475.55);
  });
});

describe("IRRF", () => {
  it("usa o simplificado quando ele deduz mais e aplica a redução de 2026 até R$ 5.000", () => {
    const r = calcularIrrf({ rendimentos: 4000, inss: 368.6, dependentes: 0, pensao: 0 }, IRRF_2026);
    expect(r.deducaoUsada).toBe("SIMPLIFICADO");
    expect(r.impostoDaTabela).toBe(114.76);
    expect(r.reducao).toBe(114.76);
    expect(r.valor).toBe(0);
  });

  it("redução parcial entre R$ 5.000 e R$ 7.350", () => {
    const r = calcularIrrf({ rendimentos: 6000, inss: 641.51, dependentes: 1, pensao: 0 }, IRRF_2026);
    expect(r.deducaoUsada).toBe("LEGAL");
    expect(r.impostoDaTabela).toBe(512.72);
    expect(r.reducao).toBe(179.75);
    expect(r.valor).toBe(332.97);
  });

  it("sem redução acima de R$ 7.350", () => {
    const r = calcularIrrf({ rendimentos: 8000, inss: 921.51, dependentes: 0, pensao: 0 }, IRRF_2026);
    expect(r.reducao).toBe(0);
    expect(r.valor).toBe(1037.85);
  });

  it("não retém abaixo de R$ 10 (tabela de 2025, sem redução)", () => {
    const r = calcularIrrf({ rendimentos: 3107.2, inss: 0, dependentes: 0, pensao: 0 }, IRRF_2025_06);
    expect(r.devido).toBe(5.34);
    expect(r.naoRetido).toBe(true);
    expect(r.valor).toBe(0);
  });
});

describe("calendário", () => {
  it("acha a Páscoa e a Sexta-feira Santa", () => {
    expect(pascoa(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(pascoa(2025).toISOString().slice(0, 10)).toBe("2025-04-20");
    expect(feriadosNacionais(2026)).toContain("2026-04-03");
  });

  it("conta dias úteis e de descanso", () => {
    expect(diasDoMes(2026, 3)).toMatchObject({ diasUteis: 26, diasDeDescanso: 5 });
    expect(diasDoMes(2026, 4)).toMatchObject({ diasUteis: 24, diasDeDescanso: 6 });
  });
});

describe("dias no mês", () => {
  it("mês cheio vale 30, fevereiro inclusive", () => {
    expect(diasNoMes(2026, 2, d("2020-01-01"), null)).toBe(30);
    expect(diasNoMes(2026, 3, null, null)).toBe(30);
  });
  it("proporcional na admissão e no desligamento", () => {
    expect(diasNoMes(2026, 3, d("2026-03-16"), null)).toBe(16);
    expect(diasNoMes(2026, 2, d("2026-02-15"), null)).toBe(14);
    expect(diasNoMes(2026, 3, d("2020-01-01"), d("2026-03-10"))).toBe(10);
    expect(diasNoMes(2026, 3, d("2026-04-01"), null)).toBe(0);
  });
});

describe("folha mensal", () => {
  const base = {
    ano: 2026,
    mes: 3,
    admissao: d("2024-01-02"),
    desligamento: null,
    rubricas,
    tabelas: tabelas("2026-03"),
    convencao: CONVENCAO_DA_CLT,
    empresa,
    diasUteis: 26,
    diasDeDescanso: 5,
  };

  it("salário com hora extra, DSR, INSS, FGTS, IRRF, encargos e provisões", () => {
    const c = calcularMes({ ...base, vinculo: vinculo(), eventos: [{ rubrica: rub("HE50"), quantidade: 10, valor: null }] });
    const porPapel = Object.fromEntries(c.itens.map((i) => [i.papel, i.valor]));
    expect(porPapel.SALARIO).toBe(3000);
    expect(porPapel.HE50).toBe(204.55);
    expect(porPapel.DSR).toBe(39.34);
    expect(c.baseInss).toBe(3243.89);
    expect(c.inss.valor).toBe(277.87);
    expect(c.fgts).toBe(259.51);
    expect(c.irrf.valor).toBe(0);
    expect(c.irrf.impostoDaTabela).toBe(15.59);
    expect(c.liquido).toBe(2966.02);
    expect(c.encargos).toMatchObject({ inssEmpresa: 648.78, rat: 64.88, terceiros: 188.15 });
    expect(c.provisoes).toMatchObject({ ferias: 270.32, tercoFerias: 90.11, decimo: 270.32 });
    expect(c.itens.find((i) => i.papel === "HE50")!.memoria).toContain("10 h");
  });

  it("proporcional na admissão, insalubridade sobre o mínimo e faltas", () => {
    const c = calcularMes({
      ...base,
      admissao: d("2026-03-16"),
      vinculo: vinculo({ insalubridade: "MEDIO" }),
      eventos: [{ rubrica: rub("FALTA"), quantidade: 2, valor: null }],
    });
    const porPapel = Object.fromEntries(c.itens.map((i) => [i.papel, i.valor]));
    expect(porPapel.SALARIO).toBe(1600);
    expect(porPapel.INSALUBRIDADE).toBe(172.91);
    expect(porPapel.FALTA).toBe(200);
    expect(c.baseInss).toBe(1572.91);
    expect(c.alertas.some((a) => a.includes("16 dias"))).toBe(true);
  });

  it("Simples com CPP no DAS: encargo é só o FGTS; salário-família abaixo do limite", () => {
    const c = calcularMes({
      ...base,
      vinculo: vinculo({ salarioBase: 1700, filhosSalarioFamilia: 2 }),
      empresa: { ...empresa, patronalNoDas: true },
      eventos: [],
    });
    expect(c.encargos.total).toBe(c.fgts);
    expect(c.itens.find((i) => i.papel === "SALARIO_FAMILIA")!.valor).toBe(135.08);
  });

  it("avisa salário abaixo do piso da convenção", () => {
    const c = calcularMes({ ...base, vinculo: vinculo({ salarioBase: 1700 }), convencao: { ...CONVENCAO_DA_CLT, piso: 1900, nome: "Comércio" }, eventos: [] });
    expect(c.alertas.some((a) => a.includes("piso"))).toBe(true);
  });
});

describe("13º salário", () => {
  it("avos contam meses com 15 dias ou mais", () => {
    expect(avosNoAno(2026, 12, d("2026-03-10"), null)).toBe(10);
    expect(avosNoAno(2026, 12, d("2026-03-20"), null)).toBe(9);
    expect(avosNoAno(2026, 11, d("2020-01-01"), null)).toBe(11);
  });

  const entrada = {
    ano: 2026,
    admissao: d("2026-03-10"),
    desligamento: null,
    vinculo: vinculo({ salarioBase: 3600 }),
    mediaVariaveis: 0,
    rubricas,
    tabelas: tabelas("2026-12"),
  };

  it("1ª parcela: metade, sem INSS e IRRF", () => {
    const c = calcularDecimo({ ...entrada, parcela: 1, mesDoPagamento: 11, primeiraParcelaPaga: 0 });
    expect(c.avos).toBe(9);
    expect(c.liquido).toBe(1350);
    expect(c.fgts).toBe(108);
    expect(c.inss).toBeNull();
  });

  it("2ª parcela: INSS e IRRF próprios, desconta a 1ª", () => {
    const c = calcularDecimo({ ...entrada, parcela: 2, mesDoPagamento: 12, primeiraParcelaPaga: 1500 });
    expect(c.integral).toBe(3000);
    expect(c.inss!.valor).toBe(248.6);
    expect(c.irrf!.valor).toBe(0);
    expect(c.fgts).toBe(120);
    expect(c.liquido).toBe(1251.4);
  });
});

describe("férias", () => {
  it("30 dias com 1/3, INSS e IRRF separados", () => {
    const c = calcularFerias({ inicio: d("2026-07-06"), diasDeGozo: 30, diasDeAbono: 0, faltas: 0, vinculo: vinculo(), mediaVariaveis: 0, tabelas: tabelas("2026-07") });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.proventos).toBe(4000);
    expect(c.inss.valor).toBe(368.6);
    expect(c.irrf.valor).toBe(0);
    expect(c.liquido).toBe(3631.4);
    expect(c.pagamentoAte.toISOString().slice(0, 10)).toBe("2026-07-04");
    expect(c.fim.toISOString().slice(0, 10)).toBe("2026-08-04");
  });

  it("abono isento e limites do direito", () => {
    const c = calcularFerias({ inicio: d("2026-07-06"), diasDeGozo: 20, diasDeAbono: 10, faltas: 0, vinculo: vinculo(), mediaVariaveis: 0, tabelas: tabelas("2026-07") });
    expect(c.ok && c.baseFgts).toBe(2666.67);
    expect(calcularFerias({ inicio: d("2026-07-06"), diasDeGozo: 25, diasDeAbono: 10, faltas: 0, vinculo: vinculo(), mediaVariaveis: 0, tabelas: tabelas("2026-07") }).ok).toBe(false);
    const comFaltas = calcularFerias({ inicio: d("2026-07-06"), diasDeGozo: 24, diasDeAbono: 0, faltas: 10, vinculo: vinculo(), mediaVariaveis: 0, tabelas: tabelas("2026-07") });
    expect(comFaltas.ok && comFaltas.direito).toBe(24);
  });
});

describe("rescisão", () => {
  it("INSS e IRRF só sobre saldo e 13º; FGTS também sobre o aviso indenizado", () => {
    const c = calcularRescisaoDoDp2({
      motivo: "DISPENSA_SEM_JUSTA_CAUSA",
      admissao: d("2025-01-02"),
      desligamento: d("2026-03-20"),
      avisoIndenizado: true,
      avisoDispensado: false,
      vinculo: vinculo(),
      mediaVariaveis: 0,
      periodosVencidos: 1,
      faltas: 0,
      saldoFgts: 3600,
      decimoAdiantado: 0,
      tabelas: tabelas("2026-03"),
    });
    const linha = (k: string) => c.linhas.find((l) => l.chave === k)!;
    expect(linha("saldo_salario").valor).toBe(2000);
    expect(c.inssMes.base).toBe(2000);
    const aviso = linha("aviso_previo").valor;
    expect(aviso).toBeGreaterThan(3000);
    const decimo = linha("decimo_terceiro").valor;
    expect(c.inssDecimo.base).toBe(decimo);
    expect(c.baseFgts).toBe(Math.round((2000 + decimo + aviso) * 100) / 100);
    expect(linha("ferias_vencidas").valor).toBe(3000);
    expect(c.multaFgts).toBe(1440);
    expect(c.liquido).toBe(Math.round((c.proventos - c.descontos) * 100) / 100);
  });

  it("período aquisitivo em curso parte do aniversário da admissão", () => {
    expect(inicioDoPeriodoAtual(d("2025-01-02"), d("2026-03-20")).toISOString().slice(0, 10)).toBe("2026-01-02");
    expect(inicioDoPeriodoAtual(d("2025-06-10"), d("2026-03-20")).toISOString().slice(0, 10)).toBe("2025-06-10");
  });
});

describe("média e rubricas", () => {
  it("média só das linhas que entram na média", () => {
    const m = mediaDeVariaveis([
      { competencia: "2026-01", itens: [{ valor: 3000, entraNaMedia: false, tipo: "PROVENTO" }, { valor: 300, entraNaMedia: true, tipo: "PROVENTO" }] },
      { competencia: "2026-02", itens: [{ valor: 100, entraNaMedia: true, tipo: "PROVENTO" }] },
    ]);
    expect(m.media).toBe(200);
    expect(m.meses).toBe(2);
  });

  it("semeia a lista inteira na primeira vez e só o que falta depois", () => {
    expect(rubricasQueFaltam([])).toHaveLength(RUBRICAS_PADRAO.length);
    const todas = RUBRICAS_PADRAO.map((r) => ({ codigo: r.codigo, papel: r.papel }));
    expect(rubricasQueFaltam(todas)).toHaveLength(0);
    expect(rubricasQueFaltam(todas.filter((r) => r.papel !== "HE100")).map((r) => r.papel)).toEqual(["HE100"]);
  });
});
