import { describe, expect, it } from "vitest";
import { lerRubricasFixas, MARCA_DA_FIXA, MAXIMO_DE_RUBRICAS_FIXAS, separarFixasDoMes, vigenteEm } from "./rubricasFixas";
import { CONVENCAO_DA_CLT, calcularMes, type EventoDoMotor } from "./mensal";
import { RUBRICAS_PADRAO, type PapelDaRubrica, type RubricaDoMotor } from "./rubricas";
import { tabelasDaCompetencia } from "./tabelas";
import { regraDeLancamento } from "./rubricas";

const rubricas = [
  { id: "sal", nome: "Salário", papel: "SALARIO", tipo: "PROVENTO", lancamento: "VALOR", ativa: true },
  { id: "he", nome: "Horas extras 50%", papel: "HE50", tipo: "PROVENTO", lancamento: "HORAS", ativa: true },
  { id: "grat", nome: "Gratificação", papel: null, tipo: "PROVENTO", lancamento: "VALOR", ativa: true },
  { id: "plano", nome: "Plano de saúde", papel: null, tipo: "DESCONTO", lancamento: "VALOR", ativa: true },
  { id: "velha", nome: "Rubrica inativa", papel: null, tipo: "PROVENTO", lancamento: "VALOR", ativa: false },
];
const ler = (linhas: unknown[]) => lerRubricasFixas(JSON.stringify(linhas), rubricas);

