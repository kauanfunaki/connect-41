import { describe, expect, it } from "vitest";
import { aplicarAjustes, camposAjustaveis, lerAjuste, nomeDoCampo } from "./ajustesDoCalculo";
import { CONVENCAO_DA_CLT, calcularMes, type CalculoDaPessoa, type EventoDoMotor } from "./mensal";
import { RUBRICAS_PADRAO, type PapelDaRubrica, type RubricaDoMotor } from "./rubricas";
import { tabelasDaCompetencia } from "./tabelas";

function calculo(): CalculoDaPessoa {
  const t = tabelasDaCompetencia("2026-11");
  if (!t.ok) throw new Error("tabelas");
  const porPapel = new Map(RUBRICAS_PADRAO.filter((r) => r.papel).map((r) => [r.papel as PapelDaRubrica, r]));
  const grat = RUBRICAS_PADRAO.find((r) => r.codigo === "010") as RubricaDoMotor;
  const eventos: EventoDoMotor[] = [
    { rubrica: grat, quantidade: null, valor: 350 },
    { rubrica: grat, quantidade: null, valor: 150 },
  ];
  return calcularMes({
    ano: 2026, mes: 11, admissao: null, desligamento: null,
    vinculo: { salarioBase: 3000, tipoSalario: "MENSAL", horasMensais: 220, dependentesIrrf: 0, filhosSalarioFamilia: 0, insalubridade: "NENHUM", periculosidade: false, valeTransporte: false, aprendiz: false },
    eventos, rubricas: porPapel, tabelas: t.tabelas, convencao: CONVENCAO_DA_CLT,
    empresa: { patronalNoDas: false, ratAliquota: 2, fap: 1, terceirosAliquota: 5.8 }, diasUteis: 20, diasDeDescanso: 10,
  });
}

const soma = (c: CalculoDaPessoa, tipo: string) => Math.round(c.itens.filter((i) => i.tipo === tipo).reduce((s, i) => s + i.valor, 0) * 100) / 100;
const codigoDo = (c: CalculoDaPessoa, papel: string) => c.itens.find((i) => i.papel === papel)!.codigo;

