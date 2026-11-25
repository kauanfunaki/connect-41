import { describe, expect, it } from "vitest";
import { feriasNoMes, periodoSugerido, periodosAquisitivos } from "./periodosDeFerias";
import { calcularFerias } from "./ferias";
import { CONVENCAO_DA_CLT, calcularMes, type VinculoDoMotor } from "./mensal";
import { RUBRICAS_PADRAO, type PapelDaRubrica } from "./rubricas";
import { tabelasDaCompetencia } from "./tabelas";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("períodos aquisitivos (funcionalidade-745)", () => {
  it("12 meses a partir da admissão, concessivo nos 12 seguintes, e a situação de cada um", () => {
    const p = periodosAquisitivos(d("2024-03-10"), d("2026-11-25"), []);
    expect(p.map((x) => [x.inicio, x.fim, x.concessivoFim, x.situacao])).toEqual([
      ["2024-03-10", "2025-03-09", "2026-03-09", "EM_DOBRO"],
      ["2025-03-10", "2026-03-09", "2027-03-09", "A_GOZAR"],
      ["2026-03-10", "2027-03-09", "2028-03-09", "EM_AQUISICAO"],
    ]);
    expect(periodoSugerido(p)?.inicio).toBe("2024-03-10");
  });

  it("férias gravadas abatem o saldo; faltas reduzem o direito; o 1/3 pago fica somado", () => {
    const p = periodosAquisitivos(d("2024-03-10"), d("2026-11-25"), [
      { aquisitivoInicio: "2024-03-10", diasGozo: 20, diasAbono: 10, faltas: 0, terco: 400, tercoAbono: 200 },
      { aquisitivoInicio: "2025-03-10", diasGozo: 10, diasAbono: 0, faltas: 8, terco: 200, tercoAbono: 0 },
    ]);
    expect(p[0]).toMatchObject({ direito: 30, usados: 30, saldo: 0, tercoPago: 600, situacao: "QUITADO" });
    expect(p[1]).toMatchObject({ direito: 24, usados: 10, saldo: 14, situacao: "A_GOZAR" });
    expect(periodoSugerido(p)?.inicio).toBe("2025-03-10");
  });

  it("29/02 vira 28/02 nos anos que não são bissextos; desligado para no desligamento", () => {
    const p = periodosAquisitivos(d("2024-02-29"), d("2026-11-25"), [], d("2025-06-30"));
    expect(p.map((x) => x.inicio)).toEqual(["2024-02-29", "2025-02-28"]);
    expect(p[0].fim).toBe("2025-02-27");
  });
});

describe("a parte das férias em cada mês (funcionalidade-745)", () => {
  const f = { inicioGozo: d("2026-11-20"), diasGozo: 20, ferias: 2000, terco: 666.67, abono: 1000, tercoAbono: 333.33, inss: 230.21, irrf: 50 };

  it("gozo que passa para o mês seguinte divide férias, 1/3 e INSS pelos dias corridos", () => {
    const nov = feriasNoMes(f, 2026, 11)!;
    const dez = feriasNoMes(f, 2026, 12)!;
    // 20/11 a 09/12: 11 dias em novembro, 9 em dezembro.
    expect(nov).toMatchObject({ diasCorridos: 11, diasDeFerias: 11, primeiroMes: true, ferias: 1100, abono: 1000, irrfRetido: 50, periodo: "20/11 a 09/12" });
    expect(dez).toMatchObject({ diasCorridos: 9, diasDeFerias: 9, primeiroMes: false, ferias: 900, abono: 0, tercoAbono: 0, irrfRetido: 0 });
    // A soma das partes fecha com o recibo.
    expect(nov.terco + dez.terco).toBeCloseTo(666.67, 2);
    expect(nov.inssRetido + dez.inssRetido).toBeCloseTo(230.21, 2);
    expect(feriasNoMes(f, 2027, 1)).toBeNull();
    expect(feriasNoMes(f, 2026, 10)).toBeNull();
  });

  it("mês comercial: gozo até o fim de um mês de 31 dias conta os dias antes do início", () => {
    // 17/12 a 31/12 (15 dias): trabalha 16 dias, férias 14 no mês comercial.
    const r = feriasNoMes({ ...f, inicioGozo: d("2026-12-17"), diasGozo: 15 }, 2026, 12)!;
    expect(r.diasCorridos).toBe(15);
    expect(r.diasDeFerias).toBe(14);
    // Fevereiro inteiro de férias: nenhum dia de salário.
    expect(feriasNoMes({ ...f, inicioGozo: d("2027-02-01"), diasGozo: 28 }, 2027, 2)!.diasDeFerias).toBe(30);
  });
});