describe("rubricas fixas do contrato (funcionalidade-767)", () => {
  it("nenhuma rubrica fixa é válido; linha toda vazia é ignorada", () => {
    expect(lerRubricasFixas("", rubricas)).toEqual({ ok: true, fixas: [] });
    expect(ler([])).toEqual({ ok: true, fixas: [] });
    expect(ler([{ rubricaId: "", quantidade: "", valor: "", inicio: "2026-11" }])).toEqual({ ok: true, fixas: [] });
  });

  it("várias por pessoa: valor nas de valor e horas nas de horas", () => {
    const r = ler([
      { rubricaId: "grat", valor: "350,00", inicio: "2026-11", fim: "", observacao: "Gratificação de função" },
      { rubricaId: "plano", valor: "189,90", inicio: "2026-11", fim: "2027-10" },
      { rubricaId: "he", quantidade: "10,5", inicio: "2026-12" },
    ]);
    expect(r).toEqual({
      ok: true,
      fixas: [
        { rubricaId: "grat", quantidade: null, valor: 350, inicio: "2026-11", fim: null, observacao: "Gratificação de função" },
        { rubricaId: "plano", quantidade: null, valor: 189.9, inicio: "2026-11", fim: "2027-10", observacao: null },
        { rubricaId: "he", quantidade: 10.5, valor: null, inicio: "2026-12", fim: null, observacao: null },
      ],
    });
  });

  it("recusa rubrica do motor, inativa, sem valor, sem horas e meses fora de ordem", () => {
    const erro = (linhas: unknown[]) => {
      const r = ler(linhas);
      return r.ok ? "" : r.erro;
    };
    expect(erro([{ rubricaId: "sal", valor: "100", inicio: "2026-11" }])).toContain("calculada pelo motor");
    expect(erro([{ rubricaId: "velha", valor: "100", inicio: "2026-11" }])).toContain("escolha a rubrica");
    expect(erro([{ rubricaId: "grat", valor: "", inicio: "2026-11" }])).toContain("informe o valor");
    expect(erro([{ rubricaId: "he", quantidade: "0", inicio: "2026-11" }])).toContain("as horas");
    expect(erro([{ rubricaId: "grat", valor: "10", inicio: "" }])).toContain("mês em que começa");
    expect(erro([{ rubricaId: "grat", valor: "10", inicio: "2026-11", fim: "2026-10" }])).toContain("depois do inicial");
    expect(lerRubricasFixas("{", rubricas)).toEqual({ ok: false, erro: "Rubricas fixas em formato inválido." });
    expect(erro(Array.from({ length: MAXIMO_DE_RUBRICAS_FIXAS + 1 }, () => ({ rubricaId: "grat", valor: "1", inicio: "2026-11" })))).toContain("No máximo");
  });

  it("vale do mês inicial ao final, inclusive; sem fim vale para sempre", () => {
    expect(vigenteEm({ inicio: "2026-11", fim: null }, "2026-10")).toBe(false);
    expect(vigenteEm({ inicio: "2026-11", fim: null }, "2026-11")).toBe(true);
    expect(vigenteEm({ inicio: "2026-11", fim: null }, "2030-01")).toBe(true);
    expect(vigenteEm({ inicio: "2026-11", fim: "2027-01" }, "2027-01")).toBe(true);
    expect(vigenteEm({ inicio: "2026-11", fim: "2027-01" }, "2027-02")).toBe(false);
  });

  it("a regra de lançamento é a mesma do lançamento do mês", () => {
    expect(regraDeLancamento({ papel: "HE50", tipo: "PROVENTO", lancamento: "HORAS" })).toEqual({ lancavel: true, porQuantidade: true });
    expect(regraDeLancamento({ papel: "SALARIO", tipo: "PROVENTO", lancamento: "VALOR" })).toEqual({ lancavel: false, porQuantidade: false });
    expect(regraDeLancamento({ papel: null, tipo: "PROVENTO", lancamento: "VALOR" })).toEqual({ lancavel: true, porQuantidade: false });
    expect(regraDeLancamento({ papel: null, tipo: "INFORMATIVA", lancamento: "VALOR" }).lancavel).toBe(false);
  });

  it("o lançamento do mês da mesma rubrica substitui a fixa naquele mês (23/11/2026)", () => {
    const fixas = [
      { personId: "ana", rubricaId: "grat" },
      { personId: "ana", rubricaId: "plano" },
      { personId: "bia", rubricaId: "grat" },
    ];
    const { entram, substituidas } = separarFixasDoMes(fixas, [{ personId: "ana", rubricaId: "grat" }]);
    expect(entram).toEqual([fixas[1], fixas[2]]);
    expect(substituidas).toEqual([fixas[0]]);
  });

  it("a linha que veio da fixa diz isso na memória, também nas de horas", () => {
    const t = tabelasDaCompetencia("2026-11");
    if (!t.ok) throw new Error("tabelas");
    const porPapel = new Map(RUBRICAS_PADRAO.filter((r) => r.papel).map((r) => [r.papel as PapelDaRubrica, r]));
    const grat = RUBRICAS_PADRAO.find((r) => r.codigo === "010") as RubricaDoMotor;
    const eventos: EventoDoMotor[] = [
      { rubrica: grat, quantidade: null, valor: 350, origem: "FIXA" },
      { rubrica: porPapel.get("HE50")!, quantidade: 10, valor: null, origem: "FIXA" },
      { rubrica: porPapel.get("HE100")!, quantidade: 2, valor: null },
    ];
    const c = calcularMes({
      ano: 2026, mes: 11, admissao: null, desligamento: null,
      vinculo: { salarioBase: 3000, tipoSalario: "MENSAL", horasMensais: 220, dependentesIrrf: 0, filhosSalarioFamilia: 0, insalubridade: "NENHUM", periculosidade: false, valeTransporte: false, aprendiz: false },
      eventos, rubricas: porPapel, tabelas: t.tabelas, convencao: CONVENCAO_DA_CLT,
      empresa: { patronalNoDas: false, ratAliquota: 2, fap: 1, terceirosAliquota: 5.8 }, diasUteis: 20, diasDeDescanso: 10,
    });
    const memoria = (codigo: string) => c.itens.find((i) => i.codigo === codigo)!.memoria;
    expect(memoria("010")).toBe(`Valor informado · ${MARCA_DA_FIXA}`);
    expect(memoria("002")).toContain(`× 1,5 · ${MARCA_DA_FIXA}`);
    expect(memoria("003")).not.toContain(MARCA_DA_FIXA);
  });
});
