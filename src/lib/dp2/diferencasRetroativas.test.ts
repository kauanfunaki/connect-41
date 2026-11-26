import { describe, expect, it } from "vitest";
import { diferencaDoMes, lerPedidoDeDiferencas, mesesDoPeriodo, pagoNoSalario, salarioFamiliaRetroativo } from "./diferencasRetroativas";
import type { ItemDoHolerite } from "./mensal";

const item = (papel: string | null, codigo: string, tipo: "PROVENTO" | "DESCONTO", valor: number, incideInss = true): ItemDoHolerite =>
  ({ codigo, nome: codigo, tipo, papel, referencia: "", valor, memoria: "", incideInss, incideFgts: incideInss, incideIrrf: incideInss, mediaFerias: false, mediaDecimo: false, mediaRescisao: false }) as ItemDoHolerite;

const tabelaInss = {
  faixas: [
    { ate: 1518, aliquota: 7.5 },
    { ate: 2793.88, aliquota: 9 },
    { ate: 4190.83, aliquota: 12 },
    { ate: 8157.41, aliquota: 14 },
  ],
} as never;

const pedidoBase = { instrumento: "C", dataInstrumento: "2027-05-20", descricao: "Convenção 2027", de: "2027-03", ate: "2027-04", percentual: "5", piso: "", rubrica: "", filhos: "" };

describe("diferenças retroativas", () => {
  it("lê o pedido e exige o que o eSocial pede", () => {
    expect(lerPedidoDeDiferencas({ ...pedidoBase, tipo: "SALARIO" })).toMatchObject({ ok: true, pedido: { tipo: "SALARIO", percentual: 5, piso: null } });
    expect(lerPedidoDeDiferencas({ ...pedidoBase, tipo: "SALARIO", dataInstrumento: "" })).toMatchObject({ ok: false, erro: expect.stringMatching(/data de assinatura/) });
    expect(lerPedidoDeDiferencas({ ...pedidoBase, tipo: "SALARIO", instrumento: "J", dataInstrumento: "" })).toMatchObject({ ok: true });
    expect(lerPedidoDeDiferencas({ ...pedidoBase, tipo: "SALARIO", de: "2027-05" })).toMatchObject({ ok: false });
    expect(lerPedidoDeDiferencas({ ...pedidoBase, tipo: "RUBRICA" })).toMatchObject({ ok: false, erro: expect.stringMatching(/rubrica/) });
    expect(lerPedidoDeDiferencas({ ...pedidoBase, tipo: "SALARIO_FAMILIA", filhos: "2" })).toMatchObject({ ok: true, pedido: { tipo: "SALARIO_FAMILIA", filhos: 2 } });
    expect(mesesDoPeriodo("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("a diferença do salário reflete nas horas extras e desconta as faltas", () => {
    const itens = [item("SALARIO", "001", "PROVENTO", 3000), item("HE50", "002", "PROVENTO", 300), item("FALTA", "050", "DESCONTO", 100), item("INSALUBRIDADE", "006", "PROVENTO", 300), item("INSS", "053", "DESCONTO", 300, false)];
    expect(pagoNoSalario(itens)).toBe(3200);
    const d = diferencaDoMes({ perRef: "2027-03", itens, salario: 3000, tipoSalario: "MENSAL", horasMensais: 220 }, { tipo: "SALARIO", instrumento: "C", dataInstrumento: "2027-05-20", descricao: "x", de: "2027-03", ate: "2027-03", percentual: 5, piso: null }, tabelaInss);
    expect(d?.valor).toBe(160);
    // A base do mês era 3.500 (sem o INSS); com a diferença, 3.660: 12% sobre 160 = 19,20.
    expect(d?.inss).toBe(19.2);
    expect(d?.memoria).toContain("2027-03");
  });

  it("pelo piso: só quem ganhava abaixo dele tem diferença", () => {
    const itens = [item("SALARIO", "001", "PROVENTO", 1600)];
    const pedido = { tipo: "SALARIO" as const, instrumento: "C", dataInstrumento: "2027-05-20", descricao: "x", de: "2027-03", ate: "2027-03", percentual: 0, piso: 1800 };
    expect(diferencaDoMes({ perRef: "2027-03", itens, salario: 1600, tipoSalario: "MENSAL", horasMensais: 220 }, pedido, tabelaInss)?.valor).toBe(200);
    expect(diferencaDoMes({ perRef: "2027-03", itens: [item("SALARIO", "001", "PROVENTO", 2000)], salario: 2000, tipoSalario: "MENSAL", horasMensais: 220 }, pedido, tabelaInss)).toBeNull();
  });

  it("alteração de rubrica: o percentual sobre o que foi pago dela", () => {
    const itens = [item("SALARIO", "001", "PROVENTO", 3000), item(null, "010", "PROVENTO", 500)];
    const d = diferencaDoMes({ perRef: "2027-03", itens, salario: 3000, tipoSalario: "MENSAL", horasMensais: 220 }, { tipo: "RUBRICA", instrumento: "J", dataInstrumento: null, descricao: "x", de: "2027-03", ate: "2027-03", percentual: 10, rubrica: "010" }, tabelaInss);
    expect(d?.valor).toBe(50);
  });

  it("salário-família retroativo: até o limite, menos o já pago", () => {
    const tabela = { cota: 65, limite: 1900 };
    expect(salarioFamiliaRetroativo({ perRef: "2027-03", itens: [item("SALARIO", "001", "PROVENTO", 1800)] }, 2, tabela)?.valor).toBe(130);
    expect(salarioFamiliaRetroativo({ perRef: "2027-03", itens: [item("SALARIO", "001", "PROVENTO", 1800), item("SALARIO_FAMILIA", "008", "PROVENTO", 65, false)] }, 2, tabela)?.valor).toBe(65);
    expect(salarioFamiliaRetroativo({ perRef: "2027-03", itens: [item("SALARIO", "001", "PROVENTO", 2500)] }, 2, tabela)).toBeNull();
  });
});