describe("ajuste manual do cálculo (funcionalidade-768)", () => {
  it("lê o formulário: campo, valor e motivo obrigatórios", () => {
    expect(lerAjuste("ITEM:010", "1.234,50", "  Acordo com o cliente  ")).toEqual({ ok: true, ajuste: { campo: "ITEM:010", valor: 1234.5, motivo: "Acordo com o cliente" } });
    expect(lerAjuste("PROV_FERIAS", "0", "Zerada na migração")).toEqual({ ok: true, ajuste: { campo: "PROV_FERIAS", valor: 0, motivo: "Zerada na migração" } });
    expect(lerAjuste("", "10", "motivo ok")).toEqual({ ok: false, erro: "Escolha o valor a ajustar." });
    expect(lerAjuste("QUALQUER", "10", "motivo ok")).toEqual({ ok: false, erro: "Escolha o valor a ajustar." });
    expect(lerAjuste("FGTS", "abc", "motivo ok")).toEqual({ ok: false, erro: "Informe o novo valor (zero ou mais)." });
    expect(lerAjuste("FGTS", "-1", "motivo ok")).toEqual({ ok: false, erro: "Informe o novo valor (zero ou mais)." });
    expect(lerAjuste("FGTS", "10", "  ")).toEqual({ ok: false, erro: "Informe o motivo do ajuste." });
  });

  it("sem ajustes, o cálculo volta igual", () => {
    const c = calculo();
    expect(aplicarAjustes(c, [])).toEqual({ calculo: c, aplicados: [] });
  });

  it("lista as linhas (uma por código, somadas), o FGTS e as provisões", () => {
    const c = calculo();
    const opcoes = camposAjustaveis(c);
    expect(opcoes.filter((o) => o.campo === "ITEM:010")).toEqual([{ campo: "ITEM:010", nome: "010 · Gratificação", valor: 500 }]);
    expect(opcoes.find((o) => o.campo === "FGTS")!.valor).toBe(c.fgts);
    expect(opcoes.find((o) => o.campo === "PROV_DECIMO")!.valor).toBe(c.provisoes.decimo);
  });

  it("linha ajustada: o código vira uma linha só, com a nota, e os totais se refazem", () => {
    const c = calculo();
    const { calculo: a, aplicados } = aplicarAjustes(c, [{ campo: "ITEM:010", valor: 600, motivo: "Gratificação combinada" }]);
    const linhas = a.itens.filter((i) => i.codigo === "010");
    expect(linhas).toHaveLength(1);
    expect(linhas[0].valor).toBe(600);
    expect(linhas[0].memoria).toContain("Ajuste manual: 500,00 → 600,00 (Gratificação combinada)");
    expect(aplicados).toEqual([{ campo: "ITEM:010", nome: "010 · Gratificação", de: 500, para: 600, motivo: "Gratificação combinada" }]);
    expect(a.proventos).toBe(Math.round((c.proventos + 100) * 100) / 100);
    expect(a.proventos).toBe(soma(a, "PROVENTO"));
    expect(a.liquido).toBe(Math.round((a.proventos - a.descontos) * 100) / 100);
    // Bases ficam: o ajuste é do valor.
    expect(a.baseInss).toBe(c.baseInss);
  });

  it("ajustar a linha do INSS muda o INSS da pessoa e os descontos", () => {
    const c = calculo();
    const cod = codigoDo(c, "INSS");
    const { calculo: a } = aplicarAjustes(c, [{ campo: `ITEM:${cod}`, valor: 300, motivo: "Conferido com a Domínio" }]);
    expect(a.inss.valor).toBe(300);
    expect(a.inss.memoria.at(-1)).toContain("→ 300,00");
    expect(a.descontos).toBe(soma(a, "DESCONTO"));
    expect(a.irrf.valor).toBe(c.irrf.valor);
  });

  it("FGTS e provisões: refaz o total dos encargos e das provisões, com a nota na memória", () => {
    const c = calculo();
    const { calculo: a, aplicados } = aplicarAjustes(c, [
      { campo: "FGTS", valor: 280, motivo: "Base do mês anterior" },
      { campo: "PROV_FERIAS", valor: 400, motivo: "Saldo da Domínio" },
      { campo: "PROV_ENC_DECIMO", valor: 0, motivo: "Empresa do Simples" },
    ]);
    expect(a.fgts).toBe(280);
    expect(a.encargos.fgts).toBe(280);
    expect(a.encargos.total).toBe(Math.round((c.encargos.total - c.fgts + 280) * 100) / 100);
    expect(a.provisoes.ferias).toBe(400);
    expect(a.provisoes.encargosDecimo).toBe(0);
    expect(a.provisoes.total).toBe(Math.round((400 + c.provisoes.tercoFerias + c.provisoes.decimo + c.provisoes.encargosFerias) * 100) / 100);
    expect(a.provisoes.memoria.some((l) => l.startsWith("Provisão de férias — Ajuste manual"))).toBe(true);
    expect(aplicados.map((x) => x.campo)).toEqual(["FGTS", "PROV_FERIAS", "PROV_ENC_DECIMO"]);
    // Holerite não muda.
    expect(a.liquido).toBe(c.liquido);
  });

  it("linha que sumiu do cálculo: o ajuste não entra e vira alerta", () => {
    const c = calculo();
    const { calculo: a, aplicados } = aplicarAjustes(c, [{ campo: "ITEM:999", valor: 10, motivo: "Rubrica retirada" }]);
    expect(aplicados).toEqual([]);
    expect(a.alertas.at(-1)).toContain("O ajuste manual de Rubrica 999 não entrou");
    expect(a.liquido).toBe(c.liquido);
  });

  it("nome do campo para a tela", () => {
    const c = calculo();
    expect(nomeDoCampo("FGTS")).toBe("FGTS do mês");
    expect(nomeDoCampo("PROV_TERCO")).toBe("Provisão do 1/3 de férias");
    expect(nomeDoCampo("ITEM:010", c.itens)).toBe("010 · Gratificação");
  });
});