describe("férias na folha do mês (funcionalidade-745)", () => {
  const t = tabelasDaCompetencia("2026-11");
  if (!t.ok) throw new Error("tabelas");
  const porPapel = new Map(RUBRICAS_PADRAO.filter((r) => r.papel).map((r) => [r.papel as PapelDaRubrica, r]));
  const vinculo: VinculoDoMotor = { salarioBase: 3000, tipoSalario: "MENSAL", horasMensais: 220, dependentesIrrf: 0, filhosSalarioFamilia: 0, insalubridade: "NENHUM", periculosidade: false, valeTransporte: false, aprendiz: false };
  const base = {
    ano: 2026, mes: 11, admissao: d("2024-03-10"), desligamento: null, vinculo, eventos: [], rubricas: porPapel, tabelas: t.tabelas,
    convencao: CONVENCAO_DA_CLT, empresa: { patronalNoDas: false, ratAliquota: 2, fap: 1, terceirosAliquota: 5.8 }, diasUteis: 20, diasDeDescanso: 10,
  };
  const recibo = calcularFerias({ inicio: d("2026-11-03"), diasDeGozo: 20, diasDeAbono: 10, faltas: 0, vinculo, mediaVariaveis: 0, tabelas: t.tabelas });
  if (!recibo.ok) throw new Error(recibo.erro);
  const valor = (nome: string) => recibo.linhas.find((l) => l.nome === nome)?.valor ?? 0;
  const parte = feriasNoMes(
    { inicioGozo: d("2026-11-03"), diasGozo: 20, ferias: valor("Férias"), terco: valor("1/3 constitucional"), abono: valor("Abono pecuniário"), tercoAbono: valor("1/3 do abono"), inss: recibo.inss.valor, irrf: recibo.irrf.valor },
    2026,
    11
  )!;
  const sem = calcularMes(base);
  const com = calcularMes({ ...base, ferias: [parte] });
  const linha = (p: string) => com.itens.find((i) => i.papel === p);

  it("salário só dos dias fora das férias; férias e 1/3 no INSS e no FGTS, fora do IRRF", () => {
    // 03/11 a 22/11: trabalhou 2 dias antes e 8 depois (até o dia 30).
    expect(linha("SALARIO")!.valor).toBe(1000);
    expect(linha("SALARIO")!.memoria).toContain("20 dia(s) de férias");
    expect(linha("FERIAS_GOZADAS")!.valor).toBe(2000);
    expect(com.baseInss).toBe(1000 + 2000 + valor("1/3 constitucional"));
    expect(com.baseFgts).toBe(com.baseInss);
    expect(com.irrf.rendimentos).toBe(1000);
    expect(linha("ABONO_FERIAS")!.valor).toBe(valor("Abono pecuniário"));
  });

  it("o recibo já pagou: o líquido e o IRRF dele saem, e a pessoa só paga a diferença de INSS", () => {
    expect(linha("FERIAS_LIQUIDO_PAGO")!.valor).toBe(recibo.liquido);
    // Líquido da folha = salário dos dias − (INSS do mês − INSS do recibo) − IRRF do salário.
    const inssComplementar = Math.round((com.inss.valor - recibo.inss.valor) * 100) / 100;
    expect(com.liquido).toBeCloseTo(1000 - inssComplementar - com.irrf.valor, 2);
    // O INSS do mês é o da base inteira (salário + férias), maior que o do salário cheio sozinho.
    expect(com.inss.valor).toBeGreaterThan(sem.inss.valor);
  });

  it("provisões do mês não contam as férias gozadas", () => {
    expect(com.provisoes.ferias).toBe(Math.round((1000 / 12) * 100) / 100);
    expect(com.alertas.join(" ")).toContain("Férias no mês (03/11 a 22/11)");
  });
});
